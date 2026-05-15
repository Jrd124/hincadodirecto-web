"""Gmail actions — Fase B copiloto IA.

Módulo aislado que ejecuta acciones de escritura sobre Gmail (crear borradores).
Está separado de ``core/gmail_sync.py`` (que solo lee) para mantener clara la
frontera entre los scopes de OAuth y para minimizar la superficie de error de
las acciones que modifican el buzón del usuario.

Diseño:
    - Reutiliza ``_get_credentials()`` de gmail_sync (mismos client_id/secret y
      refresh_token, ahora con scope ``gmail.compose`` añadido).
    - Construye mensajes MIME RFC 2822 estándar, sin attachments en Fase B.
    - Si el draft responde a un hilo (``in_reply_to_thread_id``), se incluyen
      los headers ``In-Reply-To`` / ``References`` y el ``threadId`` para que
      Gmail los muestre dentro de la conversación correcta.
    - NO envía emails. Solo crea borradores. El envío llega en Fase C.
"""
from __future__ import annotations

import base64
import logging
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Any

logger = logging.getLogger(__name__)

# Reusamos el setup OAuth y el helper de servicio de gmail_sync.
try:
    from core import gmail_sync as _gs
except ImportError:  # pragma: no cover
    from interfaz_facturas.core import gmail_sync as _gs


# ─────────────────────────────────────────────────────────────────────────────
# Construcción del MIME
# ─────────────────────────────────────────────────────────────────────────────

def _construir_mime(
    *,
    from_addr: str,
    from_name: str | None,
    to: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    in_reply_to_message_id: str | None = None,
    references: list[str] | None = None,
) -> str:
    """Crea un mensaje MIME serializado en base64url, listo para Gmail API.

    Devuelve el ``raw`` esperado por ``users.drafts.create``.
    """
    msg = EmailMessage()
    msg["From"] = formataddr((from_name or "", from_addr))
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    if bcc:
        msg["Bcc"] = ", ".join(bcc)
    msg["Subject"] = subject

    # Si es respuesta a un hilo, los headers In-Reply-To / References enlazan
    # el draft a la conversación. Sin ellos, Gmail crea un hilo nuevo aunque
    # le pasemos threadId.
    if in_reply_to_message_id:
        msg["In-Reply-To"] = in_reply_to_message_id
    if references:
        msg["References"] = " ".join(references)

    # Message-ID propio para que Gmail / clientes lo respeten.
    msg["Message-ID"] = make_msgid(domain=from_addr.split("@", 1)[-1] or "localhost")

    msg.set_content(body, subtype="plain", charset="utf-8")

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
    return raw


# ─────────────────────────────────────────────────────────────────────────────
# Lookup de hilo (para respuestas)
# ─────────────────────────────────────────────────────────────────────────────

def _info_hilo_para_responder(service, thread_id: str) -> dict | None:
    """Obtiene el último Message-ID y la cadena References de un hilo.

    Devuelve ``{"in_reply_to": "...", "references": [...], "thread_id": "..."}``
    o ``None`` si el hilo no es accesible.
    """
    try:
        thread = service.users().threads().get(
            userId="me", id=thread_id, format="metadata",
            metadataHeaders=["Message-ID", "References"],
        ).execute()
    except Exception as exc:
        logger.warning("No se pudo leer hilo %s: %s", thread_id, exc)
        return None

    mensajes = thread.get("messages") or []
    if not mensajes:
        return None

    # Último mensaje del hilo (al que respondemos)
    ultimo = mensajes[-1]
    headers = ((ultimo.get("payload") or {}).get("headers")) or []

    def _h(name: str) -> str:
        for h in headers:
            if h.get("name", "").lower() == name.lower():
                return h.get("value", "").strip()
        return ""

    msg_id = _h("Message-ID") or _h("Message-Id")
    refs_str = _h("References")
    refs = refs_str.split() if refs_str else []
    if msg_id and msg_id not in refs:
        refs.append(msg_id)

    return {
        "in_reply_to": msg_id or None,
        "references": refs or None,
        "thread_id": thread_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# API pública
# ─────────────────────────────────────────────────────────────────────────────

def gmail_compose_disponible() -> dict:
    """Diagnóstico: ¿están los scopes y libs listos para crear drafts?"""
    base = _gs.gmail_disponible() if hasattr(_gs, "gmail_disponible") else {
        "disponible": False, "motivo": "gmail_sync.gmail_disponible no encontrado"
    }
    if not base.get("disponible"):
        return {**base, "compose_listo": False}
    # Si readonly funciona, compose también — usan el mismo refresh_token.
    # El usuario tiene que haber re-corrido scripts/gmail_oauth_setup.py para
    # incluir el scope gmail.compose. Si no lo hizo, la primera llamada a
    # drafts.create devolverá insufficient permissions y lo detectaremos
    # entonces.
    return {**base, "compose_listo": True}


def crear_draft_en_gmail(
    *,
    to: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    in_reply_to_thread_id: str | None = None,
    from_name: str | None = "Hincado Directo",
) -> dict:
    """Crea un draft en Gmail. NO envía.

    Devuelve dict con ``ok``, ``draft_id``, ``message_id``, ``thread_id``,
    ``permalink`` (URL Gmail) y ``raw_size``. Ante fallo lanza
    ``RuntimeError`` con motivo legible.
    """
    if not _gs._GOOGLE_LIBS_OK:
        raise RuntimeError(
            "Librerías Google no instaladas. Instala google-auth, "
            "google-auth-oauthlib y google-api-python-client."
        )

    from_addr = (
        getattr(_gs, "GMAIL_ACCOUNT", None)
        or "noreply@hincadodirecto.com"
    )
    if not to or "@" not in to:
        raise ValueError(f"Destinatario inválido: {to!r}")
    if not subject:
        raise ValueError("subject vacío")
    if not body:
        raise ValueError("body vacío")

    service = _gs._build_service()

    # Si responde a un hilo, recoger headers para encadenar correctamente.
    reply_info = None
    if in_reply_to_thread_id:
        reply_info = _info_hilo_para_responder(service, in_reply_to_thread_id)
        if reply_info is None:
            logger.info(
                "Hilo %s no encontrado o sin acceso; el draft no se enlazará al hilo.",
                in_reply_to_thread_id,
            )

    raw = _construir_mime(
        from_addr=from_addr,
        from_name=from_name,
        to=to,
        subject=subject,
        body=body,
        cc=cc,
        bcc=bcc,
        in_reply_to_message_id=(reply_info or {}).get("in_reply_to"),
        references=(reply_info or {}).get("references"),
    )

    draft_body = {"message": {"raw": raw}}
    if reply_info and reply_info.get("thread_id"):
        draft_body["message"]["threadId"] = reply_info["thread_id"]

    try:
        resp = service.users().drafts().create(userId="me", body=draft_body).execute()
    except Exception as exc:
        msg = str(exc)
        # Detectar específicamente falta de scope para dar mensaje claro.
        if "insufficient" in msg.lower() or "permission" in msg.lower():
            raise RuntimeError(
                "Gmail rechazó la operación por permisos insuficientes. "
                "Re-ejecuta scripts/gmail_oauth_setup.py para autorizar el scope "
                "gmail.compose y actualiza GMAIL_REFRESH_TOKEN en .env."
            ) from exc
        raise RuntimeError(f"Gmail API rechazó el draft: {msg}") from exc

    draft_id = resp.get("id")
    message = resp.get("message") or {}
    message_id = message.get("id")
    thread_id = message.get("threadId")

    permalink = None
    if draft_id:
        # Link directo a la lista de borradores (Gmail no expone URL de un
        # draft individual de forma estable; sí del hilo si existe).
        permalink = "https://mail.google.com/mail/u/0/#drafts"
        if thread_id:
            permalink = f"https://mail.google.com/mail/u/0/#all/{thread_id}"

    logger.info(
        "Draft Gmail creado: draft_id=%s message_id=%s thread_id=%s tamaño=%d",
        draft_id, message_id, thread_id, len(raw),
    )

    return {
        "ok": True,
        "draft_id": draft_id,
        "message_id": message_id,
        "thread_id": thread_id,
        "permalink": permalink,
        "raw_size": len(raw),
    }


def borrar_draft_en_gmail(draft_id: str) -> dict:
    """Elimina un borrador previamente creado. Útil para revertir aprobaciones."""
    if not draft_id:
        raise ValueError("draft_id vacío")
    service = _gs._build_service()
    try:
        service.users().drafts().delete(userId="me", id=draft_id).execute()
    except Exception as exc:
        raise RuntimeError(f"No se pudo borrar el draft: {exc}") from exc
    return {"ok": True, "draft_id": draft_id}
