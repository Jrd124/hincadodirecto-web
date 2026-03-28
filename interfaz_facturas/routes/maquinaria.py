"""Rutas de maquinaria: máquinas, checks semanales, incidencias."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request
from flask_login import current_user

from core import maquinaria_db

logger = logging.getLogger("erp")

maquinaria_bp = Blueprint("maquinaria", __name__)


@maquinaria_bp.get("/api/maquinaria/maquinas")
def api_listar_maquinas():
  return jsonify({"maquinas": maquinaria_db.listar_maquinas()})


@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>")
def api_obtener_maquina(mid):
  maq = maquinaria_db.obtener_maquina(mid)
  if not maq:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify(maq)


@maquinaria_bp.post("/api/maquinaria/maquinas")
def api_crear_maquina():
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.crear_maquina(data)), 201


@maquinaria_bp.put("/api/maquinaria/maquinas/<int:mid>")
def api_actualizar_maquina(mid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_maquina(mid, data))


@maquinaria_bp.get("/api/maquinaria/templates/<tipo>")
def api_templates_checklist(tipo):
  return jsonify({"templates": maquinaria_db.obtener_templates_checklist(tipo)})


@maquinaria_bp.post("/api/maquinaria/checks")
def api_crear_check():
  data = request.get_json(silent=True) or {}
  data["usuario_id"] = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  return jsonify(maquinaria_db.crear_check_semanal(data)), 201


@maquinaria_bp.put("/api/maquinaria/checks/<int:cid>/cerrar")
def api_cerrar_check(cid):
  return jsonify(maquinaria_db.cerrar_check(cid))


@maquinaria_bp.post("/api/maquinaria/incidencias")
def api_crear_incidencia():
  data = request.get_json(silent=True) or {}
  data["usuario_id"] = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  return jsonify(maquinaria_db.crear_incidencia(data)), 201


@maquinaria_bp.put("/api/maquinaria/incidencias/<int:iid>")
def api_actualizar_incidencia(iid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_incidencia(iid, data))
