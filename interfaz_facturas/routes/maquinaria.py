"""Rutas de maquinaria: máquinas, checks semanales, incidencias, tokens operario, notificaciones."""
from __future__ import annotations

import json
import logging
import os

from flask import Blueprint, Response, jsonify, request, render_template_string, send_from_directory, make_response
from flask_login import current_user, login_required

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
  if not data.get("internal_id") or not data.get("nombre"):
    return jsonify({"error": "internal_id y nombre son obligatorios"}), 400
  try:
    return jsonify(maquinaria_db.crear_maquina(data)), 201
  except Exception as e:
    msg = str(e)
    if "UNIQUE" in msg:
      return jsonify({"error": "Ya existe una m\u00e1quina con ese ID interno"}), 409
    return jsonify({"error": msg}), 500


@maquinaria_bp.put("/api/maquinaria/maquinas/<int:mid>")
def api_actualizar_maquina(mid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_maquina(mid, data))


@maquinaria_bp.post("/api/maquinaria/maquinas/<int:mid>/completar-revision")
def api_completar_revision(mid):
  data = request.get_json(silent=True) or {}
  intervalo = data.get("intervalo")
  horometro = data.get("horometro_actual")
  if not intervalo or horometro is None:
    return jsonify({"error": "intervalo y horometro_actual son obligatorios"}), 400
  result = maquinaria_db.marcar_revision_completada(mid, int(intervalo), float(horometro))
  if result.get("error"):
    return jsonify(result), 400
  return jsonify(result)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Exports de historial de servicio + documentos                          ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>/export/service-history")
def api_export_service_history(mid):
  """Genera y descarga historial de servicio (PDF o Excel)."""
  from core import maquinaria_exports
  fmt = request.args.get("format", "pdf").lower()
  desde = request.args.get("desde")
  hasta = request.args.get("hasta")
  user_name = current_user.nombre if current_user.is_authenticated else "admin"
  try:
    if fmt == "xlsx":
      data_bytes, doc_record = maquinaria_exports.generar_service_history_xlsx(
          mid, desde=desde, hasta=hasta, generado_por=user_name)
      return Response(data_bytes,
          mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          headers={"Content-Disposition": f"attachment; filename={doc_record['filename']}"})
    else:
      data_bytes, doc_record = maquinaria_exports.generar_service_history_pdf(
          mid, desde=desde, hasta=hasta, generado_por=user_name)
      return Response(data_bytes, mimetype="application/pdf",
          headers={"Content-Disposition": f"attachment; filename={doc_record['filename']}"})
  except ValueError as e:
    return jsonify({"error": str(e)}), 404
  except Exception as e:
    return jsonify({"error": f"Error generando export: {e}"}), 500


@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>/documentos")
def api_listar_documentos_maquina(mid):
  return jsonify({"documentos": maquinaria_db.listar_documentos(maquina_id=mid)})


@maquinaria_bp.post("/api/maquinaria/maquinas/<int:mid>/certificado-cae")
def api_generar_certificado_cae(mid):
  """Genera certificado CAE/PRL. Body: {modo: "ultima"|"hito", hito_horas: 4000}"""
  from core import maquinaria_exports
  data = request.get_json(silent=True) or {}
  modo = data.get("modo", "ultima")
  hito_horas = data.get("hito_horas")
  lugar = data.get("lugar", "Badajoz")
  firmante_nombre = data.get("firmante_nombre")
  firmante_cargo = data.get("firmante_cargo")
  user_name = current_user.nombre if current_user.is_authenticated else "admin"
  try:
    pdf_bytes, doc_record = maquinaria_exports.generar_certificado_cae(
        mid, modo=modo, hito_horas=hito_horas, lugar=lugar,
        firmante_nombre=firmante_nombre, firmante_cargo=firmante_cargo,
        generado_por=user_name)
    return Response(pdf_bytes, mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={doc_record['filename']}"})
  except ValueError as e:
    return jsonify({"error": str(e)}), 404
  except Exception as e:
    return jsonify({"error": f"Error generando certificado: {e}"}), 500


@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>/asset-passport")
def api_generar_asset_passport(mid):
  """Genera Asset Passport PDF — resumen ejecutivo de 1 página."""
  from core import maquinaria_exports
  user_name = current_user.nombre if current_user.is_authenticated else "admin"
  try:
    pdf_bytes, doc_record = maquinaria_exports.generar_asset_passport(
        mid, generado_por=user_name)
    return Response(pdf_bytes, mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={doc_record['filename']}"})
  except ValueError as e:
    return jsonify({"error": str(e)}), 404
  except Exception as e:
    return jsonify({"error": f"Error generando Asset Passport: {e}"}), 500


@maquinaria_bp.get("/api/maquinaria/maquinas/<int:mid>/chart-data")
def api_chart_data(mid):
  """Returns hourometer chart data as JSON for frontend Chart.js rendering."""
  from core.db import conectar as _db_conectar
  from datetime import datetime, timedelta

  maq = maquinaria_db.obtener_maquina(mid)
  if not maq:
    return jsonify({"error": "No encontrada"}), 404

  horo = maq.get("horometro_actual") or 0

  with _db_conectar() as conn:
    rows_checks = conn.execute(
        "SELECT fecha, horometro FROM maquinaria_checks "
        "WHERE maquina_id = ? AND horometro IS NOT NULL AND horometro > 0 "
        "AND estado != 'enmendado' ORDER BY fecha",
        [mid]).fetchall()
    rows_logs = conn.execute(
        "SELECT completed_at, MAX(horometro_at) as horo "
        "FROM maquinaria_maintenance_logs "
        "WHERE maquina_id = ? AND horometro_at IS NOT NULL AND horometro_at > 0 "
        "GROUP BY completed_at ORDER BY completed_at",
        [mid]).fetchall()

  combined = []
  for r in rows_checks:
    try:
      d = datetime.fromisoformat(r["fecha"][:10])
      combined.append((d, float(r["horometro"])))
    except (ValueError, TypeError):
      pass
  for r in rows_logs:
    try:
      d_str = r["completed_at"] or ""
      d = datetime.fromisoformat(d_str[:10])
      combined.append((d, float(r["horo"])))
    except (ValueError, TypeError):
      pass

  if horo > 0:
    combined.append((datetime.now().replace(hour=0, minute=0, second=0, microsecond=0),
                     float(horo)))

  combined.sort(key=lambda x: (x[0], x[1]))
  deduped = {}
  for d, hr in combined:
    if d not in deduped or hr > deduped[d]:
      deduped[d] = hr
  by_date = sorted(deduped.items(), key=lambda x: x[0])

  sorted_readings = []
  running_max = -1.0
  for d, hr in by_date:
    if hr >= running_max:
      sorted_readings.append((d, hr))
      running_max = hr

  if len(sorted_readings) < 2:
    return jsonify({"readings": [], "biweekly": [], "stats": None})

  dates = [x[0] for x in sorted_readings]
  horos_list = [x[1] for x in sorted_readings]

  # Cumulative readings
  readings = [{"date": d.strftime("%Y-%m-%d"), "horo": h} for d, h in sorted_readings]

  # Biweekly consumption
  period_days = 14
  start, end = dates[0], dates[-1]
  periods = []
  current = start
  while current <= end:
    periods.append(current)
    current += timedelta(days=period_days)

  interp_horos = []
  for p in periods:
    before_h, after_h = 0, horos_list[-1]
    before_d, after_d = dates[0], dates[-1]
    for i in range(len(dates)):
      if dates[i] <= p:
        before_h = horos_list[i]
        before_d = dates[i]
      if dates[i] >= p:
        after_h = horos_list[i]
        after_d = dates[i]
        break
    if before_d == after_d:
      interp_horos.append(before_h)
    else:
      ratio = (p - before_d).total_seconds() / (after_d - before_d).total_seconds()
      interp_horos.append(before_h + (after_h - before_h) * ratio)

  biweekly = []
  for i in range(1, len(periods)):
    delta = interp_horos[i] - interp_horos[i - 1]
    biweekly.append({
        "label": periods[i].strftime("%d/%m/%y"),
        "consumption": round(max(0, delta), 1)
    })

  max_bars = 26
  if len(biweekly) > max_bars:
    biweekly = biweekly[-max_bars:]

  # Stats
  total_hours = horos_list[-1] - horos_list[0]
  total_days = max((dates[-1] - dates[0]).days, 1)
  avg_daily = total_hours / total_days
  stats = {
      "period_start": dates[0].strftime("%d/%m/%Y"),
      "period_end": dates[-1].strftime("%d/%m/%Y"),
      "total_hours": round(total_hours, 1),
      "avg_weekly": round(avg_daily * 7, 1),
      "avg_monthly": round(avg_daily * 30, 0),
      "utilization_pct": round(min(100, (avg_daily * 7) / 50 * 100), 0),
  }

  return jsonify({"readings": readings, "biweekly": biweekly, "stats": stats})


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


@maquinaria_bp.get("/api/maquinaria/checks/<int:cid>")
def api_obtener_check(cid):
  check = maquinaria_db.obtener_check(cid)
  if not check:
    return jsonify({"error": "Check no encontrado"}), 404
  return jsonify(check)


@maquinaria_bp.put("/api/maquinaria/checks/<int:cid>")
def api_actualizar_check(cid):
  data = request.get_json(silent=True) or {}
  return jsonify(maquinaria_db.actualizar_check(cid, data))


@maquinaria_bp.delete("/api/maquinaria/checks/<int:cid>")
def api_eliminar_check(cid):
  maquinaria_db.eliminar_check(cid)
  return jsonify({"ok": True})


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
# ██  Responsable de máquina (vinculado a empleados)                         ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.post("/api/maquinaria/maquinas/<int:mid>/responsable")
@login_required
def api_asignar_responsable(mid):
  data = request.get_json(silent=True) or {}
  responsable_id = data.get("responsable_id")  # None para desasignar
  maquinaria_db.asignar_responsable_maquina(mid, responsable_id)
  return jsonify({"ok": True})


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


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Fase 4: Auditor View — Links temporales                                ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.post("/api/maquinaria/auditor-link")
def api_crear_auditor_link():
  """Crea un link de auditor temporal para una máquina."""
  data = request.get_json(silent=True) or {}
  maquina_id = data.get("maquina_id")
  if not maquina_id:
    return jsonify({"error": "maquina_id es obligatorio"}), 400
  nombre = data.get("nombre_destinatario", "").strip() or None
  dias = int(data.get("dias_expiracion", 14))
  if dias < 1 or dias > 90:
    return jsonify({"error": "dias_expiracion debe estar entre 1 y 90"}), 400
  max_acc = data.get("max_accesos")
  if max_acc is not None:
    max_acc = int(max_acc) if int(max_acc) > 0 else None
  user_id = current_user.id if current_user.is_authenticated else None
  try:
    link = maquinaria_db.crear_auditor_link(
        maquina_id, user_id, nombre, dias, max_acc)
    return jsonify(link), 201
  except Exception as e:
    return jsonify({"error": str(e)}), 500


@maquinaria_bp.get("/api/maquinaria/auditor-links")
def api_listar_auditor_links():
  """Lista links de auditor activos, opcionalmente filtrados por máquina."""
  mid = request.args.get("maquina_id", type=int)
  return jsonify({"links": maquinaria_db.listar_auditor_links(mid)})


@maquinaria_bp.delete("/api/maquinaria/auditor-links/<int:lid>")
def api_revocar_auditor_link(lid):
  """Revoca un link de auditor."""
  maquinaria_db.revocar_auditor_link(lid)
  return jsonify({"ok": True})


@maquinaria_bp.get("/api/maquinaria/auditor-links/<int:lid>/log")
def api_audit_log(lid):
  """Obtiene el log de accesos de un link."""
  return jsonify({"log": maquinaria_db.obtener_audit_log(lid)})


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Fase 4: Auditor View — Página pública (sin login)                      ██
# ═══════════════════════════════════════════════════════════════════════════════

@maquinaria_bp.get("/audit/<token>")
def audit_view(token):
  """Página pública read-only para auditor — ficha de mantenimiento sin login."""
  link = maquinaria_db.validar_auditor_token(token)
  if not link:
    return _audit_error_page("Link no válido, expirado o revocado."), 403

  maquinaria_db.registrar_acceso_auditor(
      link["id"], request.remote_addr,
      request.headers.get("User-Agent", "")[:200], "view_page")

  mid = link["maquina_id"]
  maq = maquinaria_db.obtener_maquina(mid)
  if not maq:
    return _audit_error_page("Máquina no encontrada."), 404

  # Sanitize: remove sensitive data
  for key in ("notas", "foto_url", "proyecto_id"):
    maq.pop(key, None)
  for c in maq.get("checks", []):
    c.pop("usuario_id", None)
  for i in maq.get("incidencias", []):
    i.pop("usuario_id", None)

  resp = make_response(_render_audit_page(link, maq, token))
  resp.headers["X-Robots-Tag"] = "noindex, nofollow"
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
  return resp


@maquinaria_bp.get("/audit/<token>/passport.pdf")
def audit_passport_pdf(token):
  """Descarga Asset Passport PDF desde link de auditor."""
  link = maquinaria_db.validar_auditor_token(token)
  if not link:
    return _audit_error_page("Link no válido, expirado o revocado."), 403
  maquinaria_db.registrar_acceso_auditor(
      link["id"], request.remote_addr,
      request.headers.get("User-Agent", "")[:200], "download_passport")
  from core import maquinaria_exports
  try:
    pdf_bytes, doc = maquinaria_exports.generar_asset_passport(
        link["maquina_id"], generado_por="Auditor View")
    resp = Response(pdf_bytes, mimetype="application/pdf",
        headers={"Content-Disposition": f"inline; filename={doc['filename']}"})
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["Cache-Control"] = "no-store"
    return resp
  except Exception as e:
    return _audit_error_page(f"Error generando passport: {e}"), 500


@maquinaria_bp.get("/audit/<token>/history.pdf")
def audit_history_pdf(token):
  """Descarga historial de servicio PDF desde link de auditor."""
  link = maquinaria_db.validar_auditor_token(token)
  if not link:
    return _audit_error_page("Link no válido, expirado o revocado."), 403
  maquinaria_db.registrar_acceso_auditor(
      link["id"], request.remote_addr,
      request.headers.get("User-Agent", "")[:200], "download_history")
  from core import maquinaria_exports
  try:
    pdf_bytes, doc = maquinaria_exports.generar_service_history_pdf(link["maquina_id"])
    resp = Response(pdf_bytes, mimetype="application/pdf",
        headers={"Content-Disposition": f"inline; filename={doc['filename']}"})
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["Cache-Control"] = "no-store"
    return resp
  except Exception as e:
    return _audit_error_page(f"Error generando historial: {e}"), 500


@maquinaria_bp.get("/audit/<token>/chart-data")
def audit_chart_data(token):
  """Returns chart data for the public audit view."""
  link = maquinaria_db.validar_auditor_token(token)
  if not link:
    return jsonify({"error": "Token no válido"}), 403
  from datetime import datetime, timedelta
  from core.db import conectar as _db_conectar

  mid = link["maquina_id"]
  maq = maquinaria_db.obtener_maquina(mid)
  if not maq:
    return jsonify({"readings": [], "biweekly": [], "stats": None})
  horo = maq.get("horometro_actual") or 0
  with _db_conectar() as conn:
    rows_checks = conn.execute(
        "SELECT fecha, horometro FROM maquinaria_checks "
        "WHERE maquina_id = ? AND horometro IS NOT NULL AND horometro > 0 "
        "AND estado != 'enmendado' ORDER BY fecha", [mid]).fetchall()
    rows_logs = conn.execute(
        "SELECT completed_at, MAX(horometro_at) as horo "
        "FROM maquinaria_maintenance_logs "
        "WHERE maquina_id = ? AND horometro_at IS NOT NULL AND horometro_at > 0 "
        "GROUP BY completed_at ORDER BY completed_at", [mid]).fetchall()
  combined = []
  for r in rows_checks:
    try:
      d = datetime.fromisoformat(r["fecha"][:10]); combined.append((d, float(r["horometro"])))
    except (ValueError, TypeError): pass
  for r in rows_logs:
    try:
      d = datetime.fromisoformat((r["completed_at"] or "")[:10]); combined.append((d, float(r["horo"])))
    except (ValueError, TypeError): pass
  if horo > 0:
    combined.append((datetime.now().replace(hour=0, minute=0, second=0, microsecond=0), float(horo)))
  combined.sort(key=lambda x: (x[0], x[1]))
  deduped = {}
  for d, hr in combined:
    if d not in deduped or hr > deduped[d]: deduped[d] = hr
  by_date = sorted(deduped.items(), key=lambda x: x[0])
  sorted_readings, running_max = [], -1.0
  for d, hr in by_date:
    if hr >= running_max: sorted_readings.append((d, hr)); running_max = hr
  if len(sorted_readings) < 2:
    return jsonify({"readings": [], "biweekly": [], "stats": None})
  dates = [x[0] for x in sorted_readings]
  horos_list = [x[1] for x in sorted_readings]
  readings = [{"date": d.strftime("%Y-%m-%d"), "horo": h} for d, h in sorted_readings]
  start, end = dates[0], dates[-1]
  periods, current = [], start
  while current <= end: periods.append(current); current += timedelta(days=14)
  interp_horos = []
  for p in periods:
    before_h, after_h, before_d, after_d = 0, horos_list[-1], dates[0], dates[-1]
    for i in range(len(dates)):
      if dates[i] <= p: before_h = horos_list[i]; before_d = dates[i]
      if dates[i] >= p: after_h = horos_list[i]; after_d = dates[i]; break
    if before_d == after_d: interp_horos.append(before_h)
    else:
      ratio = (p - before_d).total_seconds() / (after_d - before_d).total_seconds()
      interp_horos.append(before_h + (after_h - before_h) * ratio)
  biweekly = []
  for i in range(1, len(periods)):
    delta = interp_horos[i] - interp_horos[i - 1]
    biweekly.append({"label": periods[i].strftime("%d/%m/%y"), "consumption": round(max(0, delta), 1)})
  if len(biweekly) > 26: biweekly = biweekly[-26:]
  total_hours = horos_list[-1] - horos_list[0]
  total_days = max((dates[-1] - dates[0]).days, 1)
  avg_daily = total_hours / total_days
  stats = {"period_start": dates[0].strftime("%d/%m/%Y"), "period_end": dates[-1].strftime("%d/%m/%Y"),
    "total_hours": round(total_hours, 1), "avg_weekly": round(avg_daily * 7, 1),
    "avg_monthly": round(avg_daily * 30, 0), "utilization_pct": round(min(100, (avg_daily * 7) / 50 * 100), 0)}
  return jsonify({"readings": readings, "biweekly": biweekly, "stats": stats})


def _audit_error_page(msg):
  return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Acceso denegado</title>
<style>body{{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#F8FAFC;color:#1E293B;}}
.card{{background:#fff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px;}}
h1{{font-size:20px;margin:0 0 12px;color:#DC2626;}} p{{font-size:14px;color:#64748B;margin:0;}}</style></head>
<body><div class="card"><h1>Acceso no disponible</h1><p>{msg}</p></div></body></html>"""


def _esc_html(s):
  if not s: return ""
  return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _render_audit_page(link, maq, token):
  """Renders the public audit view HTML page."""
  from datetime import datetime as _dt

  nombre = maq.get("nombre", "Máquina")
  modelo = maq.get("modelo", "")
  serie = maq.get("numero_serie", "")
  horo = maq.get("horometro_actual", 0)
  horo_ini = maq.get("horometro_inicial", 0)
  estado = maq.get("estado", "")
  proyecto = maq.get("proyecto_nombre", "")
  internal_id = maq.get("internal_id", "")
  comision = (maq.get("fecha_comision") or "")[:4]
  destinatario = link.get("nombre_destinatario") or "Auditor"
  expires = (link.get("expires_at") or "")[:10]

  estado_labels = {"disponible": "Disponible", "en_proyecto": "En proyecto", "en_taller": "En taller", "baja": "De baja"}
  estado_colors = {"disponible": "#16A34A", "en_proyecto": "#2563EB", "en_taller": "#CA8A04", "baja": "#DC2626"}
  est_label = estado_labels.get(estado, estado)
  est_color = estado_colors.get(estado, "#64748B")

  checks = maq.get("checks", [])
  checks_html = ""
  for c in checks[:8]:
    fecha = (c.get("fecha") or "")[:10]
    h = c.get("horometro", 0)
    checks_html += f'<tr><td>{fecha}</td><td>{h}h</td><td>{c.get("estado", "")}</td></tr>'
  if not checks_html:
    checks_html = '<tr><td colspan="3" style="text-align:center;color:#94A3B8;">Sin checks registrados</td></tr>'

  all_revs = []
  for r in maq.get("revisiones", []):
    all_revs.append({"h": r.get("horometro_al_revision", 0) or r.get("horometro", 0), "fecha": (r.get("fecha") or "")[:10], "tipo": r.get("tipo", "")})
  for r in maq.get("revisiones_historico", []):
    all_revs.append({"h": r.get("horometro_al_revision", 0), "fecha": (r.get("fecha") or "")[:10], "tipo": "mantenimiento", "tareas": r.get("n_tareas", 0)})
  all_revs.sort(key=lambda x: x["h"], reverse=True)

  revs_html = ""
  for r in all_revs[:10]:
    tareas = f' ({r["tareas"]} tareas)' if r.get("tareas") else ""
    revs_html += f'<tr><td>{r["h"]}h</td><td>{r["fecha"]}</td><td>{r["tipo"]}{tareas}</td></tr>'
  if not revs_html:
    revs_html = '<tr><td colspan="3" style="text-align:center;color:#94A3B8;">Sin revisiones registradas</td></tr>'

  pend = maq.get("revisiones_pendientes", [])
  pend_html = ""
  for p in pend:
    urg = p.get("urgente", False)
    hito = p.get("proximo_hito", "")
    tipo = p.get("tipo", "")
    color = "#DC2626" if urg else "#CA8A04"
    pend_html += f'<span style="display:inline-block;padding:4px 10px;border-radius:99px;font-size:12px;background:{color}15;color:{color};border:1px solid {color}30;margin:2px;">{hito}h ({tipo}){"&iexcl;atrasada!" if urg else ""}</span> '
  if not pend_html:
    pend_html = '<span style="color:#16A34A;font-size:13px;">Todas al d&iacute;a</span>'

  inc_count = len(maq.get("incidencias", []))
  horas_operadas = (horo or 0) - (horo_ini or 0)

  return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Auditor View &mdash; {_esc_html(nombre)}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:#F1F5F9;color:#1E293B;line-height:1.5;}}
.container{{max-width:900px;margin:0 auto;padding:24px 16px;}}
.header{{background:linear-gradient(135deg,#1E293B,#334155);color:#fff;padding:32px 28px;border-radius:16px;margin-bottom:24px;}}
.header h1{{font-size:26px;font-weight:700;margin-bottom:4px;}}
.header .subtitle{{font-size:14px;opacity:0.7;}}
.badge{{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:500;}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;}}
.kpi{{background:#fff;border-radius:12px;padding:16px;border:1px solid #E2E8F0;}}
.kpi-label{{font-size:11px;text-transform:uppercase;color:#64748B;margin-bottom:4px;}}
.kpi-value{{font-size:24px;font-weight:700;}}
.kpi-sub{{font-size:12px;color:#64748B;}}
.section{{background:#fff;border-radius:12px;border:1px solid #E2E8F0;margin-bottom:16px;overflow:hidden;}}
.section-header{{padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:14px;}}
.section-body{{padding:16px 20px;}}
table{{width:100%;border-collapse:collapse;font-size:13px;}}
th{{text-align:left;padding:6px 8px;border-bottom:2px solid #E2E8F0;font-size:11px;text-transform:uppercase;color:#64748B;}}
td{{padding:6px 8px;border-bottom:1px solid #F1F5F9;}}
.actions{{display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;}}
.btn{{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;border:1px solid #E2E8F0;background:#fff;color:#1E293B;cursor:pointer;transition:all .15s;}}
.btn:hover{{background:#F8FAFC;box-shadow:0 2px 8px rgba(0,0,0,.06);}}
.btn-primary{{background:#2563EB;color:#fff;border-color:#2563EB;}} .btn-primary:hover{{background:#1D4ED8;}}
.footer{{text-align:center;padding:24px;font-size:12px;color:#94A3B8;}}
.charts-container{{position:relative;height:260px;margin-bottom:16px;}}
.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:16px;}}
@media(max-width:640px){{.two-col{{grid-template-columns:1fr;}} .kpis{{grid-template-columns:1fr 1fr;}}}}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
</head><body>
<div class="container">
  <div class="header">
    <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px;">
      <div>
        <h1>{_esc_html(nombre)}</h1>
        <div class="subtitle">{_esc_html(internal_id)} &middot; {_esc_html(modelo)}{(' &middot; S/N: ' + _esc_html(serie)) if serie else ''}</div>
      </div>
      <div style="text-align:right;">
        <span class="badge" style="background:{est_color}25;color:{est_color};">{est_label}</span>
        <div style="font-size:11px;opacity:0.6;margin-top:4px;">V&aacute;lido hasta: {expires}</div>
      </div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Hor&oacute;metro actual</div><div class="kpi-value">{horo:,.0f}h</div><div class="kpi-sub">Inicial: {horo_ini:,.0f}h &middot; Operadas: {horas_operadas:,.0f}h</div></div>
    <div class="kpi"><div class="kpi-label">Comisionado</div><div class="kpi-value">{comision or '&mdash;'}</div><div class="kpi-sub">{_esc_html(proyecto) if proyecto else 'Sin proyecto asignado'}</div></div>
    <div class="kpi"><div class="kpi-label">Revisiones pendientes</div><div class="kpi-value">{len(pend)}</div><div class="kpi-sub">{pend_html}</div></div>
    <div class="kpi"><div class="kpi-label">Incidencias abiertas</div><div class="kpi-value" style="color:{'#DC2626' if inc_count else '#16A34A'};">{inc_count}</div></div>
  </div>

  <div class="actions">
    <a href="/audit/{token}/passport.pdf" target="_blank" class="btn btn-primary">Descargar Asset Passport (PDF)</a>
    <a href="/audit/{token}/history.pdf" target="_blank" class="btn">Descargar Historial de Servicio (PDF)</a>
  </div>

  <div class="section">
    <div class="section-header">An&aacute;lisis de consumo de horas</div>
    <div class="section-body">
      <div class="charts-container"><canvas id="audit-chart-cumulative"></canvas></div>
      <div class="charts-container"><canvas id="audit-chart-biweekly"></canvas></div>
      <div id="audit-charts-summary" style="padding:8px 0;font-size:13px;color:#64748B;"></div>
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-header">Checks semanales ({len(checks)})</div>
      <div class="section-body"><table><thead><tr><th>Fecha</th><th>Hor&oacute;metro</th><th>Estado</th></tr></thead><tbody>{checks_html}</tbody></table></div>
    </div>
    <div class="section">
      <div class="section-header">Revisiones realizadas ({len(all_revs)})</div>
      <div class="section-body"><table><thead><tr><th>Hor&oacute;metro</th><th>Fecha</th><th>Tipo</th></tr></thead><tbody>{revs_html}</tbody></table></div>
    </div>
  </div>

  <div class="footer">
    Documento generado para <strong>{_esc_html(destinatario)}</strong> &middot; Datos actualizados al {_dt.now().strftime('%d/%m/%Y %H:%M')}
    <br>Hincado Directo S.L. &mdash; Vista de auditor&iacute;a de solo lectura
  </div>
</div>

<script>
(function() {{
  fetch("/audit/{token}/chart-data")
    .then(function(r) {{ return r.ok ? r.json() : null; }})
    .then(function(data) {{
      if (!data || !data.readings || data.readings.length < 2) return;
      var AZ = "#2563EB", VE = "#16A34A";
      new Chart(document.getElementById("audit-chart-cumulative"), {{
        type: "line",
        data: {{ labels: data.readings.map(function(r){{ return r.date; }}),
          datasets: [{{ label: "Hor\u00f3metro (h)", data: data.readings.map(function(r){{ return r.horo; }}),
            borderColor: AZ, backgroundColor: AZ + "25", fill: true, tension: 0.2,
            pointRadius: 3, pointBackgroundColor: AZ, borderWidth: 2 }}] }},
        options: {{ responsive: true, maintainAspectRatio: false,
          plugins: {{ title: {{ display: true, text: "Evoluci\u00f3n del hor\u00f3metro", font: {{ size: 14, weight: "bold" }}, color: "#1E293B" }}, legend: {{ display: false }} }},
          scales: {{ x: {{ type: "time", time: {{ unit: "month", displayFormats: {{ month: "MMM yyyy" }} }}, grid: {{ display: false }} }},
            y: {{ title: {{ display: true, text: "Hor\u00f3metro (h)" }}, grid: {{ color: "#E2E8F020" }} }} }} }}
      }});
      var vals = data.biweekly.map(function(b){{ return b.consumption; }});
      var avg = vals.reduce(function(a,b){{ return a+b; }}, 0) / (vals.length || 1);
      new Chart(document.getElementById("audit-chart-biweekly"), {{
        type: "bar",
        data: {{ labels: data.biweekly.map(function(b){{ return b.label; }}),
          datasets: [
            {{ label: "Horas", data: vals, backgroundColor: vals.map(function(v){{ return v > 0 ? AZ+"CC" : "#E2E8F0"; }}), borderRadius: 3, order: 2 }},
            {{ label: "Media: "+avg.toFixed(0)+"h", data: vals.map(function(){{ return avg; }}), type: "line", borderColor: VE, borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false, order: 1 }}
          ] }},
        options: {{ responsive: true, maintainAspectRatio: false,
          plugins: {{ title: {{ display: true, text: "Consumo bisemanal", font: {{ size: 14, weight: "bold" }}, color: "#1E293B" }},
            legend: {{ labels: {{ filter: function(i){{ return i.datasetIndex===1; }} }} }} }},
          scales: {{ x: {{ grid: {{ display: false }}, ticks: {{ maxRotation: 30 }} }},
            y: {{ title: {{ display: true, text: "Horas" }}, grid: {{ color: "#E2E8F020" }}, ticks: {{ precision: 0 }} }} }} }}
      }});
      if (data.stats) {{
        var s = data.stats;
        document.getElementById("audit-charts-summary").innerHTML =
          "<strong>Resumen:</strong> " + s.period_start + " \u2014 " + s.period_end +
          " \u00b7 Total operadas: " + s.total_hours + "h \u00b7 Media semanal: " + s.avg_weekly + "h \u00b7 Utilizaci\u00f3n: " + s.utilization_pct + "%";
      }}
    }}).catch(function() {{}});
}})();
</script>
</body></html>"""
