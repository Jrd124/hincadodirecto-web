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
  tipo = (request.args.get("tipo") or "").strip() or None
  fecha_desde = (request.args.get("fecha_desde") or "").strip() or None
  fecha_hasta = (request.args.get("fecha_hasta") or "").strip() or None
  q = (request.args.get("q") or "").strip() or None
  limit = min(int(request.args.get("limit") or 50), 200)
  offset = int(request.args.get("offset") or 0)
  return jsonify(crm_db.listar_interacciones(
    empresa_id=empresa_id, contacto_id=contacto_id, tipo=tipo,
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
