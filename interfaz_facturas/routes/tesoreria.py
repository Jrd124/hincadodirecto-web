"""Rutas de tesorería."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import tesoreria_db

logger = logging.getLogger("erp")

tesoreria_bp = Blueprint("tesoreria", __name__)


@tesoreria_bp.get("/api/tesoreria/resumen")
def tesoreria_resumen():
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify(tesoreria_db.resumen(empresa_id))


@tesoreria_bp.get("/api/tesoreria/calendario")
def tesoreria_calendario():
  fecha_desde = (request.args.get("fecha_desde") or "").strip() or None
  fecha_hasta = (request.args.get("fecha_hasta") or "").strip() or None
  tipo = (request.args.get("tipo") or "").strip() or None
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify({"eventos": tesoreria_db.calendario(fecha_desde, fecha_hasta, tipo, empresa_id)})


@tesoreria_bp.get("/api/tesoreria/aging")
def tesoreria_aging():
  tipo = (request.args.get("tipo") or "proveedores").strip()
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify({"aging": tesoreria_db.aging(tipo, empresa_id)})


@tesoreria_bp.get("/api/tesoreria/flujo-caja")
def tesoreria_flujo_caja():
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify({"flujo": tesoreria_db.flujo_caja(empresa_id)})


@tesoreria_bp.put("/api/tesoreria/condiciones/<int:tercero_id>")
def tesoreria_set_condiciones(tercero_id: int):
  data = request.get_json(silent=True) or {}
  dias = data.get("dias_pago", 30)
  notas = (data.get("notas") or "").strip() or None
  result = tesoreria_db.set_condiciones(tercero_id, int(dias), notas)
  return jsonify(result)


@tesoreria_bp.get("/api/tesoreria/alertas")
def tesoreria_alertas():
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  return jsonify(tesoreria_db.alertas_vencidas(empresa_id))
