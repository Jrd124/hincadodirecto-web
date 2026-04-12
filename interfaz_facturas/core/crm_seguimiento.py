"""
Motor de seguimiento CRM — v1.5 Fase 2, Bloque 2
=================================================

Responsable de calcular, para cada oportunidad abierta:
  • última interacción COMERCIAL válida (notas NO cuentan — Corrección 2)
  • fecha de entrada a la etapa actual
  • next_action_date / next_action_type / next_action_source
        (respeta override del usuario — Corrección 3: NO caduca a 3 días)
  • priority_score (0..~150)
  • riesgo (verde / ambar / rojo)
  • estado_respuesta (pendiente / recibida / na)
        (inbound a nivel empresa cuenta sólo si hay out reciente — Corrección 4)

Arquitectura:
  1. **Capa pura**: `evaluar_oportunidad(op, interacciones, hoy)` → dict con
     los 9 campos. No toca SQLite → trivial de testear.
  2. **Capa DB**: `recalcular_seguimiento_oportunidad(...)` cargan, llaman a la
     capa pura, y escriben en crm_oportunidades.

Nomenclatura de fechas:
  • Acepta 'YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM:SSZ'. Normaliza a date() vía [:10].
  • Hoy es un date(); todos los cálculos usan días enteros.

Ver docs/CRM_V1_5_SPEC_FASE2.md para precedencia de reglas y test cases.
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Iterable

logger = logging.getLogger(__name__)


# ── Constantes ───────────────────────────────────────────────────────────────

# Tipos de interacción que cuentan como "contacto comercial".
# 'nota' NO cuenta (Corrección 2): una nota interna no reinicia el aging.
_TIPOS_COMERCIALES: frozenset[str] = frozenset(
    {"llamada", "email", "reunion", "whatsapp", "visita"}
)

# Ventana en la que un inbound a nivel empresa cuenta como respuesta:
# si el último outbound es más antiguo que esto, el inbound se ignora
# (probablemente no es respuesta a NUESTRO contacto). Corrección 4.
RESPONSE_WINDOW_DAYS: int = 30

# Estados "abiertos" — el motor sólo actúa sobre estos.
ESTADOS_ABIERTOS: frozenset[str] = frozenset(
    {"lead", "contacto_inicial", "cotizacion_enviada", "negociacion", "aplazada"}
)

# Estados cerrados: el motor los limpia (next_action_date = None, etc.).
ESTADOS_CERRADOS: frozenset[str] = frozenset({"ganada", "perdida"})

# Fallback si la tabla crm_etapa_sla no está todavía poblada.
# Aliñado con scripts/migration_crm_v15.py::SEED_SLA — si cambias uno, cambia el otro.
DEFAULT_SLAS: dict[str, dict[str, Any]] = {
    "lead":               {"sla_dias_sin_contacto":    5, "sla_dias_en_etapa":   14, "accion_default": "primer_contacto",      "prioridad_base": 40},
    "contacto_inicial":   {"sla_dias_sin_contacto":    7, "sla_dias_en_etapa":   21, "accion_default": "perseguir_respuesta",  "prioridad_base": 55},
    "cotizacion_enviada": {"sla_dias_sin_contacto":    5, "sla_dias_en_etapa":   30, "accion_default": "recordar_presupuesto", "prioridad_base": 75},
    "negociacion":        {"sla_dias_sin_contacto":    3, "sla_dias_en_etapa":   20, "accion_default": "cerrar",               "prioridad_base": 90},
    "aplazada":           {"sla_dias_sin_contacto":   30, "sla_dias_en_etapa":  120, "accion_default": "reactivar",            "prioridad_base": 20},
    "ganada":             {"sla_dias_sin_contacto": 9999, "sla_dias_en_etapa": 9999, "accion_default": "cerrar",               "prioridad_base":  0},
    "perdida":            {"sla_dias_sin_contacto": 9999, "sla_dias_en_etapa": 9999, "accion_default": "cerrar",               "prioridad_base":  0},
}

# Umbrales de riesgo sobre priority_score.
_RIESGO_AMBAR = 70
_RIESGO_ROJO = 100


# ── Helpers puros de fechas ──────────────────────────────────────────────────

def _to_date_str(valor: Any) -> str | None:
    """Normaliza un valor a 'YYYY-MM-DD' o None. Tolerante a basura."""
    if valor is None:
        return None
    s = str(valor).strip()
    if not s:
        return None
    return s[:10]


def _parse_date(valor: Any) -> date | None:
    s = _to_date_str(valor)
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _days_diff(desde: Any, hasta: date) -> int | None:
    """Días entre una fecha cualquiera y `hasta`. None si `desde` es inválida."""
    d = _parse_date(desde)
    if d is None:
        return None
    return (hasta - d).days


def _add_days(hoy: date, dias: int) -> str:
    return (hoy + timedelta(days=dias)).strftime("%Y-%m-%d")


def _today() -> date:
    return datetime.utcnow().date()


# ── Helpers de interacciones ─────────────────────────────────────────────────

def es_interaccion_comercial_valida(interaccion: dict[str, Any]) -> bool:
    """True si el tipo cuenta como contacto comercial (no es 'nota' — Corrección 2)."""
    tipo = (interaccion.get("tipo") or "").strip().lower()
    return tipo in _TIPOS_COMERCIALES


def _dir_of(i: dict[str, Any]) -> str:
    return (i.get("direccion") or "none").strip().lower()


def _ordenar_interacciones(interacciones: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Orden descendente por (fecha, id). `fecha` como string funciona con ISO."""
    def clave(i: dict[str, Any]) -> tuple[str, int]:
        return (_to_date_str(i.get("fecha")) or "", int(i.get("id") or 0))
    return sorted(interacciones, key=clave, reverse=True)


# ── Cálculos puros ───────────────────────────────────────────────────────────

def calcular_ultima_interaccion_comercial(
    interacciones: Iterable[dict[str, Any]],
) -> str | None:
    """
    Devuelve la fecha (YYYY-MM-DD) de la última interacción COMERCIAL vinculada
    a la oportunidad. Las notas se ignoran (Corrección 2).
    """
    ordenadas = _ordenar_interacciones(interacciones)
    for i in ordenadas:
        if es_interaccion_comercial_valida(i):
            return _to_date_str(i.get("fecha"))
    return None


def cargar_override_de_lista(
    interacciones: Iterable[dict[str, Any]],
) -> tuple[str, str] | None:
    """
    Busca el override manual vigente.

    Corrección 3: **no caduca** a 3 días. El override persiste hasta que:
      - el usuario cree una interacción nueva con otro fecha_siguiente_accion
      - se borre explícitamente (set fecha_siguiente_accion = NULL)
      - la oportunidad pase a estado cerrado (ganada/perdida)

    Elegimos la interacción más reciente (por (fecha, id) DESC) que tenga
    `fecha_siguiente_accion` no vacío. Si existe, devuelve
    (fecha_siguiente_accion_normalizada, siguiente_accion_texto_o_usuario).
    """
    ordenadas = _ordenar_interacciones(interacciones)
    for i in ordenadas:
        fsa = _to_date_str(i.get("fecha_siguiente_accion"))
        if fsa:
            etiqueta = (i.get("siguiente_accion") or "").strip() or "usuario"
            return (fsa, etiqueta)
    return None


def calcular_estado_respuesta(
    interacciones: Iterable[dict[str, Any]],
    hoy: date,
    window_days: int = RESPONSE_WINDOW_DAYS,
) -> str:
    """
    Devuelve uno de: 'pendiente', 'recibida', 'na'.

    Regla:
      • 'na'        : nunca hemos contactado (ningún out).
      • 'recibida'  : el último in es posterior al último out nuestro.
      • 'recibida'  : (Corrección 4) si el último in es previo al último out pero
                      el último out es reciente (<= window_days), mantenemos
                      'pendiente'. Sólo contamos inbound como respuesta al
                      contacto actual si viene después.
      • 'pendiente' : hay out y no hay in posterior a él.
    """
    ordenadas = _ordenar_interacciones(interacciones)
    ultimo_out: date | None = None
    ultimo_in: date | None = None
    for i in ordenadas:
        if not es_interaccion_comercial_valida(i):
            continue
        d = _parse_date(i.get("fecha"))
        if d is None:
            continue
        direc = _dir_of(i)
        if direc == "out" and ultimo_out is None:
            ultimo_out = d
        elif direc == "in" and ultimo_in is None:
            ultimo_in = d
        if ultimo_out and ultimo_in:
            break

    if ultimo_out is None:
        return "na"
    if ultimo_in is not None and ultimo_in >= ultimo_out:
        return "recibida"
    return "pendiente"


def calcular_estado_respuesta_empresa(
    interacciones_opp: Iterable[dict[str, Any]],
    interacciones_empresa: Iterable[dict[str, Any]],
    hoy: date,
    window_days: int = RESPONSE_WINDOW_DAYS,
) -> str:
    """
    Como `calcular_estado_respuesta`, pero con fallback a empresa.

    Regla Corrección 4:
      1. Si la oportunidad tiene algún outbound propio, usa SÓLO las
         interacciones de la oportunidad (estricto).
      2. Si no, mira las interacciones de la empresa. Un inbound de empresa
         sólo cuenta como respuesta si hay un outbound (a nivel empresa) en
         los últimos `window_days` días. Si no, 'na' o 'pendiente' según
         haya outbound antiguo.
    """
    # 1) Estricto a nivel oportunidad
    opp_ordenadas = _ordenar_interacciones(interacciones_opp)
    tiene_out_opp = any(
        es_interaccion_comercial_valida(i) and _dir_of(i) == "out"
        for i in opp_ordenadas
    )
    if tiene_out_opp:
        return calcular_estado_respuesta(opp_ordenadas, hoy, window_days)

    # 2) Fallback empresa, con ventana de 30 días
    emp_ordenadas = _ordenar_interacciones(interacciones_empresa)
    ultimo_out: date | None = None
    ultimo_in: date | None = None
    for i in emp_ordenadas:
        if not es_interaccion_comercial_valida(i):
            continue
        d = _parse_date(i.get("fecha"))
        if d is None:
            continue
        direc = _dir_of(i)
        if direc == "out" and ultimo_out is None:
            ultimo_out = d
        elif direc == "in" and ultimo_in is None:
            ultimo_in = d
        if ultimo_out and ultimo_in:
            break

    if ultimo_out is None:
        return "na"

    dias_desde_out = (hoy - ultimo_out).days
    if dias_desde_out > window_days:
        # Outbound demasiado antiguo para asumir que un inbound reciente es
        # respuesta a NUESTRO contacto. Lo tratamos como si no hubiera out.
        return "na"

    if ultimo_in is not None and ultimo_in >= ultimo_out:
        return "recibida"
    return "pendiente"


def calcular_next_action(
    oportunidad: dict[str, Any],
    interacciones: Iterable[dict[str, Any]],
    ultima_comercial_str: str | None,
    fecha_entrada_etapa_str: str | None,
    sla: dict[str, Any],
    hoy: date,
) -> tuple[str | None, str | None, str]:
    """
    Calcula (next_action_date, next_action_type, next_action_source).

    Precedencia (orden ESTRICTO):
      1. Override manual (Corrección 3) → ('usuario', siguiente_accion_texto)
      2. Sin contacto comercial nunca → primer_contacto: entrada_etapa + SLA
      3. Respuesta recibida ya → cerrar ya (hoy)
      4. Estancada en etapa (>= sla_dias_en_etapa) → revisar_estancada: hoy
      5. Default por etapa → última_comercial + sla_dias_sin_contacto
    """
    # (1) Override usuario
    override = cargar_override_de_lista(interacciones)
    if override is not None:
        fsa, etiqueta = override
        return (fsa, etiqueta or "usuario", "usuario")

    estado = (oportunidad.get("estado") or "").strip()
    accion_default = (sla.get("accion_default") or "primer_contacto").strip()

    # Si la oportunidad está cerrada, no hay next action.
    if estado in ESTADOS_CERRADOS:
        return (None, None, "motor")

    # (2) Sin contacto comercial nunca → primer_contacto
    if not ultima_comercial_str:
        base = _parse_date(fecha_entrada_etapa_str) or _parse_date(oportunidad.get("fecha_creacion")) or hoy
        fecha_next = base + timedelta(days=int(sla.get("sla_dias_sin_contacto", 7)))
        return (fecha_next.strftime("%Y-%m-%d"), "primer_contacto", "motor")

    # (4) Estancada en etapa → revisar (sin override y con contactos previos)
    dias_en_etapa = _days_diff(fecha_entrada_etapa_str, hoy)
    if dias_en_etapa is not None and dias_en_etapa >= int(sla.get("sla_dias_en_etapa", 9999)):
        return (hoy.strftime("%Y-%m-%d"), "revisar_estancada", "motor")

    # (5) Default por etapa
    ultima = _parse_date(ultima_comercial_str) or hoy
    fecha_next = ultima + timedelta(days=int(sla.get("sla_dias_sin_contacto", 7)))
    return (fecha_next.strftime("%Y-%m-%d"), accion_default, "motor")


def calcular_priority_score(
    oportunidad: dict[str, Any],
    ultima_comercial_str: str | None,
    fecha_entrada_etapa_str: str | None,
    next_action_date_str: str | None,
    sla: dict[str, Any],
    hoy: date,
) -> int:
    """
    Score 0..~150 para ordenar la cola del comercial.

    Componentes:
      • base por etapa (SLA)                              [0..90]
      • vencido de next_action (días * 2, cap 30)          [0..30]
      • bonus importe_estimado                            [0..20]
      • bonus cotizacion_enviada y estancada              [0..10]
    """
    score = int(sla.get("prioridad_base", 0))

    # Vencido de la próxima acción (cuánto ha pasado desde la fecha ideal)
    dias_vencido = _days_diff(next_action_date_str, hoy) or 0
    if dias_vencido > 0:
        score += min(dias_vencido * 2, 30)

    # Bonus por importe
    try:
        importe = float(oportunidad.get("importe_estimado") or 0)
    except (TypeError, ValueError):
        importe = 0.0
    if importe >= 50_000:
        score += 20
    elif importe >= 20_000:
        score += 12
    elif importe >= 5_000:
        score += 6

    # Bonus si está en cotización y estancada
    estado = (oportunidad.get("estado") or "").strip()
    dias_en_etapa = _days_diff(fecha_entrada_etapa_str, hoy)
    if (
        estado == "cotizacion_enviada"
        and dias_en_etapa is not None
        and dias_en_etapa >= int(sla.get("sla_dias_en_etapa", 9999)) // 2
    ):
        score += 10

    # Cap defensivo
    if score < 0:
        score = 0
    return score


def calcular_riesgo(score: int) -> str:
    if score >= _RIESGO_ROJO:
        return "rojo"
    if score >= _RIESGO_AMBAR:
        return "ambar"
    return "verde"


def evaluar_oportunidad(
    oportunidad: dict[str, Any],
    interacciones: list[dict[str, Any]],
    hoy: date,
    slas: dict[str, dict[str, Any]] | None = None,
    interacciones_empresa: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Función pura. Devuelve los 9 campos persistidos del motor.

    Args:
      oportunidad         : dict con al menos id, estado, fecha_creacion,
                            importe_estimado.
      interacciones       : lista de dicts de interacciones ligadas a la
                            oportunidad (incluye notas).
      hoy                 : date() usado como 'now' (inyectable en tests).
      slas                : opcional; si None usa DEFAULT_SLAS.
      interacciones_empresa: opcional; lista de interacciones a nivel empresa,
                            para el fallback de respuesta (Corrección 4).

    Returns dict con claves:
      ultima_interaccion_fecha, fecha_entrada_etapa, next_action_date,
      next_action_type, next_action_source, priority_score, riesgo,
      estado_respuesta, seguimiento_recalculado_en
    """
    slas = slas or DEFAULT_SLAS
    estado = (oportunidad.get("estado") or "lead").strip()
    sla = slas.get(estado) or DEFAULT_SLAS.get(estado) or DEFAULT_SLAS["lead"]

    # Fecha entrada etapa — la proporciona la capa DB; si no, fallback.
    fecha_entrada_etapa = _to_date_str(oportunidad.get("fecha_entrada_etapa"))
    if not fecha_entrada_etapa:
        fecha_entrada_etapa = _to_date_str(oportunidad.get("fecha_creacion"))

    # Última interacción comercial (Corrección 2: notas NO cuentan)
    ultima_comercial = calcular_ultima_interaccion_comercial(interacciones)

    # Estado respuesta (Corrección 4: fallback empresa con ventana)
    estado_respuesta = calcular_estado_respuesta_empresa(
        interacciones_opp=interacciones,
        interacciones_empresa=(interacciones_empresa or interacciones),
        hoy=hoy,
    )

    # Next action
    next_date, next_type, next_source = calcular_next_action(
        oportunidad=oportunidad,
        interacciones=interacciones,
        ultima_comercial_str=ultima_comercial,
        fecha_entrada_etapa_str=fecha_entrada_etapa,
        sla=sla,
        hoy=hoy,
    )

    # Si la oportunidad está cerrada, limpiamos todo el seguimiento.
    if estado in ESTADOS_CERRADOS:
        return {
            "ultima_interaccion_fecha": ultima_comercial,
            "fecha_entrada_etapa": fecha_entrada_etapa,
            "next_action_date": None,
            "next_action_type": None,
            "next_action_source": None,
            "priority_score": 0,
            "riesgo": "verde",
            "estado_respuesta": "na",
            "seguimiento_recalculado_en": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    # Priority y riesgo
    score = calcular_priority_score(
        oportunidad=oportunidad,
        ultima_comercial_str=ultima_comercial,
        fecha_entrada_etapa_str=fecha_entrada_etapa,
        next_action_date_str=next_date,
        sla=sla,
        hoy=hoy,
    )
    riesgo = calcular_riesgo(score)

    return {
        "ultima_interaccion_fecha": ultima_comercial,
        "fecha_entrada_etapa": fecha_entrada_etapa,
        "next_action_date": next_date,
        "next_action_type": next_type,
        "next_action_source": next_source,
        "priority_score": score,
        "riesgo": riesgo,
        "estado_respuesta": estado_respuesta,
        "seguimiento_recalculado_en": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ── Capa DB ──────────────────────────────────────────────────────────────────

def cargar_slas(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    """Carga SLAs desde crm_etapa_sla. Fallback a DEFAULT_SLAS si la tabla
    no existe o está vacía."""
    try:
        rows = conn.execute(
            "SELECT etapa, sla_dias_sin_contacto, sla_dias_en_etapa, "
            "accion_default, prioridad_base FROM crm_etapa_sla"
        ).fetchall()
    except sqlite3.OperationalError:
        return DEFAULT_SLAS
    if not rows:
        return DEFAULT_SLAS
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        etapa = r[0] if not isinstance(r, sqlite3.Row) else r["etapa"]
        out[etapa] = {
            "sla_dias_sin_contacto": r[1] if not isinstance(r, sqlite3.Row) else r["sla_dias_sin_contacto"],
            "sla_dias_en_etapa":     r[2] if not isinstance(r, sqlite3.Row) else r["sla_dias_en_etapa"],
            "accion_default":        r[3] if not isinstance(r, sqlite3.Row) else r["accion_default"],
            "prioridad_base":        r[4] if not isinstance(r, sqlite3.Row) else r["prioridad_base"],
        }
    # Merge con defaults para etapas ausentes
    for k, v in DEFAULT_SLAS.items():
        out.setdefault(k, v)
    return out


def _calcular_fecha_entrada_etapa(conn: sqlite3.Connection, oportunidad_id: int, estado: str) -> str | None:
    """Busca en crm_oportunidades_historial la última entrada a `estado`.

    Si no hay historial para esa etapa, devuelve la fecha de creación.
    """
    row = conn.execute(
        "SELECT fecha FROM crm_oportunidades_historial "
        "WHERE oportunidad_id = ? AND estado_nuevo = ? "
        "ORDER BY fecha DESC, id DESC LIMIT 1",
        (oportunidad_id, estado),
    ).fetchone()
    if row:
        return _to_date_str(row[0] if not isinstance(row, sqlite3.Row) else row["fecha"])
    row = conn.execute(
        "SELECT fecha_creacion FROM crm_oportunidades WHERE id = ?",
        (oportunidad_id,),
    ).fetchone()
    if row:
        return _to_date_str(row[0] if not isinstance(row, sqlite3.Row) else row["fecha_creacion"])
    return None


def _cargar_oportunidad(conn: sqlite3.Connection, oportunidad_id: int) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT id, empresa_id, estado, importe_estimado, fecha_creacion, "
        "       fecha_actualizacion "
        "FROM crm_oportunidades WHERE id = ?",
        (oportunidad_id,),
    ).fetchone()
    if not row:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return {
        "id": row[0],
        "empresa_id": row[1],
        "estado": row[2],
        "importe_estimado": row[3],
        "fecha_creacion": row[4],
        "fecha_actualizacion": row[5],
    }


def _cargar_interacciones_opp(conn: sqlite3.Connection, oportunidad_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, tipo, fecha, direccion, siguiente_accion, fecha_siguiente_accion "
        "FROM crm_interacciones WHERE oportunidad_id = ? "
        "ORDER BY fecha DESC, id DESC",
        (oportunidad_id,),
    ).fetchall()
    return [dict(r) if isinstance(r, sqlite3.Row) else {
        "id": r[0], "tipo": r[1], "fecha": r[2],
        "direccion": r[3], "siguiente_accion": r[4], "fecha_siguiente_accion": r[5],
    } for r in rows]


def _cargar_interacciones_empresa(conn: sqlite3.Connection, empresa_id: int | None) -> list[dict[str, Any]]:
    if not empresa_id:
        return []
    rows = conn.execute(
        "SELECT id, tipo, fecha, direccion, siguiente_accion, fecha_siguiente_accion "
        "FROM crm_interacciones WHERE empresa_id = ? "
        "ORDER BY fecha DESC, id DESC",
        (empresa_id,),
    ).fetchall()
    return [dict(r) if isinstance(r, sqlite3.Row) else {
        "id": r[0], "tipo": r[1], "fecha": r[2],
        "direccion": r[3], "siguiente_accion": r[4], "fecha_siguiente_accion": r[5],
    } for r in rows]


def _persistir(conn: sqlite3.Connection, oportunidad_id: int, resultado: dict[str, Any]) -> None:
    conn.execute(
        """
        UPDATE crm_oportunidades SET
            ultima_interaccion_fecha   = ?,
            fecha_entrada_etapa        = ?,
            next_action_date           = ?,
            next_action_type           = ?,
            next_action_source         = ?,
            priority_score             = ?,
            riesgo                     = ?,
            estado_respuesta           = ?,
            seguimiento_recalculado_en = ?
        WHERE id = ?
        """,
        (
            resultado.get("ultima_interaccion_fecha"),
            resultado.get("fecha_entrada_etapa"),
            resultado.get("next_action_date"),
            resultado.get("next_action_type"),
            resultado.get("next_action_source"),
            resultado.get("priority_score"),
            resultado.get("riesgo"),
            resultado.get("estado_respuesta"),
            resultado.get("seguimiento_recalculado_en"),
        ) + (oportunidad_id,),
    )


def recalcular_seguimiento_oportunidad(
    oportunidad_id: int,
    conn: sqlite3.Connection,
    hoy: date | None = None,
) -> bool:
    """Recalcula y persiste los 9 campos para una oportunidad. Idempotente."""
    hoy = hoy or _today()
    op = _cargar_oportunidad(conn, oportunidad_id)
    if not op:
        return False

    slas = cargar_slas(conn)
    op["fecha_entrada_etapa"] = _calcular_fecha_entrada_etapa(conn, oportunidad_id, op["estado"])

    inter_opp = _cargar_interacciones_opp(conn, oportunidad_id)
    inter_emp = _cargar_interacciones_empresa(conn, op.get("empresa_id"))

    resultado = evaluar_oportunidad(
        oportunidad=op,
        interacciones=inter_opp,
        hoy=hoy,
        slas=slas,
        interacciones_empresa=inter_emp,
    )
    _persistir(conn, oportunidad_id, resultado)
    return True


def recalcular_seguimiento_empresa(
    empresa_id: int,
    conn: sqlite3.Connection,
    hoy: date | None = None,
) -> int:
    """Recalcula todas las oportunidades ABIERTAS de una empresa. Devuelve nº procesadas."""
    rows = conn.execute(
        "SELECT id FROM crm_oportunidades WHERE empresa_id = ? "
        "AND estado IN ('lead','contacto_inicial','cotizacion_enviada','negociacion','aplazada')",
        (empresa_id,),
    ).fetchall()
    count = 0
    for r in rows:
        op_id = r[0] if not isinstance(r, sqlite3.Row) else r["id"]
        if recalcular_seguimiento_oportunidad(op_id, conn, hoy=hoy):
            count += 1
    return count


def recalcular_seguimiento_todas(conn: sqlite3.Connection, hoy: date | None = None) -> int:
    """Recalcula todas las oportunidades ABIERTAS. Devuelve nº procesadas."""
    rows = conn.execute(
        "SELECT id FROM crm_oportunidades "
        "WHERE estado IN ('lead','contacto_inicial','cotizacion_enviada','negociacion','aplazada')"
    ).fetchall()
    count = 0
    for r in rows:
        op_id = r[0] if not isinstance(r, sqlite3.Row) else r["id"]
        if recalcular_seguimiento_oportunidad(op_id, conn, hoy=hoy):
            count += 1
    return count


# Para los hooks que sólo tienen ID de interacción: recalculan la oportunidad
# asociada (si la hay) y si no caen al nivel de empresa.
def recalcular_por_interaccion(
    interaccion_id: int,
    conn: sqlite3.Connection,
    hoy: date | None = None,
) -> int:
    row = conn.execute(
        "SELECT oportunidad_id, empresa_id FROM crm_interacciones WHERE id = ?",
        (interaccion_id,),
    ).fetchone()
    if not row:
        return 0
    op_id = row[0] if not isinstance(row, sqlite3.Row) else row["oportunidad_id"]
    emp_id = row[1] if not isinstance(row, sqlite3.Row) else row["empresa_id"]
    if op_id:
        return 1 if recalcular_seguimiento_oportunidad(op_id, conn, hoy=hoy) else 0
    if emp_id:
        return recalcular_seguimiento_empresa(emp_id, conn, hoy=hoy)
    return 0
