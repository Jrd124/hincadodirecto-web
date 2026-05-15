"""Rutas CRM: empresas, contactos, interacciones, oportunidades."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from core import crm_db
from routes.helpers import _bad_request

logger = logging.getLogger("erp")

crm_bp = Blueprint("crm", __name__)


@crm_bp.post("/api/crm/sync-terceros")
def crm_sync_terceros():
  resultado = crm_db.sincronizar_desde_terceros()
  return jsonify(resultado)


@crm_bp.get("/api/crm/empresas")
def crm_listar_empresas():
  crm_db.sincronizar_desde_terceros()
  tipo = (request.args.get("tipo") or "").strip() or None
  q = (request.args.get("q") or "").strip() or None
  activo_raw = request.args.get("activo")
  activo = int(activo_raw) if activo_raw is not None and activo_raw.strip() != "" else None
  tercero_id = request.args.get("tercero_id", type=int) or None
  limit = min(int(request.args.get("limit") or 50), 2000)
  offset = int(request.args.get("offset") or 0)
  resultado = crm_db.listar_empresas(tipo=tipo, q=q, activo=activo, tercero_id=tercero_id, limit=limit, offset=offset)
  return jsonify(resultado)


@crm_bp.get("/api/crm/empresas/<int:empresa_id>")
def crm_obtener_empresa(empresa_id: int):
  empresa = crm_db.obtener_empresa(empresa_id)
  if not empresa:
    return jsonify({"error": "Empresa CRM no encontrada"}), 404
  return jsonify(empresa)


@crm_bp.post("/api/crm/empresas")
def crm_crear_empresa():
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre de la empresa es obligatorio")
  tipo = (data.get("tipo") or "lead").strip()
  if tipo not in ("cliente", "proveedor", "ambos", "lead"):
    return _bad_request("Tipo debe ser cliente, proveedor, ambos o lead")
  empresa = crm_db.crear_empresa(data)
  return jsonify(empresa), 201


@crm_bp.put("/api/crm/empresas/<int:empresa_id>")
def crm_actualizar_empresa(empresa_id: int):
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre de la empresa es obligatorio")
  empresa = crm_db.actualizar_empresa(empresa_id, data)
  if not empresa:
    return jsonify({"error": "Empresa CRM no encontrada"}), 404
  return jsonify(empresa)


@crm_bp.delete("/api/crm/empresas/<int:empresa_id>")
def crm_eliminar_empresa(empresa_id: int):
  resultado = crm_db.eliminar_empresa(empresa_id)
  if not resultado.get("ok"):
    return jsonify({"error": resultado.get("error", "Error")}), 404
  return jsonify(resultado)


@crm_bp.get("/api/crm/empresas/<int:empresa_id>/resumen")
def crm_resumen_empresa(empresa_id: int):
  """Devuelve resumen ligero: última interacción + contadores. Usado por card cabecera."""
  resumen = crm_db.resumen_empresa(empresa_id)
  if not resumen:
    return jsonify({"error": "Empresa CRM no encontrada"}), 404
  return jsonify(resumen)


@crm_bp.get("/api/crm/stats")
def crm_stats():
  return jsonify(crm_db.estadisticas_crm())


@crm_bp.get("/api/crm/duplicados")
def crm_detectar_duplicados():
  tipo = (request.args.get("tipo") or "all").strip()
  grupos = crm_db.detectar_duplicados(tipo=tipo)
  return jsonify({"grupos": grupos, "total_grupos": len(grupos)})


@crm_bp.post("/api/crm/fusionar")
def crm_fusionar():
  data = request.get_json(silent=True) or {}
  principal_id = data.get("principal_id")
  absorbido_id = data.get("absorbido_id")
  if not principal_id or not absorbido_id:
    return _bad_request("Se requieren principal_id y absorbido_id")
  if principal_id == absorbido_id:
    return _bad_request("No se puede fusionar un tercero consigo mismo")
  resultado = crm_db.fusionar_terceros(int(principal_id), int(absorbido_id))
  return jsonify(resultado)


@crm_bp.get("/api/terceros/duplicados")
def terceros_duplicados():
  """Endpoint genérico de duplicados: ?tipo=all|proveedor|cliente"""
  tipo = (request.args.get("tipo") or "all").strip()
  grupos = crm_db.detectar_duplicados(tipo=tipo)
  return jsonify({"grupos": grupos, "total_grupos": len(grupos)})


@crm_bp.get("/api/terceros/duplicados-count")
def terceros_duplicados_count():
  """Devuelve solo el conteo de grupos de duplicados pendientes."""
  tipo = (request.args.get("tipo") or "all").strip()
  total = crm_db.contar_duplicados(tipo=tipo)
  return jsonify({"total": total})


@crm_bp.get("/api/terceros/fusiones-log")
def terceros_fusiones_log():
  limit = min(int(request.args.get("limit") or 100), 500)
  offset = int(request.args.get("offset") or 0)
  return jsonify(crm_db.listar_fusiones_log(limit=limit, offset=offset))


@crm_bp.post("/api/terceros/no-duplicados")
def terceros_no_duplicados():
  data = request.get_json(silent=True) or {}
  id1 = data.get("tercero_id_1")
  id2 = data.get("tercero_id_2")
  if not id1 or not id2:
    return _bad_request("Se requieren tercero_id_1 y tercero_id_2")
  if id1 == id2:
    return _bad_request("Los IDs deben ser diferentes")
  resultado = crm_db.marcar_no_duplicados(int(id1), int(id2))
  return jsonify(resultado)


@crm_bp.post("/api/crm/vincular-facturas")
def crm_vincular_facturas():
  stats = crm_db.vincular_facturas_a_terceros()
  return jsonify(stats)


# ─── CRM Contactos ──────────────────────────────────────────────────────────

@crm_bp.get("/api/crm/contactos")
def crm_listar_contactos():
  empresa_id = request.args.get("empresa_id", type=int)
  q = (request.args.get("q") or "").strip() or None
  limit = min(int(request.args.get("limit") or 50), 200)
  offset = int(request.args.get("offset") or 0)
  return jsonify(crm_db.listar_contactos(empresa_id=empresa_id, q=q, limit=limit, offset=offset))


@crm_bp.get("/api/crm/contactos/<int:contacto_id>")
def crm_obtener_contacto(contacto_id: int):
  contacto = crm_db.obtener_contacto(contacto_id)
  if not contacto:
    return jsonify({"error": "Contacto no encontrado"}), 404
  return jsonify(contacto)


@crm_bp.post("/api/crm/contactos")
def crm_crear_contacto():
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre del contacto es obligatorio")
  contacto = crm_db.crear_contacto(data)
  return jsonify(contacto), 201


@crm_bp.put("/api/crm/contactos/<int:contacto_id>")
def crm_actualizar_contacto(contacto_id: int):
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre del contacto es obligatorio")
  contacto = crm_db.actualizar_contacto(contacto_id, data)
  if not contacto:
    return jsonify({"error": "Contacto no encontrado"}), 404
  return jsonify(contacto)


@crm_bp.delete("/api/crm/contactos/<int:contacto_id>")
def crm_eliminar_contacto(contacto_id: int):
  ok = crm_db.eliminar_contacto(contacto_id)
  if not ok:
    return jsonify({"error": "Contacto no encontrado"}), 404
  return jsonify({"ok": True})


# ─── CRM Interacciones ──────────────────────────────────────────────────────

@crm_bp.get("/api/crm/interacciones")
def crm_listar_interacciones():
  empresa_id = request.args.get("empresa_id", type=int)
  contacto_id = request.args.get("contacto_id", type=int)
  oportunidad_id = request.args.get("oportunidad_id", type=int)
  tipo = (request.args.get("tipo") or "").strip() or None
  fecha_desde = (request.args.get("fecha_desde") or "").strip() or None
  fecha_hasta = (request.args.get("fecha_hasta") or "").strip() or None
  q = (request.args.get("q") or "").strip() or None
  limit = min(int(request.args.get("limit") or 50), 200)
  offset = int(request.args.get("offset") or 0)
  return jsonify(crm_db.listar_interacciones(
    empresa_id=empresa_id, contacto_id=contacto_id,
    oportunidad_id=oportunidad_id, tipo=tipo,
    fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, q=q,
    limit=limit, offset=offset,
  ))


@crm_bp.post("/api/crm/interacciones")
def crm_crear_interaccion():
  data = request.get_json(silent=True) or {}
  tipo = (data.get("tipo") or "").strip()
  if tipo not in ("llamada", "email", "reunion", "nota", "whatsapp", "visita"):
    return _bad_request("Tipo debe ser llamada, email, reunion, nota, whatsapp o visita")
  interaccion = crm_db.crear_interaccion(data)
  return jsonify(interaccion), 201


@crm_bp.get("/api/crm/interacciones/<int:interaccion_id>")
def crm_obtener_interaccion(interaccion_id: int):
  with __import__('core.db', fromlist=['conectar']).conectar() as conn:
    row = conn.execute("""
      SELECT i.*, c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
             e.nombre AS nombre_empresa
      FROM crm_interacciones i
      LEFT JOIN crm_contactos c ON c.id = i.contacto_id
      LEFT JOIN crm_empresas e ON e.id = i.empresa_id
      WHERE i.id = ?
    """, (interaccion_id,)).fetchone()
  if not row:
    return jsonify({"error": "Interaccion no encontrada"}), 404
  return jsonify(dict(row))


@crm_bp.put("/api/crm/interacciones/<int:interaccion_id>")
def crm_actualizar_interaccion(interaccion_id: int):
  data = request.get_json(silent=True) or {}
  interaccion = crm_db.actualizar_interaccion(interaccion_id, data)
  if not interaccion:
    return jsonify({"error": "Interaccion no encontrada"}), 404
  return jsonify(interaccion)


@crm_bp.delete("/api/crm/interacciones/<int:interaccion_id>")
def crm_eliminar_interaccion(interaccion_id: int):
  ok = crm_db.eliminar_interaccion(interaccion_id)
  if not ok:
    return jsonify({"error": "Interaccion no encontrada"}), 404
  return jsonify({"ok": True})


@crm_bp.delete("/api/crm/interacciones/batch")
def crm_eliminar_interacciones_batch():
  """Elimina múltiples interacciones. Body: {"ids": [1, 2, 3]}"""
  data = request.get_json(silent=True) or {}
  ids = data.get("ids", [])
  if not ids or not isinstance(ids, list):
    return jsonify({"error": "ids requerido (lista)"}), 400
  ids_int = [int(i) for i in ids if str(i).isdigit()]
  if not ids_int:
    return jsonify({"error": "ids inválidos"}), 400
  eliminadas = crm_db.eliminar_interacciones_batch(ids_int)
  return jsonify({"ok": True, "eliminadas": eliminadas})


@crm_bp.get("/api/crm/interacciones/pendientes")
def crm_interacciones_pendientes():
  return jsonify({"interacciones": crm_db.interacciones_pendientes()})


# ─── CRM Oportunidades ──────────────────────────────────────────────────────

_TRUTHY = {"1", "true", "yes", "si", "sí", "on"}


def _bool_arg(name: str) -> bool:
  raw = (request.args.get(name) or "").strip().lower()
  return raw in _TRUTHY


@crm_bp.get("/api/crm/oportunidades")
def crm_listar_oportunidades():
  estado = (request.args.get("estado") or "").strip() or None
  empresa_id = request.args.get("empresa_id", type=int)
  contacto_id = request.args.get("contacto_id", type=int)
  fuente = (request.args.get("fuente") or "").strip() or None
  q = (request.args.get("q") or "").strip() or None
  limit = min(int(request.args.get("limit") or 200), 500)
  offset = int(request.args.get("offset") or 0)
  # Filtros nuevos del motor (Fase 3). Compat: si no se pasan, no cambia nada.
  riesgo = (request.args.get("riesgo") or "").strip().lower() or None
  vencidas = _bool_arg("vencidas")
  sin_proxima_accion = _bool_arg("sin_proxima_accion")
  sin_actividad_dias = request.args.get("sin_actividad_dias", type=int)
  ordenar = (request.args.get("ordenar") or "").strip().lower() or None
  return jsonify(crm_db.listar_oportunidades(
    estado=estado, empresa_id=empresa_id, contacto_id=contacto_id,
    fuente=fuente, q=q, limit=limit, offset=offset,
    riesgo=riesgo, vencidas=vencidas, sin_proxima_accion=sin_proxima_accion,
    sin_actividad_dias=sin_actividad_dias, ordenar=ordenar,
  ))


@crm_bp.get("/api/crm/oportunidades/<int:oportunidad_id>")
def crm_obtener_oportunidad(oportunidad_id: int):
  op = crm_db.obtener_oportunidad(oportunidad_id)
  if not op:
    return jsonify({"error": "Oportunidad no encontrada"}), 404
  return jsonify(op)


@crm_bp.post("/api/crm/oportunidades")
def crm_crear_oportunidad():
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre de la oportunidad es obligatorio")
  if not data.get("empresa_id"):
    return _bad_request("La empresa es obligatoria")
  op = crm_db.crear_oportunidad(data)
  return jsonify(op), 201


@crm_bp.put("/api/crm/oportunidades/<int:oportunidad_id>")
def crm_actualizar_oportunidad(oportunidad_id: int):
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return _bad_request("El nombre de la oportunidad es obligatorio")
  estado = (data.get("estado") or "").strip()
  if estado == "perdida" and not (data.get("motivo_perdida") or "").strip():
    return _bad_request("El motivo de perdida es obligatorio para estado 'perdida'")
  op = crm_db.actualizar_oportunidad(oportunidad_id, data)
  if not op:
    return jsonify({"error": "Oportunidad no encontrada"}), 404
  return jsonify(op)


@crm_bp.patch("/api/crm/oportunidades/<int:oportunidad_id>/estado")
def crm_cambiar_estado_oportunidad(oportunidad_id: int):
  data = request.get_json(silent=True) or {}
  estado = (data.get("estado") or "").strip()
  if not estado:
    return _bad_request("El estado es obligatorio")
  if estado == "perdida" and not (data.get("motivo_perdida") or "").strip():
    return _bad_request("El motivo de perdida es obligatorio")
  motivo = (data.get("motivo_perdida") or "").strip() or None
  op = crm_db.cambiar_estado_oportunidad(oportunidad_id, estado, motivo)
  if not op:
    return jsonify({"error": "Oportunidad no encontrada o estado invalido"}), 404
  return jsonify(op)


@crm_bp.get("/api/crm/oportunidades/pipeline")
def crm_pipeline_oportunidades():
  return jsonify({"pipeline": crm_db.pipeline_oportunidades()})


@crm_bp.delete("/api/crm/oportunidades/<int:oportunidad_id>")
def crm_eliminar_oportunidad(oportunidad_id: int):
  res = crm_db.eliminar_oportunidad(oportunidad_id)
  if not res.get("ok"):
    return jsonify(res), 404
  return jsonify(res), 200


@crm_bp.get("/api/crm/seguimiento/hoy")
def crm_seguimiento_hoy():
  """Oportunidades que requieren acción hoy o están vencidas.

  Query params:
    limit (int, default 100, max 500)
    incluir_verdes (bool, default false): si true, incluye riesgo=verde.
  """
  limit = min(int(request.args.get("limit") or 100), 500)
  incluir_verdes = _bool_arg("incluir_verdes")
  return jsonify(crm_db.oportunidades_hoy(limit=limit, incluir_verdes=incluir_verdes))


@crm_bp.get("/api/crm/seguimiento/riesgo")
def crm_seguimiento_riesgo():
  """Oportunidades abiertas en riesgo.

  Query params:
    nivel (str): 'rojo' | 'ambar' | 'ambar+rojo' (default).
    limit (int, default 100, max 500)
  """
  nivel = (request.args.get("nivel") or "ambar+rojo").strip().lower()
  if nivel not in ("rojo", "ambar", "ambar+rojo"):
    return _bad_request("nivel debe ser 'rojo', 'ambar' o 'ambar+rojo'")
  limit = min(int(request.args.get("limit") or 100), 500)
  return jsonify(crm_db.oportunidades_riesgo(nivel=nivel, limit=limit))


@crm_bp.get("/api/crm/analitica/pipeline")
def crm_analitica_pipeline():
  """Métricas agregadas del pipeline: etapas, riesgo, importe rojo, disciplina, tiempos medios."""
  return jsonify(crm_db.analitica_pipeline())


@crm_bp.get("/api/crm/seguimiento/empresas-frias")
def crm_empresas_frias():
  """Empresas sin actividad en los últimos N días.

  Query params:
    dias (int, default 30): umbral de inactividad.
    tipos (str, comma-separated): filtrar por tipo de empresa.
    excluir (str, comma-separated): excluir tipos.
    limit (int, default 50): máximo de resultados.
  """
  dias = request.args.get("dias", 30, type=int)
  tipos_raw = request.args.get("tipos", "")
  excluir_raw = request.args.get("excluir", "")
  limit = request.args.get("limit", 50, type=int)
  tipos = [t.strip() for t in tipos_raw.split(",") if t.strip()] or None
  excluir = [t.strip() for t in excluir_raw.split(",") if t.strip()] or None
  empresas = crm_db.empresas_sin_actividad(dias=dias, tipos=tipos, excluir_estados=excluir)
  return jsonify({"empresas": empresas[:limit], "total": len(empresas), "dias_umbral": dias})


# ─── GMAIL SYNC ───────────────────────────────────────────────────────────────

@crm_bp.get("/api/crm/gmail/status")
def crm_gmail_status():
  """Estado de la integración Gmail: si está configurada, cuenta y último sync."""
  try:
    from core import gmail_sync
    return jsonify(gmail_sync.gmail_disponible())
  except Exception as exc:
    logger.error("gmail status error: %s", exc)
    return jsonify({"disponible": False, "motivo": str(exc)}), 500


@crm_bp.post("/api/crm/gmail/sync")
def crm_gmail_sync():
  """Dispara sync Gmail manual. Devuelve resumen de la operación.

  Body JSON opcional:
    solo_con_dominio (bool, default false): solo empresas con dominio configurado.
    batch_size (int, default según CRM_GMAIL_BATCH_SIZE env var).
  """
  try:
    from core import gmail_sync
    estado = gmail_sync.gmail_disponible()
    if not estado.get("disponible"):
      return jsonify({"ok": False, "error": estado.get("motivo", "Gmail no disponible")}), 400
    data = request.get_json(silent=True) or {}
    solo_con_dominio = bool(data.get("solo_con_dominio", False))
    batch_size = int(data.get("batch_size") or 20)
    dias_atras = int(data["dias_atras"]) if data.get("dias_atras") else None
    resumen = gmail_sync.sync_global_batch(
      batch_size=batch_size,
      solo_con_dominio=solo_con_dominio,
      dias_atras=dias_atras,
    )
    return jsonify({"ok": True, "resumen": resumen})
  except Exception as exc:
    logger.error("gmail sync error: %s", exc, exc_info=True)
    return jsonify({"ok": False, "error": str(exc)}), 500


@crm_bp.post("/api/crm/gmail/preview")
def crm_gmail_preview():
  """Dry-run: devuelve los hilos que SE IMPORTARÍAN sin escribir en BD.

  Body JSON:
    dias_atras (int, opcional): limitar búsqueda a últimos N días.
    batch_size (int, opcional).
  """
  try:
    from core import gmail_sync
    estado = gmail_sync.gmail_disponible()
    if not estado.get("disponible"):
      return jsonify({"ok": False, "error": estado.get("motivo")}), 400
    data = request.get_json(silent=True) or {}
    dias_atras  = int(data["dias_atras"]) if data.get("dias_atras") else None
    batch_size  = int(data.get("batch_size") or 20)
    hilos = gmail_sync.preview_global_batch(batch_size=batch_size, dias_atras=dias_atras)
    return jsonify({"ok": True, "hilos": hilos, "total": len(hilos)})
  except Exception as exc:
    logger.error("gmail preview error: %s", exc, exc_info=True)
    return jsonify({"ok": False, "error": str(exc)}), 500


@crm_bp.post("/api/crm/gmail/sync/selective")
def crm_gmail_sync_selective():
  """Importa solo los hilos seleccionados por el usuario.

  Body JSON:
    threads: [{gmail_thread_id, empresa_id, asunto, fecha,
               snippet, from_addr, empresa_nombre}]
  """
  try:
    from core import gmail_sync
    estado = gmail_sync.gmail_disponible()
    if not estado.get("disponible"):
      return jsonify({"ok": False, "error": estado.get("motivo")}), 400
    data = request.get_json(silent=True) or {}
    threads = data.get("threads", [])
    if not threads:
      return jsonify({"ok": False, "error": "No se han enviado hilos para importar"}), 400
    resumen = gmail_sync.import_selective(threads)
    return jsonify({"ok": True, "resumen": resumen})
  except Exception as exc:
    logger.error("gmail selective sync error: %s", exc, exc_info=True)
    return jsonify({"ok": False, "error": str(exc)}), 500


# ---------------------------------------------------------------------------
# IA Sales Copilot — Fase A (generación de borradores, sin envío)
# ---------------------------------------------------------------------------

# Rate limit muy simple en memoria: N generaciones por IP por ventana.
# No es seguridad; es un guardarraíl para evitar bucles accidentales que
# quemen tokens. Reset automático por ventana deslizante.
import time as _time
from collections import deque as _deque

_IA_RL_VENTANA_S = 60        # ventana de 60 segundos
_IA_RL_MAX_VENTANA = 10      # máx 10 generaciones / minuto / IP
_IA_RL_MAX_POR_HORA = 60     # cota de seguridad por hora
_ia_rl_hist: dict = {}       # {ip: deque[timestamps]}


def _ia_rate_limit_check(ip: str) -> tuple[bool, str | None]:
    """Devuelve (permitido, motivo_si_bloqueado)."""
    now = _time.time()
    dq = _ia_rl_hist.setdefault(ip, _deque())
    # Purga entradas de más de 1 hora
    while dq and now - dq[0] > 3600:
        dq.popleft()
    en_ventana = sum(1 for t in dq if now - t <= _IA_RL_VENTANA_S)
    if en_ventana >= _IA_RL_MAX_VENTANA:
        return False, f"límite {_IA_RL_MAX_VENTANA}/minuto alcanzado"
    if len(dq) >= _IA_RL_MAX_POR_HORA:
        return False, f"límite {_IA_RL_MAX_POR_HORA}/hora alcanzado"
    dq.append(now)
    return True, None


@crm_bp.get("/api/crm/ia/email/status")
def crm_ia_email_status():
  """Indica si la IA está disponible (cliente OpenAI configurado)."""
  try:
    from core import crm_email_assistant
    return jsonify(crm_email_assistant.ia_disponible())
  except Exception as exc:
    logger.error("ia status error: %s", exc, exc_info=True)
    return jsonify({"disponible": False, "motivo": str(exc)}), 500


@crm_bp.post("/api/crm/ia/email/contexto")
def crm_ia_email_contexto():
  """Dry-run: devuelve el context-pack que se enviaría al LLM, sin llamarlo.

  Body JSON:
    oportunidad_id (obligatorio)
    hilo_referencia_id (opcional) -- gmail_thread_id de una interacción
  """
  try:
    from core import crm_email_assistant
    data = request.get_json(silent=True) or {}
    oportunidad_id = data.get("oportunidad_id")
    if not oportunidad_id:
      return _bad_request("oportunidad_id es obligatorio")
    try:
      oportunidad_id = int(oportunidad_id)
    except (TypeError, ValueError):
      return _bad_request("oportunidad_id debe ser numérico")
    hilo_ref = (data.get("hilo_referencia_id") or "").strip() or None
    try:
      context_pack = crm_email_assistant.construir_context_pack(
        oportunidad_id, hilo_referencia_id=hilo_ref
      )
    except ValueError as vexc:
      return jsonify({"error": str(vexc)}), 404
    return jsonify({
      "context_pack": context_pack,
      "estimacion_tokens": crm_email_assistant.estimar_tokens_aprox(context_pack),
    })
  except Exception as exc:
    logger.error("ia contexto error: %s", exc, exc_info=True)
    return jsonify({"error": str(exc)}), 500


@crm_bp.post("/api/crm/ia/email/borrador")
def crm_ia_email_borrador():
  """Genera y persiste un borrador de email con el LLM.

  Body JSON:
    oportunidad_id (obligatorio)
    objetivo (obligatorio): reactivar | follow_up_presupuesto | cerrar | responder | otro
    tono (obligatorio): cordial | directo | formal
    instrucciones (opcional): texto libre con énfasis del usuario
    hilo_referencia_id (opcional): gmail_thread_id a referenciar
  """
  try:
    from core import crm_email_assistant
    data = request.get_json(silent=True) or {}
    oportunidad_id = data.get("oportunidad_id")
    objetivo = (data.get("objetivo") or "").strip()
    tono = (data.get("tono") or "").strip()
    instrucciones = (data.get("instrucciones") or "").strip() or None
    hilo_ref = (data.get("hilo_referencia_id") or "").strip() or None

    if not oportunidad_id:
      return _bad_request("oportunidad_id es obligatorio")
    try:
      oportunidad_id = int(oportunidad_id)
    except (TypeError, ValueError):
      return _bad_request("oportunidad_id debe ser numérico")
    if not objetivo:
      return _bad_request("objetivo es obligatorio")
    if objetivo not in {"reactivar", "follow_up_presupuesto", "cerrar", "responder", "otro"}:
      return _bad_request(
        "objetivo inválido (reactivar | follow_up_presupuesto | cerrar | responder | otro)"
      )
    if not tono:
      return _bad_request("tono es obligatorio")
    if tono not in {"cordial", "directo", "formal"}:
      return _bad_request("tono inválido (cordial | directo | formal)")

    # Precheck IA
    estado = crm_email_assistant.ia_disponible()
    if not estado.get("disponible"):
      return jsonify({
        "error": "IA no disponible",
        "motivo": estado.get("motivo") or "cliente OpenAI no configurado",
      }), 503

    # Rate limit
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    permitido, motivo_rl = _ia_rate_limit_check(ip)
    if not permitido:
      return jsonify({"error": "rate_limit", "motivo": motivo_rl}), 429

    try:
      resultado = crm_email_assistant.generar_borrador(
        oportunidad_id=oportunidad_id,
        objetivo=objetivo,
        tono=tono,
        instrucciones=instrucciones,
        hilo_referencia_id=hilo_ref,
        creado_por=None,
        persistir=True,
      )
    except ValueError as vexc:
      return jsonify({"error": str(vexc)}), 404
    except RuntimeError as rexc:
      logger.error("ia borrador RuntimeError: %s", rexc, exc_info=True)
      return jsonify({"error": str(rexc), "tipo": "llm_error"}), 502
    if not resultado:
      return jsonify({"error": "No se pudo generar el borrador"}), 500
    return jsonify(resultado)
  except Exception as exc:
    logger.error("ia borrador error: %s", exc, exc_info=True)
    return jsonify({"error": str(exc)}), 500


# ─── Fase B: aprobar borrador y crear draft real en Gmail ──────────────────


@crm_bp.get("/api/crm/ia/email/borrador/<int:draft_id>")
def crm_ia_email_borrador_get(draft_id: int):
  """Lee un borrador concreto + sus destinatarios sugeridos (para abrir
  un draft existente en la UI sin regenerar)."""
  try:
    draft = crm_db.obtener_email_draft(draft_id)
    if not draft:
      return jsonify({"error": "borrador no encontrado"}), 404
    # Resolver destinatarios sugeridos en lectura tardía
    destinatarios = {
      "contacto_email": None,
      "empresa_email": None,
      "contacto_id": draft.get("contacto_id"),
      "empresa_id": draft.get("empresa_id"),
      "contacto_nombre": None,
      "empresa_nombre": None,
    }
    try:
      if draft.get("contacto_id"):
        cont = crm_db.obtener_contacto(draft["contacto_id"]) or {}
        destinatarios["contacto_email"] = (cont.get("email") or "").strip() or None
        nombre = " ".join(p for p in [cont.get("nombre"), cont.get("apellidos")] if p)
        destinatarios["contacto_nombre"] = nombre or None
      if draft.get("empresa_id"):
        emp = crm_db.obtener_empresa(draft["empresa_id"]) or {}
        destinatarios["empresa_email"] = (emp.get("email") or "").strip() or None
        destinatarios["empresa_nombre"] = emp.get("nombre")
    except Exception:
      logger.exception("destinatarios_sugeridos: fallo resolución")
    draft["destinatarios_sugeridos"] = destinatarios
    return jsonify(draft)
  except Exception as exc:
    logger.error("get draft error: %s", exc, exc_info=True)
    return jsonify({"error": str(exc)}), 500


@crm_bp.post("/api/crm/ia/email/borrador/<int:draft_id>/aprobar-en-gmail")
def crm_ia_email_aprobar_gmail(draft_id: int):
  """Crea un draft real en Gmail a partir de un borrador IA aprobado.

  Body JSON:
    to                  (obligatorio): destinatario final
    subject_override    (opcional): si el usuario editó el asunto
    body_override       (opcional): si el usuario editó el cuerpo
    cc, bcc             (opcional): listas de strings
    persistir_email_contacto (opcional, bool): si true y el contacto del
                          draft no tenía email, guarda 'to' en su contacto.

  Respuesta: { ok, draft_id (CRM), gmail_draft_id, gmail_message_id,
               permalink, estado, destinatario }
  """
  try:
    data = request.get_json(silent=True) or {}
    to = (data.get("to") or "").strip()
    if not to or "@" not in to:
      return _bad_request("destinatario inválido")

    draft = crm_db.obtener_email_draft(draft_id)
    if not draft:
      return jsonify({"error": "borrador no encontrado"}), 404
    if draft.get("estado") != "generado":
      # Idempotencia: si ya está aprobado, devolvemos los datos existentes en
      # lugar de duplicar el draft en Gmail.
      if draft.get("estado") == "aprobado_en_gmail" and draft.get("gmail_draft_id"):
        return jsonify({
          "ok": True,
          "draft_id": draft["id"],
          "gmail_draft_id": draft.get("gmail_draft_id"),
          "gmail_message_id": draft.get("gmail_message_id"),
          "estado": draft.get("estado"),
          "permalink": "https://mail.google.com/mail/u/0/#drafts",
          "destinatario": to,
          "ya_existia": True,
        })
      return jsonify({
        "error": f"el borrador no está en estado 'generado' (actual: {draft.get('estado')})"
      }), 409

    # Rate limit (mismo bucket que /borrador)
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    permitido, motivo_rl = _ia_rate_limit_check(ip)
    if not permitido:
      return jsonify({"error": "rate_limit", "motivo": motivo_rl}), 429

    # Subject / body finales (con overrides si vinieron de la UI)
    subject = (data.get("subject_override") or draft.get("subject") or "").strip()
    body = (data.get("body_override") or draft.get("body") or "").strip()
    if not subject:
      return _bad_request("subject vacío")
    if not body:
      return _bad_request("body vacío")

    cc = data.get("cc") if isinstance(data.get("cc"), list) else None
    bcc = data.get("bcc") if isinstance(data.get("bcc"), list) else None

    # Persistir email en contacto si nos lo piden y no tenía
    persistir_contacto = bool(data.get("persistir_email_contacto"))
    if persistir_contacto and draft.get("contacto_id"):
      try:
        cont = crm_db.obtener_contacto(draft["contacto_id"]) or {}
        if not (cont.get("email") or "").strip():
          payload = dict(cont)
          payload["email"] = to
          # Mantener campos obligatorios para el endpoint de actualizar
          crm_db.actualizar_contacto(draft["contacto_id"], payload)
      except Exception:
        logger.exception(
          "No se pudo persistir email en contacto %s", draft.get("contacto_id")
        )

    # Crear el draft real en Gmail
    try:
      from core import gmail_actions
    except ImportError as exc:
      return jsonify({"error": f"gmail_actions no disponible: {exc}"}), 500

    try:
      result = gmail_actions.crear_draft_en_gmail(
        to=to,
        subject=subject,
        body=body,
        cc=cc,
        bcc=bcc,
        in_reply_to_thread_id=draft.get("hilo_referencia_id"),
      )
    except ValueError as vexc:
      return jsonify({"error": str(vexc)}), 400
    except RuntimeError as rexc:
      logger.error("gmail draft create error: %s", rexc, exc_info=True)
      return jsonify({"error": str(rexc), "tipo": "gmail_error"}), 502

    # Persistir IDs y nuevo estado en el draft CRM (incluye overrides si los hubo)
    update = {
      "subject": subject,
      "body": body,
      "estado": "aprobado_en_gmail",
      "gmail_draft_id": result.get("draft_id"),
      "gmail_message_id": result.get("message_id"),
    }
    actualizado = crm_db.actualizar_email_draft(draft_id, update) or {}

    return jsonify({
      "ok": True,
      "draft_id": draft_id,
      "gmail_draft_id": result.get("draft_id"),
      "gmail_message_id": result.get("message_id"),
      "thread_id": result.get("thread_id"),
      "permalink": result.get("permalink"),
      "estado": actualizado.get("estado") or "aprobado_en_gmail",
      "destinatario": to,
    })
  except Exception as exc:
    logger.error("ia aprobar gmail error: %s", exc, exc_info=True)
    return jsonify({"error": str(exc)}), 500


@crm_bp.get("/api/crm/ia/email/gmail-status")
def crm_ia_gmail_status():
  """Estado combinado IA + Gmail compose. La UI lo usa antes de mostrar el
  botón 'Crear draft en Gmail'."""
  try:
    from core import crm_email_assistant, gmail_actions
    return jsonify({
      "ia": crm_email_assistant.ia_disponible(),
      "gmail": gmail_actions.gmail_compose_disponible(),
    })
  except Exception as exc:
    logger.error("ia gmail-status error: %s", exc, exc_info=True)
    return jsonify({"error": str(exc)}), 500
