"""Motor de notificaciones de mantenimiento de maquinaria.

Calcula tareas de mantenimiento pendientes por máquina,
controla anti-spam semanal, y envía avisos por WhatsApp (Meta Cloud API).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta
from math import floor

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger("erp.notificaciones")

# ── Config Meta Cloud API (variables de entorno) ─────────────────────────────
META_WA_TOKEN        = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID     = os.getenv("META_WA_PHONE_NUMBER_ID", "")
META_WA_TEMPLATE     = os.getenv("META_WA_TEMPLATE_NAME", "mantenimiento_maquinaria")
META_WA_TEMPLATE_LANG = os.getenv("META_WA_TEMPLATE_LANG", "es")
ERP_BASE_URL         = os.getenv("ERP_BASE_URL", "https://erp.hincadodirecto.com")
NOTIFICACIONES_ENABLED = os.getenv("NOTIFICACIONES_MAQUINARIA_ENABLED", "false").lower() == "true"


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Motor de cálculo: qué tareas tocan                                     ██
# ═══════════════════════════════════════════════════════════════════════════════

def _get_week_iso() -> str:
    """Devuelve la semana ISO actual como string YYYY-WNN."""
    today = date.today()
    cal = today.isocalendar()
    return f"{cal[0]}-W{cal[1]:02d}"


def listar_maintenance_tasks() -> list:
    """Devuelve todas las tareas de mantenimiento activas."""
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_maintenance_tasks WHERE activo = 1 ORDER BY intervalo_horas, code"
        ).fetchall()]


# ── Intervalos por marca ──────────────────────────────────────────────────────
INTERVALOS_POR_MARCA: dict[str, list[int]] = {
    "ORTECO": [100, 250, 500, 1000, 2000],
    "FAGA":   [250, 500, 1500, 2000],
}
# Mantener retrocompatibilidad
INTERVALOS_MANTENIMIENTO = INTERVALOS_POR_MARCA["ORTECO"]


def calcular_intervalos_cascada(due_hours: float, marca: str = "ORTECO") -> list[int]:
    """Dado un umbral de horas due y la marca de la máquina, devuelve los intervalos
    cuyas tareas se deben incluir en el formulario combinado de revisión.

    Lógica: un intervalo I se incluye si due_hours es múltiplo exacto de I.

    ORTECO (intervalos: 100, 250, 500, 1000, 2000):
      due_hours=1000 → [250, 500, 1000]
      due_hours=2000 → [250, 500, 1000, 2000]

    FAGA (intervalos: 250, 500, 1500, 2000):
      due_hours=1500 → [250, 500, 1500]  (1500/250=6, 1500/500=3, 1500/1500=1)
      due_hours=2000 → [250, 500, 2000]  (2000/1500≠entero → 1500 no incluido)
      due_hours=3000 → [250, 500, 1500]
      due_hours=4000 → [250, 500, 2000]
    """
    if due_hours <= 0:
        return []
    intervalos = INTERVALOS_POR_MARCA.get(marca, INTERVALOS_POR_MARCA["ORTECO"])
    return [i for i in intervalos if due_hours >= i and due_hours % i == 0]


def obtener_tasks_agrupadas_por_intervalo(intervalos: list[int]) -> dict[int, list[dict]]:
    """Devuelve las tareas de mantenimiento agrupadas por intervalo horario.

    Parámetro intervalos: lista de intervalos a incluir (ej. [500, 1000, 2000]).
    Parámetro marca: filtra las tareas por marca (ORTECO / FAGA).
    Returns dict con clave=intervalo, valor=lista de tasks con checklist parseado.
    """
    tasks = listar_maintenance_tasks()
    agrupadas: dict[int, list[dict]] = {}
    for interval in sorted(intervalos):
        grupo = []
        for t in tasks:
            if t["intervalo_horas"] == interval and t.get("marca", "ORTECO") == marca:
                t = dict(t)  # copia
                t["checklist"] = json.loads(t.get("checklist_json") or "[]")
                grupo.append(t)
        if grupo:
            agrupadas[interval] = grupo
    return agrupadas


def calcular_revision_combinada(maquina_id: int, due_hours: float, marca: str = "ORTECO") -> dict:
    """Calcula la revisión combinada (cascading) para una máquina a un umbral dado.

    Returns dict con:
      - intervalos: lista de intervalos incluidos
      - tasks_agrupadas: dict[intervalo] → lista de tareas con checklists
      - total_tareas: número total de tareas
      - tiene_taller: True si alguna tarea requiere taller autorizado
    """
    intervalos = calcular_intervalos_cascada(due_hours, marca)
    tasks_agrupadas = obtener_tasks_agrupadas_por_intervalo(intervalos, marca)
    total = sum(len(v) for v in tasks_agrupadas.values())
    tiene_taller = any(
        t.get("requires_workshop")
        for grupo in tasks_agrupadas.values()
        for t in grupo
    )
    return {
        "intervalos": intervalos,
        "tasks_agrupadas": tasks_agrupadas,
        "total_tareas": total,
        "tiene_taller": tiene_taller,
    }


def calcular_tareas_due(maquina_id: int | None = None) -> list:
    """Calcula todas las tareas de mantenimiento que 'tocan' para cada máquina activa.

    Para cada (máquina, tarea), calcula:
    - next_due_hours: siguiente múltiplo del intervalo desde la última ejecución (o desde 0)
    - is_due: si horometro_actual >= next_due_hours
    - already_notified_this_week: si ya se envió notificación esta semana

    Returns lista de dicts con info completa para el scheduler.
    """
    week = _get_week_iso()
    results = []

    with _conectar() as conn:
        # Cargar tareas activas agrupadas por marca para lookup eficiente
        all_tasks = [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_maintenance_tasks WHERE activo = 1"
        ).fetchall()]
        tasks_por_marca: dict[str, list[dict]] = {}
        for t in all_tasks:
            m = t.get("marca", "ORTECO")
            tasks_por_marca.setdefault(m, []).append(t)

        # Cargar máquinas activas
        q = "SELECT * FROM maquinas WHERE activa = 1"
        params: list = []
        if maquina_id:
            q += " AND id = ?"
            params.append(maquina_id)
        maquinas = [dict(r) for r in conn.execute(q, params).fetchall()]

        for maq in maquinas:
            horo = maq["horometro_actual"] or 0
            marca_maq = maq.get("marca", "ORTECO")

            # Solo procesar tareas que correspondan a la marca de la máquina
            tasks = tasks_por_marca.get(marca_maq, [])

            for task in tasks:
                intervalo = task["intervalo_horas"]
                code = task["code"]

                # Buscar último mantenimiento completado para esta tarea en esta máquina
                last_log = conn.execute(
                    "SELECT horometro_at, due_hours FROM maquinaria_maintenance_logs "
                    "WHERE maquina_id = ? AND task_code = ? "
                    "ORDER BY due_hours DESC LIMIT 1",
                    [maq["id"], code],
                ).fetchone()

                if last_log:
                    last_due = last_log["due_hours"]
                    # Siguiente umbral es el siguiente múltiplo del intervalo DESPUÉS del último completado
                    next_due = last_due + intervalo
                else:
                    # Nunca se ha hecho: el primer umbral es el primer múltiplo >= intervalo
                    # pero considerando el horómetro inicial
                    next_due = intervalo  # Primer umbral absoluto

                is_due = horo >= next_due

                if not is_due:
                    continue

                # ¿Cuántas veces atrasada?
                veces_atrasada = max(1, floor((horo - next_due) / intervalo) + 1) if horo > next_due else 1

                # ¿Ya notificado esta semana?
                notified = conn.execute(
                    "SELECT id FROM maquinaria_notification_log "
                    "WHERE maquina_id = ? AND task_code = ? AND week_iso = ?",
                    [maq["id"], code, week],
                ).fetchone()

                # ── Buscar responsable asignado a la máquina ──
                responsable_nombre = None
                responsable_telefono = None
                fuente_contacto = None

                resp_id = maq.get("responsable_id")
                if resp_id:
                    resp = conn.execute(
                        "SELECT (nombre || ' ' || COALESCE(apellidos, '')) AS nombre, telefono "
                        "FROM empleados WHERE id = ? AND estado = 'activo'",
                        [resp_id],
                    ).fetchone()
                    if resp:
                        responsable_nombre = resp["nombre"]
                        responsable_telefono = resp["telefono"]
                        fuente_contacto = "responsable"

                # ── Fallback: token + contacto operario ──
                token_info = conn.execute(
                    "SELECT t.id AS token_id, t.token, t.operario_nombre, "
                    "c.telefono, c.canal_preferido, c.notificaciones_activas "
                    "FROM maquinaria_tokens t "
                    "LEFT JOIN maquinaria_operario_contacto c ON c.token_id = t.id "
                    "WHERE t.maquina_id = ? AND t.activo = 1 "
                    "ORDER BY t.created_at DESC LIMIT 1",
                    [maq["id"]],
                ).fetchone()

                if not fuente_contacto and token_info and token_info["telefono"]:
                    responsable_nombre = token_info["operario_nombre"]
                    responsable_telefono = token_info["telefono"]
                    fuente_contacto = "token_contacto"

                results.append({
                    "maquina_id": maq["id"],
                    "maquina_nombre": maq["nombre"],
                    "maquina_internal_id": maq["internal_id"],
                    "maquina_marca": marca_maq,
                    "horometro_actual": horo,
                    "task_code": code,
                    "task_nombre": task["nombre"],
                    "task_descripcion": task["descripcion"],
                    "intervalo_horas": intervalo,
                    "requires_workshop": bool(task["requires_workshop"]),
                    "next_due_hours": next_due,
                    "veces_atrasada": veces_atrasada,
                    "is_due": True,
                    "already_notified_this_week": notified is not None,
                    "token": dict(token_info) if token_info else None,
                    "responsable_nombre": responsable_nombre,
                    "responsable_telefono": responsable_telefono,
                    "fuente_contacto": fuente_contacto,
                })

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Envío de notificaciones                                                ██
# ═══════════════════════════════════════════════════════════════════════════════

def _build_notification_message(item: dict) -> str:
    """Construye el mensaje de WhatsApp/SMS para una tarea due.

    Genera un link a la revisión combinada (/w/<token>/revision?due=N)
    que incluirá automáticamente todas las tareas cuyo intervalo sea
    divisor del umbral due (cascading).
    """
    maq = item["maquina_nombre"]
    task = item["task_nombre"]
    horo = item["horometro_actual"]
    due = item["next_due_hours"]
    workshop = " ⚠️ *REQUIERE TALLER AUTORIZADO*" if item["requires_workshop"] else ""

    token = item.get("token", {}) or {}
    token_str = token.get("token", "")
    marca = item.get("maquina_marca", "ORTECO")

    # Calcular qué intervalos incluirá la revisión combinada (según marca)
    intervalos = calcular_intervalos_cascada(due, marca)
    if len(intervalos) > 1:
        intervalos_str = " + ".join(f"{i}h" for i in intervalos)
        link = f"{ERP_BASE_URL}/w/{token_str}/revision?machine={item['maquina_id']}&due={int(due)}"
        tarea_info = f"*Revisión combinada:* {intervalos_str}"
    else:
        link = f"{ERP_BASE_URL}/w/{token_str}/revision?machine={item['maquina_id']}&due={int(due)}"
        tarea_info = f"*Tarea:* {task}"

    msg = (
        f"🔧 *Mantenimiento pendiente*\n\n"
        f"*Máquina:* {maq}\n"
        f"{tarea_info}\n"
        f"*Horómetro actual:* {horo:.0f}h (toca a las {due:.0f}h)\n"
        f"{workshop}\n\n"
        f"Completa el mantenimiento aquí:\n{link}"
    )
    return msg.strip()


def _normalizar_telefono(telefono: str) -> str:
    """Normaliza un número de teléfono al formato E.164 sin el '+'.

    Meta Cloud API acepta números en formato E.164 sin el símbolo '+'.
    Ejemplos:
      "+34 612 345 678" → "34612345678"
      "0034 612345678"  → "34612345678"
      "612345678"       → "34612345678"  (asume España)
    """
    import re
    digits = re.sub(r"\D", "", telefono)
    if digits.startswith("0034"):
        digits = digits[2:]       # quitar el 00
    if digits.startswith("34") and len(digits) == 11:
        return digits             # ya tiene prefijo ES
    if len(digits) == 9:
        return "34" + digits      # añadir prefijo ES
    return digits                 # devolver tal cual si formato desconocido


def _send_whatsapp(to: str, body: str) -> tuple[bool, str]:
    """Envía un mensaje de texto libre por Meta Cloud API (solo para ventana 24h).

    Returns (success, message_id_or_error).
    """
    import urllib.request
    import json as _json

    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        logger.warning("Meta Cloud API no configurada — token o phone_id vacíos")
        return False, "META_NOT_CONFIGURED"

    url = f"https://graph.facebook.com/v19.0/{META_WA_PHONE_ID}/messages"
    payload = _json.dumps({
        "messaging_product": "whatsapp",
        "to": _normalizar_telefono(to),
        "type": "text",
        "text": {"body": body},
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {META_WA_TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = _json.loads(resp.read())
        msg_id = data.get("messages", [{}])[0].get("id", "")
        logger.info("WhatsApp enviado a %s — msg_id: %s", to, msg_id)
        return True, msg_id
    except urllib.error.HTTPError as e:
        body_err = e.read().decode(errors="replace")
        logger.error("Meta API HTTP %s enviando a %s: %s", e.code, to, body_err)
        return False, f"HTTP_{e.code}: {body_err[:200]}"
    except Exception as e:
        logger.error("Error enviando WhatsApp a %s: %s", to, e)
        return False, str(e)


def _send_whatsapp_template(to: str, template_name: str, lang: str,
                             components: list | None = None) -> tuple[bool, str]:
    """Envía un mensaje usando una plantilla aprobada por Meta.

    Las plantillas son obligatorias para mensajes proactivos (fuera de ventana 24h).
    Returns (success, message_id_or_error).
    """
    import urllib.request
    import json as _json

    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        logger.warning("Meta Cloud API no configurada — token o phone_id vacíos")
        return False, "META_NOT_CONFIGURED"

    url = f"https://graph.facebook.com/v19.0/{META_WA_PHONE_ID}/messages"
    tmpl: dict = {"name": template_name, "language": {"code": lang}}
    if components:
        tmpl["components"] = components
    payload = _json.dumps({
        "messaging_product": "whatsapp",
        "to": _normalizar_telefono(to),
        "type": "template",
        "template": tmpl,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {META_WA_TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = _json.loads(resp.read())
        msg_id = data.get("messages", [{}])[0].get("id", "")
        logger.info("WhatsApp template '%s' enviado a %s — msg_id: %s", template_name, to, msg_id)
        return True, msg_id
    except urllib.error.HTTPError as e:
        body_err = e.read().decode(errors="replace")
        logger.error("Meta template HTTP %s enviando a %s: %s", e.code, to, body_err)
        return False, f"HTTP_{e.code}: {body_err[:200]}"
    except Exception as e:
        logger.error("Error enviando template WhatsApp a %s: %s", to, e)
        return False, str(e)


def _log_notification(maquina_id: int, task_code: str, week: str,
                      token_id: int | None, canal: str, mensaje: str,
                      estado: str, external_id: str) -> int:
    """Registra la notificación en el log (anti-spam por UNIQUE constraint)."""
    with _conectar() as conn:
        try:
            conn.execute(
                "INSERT INTO maquinaria_notification_log "
                "(maquina_id, task_code, week_iso, token_id, canal, mensaje, estado, external_id, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [maquina_id, task_code, week, token_id, canal, mensaje, estado, external_id, _now()],
            )
            return conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        except Exception as e:
            # UNIQUE constraint violation = ya se envió esta semana
            logger.debug("Notificación duplicada ignorada: %s/%s/%s — %s", maquina_id, task_code, week, e)
            return 0


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Scheduler: ejecutar ciclo completo de notificaciones                   ██
# ═══════════════════════════════════════════════════════════════════════════════

def ejecutar_ciclo_notificaciones(dry_run: bool = False) -> dict:
    """Ejecuta un ciclo completo: calcula tareas due, envía notificaciones.

    Args:
        dry_run: Si True, calcula pero no envía ni registra. Para testing.

    Returns:
        Resumen con conteos de tareas due, notificaciones enviadas, etc.
    """
    week = _get_week_iso()
    logger.info("=== Ciclo de notificaciones — semana %s (dry_run=%s) ===", week, dry_run)

    dues = calcular_tareas_due()
    resumen = {
        "semana": week,
        "dry_run": dry_run,
        "tareas_due_total": len(dues),
        "ya_notificadas": 0,
        "sin_contacto": 0,
        "notificaciones_off": 0,
        "enviadas_whatsapp": 0,
        "enviadas_sms": 0,
        "fallidas": 0,
        "detalles": [],
    }

    for item in dues:
        token = item.get("token") or {}
        detail = {
            "maquina": item["maquina_nombre"],
            "tarea": item["task_code"],
            "due_hours": item["next_due_hours"],
            "horometro": item["horometro_actual"],
        }

        # Skip si ya notificado esta semana
        if item["already_notified_this_week"]:
            resumen["ya_notificadas"] += 1
            detail["resultado"] = "ya_notificada_esta_semana"
            resumen["detalles"].append(detail)
            continue

        # Determinar teléfono destino: responsable tiene prioridad sobre token
        responsable_tel = item.get("responsable_telefono")
        token_tel = token.get("telefono") if token else None
        telefono = responsable_tel or token_tel

        # Skip si no hay teléfono configurado
        if not telefono:
            resumen["sin_contacto"] += 1
            detail["resultado"] = "sin_contacto"
            detail["fuente"] = item.get("fuente_contacto")
            resumen["detalles"].append(detail)
            continue

        # Skip si notificaciones desactivadas (solo aplica a token_contacto)
        if not responsable_tel and not token.get("notificaciones_activas", 1):
            resumen["notificaciones_off"] += 1
            detail["resultado"] = "notificaciones_desactivadas"
            resumen["detalles"].append(detail)
            continue

        # Construir mensaje
        mensaje = _build_notification_message(item)
        canal = "whatsapp"

        if dry_run:
            detail["resultado"] = "dry_run"
            detail["mensaje"] = mensaje
            detail["canal"] = canal
            detail["telefono"] = telefono
            resumen["detalles"].append(detail)
            continue

        # Intentar con plantilla aprobada (obligatoria para mensajes proactivos)
        ok, ext_id = _send_whatsapp_template(
            telefono, META_WA_TEMPLATE, META_WA_TEMPLATE_LANG,
            components=[{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": item["maquina_nombre"]},
                    {"type": "text", "text": item["task_nombre"]},
                    {"type": "text", "text": str(int(item["next_due_hours"]))},
                ],
            }],
        )
        # Fallback a texto libre si la plantilla falla (ej. ventana 24h abierta)
        if not ok:
            logger.info("Template falló para %s — intentando texto libre", telefono)
            ok, ext_id = _send_whatsapp(telefono, mensaje)

        if ok:
            resumen["enviadas_whatsapp"] += 1
        else:
            resumen["fallidas"] += 1

        estado = "enviado" if ok else "fallido"
        _log_notification(
            item["maquina_id"], item["task_code"], week,
            token.get("token_id"), canal, mensaje, estado, ext_id,
        )

        detail["resultado"] = estado
        detail["canal"] = canal
        detail["telefono"] = telefono
        detail["external_id"] = ext_id
        resumen["detalles"].append(detail)

    enviadas = resumen["enviadas_whatsapp"] + resumen["enviadas_sms"]
    logger.info(
        "Ciclo completado: %d due, %d enviadas, %d ya notificadas, %d sin contacto, %d fallidas",
        resumen["tareas_due_total"], enviadas,
        resumen["ya_notificadas"], resumen["sin_contacto"], resumen["fallidas"],
    )
    return resumen


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CRUD helpers para contacto operario                                    ██
# ═══════════════════════════════════════════════════════════════════════════════

def guardar_contacto_operario(token_id: int, telefono: str,
                              canal: str = "whatsapp", email: str = "") -> dict:
    """Crea o actualiza el contacto del operario asociado a un token."""
    with _conectar() as conn:
        existing = conn.execute(
            "SELECT id FROM maquinaria_operario_contacto WHERE token_id = ?", [token_id]
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE maquinaria_operario_contacto SET telefono = ?, canal_preferido = ?, "
                "email = ?, updated_at = ? WHERE token_id = ?",
                [telefono, canal, email, _now(), token_id],
            )
        else:
            conn.execute(
                "INSERT INTO maquinaria_operario_contacto "
                "(token_id, telefono, canal_preferido, email, notificaciones_activas, created_at) "
                "VALUES (?, ?, ?, ?, 1, ?)",
                [token_id, telefono, canal, email, _now()],
            )
        return dict(conn.execute(
            "SELECT * FROM maquinaria_operario_contacto WHERE token_id = ?", [token_id]
        ).fetchone())


def toggle_notificaciones(token_id: int, activas: bool) -> dict:
    """Activa/desactiva notificaciones para un operario."""
    with _conectar() as conn:
        conn.execute(
            "UPDATE maquinaria_operario_contacto SET notificaciones_activas = ?, updated_at = ? "
            "WHERE token_id = ?",
            [1 if activas else 0, _now(), token_id],
        )
        row = conn.execute(
            "SELECT * FROM maquinaria_operario_contacto WHERE token_id = ?", [token_id]
        ).fetchone()
        return dict(row) if row else {}


def listar_notification_log(maquina_id: int | None = None, limit: int = 50) -> list:
    """Lista el historial de notificaciones enviadas."""
    with _conectar() as conn:
        q = ("SELECT nl.*, m.nombre AS maquina_nombre, mt.nombre AS task_nombre "
             "FROM maquinaria_notification_log nl "
             "JOIN maquinas m ON m.id = nl.maquina_id "
             "LEFT JOIN maquinaria_maintenance_tasks mt ON mt.code = nl.task_code "
             "WHERE 1=1")
        params: list = []
        if maquina_id:
            q += " AND nl.maquina_id = ?"
            params.append(maquina_id)
        q += f" ORDER BY nl.created_at DESC LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CRUD maintenance logs (completar tarea)                                ██
# ═══════════════════════════════════════════════════════════════════════════════

def completar_mantenimiento(maquina_id: int, task_code: str, due_hours: float,
                            horometro_at: float, operario_nombre: str = "",
                            token_id: int | None = None,
                            observaciones: str = "",
                            checklist_result: dict | None = None) -> dict:
    """Registra un mantenimiento completado para una tarea específica."""
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_maintenance_logs "
            "(maquina_id, task_code, horometro_at, due_hours, operario_nombre, token_id, "
            "observaciones, checklist_result, completed_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [maquina_id, task_code, horometro_at, due_hours,
             operario_nombre, token_id, observaciones,
             json.dumps(checklist_result) if checklist_result else None,
             _now(), _now()],
        )
        lid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute(
            "SELECT * FROM maquinaria_maintenance_logs WHERE id = ?", [lid]
        ).fetchone())


def listar_maintenance_logs(maquina_id: int | None = None,
                            task_code: str | None = None,
                            limit: int = 50) -> list:
    """Lista logs de mantenimiento completados."""
    with _conectar() as conn:
        q = ("SELECT ml.*, m.nombre AS maquina_nombre, mt.nombre AS task_nombre "
             "FROM maquinaria_maintenance_logs ml "
             "JOIN maquinas m ON m.id = ml.maquina_id "
             "LEFT JOIN maquinaria_maintenance_tasks mt ON mt.code = ml.task_code "
             "WHERE 1=1")
        params: list = []
        if maquina_id:
            q += " AND ml.maquina_id = ?"
            params.append(maquina_id)
        if task_code:
            q += " AND ml.task_code = ?"
            params.append(task_code)
        q += f" ORDER BY ml.completed_at DESC LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def obtener_task_by_code(code: str) -> dict | None:
    """Obtiene una tarea de mantenimiento por su código."""
    with _conectar() as conn:
        row = conn.execute(
            "SELECT * FROM maquinaria_maintenance_tasks WHERE code = ?", [code]
        ).fetchone()
        return dict(row) if row else None
