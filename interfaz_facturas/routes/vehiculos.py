"""Rutas de vehículos: CRUD completo."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import vehiculos_db

logger = logging.getLogger("erp")

vehiculos_bp = Blueprint("vehiculos", __name__)


@vehiculos_bp.get("/api/vehiculos")
def api_listar_vehiculos():
  solo_activos = request.args.get("solo_activos", "1") == "1"
  return jsonify({"vehiculos": vehiculos_db.listar_vehiculos(solo_activos)})


@vehiculos_bp.get("/api/vehiculos/<int:vid>")
def api_obtener_vehiculo(vid):
  veh = vehiculos_db.obtener_vehiculo(vid)
  if not veh:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(veh)


@vehiculos_bp.post("/api/vehiculos")
def api_crear_vehiculo():
  data = request.get_json(silent=True) or {}
  if not data.get("matricula"):
    return jsonify({"error": "La matricula es obligatoria"}), 400
  try:
    return jsonify(vehiculos_db.crear_vehiculo(data)), 201
  except Exception as e:
    if "UNIQUE constraint" in str(e):
      return jsonify({"error": "Ya existe un vehiculo con esa matricula"}), 400
    raise


@vehiculos_bp.put("/api/vehiculos/<int:vid>")
def api_actualizar_vehiculo(vid):
  data = request.get_json(silent=True) or {}
  veh = vehiculos_db.actualizar_vehiculo(vid, data)
  if not veh:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify(veh)


@vehiculos_bp.delete("/api/vehiculos/<int:vid>")
def api_eliminar_vehiculo(vid):
  ok = vehiculos_db.eliminar_vehiculo(vid)
  if not ok:
    return jsonify({"error": "No encontrado"}), 404
  return jsonify({"ok": True})
