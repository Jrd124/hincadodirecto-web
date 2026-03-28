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
