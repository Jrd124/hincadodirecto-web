"""Rutas del modulo de Impuestos — seguimiento de obligaciones fiscales."""
from __future__ import annotations

import os

from flask import Blueprint, jsonify, request

from core import impuestos_db

impuestos_bp = Blueprint("impuestos", __name__)


@impuestos_bp.get("/api/impuestos/obligaciones")
def api_listar_obligaciones():
    impuestos_db.init_impuestos_db()
    sociedad = (request.args.get("sociedad") or "").strip() or None
    año = request.args.get("año", type=int) or request.args.get("ano", type=int) or None
    estado = (request.args.get("estado") or "").strip() or None
    return jsonify({"obligaciones": impuestos_db.listar_obligaciones(sociedad=sociedad, año=año, estado=estado)})


@impuestos_bp.get("/api/impuestos/obligaciones/<int:oid>")
def api_obtener_obligacion(oid: int):
    impuestos_db.init_impuestos_db()
    ob = impuestos_db.obtener_obligacion(oid)
    if not ob:
        return jsonify({"error": "Obligacion no encontrada"}), 404
    return jsonify(ob)


@impuestos_bp.put("/api/impuestos/obligaciones/<int:oid>")
def api_actualizar_obligacion(oid: int):
    data = request.get_json(silent=True) or {}
    ob = impuestos_db.actualizar_obligacion(oid, data)
    if not ob:
        return jsonify({"error": "Obligacion no encontrada"}), 404
    return jsonify(ob)


@impuestos_bp.get("/api/impuestos/calendario")
def api_calendario():
    impuestos_db.init_impuestos_db()
    año = request.args.get("año", type=int) or request.args.get("ano", type=int) or 2026
    sociedad = (request.args.get("sociedad") or "").strip() or None
    obligaciones = impuestos_db.listar_obligaciones(sociedad=sociedad, año=año)
    return jsonify({"obligaciones": obligaciones, "año": año})


@impuestos_bp.get("/api/impuestos/resumen")
def api_resumen():
    impuestos_db.init_impuestos_db()
    año = request.args.get("año", type=int) or request.args.get("ano", type=int) or 2026
    sociedad = (request.args.get("sociedad") or "").strip() or None
    return jsonify(impuestos_db.contar_por_estado(sociedad=sociedad, año=año))


@impuestos_bp.get("/api/impuestos/obligaciones/<int:oid>/documentos")
def api_listar_documentos(oid: int):
    impuestos_db.init_impuestos_db()
    return jsonify({"documentos": impuestos_db.listar_documentos_obligacion(oid)})


@impuestos_bp.post("/api/impuestos/obligaciones/<int:oid>/documentos")
def api_subir_documento(oid: int):
    impuestos_db.init_impuestos_db()
    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        return jsonify({"error": "Falta el archivo"}), 400

    ob = impuestos_db.obtener_obligacion(oid)
    if not ob:
        return jsonify({"error": "Obligacion no encontrada"}), 404

    tipo = (request.form.get("tipo") or "modelo").strip()
    descripcion = (request.form.get("descripcion") or "").strip()

    # Save locally
    from config import DATOS_DIR
    soc_nombre = impuestos_db.NOMBRES_SOCIEDAD.get(ob["sociedad"], ob["sociedad"]).replace(",", "").replace(".", "")
    carpeta_local = DATOS_DIR / "Impuestos" / soc_nombre / str(ob["año"])
    carpeta_local.mkdir(parents=True, exist_ok=True)

    nombre_base = f"Modelo_{ob['modelo']}_{ob['periodo']}_{tipo}"
    ext = os.path.splitext(archivo.filename)[1] or ".pdf"
    nombre_final = nombre_base + ext
    ruta_local = carpeta_local / nombre_final
    archivo.save(str(ruta_local))

    ruta_relativa = str(ruta_local.relative_to(DATOS_DIR)).replace("\\", "/")

    doc = impuestos_db.crear_documento({
        "obligacion_id": oid,
        "nombre_archivo": nombre_final,
        "ruta_archivo": ruta_relativa,
        "tipo": tipo,
        "descripcion": descripcion,
    })
    return jsonify(doc), 201


@impuestos_bp.delete("/api/impuestos/documentos/<int:doc_id>")
def api_eliminar_documento(doc_id: int):
    impuestos_db.init_impuestos_db()
    ok = impuestos_db.eliminar_documento(doc_id)
    if not ok:
        return jsonify({"error": "Documento no encontrado"}), 404
    return jsonify({"ok": True})
