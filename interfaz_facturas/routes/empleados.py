"""Rutas de empleados: CRUD completo + endpoints RRHH (nóminas, resúmenes)."""
from __future__ import annotations

import logging
import os

from flask import Blueprint, jsonify, request

from core import empleados_db
from core.db import get_conn

logger = logging.getLogger("erp")

empleados_bp = Blueprint("empleados", __name__)


@empleados_bp.get("/api/empleados")
def api_listar_empleados():
  solo_activos = request.args.get("solo_activos", "1") == "1"
  return jsonify({"empleados": empleados_db.listar_empleados(solo_activos)})


@empleados_bp.get("/api/empleados/<int:eid>")
def api_obtener_empleado(eid):
  emp = empleados_db.obtener_empleado(eid)
  if not emp:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(emp)


@empleados_bp.post("/api/empleados")
def api_crear_empleado():
  data = request.get_json(silent=True) or {}
  if not data.get("nombre"):
    return jsonify({"error": "El nombre es obligatorio"}), 400
  try:
    return jsonify(empleados_db.crear_empleado(data)), 201
  except Exception as e:
    if "UNIQUE constraint" in str(e):
      return jsonify({"error": "Ya existe un empleado con ese DNI"}), 400
    raise


@empleados_bp.put("/api/empleados/<int:eid>")
def api_actualizar_empleado(eid):
  data = request.get_json(silent=True) or {}
  emp = empleados_db.actualizar_empleado(eid, data)
  if not emp:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(emp)


@empleados_bp.delete("/api/empleados/<int:eid>")
def api_eliminar_empleado(eid):
  ok = empleados_db.eliminar_empleado(eid)
  if not ok:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify({"ok": True})


# ═══ RRHH — Endpoints de nóminas y resúmenes ═════════════════════════════


@empleados_bp.get("/api/rrhh/empleados")
def api_rrhh_empleados():
  """Lista empleados con info de nóminas (último periodo, coste/día)."""
  empleados_db.init_empleados_db()
  estado = request.args.get("estado", "activo")
  conn = get_conn()
  try:
    if estado == "todos":
      emps = [dict(r) for r in conn.execute(
        "SELECT * FROM empleados ORDER BY apellidos, nombre"
      ).fetchall()]
    else:
      emps = [dict(r) for r in conn.execute(
        "SELECT * FROM empleados WHERE estado = ? ORDER BY apellidos, nombre", (estado,)
      ).fetchall()]

    # Enriquecer con datos de nóminas
    for emp in emps:
      row = conn.execute(
        "SELECT periodo, coste_dia, coste_empresa FROM nominas "
        "WHERE empleado_id = ? AND tipo = 'NOMINA' ORDER BY periodo DESC LIMIT 1",
        (emp["id"],)
      ).fetchone()
      if row:
        emp["ultimo_periodo"] = row["periodo"]
        emp["coste_dia_actual"] = row["coste_dia"]
        emp["ultimo_coste_empresa"] = row["coste_empresa"]
      else:
        emp["ultimo_periodo"] = None
        emp["coste_dia_actual"] = None
        emp["ultimo_coste_empresa"] = None

    return jsonify({"empleados": emps})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/empleados/<int:eid>")
def api_rrhh_empleado_detalle(eid):
  """Ficha completa con resumen de totales."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    emp = conn.execute("SELECT * FROM empleados WHERE id = ?", (eid,)).fetchone()
    if not emp:
      return jsonify({"error": "No encontrado"}), 404
    emp = dict(emp)

    # Resumen totales
    totales = conn.execute("""
      SELECT COUNT(*) as meses_activos,
             SUM(coste_empresa) as coste_total,
             AVG(coste_empresa) as coste_medio_mes,
             SUM(dietas) as total_dietas,
             SUM(liquido) as total_liquido
      FROM nominas WHERE empleado_id = ? AND tipo = 'NOMINA'
    """, (eid,)).fetchone()

    ultimo = conn.execute(
      "SELECT coste_dia FROM nominas WHERE empleado_id = ? AND tipo = 'NOMINA' "
      "ORDER BY periodo DESC LIMIT 1", (eid,)
    ).fetchone()

    emp["resumen"] = {
      "meses_activos": totales["meses_activos"] or 0,
      "coste_total": round(totales["coste_total"] or 0, 2),
      "coste_medio_mes": round(totales["coste_medio_mes"] or 0, 2),
      "total_dietas": round(totales["total_dietas"] or 0, 2),
      "total_liquido": round(totales["total_liquido"] or 0, 2),
      "ultimo_coste_dia": ultimo["coste_dia"] if ultimo else 0,
    }
    return jsonify(emp)
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/empleados/<int:eid>/nominas")
def api_rrhh_empleado_nominas(eid):
  """Historial de nóminas de un empleado."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    rows = conn.execute(
      "SELECT * FROM nominas WHERE empleado_id = ? ORDER BY periodo DESC, tipo",
      (eid,)
    ).fetchall()
    return jsonify({"nominas": [dict(r) for r in rows]})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/nominas/resumen-mensual")
def api_rrhh_resumen_mensual():
  """Resumen mes a mes de nóminas."""
  empleados_db.init_empleados_db()
  desde = request.args.get("desde", "2000-01")
  hasta = request.args.get("hasta", "2099-12")
  conn = get_conn()
  try:
    rows = conn.execute("""
      SELECT periodo,
             COUNT(DISTINCT empleado_id) as num_empleados,
             SUM(CASE WHEN tipo='NOMINA' THEN 1 ELSE 0 END) as num_nominas,
             SUM(CASE WHEN tipo='FINIQUITO' THEN 1 ELSE 0 END) as num_finiquitos,
             SUM(total_devengado) as total_devengado,
             SUM(total_deducir) as total_deducir,
             SUM(liquido) as total_liquido,
             SUM(dietas) as total_dietas,
             SUM(base_ss) as total_base_ss,
             SUM(coste_empresa) as total_coste_empresa
      FROM nominas
      WHERE periodo >= ? AND periodo <= ?
      GROUP BY periodo ORDER BY periodo
    """, (desde, hasta)).fetchall()
    return jsonify({"meses": [dict(r) for r in rows]})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/nominas/resumen-mensual/<periodo>")
def api_rrhh_detalle_mes(periodo):
  """Detalle de un mes: todas las nóminas del periodo."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    rows = conn.execute("""
      SELECT n.*, e.nombre, e.apellidos, e.dni, e.categoria
      FROM nominas n JOIN empleados e ON e.id = n.empleado_id
      WHERE n.periodo = ?
      ORDER BY e.apellidos, e.nombre
    """, (periodo,)).fetchall()
    return jsonify({"nominas": [dict(r) for r in rows]})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/empleados/<int:eid>/coste-dia")
def api_rrhh_coste_dia(eid):
  """Coste/día de un empleado para un periodo dado."""
  empleados_db.init_empleados_db()
  periodo = request.args.get("periodo")
  conn = get_conn()
  try:
    if periodo:
      row = conn.execute(
        "SELECT coste_dia, coste_empresa, dias, periodo FROM nominas "
        "WHERE empleado_id = ? AND periodo = ? AND tipo = 'NOMINA'", (eid, periodo)
      ).fetchone()
    else:
      row = conn.execute(
        "SELECT coste_dia, coste_empresa, dias, periodo FROM nominas "
        "WHERE empleado_id = ? AND tipo = 'NOMINA' ORDER BY periodo DESC LIMIT 1", (eid,)
      ).fetchone()
    if not row:
      return jsonify({"error": "Sin datos de nómina"}), 404
    return jsonify(dict(row))
  finally:
    conn.close()


@empleados_bp.post("/api/rrhh/importar-nominas")
def api_rrhh_importar():
  """Recibe Excel y ejecuta importación."""
  from core.rrhh_import import importar_nominas
  f = request.files.get("archivo")
  if not f:
    return jsonify({"error": "Se requiere archivo Excel"}), 400
  try:
    result = importar_nominas(excel_bytes=f.read())
    return jsonify(result)
  except Exception as e:
    logger.exception("Error importando nóminas")
    return jsonify({"error": str(e)}), 500


@empleados_bp.get("/api/rrhh/estadisticas")
def api_rrhh_estadisticas():
  """KPIs globales de RRHH."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    emp_activos = conn.execute(
      "SELECT COUNT(*) FROM empleados WHERE estado = 'activo'"
    ).fetchone()[0]

    # Último periodo disponible
    ultimo_periodo = conn.execute(
      "SELECT MAX(periodo) FROM nominas WHERE tipo = 'NOMINA'"
    ).fetchone()[0] or ""

    # Coste empresa del último mes
    coste_mes = conn.execute(
      "SELECT SUM(coste_empresa) FROM nominas WHERE periodo = ? AND tipo = 'NOMINA'",
      (ultimo_periodo,)
    ).fetchone()[0] or 0

    # Coste medio/día de toda la plantilla activa (último periodo)
    coste_medio_dia = conn.execute("""
      SELECT AVG(n.coste_dia) FROM nominas n
      JOIN empleados e ON e.id = n.empleado_id
      WHERE n.periodo = ? AND n.tipo = 'NOMINA' AND e.estado = 'activo'
    """, (ultimo_periodo,)).fetchone()[0] or 0

    # Total dietas del último mes
    dietas_mes = conn.execute(
      "SELECT SUM(dietas) FROM nominas WHERE periodo = ? AND tipo = 'NOMINA'",
      (ultimo_periodo,)
    ).fetchone()[0] or 0

    # Total nóminas cargadas
    total_nominas = conn.execute("SELECT COUNT(*) FROM nominas").fetchone()[0]

    # Rotación: finiquitos últimos 12 meses
    from datetime import date, timedelta
    hace_12m = (date.today().replace(day=1) - timedelta(days=365)).strftime("%Y-%m")
    finiquitos_12m = conn.execute(
      "SELECT COUNT(*) FROM nominas WHERE tipo = 'FINIQUITO' AND periodo >= ?",
      (hace_12m,)
    ).fetchone()[0]

    # Periodos disponibles
    periodos = [r[0] for r in conn.execute(
      "SELECT DISTINCT periodo FROM nominas ORDER BY periodo"
    ).fetchall()]

    return jsonify({
      "emp_activos": emp_activos,
      "coste_mes": round(coste_mes, 2),
      "coste_medio_dia": round(coste_medio_dia, 2),
      "dietas_mes": round(dietas_mes, 2),
      "total_nominas": total_nominas,
      "finiquitos_12m": finiquitos_12m,
      "ultimo_periodo": ultimo_periodo,
      "periodos": periodos,
    })
  finally:
    conn.close()
