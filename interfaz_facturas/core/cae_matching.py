"""Motor de matching CAE: analiza expediente y genera resultados + tareas.

Pipeline: plantilla_items x entidades_asignadas -> buscar documento -> evaluar estado.
Resultado por cada cruce: READY, MISSING, EXPIRED, DOUBTFUL.
"""
from __future__ import annotations

from datetime import date, datetime

from core.db import conectar as _conectar, now_iso as _now
from core.cae_db import init_cae_db


# ── Analisis principal ──────────────────────────────────────────────────────


def analyze_expediente(expediente_id: int) -> dict:
    """Ejecuta el pipeline completo de matching para un expediente.

    1. Cargar expediente, plantilla, items, entidades asignadas
    2. Para cada item x entidad: buscar documento, evaluar estado
    3. Persistir resultados en cae_resultados
    4. Generar tareas en cae_tareas
    5. Actualizar estado del expediente
    6. Devolver resumen
    """
    init_cae_db()
    now = _now()

    with _conectar() as conn:
        # 1. Cargar expediente
        exp = conn.execute(
            "SELECT * FROM cae_expedientes WHERE id = ?", [expediente_id]
        ).fetchone()
        if not exp:
            return {"error": "Expediente no encontrado"}

        plantilla_id = exp["plantilla_id"]
        if not plantilla_id:
            return {"error": "Expediente sin plantilla asignada"}

        # Cargar items de plantilla
        items = conn.execute(
            "SELECT * FROM cae_plantilla_items WHERE plantilla_id = ? ORDER BY sort_order",
            [plantilla_id],
        ).fetchall()

        # Cargar entidades asignadas
        entidades = conn.execute(
            "SELECT * FROM cae_expediente_entidades WHERE expediente_id = ?",
            [expediente_id],
        ).fetchall()

        entity_map: dict[str, list[int]] = {"OPERARIO": [], "MAQUINA": [], "VEHICULO": []}
        for ent in entidades:
            et = ent["entity_type"]
            if et in entity_map:
                entity_map[et].append(ent["entity_id"])

        # 2. Compute matches
        today = date.today()
        results = []

        for item in items:
            target_type = item["target_entity_type"]

            if target_type == "EMPRESA":
                result = _match_company_doc(conn, item, today)
                results.append(result)
            else:
                entity_ids = entity_map.get(target_type, [])
                for entity_id in entity_ids:
                    result = _match_entity_doc(conn, item, target_type, entity_id, today)
                    results.append(result)

        # 3. Persist results (delete old, insert new)
        conn.execute("DELETE FROM cae_resultados WHERE expediente_id = ?", [expediente_id])
        for r in results:
            conn.execute(
                "INSERT INTO cae_resultados (expediente_id, plantilla_item_id, entity_type, "
                "entity_id, documento_id, status, last_checked_at) VALUES (?,?,?,?,?,?,?)",
                [expediente_id, r["item_id"], r["entity_type"], r.get("entity_id"),
                 r.get("documento_id"), r["status"], now],
            )

        # 4. Generate tasks
        tasks_created = _generate_tasks(conn, expediente_id, results, items, now)

        # 5. Update expediente status
        all_ready = all(r["status"] == "READY" for r in results) if results else False
        nuevo_estado = "COMPLETO" if all_ready else "EN_REVISION"
        conn.execute(
            "UPDATE cae_expedientes SET estado = ?, last_analysis_at = ?, updated_at = ? WHERE id = ?",
            [nuevo_estado, now, now, expediente_id],
        )

    # 6. Summary
    status_counts = {"READY": 0, "MISSING": 0, "EXPIRED": 0, "DOUBTFUL": 0}
    for r in results:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1

    total = len(results)
    pct = round(status_counts["READY"] / total * 100) if total > 0 else 0

    return {
        "expediente_id": expediente_id,
        "total_requisitos": total,
        "resultados": status_counts,
        "porcentaje_completo": pct,
        "tareas_generadas": tasks_created,
        "estado": nuevo_estado,
    }


# ── Matching interno ────────────────────────────────────────────────────────


def _match_company_doc(conn, item, today: date) -> dict:
    """Busca documento de empresa que matchee con el item de plantilla."""
    doc = conn.execute(
        "SELECT * FROM cae_documentos WHERE doc_type = ? AND entity_type = 'EMPRESA' "
        "ORDER BY CASE confidence WHEN 'CONFIRMED' THEN 0 WHEN 'SUGGESTED' THEN 1 ELSE 2 END, "
        "fecha_caducidad DESC, created_at DESC LIMIT 1",
        [item["doc_type"]],
    ).fetchone()

    return _evaluate_candidate(doc, item, "EMPRESA", None, today)


def _match_entity_doc(conn, item, entity_type: str, entity_id: int, today: date) -> dict:
    """Busca documento de una entidad especifica."""
    doc = conn.execute(
        "SELECT * FROM cae_documentos WHERE doc_type = ? AND entity_type = ? "
        "AND (entity_id = ? OR entity_id IS NULL) "
        "ORDER BY CASE WHEN entity_id = ? THEN 0 ELSE 1 END, "
        "CASE confidence WHEN 'CONFIRMED' THEN 0 WHEN 'SUGGESTED' THEN 1 ELSE 2 END, "
        "fecha_caducidad DESC, created_at DESC LIMIT 1",
        [item["doc_type"], entity_type, entity_id, entity_id],
    ).fetchone()

    return _evaluate_candidate(doc, item, entity_type, entity_id, today)


def _evaluate_candidate(doc, item, entity_type: str, entity_id: int | None, today: date) -> dict:
    """Evalua un documento candidato contra un requisito.

    Estados posibles:
    - MISSING: no hay documento
    - EXPIRED: documento caducado
    - DOUBTFUL: proximo a caducar, confidence no confirmada, o sin fecha caducidad
    - READY: todo correcto
    """
    result = {
        "item_id": item["id"],
        "entity_type": entity_type,
        "entity_id": entity_id,
        "documento_id": None,
        "status": "MISSING",
    }

    if not doc:
        return result

    result["documento_id"] = doc["id"]

    # Comprobar caducidad
    if item["has_expiry"] and doc["fecha_caducidad"]:
        try:
            expiry = datetime.strptime(doc["fecha_caducidad"][:10], "%Y-%m-%d").date()
            days_until = (expiry - today).days

            if days_until < 0:
                result["status"] = "EXPIRED"
                return result

            if days_until <= (item["expiry_warning_days"] or 30):
                result["status"] = "DOUBTFUL"
                return result
        except (ValueError, TypeError):
            pass

    # Comprobar confidence
    confidence = doc["confidence"] or "UNKNOWN"
    if confidence == "SUGGESTED":
        result["status"] = "DOUBTFUL"
        return result

    if confidence == "UNKNOWN":
        result["status"] = "DOUBTFUL"
        return result

    # Documento con has_expiry pero sin fecha de caducidad
    if item["has_expiry"] and not doc["fecha_caducidad"]:
        result["status"] = "DOUBTFUL"
        return result

    # Todo OK
    result["status"] = "READY"
    return result


# ── Generacion de tareas ────────────────────────────────────────────────────


def _generate_tasks(conn, expediente_id: int, results: list, items: list, now: str) -> int:
    """Genera tareas automaticas basadas en los resultados del matching.

    Solo elimina tareas PENDIENTE previas. Las EN_CURSO/COMPLETADA se preservan.
    """
    # Eliminar tareas pendientes auto-generadas previas
    conn.execute(
        "DELETE FROM cae_tareas WHERE expediente_id = ? AND estado = 'PENDIENTE'",
        [expediente_id],
    )

    item_map = {i["id"]: i for i in items}
    count = 0

    for r in results:
        if r["status"] == "READY":
            continue

        item = item_map.get(r["item_id"])
        if not item:
            continue

        # Determinar tipo, prioridad y titulo
        if r["status"] == "MISSING":
            tipo = "GET_DOCUMENT"
            prioridad = "HIGH" if item["is_mandatory"] else "LOW"
            titulo = f"Obtener: {item['nombre']}"
        elif r["status"] == "EXPIRED":
            tipo = "RENEW_DOCUMENT"
            prioridad = "HIGH" if item["is_mandatory"] else "MEDIUM"
            titulo = f"Renovar: {item['nombre']}"
        else:  # DOUBTFUL
            tipo = "REVIEW_DOUBTFUL"
            prioridad = "MEDIUM"
            titulo = f"Revisar: {item['nombre']}"

        # Enriquecer titulo con label de entidad
        entity_label = _get_entity_label(conn, r["entity_type"], r.get("entity_id"))
        if entity_label:
            titulo += f" — {entity_label}"

        conn.execute(
            "INSERT INTO cae_tareas (expediente_id, resultado_id, tipo, prioridad, "
            "titulo, entity_label, estado, created_at) VALUES (?,?,?,?,?,?,?,?)",
            [expediente_id, None, tipo, prioridad, titulo, entity_label, "PENDIENTE", now],
        )
        count += 1

    return count


def _get_entity_label(conn, entity_type: str, entity_id: int | None) -> str | None:
    """Obtiene un label legible para una entidad."""
    if entity_type == "EMPRESA":
        return "Empresa"
    if not entity_id:
        return None

    if entity_type == "OPERARIO":
        row = conn.execute(
            "SELECT nombre, apellidos FROM empleados WHERE id = ?", [entity_id]
        ).fetchone()
        if row:
            parts = [row["nombre"]]
            if row["apellidos"]:
                parts.append(row["apellidos"])
            return " ".join(parts)

    if entity_type == "MAQUINA":
        row = conn.execute(
            "SELECT internal_id, nombre FROM maquinas WHERE id = ?", [entity_id]
        ).fetchone()
        if row:
            return f"{row['internal_id']} — {row['nombre']}"

    if entity_type == "VEHICULO":
        row = conn.execute(
            "SELECT matricula, marca, modelo FROM vehiculos WHERE id = ?", [entity_id]
        ).fetchone()
        if row:
            parts = [row["matricula"]]
            if row["marca"]:
                parts.append(row["marca"])
            if row["modelo"]:
                parts.append(row["modelo"])
            return " ".join(parts)

    return None
