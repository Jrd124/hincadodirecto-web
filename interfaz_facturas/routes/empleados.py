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


@empleados_bp.post("/api/rrhh/dedup-empleados")
def api_rrhh_dedup():
  """Ejecuta deduplicación de empleados por DNI normalizado."""
  from core.dedup_empleados import dedup_empleados
  dry_run = request.args.get("dry_run", "0") == "1"
  try:
    result = dedup_empleados(dry_run=dry_run)
    return jsonify(result)
  except Exception as e:
    logger.exception("Error en deduplicación")
    return jsonify({"error": str(e)}), 500


@empleados_bp.post("/api/rrhh/procesar-nominas-pdf")
def api_rrhh_procesar_pdfs():
  """Procesa PDFs de nómina con OCR (GPT-4 Vision). Devuelve preview."""
  import tempfile, zipfile
  from pathlib import Path
  from core.rrhh_ocr import procesar_lote_nominas

  files = request.files.getlist("archivos")
  if not files:
    return jsonify({"error": "Se requieren archivos PDF"}), 400

  pdf_paths = []
  tmpdir = tempfile.mkdtemp()

  for f in files:
    fname = f.filename or "unknown"
    fpath = Path(tmpdir) / fname
    f.save(str(fpath))

    if fname.lower().endswith(".zip"):
      with zipfile.ZipFile(str(fpath)) as zf:
        for name in zf.namelist():
          if name.lower().endswith(".pdf"):
            extracted = Path(tmpdir) / Path(name).name
            with open(str(extracted), "wb") as out:
              out.write(zf.read(name))
            pdf_paths.append(str(extracted))
    elif fname.lower().endswith(".pdf"):
      pdf_paths.append(str(fpath))

  if not pdf_paths:
    return jsonify({"error": "No se encontraron archivos PDF"}), 400

  try:
    result = procesar_lote_nominas(pdf_paths)
    # Enrich with employee match status
    conn = get_conn()
    try:
      for nom in result["nominas"]:
        dni = (nom.get("dni") or "").replace("-", "").replace(" ", "").upper()
        if dni:
          emp = conn.execute("SELECT id, nombre, apellidos FROM empleados WHERE dni = ?", (dni,)).fetchone()
          if emp:
            nom["_emp_id"] = emp["id"]
            nom["_emp_nombre"] = f"{emp['nombre']} {emp['apellidos'] or ''}".strip()
            nom["_estado"] = "match"
          else:
            nom["_emp_id"] = None
            nom["_emp_nombre"] = None
            nom["_estado"] = "nuevo"
        else:
          nom["_estado"] = "error"
    finally:
      conn.close()
    return jsonify(result)
  except Exception as e:
    logger.exception("Error procesando PDFs de nómina")
    return jsonify({"error": str(e)}), 500


@empleados_bp.post("/api/rrhh/confirmar-nominas")
def api_rrhh_confirmar_nominas():
  """Confirma e inserta nóminas procesadas por OCR."""
  from core.rrhh_ocr import confirmar_nominas
  data = request.get_json(silent=True) or {}
  nominas = data.get("nominas", [])
  if not nominas:
    return jsonify({"error": "No hay nóminas para confirmar"}), 400
  try:
    result = confirmar_nominas(nominas)
    return jsonify(result)
  except Exception as e:
    logger.exception("Error confirmando nóminas")
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


# ═══ RRHH Analytics endpoints ═════════════════════════════════════════════


@empleados_bp.get("/api/rrhh/dashboard")
def api_rrhh_dashboard():
  from core.rrhh_analytics import dashboard
  return jsonify(dashboard())


@empleados_bp.get("/api/rrhh/verificador/<periodo>")
def api_rrhh_verificador(periodo):
  from core.rrhh_analytics import verificador
  return jsonify(verificador(periodo))


@empleados_bp.get("/api/rrhh/seguridad-social")
def api_rrhh_ss():
  from core.rrhh_analytics import seguridad_social
  return jsonify(seguridad_social())


@empleados_bp.get("/api/rrhh/irpf")
def api_rrhh_irpf():
  from core.rrhh_analytics import irpf
  return jsonify(irpf())


@empleados_bp.get("/api/rrhh/coste-proyecto")
def api_rrhh_coste_proyecto():
  from core.rrhh_analytics import coste_proyecto
  return jsonify(coste_proyecto())


@empleados_bp.get("/api/rrhh/dietas/dashboard")
def api_rrhh_dietas_dashboard():
  from core.rrhh_analytics import dietas_dashboard
  return jsonify(dietas_dashboard())


@empleados_bp.get("/api/rrhh/dietas/config")
def api_rrhh_dietas_config_list():
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    return jsonify({"config": [dict(r) for r in conn.execute("SELECT * FROM dietas_config ORDER BY tipo, subtipo").fetchall()]})
  finally:
    conn.close()


@empleados_bp.post("/api/rrhh/dietas/config")
def api_rrhh_dietas_config_create():
  empleados_db.init_empleados_db()
  data = request.get_json(silent=True) or {}
  conn = get_conn()
  try:
    conn.execute(
      "INSERT INTO dietas_config (tipo, subtipo, categoria, importe, fecha_vigencia_desde, fecha_vigencia_hasta, notas) VALUES (?,?,?,?,?,?,?)",
      (data.get("tipo"), data.get("subtipo"), data.get("categoria"), data.get("importe"), data.get("fecha_vigencia_desde"), data.get("fecha_vigencia_hasta"), data.get("notas")),
    )
    conn.commit()
    return jsonify({"ok": True}), 201
  finally:
    conn.close()


@empleados_bp.delete("/api/rrhh/dietas/config/<int:did>")
def api_rrhh_dietas_config_delete(did):
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    conn.execute("DELETE FROM dietas_config WHERE id=?", (did,))
    conn.commit()
    return jsonify({"ok": True})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/adelantos")
def api_rrhh_adelantos_list():
  from core.rrhh_analytics import adelantos_list
  return jsonify(adelantos_list(
    empleado_id=request.args.get("empleado_id"),
    estado=request.args.get("estado"),
  ))


@empleados_bp.post("/api/rrhh/adelantos")
def api_rrhh_adelantos_create():
  empleados_db.init_empleados_db()
  data = request.get_json(silent=True) or {}
  conn = get_conn()
  try:
    conn.execute(
      "INSERT INTO adelantos (empleado_id, fecha, importe, concepto, estado) VALUES (?,?,?,?,?)",
      (data.get("empleado_id"), data.get("fecha"), data.get("importe"), data.get("concepto"), "pendiente"),
    )
    conn.commit()
    return jsonify({"ok": True}), 201
  finally:
    conn.close()


@empleados_bp.delete("/api/rrhh/adelantos/<int:aid>")
def api_rrhh_adelantos_delete(aid):
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    conn.execute("DELETE FROM adelantos WHERE id=?", (aid,))
    conn.commit()
    return jsonify({"ok": True})
  finally:
    conn.close()


@empleados_bp.post("/api/rrhh/verificador/<periodo>/generar-remesa")
def api_rrhh_generar_remesa(periodo):
  """Genera CSV de remesa bancaria para transferir nóminas."""
  from core.rrhh_analytics import verificador
  import io, csv
  data = verificador(periodo)
  output = io.StringIO()
  writer = csv.writer(output, delimiter=";")
  writer.writerow(["Nombre", "Importe", "Concepto"])
  for l in data["lineas"]:
    if l["a_transferir"] > 0 and l["tipo"] == "NOMINA":
      writer.writerow([l["nombre"], f"{l['a_transferir']:.2f}", f"Nomina {periodo}"])
  from flask import Response
  return Response(
    output.getvalue(),
    mimetype="text/csv",
    headers={"Content-Disposition": f"attachment; filename=remesa_{periodo}.csv"},
  )


@empleados_bp.get("/api/rrhh/dietas/calendario/<periodo>")
def api_rrhh_dietas_calendario(periodo):
  """Matriz empleados × días con tipo dieta para el calendario."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    from datetime import date, timedelta
    y, m = int(periodo[:4]), int(periodo[5:7])
    d = date(y, m, 1)
    dias = []
    while d.month == m:
      dias.append(d.isoformat())
      d += timedelta(days=1)

    emps = [dict(r) for r in conn.execute(
      "SELECT id, nombre, apellidos FROM empleados WHERE estado='activo' ORDER BY apellidos, nombre"
    ).fetchall()]

    # Get dietas_diarias for this month
    dietas = {}
    for r in conn.execute(
      "SELECT empleado_id, fecha, tipo, importe, notas FROM dietas_diarias "
      "WHERE fecha >= ? AND fecha <= ?", (dias[0], dias[-1])
    ).fetchall():
      dietas[(r["empleado_id"], r["fecha"])] = dict(r)

    # Get project assignments for context
    asignaciones = {}
    for r in conn.execute(
      "SELECT recurso_id, fecha, p.codigo FROM proyecto_asignaciones pa "
      "JOIN proyectos p ON p.id = pa.proyecto_id "
      "WHERE pa.recurso_tipo='empleado' AND pa.fecha >= ? AND pa.fecha <= ?",
      (dias[0], dias[-1])
    ).fetchall():
      asignaciones[(r["recurso_id"], r["fecha"])] = r["codigo"]

    return jsonify({"dias": dias, "empleados": emps, "dietas": {f"{k[0]}_{k[1]}": v for k, v in dietas.items()}, "proyectos": {f"{k[0]}_{k[1]}": v for k, v in asignaciones.items()}})
  finally:
    conn.close()


@empleados_bp.post("/api/rrhh/dietas/diaria")
def api_rrhh_dietas_diaria():
  """Guardar/actualizar dieta de un día."""
  empleados_db.init_empleados_db()
  data = request.get_json(silent=True) or {}
  conn = get_conn()
  try:
    conn.execute(
      "INSERT OR REPLACE INTO dietas_diarias (empleado_id, fecha, tipo, importe, notas) VALUES (?,?,?,?,?)",
      (data.get("empleado_id"), data.get("fecha"), data.get("tipo", ""), data.get("importe", 0), data.get("notas", "")),
    )
    conn.commit()
    return jsonify({"ok": True})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/dietas/resumen-pivot")
def api_rrhh_dietas_pivot():
  """Tabla pivot empleados × meses con totales de dietas."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    periodos = [r[0] for r in conn.execute(
      "SELECT DISTINCT periodo FROM nominas WHERE tipo='NOMINA' ORDER BY periodo"
    ).fetchall()]

    rows = [dict(r) for r in conn.execute("""
      SELECT e.id, e.nombre, e.apellidos, n.periodo, ROUND(n.dietas,2) as dietas
      FROM nominas n JOIN empleados e ON e.id=n.empleado_id
      WHERE n.tipo='NOMINA' AND n.dietas > 0
      ORDER BY e.apellidos, e.nombre, n.periodo
    """).fetchall()]

    return jsonify({"periodos": periodos, "datos": rows})
  finally:
    conn.close()


@empleados_bp.get("/api/rrhh/dietas/empleado/<int:eid>/<periodo>")
def api_rrhh_dietas_empleado(eid, periodo):
  """Detalle diario de dietas de un empleado con proyecto de operaciones."""
  empleados_db.init_empleados_db()
  conn = get_conn()
  try:
    from datetime import date, timedelta
    y, m = int(periodo[:4]), int(periodo[5:7])
    d = date(y, m, 1)
    dias = []
    while d.month == m:
      dias.append({"fecha": d.isoformat(), "dia_semana": ["L","M","X","J","V","S","D"][d.weekday()], "num": d.day, "laborable": d.weekday() < 5})
      d += timedelta(days=1)

    dietas = {}
    for r in conn.execute(
      "SELECT fecha, tipo, importe, notas FROM dietas_diarias WHERE empleado_id=? AND fecha >= ? AND fecha <= ?",
      (eid, dias[0]["fecha"], dias[-1]["fecha"])
    ).fetchall():
      dietas[r["fecha"]] = dict(r)

    proyectos = {}
    for r in conn.execute(
      "SELECT pa.fecha, p.codigo, p.nombre FROM proyecto_asignaciones pa "
      "JOIN proyectos p ON p.id=pa.proyecto_id "
      "WHERE pa.recurso_tipo='empleado' AND pa.recurso_id=? AND pa.fecha >= ? AND pa.fecha <= ?",
      (eid, dias[0]["fecha"], dias[-1]["fecha"])
    ).fetchall():
      proyectos[r["fecha"]] = {"codigo": r["codigo"], "nombre": r["nombre"]}

    return jsonify({"dias": dias, "dietas": dietas, "proyectos": proyectos})
  finally:
    conn.close()
