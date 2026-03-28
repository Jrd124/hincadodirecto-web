"""Rutas de OneDrive / SharePoint."""
from __future__ import annotations

import logging

from flask import Blueprint, Response, jsonify, request

from routes.helpers import _bad_request

logger = logging.getLogger("erp")

onedrive_bp = Blueprint("onedrive", __name__)


@onedrive_bp.get("/api/onedrive/status")
def api_onedrive_status():
    """Verifica la conexión con SharePoint."""
    from core.onedrive_db import get_sharepoint_client

    client = get_sharepoint_client()
    status = client.verificar_conexion()
    return jsonify(status)


@onedrive_bp.get("/api/onedrive/listar")
def api_onedrive_listar():
    """Lista archivos en una carpeta de SharePoint."""
    from core.onedrive_db import get_sharepoint_client

    folder = request.args.get("folder", "")
    client = get_sharepoint_client()
    archivos = client.listar_archivos(folder)
    return jsonify({"archivos": archivos})


@onedrive_bp.get("/api/onedrive/archivo")
def api_onedrive_archivo():
    """Sirve un archivo de SharePoint como proxy (evita problemas de CORS)."""
    from core.onedrive_db import get_sharepoint_client

    file_path = request.args.get("path", "")
    if not file_path:
        return _bad_request("Falta path")

    client = get_sharepoint_client()
    try:
        contenido = client.descargar_archivo(file_path)
    except Exception as exc:
        logger.error("Error descargando de SharePoint %s: %s", file_path, exc)
        return jsonify({"error": "Error conectando con SharePoint"}), 502

    if not contenido:
        return jsonify({"error": "Archivo no encontrado en SharePoint"}), 404

    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    content_types = {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
    }
    ct = content_types.get(ext, "application/octet-stream")
    filename = file_path.split("/")[-1]

    return Response(
        contenido,
        mimetype=ct,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
