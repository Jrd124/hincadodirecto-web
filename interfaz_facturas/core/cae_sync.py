"""Orquestador de sincronizacion OneDrive para el modulo CAE.

Coordina: SharePointClient.delta_sync() + cae_classifier + cae_db.
"""
from __future__ import annotations

import logging
import os

from core.cae_db import (
    init_cae_db, listar_sync_carpetas, actualizar_delta_token,
    crear_sync_run, finalizar_sync_run, upsert_documento,
)
from core.cae_classifier import classify_document, extract_date_from_filename, infer_entity_type
from core.onedrive_db import get_sharepoint_client

logger = logging.getLogger("erp")


def sync_all_carpetas() -> list[dict]:
    """Sincroniza todas las carpetas habilitadas. Devuelve resumen por carpeta."""
    init_cae_db()
    carpetas = listar_sync_carpetas()
    resultados = []
    for c in carpetas:
        if not c.get("enabled"):
            continue
        try:
            r = sync_carpeta(c["id"], c["drive_id"], c["folder_id"], c.get("delta_token"))
            resultados.append(r)
        except Exception as e:
            logger.error(f"Error sync carpeta {c['id']}: {e}")
            resultados.append({"carpeta_id": c["id"], "error": str(e)})
    return resultados


def sync_carpeta(carpeta_id: int, drive_id: str, folder_id: str,
                  delta_token: str | None = None) -> dict:
    """Sincroniza una carpeta individual.

    1. Llama a delta_sync en el SharePointClient
    2. Procesa cada item (clasificar, guardar en cae_documentos)
    3. Guarda nuevo delta_token
    4. Registra sync_run
    """
    init_cae_db()
    client = get_sharepoint_client()
    run_id = crear_sync_run(carpeta_id)

    try:
        items, new_token = client.delta_sync(drive_id, folder_id, delta_token)

        items_new = 0
        items_updated = 0

        for item in items:
            # Skip folders and deleted items
            if "folder" in item:
                continue
            if item.get("deleted"):
                continue

            result = _process_item(item, drive_id)
            if result == "new":
                items_new += 1
            elif result == "updated":
                items_updated += 1

        # Guardar delta token para la proxima sincronizacion
        if new_token:
            actualizar_delta_token(carpeta_id, new_token)

        finalizar_sync_run(run_id, len(items), items_new, items_updated, "OK")

        return {
            "carpeta_id": carpeta_id,
            "run_id": run_id,
            "items_found": len(items),
            "items_new": items_new,
            "items_updated": items_updated,
            "status": "OK",
        }

    except Exception as e:
        logger.error(f"Error en sync_carpeta {carpeta_id}: {e}")
        finalizar_sync_run(run_id, 0, 0, 0, "ERROR", str(e))
        return {"carpeta_id": carpeta_id, "run_id": run_id, "error": str(e), "status": "ERROR"}


def _process_item(item: dict, drive_id: str) -> str:
    """Procesa un item de OneDrive: clasifica y guarda en cae_documentos.

    Returns: "new", "updated", or "skipped".
    """
    name = item.get("name", "")
    item_id = item.get("id", "")
    size = item.get("size", 0)

    # Extraer extension
    ext = os.path.splitext(name)[1].lower().lstrip(".")

    # Ruta del archivo
    parent_ref = item.get("parentReference", {})
    parent_path = parent_ref.get("path", "")
    full_path = f"{parent_path}/{name}" if parent_path else name

    # Clasificar
    classification = classify_document(name, parent_path)

    # Inferir tipo de entidad por ruta
    entity_type = infer_entity_type(parent_path) if parent_path else None

    # Extraer fecha del nombre
    fecha_doc = extract_date_from_filename(name)

    # Hash (usamos el eTag de OneDrive como proxy)
    etag = item.get("eTag", "")

    doc_data = {
        "onedrive_item_id": item_id,
        "drive_id": drive_id,
        "nombre": name,
        "ruta": full_path,
        "extension": ext,
        "tamano": size,
        "doc_type": classification["doc_type"],
        "entity_type": entity_type,
        "entity_id": None,  # Se vincula manualmente o por matching posterior
        "confidence": classification["confidence"],
        "fecha_documento": fecha_doc.isoformat() if fecha_doc else None,
        "fecha_caducidad": None,  # Se establece manualmente
        "hash_sha256": etag,
    }

    result = upsert_documento(doc_data)
    # Si el ID es nuevo, fue un insert; si ya existia, fue update
    return "new" if result.get("created_at") == result.get("updated_at") else "updated"
