# -*- coding: utf-8 -*-
"""Rutas API para el módulo de Seguros."""
from __future__ import annotations

import os
import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required

from core import seguros_db

logger = logging.getLogger("erp")
seguros_bp = Blueprint("seguros", __name__)


@seguros_bp.get("/api/seguros/polizas")
@login_required
def api_listar_polizas():
    seguros_db.init_seguros_db()
    sociedad = request.args.get("sociedad", "").strip() or ""
    tipo = request.args.get("tipo", "").strip() or ""
    estado = request.args.get("estado", "").strip() or ""
    rows = seguros_db.listar_polizas(sociedad=sociedad, tipo=tipo, estado=estado)
    return jsonify({"polizas": rows})


@seguros_bp.get("/api/seguros/polizas/<int:poliza_id>")
@login_required
def api_obtener_poliza(poliza_id):
    row = seguros_db.obtener_poliza(poliza_id)
    if not row:
        return jsonify({"error": "Póliza no encontrada"}), 404
    return jsonify(row)


@seguros_bp.post("/api/seguros/polizas")
@login_required
def api_crear_poliza():
    data = request.get_json(silent=True) or {}
    required = ["tipo", "aseguradora", "descripcion", "fecha_inicio", "fecha_vencimiento"]
    for f in required:
        if not data.get(f):
            return jsonify({"error": f"Campo '{f}' requerido"}), 400
    row = seguros_db.crear_poliza(data)
    return jsonify(row), 201


@seguros_bp.put("/api/seguros/polizas/<int:poliza_id>")
@login_required
def api_actualizar_poliza(poliza_id):
    data = request.get_json(silent=True) or {}
    row = seguros_db.actualizar_poliza(poliza_id, data)
    if not row:
        return jsonify({"error": "Póliza no encontrada"}), 404
    return jsonify(row)


@seguros_bp.delete("/api/seguros/polizas/<int:poliza_id>")
@login_required
def api_eliminar_poliza(poliza_id):
    ok = seguros_db.eliminar_poliza(poliza_id)
    if not ok:
        return jsonify({"error": "No encontrada"}), 404
    return jsonify({"ok": True})


@seguros_bp.get("/api/seguros/siniestros")
@login_required
def api_listar_siniestros():
    seguros_db.init_seguros_db()
    poliza_id = request.args.get("poliza_id", type=int)
    estado = request.args.get("estado", "").strip() or ""
    rows = seguros_db.listar_siniestros(poliza_id=poliza_id, estado=estado)
    return jsonify({"siniestros": rows})


@seguros_bp.post("/api/seguros/siniestros")
@login_required
def api_crear_siniestro():
    data = request.get_json(silent=True) or {}
    if not data.get("poliza_id") or not data.get("fecha_siniestro") or not data.get("descripcion"):
        return jsonify({"error": "poliza_id, fecha_siniestro y descripcion requeridos"}), 400
    row = seguros_db.crear_siniestro(data)
    return jsonify(row), 201


@seguros_bp.put("/api/seguros/siniestros/<int:siniestro_id>")
@login_required
def api_actualizar_siniestro(siniestro_id):
    data = request.get_json(silent=True) or {}
    row = seguros_db.actualizar_siniestro(siniestro_id, data)
    if not row:
        return jsonify({"error": "Siniestro no encontrado"}), 404
    return jsonify(row)


@seguros_bp.get("/api/seguros/polizas/<int:poliza_id>/documentos")
@login_required
def api_listar_documentos_poliza(poliza_id):
    rows = seguros_db.listar_documentos(poliza_id)
    return jsonify({"documentos": rows})


@seguros_bp.post("/api/seguros/polizas/<int:poliza_id>/documentos")
@login_required
def api_subir_documento_poliza(poliza_id):
    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        return jsonify({"error": "No se envió archivo"}), 400
    from config import DATOS_DIR
    ruta_seguros = DATOS_DIR / "seguros"
    ruta_seguros.mkdir(parents=True, exist_ok=True)
    nombre = f"seg_{poliza_id}_{int(__import__('time').time())}_{archivo.filename}"
    ruta = ruta_seguros / nombre
    archivo.save(str(ruta))
    doc = seguros_db.crear_documento({
        "poliza_id": poliza_id,
        "nombre_archivo": archivo.filename,
        "ruta_archivo": "seguros/" + nombre,
        "tipo": request.form.get("tipo", "poliza"),
        "descripcion": request.form.get("descripcion", ""),
    })
    return jsonify(doc), 201


@seguros_bp.delete("/api/seguros/documentos/<int:doc_id>")
@login_required
def api_eliminar_documento(doc_id):
    ok = seguros_db.eliminar_documento(doc_id)
    if not ok:
        return jsonify({"error": "No encontrado"}), 404
    return jsonify({"ok": True})


@seguros_bp.get("/api/seguros/polizas-pendientes-pago")
@login_required
def api_polizas_pendientes_pago():
    rows = seguros_db.listar_polizas_pendientes_pago()
    return jsonify({"polizas": rows})


@seguros_bp.post("/api/seguros/conciliar")
@login_required
def api_conciliar_seguro():
    data = request.get_json(silent=True) or {}
    poliza_id = data.get("poliza_id")
    movimiento_id = data.get("movimiento_id")
    movimiento_fecha = data.get("movimiento_fecha", "")
    if not poliza_id or movimiento_id is None:
        return jsonify({"error": "poliza_id y movimiento_id requeridos"}), 400
    # Marcar póliza como pagada
    row = seguros_db.conciliar_poliza(int(poliza_id), str(movimiento_id), movimiento_fecha)
    if not row:
        return jsonify({"error": "Póliza no encontrada"}), 404
    # Marcar movimiento en movimientos.db como conciliado
    try:
        import sqlite3
        from config import MOVIMIENTOS_DB
        conn = sqlite3.connect(str(MOVIMIENTOS_DB))
        try:
            from datetime import datetime
            now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            # Add seguro_poliza_id column if missing
            cols = {r[1] for r in conn.execute("PRAGMA table_info(movimientos)").fetchall()}
            if "seguro_poliza_id" not in cols:
                conn.execute("ALTER TABLE movimientos ADD COLUMN seguro_poliza_id INTEGER")
            conn.execute(
                "UPDATE movimientos SET seguro_poliza_id = ?, conciliado_at = ? WHERE id = ?",
                (int(poliza_id), now, int(movimiento_id)),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("No se pudo marcar movimiento %s como conciliado: %s", movimiento_id, exc)
    return jsonify({"ok": True, "mensaje": "Póliza conciliada con movimiento bancario."})


@seguros_bp.post("/api/seguros/desconciliar")
@login_required
def api_desconciliar_seguro():
    data = request.get_json(silent=True) or {}
    poliza_id = data.get("poliza_id")
    if not poliza_id:
        return jsonify({"error": "poliza_id requerido"}), 400
    # Obtener movimiento_id antes de limpiar
    poliza = seguros_db.obtener_poliza(int(poliza_id))
    mov_id = poliza.get("movimiento_banco_id") if poliza else None
    row = seguros_db.desconciliar_poliza(int(poliza_id))
    if not row:
        return jsonify({"error": "Póliza no encontrada"}), 404
    # Limpiar movimiento bancario
    if mov_id:
        try:
            import sqlite3
            from config import MOVIMIENTOS_DB
            conn = sqlite3.connect(str(MOVIMIENTOS_DB))
            try:
                conn.execute(
                    "UPDATE movimientos SET seguro_poliza_id = NULL, conciliado_at = NULL WHERE id = ?",
                    (int(mov_id),),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("No se pudo limpiar movimiento %s: %s", mov_id, exc)
    return jsonify({"ok": True, "mensaje": "Pago desvinculado."})


@seguros_bp.get("/api/seguros/resumen")
@login_required
def api_resumen_seguros():
    return jsonify(seguros_db.resumen_seguros())


@seguros_bp.get("/api/seguros/alertas")
@login_required
def api_alertas_seguros():
    return jsonify({"alertas": seguros_db.alertas_seguros()})
