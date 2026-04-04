"""Rutas de proyectos, partes, recursos, documentos y certificaciones."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import time

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


@proyectos_bp.get("/api/proyectos/partes/<int:parte_id>")
def api_obtener_parte(parte_id: int):
  proyectos_db.init_proyectos_db()
  from core.db import conectar as _conectar
  with _conectar() as conn:
    row = conn.execute("SELECT * FROM proyecto_partes WHERE id = ?", (parte_id,)).fetchone()
    if not row:
      return jsonify({"error": "Parte no encontrado"}), 404
    return jsonify(dict(row))


@proyectos_bp.delete("/api/proyectos/partes/<int:parte_id>")
def api_eliminar_parte(parte_id: int):
  ok = proyectos_db.eliminar_parte(parte_id)
  if not ok:
    return jsonify({"error": "Parte no encontrado"}), 404
  return jsonify({"ok": True})


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


@proyectos_bp.get("/api/certificaciones/<int:cid>/partes-zip")
def api_certificacion_partes_zip(cid):
  """Genera un ZIP con las imagenes y resumenes de los partes del periodo de la certificacion."""
  import zipfile

  proyectos_db.init_proyectos_db()
  from core.db import conectar as _conectar
  from config import DATOS_DIR

  with _conectar() as conn:
    cert = conn.execute("SELECT * FROM certificaciones WHERE id = ?", [cid]).fetchone()
    if not cert:
      return jsonify({"error": "Certificacion no encontrada"}), 404
    cert = dict(cert)

    partes = [dict(r) for r in conn.execute("""
      SELECT * FROM proyecto_partes
      WHERE proyecto_id = ? AND fecha >= ? AND fecha <= ?
      ORDER BY fecha
    """, [cert["proyecto_id"], cert["fecha_desde"], cert["fecha_hasta"]]).fetchall()]

    proy = conn.execute("SELECT nombre FROM proyectos WHERE id = ?", [cert["proyecto_id"]]).fetchone()
    nombre_proy = (proy["nombre"] if proy else "proyecto").replace(" ", "_")

  buf = io.BytesIO()
  with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
    if not partes:
      zf.writestr("sin_partes.txt", f"No hay partes de trabajo en el periodo {cert['fecha_desde']} a {cert['fecha_hasta']}.")
    for pt in partes:
      prefix = f"parte_{pt['fecha']}_{pt['id']}"
      # Include image if exists
      if pt.get("imagen_archivo"):
        ruta_img = DATOS_DIR / pt["imagen_archivo"]
        if ruta_img.exists():
          ext = ruta_img.suffix
          zf.write(str(ruta_img), f"{prefix}{ext}")
      # Always include text summary
      resumen = (
        f"Parte de trabajo - {pt['fecha']}\n"
        f"Hincas: {pt.get('hincas_realizadas', 0)}\n"
        f"Horas maquina: {pt.get('horas_maquina', 0)}\n"
        f"Horas personal: {pt.get('horas_personal', 0)}\n"
        f"Operadores: {pt.get('num_operadores', 0)}\n"
        f"Ayudantes: {pt.get('num_ayudantes', 0)}\n"
        f"Gasoil: {pt.get('combustible_litros') or 0} L\n"
        f"Incidencias: {pt.get('incidencias') or 'Ninguna'}\n"
        f"Notas: {pt.get('notas') or ''}\n"
      )
      zf.writestr(f"{prefix}.txt", resumen)

  buf.seek(0)
  return send_file(
    buf,
    mimetype="application/zip",
    as_attachment=True,
    download_name=f"Partes_{nombre_proy}_{cert['fecha_desde']}_a_{cert['fecha_hasta']}.zip",
  )


# ─── OCR de partes de trabajo ────────────────────────────────────────────────

_PROMPT_PARTE_OCR = """Eres un experto en leer partes de trabajo manuscritos de una empresa de hincado de pilotes para parques solares fotovoltaicos.

Extrae los siguientes campos del parte fotografiado. El documento es un formulario impreso de "Hincado Directo" rellenado a mano en español.

Devuelve SOLO un JSON valido sin markdown ni explicaciones, con esta estructura:
{
    "numero_parte": "numero del parte (campo Factura No)",
    "fecha": "YYYY-MM-DD",
    "cliente": "nombre del cliente (campo Razon Social)",
    "obra": "nombre de la obra",
    "poblacion": "poblacion",
    "lineas": [
        {
            "operador": "nombre del operador",
            "maquina": "nombre de la maquina",
            "horas": 10,
            "rol": "operador|ayudante"
        }
    ],
    "total_hincas": 309,
    "horas_admin": 0,
    "incidencias": "texto de incidencias si hay, vacio si no",
    "confianza": "alta|media|baja"
}

Notas para la extraccion:
- Los nombres de maquinas son femeninos italianos: Nicoletta, Antonella, Enmanuela, Lauretta, Marietta, Carmela, Nieves
- Los operadores suelen ser: Diego, Manuel, Ivan, Juanso
- "con" conecta operador con maquina: "Diego con Carmela" = Diego opera la maquina Carmela
- "de ayudante" indica rol de ayudante
- "dia de administracion" o "horas admin" = horas de administracion (no produccion)
- "Total hincas" o "Total de hincas" seguido de un numero = hincas del dia
- Si dice "marchamos" o hay descripcion sin hincas = dia sin produccion (0 hincas)
- La fecha puede estar en formato "06/Marzo/2026" o "06/03/2026"
"""


@proyectos_bp.post("/api/partes/procesar-imagen")
def api_procesar_parte_imagen():
  """Procesa una foto de un parte de trabajo manuscrito con GPT-4 Vision."""
  from config import client as openai_client

  if not openai_client:
    return jsonify({"error": "OpenAI no configurado (falta OPENAI_API_KEY)"}), 500

  archivo = request.files.get("imagen")
  if not archivo or not archivo.filename:
    return _bad_request("No se envio imagen")

  contenido = archivo.read()
  b64 = base64.b64encode(contenido).decode("utf-8")

  ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else "jpeg"
  mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
  mime = mime_map.get(ext, "image/jpeg")

  try:
    response = openai_client.chat.completions.create(
      model="gpt-4o",
      messages=[{
        "role": "user",
        "content": [
          {"type": "text", "text": _PROMPT_PARTE_OCR},
          {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}},
        ],
      }],
      max_tokens=1000,
      temperature=0,
    )

    texto = response.choices[0].message.content.strip()
    from core.llm import limpiar_json_respuesta
    texto = limpiar_json_respuesta(texto)
    datos = json.loads(texto)

    # Guardar imagen para adjuntarla al parte
    nombre_archivo = f"parte_{int(time.time())}_{hashlib.md5(contenido).hexdigest()[:8]}.{ext}"
    from config import DATOS_DIR
    ruta_subidas = DATOS_DIR / "subidas"
    ruta_subidas.mkdir(parents=True, exist_ok=True)
    ruta_dest = ruta_subidas / nombre_archivo
    ruta_dest.write_bytes(contenido)

    datos["imagen_archivo"] = "subidas/" + nombre_archivo
    datos["imagen_ruta"] = str(ruta_dest)

    return jsonify(datos)

  except json.JSONDecodeError as e:
    logger.error("Error parseando respuesta OCR parte: %s - Texto: %s", e, texto[:200])
    return jsonify({"error": "No se pudo interpretar el parte", "texto_crudo": texto[:500]}), 422
  except Exception as e:
    logger.error("Error procesando parte con Vision: %s", e)
    return jsonify({"error": str(e)}), 500


@proyectos_bp.post("/api/partes/guardar-ocr")
def api_guardar_parte_ocr():
  """Guarda un parte de trabajo procesado por OCR, tras revision del usuario."""
  proyectos_db.init_proyectos_db()
  data = request.get_json(silent=True) or {}

  proyecto_id = data.get("proyecto_id")
  if not proyecto_id and data.get("obra"):
    from core.db import conectar as _conectar
    with _conectar() as conn:
      row = conn.execute(
        "SELECT id FROM proyectos WHERE nombre LIKE ? LIMIT 1",
        [f"%{data['obra']}%"],
      ).fetchone()
      if row:
        proyecto_id = row["id"]

  if not proyecto_id:
    return jsonify({"error": "No se encontro el proyecto. Seleccionalo manualmente."}), 400

  lineas = data.get("lineas") or []
  operadores = [l for l in lineas if l.get("rol") != "ayudante"]
  ayudantes = [l for l in lineas if l.get("rol") == "ayudante"]

  parte_data = {
    "fecha": data.get("fecha"),
    "hincas_realizadas": data.get("total_hincas", 0),
    "horas_maquina": sum(l.get("horas", 0) for l in operadores),
    "horas_personal": sum(l.get("horas", 0) for l in lineas),
    "num_operadores": len(operadores),
    "num_ayudantes": len(ayudantes),
    "horas_admin": data.get("horas_admin", 0),
    "incidencias": data.get("incidencias", ""),
    "notas": json.dumps(lineas, ensure_ascii=False),
    "imagen_archivo": data.get("imagen_archivo", ""),
  }

  parte = proyectos_db.crear_parte(int(proyecto_id), parte_data)
  return jsonify(parte), 201


# ── Asignaciones de recursos ──────────────────────────────────────────────

@proyectos_bp.get("/api/proyectos/<int:proyecto_id>/asignaciones")
def api_asignaciones_proyecto(proyecto_id):
  desde = request.args.get("desde", "")
  hasta = request.args.get("hasta", "")
  rows = proyectos_db.obtener_asignaciones_proyecto(proyecto_id, desde, hasta)
  return jsonify({"asignaciones": rows})


@proyectos_bp.post("/api/proyectos/<int:proyecto_id>/asignaciones")
def api_asignar_recurso(proyecto_id):
  data = request.get_json(silent=True) or {}
  tipo = data.get("recurso_tipo", "")
  rid = data.get("recurso_id")
  nombre = data.get("recurso_nombre", "")
  fecha = data.get("fecha", "")
  fecha_hasta = data.get("fecha_hasta", "")

  if not tipo or rid is None or not nombre:
    return jsonify({"error": "recurso_tipo, recurso_id y recurso_nombre requeridos"}), 400

  if fecha_hasta and fecha:
    n = proyectos_db.asignar_rango(proyecto_id, tipo, int(rid), nombre, fecha, fecha_hasta)
    return jsonify({"ok": True, "dias_asignados": n})
  elif fecha:
    row = proyectos_db.asignar_recurso(proyecto_id, tipo, int(rid), nombre, fecha, data.get("notas", ""))
    if not row:
      return jsonify({"error": "Recurso ya asignado en esa fecha"}), 409
    return jsonify(row), 201
  return jsonify({"error": "fecha requerida"}), 400


@proyectos_bp.delete("/api/proyectos/<int:proyecto_id>/asignaciones")
def api_desasignar_recurso(proyecto_id):
  data = request.get_json(silent=True) or {}
  tipo = data.get("recurso_tipo", "")
  rid = data.get("recurso_id")
  fecha = data.get("fecha", "")
  fecha_hasta = data.get("fecha_hasta", "")

  if not tipo or rid is None or not fecha:
    return jsonify({"error": "recurso_tipo, recurso_id y fecha requeridos"}), 400

  if fecha_hasta:
    n = proyectos_db.desasignar_rango(proyecto_id, tipo, int(rid), fecha, fecha_hasta)
  else:
    n = 1 if proyectos_db.desasignar(proyecto_id, tipo, int(rid), fecha) else 0
  return jsonify({"ok": True, "eliminados": n})


@proyectos_bp.get("/api/proyectos/<int:proyecto_id>/recursos")
def api_recursos_proyecto(proyecto_id):
  rows = proyectos_db.obtener_recursos_proyecto(proyecto_id)
  return jsonify({"recursos": rows})


@proyectos_bp.get("/api/recursos/disponibles")
def api_recursos_disponibles():
  fecha = request.args.get("fecha", "")
  tipo = request.args.get("tipo", "")
  if not fecha:
    return jsonify({"error": "fecha requerida"}), 400
  rows = proyectos_db.recursos_disponibles(fecha, tipo)
  return jsonify({"recursos": rows})
