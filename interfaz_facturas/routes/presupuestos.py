"""Rutas de presupuestos: CRUD, versiones, plantillas T&C, catálogo."""
from __future__ import annotations

import logging

from flask import Blueprint, Response, jsonify, request

from core import presupuestos_db
from routes.helpers import _bad_request

logger = logging.getLogger("erp")

presupuestos_bp = Blueprint("presupuestos", __name__)


@presupuestos_bp.get("/api/presupuestos")
def api_listar_presupuestos():
  presupuestos_db.init_presupuestos_db()
  estado = (request.args.get("estado") or "").strip() or None
  tercero_id = request.args.get("tercero_id", type=int) or None
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify({"presupuestos": presupuestos_db.listar_presupuestos(
    estado=estado, tercero_id=tercero_id, empresa_id=empresa_id,
  )})


@presupuestos_bp.get("/api/presupuestos/<int:presupuesto_id>")
def api_obtener_presupuesto(presupuesto_id: int):
  presupuestos_db.init_presupuestos_db()
  p = presupuestos_db.obtener_presupuesto(presupuesto_id)
  if not p:
    return jsonify({"error": "Presupuesto no encontrado"}), 404
  return jsonify(p)


@presupuestos_bp.post("/api/presupuestos")
def api_crear_presupuesto():
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  if not (data.get("nombre_proyecto") or "").strip():
    return _bad_request("El nombre del proyecto es obligatorio")
  if not data.get("empresa_id"):
    return _bad_request("La empresa es obligatoria")
  if not data.get("tercero_id"):
    return _bad_request("El cliente (tercero_id) es obligatorio")
  p = presupuestos_db.crear_presupuesto(data)
  return jsonify(p), 201


@presupuestos_bp.put("/api/presupuestos/<int:presupuesto_id>")
def api_actualizar_presupuesto(presupuesto_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  p = presupuestos_db.actualizar_presupuesto(presupuesto_id, data)
  if not p:
    return jsonify({"error": "Presupuesto no encontrado"}), 404
  return jsonify(p)


@presupuestos_bp.put("/api/presupuestos/<int:presupuesto_id>/estado")
def api_cambiar_estado_presupuesto(presupuesto_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  estado = (data.get("estado") or "").strip()
  if not estado:
    return _bad_request("El estado es obligatorio")
  p = presupuestos_db.cambiar_estado_presupuesto(presupuesto_id, estado)
  if not p:
    return jsonify({"error": "Presupuesto no encontrado o estado inválido"}), 404
  return jsonify(p)


# --- Versiones ---

@presupuestos_bp.post("/api/presupuestos/<int:presupuesto_id>/versiones")
def api_crear_version_presupuesto(presupuesto_id: int):
  presupuestos_db.init_presupuestos_db()
  v = presupuestos_db.crear_version(presupuesto_id)
  if not v:
    return jsonify({"error": "Presupuesto no encontrado"}), 404
  return jsonify(v), 201


@presupuestos_bp.get("/api/presupuestos/versiones/<int:version_id>")
def api_obtener_version_presupuesto(version_id: int):
  presupuestos_db.init_presupuestos_db()
  v = presupuestos_db.obtener_version(version_id)
  if not v:
    return jsonify({"error": "Versión no encontrada"}), 404
  return jsonify(v)


@presupuestos_bp.put("/api/presupuestos/versiones/<int:version_id>")
def api_actualizar_version_presupuesto(version_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  v = presupuestos_db.actualizar_version(version_id, data)
  if not v:
    return jsonify({"error": "Versión no encontrada"}), 404
  return jsonify(v)


@presupuestos_bp.put("/api/presupuestos/versiones/<int:version_id>/lineas")
def api_guardar_lineas_presupuesto(version_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  lineas = data.get("lineas")
  if lineas is None or not isinstance(lineas, list):
    return _bad_request("Se requiere un array 'lineas'")
  result = presupuestos_db.guardar_lineas(version_id, lineas)
  v = presupuestos_db.obtener_version(version_id)
  return jsonify({"lineas": result, "total": v["total"] if v else 0})


@presupuestos_bp.get("/api/presupuestos/versiones/<int:version_id>/pdf")
def api_generar_pdf_presupuesto(version_id: int):
  presupuestos_db.init_presupuestos_db()
  from core.presupuestos_pdf import generar_pdf_presupuesto
  try:
    pdf_bytes = generar_pdf_presupuesto(version_id)
    return Response(pdf_bytes, mimetype="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=presupuesto_{version_id}.pdf"})
  except ValueError as e:
    return jsonify({"error": str(e)}), 404
  except Exception as e:
    logger.exception("Error generando PDF presupuesto %d", version_id)
    return jsonify({"error": str(e)}), 500


# --- Plantillas T&C ---

@presupuestos_bp.get("/api/presupuestos/plantillas-tc")
def api_listar_plantillas_tc():
  presupuestos_db.init_presupuestos_db()
  activas = request.args.get("activas_solo", "true").lower() in ("1", "true", "si")
  return jsonify({"plantillas": presupuestos_db.listar_plantillas_tc(activas_solo=activas)})


@presupuestos_bp.get("/api/presupuestos/plantillas-tc/<int:plantilla_id>")
def api_obtener_plantilla_tc(plantilla_id: int):
  presupuestos_db.init_presupuestos_db()
  p = presupuestos_db.obtener_plantilla_tc(plantilla_id)
  if not p:
    return jsonify({"error": "Plantilla no encontrada"}), 404
  return jsonify(p)


@presupuestos_bp.post("/api/presupuestos/plantillas-tc")
def api_crear_plantilla_tc():
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  if not (data.get("nombre") or "").strip():
    return _bad_request("El nombre de la plantilla es obligatorio")
  if not (data.get("contenido") or "").strip():
    return _bad_request("El contenido es obligatorio")
  p = presupuestos_db.crear_plantilla_tc(data)
  return jsonify(p), 201


@presupuestos_bp.put("/api/presupuestos/plantillas-tc/<int:plantilla_id>")
def api_actualizar_plantilla_tc(plantilla_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  p = presupuestos_db.actualizar_plantilla_tc(plantilla_id, data)
  if not p:
    return jsonify({"error": "Plantilla no encontrada"}), 404
  return jsonify(p)


# --- Catálogo de partidas predefinidas ---

@presupuestos_bp.get("/api/presupuestos/catalogo")
def api_listar_catalogo():
  presupuestos_db.init_presupuestos_db()
  seccion = (request.args.get("seccion") or "").strip() or None
  categoria = (request.args.get("categoria") or "").strip() or None
  return jsonify({"catalogo": presupuestos_db.listar_catalogo(seccion=seccion, categoria=categoria)})


@presupuestos_bp.post("/api/presupuestos/catalogo")
def api_crear_item_catalogo():
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  if not (data.get("titulo") or "").strip():
    return _bad_request("El título es obligatorio")
  try:
    item = presupuestos_db.crear_item_catalogo(data)
  except ValueError as e:
    return _bad_request(str(e))
  return jsonify(item), 201


@presupuestos_bp.put("/api/presupuestos/catalogo/<int:item_id>")
def api_actualizar_item_catalogo(item_id: int):
  presupuestos_db.init_presupuestos_db()
  data = request.get_json(silent=True) or {}
  item = presupuestos_db.actualizar_item_catalogo(item_id, data)
  if not item:
    return jsonify({"error": "Item no encontrado"}), 404
  return jsonify(item)


@presupuestos_bp.delete("/api/presupuestos/catalogo/<int:item_id>")
def api_eliminar_item_catalogo(item_id: int):
  presupuestos_db.init_presupuestos_db()
  item = presupuestos_db.eliminar_item_catalogo(item_id)
  if not item:
    return jsonify({"error": "Item no encontrado"}), 404
  return jsonify({"ok": True, "item": item})
