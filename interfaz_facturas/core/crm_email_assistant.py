"""CRM Email Copilot – Fase A.

Genera borradores de email comerciales usando contexto del CRM y el LLM ya
instanciado en ``config.client``. NO toca Gmail; solo produce el borrador y lo
persiste en ``crm_email_drafts``. El envío y la creación de drafts en Gmail se
añaden en Fase B+.

Diseño:
- ``construir_context_pack(oportunidad_id, hilo_referencia_id=None)`` compone un
  paquete estructurado, acotado en tokens, a partir de ``crm_db`` ya existente.
- ``generar_borrador(...)`` llama al LLM con un prompt anti-alucinación y
  devuelve un JSON normalizado. Persiste en ``crm_email_drafts``.

Este módulo NO conoce rutas HTTP ni toca Flask.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from core import crm_db

try:
    from core.llm import limpiar_json_respuesta
except ImportError:  # pragma: no cover
    def limpiar_json_respuesta(t: str) -> str:
        t = (t or "").strip()
        if t.startswith("```"):
            nl = t.find("\n")
            t = t[nl + 1:] if nl != -1 else t[3:]
        if t.endswith("```"):
            t = t[:-3]
        return t.strip()

try:
    from config import client as _llm_client
except ImportError:  # pragma: no cover
    from interfaz_facturas.config import client as _llm_client

logger = logging.getLogger(__name__)

# Modelo y límites. Cambiar aquí si se quiere otro proveedor.
MODELO_DEFECTO = "gpt-4o-mini"
MAX_INTERACCIONES_CONTEXTO = 5          # últimas N en el pack
MAX_CHARS_DESCRIPCION = 200             # truncado por interacción
MAX_CHARS_HILO_MSG = 600                # truncado por mensaje del hilo
TEMPERATURA = 0.4                       # moderada: no robotico, no alucina
MAX_TOKENS_CONTEXTO_DURO = 4000         # cota dura: si se supera, truncamos
OBJETIVOS_VALIDOS = {
    "reactivar", "follow_up_presupuesto", "cerrar", "responder", "otro",
}
TONOS_VALIDOS = {"cordial", "directo", "formal"}


def _feature_flag_on() -> bool:
    """Feature flag global. Apagable vía env CRM_IA_EMAIL_ENABLED=0."""
    v = os.environ.get("CRM_IA_EMAIL_ENABLED", "1").strip().lower()
    return v not in {"0", "false", "no", "off", ""}


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────────────────────────────────────

_FIRMA_PAT = re.compile(
    r"(?im)^(--\s*$|enviado desde mi|sent from my|"
    r"este (mensaje|correo) (y sus|puede contener)|"
    r"aviso (de )?confidencialidad|"
    r"please consider the environment)"
)

_QUOTED_PAT = re.compile(r"(?m)^\s*[>|].*$")


def _truncar(s: str | None, n: int) -> str:
    if not s:
        return ""
    s = str(s).strip()
    if len(s) <= n:
        return s
    return s[: n - 1].rstrip() + "…"


def _limpiar_cuerpo_email(cuerpo: str | None) -> str:
    """Quita firmas típicas, disclaimers y quoted reply para ahorrar tokens."""
    if not cuerpo:
        return ""
    txt = str(cuerpo).replace("\r\n", "\n").replace("\r", "\n")
    # Corta en la primera coincidencia de firma/disclaimer conocido
    m = _FIRMA_PAT.search(txt)
    if m:
        txt = txt[: m.start()]
    # Quita líneas citadas (>, |)
    txt = _QUOTED_PAT.sub("", txt)
    # Colapsa blancos
    txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
    return txt


def _fmt_euros(v: Any) -> str:
    try:
        if v in (None, "", 0, "0"):
            return ""
        return f"{float(v):,.0f} €".replace(",", ".")
    except Exception:
        return str(v)


def _fecha(v: Any) -> str:
    if not v:
        return ""
    return str(v)[:10]


# ─────────────────────────────────────────────────────────────────────────────
# Context pack
# ─────────────────────────────────────────────────────────────────────────────

def construir_context_pack(
    oportunidad_id: int,
    hilo_referencia_id: str | None = None,
) -> dict:
    """Ensambla contexto estructurado compacto para el LLM.

    Devuelve un dict con bloques ``oportunidad``, ``empresa_contacto``,
    ``motor``, ``presupuesto``, ``ultimas_interacciones`` y (opcional)
    ``hilo_referencia``. Pensado para serializar a JSON corto.
    """
    op = crm_db.obtener_oportunidad(oportunidad_id)
    if not op:
        raise ValueError(f"Oportunidad {oportunidad_id} no encontrada")

    contacto_nombre = " ".join(
        p for p in [op.get("nombre_contacto"), op.get("apellidos_contacto")] if p
    ).strip() or None

    bloque_oport = {
        "id": op["id"],
        "nombre": op.get("nombre"),
        "estado": op.get("estado"),
        "importe_estimado": _fmt_euros(op.get("importe_estimado")),
        "probabilidad_pct": op.get("probabilidad"),
        "fecha_estimada_cierre": _fecha(op.get("fecha_estimada_cierre")),
        "motivo_perdida": op.get("motivo_perdida") or None,
        "descripcion": _truncar(op.get("descripcion"), MAX_CHARS_DESCRIPCION),
        "fuente": op.get("fuente"),
    }

    bloque_emp_cont = {
        "empresa_nombre": op.get("nombre_empresa"),
        "tipo_empresa": op.get("tipo_empresa"),
        "contacto_nombre": contacto_nombre,
    }

    bloque_motor = {
        "riesgo": op.get("riesgo"),
        "priority_score": op.get("priority_score"),
        "dias_sin_contacto": op.get("dias_sin_contacto"),
        "dias_en_etapa_actual": op.get("dias_en_etapa_actual"),
        "ultima_interaccion_fecha": _fecha(op.get("ultima_interaccion_fecha")),
        "next_action_type": op.get("next_action_type"),
        "next_action_date": _fecha(op.get("next_action_date")),
        "estado_respuesta": op.get("estado_respuesta"),
    }

    bloque_presu = None
    if op.get("presupuesto_id"):
        bloque_presu = {
            "referencia": op.get("presupuesto_ref"),
            "id": op.get("presupuesto_id"),
        }

    # Últimas N interacciones (ya vienen ordenadas DESC por fecha).
    ints_raw = op.get("interacciones") or []
    ultimas = []
    for i in ints_raw[:MAX_INTERACCIONES_CONTEXTO]:
        ultimas.append({
            "fecha": _fecha(i.get("fecha")),
            "tipo": i.get("tipo"),
            "direccion": i.get("direccion") or "none",
            "asunto": _truncar(i.get("asunto"), 80),
            "extracto": _truncar(
                i.get("descripcion") or i.get("gmail_snippet"),
                MAX_CHARS_DESCRIPCION,
            ),
            "source": i.get("source") or "manual",
        })

    # Hilo de referencia: solo si el user eligió uno Y existe en interacciones.
    hilo_ref = None
    if hilo_referencia_id:
        match = next(
            (i for i in ints_raw if i.get("gmail_thread_id") == hilo_referencia_id),
            None,
        )
        if match:
            hilo_ref = {
                "gmail_thread_id": hilo_referencia_id,
                "asunto": match.get("asunto"),
                "fecha": _fecha(match.get("fecha")),
                "direccion": match.get("direccion") or "none",
                # Body completo no está persistido — en Fase A usamos snippet/descripcion.
                "resumen": _truncar(
                    _limpiar_cuerpo_email(
                        match.get("descripcion") or match.get("gmail_snippet")
                    ),
                    MAX_CHARS_HILO_MSG,
                ),
            }

    pack = {
        "oportunidad": bloque_oport,
        "empresa_contacto": bloque_emp_cont,
        "motor": bloque_motor,
        "presupuesto_activo": bloque_presu,
        "ultimas_interacciones": ultimas,
        "hilo_referencia": hilo_ref,
    }

    # Cota dura: si estimamos >MAX_TOKENS_CONTEXTO_DURO, reducimos progresivamente
    # la sección más larga (ultimas_interacciones) y truncamos extractos.
    while estimar_tokens_aprox(pack) > MAX_TOKENS_CONTEXTO_DURO and pack["ultimas_interacciones"]:
        # Primero recortamos los extractos a la mitad
        for it in pack["ultimas_interacciones"]:
            if it.get("extracto"):
                it["extracto"] = _truncar(it["extracto"], max(40, len(it["extracto"]) // 2))
        # Si sigue pasándose, quitamos la última
        if estimar_tokens_aprox(pack) > MAX_TOKENS_CONTEXTO_DURO:
            pack["ultimas_interacciones"] = pack["ultimas_interacciones"][:-1]
        else:
            break

    return pack


def estimar_tokens_aprox(context_pack: dict) -> int:
    """Heurística rápida: ~4 chars ≈ 1 token. Suficiente para prevenir overruns."""
    try:
        return max(1, len(json.dumps(context_pack, ensure_ascii=False)) // 4)
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Prompting
# ─────────────────────────────────────────────────────────────────────────────

_TONO_GUIA = {
    "cordial": "Tono cálido y cercano. Tutea si el hilo lo permite.",
    "directo": "Tono ejecutivo, sin rodeos. 3-4 líneas. Ve al grano.",
    "formal": "Tono formal, de usted, estructura apertura-desarrollo-cierre.",
}

_OBJETIVO_GUIA = {
    "reactivar":           "El cliente lleva tiempo sin responder. Recupera su atención con un ángulo concreto.",
    "follow_up_presupuesto": "Se envió un presupuesto y no ha habido respuesta. Pregunta por dudas o próximos pasos sin presionar.",
    "cerrar":              "El deal está en negociación avanzada. Propón un próximo paso concreto para cerrar (fecha, firma, decisión).",
    "responder":           "Responde al último mensaje entrante del hilo de forma útil y específica.",
    "otro":                "Sigue las instrucciones libres del comercial.",
}

_SYSTEM_PROMPT = (
    "Eres un asistente que redacta correos comerciales B2B en nombre de un "
    "comercial de Hincado Directo (empresa española de hincado de cimentaciones "
    "para estructuras industriales y solares). Tu objetivo es producir un "
    "borrador breve, profesional, accionable y personalizado.\n\n"
    "REGLAS ESTRICTAS (no negociables):\n"
    "1. Usa SOLO datos presentes en el contexto proporcionado. Si falta un "
    "   dato crítico (fecha exacta, importe, nombre de proyecto, plazo), NO "
    "   lo inventes: marca el hueco con [REVISAR: descripción].\n"
    "2. Responde en el mismo idioma del último mensaje del hilo de referencia "
    "   si lo hay; si no hay, usa español.\n"
    "3. Máximo 6 líneas de cuerpo salvo que el objetivo pida más.\n"
    "4. Termina SIEMPRE con un CTA concreto (pregunta específica, propuesta "
    "   de fecha, decisión requerida).\n"
    "5. NO firmes el correo. La firma la añade el sistema.\n"
    "6. NO uses asuntos genéricos tipo 'Seguimiento comercial'. El asunto "
    "   debe mencionar el deal concreto o un dato específico.\n"
    "7. Evita promesas sobre precios, plazos o condiciones que no estén en "
    "   el contexto.\n\n"
    "FORMATO DE SALIDA (obligatorio):\n"
    "Devuelve EXCLUSIVAMENTE un JSON válido con este schema:\n"
    "{\n"
    '  "subject": "string (≤80 chars)",\n'
    '  "body": "string (texto plano con \\n como saltos de línea)",\n'
    '  "siguiente_accion_sugerida": "string corto (ej: \'Llamar el martes para confirmar fecha\')",\n'
    '  "confianza": 0.0-1.0,\n'
    '  "huecos_detectados": ["descripción del hueco", ...]\n'
    "}\n"
    "No añadas markdown, ni comentarios, ni texto fuera del JSON."
)


def _construir_user_prompt(
    context_pack: dict,
    objetivo: str,
    tono: str,
    instrucciones: str | None,
) -> str:
    obj_key = (objetivo or "otro").strip().lower()
    tono_key = (tono or "cordial").strip().lower()
    guia_obj = _OBJETIVO_GUIA.get(obj_key, _OBJETIVO_GUIA["otro"])
    guia_tono = _TONO_GUIA.get(tono_key, _TONO_GUIA["cordial"])

    # JSON compacto para ahorrar tokens.
    ctx_json = json.dumps(context_pack, ensure_ascii=False, separators=(",", ":"))

    partes = [
        f"OBJETIVO DEL CORREO: {obj_key}. {guia_obj}",
        f"TONO: {tono_key}. {guia_tono}",
    ]
    if instrucciones:
        partes.append(f"INSTRUCCIONES DEL COMERCIAL: {instrucciones.strip()[:300]}")
    partes.append("CONTEXTO (JSON):\n" + ctx_json)
    partes.append(
        "Redacta el borrador siguiendo las reglas. Devuelve SOLO el JSON pedido."
    )
    return "\n\n".join(partes)


# ─────────────────────────────────────────────────────────────────────────────
# Generación
# ─────────────────────────────────────────────────────────────────────────────

def _parsear_salida_llm(contenido: str) -> dict:
    """Intenta parsear el JSON de salida del LLM con fallback conservador."""
    if not contenido:
        return {}
    t = limpiar_json_respuesta(contenido)
    try:
        data = json.loads(t)
    except Exception:
        # Reparación mínima: buscar el primer { y el último }
        ini = t.find("{")
        fin = t.rfind("}")
        if ini >= 0 and fin > ini:
            try:
                data = json.loads(t[ini : fin + 1])
            except Exception:
                return {}
        else:
            return {}
    if not isinstance(data, dict):
        return {}
    # Normalización defensiva
    out = {
        "subject": str(data.get("subject") or "").strip(),
        "body": str(data.get("body") or "").strip(),
        "siguiente_accion_sugerida": str(data.get("siguiente_accion_sugerida") or "").strip(),
        "huecos_detectados": [],
    }
    try:
        out["confianza"] = float(data.get("confianza"))
    except Exception:
        out["confianza"] = None
    huecos = data.get("huecos_detectados")
    if isinstance(huecos, list):
        out["huecos_detectados"] = [str(h).strip() for h in huecos if h]
    return out


def generar_borrador(
    oportunidad_id: int,
    objetivo: str,
    tono: str = "cordial",
    instrucciones: str | None = None,
    hilo_referencia_id: str | None = None,
    creado_por: str | None = None,
    persistir: bool = True,
    modelo: str = MODELO_DEFECTO,
) -> dict:
    """Genera un borrador con IA y (por defecto) lo persiste.

    Devuelve dict con el draft ya guardado (incluye ``id``) o el draft sin id
    si ``persistir=False``. Lanza ``RuntimeError`` si el LLM no está
    configurado o ``ValueError`` si la oportunidad no existe.
    """
    if not _feature_flag_on():
        raise RuntimeError("Feature flag CRM_IA_EMAIL_ENABLED desactivado")
    if _llm_client is None:
        raise RuntimeError("LLM no configurado (config.client es None)")
    if objetivo not in OBJETIVOS_VALIDOS:
        raise ValueError(f"objetivo inválido: {objetivo!r}")
    if tono not in TONOS_VALIDOS:
        raise ValueError(f"tono inválido: {tono!r}")

    context_pack = construir_context_pack(oportunidad_id, hilo_referencia_id)

    op = context_pack["oportunidad"]
    emp = context_pack["empresa_contacto"]

    system_prompt = _SYSTEM_PROMPT
    user_prompt = _construir_user_prompt(
        context_pack, objetivo, tono, instrucciones
    )

    tokens_in = None
    tokens_out = None
    model_usado = modelo
    try:
        resp = _llm_client.chat.completions.create(
            model=modelo,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=TEMPERATURA,
            response_format={"type": "json_object"},
        )
        contenido = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        if usage is not None:
            tokens_in = getattr(usage, "prompt_tokens", None)
            tokens_out = getattr(usage, "completion_tokens", None)
    except Exception as exc:
        logger.warning("Error llamando LLM copilot (%s): %s", modelo, exc)
        # Reintento sin response_format (por si el modelo no lo soporta)
        try:
            resp = _llm_client.chat.completions.create(
                model=modelo,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                temperature=TEMPERATURA,
            )
            contenido = resp.choices[0].message.content or ""
            usage = getattr(resp, "usage", None)
            if usage is not None:
                tokens_in = getattr(usage, "prompt_tokens", None)
                tokens_out = getattr(usage, "completion_tokens", None)
        except Exception as exc2:
            logger.exception("Error LLM copilot (reintento): %s", exc2)
            # Propagamos el motivo real para que sea visible en el cliente,
            # útil para distinguir billing / model-not-found / network / etc.
            tipo = type(exc2).__name__
            msg = str(exc2) or "sin mensaje"
            raise RuntimeError(
                f"No se pudo generar el borrador ({tipo}): {msg}"
            ) from exc2

    salida = _parsear_salida_llm(contenido)
    if not salida or not salida.get("body"):
        # Devolvemos algo usable incluso si el parse falló
        salida = salida or {}
        salida.setdefault("subject", f"Seguimiento — {op.get('nombre') or ''}".strip(" —"))
        salida.setdefault(
            "body",
            "(No se pudo parsear la salida del modelo. "
            "Contenido bruto:\n\n" + (contenido[:1000] if contenido else "vacío") + ")",
        )
        salida.setdefault("siguiente_accion_sugerida", "")
        salida.setdefault("confianza", 0.0)
        salida.setdefault("huecos_detectados", ["parse_error"])

    draft_record = {
        "oportunidad_id": op["id"],
        "empresa_id": context_pack.get("oportunidad", {}).get("empresa_id"),
        "contacto_id": context_pack.get("oportunidad", {}).get("contacto_id"),
        "objetivo": objetivo,
        "tono": tono,
        "instrucciones": instrucciones,
        "hilo_referencia_id": hilo_referencia_id,
        "subject": salida["subject"],
        "body": salida["body"],
        "siguiente_accion_sugerida": salida.get("siguiente_accion_sugerida"),
        "confianza": salida.get("confianza"),
        "huecos_detectados": salida.get("huecos_detectados") or [],
        "estado": "generado",
        "model": model_usado,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "creado_por": creado_por,
    }

    # empresa_id / contacto_id reales (no están dentro del bloque que usamos arriba)
    op_full = crm_db.obtener_oportunidad(oportunidad_id)
    if op_full:
        draft_record["empresa_id"] = op_full.get("empresa_id")
        draft_record["contacto_id"] = op_full.get("contacto_id")

    # Destinatarios sugeridos para Fase B: NO se persisten en el draft (no son
    # parte del registro), pero sí se devuelven a la UI para que pueda
    # rellenar el campo "to" automáticamente al aprobar. El LLM nunca los ve.
    destinatarios = {
        "contacto_email": None,
        "empresa_email": None,
        "contacto_id": (op_full or {}).get("contacto_id"),
        "empresa_id": (op_full or {}).get("empresa_id"),
        "contacto_nombre": context_pack.get("empresa_contacto", {}).get("contacto_nombre"),
        "empresa_nombre": context_pack.get("empresa_contacto", {}).get("empresa_nombre"),
    }
    try:
        if destinatarios["contacto_id"]:
            cont = crm_db.obtener_contacto(destinatarios["contacto_id"])
            if cont:
                destinatarios["contacto_email"] = (cont.get("email") or "").strip() or None
        if destinatarios["empresa_id"]:
            emp = crm_db.obtener_empresa(destinatarios["empresa_id"])
            if emp:
                destinatarios["empresa_email"] = (emp.get("email") or "").strip() or None
    except Exception:
        # Defensivo: no rompemos la generación si no podemos resolver emails
        logger.exception("No se pudieron resolver destinatarios sugeridos")

    if persistir:
        guardado = crm_db.crear_email_draft(draft_record)
        # Añadimos el context pack y los destinatarios sugeridos al dict
        # devuelto. No se persisten — solo se exponen para la UI.
        guardado["context_pack"] = context_pack
        guardado["estimacion_tokens"] = estimar_tokens_aprox(context_pack)
        guardado["destinatarios_sugeridos"] = destinatarios
        return guardado

    draft_record["context_pack"] = context_pack
    draft_record["estimacion_tokens"] = estimar_tokens_aprox(context_pack)
    draft_record["destinatarios_sugeridos"] = destinatarios
    return draft_record


def ia_disponible() -> dict:
    """Diagnóstico rápido: ¿está el LLM configurado y el feature flag activo?"""
    flag = _feature_flag_on()
    cliente_ok = _llm_client is not None
    disponible = flag and cliente_ok
    motivo = None
    if not flag:
        motivo = "feature flag CRM_IA_EMAIL_ENABLED desactivado"
    elif not cliente_ok:
        motivo = "cliente LLM no configurado (config.client es None)"
    return {
        "disponible": disponible,
        "modelo": MODELO_DEFECTO,
        "flag_activo": flag,
        "cliente_configurado": cliente_ok,
        "motivo": motivo,
    }
