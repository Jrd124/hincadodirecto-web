"""Rutas de proyectos, partes, recursos, documentos y certificaciones."""
from __future__ import annotations

import io
import logging

from flask import Blueprint, jsonify, request, send_file

from core import proyectos_db
from routes.helpers import _bad_request

logger = logging.getLogger("erp")

proyectos_bp = Blueprint("proyectos_crud", __name__)


@proyectos_bp.get("/api/proyectos")
def api_listar_proyectos():
  proyectos_db.init_proyectos_db()
  estado = (request.args.get("estado") or "").strip() or None
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  tipo_trabajo = (request.args.get("tipo_trabajo") or "").strip() or None
  q = (request.args.get("q") or "").strip() or None
  tercero_id = request.args.get("tercero_id", type=int) or None
  return jsonify({"proyectos": proyectos_db.listar_proyectos(estado=estado, empresa_id=empresa_id, tipo_trabajo=tipo_trabajo, q=q, tercero_id=tercero_id)})


@proyectos_bp.get("/api/proyectos/<int:proyecto_id>")
def api_obtener_proyecto(proyecto_id: int):
  proyectos_db.init_proyectos_db()
  p = proyectos_db.obtener_proyecto(proyecto_id)
  if not p:
    return jsonify({"error": "Proyecto no encontrado"}), 404
  return jsonify(p)


@proyectos_bp.get("/api/proyectos/<int:pid>/dashboard")
def api_proyecto_dashboard(pid):
  proyectos_db.init_proyectos_db()
  data = proyectos_db.obtener_dashboard_proyecto(pid)
  if not data:
    return jsonify({"error": "Proyecto no encontrado"}), 404
  return jsonify(data)


@proyectos_bp.post("/api/proyectos")
def api_crear_proyecto():
  data = request.get_json(silent=True) or {}
  if not (data.get("nombre") or "").strip():
    return _bad_request("El nombre del proyecto es obligatorio")
  if not data.get("empresa_id"):
    return _bad_request("La empresa es obligatoria")
  p = proyectos_db.crear_proyecto(data)
  return jsonify(p), 201


@proyectos_bp.put("/api/proyectos/<int:proyecto_id>")
def api_actualizar_proyecto(proyecto_id: int):
  data = request.get_json(silent=True) or {}
  if not (data.get("nombre") or "").strip():
    return _bad_request("El nombre del proyecto es obligatorio")
  p = proyectos_db.actualizar_proyecto(proyecto_id, data)
  if not p:
    return jsonify({"error": "Proyecto no encontrado"}), 404
  return jsonify(p)


@proyectos_bp.patch("/api/proyectos/<int:proyecto_id>/estado")
def api_cambiar_estado_proyecto(proyecto_id: int):
  data = request.get_json(silent=True) or {}
  estado = (data.get("estado") or "").strip()
  if not estado:
    return _bad_request("El estado es obligatorio")
  motivo = (data.get("motivo") or "").strip() or None
  p = proyectos_db.cambiar_estado_proyecto(proyecto_id, estado, motivo)
  if not p:
    return jsonify({"error": "Proyecto no encontrado o estado invalido"}), 404
  return jsonify(p)


@proyectos_bp.get("/api/proyectos/<int:proyecto_id>/partes")
def api_listar_partes(proyecto_id: int):
  return jsonify({"partes": proyectos_db.listar_partes(proyecto_id)})


@proyectos_bp.post("/api/proyectos/<int:proyecto_id>/partes")
def api_crear_parte(proyecto_id: int):
  data = request.get_json(silent=True) or {}
  parte = proyectos_db.crear_parte(proyecto_id, data)
  return jsonify(parte), 201


@proyectos_bp.put("/api/proyectos/partes/<int:parte_id>")
def api_actualizar_parte(parte_id: int):
  data = request.get_json(silent=True) or {}
  parte = proyectos_db.actualizar_parte(parte_id, data)
  if not parte:
    return jsonify({"error": "Parte no encontrado"}), 404
  return jsonify(parte)


@proyectos_bp.get("/api/proyectos/dashboard")
def api_proyectos_dashboard():
  proyectos_db.init_proyectos_db()
  return jsonify(proyectos_db.dashboard())


@proyectos_bp.post("/api/proyectos/<int:proyecto_id>/recursos")
def api_asignar_recurso(proyecto_id: int):
  data = request.get_json(silent=True) or {}
  recurso = proyectos_db.asignar_recurso(proyecto_id, data)
  return jsonify(recurso), 201


@proyectos_bp.delete("/api/proyectos/recursos/<int:recurso_id>")
def api_desasignar_recurso(recurso_id: int):
  ok = proyectos_db.desasignar_recurso(recurso_id)
  if not ok:
    return jsonify({"error": "Recurso no encontrado"}), 404
  return jsonify({"ok": True})


@proyectos_bp.get("/api/proyectos/<int:pid>/documentos")
def api_listar_documentos_proyecto(pid):
  proyectos_db.init_proyectos_db()
  from core.db import conectar as _db_conectar
  with _db_conectar() as conn:
    docs = [dict(r) for r in conn.execute(
      "SELECT * FROM proyecto_documentos WHERE proyecto_id = ? ORDER BY created_at DESC", (pid,)
    ).fetchall()]
  return jsonify({"documentos": docs})


@proyectos_bp.post("/api/proyectos/<int:pid>/documentos")
def api_crear_documento_proyecto(pid):
  proyectos_db.init_proyectos_db()
  data = request.get_json(silent=True) or {}
  nombre = (data.get("nombre") or "").strip()
  if not nombre:
    return jsonify({"error": "El nombre es obligatorio"}), 400
  from core.db import conectar as _db_conectar, now_iso as _db_now
  with _db_conectar() as conn:
    conn.execute("""
      INSERT INTO proyecto_documentos (proyecto_id, nombre, tipo, descripcion, url_externa, fecha_documento, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (pid, nombre, data.get("tipo", "otro"), data.get("descripcion"),
          data.get("url_externa"), data.get("fecha_documento"), _db_now()))
    did = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    doc = dict(conn.execute("SELECT * FROM proyecto_documentos WHERE id = ?", (did,)).fetchone())
  return jsonify(doc), 201


@proyectos_bp.delete("/api/proyectos/<int:pid>/documentos/<int:did>")
def api_eliminar_documento_proyecto(pid, did):
  proyectos_db.init_proyectos_db()
  from core.db import conectar as _db_conectar
  with _db_conectar() as conn:
    conn.execute("DELETE FROM proyecto_documentos WHERE id = ? AND proyecto_id = ?", (did, pid))
  return jsonify({"ok": True})


# ─── Certificaciones ─────────────────────────────────────────────────────────

@proyectos_bp.get("/api/proyectos/<int:pid>/certificaciones")
def api_listar_certificaciones(pid):
  proyectos_db.init_proyectos_db()
  certs = proyectos_db.listar_certificaciones(pid)
  return jsonify({"certificaciones": certs})


@proyectos_bp.post("/api/proyectos/<int:pid>/certificaciones")
def api_crear_certificacion(pid):
  proyectos_db.init_proyectos_db()
  data = request.get_json(silent=True) or {}
  if not data.get('fecha_desde') or not data.get('fecha_hasta'):
    return jsonify({"error": "Fechas requeridas"}), 400
  precios = {
    'precio_hinca': float(data.get('precio_hinca', 0)),
    'precio_hora_admin': float(data.get('precio_hora_admin', 0)),
    'importe_transporte': float(data.get('importe_transporte', 0)),
  }
  cert = proyectos_db.crear_certificacion(pid, data['fecha_desde'], data['fecha_hasta'], precios)
  return jsonify(cert), 201


@proyectos_bp.get("/api/certificaciones/<int:cid>")
def api_obtener_certificacion(cid):
  proyectos_db.init_proyectos_db()
  cert = proyectos_db.obtener_certificacion(cid)
  if not cert:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify(cert)


@proyectos_bp.put("/api/certificaciones/<int:cid>/estado")
def api_cambiar_estado_certificacion(cid):
  proyectos_db.init_proyectos_db()
  data = request.get_json(silent=True) or {}
  from core.db import conectar as _db_conectar, now_iso as _db_now
  with _db_conectar() as conn:
    conn.execute("UPDATE certificaciones SET estado = ?, updated_at = ? WHERE id = ?",
                 [data.get('estado', 'borrador'), _db_now(), cid])
  return jsonify({"ok": True})


@proyectos_bp.delete("/api/certificaciones/<int:cid>")
def api_eliminar_certificacion(cid):
  proyectos_db.init_proyectos_db()
  from core.db import conectar as _db_conectar
  with _db_conectar() as conn:
    conn.execute("DELETE FROM certificacion_detalle WHERE certificacion_id = ?", [cid])
    conn.execute("DELETE FROM certificaciones WHERE id = ?", [cid])
  return jsonify({"ok": True})


@proyectos_bp.get("/api/certificaciones/<int:cid>/pdf")
def api_certificacion_pdf(cid):
  proyectos_db.init_proyectos_db()
  cert = proyectos_db.obtener_certificacion(cid)
  if not cert:
    return jsonify({"error": "Certificación no encontrada"}), 404
  proyecto = proyectos_db.obtener_dashboard_proyecto(cert["proyecto_id"])
  if not proyecto:
    return jsonify({"error": "Proyecto no encontrado"}), 404
  from core.certificaciones_pdf import generar_pdf_certificacion
  pdf_bytes = generar_pdf_certificacion(cert, proyecto)
  nombre = proyecto.get("nombre", "").replace(" ", "_")
  numero = cert.get("numero", 1)
  return send_file(
    io.BytesIO(pdf_bytes),
    mimetype="application/pdf",
    as_attachment=False,
    download_name=f"Certificacion_{nombre}_{numero}.pdf",
  )
