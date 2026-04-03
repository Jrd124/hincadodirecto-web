"""Rutas generales: dashboard inicio, health, listado empresas, finanzas resumen/dashboard."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, send_from_directory
from flask_login import current_user

from config import EMPRESAS_CLIENTE
from routes.helpers import _parse_importe_es, _sum_importes

logger = logging.getLogger("erp")

api_general_bp = Blueprint("api_general", __name__)


@api_general_bp.get("/")
def index():
  """Sirve la página principal de la interfaz de facturas."""
  from flask import current_app
  return send_from_directory(current_app.static_folder, "index.html")


@api_general_bp.get("/api/health")
def api_health():
  """Health check para Docker y monitorizacion."""
  from core.db import conectar as _conectar_db
  from datetime import datetime as _dt
  try:
    with _conectar_db() as conn:
      conn.execute("SELECT 1")
    return jsonify({"status": "ok", "timestamp": _dt.now().isoformat()})
  except Exception as e:
    return jsonify({"status": "error", "detail": str(e)}), 503


@api_general_bp.get("/api/dashboard")
def api_dashboard():
  """Devuelve datos agregados para el dashboard de inicio."""
  from datetime import datetime as _dt, timedelta as _td
  from core.db import conectar as _conectar_db
  mes_actual = _dt.now().strftime("%Y-%m")
  empresas = [{"id": id_, "nombre": nombre} for id_, nombre in EMPRESAS_CLIENTE.items()]
  result = {
    "usuario": current_user.nombre if current_user.is_authenticated else "",
    "facturas_pendientes_count": 0,
    "importe_pendiente_total": 0.0,
    "facturas_mes_count": 0,
    "empresas_activas": len(empresas),
    "ultimas_facturas": [],
    "pendientes_por_empresa": [],
  }
  try:
    with _conectar_db() as conn:
      row = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN total_a_pagar LIKE '%,%' THEN CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL) ELSE CAST(total_a_pagar AS REAL) END), 0) as total "
        "FROM facturas_proveedor WHERE LOWER(TRIM(estado_pago)) = 'pendiente'"
      ).fetchone()
      if row:
        result["facturas_pendientes_count"] = row["cnt"]
        result["importe_pendiente_total"] = round(row["total"], 2)
      row2 = conn.execute(
        "SELECT COUNT(*) as cnt FROM facturas_proveedor WHERE fecha_factura LIKE ?",
        (mes_actual + "%",),
      ).fetchone()
      if row2:
        result["facturas_mes_count"] = row2["cnt"]
      rows = conn.execute(
        "SELECT fecha_factura, proveedor, total_a_pagar, estado_pago, empresa_id "
        "FROM facturas_proveedor ORDER BY fecha_factura DESC LIMIT 5"
      ).fetchall()
      emp_map = {e["id"]: e["nombre"] for e in empresas}
      result["ultimas_facturas"] = [
        {"fecha": r["fecha_factura"], "proveedor": r["proveedor"], "total": r["total_a_pagar"], "empresa": emp_map.get(r["empresa_id"], r["empresa_id"] or "—")}
        for r in rows
      ]
      rows2 = conn.execute(
        "SELECT empresa_id, COUNT(*) as cnt, COALESCE(SUM(CASE WHEN total_a_pagar LIKE '%,%' THEN CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL) ELSE CAST(total_a_pagar AS REAL) END), 0) as total "
        "FROM facturas_proveedor WHERE LOWER(TRIM(estado_pago)) = 'pendiente' GROUP BY empresa_id"
      ).fetchall()
      result["pendientes_por_empresa"] = [
        {"empresa": emp_map.get(r["empresa_id"], r["empresa_id"]), "count": r["cnt"], "importe": round(r["total"], 2)}
        for r in rows2
      ]
      _meses_es = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
      hoy = _dt.now()
      meses_rango = []
      for i in range(5, -1, -1):
        d = hoy.replace(day=1) - _td(days=i * 28)
        d = d.replace(day=1)
        meses_rango.append((d.year, d.month))
      seen = set()
      meses_uniq = []
      for ym in meses_rango:
        if ym not in seen:
          seen.add(ym)
          meses_uniq.append(ym)
      if len(meses_uniq) < 6:
        d = _dt(meses_uniq[0][0], meses_uniq[0][1], 1) - _td(days=1)
        meses_uniq.insert(0, (d.year, d.month))
      meses_uniq = meses_uniq[-6:]
      facturas_por_mes = []
      for y, m in meses_uniq:
        prefix = f"{y}-{m:02d}"
        r = conn.execute(
          "SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN total_a_pagar LIKE '%,%' THEN CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL) ELSE CAST(total_a_pagar AS REAL) END), 0) as total "
          "FROM facturas_proveedor WHERE fecha_factura LIKE ?", (prefix + "%",)
        ).fetchone()
        facturas_por_mes.append({"mes": _meses_es[m - 1], "count": r["cnt"], "importe": round(r["total"], 2)})
      result["facturas_por_mes"] = facturas_por_mes
      estados = conn.execute(
        "SELECT LOWER(TRIM(estado_pago)) as st, COUNT(*) as cnt FROM facturas_proveedor GROUP BY st"
      ).fetchall()
      estado_map = {"pendiente": 0, "pagada": 0, "parcial": 0}
      for e in estados:
        st = e["st"]
        if st in estado_map:
          estado_map[st] = e["cnt"]
      result["facturas_por_estado"] = estado_map
      top = conn.execute(
        "SELECT proveedor, COALESCE(SUM(CASE WHEN total_a_pagar LIKE '%,%' THEN CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL) ELSE CAST(total_a_pagar AS REAL) END), 0) as total "
        "FROM facturas_proveedor GROUP BY proveedor ORDER BY total DESC LIMIT 5"
      ).fetchall()
      result["top_proveedores"] = [{"nombre": t["proveedor"], "importe": round(t["total"], 2)} for t in top]
  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/dashboard: %s", e)
  return jsonify(result)


@api_general_bp.get("/api/dashboard/director")
def api_dashboard_director():
  """Dashboard de director: visión global de toda la empresa."""
  from datetime import datetime as _dt, timedelta as _td, date as _date
  from core.db import conectar as _conectar_db

  hoy = _date.today()
  mes_prefix = hoy.strftime("%Y-%m")
  anio_prefix = hoy.strftime("%Y")

  result = {
    "usuario": current_user.nombre if current_user.is_authenticated else "",
    "proyectos": {"vivos": 0, "cotizados": 0, "hincas_hoy": 0, "hincas_semana": 0, "lista_vivos": []},
    "finanzas": {"facturado_mes": 0, "facturado_año": 0, "pendiente_cobro": 0, "pendiente_cobro_count": 0, "pendiente_pago": 0, "pendiente_pago_count": 0, "cobrado_mes": 0},
    "alertas": [],
    "maquinaria": {"total": 0, "asignadas": 0, "en_taller": 0, "revisiones_pendientes": 0},
    "actividad_reciente": [],
  }
  try:
    with _conectar_db() as conn:
      # ── Proyectos ──
      row = conn.execute("SELECT estado, COUNT(*) as c FROM proyectos GROUP BY estado").fetchall()
      for r in row:
        if r["estado"] == "vivo":
          result["proyectos"]["vivos"] = r["c"]
        elif r["estado"] == "cotizado":
          result["proyectos"]["cotizados"] = r["c"]

      # Hincas hoy
      r = conn.execute(
        "SELECT COALESCE(SUM(hincas_realizadas),0) as h FROM proyecto_partes WHERE fecha = ?",
        (hoy.isoformat(),)
      ).fetchone()
      result["proyectos"]["hincas_hoy"] = r["h"] if r else 0

      # Hincas semana (lunes a hoy)
      lunes = hoy - _td(days=hoy.weekday())
      r = conn.execute(
        "SELECT COALESCE(SUM(hincas_realizadas),0) as h FROM proyecto_partes WHERE fecha >= ? AND fecha <= ?",
        (lunes.isoformat(), hoy.isoformat())
      ).fetchone()
      result["proyectos"]["hincas_semana"] = r["h"] if r else 0

      # Lista proyectos vivos
      vivos = conn.execute(
        "SELECT p.id, p.nombre, p.codigo, p.provincia, p.ubicacion_texto,"
        " p.hincas_estimadas, p.hincas_realizadas,"
        " t.nombre_canonico as cliente"
        " FROM proyectos p LEFT JOIN terceros t ON p.cliente_tercero_id = t.id"
        " WHERE p.estado = 'vivo' ORDER BY p.nombre"
      ).fetchall()
      lista_vivos = []
      for v in vivos:
        # Hincas hoy para este proyecto
        ph = conn.execute(
          "SELECT COALESCE(SUM(hincas_realizadas),0) as h FROM proyecto_partes WHERE proyecto_id = ? AND fecha = ?",
          (v["id"], hoy.isoformat())
        ).fetchone()
        lista_vivos.append({
          "id": v["id"], "nombre": v["nombre"], "codigo": v["codigo"] or "",
          "cliente": v["cliente"] or "—",
          "hincas_acumuladas": v["hincas_realizadas"] or 0,
          "hincas_estimadas": v["hincas_estimadas"] or 0,
          "hincas_hoy": ph["h"] if ph else 0,
          "ubicacion": v["ubicacion_texto"] or "", "provincia": v["provincia"] or "",
        })
      result["proyectos"]["lista_vivos"] = lista_vivos

      # ── Finanzas ──
      _PARSE_IMPORTE = ("CASE WHEN total_a_pagar LIKE '%,%'"
                        " THEN CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL)"
                        " ELSE CAST(total_a_pagar AS REAL) END")

      # Facturado mes (clientes)
      r = conn.execute(
        f"SELECT COALESCE(SUM({_PARSE_IMPORTE}),0) as t FROM facturas_cliente WHERE fecha_factura LIKE ?",
        (mes_prefix + "%",)
      ).fetchone()
      result["finanzas"]["facturado_mes"] = round(r["t"], 2) if r else 0

      # Facturado año (clientes)
      r = conn.execute(
        f"SELECT COALESCE(SUM({_PARSE_IMPORTE}),0) as t FROM facturas_cliente WHERE fecha_factura LIKE ?",
        (anio_prefix + "%",)
      ).fetchone()
      result["finanzas"]["facturado_año"] = round(r["t"], 2) if r else 0

      # Pendiente cobro (clientes) — net of partial collections
      facturas_pte = conn.execute(
        "SELECT id, total_a_pagar, estado_cobro FROM facturas_cliente"
        " WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) IN ('pendiente','','parcial')"
      ).fetchall()
      # Get collected amounts from movimientos.db + conciliacion_multiple
      cobrado_por_factura = {}
      try:
        import sqlite3 as _sq
        from config import MOVIMIENTOS_DB
        conn_b = _sq.connect(str(MOVIMIENTOS_DB))
        conn_b.row_factory = _sq.Row
        for row in conn_b.execute(
          "SELECT factura_cliente_id, SUM(ABS(importe)) as total"
          " FROM movimientos WHERE factura_cliente_id IS NOT NULL GROUP BY factura_cliente_id"
        ).fetchall():
          cobrado_por_factura[row["factura_cliente_id"]] = float(row["total"] or 0)
        conn_b.close()
      except Exception:
        pass
      # Also from conciliacion_multiple
      try:
        for row in conn.execute(
          "SELECT factura_cliente_id, SUM(importe_aplicado) as total"
          " FROM conciliacion_multiple GROUP BY factura_cliente_id"
        ).fetchall():
          fid = row["factura_cliente_id"]
          cobrado_por_factura[fid] = cobrado_por_factura.get(fid, 0) + float(row["total"] or 0)
      except Exception:
        pass

      total_pte_cobro = 0.0
      n_pte_cobro = 0
      for f in facturas_pte:
        total_fac = _parse_importe_es(f["total_a_pagar"])
        cobrado = cobrado_por_factura.get(f["id"], 0)
        neto = max(0, total_fac - cobrado)
        if neto > 0.01:
          total_pte_cobro += neto
          n_pte_cobro += 1
      result["finanzas"]["pendiente_cobro"] = round(total_pte_cobro, 2)
      result["finanzas"]["pendiente_cobro_count"] = n_pte_cobro

      # Cobrado mes (clientes)
      r = conn.execute(
        f"SELECT COALESCE(SUM({_PARSE_IMPORTE}),0) as t"
        " FROM facturas_cliente WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) = 'cobrada' AND fecha_factura LIKE ?",
        (mes_prefix + "%",)
      ).fetchone()
      result["finanzas"]["cobrado_mes"] = round(r["t"], 2) if r else 0

      # Pendiente pago (proveedores) — Python-side parsing for robustness
      facturas_prov_pte = conn.execute(
        "SELECT total_a_pagar FROM facturas_proveedor"
        " WHERE LOWER(TRIM(COALESCE(estado_pago,''))) IN ('pendiente','')"
      ).fetchall()
      result["finanzas"]["pendiente_pago"] = round(_sum_importes(facturas_prov_pte, "total_a_pagar"), 2)
      result["finanzas"]["pendiente_pago_count"] = len(facturas_prov_pte)

      # ── Maquinaria ──
      r = conn.execute("SELECT COUNT(*) as total FROM maquinas WHERE activa = 1").fetchone()
      result["maquinaria"]["total"] = r["total"] if r else 0

      r = conn.execute("SELECT COUNT(*) as c FROM maquinas WHERE activa = 1 AND proyecto_id IS NOT NULL").fetchone()
      result["maquinaria"]["asignadas"] = r["c"] if r else 0

      r = conn.execute("SELECT COUNT(*) as c FROM maquinas WHERE activa = 1 AND estado = 'taller'").fetchone()
      result["maquinaria"]["en_taller"] = r["c"] if r else 0

      r = conn.execute("SELECT COUNT(*) as c FROM maquinaria_revisiones WHERE estado = 'abierto'").fetchone()
      result["maquinaria"]["revisiones_pendientes"] = r["c"] if r else 0

      # ── Alertas ──
      alertas = []

      # 1. Facturas cliente vencidas > 30 días → alta
      rows = conn.execute(
        "SELECT numero_factura, cliente, fecha_vencimiento, fecha_factura"
        " FROM facturas_cliente"
        " WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) IN ('pendiente','','')"
        " AND COALESCE(fecha_vencimiento, fecha_factura) != ''"
      ).fetchall()
      for f in rows:
        ref_date = f["fecha_vencimiento"] or f["fecha_factura"]
        if not ref_date:
          continue
        try:
          d = _date.fromisoformat(ref_date)
        except (ValueError, TypeError):
          continue
        dias = (hoy - d).days
        if dias > 30:
          alertas.append({
            "tipo": "factura_vencida",
            "mensaje": f"Factura {f['numero_factura']} de {f['cliente'][:30]} vencida hace {dias} días",
            "severidad": "alta", "orden": 1,
            "link": "#finanzas/clientes",
          })
        elif dias > 15:
          alertas.append({
            "tipo": "factura_vencida",
            "mensaje": f"Factura {f['numero_factura']} de {f['cliente'][:30]} vencida hace {dias} días",
            "severidad": "media", "orden": 2,
            "link": "#finanzas/clientes",
          })

      # 2. Obligaciones fiscales
      oblig = conn.execute(
        "SELECT modelo, descripcion, periodo, año, fecha_limite, sociedad"
        " FROM obligaciones_fiscales WHERE LOWER(TRIM(COALESCE(estado,''))) = 'pendiente'"
      ).fetchall()
      for o in oblig:
        try:
          dl = _date.fromisoformat(o["fecha_limite"])
        except (ValueError, TypeError):
          continue
        dias = (dl - hoy).days
        if dias < 0:
          alertas.append({
            "tipo": "impuesto_vencido",
            "mensaje": f"Modelo {o['modelo']} {o['periodo']} {o['año']} ({o['sociedad'][:20]}) vencido hace {abs(dias)} días",
            "severidad": "alta", "orden": 0,
            "link": "#impuestos",
          })
        elif dias <= 15:
          alertas.append({
            "tipo": "impuesto_proximo",
            "mensaje": f"Modelo {o['modelo']} {o['periodo']} {o['año']} ({o['sociedad'][:20]}) vence en {dias} días",
            "severidad": "media", "orden": 2,
            "link": "#impuestos",
          })

      # 3. Proyectos vivos sin partes en últimos 3 días laborables
      dias_atras = 0
      dias_lab = 0
      fecha_check = hoy
      while dias_lab < 3:
        fecha_check = hoy - _td(days=dias_atras)
        if fecha_check.weekday() < 5:
          dias_lab += 1
        dias_atras += 1
      for v in lista_vivos:
        r = conn.execute(
          "SELECT COUNT(*) as c FROM proyecto_partes WHERE proyecto_id = ? AND fecha >= ?",
          (v["id"], fecha_check.isoformat())
        ).fetchone()
        if r and r["c"] == 0:
          alertas.append({
            "tipo": "sin_partes",
            "mensaje": f"{v['nombre']}: sin partes en los últimos 3 días laborables",
            "severidad": "info", "orden": 3,
            "link": f"#proyectos/dashboard/{v['id']}",
          })

      # Ordenar por severidad y limitar
      alertas.sort(key=lambda a: a["orden"])
      result["alertas"] = alertas[:10]
      result["alertas_total"] = len(alertas)

      # ── Actividad reciente ──
      actividad = []

      # Partes recientes
      partes_rec = conn.execute(
        "SELECT pp.fecha, pp.hincas_realizadas, pp.created_at, p.nombre as proyecto"
        " FROM proyecto_partes pp JOIN proyectos p ON pp.proyecto_id = p.id"
        " ORDER BY pp.created_at DESC LIMIT 5"
      ).fetchall()
      for p in partes_rec:
        actividad.append({
          "fecha": p["created_at"][:16] if p["created_at"] else p["fecha"],
          "texto": f"Parte registrado: {p['proyecto']} — {p['hincas_realizadas'] or 0} hincas",
          "tipo": "parte",
          "categoria": "proyectos",
        })

      # Facturas cliente recientes
      fac_cli = conn.execute(
        "SELECT numero_factura, cliente, total_a_pagar, fecha_factura"
        " FROM facturas_cliente ORDER BY ROWID DESC LIMIT 5"
      ).fetchall()
      for f in fac_cli:
        actividad.append({
          "fecha": f["fecha_factura"] or "",
          "texto": f"Factura {f['numero_factura']} emitida a {f['cliente'][:25]} — {f['total_a_pagar']} €",
          "tipo": "factura",
          "categoria": "finanzas",
        })

      # Facturas proveedor recientes
      fac_prov = conn.execute(
        "SELECT proveedor, total_a_pagar, fecha_factura"
        " FROM facturas_proveedor ORDER BY ROWID DESC LIMIT 5"
      ).fetchall()
      for f in fac_prov:
        actividad.append({
          "fecha": f["fecha_factura"] or "",
          "texto": f"Factura recibida de {f['proveedor'][:25]} — {f['total_a_pagar']} €",
          "tipo": "factura_prov",
          "categoria": "finanzas",
        })

      # Interacciones CRM recientes
      crm_rows = conn.execute(
        "SELECT i.asunto, i.tipo, i.fecha, i.fecha_creacion,"
        " COALESCE(e.nombre, '') as empresa"
        " FROM crm_interacciones i"
        " LEFT JOIN crm_empresas e ON i.empresa_id = e.id"
        " ORDER BY COALESCE(i.fecha_creacion, i.fecha) DESC LIMIT 5"
      ).fetchall()
      for r in crm_rows:
        actividad.append({
          "fecha": r["fecha_creacion"] or r["fecha"] or "",
          "texto": f"CRM: {r['tipo'] or 'Interacción'} — {r['asunto'][:40]}" + (f" ({r['empresa'][:20]})" if r["empresa"] else ""),
          "tipo": "crm",
          "categoria": "crm",
        })

      # Checks de maquinaria recientes
      maq_rows = conn.execute(
        "SELECT c.fecha, c.created_at, c.estado, m.nombre as maquina"
        " FROM maquinaria_checks c"
        " JOIN maquinas m ON c.maquina_id = m.id"
        " ORDER BY c.created_at DESC LIMIT 5"
      ).fetchall()
      for r in maq_rows:
        actividad.append({
          "fecha": r["created_at"] or r["fecha"] or "",
          "texto": f"Check {r['maquina']}: {r['estado'] or 'realizado'}",
          "tipo": "maquinaria_check",
          "categoria": "maquinaria",
        })

      # Ordenar por fecha desc y limitar a 20
      actividad.sort(key=lambda a: a["fecha"] or "", reverse=True)
      result["actividad_reciente"] = actividad[:20]

  except Exception as e:
    logger.warning("Error en /api/dashboard/director: %s", e)
  return jsonify(result)


@api_general_bp.get("/api/finanzas/resumen")
def api_finanzas_resumen():
  """Resumen rápido para el dashboard del módulo Finanzas."""
  from datetime import datetime as _dt
  from core.db import conectar as _conectar_db
  anio = _dt.now().strftime("%Y")
  result = {"total_prov": 0.0, "total_cli": 0.0, "sin_conciliar": 0}
  try:
    with _conectar_db() as conn:
      r = conn.execute(
        "SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL)),0) as t "
        "FROM facturas_proveedor WHERE fecha_factura LIKE ?", (anio + "%",)
      ).fetchone()
      if r:
        result["total_prov"] = round(r["t"], 2)
      r2 = conn.execute(
        "SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar,'.',''),',','.') AS REAL)),0) as t "
        "FROM facturas_cliente WHERE fecha_factura LIKE ?", (anio + "%",)
      ).fetchone()
      if r2:
        result["total_cli"] = round(r2["t"], 2)
      r3 = conn.execute(
        "SELECT COUNT(*) as cnt FROM movimientos_banco WHERE conciliado_at IS NULL OR TRIM(conciliado_at) = ''"
      ).fetchone()
      if r3:
        result["sin_conciliar"] = r3["cnt"]
  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/finanzas/resumen: %s", e)
  return jsonify(result)


@api_general_bp.get("/api/finanzas/dashboard")
def api_finanzas_dashboard():
  """Dashboard financiero completo."""
  from datetime import date as _date
  from core.db import conectar as _conectar_db

  year = _date.today().year
  result = {
    "year": year,
    "facturacion_clientes": {"total": 0, "num": 0},
    "cobros_pendientes": {"total": 0, "num": 0},
    "facturacion_proveedores": {"total": 0, "num": 0},
    "pagos_pendientes": {"total": 0, "num": 0},
    "margen_bruto": 0,
    "proyectos": [],
    "pipeline": [],
    "pipeline_total": 0,
    "movimientos_sin_conciliar": 0,
  }

  try:
    with _conectar_db() as conn:
      rows = conn.execute(
        "SELECT total_a_pagar FROM facturas_cliente WHERE fecha_factura LIKE ?",
        (f"{year}%",),
      ).fetchall()
      result["facturacion_clientes"] = {
        "total": _sum_importes(rows, "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total_a_pagar FROM facturas_cliente "
        "WHERE estado_cobro IS NULL OR estado_cobro IN ('pendiente','parcial','')"
      ).fetchall()
      result["cobros_pendientes"] = {
        "total": _sum_importes(rows, "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total, total_a_pagar FROM facturas_proveedor WHERE fecha_factura LIKE ?",
        (f"{year}%",),
      ).fetchall()
      result["facturacion_proveedores"] = {
        "total": _sum_importes(rows, "total", "total_a_pagar"), "num": len(rows),
      }

      rows = conn.execute(
        "SELECT total, total_a_pagar FROM facturas_proveedor "
        "WHERE estado_pago IS NULL OR estado_pago IN ('pendiente','Pendiente','')"
      ).fetchall()
      result["pagos_pendientes"] = {
        "total": _sum_importes(rows, "total", "total_a_pagar"), "num": len(rows),
      }

      result["margen_bruto"] = round(
        result["facturacion_clientes"]["total"] - result["facturacion_proveedores"]["total"], 2
      )

      proyectos = [dict(r) for r in conn.execute("""
        SELECT p.id, p.nombre, p.codigo, p.estado, p.importe_presupuestado,
               t.nombre_canonico AS cliente
        FROM proyectos p
        LEFT JOIN terceros t ON t.id = p.cliente_tercero_id
        WHERE p.estado IN ('vivo','terminado','pausado')
        ORDER BY p.estado, p.nombre
      """).fetchall()]

      for proy in proyectos:
        rows = conn.execute(
          "SELECT total_a_pagar FROM facturas_cliente WHERE proyecto_id = ?",
          [proy["id"]],
        ).fetchall()
        proy["facturado"] = _sum_importes(rows, "total_a_pagar")

        rows = conn.execute(
          "SELECT total, total_a_pagar FROM facturas_proveedor WHERE proyecto_id = ?",
          [proy["id"]],
        ).fetchall()
        proy["costes"] = _sum_importes(rows, "total", "total_a_pagar")

        proy["margen"] = round(proy["facturado"] - proy["costes"], 2)
        proy["margen_pct"] = round(proy["margen"] / proy["facturado"] * 100, 1) if proy["facturado"] > 0 else 0

      result["proyectos"] = proyectos

      try:
        pipeline = [dict(r) for r in conn.execute("""
          SELECT p.id, p.referencia, p.nombre_proyecto, p.estado,
                 v.total AS importe,
                 t.nombre_canonico AS cliente
          FROM presupuestos p
          LEFT JOIN presupuesto_versiones v ON v.presupuesto_id = p.id AND v.es_activa = 1
          LEFT JOIN terceros t ON t.id = p.tercero_id
          WHERE p.estado IN ('enviada','negociacion')
          ORDER BY v.total DESC
        """).fetchall()]
        result["pipeline"] = pipeline
        result["pipeline_total"] = round(sum(p.get("importe") or 0 for p in pipeline), 2)
      except Exception:
        pass

      try:
        r = conn.execute(
          "SELECT COUNT(*) FROM movimientos_banco WHERE conciliado_at IS NULL OR TRIM(conciliado_at) = ''"
        ).fetchone()
        result["movimientos_sin_conciliar"] = r[0] if r else 0
      except Exception:
        pass

  except Exception as e:
    logging.getLogger(__name__).warning("Error en /api/finanzas/dashboard: %s", e)

  return jsonify(result)


@api_general_bp.get("/api/empresas")
def listar_empresas():
  """
  Devuelve el listado de empresas cargado desde config/empresas.toml.
  """
  empresas = [{"id": id_, "nombre": nombre} for id_, nombre in EMPRESAS_CLIENTE.items()]
  resp = jsonify(empresas)
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  resp.headers["Pragma"] = "no-cache"
  return resp
