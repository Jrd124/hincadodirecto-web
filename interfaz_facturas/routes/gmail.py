"""Rutas Gmail CRM — Fase 3: sync on-demand por empresa y job global."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import gmail_sync
from routes.helpers import _bad_request

logger = logging.getLogger("erp")

gmail_bp = Blueprint("gmail", __name__)


@gmail_bp.get("/api/gmail/estado")
def gmail_estado():
    """Devuelve si Gmail está configurado y disponible."""
    return jsonify(gmail_sync.gmail_disponible())


@gmail_bp.post("/api/gmail/sync/empresa/<int:empresa_id>")
def gmail_sync_empresa(empresa_id: int):
    """
    Sync Gmail para una empresa concreta.
    Busca los últimos hilos y los guarda como actividades CRM.
    """
    estado = gmail_sync.gmail_disponible()
    if not estado.get("disponible"):
        return jsonify({"error": estado.get("motivo", "Gmail no configurado")}), 503

    from core.crm_db import obtener_empresa, listar_contactos
    emp = obtener_empresa(empresa_id)
    if not emp:
        return jsonify({"error": "Empresa no encontrada"}), 404

    contactos_data = listar_contactos(empresa_id=empresa_id)
    contactos = contactos_data.get("contactos", [])

    try:
        hilos = gmail_sync.sync_empresa(emp, contactos)
    except Exception as exc:
        logger.error("Error sync Gmail empresa %s: %s", empresa_id, exc)
        return jsonify({"error": str(exc)}), 500

    creadas = 0
    ya_existian = 0
    for h in hilos:
        # Resumir solo el hilo más reciente
        generar = (h == hilos[0])
        result = gmail_sync.guardar_hilo_como_interaccion(
            h, empresa_id,
            generar_resumen=generar,
            empresa_nombre=emp.get("nombre", ""),
        )
        if result:
            creadas += 1
        else:
            ya_existian += 1

    return jsonify({
        "ok": True,
        "empresa": emp.get("nombre"),
        "hilos_encontrados": len(hilos),
        "interacciones_creadas": creadas,
        "ya_existian": ya_existian,
    })


@gmail_bp.post("/api/gmail/sync/global")
def gmail_sync_global():
    """
    Job manual global: sincroniza hasta CRM_GMAIL_BATCH_SIZE empresas.
    Diseñado para ejecutarse 1-2 veces al día desde el panel admin CRM.
    """
    estado = gmail_sync.gmail_disponible()
    if not estado.get("disponible"):
        return jsonify({"error": estado.get("motivo", "Gmail no configurado")}), 503

    data = request.get_json(silent=True) or {}
    solo_dominio = bool(data.get("solo_con_dominio", False))

    try:
        stats = gmail_sync.sync_global_batch(solo_con_dominio=solo_dominio)
    except Exception as exc:
        logger.error("Error sync Gmail global: %s", exc)
        return jsonify({"error": str(exc)}), 500

    return jsonify({"ok": True, **stats})
