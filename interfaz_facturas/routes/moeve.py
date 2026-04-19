"""
Moeve/Gasoil — API para gestión de combustible y transacciones.
Blueprint: /api/moeve/*
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core.db import get_conn

logger = logging.getLogger("erp")

moeve_bp = Blueprint("moeve", __name__)


def _ensure():
    from core.moeve_import import _ensure_tables
    _ensure_tables()


# ── Import ───────────────────────────────────────────────────────────────

@moeve_bp.post("/api/moeve/importar")
def api_importar():
    """Recibe Excel Moeve y ejecuta importación."""
    _ensure()
    from core.moeve_import import importar_moeve
    f = request.files.get("archivo")
    if not f:
        return jsonify({"error": "Se requiere archivo Excel"}), 400
    try:
        result = importar_moeve(excel_bytes=f.read())
        return jsonify(result)
    except Exception as e:
        logger.exception("Error importando Moeve")
        return jsonify({"error": str(e)}), 500


# ── Geocodificación ─────────────────────────────────────────────────────

@moeve_bp.post("/api/moeve/geocodificar")
def api_geocodificar():
    """Ejecuta geocodificación de estaciones pendientes."""
    _ensure()
    from core.moeve_geo import geocodificar_estaciones_pendientes
    try:
        result = geocodificar_estaciones_pendientes()
        return jsonify(result)
    except Exception as e:
        logger.exception("Error geocodificando")
        return jsonify({"error": str(e)}), 500


# ── Imputación ──────────────────────────────────────────────────────────

@moeve_bp.post("/api/moeve/imputar")
def api_imputar():
    """Ejecuta imputación automática a proyectos."""
    _ensure()
    from core.moeve_imputacion import imputar_transacciones
    try:
        result = imputar_transacciones()
        return jsonify(result)
    except Exception as e:
        logger.exception("Error imputando")
        return jsonify({"error": str(e)}), 500


# ── Transacciones ────────────────────────────────────────────────────────

@moeve_bp.get("/api/moeve/transacciones")
def api_transacciones():
    """Lista transacciones con filtros."""
    _ensure()
    desde = request.args.get("desde", "2000-01-01")
    hasta = request.args.get("hasta", "2099-12-31")
    matricula = request.args.get("matricula", "")
    proyecto_id = request.args.get("proyecto_id", "")
    concepto = request.args.get("concepto", "")
    sin_asignar = request.args.get("sin_asignar", "0")
    limit = min(int(request.args.get("limit", 500)), 2000)
    offset = int(request.args.get("offset", 0))

    conn = get_conn()
    try:
        where = ["fecha >= ? AND fecha <= ?"]
        params = [desde, hasta]

        if matricula:
            where.append("matricula = ?")
            params.append(matricula)
        if proyecto_id:
            where.append("proyecto_id = ?")
            params.append(int(proyecto_id))
        if concepto:
            where.append("concepto = ?")
            params.append(concepto)
        if sin_asignar == "1":
            where.append("proyecto_id IS NULL")

        where_sql = " AND ".join(where)

        total = conn.execute(
            f"SELECT COUNT(*) FROM combustible_transacciones WHERE {where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"SELECT ct.*, p.nombre as proyecto_nombre, p.codigo as proyecto_codigo "
            f"FROM combustible_transacciones ct "
            f"LEFT JOIN proyectos p ON p.id = ct.proyecto_id "
            f"WHERE {where_sql} ORDER BY ct.fecha DESC, ct.hora DESC "
            f"LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

        return jsonify({"transacciones": [dict(r) for r in rows], "total": total})
    finally:
        conn.close()


@moeve_bp.get("/api/moeve/transacciones/<int:tid>")
def api_transaccion_detalle(tid):
    _ensure()
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT ct.*, p.nombre as proyecto_nombre FROM combustible_transacciones ct "
            "LEFT JOIN proyectos p ON p.id = ct.proyecto_id WHERE ct.id = ?", (tid,)
        ).fetchone()
        if not row:
            return jsonify({"error": "No encontrado"}), 404
        return jsonify(dict(row))
    finally:
        conn.close()


@moeve_bp.put("/api/moeve/transacciones/<int:tid>/asignar")
def api_asignar_transaccion(tid):
    """Asignar/cambiar proyecto manualmente."""
    _ensure()
    data = request.get_json(silent=True) or {}
    proyecto_id = data.get("proyecto_id")
    conn = get_conn()
    try:
        if proyecto_id:
            conn.execute(
                "UPDATE combustible_transacciones SET proyecto_id=?, imputacion_tipo='manual', "
                "imputacion_confianza='alta', imputacion_notas='Asignación manual' WHERE id=?",
                (proyecto_id, tid),
            )
        else:
            conn.execute(
                "UPDATE combustible_transacciones SET proyecto_id=NULL, imputacion_tipo=NULL, "
                "imputacion_confianza=NULL, imputacion_notas=NULL WHERE id=?",
                (tid,),
            )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ── Resumen / KPIs ──────────────────────────────────────────────────────

@moeve_bp.get("/api/moeve/resumen")
def api_resumen():
    _ensure()
    from core.combustible_db import init_combustible_db
    init_combustible_db()
    conn = get_conn()
    try:
        total = conn.execute("SELECT COUNT(*), COALESCE(SUM(importe_final),0), COALESCE(SUM(litros),0) FROM combustible_transacciones").fetchone()
        imputadas = conn.execute("SELECT COUNT(*) FROM combustible_transacciones WHERE proyecto_id IS NOT NULL").fetchone()[0]
        try:
            estaciones_total = conn.execute("SELECT COUNT(*) FROM estaciones_servicio").fetchone()[0]
            estaciones_geo = conn.execute("SELECT COUNT(*) FROM estaciones_servicio WHERE latitud IS NOT NULL AND geocoded=1").fetchone()[0]
        except Exception:
            estaciones_total = 0; estaciones_geo = 0

        por_concepto = [dict(r) for r in conn.execute(
            "SELECT concepto_raw as concepto, COUNT(*) as n, ROUND(SUM(importe_final),2) as total, ROUND(SUM(litros),2) as litros "
            "FROM combustible_transacciones GROUP BY concepto_raw ORDER BY SUM(importe_final) DESC"
        ).fetchall()]

        por_vehiculo = [dict(r) for r in conn.execute(
            "SELECT matricula_raw as matricula, COUNT(*) as n, ROUND(SUM(importe_final),2) as total, ROUND(SUM(litros),2) as litros, "
            "MAX(fecha_operacion) as ultimo "
            "FROM combustible_transacciones WHERE matricula_raw IS NOT NULL AND matricula_raw != '' GROUP BY matricula_raw ORDER BY SUM(importe_final) DESC"
        ).fetchall()]

        por_proyecto = [dict(r) for r in conn.execute(
            "SELECT p.nombre, p.codigo, COUNT(*) as n, ROUND(SUM(ct.importe_final),2) as total "
            "FROM combustible_transacciones ct JOIN proyectos p ON p.id = ct.proyecto_id "
            "GROUP BY ct.proyecto_id ORDER BY SUM(ct.importe_final) DESC"
        ).fetchall()]

        mensual = [dict(r) for r in conn.execute(
            "SELECT SUBSTR(fecha_operacion,1,7) as mes, ROUND(SUM(importe_final),2) as total, "
            "ROUND(SUM(CASE WHEN tipo_producto='diesel' THEN importe_final ELSE 0 END),2) as diesel, "
            "ROUND(SUM(CASE WHEN tipo_producto='gasolina' THEN importe_final ELSE 0 END),2) as gasolina, "
            "ROUND(SUM(CASE WHEN tipo_producto='peaje' THEN importe_final ELSE 0 END),2) as peajes, "
            "ROUND(SUM(CASE WHEN tipo_producto NOT IN ('diesel','gasolina','peaje','descuento') THEN importe_final ELSE 0 END),2) as otros "
            "FROM combustible_transacciones WHERE tipo_producto != 'descuento' "
            "GROUP BY SUBSTR(fecha_operacion,1,7) ORDER BY mes"
        ).fetchall()]

        rango = conn.execute("SELECT MIN(fecha_operacion), MAX(fecha_operacion) FROM combustible_transacciones").fetchone()

        return jsonify({
            "total_transacciones": total[0] or 0,
            "total_importe": round(total[1] or 0, 2),
            "total_litros": round(total[2] or 0, 2),
            "imputadas": imputadas,
            "pct_imputado": round(imputadas / total[0] * 100, 1) if total[0] else 0,
            "estaciones_total": estaciones_total,
            "estaciones_geo": estaciones_geo,
            "fecha_desde": rango[0],
            "fecha_hasta": rango[1],
            "por_concepto": por_concepto,
            "por_vehiculo": por_vehiculo,
            "por_proyecto": por_proyecto,
            "mensual": mensual,
        })
    finally:
        conn.close()


# ── Estaciones ──────────────────────────────────────────────────────────

@moeve_bp.get("/api/moeve/estaciones")
def api_estaciones():
    _ensure()
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT eg.*, COUNT(ct.id) as frecuencia, MAX(ct.fecha) as ultimo_uso
            FROM moeve_estaciones_geo eg
            LEFT JOIN combustible_transacciones ct ON ct.estacion = eg.estacion
            GROUP BY eg.id ORDER BY frecuencia DESC
        """).fetchall()
        return jsonify({"estaciones": [dict(r) for r in rows]})
    finally:
        conn.close()


@moeve_bp.put("/api/moeve/estaciones/<int:eid>/geo")
def api_estacion_geo(eid):
    """Corregir/añadir geolocalización manual."""
    _ensure()
    data = request.get_json(silent=True) or {}
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE moeve_estaciones_geo SET latitud=?, longitud=?, municipio=?, provincia=?, geo_source='manual' WHERE id=?",
            (data.get("latitud"), data.get("longitud"), data.get("municipio", ""), data.get("provincia", ""), eid),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ── Vehículos ────────────────────────────────────────────────────────────

@moeve_bp.get("/api/moeve/vehiculos")
def api_vehiculos():
    _ensure()
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT v.*, ROUND(SUM(ct.importe),2) as gasto_total, ROUND(SUM(ct.litros),2) as litros_total,
                   COUNT(ct.id) as num_transacciones, MAX(ct.fecha) as ultimo_uso
            FROM moeve_vehiculos v
            LEFT JOIN combustible_transacciones ct ON ct.matricula = v.matricula
            GROUP BY v.id ORDER BY gasto_total DESC
        """).fetchall()
        return jsonify({"vehiculos": [dict(r) for r in rows]})
    finally:
        conn.close()


@moeve_bp.put("/api/moeve/vehiculos/<int:vid>")
def api_vehiculo_update(vid):
    _ensure()
    data = request.get_json(silent=True) or {}
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE moeve_vehiculos SET tipo=?, descripcion=?, empleado_id=?, maquina_id=? WHERE id=?",
            (data.get("tipo"), data.get("descripcion"), data.get("empleado_id"), data.get("maquina_id"), vid),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
#  COMBUSTIBLE V2 — New schema endpoints
# ═══════════════════════════════════════════════════════════════════════════

@moeve_bp.post("/api/combustible/importar-moeve")
def api_combustible_importar_moeve():
    """Import Moeve XLSX file."""
    from core.combustible_db import importar_excel_moeve
    import os
    from config import DATOS_DIR

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename.endswith((".xlsx", ".xls")):
        return jsonify({"error": "Solo se aceptan archivos Excel (.xlsx)"}), 400

    upload_dir = DATOS_DIR / "subidas" / "combustible" / "moeve"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filepath = upload_dir / f.filename
    f.save(str(filepath))

    try:
        stats = importar_excel_moeve(str(filepath))
        # Limit error details to first 10 for response
        if stats.get("errores_detalle"):
            stats["errores_detalle"] = stats["errores_detalle"][:10]
        return jsonify(stats)
    except Exception as e:
        logger.exception("Error importing Moeve XLSX")
        return jsonify({"error": str(e)}), 500


@moeve_bp.post("/api/combustible/importar-solred")
def api_combustible_importar_solred():
    """Import Solred PDF invoice."""
    from core.combustible_db import importar_pdf_solred
    from config import DATOS_DIR

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename.endswith(".pdf"):
        return jsonify({"error": "Solo se aceptan archivos PDF (.pdf)"}), 400

    upload_dir = DATOS_DIR / "subidas" / "combustible" / "solred"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filepath = upload_dir / f.filename
    f.save(str(filepath))

    try:
        stats = importar_pdf_solred(str(filepath))
        if stats.get("errores_detalle"):
            stats["errores_detalle"] = stats["errores_detalle"][:10]
        return jsonify(stats)
    except Exception as e:
        logger.exception("Error importing Solred PDF")
        return jsonify({"error": str(e)}), 500


@moeve_bp.get("/api/combustible/vehiculos")
def api_combustible_vehiculos():
    from core.combustible_db import init_combustible_db
    init_combustible_db()
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM vehiculos ORDER BY matricula").fetchall()
        return jsonify({"vehiculos": [dict(r) for r in rows]})
    finally:
        conn.close()


@moeve_bp.post("/api/combustible/geocodificar-estaciones")
def api_combustible_geocodificar():
    """Geocode pending gas stations in small batches (default 10, max 20)."""
    from core.combustible_geocoding import geocodificar_pendientes
    limit = min(request.args.get("limit", 10, type=int), 20)
    try:
        stats = geocodificar_pendientes(limit=limit)
        return jsonify(stats)
    except Exception as e:
        logger.exception("Error geocoding stations")
        return jsonify({"error": str(e), "tipo": type(e).__name__}), 500


@moeve_bp.get("/api/combustible/estaciones")
def api_combustible_estaciones():
    from core.combustible_db import init_combustible_db
    init_combustible_db()
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT es.*, COUNT(ct.id) as transacciones
            FROM estaciones_servicio es
            LEFT JOIN combustible_transacciones ct ON ct.estacion_id = es.id
            GROUP BY es.id ORDER BY es.nombre
        """).fetchall()
        pendientes = conn.execute("SELECT COUNT(*) FROM estaciones_servicio WHERE geocoded=0").fetchone()[0]
        return jsonify({"estaciones": [dict(r) for r in rows], "pendientes_geo": pendientes})
    finally:
        conn.close()


@moeve_bp.get("/api/combustible/tarjetas")
def api_combustible_tarjetas():
    from core.combustible_db import init_combustible_db
    init_combustible_db()
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM tarjetas_combustible ORDER BY pan").fetchall()
        return jsonify({"tarjetas": [dict(r) for r in rows]})
    finally:
        conn.close()


@moeve_bp.get("/api/combustible/transacciones-v2")
def api_combustible_transacciones_v2():
    from core.combustible_db import init_combustible_db
    init_combustible_db()
    conn = get_conn()
    try:
        periodo = request.args.get("periodo", "")
        where = "WHERE 1=1"
        params = []
        if periodo:
            where += " AND ct.fecha_operacion LIKE ?"
            params.append(periodo + "%")
        rows = conn.execute(f"""
            SELECT ct.*, e.nombre as estacion_nombre, v.matricula as vehiculo_matricula
            FROM combustible_transacciones ct
            LEFT JOIN estaciones_servicio e ON e.id = ct.estacion_id
            LEFT JOIN vehiculos v ON v.id = ct.vehiculo_id
            {where} ORDER BY ct.fecha_operacion DESC LIMIT 500
        """, params).fetchall()
        total = conn.execute(f"SELECT COUNT(*), COALESCE(SUM(ct.importe_final),0), COALESCE(SUM(ct.litros),0) FROM combustible_transacciones ct {where}", params).fetchone()
        return jsonify({
            "transacciones": [dict(r) for r in rows],
            "total_count": total[0],
            "total_importe": round(total[1], 2),
            "total_litros": round(total[2], 1),
        })
    finally:
        conn.close()


@moeve_bp.get("/api/combustible/archivo-legacy")
def api_combustible_archivo_legacy():
    from core.combustible_db import get_archivo_legacy_count
    return jsonify({"count": get_archivo_legacy_count()})
