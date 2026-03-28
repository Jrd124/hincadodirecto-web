"""Rutas CAE: documentos, plantillas, expedientes, tareas, sync y OneDrive."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import cae_db, cae_matching, cae_sync

logger = logging.getLogger("erp")

cae_bp = Blueprint("cae", __name__)


# ── CAE Dashboard ──

@cae_bp.get("/api/cae/dashboard")
def api_cae_dashboard():
  return jsonify(cae_db.obtener_dashboard_stats())


# ── CAE Documentos ──

@cae_bp.get("/api/cae/documentos")
def api_cae_listar_documentos():
  filtros = {
      "doc_type": request.args.get("doc_type"),
      "entity_type": request.args.get("entity_type"),
      "confidence": request.args.get("confidence"),
      "busqueda": request.args.get("q"),
      "limit": request.args.get("limit"),
  }
  return jsonify({"documentos": cae_db.listar_documentos(filtros)})


@cae_bp.get("/api/cae/documentos/<int:did>")
def api_cae_obtener_documento(did):
  doc = cae_db.obtener_documento(did)
  if not doc:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(doc)


@cae_bp.put("/api/cae/documentos/<int:did>")
def api_cae_actualizar_documento(did):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.actualizar_documento(did, data))


# ── CAE Plantillas ──

@cae_bp.get("/api/cae/plantillas")
def api_cae_listar_plantillas():
  return jsonify({"plantillas": cae_db.listar_plantillas()})


@cae_bp.get("/api/cae/plantillas/<int:pid>")
def api_cae_obtener_plantilla(pid):
  p = cae_db.obtener_plantilla(pid)
  if not p:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify(p)


@cae_bp.post("/api/cae/plantillas")
def api_cae_crear_plantilla():
  data = request.get_json(silent=True) or {}
  if not data.get("nombre"):
    return jsonify({"error": "El nombre es obligatorio"}), 400
  return jsonify(cae_db.crear_plantilla(data)), 201


@cae_bp.put("/api/cae/plantillas/<int:pid>")
def api_cae_actualizar_plantilla(pid):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.actualizar_plantilla(pid, data))


@cae_bp.delete("/api/cae/plantillas/<int:pid>")
def api_cae_eliminar_plantilla(pid):
  ok = cae_db.eliminar_plantilla(pid)
  if not ok:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify({"ok": True})


# ── CAE Plantilla Items ──

@cae_bp.post("/api/cae/plantillas/<int:pid>/items")
def api_cae_crear_plantilla_item(pid):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.crear_plantilla_item(pid, data)), 201


@cae_bp.put("/api/cae/plantilla-items/<int:iid>")
def api_cae_actualizar_plantilla_item(iid):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.actualizar_plantilla_item(iid, data))


@cae_bp.delete("/api/cae/plantilla-items/<int:iid>")
def api_cae_eliminar_plantilla_item(iid):
  ok = cae_db.eliminar_plantilla_item(iid)
  if not ok:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify({"ok": True})


# ── CAE Expedientes ──

@cae_bp.get("/api/cae/expedientes")
def api_cae_listar_expedientes():
  return jsonify({"expedientes": cae_db.listar_expedientes()})


@cae_bp.get("/api/cae/expedientes/<int:eid>")
def api_cae_obtener_expediente(eid):
  exp = cae_db.obtener_expediente(eid)
  if not exp:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(exp)


@cae_bp.post("/api/cae/expedientes")
def api_cae_crear_expediente():
  data = request.get_json(silent=True) or {}
  if not data.get("proyecto_id"):
    return jsonify({"error": "proyecto_id es obligatorio"}), 400
  try:
    return jsonify(cae_db.crear_expediente(data)), 201
  except Exception as e:
    if "UNIQUE constraint" in str(e):
      return jsonify({"error": "Ya existe un expediente para este proyecto"}), 400
    raise


@cae_bp.put("/api/cae/expedientes/<int:eid>")
def api_cae_actualizar_expediente(eid):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.actualizar_expediente(eid, data))


@cae_bp.post("/api/cae/expedientes/<int:eid>/analizar")
def api_cae_analizar_expediente(eid):
  resultado = cae_matching.analyze_expediente(eid)
  if "error" in resultado:
    return jsonify(resultado), 400
  return jsonify(resultado)


# ── CAE Entidades de expediente ──

@cae_bp.post("/api/cae/expedientes/<int:eid>/entidades")
def api_cae_asignar_entidad(eid):
  data = request.get_json(silent=True) or {}
  entity_type = data.get("entity_type")
  entity_id = data.get("entity_id")
  if not entity_type or not entity_id:
    return jsonify({"error": "entity_type y entity_id son obligatorios"}), 400
  return jsonify(cae_db.asignar_entidad(eid, entity_type, int(entity_id)))


@cae_bp.delete("/api/cae/expedientes/<int:eid>/entidades")
def api_cae_desasignar_entidad(eid):
  data = request.get_json(silent=True) or {}
  entity_type = data.get("entity_type")
  entity_id = data.get("entity_id")
  if not entity_type or not entity_id:
    return jsonify({"error": "entity_type y entity_id son obligatorios"}), 400
  return jsonify(cae_db.desasignar_entidad(eid, entity_type, int(entity_id)))


# ── CAE Tareas ──

@cae_bp.get("/api/cae/tareas")
def api_cae_listar_tareas():
  filtros = {
      "estado": request.args.get("estado"),
      "tipo": request.args.get("tipo"),
      "prioridad": request.args.get("prioridad"),
      "expediente_id": request.args.get("expediente_id"),
  }
  return jsonify({"tareas": cae_db.listar_tareas(filtros)})


@cae_bp.put("/api/cae/tareas/<int:tid>")
def api_cae_actualizar_tarea(tid):
  data = request.get_json(silent=True) or {}
  return jsonify(cae_db.actualizar_tarea(tid, data))


# ── CAE Sync ──

@cae_bp.get("/api/cae/sync/carpetas")
def api_cae_listar_carpetas():
  return jsonify({"carpetas": cae_db.listar_sync_carpetas()})


@cae_bp.post("/api/cae/sync/carpetas")
def api_cae_crear_carpeta():
  data = request.get_json(silent=True) or {}
  if not data.get("drive_id") or not data.get("folder_id"):
    return jsonify({"error": "drive_id y folder_id son obligatorios"}), 400
  return jsonify(cae_db.crear_sync_carpeta(data)), 201


@cae_bp.delete("/api/cae/sync/carpetas/<int:cid>")
def api_cae_eliminar_carpeta(cid):
  ok = cae_db.eliminar_sync_carpeta(cid)
  if not ok:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify({"ok": True})


@cae_bp.post("/api/cae/sync/ejecutar")
def api_cae_ejecutar_sync():
  resultados = cae_sync.sync_all_carpetas()
  return jsonify({"resultados": resultados})


@cae_bp.get("/api/cae/sync/runs")
def api_cae_listar_runs():
  limit = request.args.get("limit", 20, type=int)
  return jsonify({"runs": cae_db.listar_sync_runs(limit)})


# ── CAE OneDrive Explorer ──

@cae_bp.get("/api/cae/onedrive/drives")
def api_cae_onedrive_drives():
  from core.onedrive_db import get_sharepoint_client
  try:
    client = get_sharepoint_client()
    return jsonify({"drives": client.obtener_drives()})
  except Exception as e:
    return jsonify({"error": str(e)}), 500


@cae_bp.get("/api/cae/onedrive/carpetas")
def api_cae_onedrive_carpetas():
  from core.onedrive_db import get_sharepoint_client
  drive_id = request.args.get("drive_id")
  folder_id = request.args.get("folder_id")
  if not drive_id:
    return jsonify({"error": "drive_id es obligatorio"}), 400
  try:
    client = get_sharepoint_client()
    items = client.obtener_carpetas_drive(drive_id, folder_id)
    return jsonify({"items": items})
  except Exception as e:
    return jsonify({"error": str(e)}), 500


# ── CAE Estado de proyecto ──

@cae_bp.get("/api/cae/proyecto/<int:pid>/estado")
def api_cae_estado_proyecto(pid):
  from core.proyectos_db import obtener_estado_cae
  estado = obtener_estado_cae(pid)
  if not estado:
    return jsonify({"tiene_expediente": False})
  estado["tiene_expediente"] = True
  return jsonify(estado)


# ── CAE Constantes ──

@cae_bp.get("/api/cae/constantes")
def api_cae_constantes():
  return jsonify({
      "doc_types": cae_db.DOC_TYPES,
      "entity_types": cae_db.ENTITY_TYPES,
      "expediente_estados": cae_db.EXPEDIENTE_ESTADOS,
      "resultado_estados": cae_db.RESULTADO_ESTADOS,
      "tarea_tipos": cae_db.TAREA_TIPOS,
      "tarea_prioridades": cae_db.TAREA_PRIORIDADES,
      "tarea_estados": cae_db.TAREA_ESTADOS,
  })
