"""Rutas de maquinaria: máquinas, checks semanales, incidencias, tokens operario, notificaciones."""
from __future__ import annotations

import json
import logging
import os

from flask import Blueprint, jsonify, request, render_template_string, send_from_directory, make_response
from flask_login import current_user

from core import maquinaria_db
from core import notificaciones_maquinaria as notif_maq

logger = logging.getLogger("erp")

maquinaria_bp = Blueprint("maquinaria", __name__)

# Directorio para fotos subidas
_FOTOS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fotos_maquinaria")
os.makedirs(_FOTOS_DIR, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CRUD Máquinas (admin, requiere login)                                  ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/maquinas")
def api_listar_maquinas():
  return jsonify({"maquinas": maquinaria_db.listar_maquinas()})


@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>")
def api_obtener_maquina(mid):
  maq = maquinaria_db.obtener_maquina(mid)
  if not maq:
    return jsonify({"error": "No encontrada"}), 404
  return jsonify(maq)


@maquinaria_bp.post("/api/maquinaria/maquinas")
def api_crear_maquina():
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.crear_maquina(data)), 201


@maquinaria_bp.put("/api/maquinaria/maquinas/<int:mid>")
def api_actualizar_maquina(mid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_maquina(mid, data))


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Templates, Checks, Revisiones, Incidencias (admin)                     ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/templates/<tipo>")
def api_templates_checklist(tipo):
  return jsonify({"templates": maquinaria_db.obtener_templates_checklist(tipo)})


@maquinaria_bp.post("/api/maquinaria/checks")
def api_crear_check():
  data = request.get_json(silent=True) or {}
  data["usuario_id"] = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  return jsonify(maquinaria_db.crear_check_semanal(data)), 201


@maquinaria_bp.put("/api/maquinaria/checks/<int:cid>/cerrar")
def api_cerrar_check(cid):
  return jsonify(maquinaria_db.cerrar_check(cid))


@maquinaria_bp.post("/api/maquinaria/revisiones")
def api_crear_revision():
  data = request.get_json(silent=True) or {}
  data["usuario_id"] = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  return jsonify(maquinaria_db.crear_revision(data)), 201


@maquinaria_bp.put("/api/maquinaria/revisiones/<int:rid>/cerrar")
def api_cerrar_revision(rid):
  return jsonify(maquinaria_db.cerrar_revision(rid))


@maquinaria_bp.post("/api/maquinaria/incidencias")
def api_crear_incidencia():
  data = request.get_json(silent=True) or {}
  data["usuario_id"] = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  return jsonify(maquinaria_db.crear_incidencia(data)), 201


@maquinaria_bp.put("/api/maquinaria/incidencias/<int:iid>")
def api_actualizar_incidencia(iid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_incidencia(iid, data))


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Dashboard de mantenimiento (admin)                                     ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/dashboard")
def api_dashboard_mantenimiento():
  return jsonify(maquinaria_db.dashboard_mantenimiento())


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Tokens de acceso operario (admin CRUD)                                 ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/tokens")
def api_listar_tokens():
  maquina_id = request.args.get("maquina_id", type=int)
  return jsonify({"tokens": maquinaria_db.listar_tokens(maquina_id=maquina_id)})


@maquinaria_bp.post("/api/maquinaria/tokens")
def api_crear_token():
  data = request.get_json(silent=True) or {}
  if not data.get("maquina_id"):
    return jsonify({"error": "maquina_id es obligatorio"}), 400
  created_by = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
  token = maquinaria_db.crear_token(
    maquina_id=data["maquina_id"],
    operario_nombre=data.get("operario_nombre", ""),
    created_by=created_by,
    dias_validez=data.get("dias_validez", 90),
  )
  return jsonify(token), 201


@maquinaria_bp.delete("/api/maquinaria/tokens/<int:tid>")
def api_desactivar_token(tid):
  maquinaria_db.desactivar_token(tid)
  return jsonify({"ok": True})


@maquinaria_bp.put("/api/maquinaria/tokens/<int:tid>/reactivar")
def api_reactivar_token(tid):
  data = request.get_json(silent=True) or {}
  token = maquinaria_db.reactivar_token(tid, dias_extra=data.get("dias_validez", 90))
  return jsonify(token)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Fotos adjuntas (admin)                                                 ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.post("/api/maquinaria/fotos")
def api_subir_foto():
  """Sube una foto y la asocia a un check/incidencia/revision."""
  entidad_tipo = request.form.get("entidad_tipo")
  entidad_id = request.form.get("entidad_id", type=int)
  if not entidad_tipo or not entidad_id:
    return jsonify({"error": "entidad_tipo y entidad_id son obligatorios"}), 400
  if entidad_tipo not in ("check", "incidencia", "revision"):
    return jsonify({"error": "entidad_tipo debe ser check, incidencia o revision"}), 400

  f = request.files.get("foto")
  if not f or not f.filename:
    return jsonify({"error": "No se recibió foto"}), 400

  # Nombre seguro con timestamp
  import time
  ext = os.path.splitext(f.filename)[1] or ".jpg"
  safe_name = f"{entidad_tipo}_{entidad_id}_{int(time.time())}{ext}"
  filepath = os.path.join(_FOTOS_DIR, safe_name)
  f.save(filepath)

  foto = maquinaria_db.guardar_foto(entidad_tipo, entidad_id, f.filename, safe_name)
  return jsonify(foto), 201


@maquinaria_bp.get("/api/maquinaria/fotos/<entidad_tipo>/<int:entidad_id>")
def api_listar_fotos(entidad_tipo, entidad_id):
  return jsonify({"fotos": maquinaria_db.listar_fotos(entidad_tipo, entidad_id)})


@maquinaria_bp.get("/fotos_maquinaria/<filename>")
def api_servir_foto(filename):
  return send_from_directory(_FOTOS_DIR, filename)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Acceso público operario via token (SIN LOGIN)                          ██
# ═══════════════════════════════════════════════════════════════════════════════
# Estas rutas empiezan con /m/ y deben excluirse del before_request de login.

@maquinaria_bp.get("/m/<token>")
def operario_pagina(token):
  """Página pública para operario: ve la máquina y puede hacer check/reportar."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return _render_operario_error("Token inválido o expirado"), 403
  # Cargar datos completos de la máquina
  maq = maquinaria_db.obtener_maquina(info["maquina_id"])
  if not maq:
    return _render_operario_error("Máquina no encontrada"), 404
  templates = maquinaria_db.obtener_templates_checklist("semanal")
  return _render_operario_page(token, info, maq, templates)


@maquinaria_bp.get("/api/m/<token>/maquina")
def api_operario_maquina(token):
  """API pública: datos de la máquina para el operario."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403
  maq = maquinaria_db.obtener_maquina(info["maquina_id"])
  if not maq:
    return jsonify({"error": "Máquina no encontrada"}), 404
  return jsonify({
    "maquina": maq,
    "operario": info.get("operario_nombre", ""),
    "templates_semanal": maquinaria_db.obtener_templates_checklist("semanal"),
  })


@maquinaria_bp.post("/api/m/<token>/check")
def api_operario_check(token):
  """API pública: operario crea un check semanal."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403
  data = request.get_json(silent=True) or {}
  data["maquina_id"] = info["maquina_id"]
  data["usuario_id"] = None  # Operario sin cuenta
  check = maquinaria_db.crear_check_semanal(data)
  # Auto-cerrar el check (el operario lo completa de una vez)
  maquinaria_db.cerrar_check(check["id"])
  return jsonify(check), 201


@maquinaria_bp.post("/api/m/<token>/incidencia")
def api_operario_incidencia(token):
  """API pública: operario reporta una incidencia."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403
  data = request.get_json(silent=True) or {}
  data["maquina_id"] = info["maquina_id"]
  data["usuario_id"] = None
  return jsonify(maquinaria_db.crear_incidencia(data)), 201


@maquinaria_bp.post("/api/m/<token>/foto")
def api_operario_foto(token):
  """API pública: operario sube una foto o vídeo."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403
  entidad_tipo = request.form.get("entidad_tipo", "check")
  entidad_id = request.form.get("entidad_id", type=int)
  if not entidad_id:
    return jsonify({"error": "entidad_id obligatorio"}), 400

  f = request.files.get("foto")
  if not f or not f.filename:
    return jsonify({"error": "No se recibió archivo"}), 400

  # Limitar tamaño (50MB para vídeos)
  import time
  ext = os.path.splitext(f.filename)[1] or ".jpg"
  safe_name = f"op_{entidad_tipo}_{entidad_id}_{int(time.time())}{ext}"
  filepath = os.path.join(_FOTOS_DIR, safe_name)
  f.save(filepath)
  foto = maquinaria_db.guardar_foto(entidad_tipo, entidad_id, f.filename, safe_name)
  return jsonify(foto), 201


# ═══════════════════════════════════════════════════════════════════════════════
# ██  HTML templates para operario (inline, sin Jinja separado)              ██
# ═══════════════════════════════════════════════════════════════════════════════

def _render_operario_error(msg):
  return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error — Hincado ERP</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa; }}
  .card {{ background:#fff;border-radius:12px;padding:2rem;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center;max-width:400px; }}
  h2 {{ color:#dc3545;margin-top:0; }}
</style></head><body>
<div class="card"><h2>Acceso denegado</h2><p>{msg}</p><p style="color:#6c757d;font-size:.85rem;">Solicita un nuevo enlace a tu encargado.</p></div>
</body></html>"""


def _render_operario_page(token, info, maq, templates):
  """Renderiza la página mobile-friendly del operario."""
  nombre_maq = maq.get("nombre", "Máquina")
  modelo = maq.get("modelo", "")
  horometro = maq.get("horometro_actual", 0)
  operario = info.get("operario_nombre", "Operario")
  incidencias_abiertas = [i for i in maq.get("incidencias", []) if i.get("estado") != "cerrada"]

  # Construir items del checklist
  checklist_html = ""
  for t in templates:
    checklist_html += f"""
      <div class="check-item">
        <label>
          <input type="checkbox" name="item_{t['id']}" value="1">
          <strong>{t['nombre']}</strong>
        </label>
        <small>{t.get('descripcion', '')}</small>
        <input type="text" name="nota_{t['id']}" placeholder="Nota (opcional)" class="nota-input">
      </div>"""

  # Incidencias abiertas
  inc_html = ""
  if incidencias_abiertas:
    for i in incidencias_abiertas:
      sev_color = {"baja": "#22c55e", "media": "#f59e0b", "alta": "#ef4444", "seguridad": "#dc2626"}.get(i.get("severidad", "media"), "#6c757d")
      inc_html += f"""<div class="inc-item" style="border-left:4px solid {sev_color};">
        <strong>{i.get('descripcion', '')}</strong>
        <small>{i.get('fecha', '')} — {i.get('severidad', '').upper()}</small>
      </div>"""
  else:
    inc_html = '<p style="color:#6c757d;">Sin incidencias abiertas</p>'

  return f"""<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{nombre_maq} — Mantenimiento</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; }}
  .header {{ background: linear-gradient(135deg, #1e3a5f, #2d5a87); color: #fff; padding: 1.2rem 1rem; text-align: center; }}
  .header h1 {{ font-size: 1.3rem; margin-bottom: .3rem; }}
  .header .sub {{ font-size: .85rem; opacity: .85; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 1rem; }}
  .card {{ background: #fff; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }}
  .card h3 {{ font-size: 1rem; margin-bottom: .75rem; color: #1e3a5f; border-bottom: 2px solid #e9ecef; padding-bottom: .5rem; }}
  .kpi-row {{ display: flex; gap: .5rem; margin-bottom: .5rem; }}
  .kpi {{ flex: 1; background: #f8f9fa; border-radius: 8px; padding: .6rem; text-align: center; }}
  .kpi .val {{ font-size: 1.2rem; font-weight: 700; color: #1e3a5f; }}
  .kpi .lbl {{ font-size: .7rem; color: #6c757d; text-transform: uppercase; }}
  .check-item {{ padding: .6rem 0; border-bottom: 1px solid #f0f0f0; }}
  .check-item label {{ display: flex; align-items: center; gap: .5rem; font-size: .95rem; }}
  .check-item small {{ display: block; margin-left: 1.8rem; color: #6c757d; font-size: .8rem; }}
  .nota-input {{ width: calc(100% - 1.8rem); margin-left: 1.8rem; margin-top: .3rem; border: 1px solid #dee2e6; border-radius: 6px; padding: .35rem .5rem; font-size: .85rem; display: none; }}
  .check-item input[type="checkbox"]:checked ~ .nota-input {{ display: block; }}
  .inc-item {{ padding: .5rem .8rem; margin-bottom: .5rem; background: #fef2f2; border-radius: 6px; }}
  .inc-item strong {{ font-size: .9rem; display: block; }}
  .inc-item small {{ color: #6c757d; }}
  .btn {{ display: block; width: 100%; padding: .8rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; text-align: center; }}
  .btn-primary {{ background: #1e3a5f; color: #fff; }}
  .btn-primary:active {{ background: #16304d; }}
  .btn-danger {{ background: #dc3545; color: #fff; margin-top: .5rem; }}
  .btn-danger:active {{ background: #c82333; }}
  .btn:disabled {{ opacity: .5; cursor: not-allowed; }}
  textarea {{ width: 100%; border: 1px solid #dee2e6; border-radius: 6px; padding: .5rem; font-size: .9rem; resize: vertical; min-height: 60px; }}
  select {{ width: 100%; border: 1px solid #dee2e6; border-radius: 6px; padding: .5rem; font-size: .9rem; }}
  .form-group {{ margin-bottom: .8rem; }}
  .form-group label {{ font-weight: 600; font-size: .85rem; display: block; margin-bottom: .3rem; }}
  .toast {{ position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e3a5f; color: #fff; padding: .7rem 1.5rem; border-radius: 8px; font-size: .9rem; display: none; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.2); }}
  .toast.ok {{ background: #16a34a; }}
  .toast.err {{ background: #dc3545; }}
  input[type="number"] {{ width: 100%; border: 1px solid #dee2e6; border-radius: 6px; padding: .5rem; font-size: .9rem; }}
  .hint {{ font-size: .78rem; color: #6c757d; margin-bottom: .4rem; }}
  .hint strong {{ color: #1e3a5f; }}
  .req {{ font-size: .7rem; color: #dc3545; font-weight: 400; }}
  .field-error {{ display: none; font-size: .8rem; color: #dc3545; margin-top: .3rem; padding: .4rem .6rem; background: #fef2f2; border-radius: 4px; }}
  .file-upload-area {{ border: 2px dashed #dee2e6; border-radius: 8px; padding: 1.2rem; text-align: center; cursor: pointer; transition: border-color .2s, background .2s; background: #fafafa; }}
  .file-upload-area:active {{ background: #f0f0f0; }}
  .file-upload-icon {{ font-size: 2rem; margin-bottom: .3rem; }}
  .file-upload-text {{ font-size: .85rem; color: #6c757d; }}
  .file-upload-name {{ font-size: .75rem; color: #495057; margin-top: .3rem; word-break: break-all; }}
  .adjunto-item {{ display: flex; justify-content: space-between; align-items: center; padding: .5rem .7rem; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; margin-top: .4rem; font-size: .82rem; }}
  .adjunto-item small {{ color: #6c757d; }}
  .adjunto-remove {{ background: none; border: none; color: #dc3545; font-size: 1.2rem; cursor: pointer; padding: 0 .3rem; font-weight: 700; }}
  .btn-add-more {{ display: none; width: 100%; padding: .5rem; border: 1px dashed #6c757d; border-radius: 6px; background: transparent; color: #6c757d; font-size: .85rem; cursor: pointer; margin-top: .5rem; text-align: center; }}
  .btn-add-more:active {{ background: #f0f0f0; }}
</style></head><body>

<div class="header">
  <h1>{nombre_maq}</h1>
  <div class="sub">{modelo} &middot; Operario: {operario}</div>
</div>

<div class="container">
  <!-- KPIs -->
  <div class="kpi-row">
    <div class="kpi"><div class="val">{horometro:.0f}</div><div class="lbl">Horómetro</div></div>
    <div class="kpi"><div class="val">{len(maq.get('revisiones_pendientes', []))}</div><div class="lbl">Rev. pendientes</div></div>
    <div class="kpi"><div class="val">{len(incidencias_abiertas)}</div><div class="lbl">Incidencias</div></div>
  </div>

  <!-- Check semanal -->
  <div class="card">
    <h3>Check semanal</h3>
    <form id="form-check" onsubmit="return enviarCheck(event)">
      <div class="form-group">
        <label>Hor&oacute;metro actual</label>
        <div class="hint">&Uacute;ltima medida registrada: <strong>{horometro:.1f} h</strong></div>
        <input type="number" id="check-horometro" step="0.1" min="{horometro}" value="" placeholder="{horometro}" required>
        <div id="horo-error" class="field-error"></div>
      </div>
      <div class="form-group">
        <label>Foto del hor&oacute;metro <span class="req">*obligatoria</span></label>
        <div class="hint">Haz una foto a la pantalla del hor&oacute;metro para verificar las horas</div>
        <div class="file-upload-area" id="area-foto-horo" onclick="document.getElementById('foto-horometro').click()">
          <div class="file-upload-icon">&#128247;</div>
          <div class="file-upload-text">Pulsa para hacer foto</div>
          <div id="foto-horo-name" class="file-upload-name"></div>
        </div>
        <input type="file" id="foto-horometro" accept="image/*" capture="environment" style="display:none;" onchange="previewFotoHoro(this)">
      </div>
      {checklist_html}
      <div class="form-group" style="margin-top:.8rem;">
        <label>Observaciones generales</label>
        <textarea id="check-obs" rows="2"></textarea>
      </div>
      <button type="submit" class="btn btn-primary" id="btn-check">Enviar check semanal</button>
    </form>
  </div>

  <!-- Incidencias abiertas -->
  <div class="card">
    <h3>Incidencias abiertas ({len(incidencias_abiertas)})</h3>
    {inc_html}
  </div>

  <!-- Reportar incidencia -->
  <div class="card">
    <h3>Reportar incidencia</h3>
    <form id="form-inc" onsubmit="return enviarIncidencia(event)">
      <div class="form-group">
        <label>Descripci&oacute;n *</label>
        <textarea id="inc-desc" rows="3" required></textarea>
      </div>
      <div class="form-group">
        <label>Severidad</label>
        <select id="inc-sev">
          <option value="baja">Baja</option>
          <option value="media" selected>Media</option>
          <option value="alta">Alta</option>
          <option value="seguridad">Seguridad (parada)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Foto o v&iacute;deo (opcional)</label>
        <div class="hint">Adjunta evidencia de la incidencia</div>
        <div class="file-upload-area" id="area-foto-inc" onclick="document.getElementById('foto-incidencia').click()">
          <div class="file-upload-icon">&#128247; &#127909;</div>
          <div class="file-upload-text">Pulsa para adjuntar foto o v&iacute;deo</div>
          <div id="foto-inc-preview"></div>
        </div>
        <input type="file" id="foto-incidencia" accept="image/*,video/*" capture="environment" style="display:none;" onchange="previewFotoInc(this)">
        <div id="inc-adjuntos-list"></div>
        <button type="button" class="btn-add-more" id="btn-add-more-inc" style="display:none;" onclick="document.getElementById('foto-incidencia-extra').click()">+ A&ntilde;adir otra foto/v&iacute;deo</button>
        <input type="file" id="foto-incidencia-extra" accept="image/*,video/*" capture="environment" style="display:none;" onchange="addExtraFotoInc(this)">
      </div>
      <button type="submit" class="btn btn-danger" id="btn-inc">Reportar incidencia</button>
    </form>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
var TOKEN = "{token}";
var HORO_MIN = {horometro};
var incFiles = [];

function toast(msg, ok) {{
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok" : "err");
  t.style.display = "block";
  setTimeout(function() {{ t.style.display = "none"; }}, 3500);
}}

/* ── Validación horómetro ── */
var horoInput = document.getElementById("check-horometro");
horoInput.addEventListener("input", function() {{
  var val = parseFloat(this.value);
  var errDiv = document.getElementById("horo-error");
  if (val && val < HORO_MIN) {{
    errDiv.textContent = "El hor\u00f3metro no puede ser menor a " + HORO_MIN.toFixed(1) + "h. Las horas no van hacia atr\u00e1s.";
    errDiv.style.display = "block";
    this.style.borderColor = "#dc3545";
  }} else {{
    errDiv.style.display = "none";
    this.style.borderColor = "#dee2e6";
  }}
}});

/* ── Preview foto horómetro ── */
function previewFotoHoro(input) {{
  var area = document.getElementById("area-foto-horo");
  var nameDiv = document.getElementById("foto-horo-name");
  if (input.files && input.files[0]) {{
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {{
      area.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:200px;border-radius:6px;margin-bottom:.3rem;">' +
        '<div class="file-upload-name">' + file.name + '</div>' +
        '<div style="font-size:.75rem;color:#16a34a;font-weight:600;">Foto cargada</div>';
      area.style.borderColor = "#16a34a";
    }};
    reader.readAsDataURL(file);
  }}
}}

/* ── Preview foto/vídeo incidencia ── */
function previewFotoInc(input) {{
  if (input.files && input.files[0]) {{
    incFiles.push(input.files[0]);
    renderIncFiles();
  }}
}}

function addExtraFotoInc(input) {{
  if (input.files && input.files[0]) {{
    incFiles.push(input.files[0]);
    renderIncFiles();
    input.value = "";
  }}
}}

function removeIncFile(idx) {{
  incFiles.splice(idx, 1);
  renderIncFiles();
}}

function renderIncFiles() {{
  var list = document.getElementById("inc-adjuntos-list");
  var area = document.getElementById("area-foto-inc");
  var addBtn = document.getElementById("btn-add-more-inc");
  if (incFiles.length === 0) {{
    list.innerHTML = "";
    area.style.display = "block";
    addBtn.style.display = "none";
    return;
  }}
  area.style.display = "none";
  addBtn.style.display = "block";
  var html = "";
  incFiles.forEach(function(f, i) {{
    var isVideo = f.type.startsWith("video");
    var icon = isVideo ? "&#127909;" : "&#128247;";
    var size = (f.size / 1024).toFixed(0) + " KB";
    if (f.size > 1048576) size = (f.size / 1048576).toFixed(1) + " MB";
    html += '<div class="adjunto-item">' +
      '<span>' + icon + ' ' + f.name + ' <small>(' + size + ')</small></span>' +
      '<button type="button" onclick="removeIncFile(' + i + ')" class="adjunto-remove">&times;</button></div>';
  }});
  list.innerHTML = html;
}}

/* ── Enviar check ── */
function enviarCheck(e) {{
  e.preventDefault();
  var btn = document.getElementById("btn-check");
  var horoVal = parseFloat(document.getElementById("check-horometro").value) || 0;

  // Validar horómetro
  if (horoVal < HORO_MIN) {{
    toast("El hor\u00f3metro no puede ser menor a " + HORO_MIN.toFixed(1) + "h", false);
    return false;
  }}

  // Validar foto horómetro
  var fotoHoro = document.getElementById("foto-horometro");
  if (!fotoHoro.files || !fotoHoro.files[0]) {{
    toast("La foto del hor\u00f3metro es obligatoria", false);
    document.getElementById("area-foto-horo").style.borderColor = "#dc3545";
    return false;
  }}

  btn.disabled = true;
  btn.textContent = "Enviando...";

  var checklist = {{}};
  var items = document.querySelectorAll('#form-check input[type="checkbox"]');
  items.forEach(function(cb) {{
    var id = cb.name.replace("item_", "");
    var nota = document.querySelector('input[name="nota_' + id + '"]');
    checklist[id] = {{ ok: cb.checked, nota: nota ? nota.value : "" }};
  }});

  var body = {{
    horometro: horoVal,
    checklist: checklist,
    observaciones: document.getElementById("check-obs").value
  }};

  // 1. Crear el check
  fetch("/api/m/" + TOKEN + "/check", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(body)
  }})
  .then(function(r) {{ return r.json(); }})
  .then(function(d) {{
    if (d.error) {{ toast(d.error, false); btn.disabled = false; btn.textContent = "Enviar check semanal"; return; }}
    // 2. Subir foto del horómetro
    var formData = new FormData();
    formData.append("foto", fotoHoro.files[0]);
    formData.append("entidad_tipo", "check");
    formData.append("entidad_id", d.id);
    return fetch("/api/m/" + TOKEN + "/foto", {{
      method: "POST",
      body: formData
    }}).then(function() {{
      toast("Check enviado correctamente", true);
      btn.disabled = false;
      btn.textContent = "Enviar check semanal";
      // Reset form
      document.getElementById("form-check").reset();
      var area = document.getElementById("area-foto-horo");
      area.innerHTML = '<div class="file-upload-icon">&#128247;</div><div class="file-upload-text">Pulsa para hacer foto</div><div id="foto-horo-name" class="file-upload-name"></div>';
      area.style.borderColor = "#dee2e6";
    }});
  }})
  .catch(function(err) {{ toast("Error: " + err.message, false); btn.disabled = false; btn.textContent = "Enviar check semanal"; }});
  return false;
}}

/* ── Enviar incidencia ── */
function enviarIncidencia(e) {{
  e.preventDefault();
  var btn = document.getElementById("btn-inc");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  var body = {{
    descripcion: document.getElementById("inc-desc").value,
    severidad: document.getElementById("inc-sev").value
  }};

  fetch("/api/m/" + TOKEN + "/incidencia", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(body)
  }})
  .then(function(r) {{ return r.json(); }})
  .then(function(d) {{
    if (d.error) {{ toast(d.error, false); btn.disabled = false; btn.textContent = "Reportar incidencia"; return; }}

    // Subir archivos adjuntos si hay
    if (incFiles.length === 0) {{
      toast("Incidencia reportada", true);
      resetIncForm();
      return;
    }}

    var uploads = incFiles.map(function(file) {{
      var fd = new FormData();
      fd.append("foto", file);
      fd.append("entidad_tipo", "incidencia");
      fd.append("entidad_id", d.id);
      return fetch("/api/m/" + TOKEN + "/foto", {{ method: "POST", body: fd }});
    }});

    Promise.all(uploads).then(function() {{
      toast("Incidencia reportada con " + incFiles.length + " adjunto(s)", true);
      resetIncForm();
    }}).catch(function() {{
      toast("Incidencia creada pero fallo al subir adjuntos", false);
      resetIncForm();
    }});
  }})
  .catch(function(err) {{ toast("Error: " + err.message, false); btn.disabled = false; btn.textContent = "Reportar incidencia"; }});
  return false;
}}

function resetIncForm() {{
  document.getElementById("form-inc").reset();
  document.getElementById("btn-inc").disabled = false;
  document.getElementById("btn-inc").textContent = "Reportar incidencia";
  incFiles = [];
  renderIncFiles();
  var area = document.getElementById("area-foto-inc");
  area.innerHTML = '<div class="file-upload-icon">&#128247; &#127909;</div><div class="file-upload-text">Pulsa para adjuntar foto o v\u00eddeo</div><div id="foto-inc-preview"></div>';
  area.style.display = "block";
}}
</script>
</body></html>"""


# ═══════════════════════════════════════════════════════════════════════════════
# ██  API Notificaciones de mantenimiento (admin)                            ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/maintenance/tasks")
def api_maintenance_tasks():
  """Lista todas las tareas de mantenimiento programado."""
  return jsonify({"tasks": notif_maq.listar_maintenance_tasks()})


@maquinaria_bp.get("/api/maquinaria/maintenance/due")
def api_maintenance_due():
  """Calcula tareas de mantenimiento pendientes."""
  machine = request.args.get("machine_id", type=int)
  return jsonify({"due": notif_maq.calcular_tareas_due(maquina_id=machine)})


@maquinaria_bp.post("/api/maquinaria/maintenance/notify")
def api_maintenance_notify():
  """Ejecuta ciclo de notificaciones (admin trigger manual)."""
  data = request.get_json(silent=True) or {}
  dry_run = data.get("dry_run", True)
  resumen = notif_maq.ejecutar_ciclo_notificaciones(dry_run=dry_run)
  return jsonify(resumen)


@maquinaria_bp.get("/api/maquinaria/maintenance/logs")
def api_maintenance_logs():
  """Historial de mantenimientos completados."""
  machine = request.args.get("machine_id", type=int)
  task = request.args.get("task_code")
  return jsonify({"logs": notif_maq.listar_maintenance_logs(maquina_id=machine, task_code=task)})


@maquinaria_bp.get("/api/maquinaria/notifications/log")
def api_notifications_log():
  """Historial de notificaciones enviadas."""
  machine = request.args.get("machine_id", type=int)
  return jsonify({"notifications": notif_maq.listar_notification_log(maquina_id=machine)})


@maquinaria_bp.post("/api/maquinaria/operario-contacto")
def api_guardar_contacto():
  """Guardar/actualizar contacto del operario (teléfono, canal)."""
  data = request.get_json(silent=True) or {}
  if not data.get("token_id") or not data.get("telefono"):
    return jsonify({"error": "token_id y telefono son obligatorios"}), 400
  contacto = notif_maq.guardar_contacto_operario(
    token_id=data["token_id"],
    telefono=data["telefono"],
    canal=data.get("canal", "whatsapp"),
    email=data.get("email", ""),
  )
  return jsonify(contacto)


@maquinaria_bp.put("/api/maquinaria/operario-contacto/<int:tid>/toggle")
def api_toggle_notif(tid):
  data = request.get_json(silent=True) or {}
  return jsonify(notif_maq.toggle_notificaciones(tid, data.get("activas", True)))


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Rutas /w/ — Formulario específico por tarea (operario, sin login)      ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/w/<token>/mantenimiento")
def operario_form_mantenimiento(token):
  """Página pública: formulario de mantenimiento específico por tarea."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return _render_operario_error("Token inválido o expirado"), 403

  machine_id = request.args.get("machine", type=int) or info["maquina_id"]
  task_code = request.args.get("task")
  due_hours = request.args.get("due", type=float, default=0)

  maq = maquinaria_db.obtener_maquina(machine_id)
  if not maq:
    return _render_operario_error("Máquina no encontrada"), 404

  task = notif_maq.obtener_task_by_code(task_code) if task_code else None
  if not task:
    return _render_operario_error("Tarea de mantenimiento no encontrada"), 404

  checklist = json.loads(task.get("checklist_json") or "[]")
  resp = make_response(_render_form_mantenimiento(token, info, maq, task, checklist, due_hours))
  resp.headers["X-Robots-Tag"] = "noindex, nofollow"
  return resp


@maquinaria_bp.post("/api/w/<token>/mantenimiento")
def api_operario_completar_mantenimiento(token):
  """API pública: operario completa un mantenimiento específico (single task)."""
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403

  data = request.get_json(silent=True) or {}
  task_code = data.get("task_code")
  if not task_code:
    return jsonify({"error": "task_code es obligatorio"}), 400

  task = notif_maq.obtener_task_by_code(task_code)
  if not task:
    return jsonify({"error": "Tarea no encontrada"}), 404

  horometro = data.get("horometro_at", 0)
  if horometro < (info.get("horometro_actual") or 0):
    return jsonify({"error": f"Horómetro no puede ser menor a {info['horometro_actual']:.0f}h"}), 400

  log = notif_maq.completar_mantenimiento(
    maquina_id=info["maquina_id"],
    task_code=task_code,
    due_hours=data.get("due_hours", 0),
    horometro_at=horometro,
    operario_nombre=info.get("operario_nombre", ""),
    token_id=info.get("id"),
    observaciones=data.get("observaciones", ""),
    checklist_result=data.get("checklist_result"),
  )

  # Actualizar horómetro de la máquina si es mayor
  if horometro > (info.get("horometro_actual") or 0):
    maquinaria_db.actualizar_maquina(info["maquina_id"], {"horometro_actual": horometro})

  return jsonify(log), 201


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Revisión combinada (cascading)                                          ██
# ██  /w/<token>/revision?due=6000  → muestra TODAS las tareas que tocan      ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/w/<token>/revision")
def operario_form_revision(token):
  """Página pública: formulario combinado de revisión.

  Agrupa automáticamente todas las tareas cuyos intervalos son divisores
  del parámetro `due`.  Ejemplo: due=6000 → bloques de 500h + 1000h + 2000h.
  """
  info = maquinaria_db.validar_token(token)
  if not info:
    return _render_operario_error("Token inválido o expirado"), 403

  machine_id = request.args.get("machine", type=int) or info["maquina_id"]
  due_hours = request.args.get("due", type=float, default=0)

  maq = maquinaria_db.obtener_maquina(machine_id)
  if not maq:
    return _render_operario_error("Máquina no encontrada"), 404

  if due_hours <= 0:
    return _render_operario_error("Parámetro 'due' es obligatorio (ej. ?due=6000)"), 400

  revision = notif_maq.calcular_revision_combinada(machine_id, due_hours)
  if revision["total_tareas"] == 0:
    return _render_operario_error("No hay tareas de mantenimiento para este umbral."), 404

  resp = make_response(_render_form_revision(token, info, maq, revision, due_hours))
  resp.headers["X-Robots-Tag"] = "noindex, nofollow"
  return resp


@maquinaria_bp.post("/api/w/<token>/revision")
def api_operario_completar_revision(token):
  """API pública: operario completa una revisión combinada (multi-task).

  Body esperado:
    {
      "due_hours": 6000,
      "horometro_at": 6100.5,
      "observaciones": "...",
      "tasks": {
        "HIDRAULICO_NIVEL_500H": { "cl_0": true, "cl_1": true, "obs": "..." },
        "PINZA_EXTRACCION_500H": { "cl_0": true, ... },
        ...
      }
    }
  """
  info = maquinaria_db.validar_token(token)
  if not info:
    return jsonify({"error": "Token inválido o expirado"}), 403

  data = request.get_json(silent=True) or {}
  horometro = data.get("horometro_at", 0)
  due_hours = data.get("due_hours", 0)
  tasks_data = data.get("tasks", {})
  observaciones = data.get("observaciones", "")

  if not tasks_data:
    return jsonify({"error": "No hay tareas a completar"}), 400

  horo_actual = info.get("horometro_actual") or 0
  if horometro < horo_actual:
    return jsonify({"error": f"Horómetro no puede ser menor a {horo_actual:.0f}h"}), 400

  # Registrar cada tarea como un log independiente
  logs = []
  for task_code, checklist_result in tasks_data.items():
    task = notif_maq.obtener_task_by_code(task_code)
    if not task:
      continue  # Ignorar códigos desconocidos

    log = notif_maq.completar_mantenimiento(
      maquina_id=info["maquina_id"],
      task_code=task_code,
      due_hours=due_hours,
      horometro_at=horometro,
      operario_nombre=info.get("operario_nombre", ""),
      token_id=info.get("id"),
      observaciones=observaciones,
      checklist_result=checklist_result,
    )
    logs.append(log)

  # Actualizar horómetro de la máquina si es mayor
  if horometro > horo_actual:
    maquinaria_db.actualizar_maquina(info["maquina_id"], {"horometro_actual": horometro})

  return jsonify({"ok": True, "total_completadas": len(logs), "logs": logs}), 201


def _render_form_mantenimiento(token, info, maq, task, checklist, due_hours):
  """Renderiza formulario mobile-friendly específico por tarea de mantenimiento."""
  nombre_maq = maq.get("nombre", "Máquina")
  modelo = maq.get("modelo", "")
  horometro = maq.get("horometro_actual", 0)
  operario = info.get("operario_nombre", "Operario")
  task_nombre = task.get("nombre", "")
  task_desc = task.get("descripcion", "")
  requires_workshop = task.get("requires_workshop", 0)
  task_code = task.get("code", "")

  # Checklist items HTML
  checklist_html = ""
  for i, item in enumerate(checklist):
    tipo = item.get("tipo", "check")
    if tipo == "check":
      checklist_html += f"""
        <div class="check-item">
          <label><input type="checkbox" name="cl_{i}" value="1"> {item['item']}</label>
        </div>"""
    elif tipo == "texto":
      checklist_html += f"""
        <div class="check-item">
          <label>{item['item']}</label>
          <input type="text" name="cl_{i}" class="text-input" placeholder="Introducir valor...">
        </div>"""

  workshop_banner = ""
  if requires_workshop:
    workshop_banner = '<div class="workshop-banner">Esta tarea REQUIERE TALLER AUTORIZADO. Confirma que se ha realizado en taller.</div>'

  return f"""<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{task_nombre} — {nombre_maq}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; }}
  .header {{ background: linear-gradient(135deg, #1e3a5f, #2d5a87); color: #fff; padding: 1.2rem 1rem; text-align: center; }}
  .header h1 {{ font-size: 1.2rem; margin-bottom: .2rem; }}
  .header .sub {{ font-size: .8rem; opacity: .85; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 1rem; }}
  .card {{ background: #fff; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }}
  .card h3 {{ font-size: 1rem; margin-bottom: .5rem; color: #1e3a5f; }}
  .task-desc {{ font-size: .85rem; color: #6c757d; margin-bottom: .8rem; line-height: 1.4; }}
  .workshop-banner {{ background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: .8rem; color: #dc2626; font-weight: 600; font-size: .85rem; margin-bottom: 1rem; text-align: center; }}
  .form-group {{ margin-bottom: .8rem; }}
  .form-group label {{ font-weight: 600; font-size: .85rem; display: block; margin-bottom: .3rem; }}
  .hint {{ font-size: .78rem; color: #6c757d; margin-bottom: .4rem; }}
  .hint strong {{ color: #1e3a5f; }}
  input[type="number"], input[type="text"], textarea {{ width: 100%; border: 1px solid #dee2e6; border-radius: 6px; padding: .5rem; font-size: .9rem; }}
  textarea {{ resize: vertical; min-height: 60px; }}
  .check-item {{ padding: .5rem 0; border-bottom: 1px solid #f0f0f0; }}
  .check-item label {{ display: flex; align-items: center; gap: .5rem; font-size: .9rem; cursor: pointer; }}
  .check-item input[type="checkbox"] {{ width: 20px; height: 20px; accent-color: #16a34a; }}
  .text-input {{ margin-top: .3rem; }}
  .field-error {{ display: none; font-size: .8rem; color: #dc3545; margin-top: .3rem; padding: .4rem .6rem; background: #fef2f2; border-radius: 4px; }}
  .btn {{ display: block; width: 100%; padding: .8rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; text-align: center; }}
  .btn-primary {{ background: #16a34a; color: #fff; }}
  .btn-primary:active {{ background: #15803d; }}
  .btn:disabled {{ opacity: .5; cursor: not-allowed; }}
  .file-upload-area {{ border: 2px dashed #dee2e6; border-radius: 8px; padding: 1rem; text-align: center; cursor: pointer; background: #fafafa; }}
  .file-upload-area:active {{ background: #f0f0f0; }}
  .toast {{ position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e3a5f; color: #fff; padding: .7rem 1.5rem; border-radius: 8px; font-size: .9rem; display: none; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.2); }}
  .toast.ok {{ background: #16a34a; }}
  .toast.err {{ background: #dc3545; }}
  .success-screen {{ display: none; text-align: center; padding: 3rem 1rem; }}
  .success-screen .icon {{ font-size: 4rem; margin-bottom: 1rem; }}
  .success-screen h2 {{ color: #16a34a; margin-bottom: .5rem; }}
  .success-screen p {{ color: #6c757d; }}
  .req {{ font-size: .7rem; color: #dc3545; font-weight: 400; }}
</style></head><body>

<div class="header">
  <h1>{task_nombre}</h1>
  <div class="sub">{nombre_maq} ({modelo}) &middot; Operario: {operario}</div>
</div>

<div class="container" id="form-container">
  {workshop_banner}

  <div class="card">
    <h3>Detalles de la tarea</h3>
    <p class="task-desc">{task_desc}</p>
    <div style="display:flex;gap:.5rem;font-size:.82rem;color:#6c757d;">
      <span>Intervalo: <strong>{task.get('intervalo_horas', 0)}h</strong></span>
      <span>&middot;</span>
      <span>Due: <strong>{due_hours:.0f}h</strong></span>
      <span>&middot;</span>
      <span>Actual: <strong>{horometro:.0f}h</strong></span>
    </div>
  </div>

  <form id="form-maint" onsubmit="return enviarMantenimiento(event)">
    <div class="card">
      <h3>Hor&oacute;metro</h3>
      <div class="form-group">
        <div class="hint">&Uacute;ltima medida: <strong>{horometro:.1f}h</strong></div>
        <input type="number" id="maint-horo" step="0.1" min="{horometro}" placeholder="{horometro}" required>
        <div id="horo-error" class="field-error"></div>
      </div>
      <div class="form-group">
        <label>Foto hor&oacute;metro <span class="req">*obligatoria</span></label>
        <div class="file-upload-area" onclick="document.getElementById('foto-horo').click()">
          <div style="font-size:1.5rem;">&#128247;</div>
          <div style="font-size:.82rem;color:#6c757d;">Pulsa para foto</div>
          <div id="foto-horo-preview"></div>
        </div>
        <input type="file" id="foto-horo" accept="image/*" capture="environment" style="display:none;" onchange="previewHoro(this)">
      </div>
    </div>

    <div class="card">
      <h3>Checklist</h3>
      {checklist_html}
    </div>

    <div class="card">
      <h3>Observaciones</h3>
      <textarea id="maint-obs" rows="3" placeholder="Notas, piezas sustituidas, etc."></textarea>
    </div>

    <div class="card">
      <h3>Fotos del trabajo (opcional)</h3>
      <div class="file-upload-area" onclick="document.getElementById('fotos-trabajo').click()">
        <div style="font-size:1.5rem;">&#128247;</div>
        <div style="font-size:.82rem;color:#6c757d;">Adjuntar fotos del mantenimiento</div>
      </div>
      <input type="file" id="fotos-trabajo" accept="image/*" capture="environment" multiple style="display:none;" onchange="previewTrabajo(this)">
      <div id="fotos-trabajo-list" style="margin-top:.5rem;"></div>
    </div>

    <button type="submit" class="btn btn-primary" id="btn-maint">Completar mantenimiento</button>
  </form>
</div>

<!-- Pantalla de éxito -->
<div class="success-screen" id="success-screen">
  <div class="icon">&#9989;</div>
  <h2>Mantenimiento completado</h2>
  <p>{task_nombre}</p>
  <p style="margin-top:.5rem;">{nombre_maq} &middot; {operario}</p>
  <p style="margin-top:1rem;"><a href="/m/{token}" style="color:#1e3a5f;font-weight:600;">Volver a la m&aacute;quina</a></p>
</div>

<div id="toast" class="toast"></div>

<script>
var TOKEN = "{token}";
var TASK_CODE = "{task_code}";
var DUE_HOURS = {due_hours};
var HORO_MIN = {horometro};
var MACHINE_ID = {maq.get('id', 0)};
var trabajoFiles = [];

function toast(msg, ok) {{
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok" : "err");
  t.style.display = "block";
  setTimeout(function() {{ t.style.display = "none"; }}, 3500);
}}

/* Validación horómetro */
document.getElementById("maint-horo").addEventListener("input", function() {{
  var val = parseFloat(this.value);
  var err = document.getElementById("horo-error");
  if (val && val < HORO_MIN) {{
    err.textContent = "No puede ser menor a " + HORO_MIN.toFixed(1) + "h";
    err.style.display = "block";
    this.style.borderColor = "#dc3545";
  }} else {{
    err.style.display = "none";
    this.style.borderColor = "#dee2e6";
  }}
}});

function previewHoro(input) {{
  if (input.files && input.files[0]) {{
    var reader = new FileReader();
    reader.onload = function(e) {{
      document.getElementById("foto-horo-preview").innerHTML =
        '<img src="' + e.target.result + '" style="max-width:100%;max-height:150px;border-radius:6px;margin-top:.5rem;">';
    }};
    reader.readAsDataURL(input.files[0]);
  }}
}}

function previewTrabajo(input) {{
  if (input.files) {{
    for (var i = 0; i < input.files.length; i++) trabajoFiles.push(input.files[i]);
    var html = trabajoFiles.map(function(f, i) {{
      return '<div style="display:inline-block;font-size:.8rem;background:#f0f0f0;padding:.3rem .6rem;border-radius:4px;margin:.2rem;">' +
        f.name + ' <span onclick="trabajoFiles.splice(' + i + ',1);previewTrabajo({{files:[]}})" style="color:#dc3545;cursor:pointer;">&times;</span></div>';
    }}).join("");
    document.getElementById("fotos-trabajo-list").innerHTML = html;
  }}
}}

function enviarMantenimiento(e) {{
  e.preventDefault();
  var btn = document.getElementById("btn-maint");
  var horo = parseFloat(document.getElementById("maint-horo").value) || 0;

  if (horo < HORO_MIN) {{
    toast("Hor\u00f3metro inv\u00e1lido", false);
    return false;
  }}

  var fotoHoro = document.getElementById("foto-horo");
  if (!fotoHoro.files || !fotoHoro.files[0]) {{
    toast("Foto del hor\u00f3metro obligatoria", false);
    return false;
  }}

  btn.disabled = true;
  btn.textContent = "Enviando...";

  // Recoger checklist
  var checklist = {{}};
  var checks = document.querySelectorAll('#form-maint input[name^="cl_"]');
  checks.forEach(function(el) {{
    if (el.type === "checkbox") checklist[el.name] = el.checked;
    else checklist[el.name] = el.value;
  }});

  var body = {{
    task_code: TASK_CODE,
    due_hours: DUE_HOURS,
    horometro_at: horo,
    observaciones: document.getElementById("maint-obs").value,
    checklist_result: checklist
  }};

  fetch("/api/w/" + TOKEN + "/mantenimiento", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(body)
  }})
  .then(function(r) {{ return r.json(); }})
  .then(function(d) {{
    if (d.error) {{ toast(d.error, false); btn.disabled = false; btn.textContent = "Completar mantenimiento"; return; }}

    // Subir foto horómetro
    var fd = new FormData();
    fd.append("foto", fotoHoro.files[0]);
    fd.append("entidad_tipo", "revision");
    fd.append("entidad_id", d.id);
    var uploads = [fetch("/api/m/" + TOKEN + "/foto", {{ method: "POST", body: fd }})];

    // Subir fotos de trabajo
    trabajoFiles.forEach(function(f) {{
      var fd2 = new FormData();
      fd2.append("foto", f);
      fd2.append("entidad_tipo", "revision");
      fd2.append("entidad_id", d.id);
      uploads.push(fetch("/api/m/" + TOKEN + "/foto", {{ method: "POST", body: fd2 }}));
    }});

    return Promise.all(uploads).then(function() {{
      document.getElementById("form-container").style.display = "none";
      document.getElementById("success-screen").style.display = "block";
    }});
  }})
  .catch(function(err) {{
    toast("Error: " + err.message, false);
    btn.disabled = false;
    btn.textContent = "Completar mantenimiento";
  }});
  return false;
}}
</script>
</body></html>"""


def _render_form_revision(token, info, maq, revision, due_hours):
  """Renderiza formulario combinado (cascading) con todas las tareas agrupadas por intervalo."""
  nombre_maq = maq.get("nombre", "Máquina")
  modelo = maq.get("modelo", "")
  horometro = maq.get("horometro_actual", 0)
  operario = info.get("operario_nombre", "Operario")
  tasks_agrupadas = revision["tasks_agrupadas"]
  total_tareas = revision["total_tareas"]
  intervalos = revision["intervalos"]
  tiene_taller = revision["tiene_taller"]

  # Determinar el título según los intervalos incluidos
  intervalos_str = " + ".join(f"{i}h" for i in intervalos)

  # Generar bloques HTML por intervalo
  bloques_html = ""
  task_idx = 0  # Contador global de tareas para JS

  for intervalo in sorted(tasks_agrupadas.keys()):
    grupo = tasks_agrupadas[intervalo]
    bloques_html += f"""
    <div class="card interval-block">
      <div class="interval-header">
        <div class="interval-badge">{intervalo}h</div>
        <span class="interval-label">Tareas de revisión cada {intervalo}h</span>
        <span class="interval-count">{len(grupo)} tarea{"s" if len(grupo) != 1 else ""}</span>
      </div>"""

    for t in grupo:
      task_idx += 1
      code = t["code"]
      nombre = t["nombre"]
      desc = t.get("descripcion", "")
      checklist = t.get("checklist", [])
      requires_ws = t.get("requires_workshop", 0)
      rol = t.get("rol", "mantenedor")

      ws_html = ""
      if requires_ws:
        ws_html = '<div class="ws-tag">REQUIERE TALLER AUTORIZADO</div>'

      rol_badge = ""
      if rol == "tecnico_especializado":
        rol_badge = '<span class="role-badge role-tecnico">Técnico especializado</span>'
      else:
        rol_badge = '<span class="role-badge role-mantenedor">Mantenedor</span>'

      # Checklist items
      cl_html = ""
      for ci, item in enumerate(checklist):
        tipo = item.get("tipo", "check")
        if tipo == "check":
          cl_html += f"""
          <div class="check-item">
            <label><input type="checkbox" name="t_{code}__cl_{ci}" value="1"> {item['item']}</label>
          </div>"""
        elif tipo == "texto":
          cl_html += f"""
          <div class="check-item">
            <label style="font-size:.85rem;font-weight:600;color:#1e3a5f;">{item['item']}</label>
            <input type="text" name="t_{code}__cl_{ci}" class="text-input" placeholder="Introducir valor...">
          </div>"""

      border_style = ' style="border:2px solid #fecaca;"' if requires_ws else ""

      bloques_html += f"""
      <div class="task-section"{border_style}>
        <div class="task-header">
          <span class="task-num">{task_idx}.</span> {nombre} {rol_badge}
        </div>
        {ws_html}
        <p class="task-desc">{desc}</p>
        {cl_html}
      </div>"""

    bloques_html += "\n    </div>"

  # Generar JSON de task_codes para JS
  all_codes = []
  for grupo in tasks_agrupadas.values():
    for t in grupo:
      all_codes.append(t["code"])
  task_codes_json = json.dumps(all_codes)

  return f"""<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Revisi&oacute;n {intervalos_str} &mdash; {nombre_maq}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; }}
  .header {{ background: linear-gradient(135deg, #1e3a5f, #2d5a87); color: #fff; padding: 1.2rem 1rem; text-align: center; }}
  .header h1 {{ font-size: 1.2rem; margin-bottom: .2rem; }}
  .header .sub {{ font-size: .8rem; opacity: .85; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 1rem; }}
  .card {{ background: #fff; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }}
  .card h3 {{ font-size: 1rem; margin-bottom: .5rem; color: #1e3a5f; }}
  .task-desc {{ font-size: .85rem; color: #6c757d; margin-bottom: .6rem; line-height: 1.4; }}
  .form-group {{ margin-bottom: .8rem; }}
  .form-group label {{ font-weight: 600; font-size: .85rem; display: block; margin-bottom: .3rem; }}
  .hint {{ font-size: .78rem; color: #6c757d; margin-bottom: .4rem; }}
  .hint strong {{ color: #1e3a5f; }}
  input[type="number"], input[type="text"], textarea {{ width: 100%; border: 1px solid #dee2e6; border-radius: 6px; padding: .5rem; font-size: .9rem; }}
  textarea {{ resize: vertical; min-height: 60px; }}
  .check-item {{ padding: .4rem 0; border-bottom: 1px solid #f0f0f0; }}
  .check-item:last-child {{ border-bottom: none; }}
  .check-item label {{ display: flex; align-items: center; gap: .5rem; font-size: .88rem; cursor: pointer; }}
  .check-item input[type="checkbox"] {{ width: 20px; height: 20px; flex-shrink: 0; accent-color: #16a34a; }}
  .text-input {{ margin-top: .3rem; }}
  .field-error {{ display: none; font-size: .8rem; color: #dc3545; margin-top: .3rem; padding: .4rem .6rem; background: #fef2f2; border-radius: 4px; }}
  .btn {{ display: block; width: 100%; padding: .8rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; text-align: center; }}
  .btn-primary {{ background: #16a34a; color: #fff; }}
  .btn-primary:active {{ background: #15803d; }}
  .btn:disabled {{ opacity: .5; cursor: not-allowed; }}
  .file-upload-area {{ border: 2px dashed #dee2e6; border-radius: 8px; padding: 1rem; text-align: center; cursor: pointer; background: #fafafa; }}
  .file-upload-area:active {{ background: #f0f0f0; }}
  .toast {{ position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e3a5f; color: #fff; padding: .7rem 1.5rem; border-radius: 8px; font-size: .9rem; display: none; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.2); }}
  .toast.ok {{ background: #16a34a; }}
  .toast.err {{ background: #dc3545; }}
  .success-screen {{ display: none; text-align: center; padding: 3rem 1rem; }}
  .success-screen .icon {{ font-size: 4rem; margin-bottom: 1rem; }}
  .success-screen h2 {{ color: #16a34a; margin-bottom: .5rem; }}
  .success-screen p {{ color: #6c757d; }}
  .req {{ font-size: .7rem; color: #dc3545; font-weight: 400; }}
  /* Revision-specific styles */
  .task-count {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: .6rem .8rem; font-size: .85rem; color: #166534; margin-bottom: 1rem; text-align: center; font-weight: 600; }}
  .interval-block {{ padding: .8rem 1rem; }}
  .interval-header {{ display: flex; align-items: center; gap: .5rem; margin-bottom: .8rem; flex-wrap: wrap; }}
  .interval-badge {{ background: #1e3a5f; color: #fff; font-size: .75rem; font-weight: 700; padding: .25rem .6rem; border-radius: 4px; }}
  .interval-label {{ font-weight: 700; font-size: .95rem; color: #1e3a5f; }}
  .interval-count {{ font-size: .78rem; color: #6c757d; margin-left: auto; }}
  .task-section {{ border-top: 1px solid #e5e7eb; padding: .8rem 0; margin-top: .5rem; border-radius: 6px; padding: .8rem; }}
  .task-header {{ font-size: .92rem; font-weight: 700; color: #1e3a5f; margin-bottom: .3rem; }}
  .task-num {{ color: #2d5a87; }}
  .ws-tag {{ background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: .4rem .6rem; color: #dc2626; font-weight: 600; font-size: .78rem; margin-bottom: .5rem; text-align: center; }}
  .role-badge {{ display: inline-block; font-size: .65rem; font-weight: 600; padding: .12rem .4rem; border-radius: 3px; vertical-align: middle; margin-left: .3rem; }}
  .role-mantenedor {{ background: #dbeafe; color: #1e40af; }}
  .role-tecnico {{ background: #fef2f2; color: #dc2626; }}
</style></head><body>

<div class="header">
  <h1>Revisi&oacute;n {intervalos_str}</h1>
  <div class="sub">{nombre_maq} ({modelo}) &middot; Operario: {operario}</div>
</div>

<div class="container" id="form-container">
  <div class="task-count">{total_tareas} tareas de mantenimiento &middot; Bloques: {intervalos_str}</div>

  <div class="card">
    <h3>Detalles de la revisi&oacute;n</h3>
    <p class="task-desc">Revisi&oacute;n programada seg&uacute;n manual Orteco HD 800-1000. Al coincidir varios intervalos de mantenimiento ({intervalos_str}), se agrupan todas las tareas en un &uacute;nico formulario.</p>
    <div style="display:flex;gap:.5rem;font-size:.82rem;color:#6c757d;flex-wrap:wrap;">
      <span>Due: <strong>{due_hours:.0f}h</strong></span>
      <span>&middot;</span>
      <span>Actual: <strong>{horometro:.0f}h</strong></span>
    </div>
  </div>

  <form id="form-maint" onsubmit="return enviarRevision(event)">
    <div class="card">
      <h3>Hor&oacute;metro</h3>
      <div class="form-group">
        <div class="hint">&Uacute;ltima medida: <strong>{horometro:.1f}h</strong></div>
        <input type="number" id="maint-horo" step="0.1" min="{horometro}" placeholder="{horometro}" required>
        <div id="horo-error" class="field-error"></div>
      </div>
      <div class="form-group">
        <label>Foto hor&oacute;metro <span class="req">*obligatoria</span></label>
        <div class="file-upload-area" onclick="document.getElementById('foto-horo').click()">
          <div style="font-size:1.5rem;">&#128247;</div>
          <div style="font-size:.82rem;color:#6c757d;">Pulsa para foto</div>
          <div id="foto-horo-preview"></div>
        </div>
        <input type="file" id="foto-horo" accept="image/*" capture="environment" style="display:none;" onchange="previewHoro(this)">
      </div>
    </div>

    {bloques_html}

    <div class="card">
      <h3>Observaciones generales</h3>
      <textarea id="maint-obs" rows="3" placeholder="Notas generales, piezas sustituidas, incidencias..."></textarea>
    </div>

    <div class="card">
      <h3>Fotos del trabajo (opcional)</h3>
      <div class="file-upload-area" onclick="document.getElementById('fotos-trabajo').click()">
        <div style="font-size:1.5rem;">&#128247;</div>
        <div style="font-size:.82rem;color:#6c757d;">Adjuntar fotos o v&iacute;deos del mantenimiento</div>
      </div>
      <input type="file" id="fotos-trabajo" accept="image/*,video/*" capture="environment" multiple style="display:none;" onchange="previewTrabajo(this)">
      <div id="fotos-trabajo-list" style="margin-top:.5rem;"></div>
    </div>

    <button type="submit" class="btn btn-primary" id="btn-maint">Completar revisi&oacute;n {intervalos_str}</button>
  </form>
</div>

<div class="success-screen" id="success-screen">
  <div class="icon">&#9989;</div>
  <h2>Revisi&oacute;n completada</h2>
  <p>{total_tareas} tareas de mantenimiento registradas</p>
  <p style="margin-top:.5rem;">{nombre_maq} &middot; {operario}</p>
  <p style="margin-top:1rem;"><a href="/m/{token}" style="color:#1e3a5f;font-weight:600;">Volver a la m&aacute;quina</a></p>
</div>

<div id="toast" class="toast"></div>

<script>
var TOKEN = "{token}";
var DUE_HOURS = {due_hours};
var HORO_MIN = {horometro};
var MACHINE_ID = {maq.get('id', 0)};
var TASK_CODES = {task_codes_json};
var trabajoFiles = [];

function toast(msg, ok) {{
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok" : "err");
  t.style.display = "block";
  setTimeout(function() {{ t.style.display = "none"; }}, 3500);
}}

document.getElementById("maint-horo").addEventListener("input", function() {{
  var val = parseFloat(this.value);
  var err = document.getElementById("horo-error");
  if (val && val < HORO_MIN) {{
    err.textContent = "No puede ser menor a " + HORO_MIN.toFixed(1) + "h";
    err.style.display = "block";
    this.style.borderColor = "#dc3545";
  }} else {{
    err.style.display = "none";
    this.style.borderColor = "#dee2e6";
  }}
}});

function previewHoro(input) {{
  if (input.files && input.files[0]) {{
    var reader = new FileReader();
    reader.onload = function(e) {{
      document.getElementById("foto-horo-preview").innerHTML =
        '<img src="' + e.target.result + '" style="max-width:100%;max-height:150px;border-radius:6px;margin-top:.5rem;">';
    }};
    reader.readAsDataURL(input.files[0]);
  }}
}}

function previewTrabajo(input) {{
  if (input.files) {{
    for (var i = 0; i < input.files.length; i++) trabajoFiles.push(input.files[i]);
    var html = trabajoFiles.map(function(f, i) {{
      return '<div style="display:inline-block;font-size:.8rem;background:#f0f0f0;padding:.3rem .6rem;border-radius:4px;margin:.2rem;">' +
        f.name + ' <span onclick="trabajoFiles.splice(' + i + ',1);previewTrabajo({{files:[]}})" style="color:#dc3545;cursor:pointer;">&times;</span></div>';
    }}).join("");
    document.getElementById("fotos-trabajo-list").innerHTML = html;
  }}
}}

function enviarRevision(e) {{
  e.preventDefault();
  var btn = document.getElementById("btn-maint");
  var horo = parseFloat(document.getElementById("maint-horo").value) || 0;

  if (horo < HORO_MIN) {{
    toast("Hor\u00f3metro inv\u00e1lido", false);
    return false;
  }}

  var fotoHoro = document.getElementById("foto-horo");
  if (!fotoHoro.files || !fotoHoro.files[0]) {{
    toast("Foto del hor\u00f3metro obligatoria", false);
    return false;
  }}

  btn.disabled = true;
  btn.textContent = "Enviando...";

  // Recoger checklists agrupados por task_code
  var tasksData = {{}};
  TASK_CODES.forEach(function(code) {{
    tasksData[code] = {{}};
  }});

  var inputs = document.querySelectorAll('#form-maint input[name^="t_"]');
  inputs.forEach(function(el) {{
    // name format: t_TASK_CODE__cl_N
    var parts = el.name.split("__");
    if (parts.length === 2) {{
      var taskCode = parts[0].substring(2); // quitar "t_"
      var clKey = parts[1];
      if (tasksData[taskCode] !== undefined) {{
        if (el.type === "checkbox") tasksData[taskCode][clKey] = el.checked;
        else tasksData[taskCode][clKey] = el.value;
      }}
    }}
  }});

  var body = {{
    due_hours: DUE_HOURS,
    horometro_at: horo,
    observaciones: document.getElementById("maint-obs").value,
    tasks: tasksData
  }};

  fetch("/api/w/" + TOKEN + "/revision", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(body)
  }})
  .then(function(r) {{ return r.json(); }})
  .then(function(d) {{
    if (d.error) {{ toast(d.error, false); btn.disabled = false; btn.textContent = "Completar revisi\u00f3n"; return; }}

    // Subir foto horómetro
    var fd = new FormData();
    fd.append("foto", fotoHoro.files[0]);
    fd.append("entidad_tipo", "revision");
    fd.append("entidad_id", d.logs && d.logs[0] ? d.logs[0].id : 0);
    var uploads = [fetch("/api/m/" + TOKEN + "/foto", {{ method: "POST", body: fd }})];

    trabajoFiles.forEach(function(f) {{
      var fd2 = new FormData();
      fd2.append("foto", f);
      fd2.append("entidad_tipo", "revision");
      fd2.append("entidad_id", d.logs && d.logs[0] ? d.logs[0].id : 0);
      uploads.push(fetch("/api/m/" + TOKEN + "/foto", {{ method: "POST", body: fd2 }}));
    }});

    return Promise.all(uploads).then(function() {{
      document.getElementById("form-container").style.display = "none";
      document.getElementById("success-screen").style.display = "block";
    }});
  }})
  .catch(function(err) {{
    toast("Error: " + err.message, false);
    btn.disabled = false;
    btn.textContent = "Completar revisi\u00f3n";
  }});
  return false;
}}
</script>
</body></html>"""
