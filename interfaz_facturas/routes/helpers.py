"""Helpers compartidos por todos los módulos de rutas."""
from __future__ import annotations

import logging
from functools import wraps

from flask import jsonify
from flask_login import current_user

logger = logging.getLogger("erp")


def _bad_request(mensaje: str):
  """Devuelve respuesta 400 con formato consistente: { \"error\": \"mensaje\" }."""
  return jsonify({"error": mensaje}), 400


def _validar_empresa_id_requerido(val) -> tuple:
  """
  Valida que empresa_id esté presente y no vacío tras strip().
  Devuelve (empresa_id_limpio, None) si es válido, o (None, (response, 400)) si no.
  """
  if val is None:
    return None, _bad_request("Falta empresa_id")
  empresa_id = (val if isinstance(val, str) else str(val or "")).strip()
  if not empresa_id:
    return None, _bad_request("Falta empresa_id")
  return empresa_id, None


def requiere_rol(*roles_permitidos):
  """Decorador para proteger endpoints por rol."""
  def decorator(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
      rol = getattr(current_user, "rol", "admin") if current_user.is_authenticated else ""
      if rol not in roles_permitidos:
        return jsonify({"error": "Sin permisos"}), 403
      return f(*args, **kwargs)
    return wrapper
  return decorator


def _parse_importe_es(val):
  """Parsea importe en formato español/inglés mixto a float."""
  if not val:
    return 0.0
  s = str(val).strip().replace('\u20ac', '').replace(' ', '')
  if ',' in s and '.' in s:
    s = s.replace('.', '').replace(',', '.')
  elif ',' in s:
    s = s.replace(',', '.')
  elif '.' in s:
    parts = s.split('.')
    if len(parts) == 2 and len(parts[1]) <= 2:
      pass
    else:
      s = s.replace('.', '')
  try:
    return float(s)
  except (ValueError, TypeError):
    return 0.0


def _sum_importes(rows, *cols):
  """Suma importes de las filas usando parseo robusto. Prueba cols en orden."""
  total = 0.0
  for r in rows:
    for c in cols:
      v = r[c] if c in r.keys() else None
      if v:
        total += _parse_importe_es(v)
        break
  return round(total, 2)


def calcular_pendiente_cobro_neto(conn_gestion) -> dict:
  """Calcula el pendiente de cobro NETO descontando cobros parciales.

  Busca en movimientos.db (por factura_cliente_id Y factura_cliente_key legacy)
  y en conciliacion_multiple. Devuelve:
    {"total": float, "num": int, "n_pendientes": int, "n_parciales": int, "texto": str}
  """
  import sqlite3 as _sq
  from config import MOVIMIENTOS_DB

  facturas_pte = conn_gestion.execute(
    "SELECT id, numero_factura, fecha_factura, cliente, total_a_pagar, estado_cobro"
    " FROM facturas_cliente"
    " WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) IN ('pendiente','','parcial')"
  ).fetchall()

  # Build map: factura_id → total cobrado
  cobrado_por_id = {}
  cobrado_por_key = {}
  try:
    conn_b = _sq.connect(str(MOVIMIENTOS_DB))
    conn_b.row_factory = _sq.Row
    # By factura_cliente_id (modern)
    for row in conn_b.execute(
      "SELECT factura_cliente_id, SUM(ABS(CAST(importe AS REAL))) as total"
      " FROM movimientos WHERE factura_cliente_id IS NOT NULL AND factura_cliente_id > 0"
      " AND conciliado_at IS NOT NULL GROUP BY factura_cliente_id"
    ).fetchall():
      cobrado_por_id[row["factura_cliente_id"]] = float(row["total"] or 0)
    # By factura_cliente_key (legacy — factura_cliente_id NULL)
    for row in conn_b.execute(
      "SELECT factura_cliente_key, SUM(ABS(CAST(importe AS REAL))) as total"
      " FROM movimientos WHERE factura_cliente_key IS NOT NULL AND factura_cliente_key != 'MULTI'"
      " AND conciliado_at IS NOT NULL AND (factura_cliente_id IS NULL OR factura_cliente_id <= 0)"
      " GROUP BY factura_cliente_key"
    ).fetchall():
      cobrado_por_key[row["factura_cliente_key"]] = float(row["total"] or 0)
    conn_b.close()
  except Exception:
    pass

  # Also from conciliacion_multiple
  try:
    for row in conn_gestion.execute(
      "SELECT factura_cliente_id, SUM(importe_aplicado) as total"
      " FROM conciliacion_multiple GROUP BY factura_cliente_id"
    ).fetchall():
      fid = row["factura_cliente_id"]
      cobrado_por_id[fid] = cobrado_por_id.get(fid, 0) + float(row["total"] or 0)
  except Exception:
    pass

  total_pte = 0.0
  n_pendientes = 0
  n_parciales = 0
  for f in facturas_pte:
    total_fac = _parse_importe_es(f["total_a_pagar"])
    cobrado = cobrado_por_id.get(f["id"], 0)
    # Legacy key lookup
    num = (f["numero_factura"] or "").strip()
    fecha = (f["fecha_factura"] or "").strip()[:10]
    cli = (f["cliente"] or "").strip()
    key = f"{num}|{fecha}|{cli}"
    cobrado += cobrado_por_key.get(key, 0)

    neto = max(0, total_fac - cobrado)
    if neto > 0.01:
      total_pte += neto
      estado = (f["estado_cobro"] or "").strip().lower()
      if estado == "parcial":
        n_parciales += 1
      else:
        n_pendientes += 1

  parts = []
  if n_pendientes:
    parts.append(f"{n_pendientes} factura{'s' if n_pendientes != 1 else ''}")
  if n_parciales:
    parts.append(f"{n_parciales} parcial{'es' if n_parciales != 1 else ''}")

  return {
    "total": round(total_pte, 2),
    "num": n_pendientes + n_parciales,
    "n_pendientes": n_pendientes,
    "n_parciales": n_parciales,
    "texto": " + ".join(parts) if parts else "0 facturas",
  }
