"""Rutas generales: dashboard inicio, health, listado empresas, finanzas resumen/dashboard."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, send_from_directory
from flask_login import current_user

from config import EMPRESAS_CLIENTE
from routes.helpers import _parse_importe_es, _sum_importes

logger = logging.getLogger("erp")

api_general_bp = Blueprint("api_general", __name__)


@api_general_bp.get("/")
def index():
  """Sirve la página principal de la interfaz de facturas."""
  from flask import current_app
  return send_from_directory(current_app.static_folder, "index.html")


@api_general_bp.get("/api/health")
def api_health():
  """Health check para Docker y monitorizacion."""
  from core.db import conectar as _conectar_db
  from datetime import datetime as _dt
  try:
    with _conectar_db() as conn:
      conn.execute("SELECT 1")
    return jsonify({"status": "ok", "timestamp": _dt.now().isoformat()})
  except Exception as e:
    return jsonify({"status": "error", "detail": str(e)}), 503


@api_general_bp.get("/api/dashboard")
def api_dashboard():
  """Devuelve datos agregados para el dashboard de inicio."""
  from datetime import datetime as _dt, timedelta as _td
  from core.db import conectar as _conectar_db
  mes_actual = _dt.now().strftime("%Y-%m")
  empresas = [{"id": id_, "nombre": nombre} for id_, nombre in EMPRESAS_CLIENTE.items()]
  result = {
    "usuario": current_user.nombre if current_user.is_authenticated else "",
    "facturas_pendientes_count": 0,
    "importe_pendiente_total": 0.0,
    "facturas_mes_count": 0,
    "empresas_activas": len(empresas),
    "ultimas_facturas": [],
    "pendientes_por_empresa": [],
  }
  try:
    with _conectar_db() as conn:
      row = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total "
        "FROM facturas_proveedor WHERE LOWER(TRIM(estado_pago)) = 'pendiente'"
      ).fetchone()
      if row:
        result["facturas_pendientes_count"] = row["cnt"]
        result["importe_pendiente_total"] = round(row["total"], 2)
      row2 = conn.execute(
        "SELECT COUNT(*) as cnt FROM facturas_proveedor WHERE fecha_factura LIKE ?",
        (mes_actual + "%",),
      ).fetchone()
      if row2:
        result["facturas_mes_count"] = row2["cnt"]
      rows = conn.execute(
        "SELECT fecha_factura, proveedor, total_a_pagar, estado_pago, empresa_id "
        "FROM facturas_proveedor ORDER BY fecha_factura DESC LIMIT 5"
      ).fetchall()
      emp_map = {e["id"]: e["nombre"] for e in empresas}
      result["ultimas_facturas"] = [
        {"fecha": r["fecha_factura"], "proveedor": r["proveedor"], "total": r["total_a_pagar"], "empresa": emp_map.get(r["empresa_id"], r["empresa_id"] or "—")}
        for r in rows
      ]
      rows2 = conn.execute(
        "SELECT empresa_id, COUNT(*) as cnt, COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total "
        "FROM facturas_proveedor WHERE LOWER(TRIM(estado_pago)) = 'pendiente' GROUP BY empresa_id"
      ).fetchall()
      result["pendientes_por_empresa"] = [
        {"empresa": emp_map.get(r["empresa_id"], r["empresa_id"]), "count": r["cnt"], "importe": round(r["total"], 2)}
        for r in rows2
      ]
      _meses_es = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
      hoy = _dt.now()
      meses_rango = []
      for i in range(5, -1, -1):
        d = hoy.replace(day=1) - _td(days=i * 28)
        d = d.replace(day=1)
        meses_rango.append((d.year, d.month))
      seen = set()
      meses_uniq = []
      for ym in meses_rango:
        if ym not in seen:
          seen.add(ym)
          meses_uniq.append(ym)
      if len(meses_uniq) < 6:
        d = _dt(meses_uniq[0][0], meses_uniq[0][1], 1) - _td(days=1)
        meses_uniq.insert(0, (d.year, d.month))
      meses_uniq = meses_uniq[-6:]
      facturas_por_mes = []
      for y, m in meses_uniq:
        prefix = f"{y}-{m:02d}"
        r = conn.execute(
          "SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total "
          "FROM facturas_proveedor WHERE fecha_factura LIKE ?", (prefix + "%",)
        ).fetchone()
        facturas_por_mes.append({"mes": _meses_es[m - 1], "count": r["cnt"], "importe": round(r["total"], 2)})
      result["facturas_por_mes"] = facturas_por_mes
      estados = conn.execute(
        "SELECT LOWER(TRIM(estado_pago)) as st, COUNT(*) as cnt FROM facturas_proveedor GROUP BY st"
      ).fetchall()
      estado_map = {"pendiente": 0, "pagada": 0, "parcial": 0}
      for e in estados:
        st = e["st"]
        if st in estado_map:
          estado_map[st] = e["cnt"]
      result["facturas_por_estado"] = estado_map
      top = conn.execute(
        "SELECT proveedor, COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total "
        "FROM facturas_proveedor GROUP BY proveedor ORDER BY total DESC LIMIT 5"
      ).fetchall()
      result["top_proveedores"] = [{"nombre": t["proveedor"], "importe": round(t["total"], 2)} for t in top]
  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/dashboard: %s", e)
  return jsonify(result)


@api_general_bp.get("/api/finanzas/resumen")
def api_finanzas_resumen():
  """Resumen rápido para el dashboard del módulo Finanzas."""
  from datetime import datetime as _dt
  from core.db import conectar as _conectar_db
  anio = _dt.now().strftime("%Y")
  result = {"total_prov": 0.0, "total_cli": 0.0, "sin_conciliar": 0}
  try:
    with _conectar_db() as conn:
      r = conn.execute(
        "SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL)),0) as t "
        "FROM facturas_proveedor WHERE fecha_factura LIKE ?", (anio + "%",)
      ).fetchone()
      if r:
        result["total_prov"] = round(r["t"], 2)
      r2 = conn.execute(
        "SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL)),0) as t "
        "FROM facturas_cliente WHERE fecha_factura LIKE ?", (anio + "%",)
      ).fetchone()
      if r2:
        result["total_cli"] = round(r2["t"], 2)
      r3 = conn.execute(
        "SELECT COUNT(*) as cnt FROM movimientos_banco WHERE conciliado_at IS NULL OR TRIM(conciliado_at) = ''"
      ).fetchone()
      if r3:
        result["sin_conciliar"] = r3["cnt"]
  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/finanzas/resumen: %s", e)
  return jsonify(result)


@api_general_bp.get("/api/finanzas/dashboard")
def api_finanzas_dashboard():
  """Dashboard financiero completo."""
  from datetime import date as _date
  from core.db import conectar as _conectar_db

  year = _date.today().year
  result = {
    "year": year,
    "facturacion_clientes": {"total": 0, "num": 0},
    "cobros_pendientes": {"total": 0, "num": 0},
    "facturacion_proveedores": {"total": 0, "num": 0},
    "pagos_pendientes": {"total": 0, "num": 0},
    "margen_bruto": 0,
    "proyectos": [],
    "pipeline": [],
    "pipeline_total": 0,
    "movimientos_sin_conciliar": 0,
  }

  try:
    with _conectar_db() as conn:
      rows = conn.execute(
        "SELECT total_a_pagar FROM facturas_cliente WHERE fecha_factura LIKE ?",
        (f"{year}%",),
      ).fetchall()
      result["facturacion_clientes"] = {
        "total": _sum_importes(rows, "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total_a_pagar FROM facturas_cliente "
        "WHERE estado_cobro IS NULL OR estado_cobro IN ('pendiente','parcial','')"
      ).fetchall()
      result["cobros_pendientes"] = {
        "total": _sum_importes(rows, "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total, total_a_pagar FROM facturas_proveedor WHERE fecha_factura LIKE ?",
        (f"{year}%",),
      ).fetchall()
      result["facturacion_proveedores"] = {
        "total": _sum_importes(rows, "total", "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total, total_a_pagar FROM facturas_proveedor "
        "WHERE estado_pago IS NULL OR estado_pago IN ('pendiente','Pendiente','')"
      ).fetchall()
      result["pagos_pendientes"] = {
        "total": _sum_importes(rows, "total", "total_a_pagar"), "num": len(rows),
      }

      result["margen_bruto"] = round(
        result["facturacion_clientes"]["total"] - result["facturacion_proveedores"]["total"], 2
      )

      proyectos = [dict(r) for r in conn.execute("""
        SELECT p.id, p.nombre, p.codigo, p.estado, p.importe_presupuestado,
               t.nombre_canonico AS cliente
        FROM proyectos p
        LEFT JOIN terceros t ON t.id = p.cliente_tercero_id
        WHERE p.estado IN ('vivo','terminado','pausado')
        ORDER BY p.estado, p.nombre
      """).fetchall()]

      for proy in proyectos:
        rows = conn.execute(
          "SELECT total_a_pagar FROM facturas_cliente WHERE proyecto_id = ?",
          [proy["id"]],
        ).fetchall()
        proy["facturado"] = _sum_importes(rows, "total_a_pagar")

        rows = conn.execute(
          "SELECT total, total_a_pagar FROM facturas_proveedor WHERE proyecto_id = ?",
          [proy["id"]],
        ).fetchall()
        proy["costes"] = _sum_importes(rows, "total", "total_a_pagar")

        proy["margen"] = round(proy["facturado"] - proy["costes"], 2)
        proy["margen_pct"] = round(proy["margen"] / proy["facturado"] * 100, 1) if proy["facturado"] > 0 else 0

      result["proyectos"] = proyectos

      try:
        pipeline = [dict(r) for r in conn.execute("""
          SELECT p.id, p.referencia, p.nombre_proyecto, p.estado,
                 v.total AS importe,
                 t.nombre_canonico AS cliente
          FROM presupuestos p
          LEFT JOIN presupuesto_versiones v ON v.presupuesto_id = p.id AND v.es_activa = 1
          LEFT JOIN terceros t ON t.id = p.tercero_id
          WHERE p.estado IN ('enviada','negociacion')
          ORDER BY v.total DESC
        """).fetchall()]
        result["pipeline"] = pipeline
        result["pipeline_total"] = round(sum(p.get("importe") or 0 for p in pipeline), 2)
      except Exception:
        pass

      try:
        r = conn.execute(
          "SELECT COUNT(*) FROM movimientos_banco WHERE conciliado_at IS NULL OR TRIM(conciliado_at) = ''"
        ).fetchone()
        result["movimientos_sin_conciliar"] = r[0] if r else 0
      except Exception:
        pass

  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/finanzas/dashboard: %s", e)

  return jsonify(result)


@api_general_bp.get("/api/empresas")
def listar_empresas():
  """
  Devuelve el listado de empresas cargado desde config/empresas.toml.
  """
  empresas = [{"id": id_, "nombre": nombre} for id_, nombre in EMPRESAS_CLIENTE.items()]
  resp = jsonify(empresas)
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  resp.headers["Pragma"] = "no-cache"
  return resp
