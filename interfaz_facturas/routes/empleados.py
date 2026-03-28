"""Rutas de empleados: CRUD completo."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import empleados_db

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
