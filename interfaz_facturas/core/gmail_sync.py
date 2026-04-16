"""
gmail_sync.py — Fase 3: Sincronización Gmail → CRM (on-demand, readonly).

Diseño:
  - OAuth2 con scope gmail.readonly. Tokens en variables de entorno.
  - Por empresa: busca hilos por dominio + emails de contactos conocidos.
  - Solo guarda metadata (threadId, subject, date, participants, snippet ≤200 chars).
  - Genera resumen ≤5 líneas via LLM solo si hay cambios desde last_sync.
  - No guarda contenido completo del email.
  - Límite: 10 hilos por empresa, 20 empresas por run global.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Intentar importar dependencias Google ─────────────────────────────────────
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    _GOOGLE_LIBS_OK = True
except ImportError:
    _GOOGLE_LIBS_OK = False
    logger.warning(
        "Librerías Google no instaladas. Ejecuta: "
        "pip install google-auth google-auth-oauthlib google-api-python-client"
    )

# ── Config desde entorno ───────────────────────────────────────────────────────
GMAIL_CLIENT_ID     = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
GMAIL_ACCOUNT       = os.getenv("GMAIL_ACCOUNT", "direccion@hincadodirecto.com")
CRM_GMAIL_BATCH_SIZE = int(os.getenv("CRM_GMAIL_BATCH_SIZE", "20"))
CRM_GMAIL_MAX_THREADS = int(os.getenv("CRM_GMAIL_MAX_THREADS", "10"))

_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


# ── Auth ───────────────────────────────────────────────────────────────────────

def _get_credentials() -> "Credentials":
    """Devuelve credenciales válidas, refrescando el access_token si hace falta."""
    if not _GOOGLE_LIBS_OK:
        raise RuntimeError("Librerías Google no instaladas.")
    if not all([GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN]):
        raise RuntimeError(
            "Faltan variables de entorno: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN. "
            "Ejecuta: python scripts/gmail_oauth_setup.py"
        )
    creds = Credentials(
        token=None,
        refresh_token=GMAIL_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GMAIL_CLIENT_ID,
        client_secret=GMAIL_CLIENT_SECRET,
        scopes=_SCOPES,
    )
    # Refrescar si el token está expirado (se hace automáticamente)
    if not creds.valid:
        creds.refresh(Request())
    return creds


def _build_service():
    """Construye el cliente Gmail API."""
    return build("gmail", "v1", credentials=_get_credentials(), cache_discovery=False)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _ts_to_date(ts_ms: str | int | None) -> str:
    """Convierte timestamp Gmail (ms epoch) a fecha ISO."""
    if not ts_ms:
        return ""
    try:
        dt = datetime.fromtimestamp(int(ts_ms) / 1000, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _inferir_direccion_gmail(from_addr: str | None) -> str:
    """Deduce 'in'/'out' comparando el remitente con nuestro dominio.

    Conservador: si no podemos determinarlo, devolvemos 'in'. El query de
    Gmail ya filtra a hilos que involucran a la empresa objetivo, así que
    cualquier mensaje cuyo From no sea nuestro tiende a ser entrante.
    """
    if not from_addr:
        return "in"
    our_account = (GMAIL_ACCOUNT or "").strip().lower()
    our_domain = our_account.rsplit("@", 1)[-1] if "@" in our_account else our_account
    addr = from_addr.lower()
    if our_account and our_account in addr:
        return "out"
    if our_domain and ("@" + our_domain) in addr:
        return "out"
    return "in"


def _clean_snippet(snippet: str) -> str:
    """Limpia el snippet de Gmail (entidades HTML, espacios)."""
    if not snippet:
        return ""
    snippet = re.sub(r"&amp;", "&", snippet)
    snippet = re.sub(r"&lt;", "<", snippet)
    snippet = re.sub(r"&gt;", ">", snippet)
    snippet = re.sub(r"&quot;", '"', snippet)
    snippet = re.sub(r"&#39;", "'", snippet)
    snippet = re.sub(r"\s+", " ", snippet).strip()
    return snippet[:200]


def _build_query(empresa: dict, contactos: list[dict]) -> str | None:
    """Construye la query Gmail para una empresa buscando SOLO por email de contacto.

    Decisión de diseño: NO buscamos por dominio corporativo (@acme.com) porque
    eso traería emails de operaciones, administración, técnicos, etc. — ruido
    que no pertenece al CRM comercial.

    Solo se indexan hilos con contactos explícitamente añadidos a la empresa
    en el CRM, que por definición son los interlocutores comerciales
    (decisores de venta/compra). Si una empresa no tiene contactos con email,
    el sync la salta: señal de que aún no tenemos un interlocutor identificado.

    Emails en dominios genéricos (gmail, hotmail…) se omiten del auto-sync
    y deben registrarse manualmente.
    """
    _DOMINIOS_GENERICOS: set[str] = {
        "gmail.com", "googlemail.com",
        "hotmail.com", "hotmail.es", "hotmail.co.uk",
        "outlook.com", "outlook.es",
        "live.com", "live.es",
        "yahoo.com", "yahoo.es",
        "icloud.com", "me.com", "mac.com",
        "msn.com",
    }

    parts = []
    for c in contactos:
        email = (c.get("email") or "").strip().lower()
        if not email:
            continue
        email_dominio = email.split("@")[-1] if "@" in email else ""
        if email_dominio in _DOMINIOS_GENERICOS:
            logger.debug(
                "Contacto %s tiene email genérico (%s) — omitido del auto-sync. "
                "Registra la interacción manualmente.",
                email, email_dominio,
            )
            continue
        parts.append(f"(from:{email} OR to:{email})")

    if not parts:
        logger.info(
            "Empresa '%s' sin contactos comerciales con email corporativo — omitida del auto-sync.",
            empresa.get("nombre"),
        )
        return None

    return " OR ".join(parts)


def _after_date_filter(dias_atras: int | None) -> str:
    """Devuelve el fragmento 'after:YYYY/MM/DD' para limitar el lookback de Gmail.
    Si dias_atras es None o 0 no añade filtro (busca en todo el historial).
    """
    if not dias_atras or dias_atras <= 0:
        return ""
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=dias_atras)
    return f" after:{cutoff.strftime('%Y/%m/%d')}"


# ── Sync por empresa ───────────────────────────────────────────────────────────

def sync_empresa(
    empresa: dict,
    contactos: list[dict],
    service=None,
    max_threads: int = CRM_GMAIL_MAX_THREADS,
    dias_atras: int | None = None,
) -> list[dict]:
    """
    Busca hilos Gmail para una empresa y devuelve lista de metadatos.
    No escribe en la BD — eso lo hace el llamador.

    Returns:
        Lista de dicts con keys:
          gmail_thread_id, subject, date, participants, snippet, empresa_id
    """
    if service is None:
        service = _build_service()

    query = _build_query(empresa, contactos)
    if not query:
        logger.info("Empresa %s sin dominio ni emails de contacto — omitida", empresa.get("nombre"))
        return []

    query += _after_date_filter(dias_atras)

    try:
        resp = service.users().threads().list(
            userId="me",
            q=query,
            maxResults=max_threads,
        ).execute()
    except Exception as exc:
        logger.error("Error buscando hilos para empresa %s: %s", empresa.get("nombre"), exc)
        return []

    threads_meta = resp.get("threads", [])
    results = []

    for t in threads_meta:
        thread_id = t["id"]
        try:
            # Obtener solo metadata del último mensaje del hilo
            thread = service.users().threads().get(
                userId="me",
                id=thread_id,
                format="metadata",
                metadataHeaders=["Subject", "From", "To", "Date"],
            ).execute()
        except Exception as exc:
            logger.warning("Error leyendo hilo %s: %s", thread_id, exc)
            continue

        messages = thread.get("messages", [])
        if not messages:
            continue

        # Tomamos el último mensaje del hilo
        last_msg = messages[-1]
        headers = last_msg.get("payload", {}).get("headers", [])
        snippet = _clean_snippet(last_msg.get("snippet", ""))
        ts = last_msg.get("internalDate")

        subject = _header(headers, "Subject") or "(sin asunto)"
        from_addr = _header(headers, "From")
        to_addr = _header(headers, "To")
        date_str = _ts_to_date(ts)

        participants = ", ".join(filter(None, [from_addr, to_addr]))[:200]

        results.append({
            "gmail_thread_id": thread_id,
            "subject": subject,
            "date": date_str,
            "participants": participants,
            "from_addr": from_addr,
            "to_addr": to_addr,
            "snippet": snippet,
            "empresa_id": empresa["id"],
            "num_messages": len(messages),
        })

    logger.info(
        "Empresa '%s': %d hilo(s) encontrados (query: %s...)",
        empresa.get("nombre"), len(results), query[:60]
    )
    return results


# ── Resumen LLM ────────────────────────────────────────────────────────────────

def resumir_hilo(subject: str, snippet: str, empresa_nombre: str) -> str:
    """
    Genera un resumen corto (≤5 líneas) del último hilo usando el LLM existente.
    Solo se llama si hay cambios desde el último sync.
    """
    try:
        from config import client as openai_client
        if not openai_client:
            return snippet[:200]
        prompt = (
            f"Eres asistente de CRM de una empresa de instalación solar (Hincado Directo).\n"
            f"Resume en máximo 3 líneas la última interacción con '{empresa_nombre}' "
            f"basándote en este email:\n\n"
            f"Asunto: {subject}\n"
            f"Extracto: {snippet}\n\n"
            f"Responde en español, sin inventar información no presente en el texto."
        )
        resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("Error generando resumen LLM: %s", exc)
        return snippet[:200]


# ── Guardar en BD ──────────────────────────────────────────────────────────────

def guardar_hilo_como_interaccion(
    hilo: dict,
    empresa_id: int,
    generar_resumen: bool = True,
    empresa_nombre: str = "",
) -> dict | None:
    """
    Guarda un hilo Gmail como crm_interaccion si no existe ya.
    Idempotente por gmail_thread_id + empresa_id.
    """
    from core.db import conectar
    from core.crm_db import init_crm_db
    init_crm_db()

    thread_id = hilo["gmail_thread_id"]
    snippet = hilo.get("snippet", "")
    subject = hilo.get("subject", "(sin asunto)")
    date = hilo.get("date", "")

    with conectar() as conn:
        # Idempotencia: no duplicar
        existing = conn.execute(
            "SELECT id FROM crm_interacciones WHERE gmail_thread_id = ? AND empresa_id = ?",
            (thread_id, empresa_id)
        ).fetchone()
        if existing:
            return None  # ya existe

        descripcion = snippet
        if generar_resumen and snippet:
            descripcion = resumir_hilo(subject, snippet, empresa_nombre)

        from datetime import datetime as dt_
        ahora = dt_.utcnow().strftime("%Y-%m-%dT%H:%M:%S")

        direccion = _inferir_direccion_gmail(hilo.get("from_addr"))

        conn.execute("""
            INSERT INTO crm_interacciones
                (empresa_id, tipo, asunto, descripcion, fecha, source,
                 gmail_thread_id, gmail_snippet, creado_por, fecha_creacion, direccion)
            VALUES (?, 'email', ?, ?, ?, 'gmail', ?, ?, 'gmail_sync', ?, ?)
        """, (
            empresa_id,
            subject[:255],
            descripcion,
            date or ahora[:10],
            thread_id,
            snippet,
            ahora,
            direccion,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Hook motor de seguimiento — nunca debe romper la sync.
        try:
            from core import crm_seguimiento
            crm_seguimiento.recalcular_seguimiento_empresa(empresa_id, conn)
        except Exception as exc:
            logger.warning("crm_seguimiento hook (gmail_sync) falló: %s", exc)

        return {"id": new_id, "gmail_thread_id": thread_id, "asunto": subject, "direccion": direccion}


# ── Job global (batch) ────────────────────────────────────────────────────────

def sync_global_batch(
    batch_size: int = CRM_GMAIL_BATCH_SIZE,
    solo_con_dominio: bool = False,
    dias_atras: int | None = None,
) -> dict[str, Any]:
    """
    Sync global: procesa hasta `batch_size` empresas con dominio o contactos con email.
    Diseñado para ejecución manual (botón admin) 1-2 veces al día.

    Returns: resumen de la operación.
    """
    from core.db import conectar
    from core.crm_db import init_crm_db, listar_contactos
    init_crm_db()

    service = _build_service()

    with conectar() as conn:
        # Priorizar empresas con dominio; luego las que tienen contactos con email
        if solo_con_dominio:
            empresas = conn.execute("""
                SELECT * FROM crm_empresas
                WHERE activo = 1 AND dominio IS NOT NULL AND dominio != ''
                ORDER BY nombre
                LIMIT ?
            """, (batch_size,)).fetchall()
        else:
            empresas = conn.execute("""
                SELECT DISTINCT e.*
                FROM crm_empresas e
                WHERE e.activo = 1
                  AND (
                    (e.dominio IS NOT NULL AND e.dominio != '')
                    OR EXISTS (
                        SELECT 1 FROM crm_contactos c
                        WHERE c.empresa_vinculada_id = e.id
                          AND c.email IS NOT NULL AND c.email != ''
                          AND c.activo = 1
                    )
                  )
                ORDER BY e.nombre
                LIMIT ?
            """, (batch_size,)).fetchall()

    stats = {
        "empresas_procesadas": 0,
        "hilos_encontrados": 0,
        "interacciones_creadas": 0,
        "errores": [],
    }

    for emp_row in empresas:
        emp = dict(emp_row)
        empresa_id = emp["id"]
        try:
            contactos_data = listar_contactos(empresa_id=empresa_id)
            contactos = contactos_data.get("contactos", [])
            hilos = sync_empresa(emp, contactos, service=service, dias_atras=dias_atras)
            stats["hilos_encontrados"] += len(hilos)
            stats["empresas_procesadas"] += 1
            for h in hilos:
                # Solo resumir el hilo más reciente (primero en la lista)
                generar_res = (h == hilos[0])
                result = guardar_hilo_como_interaccion(
                    h, empresa_id,
                    generar_resumen=generar_res,
                    empresa_nombre=emp.get("nombre", ""),
                )
                if result:
                    stats["interacciones_creadas"] += 1
        except Exception as exc:
            msg = f"{emp.get('nombre')}: {exc}"
            logger.error("Error en sync_global empresa %s: %s", empresa_id, exc)
            stats["errores"].append(msg)

    return stats


# ── Preview (dry-run) ─────────────────────────────────────────────────────────

def preview_global_batch(
    batch_size: int = CRM_GMAIL_BATCH_SIZE,
    dias_atras: int | None = None,
) -> list[dict[str, Any]]:
    """Busca hilos Gmail que SE IMPORTARÍAN pero NO escribe nada en la BD.

    Devuelve lista de dicts con:
        gmail_thread_id, empresa_id, empresa_nombre,
        asunto, fecha, snippet, from_addr, ya_existe (bool)
    """
    from core.db import conectar
    from core.crm_db import init_crm_db, listar_contactos
    init_crm_db()

    service = _build_service()

    with conectar() as conn:
        empresas = conn.execute("""
            SELECT DISTINCT e.*
            FROM crm_empresas e
            WHERE e.activo = 1
              AND EXISTS (
                SELECT 1 FROM crm_contactos c
                WHERE c.empresa_vinculada_id = e.id
                  AND c.email IS NOT NULL AND c.email != ''
                  AND c.activo = 1
              )
            ORDER BY e.nombre
            LIMIT ?
        """, (batch_size,)).fetchall()

    resultados = []
    for emp_row in empresas:
        emp = dict(emp_row)
        empresa_id = emp["id"]
        empresa_nombre = emp.get("nombre", "")
        try:
            contactos_data = listar_contactos(empresa_id=empresa_id)
            contactos = contactos_data.get("contactos", [])
            hilos = sync_empresa(emp, contactos, service=service, dias_atras=dias_atras)
            for h in hilos:
                # Comprobar si ya existe en BD (sin escribir)
                from core.db import conectar as _con
                with _con() as conn2:
                    ya = conn2.execute(
                        "SELECT id FROM crm_interacciones WHERE gmail_thread_id = ? AND empresa_id = ?",
                        (h["gmail_thread_id"], empresa_id)
                    ).fetchone()
                resultados.append({
                    "gmail_thread_id": h["gmail_thread_id"],
                    "empresa_id":      empresa_id,
                    "empresa_nombre":  empresa_nombre,
                    "asunto":          h.get("subject", "(sin asunto)"),
                    "fecha":           h.get("date", ""),
                    "snippet":         h.get("snippet", ""),
                    "from_addr":       h.get("from_addr", ""),
                    "ya_existe":       ya is not None,
                })
        except Exception as exc:
            logger.error("Error preview empresa %s: %s", empresa_id, exc)

    return resultados


def import_selective(
    threads: list[dict[str, Any]],
) -> dict[str, Any]:
    """Importa solo los hilos indicados (por gmail_thread_id + empresa_id).

    Args:
        threads: lista de {gmail_thread_id, empresa_id, asunto, fecha,
                           snippet, from_addr, empresa_nombre}

    Returns: resumen {importados, ya_existian, errores}
    """
    from core.db import conectar
    from core.crm_db import init_crm_db
    init_crm_db()

    stats = {"importados": 0, "ya_existian": 0, "errores": []}

    for t in threads:
        thread_id   = t.get("gmail_thread_id")
        empresa_id  = t.get("empresa_id")
        if not thread_id or not empresa_id:
            continue
        hilo = {
            "gmail_thread_id": thread_id,
            "subject":         t.get("asunto", "(sin asunto)"),
            "date":            t.get("fecha", ""),
            "snippet":         t.get("snippet", ""),
            "from_addr":       t.get("from_addr", ""),
        }
        try:
            result = guardar_hilo_como_interaccion(
                hilo, empresa_id,
                generar_resumen=False,          # sin LLM en import selectivo
                empresa_nombre=t.get("empresa_nombre", ""),
            )
            if result is None:
                stats["ya_existian"] += 1
            else:
                stats["importados"] += 1
        except Exception as exc:
            logger.error("Error importando hilo %s: %s", thread_id, exc)
            stats["errores"].append(str(exc))

    return stats


# ── Check de disponibilidad ────────────────────────────────────────────────────

def gmail_disponible() -> dict[str, Any]:
    """Devuelve estado del módulo Gmail para el frontend."""
    if not _GOOGLE_LIBS_OK:
        return {
            "disponible": False,
            "motivo": "Librerías Google no instaladas. Ejecuta: pip install google-auth google-auth-oauthlib google-api-python-client",
        }
    if not all([GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN]):
        faltantes = [k for k, v in {
            "GMAIL_CLIENT_ID": GMAIL_CLIENT_ID,
            "GMAIL_CLIENT_SECRET": GMAIL_CLIENT_SECRET,
            "GMAIL_REFRESH_TOKEN": GMAIL_REFRESH_TOKEN,
        }.items() if not v]
        return {
            "disponible": False,
            "motivo": f"Variables de entorno no configuradas: {', '.join(faltantes)}",
        }
    return {"disponible": True, "cuenta": GMAIL_ACCOUNT}
