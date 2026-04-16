#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bot de Telegram para Hincado Directo ERP.

Ejecutar como proceso independiente:  python bot_telegram.py
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from functools import partial
from pathlib import Path

# Ensure the app root is on sys.path so `core.*` and `config` resolve
_APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_APP_DIR))
# Do NOT set APP_BASE_DIR here — let config.py resolve it naturally via parents[1]
# (in Docker, APP_BASE_DIR=/app is set in the Dockerfile)

from dotenv import load_dotenv
load_dotenv(_APP_DIR / ".env")

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    ContextTypes,
    filters,
)
from telegram.constants import ParseMode

from config import OPENAI_API_KEY, DATOS_DIR
from openai import OpenAI
from core.db import conectar, get_conn
from core.bot_db import (
    init_bot_db,
    get_usuario,
    registrar_usuario,
    aprobar_usuario,
    listar_usuarios,
    listar_superadmins,
    get_estado,
    set_estado,
    clear_estado,
)

logging.basicConfig(
    format="%(asctime)s [BOT] %(levelname)s %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("bot")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY, timeout=30) if OPENAI_API_KEY else None

_executor = ThreadPoolExecutor(max_workers=4)


async def _run_sync(fn, *args, **kwargs):
    """Run a blocking function in a thread so it doesn't block the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, partial(fn, *args, **kwargs))


# ═══════════════════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════════════════

def _user_rol(telegram_id: int) -> str | None:
    u = get_usuario(telegram_id)
    return u["rol"] if u else None


async def _notify_superadmins(context: ContextTypes.DEFAULT_TYPE, text: str):
    for tid in listar_superadmins():
        try:
            await context.bot.send_message(chat_id=tid, text=text, parse_mode=ParseMode.MARKDOWN)
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════
#  /start  /help
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tid = update.effective_user.id
    nombre = update.effective_user.full_name
    user = get_usuario(tid)

    if not user:
        user = registrar_usuario(tid, nombre)
        await update.message.reply_text(
            f"👋 *Bienvenido a Hincado Directo*, {nombre}.\n\n"
            "Tu solicitud de acceso ha sido enviada al administrador. "
            "Espera a que te den de alta.",
            parse_mode=ParseMode.MARKDOWN,
        )
        await _notify_superadmins(
            context,
            f"🆕 *Solicitud de acceso*\n{nombre} (ID: `{tid}`) quiere acceder al bot.\nUsa /aprobar para gestionar.",
        )
        return

    if user["rol"] == "pendiente":
        await update.message.reply_text("⏳ Tu solicitud está pendiente de aprobación.")
        return
    if user["rol"] == "bloqueado":
        await update.message.reply_text("🚫 Tu acceso ha sido bloqueado.")
        return

    rol_emoji = "👑" if user["rol"] == "superadmin" else "👷"
    await update.message.reply_text(
        f"👋 *Hola {nombre}* {rol_emoji}\n\n"
        f"Rol: *{user['rol']}*\n"
        "Escribe /help para ver los comandos disponibles.",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        await update.message.reply_text("No tienes acceso. Usa /start para solicitar acceso.")
        return

    txt = "📖 *Comandos disponibles:*\n\n"
    if rol == "superadmin":
        txt += (
            "/resumen — Resumen del día\n"
            "/alertas — Alertas urgentes\n"
            "/proyectos — Proyectos con progreso\n"
            "/finanzas — Facturación y pendientes\n"
            "/pendientes — Partes sin firmar\n"
            "/aprobar — Aprobar usuarios nuevos\n"
            "/usuarios — Lista de usuarios del bot\n"
            "/vertarjetas — Tarjetas asignadas\n"
            "/asignartarjeta — Asignar tarjeta a operario\n\n"
            "📷 Envía una foto de: parte, albarán, factura proveedor o cliente\n\n"
            "💬 También puedes preguntarme lo que quieras en lenguaje natural.\n"
            '_Ej: "¿Cuántas hincas lleva Logroño?"_'
        )
    else:
        txt += (
            "📷 Envía una *foto del parte* y lo proceso automáticamente\n"
            "/manual — Introducir parte paso a paso\n"
            "/mispartes — Ver tus últimos partes\n"
        )
    await update.message.reply_text(txt, parse_mode=ParseMode.MARKDOWN)


# ═══════════════════════════════════════════════════════════════════════════
#  ERP QUERY FUNCTIONS (used by GPT-4 function calling and direct commands)
#
#  Each function calls the relevant init_*() to ensure tables exist,
#  and wraps queries in try/except for robustness.
# ═══════════════════════════════════════════════════════════════════════════

def _safe_query(conn, sql, params=()):
    """Execute a query, returning [] if the table doesn't exist."""
    try:
        return conn.execute(sql, params).fetchall()
    except Exception as e:
        if "no such table" in str(e) or "no such column" in str(e):
            logger.warning("Query skipped (missing table/column): %s", e)
            return []
        raise


def _safe_scalar(conn, sql, params=(), default=0):
    """Execute a scalar query, returning default if table missing."""
    try:
        r = conn.execute(sql, params).fetchone()
        return r[0] if r else default
    except Exception as e:
        if "no such table" in str(e) or "no such column" in str(e):
            logger.warning("Scalar skipped: %s", e)
            return default
        raise


def _init_all():
    """Ensure all ERP tables exist (idempotent, fast after first call)."""
    from core.proyectos_db import init_proyectos_db
    init_proyectos_db()
    try:
        from core.facturas_cliente_db import init_facturas_cliente_db
        init_facturas_cliente_db()
    except Exception:
        pass
    try:
        from core.facturas_db import init_facturas_db
        init_facturas_db()
    except Exception:
        pass
    try:
        from core.maquinaria_db import init_maquinaria_db
        init_maquinaria_db()
    except Exception:
        pass
    try:
        from core.empleados_db import init_empleados_db
        init_empleados_db()
    except Exception:
        pass
    try:
        from core.terceros_db import init_terceros_db
        init_terceros_db()
    except Exception:
        pass
    try:
        from core.impuestos_db import init_impuestos_db
        init_impuestos_db()
    except Exception:
        pass


def consultar_proyectos(proyecto_nombre: str | None = None, solo_activos: bool = True) -> str:
    _init_all()
    conn = get_conn()
    try:
        where = "WHERE 1=1"
        params: list = []
        if solo_activos:
            where += " AND p.estado IN ('vivo','en_curso','cotizado','pendiente')"
        if proyecto_nombre:
            where += " AND p.nombre LIKE ?"
            params.append(f"%{proyecto_nombre}%")

        # terceros may not exist — use LEFT JOIN + safe fallback
        has_terceros = bool(conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='terceros'"
        ).fetchone())

        if has_terceros:
            sql = f"""
                SELECT p.id, p.nombre, p.codigo, p.estado,
                       COALESCE(t.nombre_canonico, '') as cliente,
                       p.hincas_estimadas, p.ubicacion_texto as ubicacion, p.provincia,
                       COALESCE(SUM(pp.hincas_realizadas), 0) as hincas_acum,
                       COUNT(pp.id) as dias_trabajo
                FROM proyectos p
                LEFT JOIN terceros t ON p.cliente_tercero_id = t.id
                LEFT JOIN proyecto_partes pp ON pp.proyecto_id = p.id
                {where} GROUP BY p.id ORDER BY p.nombre
            """
        else:
            sql = f"""
                SELECT p.id, p.nombre, p.codigo, p.estado,
                       '' as cliente,
                       p.hincas_estimadas, p.ubicacion_texto as ubicacion, p.provincia,
                       COALESCE(SUM(pp.hincas_realizadas), 0) as hincas_acum,
                       COUNT(pp.id) as dias_trabajo
                FROM proyectos p
                LEFT JOIN proyecto_partes pp ON pp.proyecto_id = p.id
                {where} GROUP BY p.id ORDER BY p.nombre
            """

        rows = conn.execute(sql, params).fetchall()
        if not rows:
            return "No se encontraron proyectos."

        lines = []
        for r in rows:
            est = r["hincas_estimadas"] or 0
            pct = round(r["hincas_acum"] / est * 100) if est > 0 else 0
            bar = "🟩" * (pct // 10) + "⬜" * (10 - pct // 10)
            cliente = r["cliente"] or "?"
            lines.append(
                f"🏗 *{r['nombre']}* ({r['estado']})\n"
                f"   📍 {r['ubicacion'] or '?'} · Cliente: {cliente}\n"
                f"   🔨 {r['hincas_acum']:,}/{est:,} hincas ({pct}%) {bar}\n"
                f"   📅 {r['dias_trabajo']} días de trabajo"
            )
        return "\n\n".join(lines)
    finally:
        conn.close()


def consultar_partes(proyecto_nombre: str | None = None, fecha: str | None = None, dias: int = 7) -> str:
    _init_all()
    conn = get_conn()
    try:
        where = "WHERE 1=1"
        params: list = []
        if proyecto_nombre:
            where += " AND p.nombre LIKE ?"
            params.append(f"%{proyecto_nombre}%")
        if fecha:
            where += " AND pp.fecha = ?"
            params.append(fecha)
        else:
            desde = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")
            where += " AND pp.fecha >= ?"
            params.append(desde)

        rows = _safe_query(conn, f"""
            SELECT pp.fecha, p.nombre as proyecto, pp.hincas_realizadas,
                   pp.horas_maquina, pp.num_operadores, pp.incidencias,
                   COALESCE(pp.estado_firma, 'borrador') as estado_firma
            FROM proyecto_partes pp
            JOIN proyectos p ON p.id = pp.proyecto_id
            {where}
            ORDER BY pp.fecha DESC LIMIT 30
        """, params)

        if not rows:
            return "No hay partes en el periodo consultado."

        lines = []
        for r in rows:
            firma = {"borrador": "📝", "firmado": "✅", "firmado_con_cambios": "⚠️"}.get(r["estado_firma"], "📝")
            lines.append(
                f"{firma} *{r['fecha']}* — {r['proyecto']}\n"
                f"   🔨 {r['hincas_realizadas']} hincas · ⏱ {r['horas_maquina'] or 0}h · 👷 {r['num_operadores']} ops"
                + (f"\n   📝 {r['incidencias']}" if r["incidencias"] else "")
            )
        return "\n".join(lines)
    finally:
        conn.close()


def consultar_finanzas(tipo: str = "resumen") -> str:
    _init_all()
    from routes.helpers import _parse_importe_es, calcular_pendiente_cobro_neto
    conn = get_conn()
    try:
        hoy = datetime.now()
        mes_prefix = hoy.strftime("%Y-%m")
        anio_prefix = hoy.strftime("%Y")

        # Facturado mes/año — parse with _parse_importe_es
        rows_mes = conn.execute(
            "SELECT total_a_pagar FROM facturas_cliente WHERE fecha_factura LIKE ?",
            (mes_prefix + "%",),
        ).fetchall()
        fact_mes = sum(_parse_importe_es(r["total_a_pagar"]) for r in rows_mes)

        rows_anio = conn.execute(
            "SELECT total_a_pagar FROM facturas_cliente WHERE fecha_factura LIKE ?",
            (anio_prefix + "%",),
        ).fetchall()
        fact_anio = sum(_parse_importe_es(r["total_a_pagar"]) for r in rows_anio)

        # Pendiente cobro — net of partial collections (shared function)
        pte = calcular_pendiente_cobro_neto(conn)
        pte_cobro = pte["total"]
        pte_cobro_n = pte["num"]
        pte_cobro_txt = pte["texto"]

        # Pendiente pago — parse with _parse_importe_es
        rows_pago = conn.execute(
            "SELECT total, total_a_pagar FROM facturas_proveedor"
            " WHERE LOWER(TRIM(COALESCE(estado_pago,''))) IN ('pendiente','',  'parcial')"
        ).fetchall() if _table_exists(conn, "facturas_proveedor") else []
        pte_pago = sum(_parse_importe_es(r["total_a_pagar"] or r["total"]) for r in rows_pago)
        pte_pago_n = len(rows_pago)

        def fmt(v):
            return f"{v:,.0f} €".replace(",", ".")

        return (
            f"💰 *Finanzas*\n\n"
            f"📊 Facturado mes: *{fmt(fact_mes)}*\n"
            f"📊 Facturado año: *{fmt(fact_anio)}*\n"
            f"🟢 Pendiente cobro: *{fmt(pte_cobro)}* ({pte_cobro_txt})\n"
            f"🔴 Pendiente pago: *{fmt(pte_pago)}* ({pte_pago_n} facturas)"
        )
    finally:
        conn.close()


def _table_exists(conn, name: str) -> bool:
    return bool(conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone())


def consultar_maquinaria(maquina_nombre: str | None = None) -> str:
    _init_all()
    conn = get_conn()
    try:
        if not _table_exists(conn, "maquinas"):
            return "📭 No hay datos de maquinaria cargados."

        if maquina_nombre:
            rows = conn.execute(
                "SELECT m.nombre, m.estado, p.nombre as proyecto_nombre"
                " FROM maquinas m LEFT JOIN proyectos p ON m.proyecto_id = p.id"
                " WHERE m.nombre LIKE ? AND m.activa = 1",
                (f"%{maquina_nombre}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT m.nombre, m.estado, p.nombre as proyecto_nombre"
                " FROM maquinas m LEFT JOIN proyectos p ON m.proyecto_id = p.id"
                " WHERE m.activa = 1 ORDER BY m.estado, m.nombre"
            ).fetchall()

        if not rows:
            return "No se encontraron máquinas."

        estado_emoji = {"disponible": "🟢", "en_proyecto": "🔵", "en_taller": "🟠", "baja": "🔴"}
        lines = []
        for r in rows:
            e = estado_emoji.get(r["estado"], "⚪")
            proy = f" → {r['proyecto_nombre']}" if r["proyecto_nombre"] else ""
            lines.append(f"{e} *{r['nombre']}* ({r['estado']}{proy})")
        return "🚜 *Maquinaria:*\n" + "\n".join(lines)
    finally:
        conn.close()


def consultar_alertas() -> str:
    _init_all()
    conn = get_conn()
    try:
        hoy = datetime.now().strftime("%Y-%m-%d")
        alertas = []

        # Facturas vencidas (clientes)
        if _table_exists(conn, "facturas_cliente"):
            rows = _safe_query(conn,
                "SELECT cliente, fecha_factura, numero_factura FROM facturas_cliente"
                " WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) IN ('pendiente','','parcial')"
                " AND fecha_factura < ? ORDER BY fecha_factura LIMIT 10",
                (hoy,))
            for r in rows:
                alertas.append(f"🔴 Factura {r['numero_factura'] or '?'} de {r['cliente'] or '?'} vencida ({r['fecha_factura']})")

        # Obligaciones fiscales pendientes
        if _table_exists(conn, "obligaciones_fiscales"):
            rows = _safe_query(conn,
                "SELECT modelo, descripcion, fecha_limite FROM obligaciones_fiscales"
                " WHERE estado = 'pendiente' AND fecha_limite <= ? ORDER BY fecha_limite LIMIT 5",
                (hoy,))
            for r in rows:
                desc = r["descripcion"] or r["modelo"] or "?"
                alertas.append(f"🟠 Obligación fiscal: {desc} (vence {r['fecha_limite']})")

        # Proyectos sin partes recientes
        rows = _safe_query(conn, """
            SELECT p.nombre, MAX(pp.fecha) as ultimo
            FROM proyectos p LEFT JOIN proyecto_partes pp ON pp.proyecto_id = p.id
            WHERE p.estado IN ('vivo', 'en_curso')
            GROUP BY p.id HAVING ultimo IS NULL OR ultimo < date('now', '-3 days')
        """)
        for r in rows:
            alertas.append(f"⚠️ {r['nombre']}: sin partes desde {r['ultimo'] or 'nunca'}")

        # Seguros: pólizas vencidas o próximas
        try:
            from core.seguros_db import alertas_seguros
            for sa in alertas_seguros():
                emoji = "🔴" if sa["severidad"] == "alta" else "🟠" if sa["severidad"] == "media" else "🟡"
                alertas.append(f"{emoji} {sa['mensaje']}")
        except Exception:
            pass

        if not alertas:
            return "✅ No hay alertas pendientes."
        return "🚨 *Alertas:*\n\n" + "\n".join(alertas)
    finally:
        conn.close()


def consultar_equipo(empleado_nombre: str | None = None) -> str:
    _init_all()
    conn = get_conn()
    try:
        if not _table_exists(conn, "empleados"):
            return "📭 No hay datos de empleados cargados."

        if empleado_nombre:
            rows = conn.execute(
                "SELECT nombre, COALESCE(apellidos,'') as apellidos, puesto"
                " FROM empleados WHERE (nombre || ' ' || COALESCE(apellidos,'')) LIKE ? AND estado = 'activo'",
                (f"%{empleado_nombre}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT nombre, COALESCE(apellidos,'') as apellidos, puesto"
                " FROM empleados WHERE estado = 'activo' ORDER BY nombre"
            ).fetchall()

        if not rows:
            return "No se encontraron empleados."

        lines = []
        for r in rows:
            nombre = f"{r['nombre']} {r['apellidos']}".strip()
            lines.append(f"👷 *{nombre}* — {r['puesto'] or '?'}")
        return "👥 *Equipo:*\n" + "\n".join(lines)
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
#  SEGUROS — consultas desde Telegram
# ═══════════════════════════════════════════════════════════════════════════

def consultar_seguros(tipo=None, recurso_nombre=None, incluir_documentos=False):
    """Consulta pólizas de seguros del ERP."""
    from core.seguros_db import init_seguros_db
    init_seguros_db()
    conn = get_conn()
    try:
        query = "SELECT * FROM polizas WHERE 1=1"
        params = []
        if tipo:
            query += " AND tipo = ?"
            params.append(tipo)
        if recurso_nombre:
            query += " AND recurso_nombre LIKE ?"
            params.append(f"%{recurso_nombre}%")
        polizas = conn.execute(query + " ORDER BY fecha_vencimiento", params).fetchall()
        if not polizas:
            return "No se encontraron pólizas con esos criterios."
        iconos = {"maquinaria": "🏗️", "vehiculo": "🚗", "responsabilidad_civil": "🏢", "accidentes_convenio": "👷", "dyo": "👔", "otro": "📋"}
        resultado = []
        for row in polizas:
            p = dict(row)
            linea = iconos.get(p.get("tipo", ""), "📋") + " "
            linea += p.get("descripcion") or p.get("tipo", "")
            if p.get("recurso_nombre"):
                linea += f" — {p['recurso_nombre']}"
            linea += f"\n  Aseguradora: {p.get('aseguradora', '—')}"
            linea += f"\n  Nº póliza: {p.get('numero_poliza') or '—'}"
            prima = float(p.get("prima_anual") or 0)
            linea += f"\n  Prima anual: {prima:,.2f} €"
            linea += f"\n  Vencimiento: {p.get('fecha_vencimiento', '—')}"
            linea += f"\n  Estado: {p.get('estado', '—')} | Pago: {p.get('estado_pago') or 'pendiente'}"
            if incluir_documentos:
                docs = conn.execute(
                    "SELECT id, nombre_archivo, tipo, ruta_archivo FROM seguros_documentos WHERE poliza_id = ?",
                    [p["id"]],
                ).fetchall()
                if docs:
                    linea += f"\n  📎 Documentos: {len(docs)}"
                    for d in docs:
                        linea += f"\n    - [{d['id']}] {d['nombre_archivo']} ({d['tipo']})"
                else:
                    linea += "\n  📎 Sin documentos adjuntos"
            siniestros = conn.execute(
                "SELECT COUNT(*) as n FROM siniestros WHERE poliza_id = ? AND estado IN ('abierto','en_tramite')",
                [p["id"]],
            ).fetchone()
            if siniestros and siniestros["n"] > 0:
                linea += f"\n  ⚠️ {siniestros['n']} siniestro(s) abierto(s)"
            resultado.append(linea)
        return "\n\n".join(resultado)
    finally:
        conn.close()


# Pending documents to send via Telegram (filled by enviar_documento_seguro, consumed by handler)
_pending_docs: list[dict] = []


def enviar_documento_seguro(poliza_id, tipo_documento=None):
    """Prepara documentos de una póliza para envío por Telegram."""
    from core.seguros_db import init_seguros_db
    init_seguros_db()
    conn = get_conn()
    try:
        query = "SELECT id, nombre_archivo, tipo, ruta_archivo FROM seguros_documentos WHERE poliza_id = ?"
        params = [int(poliza_id)]
        if tipo_documento:
            query += " AND tipo = ?"
            params.append(tipo_documento)
        docs = conn.execute(query, params).fetchall()
        if not docs:
            return "No hay documentos adjuntos a esta póliza."
        enviados = []
        for d in docs:
            ruta = d["ruta_archivo"]
            if ruta:
                ruta_completa = str(DATOS_DIR / ruta)
                if os.path.exists(ruta_completa):
                    _pending_docs.append({
                        "ruta": ruta_completa,
                        "nombre": d["nombre_archivo"],
                        "tipo": d["tipo"],
                    })
                    enviados.append(d["nombre_archivo"])
                else:
                    enviados.append(f"⚠️ No encontrado: {d['nombre_archivo']}")
            else:
                enviados.append(f"⚠️ Sin ruta: {d['nombre_archivo']}")
        if any(doc for doc in _pending_docs):
            return f"Enviando {len([e for e in enviados if not e.startswith('⚠️')])} documento(s) al usuario por Telegram: " + ", ".join(enviados)
        return "No se pudieron localizar los archivos."
    finally:
        conn.close()


# ── Mejora 2: Facturas pendientes ──────────────────────────────────────────

def consultar_facturas_pendientes(tipo="cobro", importe_minimo=None, proveedor_o_cliente=None):
    _init_all()
    conn = get_conn()
    try:
        if tipo == "cobro":
            q = ("SELECT fc.numero_factura, COALESCE(t.nombre_canonico, fc.cliente) as nombre, "
                 "fc.fecha_factura, fc.total_a_pagar as total FROM facturas_cliente fc "
                 "LEFT JOIN terceros t ON fc.tercero_id = t.id "
                 "WHERE fc.estado_cobro IN ('pendiente','parcial')")
        else:
            q = ("SELECT fp.numero_factura, COALESCE(t.nombre_canonico, fp.proveedor) as nombre, "
                 "fp.fecha_factura, fp.resumen_concepto as concepto, "
                 "CAST(COALESCE(fp.total, fp.total_a_pagar, 0) AS REAL) as total "
                 "FROM facturas_proveedor fp "
                 "LEFT JOIN terceros t ON fp.tercero_id = t.id "
                 "WHERE fp.estado_pago IN ('pendiente','parcial')")
        params = []
        if importe_minimo:
            q += " AND total >= ?"; params.append(importe_minimo)
        if proveedor_o_cliente:
            q += " AND nombre LIKE ?"; params.append(f"%{proveedor_o_cliente}%")
        q += " ORDER BY total DESC LIMIT 20"
        rows = _safe_query(conn, q, tuple(params))
        if not rows:
            return f"No hay facturas pendientes de {'cobro' if tipo == 'cobro' else 'pago'}."
        def _to_float(v):
            if not v: return 0.0
            try: return float(v)
            except (ValueError, TypeError): return float(str(v).replace(".", "").replace(",", "."))
        total_sum = sum(_to_float(r["total"]) for r in rows)
        lines = [f"📄 *Facturas pendientes de {'cobro' if tipo == 'cobro' else 'pago'}* ({len(rows)}):\n"]
        for r in rows:
            lines.append(f"• {r['numero_factura'] or '?'} — {r['nombre'] or '?'}: {_to_float(r['total']):,.2f}€ ({r['fecha_factura'] or '?'})")
        lines.append(f"\n💰 *Total pendiente: {total_sum:,.2f}€*")
        return "\n".join(lines)
    finally:
        conn.close()


# ── Mejora 3: Facturas histórico ─────────────────────────────���────────────

def consultar_facturas_historico(tipo="proveedor", nombre=None, fecha_desde=None, fecha_hasta=None, concepto=None):
    _init_all()
    conn = get_conn()
    try:
        if tipo == "cliente":
            q = ("SELECT fc.numero_factura, COALESCE(t.nombre_canonico, fc.cliente) as nombre, "
                 "fc.fecha_factura, fc.total_a_pagar as total, fc.estado_cobro as estado "
                 "FROM facturas_cliente fc LEFT JOIN terceros t ON fc.tercero_id = t.id WHERE 1=1")
        else:
            q = ("SELECT fp.numero_factura, COALESCE(t.nombre_canonico, fp.proveedor) as nombre, "
                 "fp.fecha_factura, fp.resumen_concepto, "
                 "CAST(COALESCE(fp.total, fp.total_a_pagar, 0) AS REAL) as total, fp.estado_pago as estado "
                 "FROM facturas_proveedor fp LEFT JOIN terceros t ON fp.tercero_id = t.id WHERE 1=1")
        params = []
        if nombre:
            q += " AND nombre LIKE ?"; params.append(f"%{nombre}%")
        if fecha_desde:
            q += " AND fecha_factura >= ?"; params.append(fecha_desde)
        if fecha_hasta:
            q += " AND fecha_factura <= ?"; params.append(fecha_hasta)
        if concepto:
            if tipo == "proveedor":
                q += " AND resumen_concepto LIKE ?"; params.append(f"%{concepto}%")
        q += " ORDER BY fecha_factura DESC LIMIT 20"
        rows = _safe_query(conn, q, tuple(params))
        if not rows:
            return "No se encontraron facturas con esos criterios."
        def _to_float(v):
            if not v: return 0.0
            try: return float(v)
            except (ValueError, TypeError): return float(str(v).replace(".", "").replace(",", "."))
        total_sum = sum(_to_float(r["total"]) for r in rows)
        label = "emitidas" if tipo == "cliente" else "recibidas"
        lines = [f"📄 *Facturas {label}* ({len(rows)}):\n"]
        for r in rows:
            lines.append(f"• {r['numero_factura'] or '?'} — {r['nombre'] or '?'}: {_to_float(r['total']):,.2f}€ ({r['fecha_factura'] or '?'}) [{r.get('estado') or '?'}]")
        lines.append(f"\n💰 *Total: {total_sum:,.2f}€*")
        return "\n".join(lines)
    finally:
        conn.close()


# ── Mejora 4: Enviar PDF factura ───────────────────────────��──────────────

_pending_factura_docs = []  # Shared state for sending docs after GPT response

def enviar_pdf_factura(tipo="proveedor", numero_factura=None, proveedor_o_cliente=None):
    _init_all()
    conn = get_conn()
    try:
        if tipo == "cliente":
            q = ("SELECT fc.numero_factura, fc.ruta_archivo as pdf_path, "
                 "COALESCE(t.nombre_canonico, fc.cliente) as nombre "
                 "FROM facturas_cliente fc LEFT JOIN terceros t ON fc.tercero_id = t.id WHERE 1=1")
        else:
            q = ("SELECT fp.numero_factura, COALESCE(fp.ruta_destino, fp.ruta_archivo) as pdf_path, "
                 "COALESCE(t.nombre_canonico, fp.proveedor) as nombre "
                 "FROM facturas_proveedor fp LEFT JOIN terceros t ON fp.tercero_id = t.id WHERE 1=1")
        params = []
        if numero_factura:
            q += " AND numero_factura LIKE ?"; params.append(f"%{numero_factura}%")
        if proveedor_o_cliente:
            q += " AND nombre_canonico LIKE ?"; params.append(f"%{proveedor_o_cliente}%")
        q += " LIMIT 5"
        rows = _safe_query(conn, q, tuple(params))
        if not rows:
            return "No se encontró la factura."
        found = []
        for r in rows:
            pdf = r.get("pdf_path") or ""
            if pdf:
                full = DATOS_DIR / pdf if not os.path.isabs(pdf) else Path(pdf)
                if full.exists():
                    _pending_factura_docs.append(str(full))
                    found.append(f"📄 {r['numero_factura']} ({r['nombre'] or '?'}) — enviando PDF...")
                else:
                    found.append(f"📄 {r['numero_factura']} ({r['nombre'] or '?'}) — PDF no encontrado en disco")
            else:
                found.append(f"📄 {r['numero_factura']} ({r['nombre'] or '?'}) — sin PDF asociado")
        return "\n".join(found)
    finally:
        conn.close()


# ── Mejora 5: Consultar/Modificar empleados ───────────────────────────────

def consultar_empleados(nombre=None, info="general"):
    _init_all()
    conn = get_conn()
    try:
        if nombre:
            emps = _safe_query(conn, "SELECT * FROM empleados WHERE (nombre || ' ' || COALESCE(apellidos,'')) LIKE ? ORDER BY apellidos", (f"%{nombre}%",))
        else:
            emps = _safe_query(conn, "SELECT * FROM empleados WHERE estado='activo' ORDER BY apellidos LIMIT 20")
        if not emps:
            return "No se encontraron empleados."
        emps = [dict(e) for e in emps]
        lines = []
        for e in emps:
            nm = f"{e['nombre']} {e.get('apellidos', '') or ''}".strip()
            if info == "general" or info == "todos":
                lines.append(f"👤 *{nm}*: {e.get('puesto') or '?'} | Tel: {e.get('telefono') or '?'} | Estado: {e.get('estado')} | Neto: {e.get('neto_pactado') or 0}€")
            if info in ("nominas", "todos"):
                noms = _safe_query(conn, "SELECT periodo, liquido, coste_empresa FROM nominas WHERE empleado_id=? AND tipo='NOMINA' ORDER BY periodo DESC LIMIT 3", (e["id"],))
                if noms:
                    lines.append("  📋 Últimas nóminas: " + ", ".join(f"{n['periodo']}: {n['liquido'] or 0:.0f}€ líq / {n['coste_empresa'] or 0:.0f}€ coste" for n in noms))
            if info in ("adelantos", "todos"):
                from datetime import date
                anio = date.today().year
                adel = _safe_scalar(conn, "SELECT COUNT(*) FROM vacaciones_dias WHERE empleado_id=? AND fecha LIKE ?", (e["id"], f"{anio}%"), 0)
                # Adelantos from movimientos
                try:
                    from config import MOVIMIENTOS_DB
                    import sqlite3
                    bconn = sqlite3.connect(str(MOVIMIENTOS_DB))
                    bconn.row_factory = sqlite3.Row
                    a = bconn.execute("SELECT COUNT(*) as c, COALESCE(SUM(ABS(importe)),0) as t FROM movimientos WHERE rrhh_empleado_id=? AND rrhh_tipo='adelanto' AND SUBSTR(fecha_operacion,1,4)=?", (e["id"], str(anio))).fetchone()
                    bconn.close()
                    if a and a["c"] > 0:
                        lines.append(f"  💸 Adelantos {anio}: {a['c']} por {a['t']:.2f}€")
                except Exception:
                    pass
            if info in ("vacaciones", "todos"):
                from datetime import date
                anio = date.today().year
                vac_count = _safe_scalar(conn, "SELECT COUNT(*) FROM vacaciones_dias WHERE empleado_id=? AND fecha LIKE ?", (e["id"], f"{anio}%"), 0)
                dias_anuales = e.get("dias_vacaciones_anuales") or 22
                lines.append(f"  🏖 Vacaciones {anio}: {vac_count} disfrutadas de {dias_anuales} anuales ({dias_anuales - vac_count} pendientes)")
        return "\n".join(lines) if lines else "Sin datos."
    finally:
        conn.close()


def modificar_empleado(nombre, campo, valor):
    """Solo superadmin. Caller must check role."""
    _init_all()
    campos_ok = {"telefono", "email", "direccion", "notas", "neto_pactado"}
    if campo not in campos_ok:
        return f"❌ Campo '{campo}' no modificable. Permitidos: {', '.join(campos_ok)}"
    conn = get_conn()
    try:
        emp = conn.execute("SELECT id, nombre, apellidos FROM empleados WHERE (nombre || ' ' || COALESCE(apellidos,'')) LIKE ?", (f"%{nombre}%",)).fetchone()
        if not emp:
            return f"No se encontró empleado '{nombre}'."
        if campo == "neto_pactado":
            valor = float(valor)
        conn.execute(f"UPDATE empleados SET {campo} = ?, updated_at = ? WHERE id = ?", (valor, datetime.now().isoformat(), emp["id"]))
        conn.commit()
        nm = f"{emp['nombre']} {emp['apellidos'] or ''}".strip()
        return f"✅ {nm}: {campo} actualizado a '{valor}'."
    finally:
        conn.close()


# ── Mejora 6: Consultar operaciones ───────────────────────────────────────

def consultar_operaciones(consulta_tipo, proyecto_nombre=None, empleado_nombre=None, fecha=None):
    _init_all()
    conn = get_conn()
    try:
        from datetime import date
        fecha = fecha or date.today().isoformat()
        if consulta_tipo == "asignaciones_hoy":
            rows = _safe_query(conn, """
                SELECT pa.recurso_nombre, pa.recurso_tipo, p.nombre as proyecto,
                       COALESCE(pa.funcion_dia, e.puesto) as funcion
                FROM proyecto_asignaciones pa
                JOIN proyectos p ON pa.proyecto_id = p.id
                LEFT JOIN empleados e ON pa.recurso_id = e.id AND pa.recurso_tipo = 'empleado'
                WHERE pa.fecha = ? ORDER BY p.nombre, pa.recurso_tipo
            """, (fecha,))
            if not rows:
                return f"No hay asignaciones para {fecha}."
            by_proy = {}
            for r in rows:
                rd = dict(r)
                pn = rd.get("proyecto") or "?"
                if pn not in by_proy: by_proy[pn] = []
                fn = f" ({rd['funcion']})" if rd.get("funcion") else ""
                by_proy[pn].append(f"{'👷' if rd['recurso_tipo']=='empleado' else '🏗'} {rd['recurso_nombre']}{fn}")
            lines = [f"📋 *Asignaciones {fecha}:*\n"]
            for pn, recursos in by_proy.items():
                lines.append(f"🏗 *{pn}* ({len(recursos)}):")
                for rec in recursos:
                    lines.append(f"  {rec}")
            return "\n".join(lines)

        elif consulta_tipo == "asignaciones_proyecto":
            if not proyecto_nombre:
                return "Indica el nombre del proyecto."
            rows = _safe_query(conn, """
                SELECT pa.recurso_nombre, pa.recurso_tipo, COALESCE(pa.funcion_dia, e.puesto) as funcion
                FROM proyecto_asignaciones pa
                JOIN proyectos p ON pa.proyecto_id = p.id
                LEFT JOIN empleados e ON pa.recurso_id = e.id AND pa.recurso_tipo = 'empleado'
                WHERE pa.fecha = ? AND p.nombre LIKE ?
                ORDER BY pa.recurso_tipo
            """, (fecha, f"%{proyecto_nombre}%"))
            if not rows:
                return f"No hay recursos asignados a '{proyecto_nombre}' el {fecha}."
            lines = [f"🏗 *{proyecto_nombre}* ({fecha}):\n"]
            for r in rows:
                rd = dict(r)
                fn = f" ({rd['funcion']})" if rd.get("funcion") else ""
                lines.append(f"  {'👷' if rd['recurso_tipo']=='empleado' else '🏗'} {rd['recurso_nombre']}{fn}")
            return "\n".join(lines)

        elif consulta_tipo == "disponibilidad":
            asignados = set()
            for r in _safe_query(conn, "SELECT DISTINCT recurso_id FROM proyecto_asignaciones WHERE recurso_tipo='empleado' AND fecha=?", (fecha,)):
                asignados.add(r["recurso_id"])
            libres = _safe_query(conn, "SELECT id, nombre, apellidos, puesto FROM empleados WHERE estado='activo' ORDER BY apellidos")
            libre_list = [dict(e) for e in libres if e["id"] not in asignados]
            if not libre_list:
                return f"Todos los empleados activos están asignados el {fecha}."
            lines = [f"✅ *Empleados disponibles el {fecha}* ({len(libre_list)}):\n"]
            for e in libre_list:
                lines.append(f"  👷 {e['nombre']} {e.get('apellidos') or ''} ({e.get('puesto') or '?'})")
            return "\n".join(lines)

        elif consulta_tipo == "historico_empleado":
            if not empleado_nombre:
                return "Indica el nombre del empleado."
            rows = _safe_query(conn, """
                SELECT pa.fecha, p.nombre as proyecto, pa.estado
                FROM proyecto_asignaciones pa
                JOIN proyectos p ON pa.proyecto_id = p.id
                WHERE pa.recurso_tipo='empleado'
                  AND pa.recurso_nombre LIKE ?
                  AND pa.fecha >= date(?, '-30 days')
                ORDER BY pa.fecha DESC LIMIT 30
            """, (f"%{empleado_nombre}%", fecha))
            if not rows:
                return f"No hay asignaciones recientes para '{empleado_nombre}'."
            lines = [f"📋 *Historial de {empleado_nombre}* (últimos 30 días):\n"]
            for r in rows:
                lines.append(f"  {r['fecha']}: {r['proyecto']}")
            return "\n".join(lines)

        return "Tipo de consulta no reconocido."
    finally:
        conn.close()


# ── Mejora 7: SQL genérica ────────────────────────────────────────────────

import re as _re

def ejecutar_sql_erp(sql, bd="gestion"):
    """Execute read-only SQL against the ERP database."""
    sql_clean = sql.strip().rstrip(";")
    sql_upper = sql_clean.upper()

    # Security: only SELECT
    if not sql_upper.startswith("SELECT"):
        return json.dumps({"error": "Solo se permiten consultas SELECT."})

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "REPLACE", "ATTACH"]
    for word in forbidden:
        if _re.search(r"\b" + word + r"\b", sql_upper):
            return json.dumps({"error": f"Operación '{word}' no permitida."})

    if ";" in sql_clean:
        return json.dumps({"error": "No se permiten múltiples statements."})

    import sqlite3
    if bd == "movimientos":
        from config import MOVIMIENTOS_DB
        db_path = str(MOVIMIENTOS_DB)
    else:
        from config import GESTION_DB
        db_path = str(GESTION_DB)

    try:
        conn = sqlite3.connect(db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(sql_clean)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchmany(50)
        result = {
            "columnas": columns,
            "filas": [dict(zip(columns, row)) for row in rows],
            "total_filas": len(rows),
            "truncado": len(rows) == 50,
        }
        conn.close()
        return json.dumps(result, ensure_ascii=False, default=str)
    except sqlite3.OperationalError as e:
        return json.dumps({"error": f"Error SQL: {e}"})
    except Exception as e:
        return json.dumps({"error": f"Error: {e}"})


# ═══════════════════════════════════════════════════════════════════════════
#  GPT-4 FUNCTION CALLING (superadmin natural language)
# ═══════════════════════════════════════════════════════════���═══════════════

_GPT_SYSTEM = (
    "Eres el asistente del ERP de Hincado Directo, empresa española de hincado "
    "de pilotes para parques solares fotovoltaicos. Responde siempre en español, "
    "de forma concisa y con datos concretos. Usa emojis para hacer las respuestas "
    "más legibles. Cuando des cifras monetarias, usa formato español (punto para "
    "miles, coma para decimales). Si no tienes datos suficientes para responder, "
    "dilo claramente.\n\n"
    "Tienes acceso a una herramienta de SQL genérica (ejecutar_sql_erp) que te permite "
    "consultar cualquier dato del ERP. Úsala cuando las tools específicas no cubran la "
    "pregunta o cuando necesites hacer consultas complejas con JOINs, agregaciones, o "
    "filtros que las tools específicas no soportan. Siempre que devuelvas datos numéricos "
    "de importes, formatea con 2 decimales y símbolo €. Si el resultado tiene muchas filas, "
    "haz un resumen en vez de listar todas."
)

_GPT_FUNCTIONS = [
    {
        "name": "consultar_proyectos",
        "description": "Consulta proyectos del ERP con hincas acumuladas y progreso.",
        "parameters": {
            "type": "object",
            "properties": {
                "proyecto_nombre": {"type": "string", "description": "Filtro por nombre de proyecto (parcial)"},
                "solo_activos": {"type": "boolean", "description": "Solo proyectos activos", "default": True},
            },
        },
    },
    {
        "name": "consultar_partes",
        "description": "Consulta partes de trabajo (hincas diarias, horas, operadores).",
        "parameters": {
            "type": "object",
            "properties": {
                "proyecto_nombre": {"type": "string", "description": "Filtro por nombre de proyecto"},
                "fecha": {"type": "string", "description": "Fecha exacta YYYY-MM-DD"},
                "dias": {"type": "integer", "description": "Últimos N días (default 7)", "default": 7},
            },
        },
    },
    {
        "name": "consultar_finanzas",
        "description": "Datos financieros: facturación, pendiente cobro/pago.",
        "parameters": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": ["resumen", "pendiente_cobro", "pendiente_pago", "facturado_mes", "facturado_año"]},
            },
        },
    },
    {
        "name": "consultar_maquinaria",
        "description": "Estado y ubicación de máquinas hincadoras.",
        "parameters": {
            "type": "object",
            "properties": {
                "maquina_nombre": {"type": "string", "description": "Filtro por nombre de máquina"},
            },
        },
    },
    {
        "name": "consultar_alertas",
        "description": "Alertas urgentes: facturas vencidas, impuestos, proyectos sin actividad.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "consultar_equipo",
        "description": "Información de empleados y equipo.",
        "parameters": {
            "type": "object",
            "properties": {
                "empleado_nombre": {"type": "string", "description": "Filtro por nombre de empleado"},
            },
        },
    },
    {
        "name": "consultar_seguros",
        "description": "Obtiene información de pólizas de seguros: vigentes, vencimientos, primas, estado de pago, siniestros, documentos adjuntos. Puede buscar por tipo (maquinaria, vehiculo, responsabilidad_civil, accidentes_convenio, dyo), por recurso (nombre de máquina o vehículo), por aseguradora, o listar todas.",
        "parameters": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "description": "Tipo de seguro: maquinaria, vehiculo, responsabilidad_civil, accidentes_convenio, dyo, o vacío para todos"},
                "recurso_nombre": {"type": "string", "description": "Nombre del recurso asegurado (ej: Nicoletta, Carmela) — opcional"},
                "incluir_documentos": {"type": "boolean", "description": "Si true, incluir lista de documentos adjuntos", "default": False},
            },
        },
    },
    {
        "name": "enviar_documento_seguro",
        "description": "Envía un documento PDF de una póliza de seguros al usuario por Telegram. Usar cuando el usuario pida explícitamente que le manden/envíen un documento.",
        "parameters": {
            "type": "object",
            "properties": {
                "poliza_id": {"type": "integer", "description": "ID de la póliza"},
                "tipo_documento": {"type": "string", "description": "Tipo: poliza, recibo, certificado, siniestro, otro. Vacío para todos."},
            },
            "required": ["poliza_id"],
        },
    },
    {
        "name": "consultar_facturas_pendientes",
        "description": "Lista facturas pendientes de cobro o pago con detalle: cliente/proveedor, fecha, concepto, importe.",
        "parameters": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": ["cobro", "pago"], "description": "cobro = clientes pendientes de cobrar. pago = proveedores pendientes de pagar."},
                "importe_minimo": {"type": "number", "description": "Filtrar por importe mínimo (opcional)"},
                "proveedor_o_cliente": {"type": "string", "description": "Filtrar por nombre (búsqueda parcial, opcional)"},
            },
            "required": ["tipo"],
        },
    },
    {
        "name": "consultar_facturas_historico",
        "description": "Consulta histórica de facturas: cuántas, totales facturados, búsqueda por concepto, fechas.",
        "parameters": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": ["proveedor", "cliente"]},
                "nombre": {"type": "string", "description": "Nombre del proveedor o cliente (parcial)"},
                "fecha_desde": {"type": "string", "description": "Fecha inicio YYYY-MM-DD"},
                "fecha_hasta": {"type": "string", "description": "Fecha fin YYYY-MM-DD"},
                "concepto": {"type": "string", "description": "Buscar en concepto"},
            },
            "required": ["tipo"],
        },
    },
    {
        "name": "enviar_pdf_factura",
        "description": "Busca y envía por Telegram el PDF de una factura de cliente o proveedor.",
        "parameters": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": ["proveedor", "cliente"]},
                "numero_factura": {"type": "string", "description": "Número de factura (parcial OK)"},
                "proveedor_o_cliente": {"type": "string", "description": "Nombre del proveedor/cliente"},
            },
        },
    },
    {
        "name": "consultar_empleados",
        "description": "Consulta información de empleados: datos personales, nóminas, adelantos, vacaciones.",
        "parameters": {
            "type": "object",
            "properties": {
                "nombre": {"type": "string", "description": "Nombre del empleado (búsqueda parcial)"},
                "info": {"type": "string", "enum": ["general", "nominas", "adelantos", "vacaciones", "todos"], "description": "Qué información devolver"},
            },
        },
    },
    {
        "name": "modificar_empleado",
        "description": "Modifica información de un empleado: teléfono, email, notas. Solo superadmin.",
        "parameters": {
            "type": "object",
            "properties": {
                "nombre": {"type": "string", "description": "Nombre del empleado"},
                "campo": {"type": "string", "enum": ["telefono", "email", "direccion", "notas", "neto_pactado"]},
                "valor": {"type": "string", "description": "Nuevo valor"},
            },
            "required": ["nombre", "campo", "valor"],
        },
    },
    {
        "name": "consultar_operaciones",
        "description": "Consulta el planificador de operaciones: asignaciones a proyectos, disponibilidad de recursos.",
        "parameters": {
            "type": "object",
            "properties": {
                "consulta_tipo": {"type": "string", "enum": ["asignaciones_hoy", "asignaciones_proyecto", "disponibilidad", "historico_empleado"]},
                "proyecto_nombre": {"type": "string", "description": "Nombre del proyecto"},
                "empleado_nombre": {"type": "string", "description": "Nombre del empleado"},
                "fecha": {"type": "string", "description": "Fecha YYYY-MM-DD (default: hoy)"},
            },
            "required": ["consulta_tipo"],
        },
    },
    {
        "name": "ejecutar_sql_erp",
        "description": "Ejecuta una consulta SQL SELECT contra la BD del ERP. SOLO lectura.\n\nTABLAS en gestion.db: empleados (id,nombre,apellidos,dni,categoria,puesto,estado,telefono,email,neto_pactado,dias_vacaciones_anuales,fecha_alta), nominas (id,empleado_id,periodo,tipo,dias,salario_base,total_devengado,dietas,irpf_euros,liquido,coste_empresa,coste_dia,ss_empresa), proyectos (id,codigo,nombre,estado,provincia,tipo_actividad,hinca_cantidad,hincas_ejecutadas,cliente_tercero_id), proyecto_asignaciones (id,proyecto_id,recurso_tipo,recurso_id,recurso_nombre,fecha,estado,funcion_dia), proyecto_partes (id,proyecto_id,fecha,hincas_realizadas,horas_admin,num_operadores,incidencias,estado_firma), facturas_proveedor (id,numero_factura,proveedor_tercero_id,fecha_factura,concepto,base_imponible,iva,total,estado_cobro,pdf_path), facturas_cliente (id,numero_factura,cliente_tercero_id,fecha_factura,concepto,base_imponible,total,estado_cobro), terceros (id,nombre_canonico,nif,tipo), maquinas (id,nombre,codigo,modelo,activa), vacaciones_dias (id,empleado_id,fecha,estado,notas), dietas_diarias (id,empleado_id,fecha,tipo,funcion,importe), combustible_transacciones (id,fecha,vehiculo,litros,importe,matricula).\n\nTABLA en movimientos.db: movimientos (id,fecha_operacion,concepto,importe,banco,saldo,rrhh_tipo,rrhh_empleado_id).\n\nREGLAS: SOLO SELECT. Máximo 50 filas. Para movimientos.db usa bd='movimientos'.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "Query SQL SELECT a ejecutar"},
                "bd": {"type": "string", "enum": ["gestion", "movimientos"], "description": "Base de datos (default: gestion)"},
            },
            "required": ["sql"],
        },
    },
]

_FN_MAP = {
    "consultar_proyectos": consultar_proyectos,
    "consultar_partes": consultar_partes,
    "consultar_finanzas": consultar_finanzas,
    "consultar_maquinaria": consultar_maquinaria,
    "consultar_alertas": consultar_alertas,
    "consultar_equipo": consultar_equipo,
    "consultar_seguros": consultar_seguros,
    "enviar_documento_seguro": enviar_documento_seguro,
    "consultar_facturas_pendientes": consultar_facturas_pendientes,
    "consultar_facturas_historico": consultar_facturas_historico,
    "enviar_pdf_factura": enviar_pdf_factura,
    "consultar_empleados": consultar_empleados,
    "modificar_empleado": modificar_empleado,
    "consultar_operaciones": consultar_operaciones,
    "ejecutar_sql_erp": ejecutar_sql_erp,
}


def _gpt_query_sync(question: str) -> str:
    """Synchronous GPT-4 query — must be called via _run_sync."""
    if not openai_client:
        return "⚠️ OpenAI no configurado."
    try:
        logger.info("GPT query: %s", question[:80])
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _GPT_SYSTEM},
                {"role": "user", "content": question},
            ],
            functions=_GPT_FUNCTIONS,
            function_call="auto",
            temperature=0.3,
            max_tokens=1500,
        )
        msg = response.choices[0].message

        if msg.function_call:
            fn_name = msg.function_call.name
            fn_args = json.loads(msg.function_call.arguments)
            logger.info("GPT called function: %s(%s)", fn_name, fn_args)
            fn = _FN_MAP.get(fn_name)
            if not fn:
                return f"Función desconocida: {fn_name}"
            result = fn(**fn_args)

            response2 = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _GPT_SYSTEM},
                    {"role": "user", "content": question},
                    msg,
                    {"role": "function", "name": fn_name, "content": result},
                ],
                temperature=0.3,
                max_tokens=1500,
            )
            return response2.choices[0].message.content or result

        return msg.content or "No tengo respuesta."
    except Exception as e:
        logger.exception("Error GPT query")
        return f"❌ Error consultando: {e}"


# ═══════════════════════════════════════════════════════════════════════════
#  SUPERADMIN COMMANDS
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_resumen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    if _user_rol(uid) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    logger.info("/resumen iniciado por %s", uid)
    await update.message.reply_text("⏳ Generando resumen...")
    try:
        logger.info("/resumen — consultando proyectos...")
        proyectos = await _run_sync(consultar_proyectos)
        logger.info("/resumen — consultando finanzas...")
        finanzas = await _run_sync(consultar_finanzas)
        logger.info("/resumen — consultando alertas...")
        alertas = await _run_sync(consultar_alertas)
        texto = f"📊 *Resumen del día*\n\n{proyectos}\n\n{finanzas}\n\n{alertas}"
        logger.info("/resumen — enviando respuesta")
        for chunk in _split_msg(texto):
            await update.message.reply_text(chunk, parse_mode=ParseMode.MARKDOWN)
        logger.info("/resumen — completado")
    except Exception as e:
        logger.exception("/resumen — error")
        await update.message.reply_text(f"❌ Error generando resumen: {e}")


async def cmd_alertas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    result = await _run_sync(consultar_alertas)
    await update.message.reply_text(result, parse_mode=ParseMode.MARKDOWN)


async def cmd_proyectos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    result = await _run_sync(consultar_proyectos)
    for chunk in _split_msg(result):
        await update.message.reply_text(chunk, parse_mode=ParseMode.MARKDOWN)


async def cmd_finanzas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    result = await _run_sync(consultar_finanzas)
    await update.message.reply_text(result, parse_mode=ParseMode.MARKDOWN)


async def cmd_pendientes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT pp.fecha, p.nombre as proyecto, pp.hincas_realizadas, pp.notas
            FROM proyecto_partes pp JOIN proyectos p ON p.id = pp.proyecto_id
            WHERE COALESCE(pp.estado_firma, 'borrador') = 'borrador'
            ORDER BY pp.fecha DESC LIMIT 20
        """).fetchall()
    finally:
        conn.close()
    if not rows:
        return await update.message.reply_text("✅ No hay partes pendientes de firma.")
    lines = ["📝 *Partes sin firmar:*\n"]
    for r in rows:
        lines.append(f"📝 {r['fecha']} — {r['proyecto']} — {r['hincas_realizadas']} hincas")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


async def cmd_aprobar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    pendientes = listar_usuarios(rol="pendiente")
    if not pendientes:
        return await update.message.reply_text("✅ No hay solicitudes pendientes.")
    for u in pendientes:
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Operario", callback_data=f"aprobar_operario_{u['telegram_id']}"),
                InlineKeyboardButton("👑 Admin", callback_data=f"aprobar_superadmin_{u['telegram_id']}"),
                InlineKeyboardButton("🚫 Bloquear", callback_data=f"aprobar_bloqueado_{u['telegram_id']}"),
            ]
        ])
        await update.message.reply_text(
            f"👤 *{u['nombre']}*\nTelegram ID: `{u['telegram_id']}`\nRegistrado: {u['created_at'][:10]}",
            reply_markup=kb,
            parse_mode=ParseMode.MARKDOWN,
        )


async def callback_aprobar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data  # e.g. "aprobar_operario_12345"
    parts = data.split("_")
    if len(parts) < 3:
        return
    rol = parts[1]
    tid = int(parts[2])
    aprobar_usuario(tid, rol)
    await query.edit_message_text(f"✅ Usuario {tid} → *{rol}*", parse_mode=ParseMode.MARKDOWN)
    # Notify the user
    try:
        if rol in ("operario", "superadmin"):
            await context.bot.send_message(
                chat_id=tid,
                text=f"🎉 *¡Tu acceso ha sido aprobado!*\nRol: *{rol}*\nEscribe /help para ver los comandos.",
                parse_mode=ParseMode.MARKDOWN,
            )
    except Exception:
        pass


async def cmd_usuarios(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    users = listar_usuarios()
    if not users:
        return await update.message.reply_text("No hay usuarios registrados.")
    rol_emoji = {"superadmin": "👑", "operario": "👷", "pendiente": "⏳", "bloqueado": "🚫"}
    lines = ["👥 *Usuarios del bot:*\n"]
    for u in users:
        e = rol_emoji.get(u["rol"], "?")
        lines.append(f"{e} {u['nombre']} — {u['rol']} (`{u['telegram_id']}`)")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


# ═══════════════════════════════════════════════════════════════════════════
#  SUPERADMIN: natural language (fallback text handler)
# ═══════════════════════════════════════════════════════════════════════════

async def handle_text_superadmin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if rol != "superadmin":
        if not rol or rol in ("pendiente", "bloqueado"):
            return await update.message.reply_text(
                "👋 No tienes acceso. Usa /start para solicitar acceso."
            )
        return  # Operarios: text is handled by conversation or ignored
    await update.message.reply_text("⏳ Consultando...")
    # Clear pending docs before query
    _pending_docs.clear()
    _pending_factura_docs.clear()
    answer = await _run_sync(_gpt_query_sync, update.message.text)
    for chunk in _split_msg(answer):
        await update.message.reply_text(chunk, parse_mode=ParseMode.MARKDOWN)
    # Send any pending documents from enviar_documento_seguro
    if _pending_docs:
        for doc in _pending_docs:
            try:
                with open(doc["ruta"], "rb") as f:
                    await update.message.reply_document(
                        document=f,
                        filename=doc["nombre"],
                        caption=f"📄 {(doc.get('tipo') or 'documento').title()} — {doc['nombre']}",
                    )
            except Exception as exc:
                logger.warning("Error enviando documento %s: %s", doc["nombre"], exc)
                await update.message.reply_text(f"⚠️ No se pudo enviar: {doc['nombre']}")
        _pending_docs.clear()
    # Send any pending factura PDFs
    if _pending_factura_docs:
        for path in _pending_factura_docs:
            try:
                with open(path, "rb") as f:
                    await update.message.reply_document(document=f, filename=os.path.basename(path), caption=f"📄 {os.path.basename(path)}")
            except Exception as exc:
                logger.warning("Error enviando factura PDF %s: %s", path, exc)
        _pending_factura_docs.clear()


# ═══════════════════════════════════════════════════════════════════════════
#  OPERARIO: photo OCR
# ═══════════════════════════════════════════════════════════════════════════

_PROMPT_PARTE_OCR = """Eres un experto en leer partes de trabajo manuscritos de una empresa de hincado de pilotes para parques solares fotovoltaicos.

Extrae los siguientes campos del parte fotografiado. El documento es un formulario impreso de "Hincado Directo" rellenado a mano en español.

Devuelve SOLO un JSON valido sin markdown ni explicaciones, con esta estructura:
{
    "fecha": "YYYY-MM-DD",
    "obra": "nombre de la obra",
    "lineas": [
        {"operador": "nombre", "maquina": "nombre", "horas": 10, "rol": "operador"}
    ],
    "total_hincas": 309,
    "horas_admin": 0,
    "incidencias": "",
    "confianza": "alta|media|baja"
}

Notas:
- Máquinas son nombres femeninos italianos: Nicoletta, Antonella, Enmanuela, Lauretta, Marietta, Carmela, Nieves
- Operadores: Diego, Manuel, Ivan, Juanso
- "con" conecta operador con máquina: "Diego con Carmela"
- "de ayudante" indica rol de ayudante
- "día de administración" = horas admin
- "Total hincas" seguido de número = hincas del día
"""


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        return await update.message.reply_text("🚫 No tienes acceso.")

    if not openai_client:
        return await update.message.reply_text("⚠️ OpenAI no configurado.")

    # Store photo for later processing and ask what it is
    photo = update.message.photo[-1]
    file = await context.bot.get_file(photo.file_id)
    content = await file.download_as_bytearray()
    set_estado(update.effective_user.id, "foto_pendiente", {"photo_bytes_len": len(content)})
    context.user_data["_photo_bytes"] = bytes(content)

    rol = _user_rol(update.effective_user.id)
    if rol == "superadmin":
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("📋 Parte", callback_data="foto_tipo_parte"),
                InlineKeyboardButton("🧾 Albarán", callback_data="foto_tipo_albaran"),
            ],
            [
                InlineKeyboardButton("📄 Fact. proveedor", callback_data="foto_tipo_factura_prov"),
                InlineKeyboardButton("📄 Fact. cliente", callback_data="foto_tipo_factura_cli"),
            ],
        ])
    else:
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("📋 Parte", callback_data="foto_tipo_parte"),
                InlineKeyboardButton("🧾 Albarán", callback_data="foto_tipo_albaran"),
                InlineKeyboardButton("📄 Factura", callback_data="foto_tipo_factura_prov"),
            ],
        ])
    await update.message.reply_text("¿Qué tipo de documento es?", reply_markup=kb)


async def callback_foto_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    content = context.user_data.get("_photo_bytes")
    if not content:
        return await query.edit_message_text("⚠️ No se encontró la foto. Envíala de nuevo.")

    clear_estado(tid)

    if query.data == "foto_tipo_parte":
        await query.edit_message_text("⏳ Procesando parte...")
        await _procesar_foto_parte(query, context, content, tid)
    elif query.data == "foto_tipo_albaran":
        await query.edit_message_text("⏳ Procesando albarán...")
        await _procesar_foto_albaran(query, context, content, tid)
    elif query.data == "foto_tipo_factura_prov":
        await query.edit_message_text("⏳ Procesando factura de proveedor...")
        await _procesar_foto_factura_prov(query, context, content, tid)
    elif query.data == "foto_tipo_factura_cli":
        await query.edit_message_text("⏳ Procesando factura de cliente...")
        await _procesar_foto_factura_cli(query, context, content, tid)


def _resumen_parte_texto(datos):
    """Genera texto de resumen de un parte a partir de los datos OCR/corregidos."""
    lineas_txt = ""
    for l in datos.get("lineas", []):
        lineas_txt += f"👷 {l.get('operador', '?')} con {l.get('maquina', '?')}: {l.get('horas', '?')}h\n"
    conf_emoji = {"alta": "🟢", "media": "🟡", "baja": "🔴"}.get(datos.get("confianza", "?"), "⚪")
    return (
        f"📋 *Parte detectado:* {conf_emoji}\n"
        f"🗓 Fecha: {datos.get('fecha', '?')}\n"
        f"{lineas_txt}"
        f"🔨 Total hincas: {datos.get('total_hincas', 0)}\n"
        f"⏱ Horas admin: {datos.get('horas_admin', 0)}\n"
        f"📝 Incidencias: {datos.get('incidencias') or 'ninguna'}"
    )


async def _procesar_foto_parte(query, context, content, tid):
    """Process photo as parte de trabajo — OCR + ask to confirm/correct."""
    b64 = base64.b64encode(content).decode("utf-8")

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT_PARTE_OCR},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
                ],
            }],
            max_tokens=1000,
            temperature=0,
        )
        texto = response.choices[0].message.content.strip()
        from core.llm import limpiar_json_respuesta
        texto = limpiar_json_respuesta(texto)
        datos = json.loads(texto)
    except Exception as e:
        logger.exception("OCR parte error")
        return await context.bot.send_message(
            chat_id=tid,
            text="❌ No he podido leer el parte. ¿Puedes hacer otra foto con mejor luz?\nO usa /manual para introducir los datos a mano.",
        )

    nombre_archivo = f"parte_tg_{int(datetime.now().timestamp())}_{hashlib.md5(content).hexdigest()[:8]}.jpg"
    ruta_subidas = DATOS_DIR / "subidas"
    ruta_subidas.mkdir(parents=True, exist_ok=True)
    (ruta_subidas / nombre_archivo).write_bytes(content)

    datos["_imagen_archivo"] = "subidas/" + nombre_archivo
    set_estado(tid, "parte_confirmar_datos", datos)

    texto_resumen = _resumen_parte_texto(datos) + "\n\n¿Los datos son correctos?"
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Correcto", callback_data="parte_datos_ok"),
            InlineKeyboardButton("✏️ Corregir", callback_data="parte_datos_corregir"),
        ]
    ])
    await context.bot.send_message(chat_id=tid, text=texto_resumen, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


async def callback_parte_datos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle Correcto / Corregir response after OCR."""
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "parte_confirmar_datos":
        return await query.edit_message_text("⚠️ No hay parte pendiente.")
    datos = estado["datos"]

    if query.data == "parte_datos_ok":
        # Data confirmed — ask date confirmation before project selection
        fecha_ocr = datos.get("fecha") or datetime.now().strftime("%Y-%m-%d")
        try:
            fecha_fmt = datetime.strptime(fecha_ocr, "%Y-%m-%d").strftime("%d/%m/%Y")
        except Exception:
            fecha_fmt = fecha_ocr
        set_estado(tid, "parte_confirmar_fecha", datos)
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton(f"✅ Sí ({fecha_fmt})", callback_data="partefecha_ok"),
                InlineKeyboardButton("📅 Cambiar", callback_data="partefecha_cambiar"),
            ]
        ])
        await query.edit_message_text(f"✅ Datos confirmados.\n\n📅 Fecha del parte: *{fecha_fmt}*\n¿Es correcta?", reply_markup=kb, parse_mode=ParseMode.MARKDOWN)
    else:
        # Start correction flow — step 1: hincas
        set_estado(tid, "parte_corregir_hincas", datos)
        await query.edit_message_text(
            f"🔨 Hincas actuales: *{datos.get('total_hincas', 0)}*\n"
            f"Escribe el número correcto o *ok* para mantener:",
            parse_mode=ParseMode.MARKDOWN,
        )


async def _handle_parte_corregir_hincas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Correction step 1: hincas."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    datos = estado["datos"]
    texto = update.message.text.strip()
    if texto.lower() not in ("/ok", "ok"):
        try:
            datos["total_hincas"] = int(float(texto.replace(",", ".")))
        except (ValueError, TypeError):
            return await update.message.reply_text("❌ Escribe un número válido (ej: 150) o *ok* para mantener:")
    set_estado(tid, "parte_corregir_horas", datos)
    await update.message.reply_text(
        f"⏱ Horas admin actuales: *{datos.get('horas_admin', 0)}*\n"
        f"Escribe las horas o *ok* para mantener:",
        parse_mode=ParseMode.MARKDOWN,
    )


async def _handle_parte_corregir_horas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Correction step 2: horas admin."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    datos = estado["datos"]
    texto = update.message.text.strip()
    if texto.lower() not in ("/ok", "ok"):
        try:
            datos["horas_admin"] = float(texto.replace(",", "."))
        except (ValueError, TypeError):
            return await update.message.reply_text("❌ Escribe un número válido (ej: 8.5 o 8,5) o *ok* para mantener:")
    lineas = datos.get("lineas", [])
    operadores_txt = ", ".join(f"{l.get('operador', '?')} con {l.get('maquina', '?')}" for l in lineas) or "ninguno"
    set_estado(tid, "parte_corregir_operadores", datos)
    await update.message.reply_text(
        f"👷 Operadores actuales: *{operadores_txt}*\n"
        f"Escribe la corrección (ej: Diego con Carmela 10h, Manuel con Nicoletta 10h) o *ok* para mantener:",
        parse_mode=ParseMode.MARKDOWN,
    )


async def _handle_parte_corregir_operadores(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Correction step 3: operadores."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    datos = estado["datos"]
    texto = update.message.text.strip()
    if texto.lower() not in ("/ok", "ok"):
        # Parse simple format: "Diego con Carmela 10h, Manuel con Nicoletta 10h"
        import re
        nuevas_lineas = []
        for parte in texto.split(","):
            parte = parte.strip()
            m = re.match(r"(\w+)\s+con\s+(\w+)\s*(\d+)?h?", parte, re.IGNORECASE)
            if m:
                nuevas_lineas.append({
                    "operador": m.group(1),
                    "maquina": m.group(2),
                    "horas": int(m.group(3)) if m.group(3) else 10,
                    "rol": "operador",
                })
        if nuevas_lineas:
            datos["lineas"] = nuevas_lineas
    set_estado(tid, "parte_corregir_incidencias", datos)
    await update.message.reply_text(
        f"📝 Incidencias actuales: *{datos.get('incidencias') or 'ninguna'}*\n"
        f"Escribe las incidencias o *ok* para mantener:",
        parse_mode=ParseMode.MARKDOWN,
    )


async def _handle_parte_corregir_incidencias(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Correction step 4: incidencias — then show summary and go to project."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    datos = estado["datos"]
    texto = update.message.text.strip()
    if texto.lower() not in ("/ok", "ok"):
        datos["incidencias"] = texto
    # Show corrected summary then go to project selection
    resumen = _resumen_parte_texto(datos) + "\n\n✅ Datos corregidos."
    set_estado(tid, "parte_seleccionar_proyecto", datos)
    await update.message.reply_text(resumen, parse_mode=ParseMode.MARKDOWN)
    await _enviar_selector_proyecto_parte(tid, context, datos)


async def callback_parte_fecha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle date confirmation for OCR parte."""
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "parte_confirmar_fecha":
        return await query.edit_message_text("⚠️ No hay parte pendiente.")
    datos = estado["datos"]
    if query.data == "partefecha_ok":
        await query.edit_message_text("📅 Fecha confirmada.")
        await _enviar_selector_proyecto_parte(tid, context, datos)
    else:
        set_estado(tid, "parte_escribir_fecha", datos)
        await query.edit_message_text("📅 Escribe la fecha del parte (DD/MM/YYYY):")


async def _handle_parte_escribir_fecha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle typed date for OCR parte."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    datos = estado["datos"]
    texto = update.message.text.strip()
    try:
        d = datetime.strptime(texto, "%d/%m/%Y")
        if d.date() > datetime.now().date():
            await update.message.reply_text("❌ No se pueden crear partes para el futuro. Escribe otra fecha (DD/MM/YYYY):")
            return
        datos["fecha"] = d.strftime("%Y-%m-%d")
        set_estado(tid, "parte_seleccionar_proyecto", datos)
        await update.message.reply_text(f"📅 Fecha: *{texto}*", parse_mode=ParseMode.MARKDOWN)
        await _enviar_selector_proyecto_parte(tid, context, datos)
    except ValueError:
        await update.message.reply_text("❌ Formato inválido. Escribe DD/MM/YYYY:")


async def _enviar_selector_proyecto_parte(tid, context, datos):
    """Show active projects as inline buttons for parte assignment."""
    conn = get_conn()
    try:
        rows = conn.execute("SELECT id, nombre FROM proyectos WHERE estado IN ('vivo','en_curso') ORDER BY nombre").fetchall()
    finally:
        conn.close()
    if not rows:
        clear_estado(tid)
        return await context.bot.send_message(chat_id=tid, text="❌ No hay proyectos activos. Usa /manual.")
    buttons = [[InlineKeyboardButton(r["nombre"], callback_data=f"parteproy_{r['id']}")] for r in rows]
    set_estado(tid, "parte_seleccionar_proyecto", datos)
    await context.bot.send_message(
        chat_id=tid,
        text="🏗 *¿En qué proyecto es este parte?*",
        reply_markup=InlineKeyboardMarkup(buttons),
        parse_mode=ParseMode.MARKDOWN,
    )


async def callback_parte_proyecto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle project selection for parte."""
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "parte_seleccionar_proyecto":
        return await query.edit_message_text("⚠️ No hay parte pendiente.")
    datos = estado["datos"]
    proyecto_id = int(query.data.split("_")[1])
    # Look up project name
    conn = get_conn()
    try:
        row = conn.execute("SELECT nombre FROM proyectos WHERE id = ?", (proyecto_id,)).fetchone()
    finally:
        conn.close()
    proyecto_nombre = row["nombre"] if row else "?"
    datos["_proyecto_id"] = proyecto_id
    datos["_proyecto_nombre"] = proyecto_nombre
    set_estado(tid, "esperando_firma", datos)
    await query.edit_message_text(f"🏗 Proyecto: *{proyecto_nombre}*", parse_mode=ParseMode.MARKDOWN)
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Sí, firmado", callback_data="firma_firmado"),
            InlineKeyboardButton("📝 No, es borrador", callback_data="firma_borrador"),
        ]
    ])
    await context.bot.send_message(
        chat_id=tid,
        text="¿Está firmado por el jefe de obra?",
        reply_markup=kb,
    )


async def _procesar_foto_albaran(query, context, content, tid):
    """Process photo as albarán de compra."""
    b64 = base64.b64encode(content).decode("utf-8")

    _PROMPT_ALBARAN = """Eres un experto en leer albaranes de compra de materiales de construcción.
Extrae los campos del albarán fotografiado. Devuelve SOLO JSON válido:
{
    "numero_albaran": "nº del albarán o ticket",
    "fecha": "YYYY-MM-DD",
    "proveedor": "nombre del proveedor/tienda",
    "base_imponible": 100.00,
    "iva": 21.00,
    "total": 121.00,
    "confianza": "alta|media|baja"
}"""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT_ALBARAN},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
                ],
            }],
            max_tokens=1000,
            temperature=0,
        )
        texto = response.choices[0].message.content.strip()
        from core.llm import limpiar_json_respuesta
        texto = limpiar_json_respuesta(texto)
        datos = json.loads(texto)
    except Exception as e:
        logger.exception("OCR albarán error")
        return await context.bot.send_message(
            chat_id=tid,
            text="❌ No he podido leer el albarán. ¿Puedes hacer otra foto con mejor luz?",
        )

    nombre_archivo = f"albaran_tg_{int(datetime.now().timestamp())}_{hashlib.md5(content).hexdigest()[:8]}.jpg"
    ruta_subidas = DATOS_DIR / "subidas"
    ruta_subidas.mkdir(parents=True, exist_ok=True)
    (ruta_subidas / nombre_archivo).write_bytes(content)

    texto_resumen = (
        f"🧾 *Albarán detectado:*\n"
        f"📄 Nº: {datos.get('numero_albaran', '?')}\n"
        f"🗓 Fecha: {datos.get('fecha', '?')}\n"
        f"🏪 Proveedor: {datos.get('proveedor', '?')}\n"
        f"💰 Total: {datos.get('total', '?')} €\n\n"
        f"¿Cómo se ha pagado?"
    )

    datos["_imagen_archivo"] = "subidas/" + nombre_archivo
    set_estado(tid, "albaran_pago", datos)

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💳 Tarjeta", callback_data="albpago_tarjeta"),
            InlineKeyboardButton("🏦 Transfer.", callback_data="albpago_transferencia"),
        ],
        [
            InlineKeyboardButton("💵 Efectivo", callback_data="albpago_efectivo"),
            InlineKeyboardButton("⏳ Pendiente", callback_data="albpago_pendiente"),
        ],
    ])
    await context.bot.send_message(chat_id=tid, text=texto_resumen, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


async def callback_albaran_pago(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id

    estado = get_estado(tid)
    if not estado or estado["estado"] != "albaran_pago":
        return await query.edit_message_text("⚠️ No hay albarán pendiente.")

    datos = estado["datos"]
    metodo = query.data.replace("albpago_", "")

    from core.albaranes_db import crear_albaran
    albaran = crear_albaran({
        "numero_albaran": datos.get("numero_albaran", ""),
        "fecha": datos.get("fecha", ""),
        "proveedor": datos.get("proveedor", ""),
        "importe": datos.get("base_imponible", 0),
        "iva": datos.get("iva", 0),
        "total": datos.get("total", 0),
        "metodo_pago": metodo,
        "imagen_archivo": datos.get("_imagen_archivo", ""),
        "registrado_por": f"telegram:{tid}",
    })

    clear_estado(tid)
    await query.edit_message_text(
        f"✅ Albarán registrado en el ERP.\n"
        f"📄 #{albaran.get('numero_albaran', '?')} — {albaran.get('proveedor', '?')} — {albaran.get('total', 0)} €\n"
        f"💰 Pago: {metodo}"
    )


# ═══════════════════════════════════════════════════════════════════════════
#  FACTURA PROVEEDOR OCR
# ═══════════════════════════════════════════════════════════════════════════

_PROMPT_FACTURA_PROV = """Eres un experto en leer facturas de proveedores españoles.
Extrae los siguientes campos. Devuelve SOLO JSON válido sin markdown:
{
    "numero_factura": "nº factura",
    "fecha_factura": "YYYY-MM-DD",
    "proveedor": "nombre del proveedor",
    "cif_proveedor": "CIF/NIF del proveedor",
    "localidad": "ciudad o localidad del proveedor",
    "pais": "país del proveedor (España si no se especifica)",
    "concepto": "descripción o concepto",
    "base_imponible": 100.00,
    "iva_importe": 21.00,
    "total_a_pagar": 121.00,
    "confianza": "alta|media|baja"
}"""

_PROMPT_FACTURA_CLI = """Eres un experto en leer facturas emitidas por Hincado Directo S.L. a sus clientes.
Estas facturas tienen el logo de Hincado Directo y están dirigidas a clientes (EPCs, constructoras).
Extrae los siguientes campos. Devuelve SOLO JSON válido sin markdown:
{
    "numero_factura": "nº factura (formato XX/NNN)",
    "fecha_factura": "YYYY-MM-DD",
    "cliente": "nombre del cliente",
    "cif_cliente": "CIF/NIF del cliente",
    "concepto": "descripción o concepto",
    "base_imponible": 1000.00,
    "iva_importe": 210.00,
    "total_a_pagar": 1210.00,
    "confianza": "alta|media|baja"
}"""


def _fmt_eur(v):
    try:
        return f"{float(v):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "? €"


async def _procesar_foto_factura_prov(query, context, content, tid):
    b64 = base64.b64encode(content).decode("utf-8")
    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": _PROMPT_FACTURA_PROV},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
            ]}],
            max_tokens=1000, temperature=0,
        )
        from core.llm import limpiar_json_respuesta
        datos = json.loads(limpiar_json_respuesta(resp.choices[0].message.content.strip()))
    except Exception:
        logger.exception("OCR factura prov error")
        return await context.bot.send_message(chat_id=tid, text="❌ No he podido leer la factura.")

    # Save image
    nombre = f"factura_prov_tg_{int(datetime.now().timestamp())}_{hashlib.md5(content).hexdigest()[:8]}.jpg"
    ruta_subidas = DATOS_DIR / "subidas"
    ruta_subidas.mkdir(parents=True, exist_ok=True)
    (ruta_subidas / nombre).write_bytes(content)
    datos["imagen_archivo"] = "subidas/" + nombre
    datos["_tipo"] = "proveedor"

    txt = (
        f"📄 *Factura de proveedor detectada:*\n"
        f"🏢 Proveedor: {datos.get('proveedor', '?')}\n"
        f"📝 CIF: {datos.get('cif_proveedor', '?')}\n"
        f"🗓 Fecha: {datos.get('fecha_factura', '?')}\n"
        f"💰 Base: {_fmt_eur(datos.get('base_imponible'))}\n"
        f"💰 IVA: {_fmt_eur(datos.get('iva_importe'))}\n"
        f"💰 Total: {_fmt_eur(datos.get('total_a_pagar'))}\n\n"
        f"¿Los datos son correctos?"
    )
    set_estado(tid, "factura_confirmar", datos)
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Correcto", callback_data="facconf_ok"),
            InlineKeyboardButton("✏️ Corregir", callback_data="facconf_corregir"),
        ]
    ])
    await context.bot.send_message(chat_id=tid, text=txt, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


async def _procesar_foto_factura_cli(query, context, content, tid):
    b64 = base64.b64encode(content).decode("utf-8")
    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": _PROMPT_FACTURA_CLI},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
            ]}],
            max_tokens=1000, temperature=0,
        )
        from core.llm import limpiar_json_respuesta
        datos = json.loads(limpiar_json_respuesta(resp.choices[0].message.content.strip()))
    except Exception:
        logger.exception("OCR factura cli error")
        return await context.bot.send_message(chat_id=tid, text="❌ No he podido leer la factura.")

    nombre = f"factura_cli_tg_{int(datetime.now().timestamp())}_{hashlib.md5(content).hexdigest()[:8]}.jpg"
    ruta_subidas = DATOS_DIR / "subidas"
    ruta_subidas.mkdir(parents=True, exist_ok=True)
    (ruta_subidas / nombre).write_bytes(content)
    datos["imagen_archivo"] = "subidas/" + nombre
    datos["_tipo"] = "cliente"

    txt = (
        f"📄 *Factura de cliente detectada:*\n"
        f"🏢 Cliente: {datos.get('cliente', '?')}\n"
        f"📝 CIF: {datos.get('cif_cliente', '?')}\n"
        f"🗓 Fecha: {datos.get('fecha_factura', '?')}\n"
        f"💰 Base: {_fmt_eur(datos.get('base_imponible'))}\n"
        f"💰 IVA: {_fmt_eur(datos.get('iva_importe'))}\n"
        f"💰 Total: {_fmt_eur(datos.get('total_a_pagar'))}\n\n"
        f"¿Los datos son correctos?"
    )
    set_estado(tid, "factura_confirmar", datos)
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Correcto, guardar", callback_data="facconf_ok"),
            InlineKeyboardButton("✏️ Corregir", callback_data="facconf_corregir"),
        ]
    ])
    await context.bot.send_message(chat_id=tid, text=txt, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


async def callback_factura_confirmar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "factura_confirmar":
        return await query.edit_message_text("⚠️ No hay factura pendiente.")
    datos = estado["datos"]

    if query.data == "facconf_ok":
        await _guardar_factura_bot(query, context, datos, tid)
    elif query.data == "facconf_corregir":
        # Start correction flow
        datos["_correccion_paso"] = 0
        set_estado(tid, "factura_corregir", datos)
        campo = "proveedor" if datos.get("_tipo") == "proveedor" else "cliente"
        valor = datos.get(campo, "?")
        await query.edit_message_text(
            f"🏢 {campo.title()} actual: *{valor}*\nEscribe el nombre correcto o *ok* si es correcto:",
            parse_mode=ParseMode.MARKDOWN,
        )


async def handle_correccion_factura(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handles text messages during factura correction flow."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "factura_corregir":
        return  # Not in correction flow — let other handlers process
    datos = estado["datos"]
    paso = datos.get("_correccion_paso", 0)
    txt = update.message.text.strip()

    es_prov = datos.get("_tipo") == "proveedor"
    campos = [
        ("proveedor" if es_prov else "cliente", "🏢 " + ("Proveedor" if es_prov else "Cliente")),
        ("cif_proveedor" if es_prov else "cif_cliente", "📝 CIF"),
        ("fecha_factura", "🗓 Fecha"),
        ("base_imponible", "💰 Base imponible"),
        ("iva_importe", "💰 IVA"),
        ("total_a_pagar", "💰 Total"),
    ]

    # Apply correction for current step
    if txt.lower() not in ("/ok", "ok"):
        campo_key = campos[paso][0]
        if paso >= 3:  # Numeric fields
            try:
                datos[campo_key] = float(txt.replace(".", "").replace(",", "."))
            except ValueError:
                await update.message.reply_text("Escribe un número válido o *ok*:")
                return
        else:
            datos[campo_key] = txt

    paso += 1
    datos["_correccion_paso"] = paso

    if paso < len(campos):
        # Next field
        campo_key, label = campos[paso]
        valor = datos.get(campo_key, "?")
        if isinstance(valor, float):
            valor = _fmt_eur(valor)
        set_estado(tid, "factura_corregir", datos)
        await update.message.reply_text(
            f"{label} actual: *{valor}*\nEscribe el valor correcto o *ok*:",
            parse_mode=ParseMode.MARKDOWN,
        )
    else:
        # All fields done — show summary
        nombre = datos.get("proveedor" if es_prov else "cliente", "?")
        cif = datos.get("cif_proveedor" if es_prov else "cif_cliente", "?")
        txt = (
            f"📄 *Datos corregidos:*\n"
            f"🏢 {'Proveedor' if es_prov else 'Cliente'}: {nombre}\n"
            f"📝 CIF: {cif}\n"
            f"🗓 Fecha: {datos.get('fecha_factura', '?')}\n"
            f"💰 Base: {_fmt_eur(datos.get('base_imponible'))}\n"
            f"💰 IVA: {_fmt_eur(datos.get('iva_importe'))}\n"
            f"💰 Total: {_fmt_eur(datos.get('total_a_pagar'))}\n\n"
            f"¿Guardar?"
        )
        set_estado(tid, "factura_confirmar", datos)
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Guardar", callback_data="facconf_ok"),
                InlineKeyboardButton("❌ Descartar", callback_data="facconf_descartar"),
            ]
        ])
        await update.message.reply_text(txt, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


async def _guardar_factura_bot(query, context, datos, tid):
    """Save factura and handle payment flow."""
    from core.bot_db import guardar_factura_proveedor, guardar_factura_cliente

    rol = _user_rol(tid)
    tipo = datos.get("_tipo", "proveedor")

    if tipo == "cliente":
        fid = await _run_sync(guardar_factura_cliente, datos)
        clear_estado(tid)
        await query.edit_message_text(
            f"✅ Factura de cliente registrada en el ERP.\n"
            f"🏢 {datos.get('cliente', '?')} — {_fmt_eur(datos.get('total_a_pagar'))}"
        )
        return

    # Factura proveedor — ask payment method for ALL roles
    set_estado(tid, "factura_pago", datos)
    if rol == "superadmin":
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("❌ No pagada", callback_data="facpago_pendiente"),
                InlineKeyboardButton("🏦 Transferencia", callback_data="facpago_transferencia"),
            ],
            [
                InlineKeyboardButton("💳 Tarjeta personal", callback_data="facpago_personal"),
                InlineKeyboardButton("💳 Tarjeta empresa", callback_data="facpago_empresa"),
            ],
        ])
    else:
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("❌ No pagada", callback_data="facpago_pendiente"),
                InlineKeyboardButton("🏦 Transferencia", callback_data="facpago_transferencia"),
            ],
            [
                InlineKeyboardButton("💳 Mi tarjeta", callback_data="facpago_personal"),
                InlineKeyboardButton("💳 Tarjeta empresa", callback_data="facpago_empresa"),
            ],
        ])
    await query.edit_message_text(
        f"💳 ¿Cómo se ha pagado esta factura de {_fmt_eur(datos.get('total_a_pagar'))}?",
        reply_markup=kb,
    )


async def callback_factura_pago(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "factura_pago":
        return await query.edit_message_text("⚠️ No hay factura pendiente.")
    datos = estado["datos"]

    from core.bot_db import guardar_factura_proveedor

    if query.data == "facpago_pendiente":
        datos["estado_pago"] = "pendiente"
        await _run_sync(guardar_factura_proveedor, datos)
        clear_estado(tid)
        await query.edit_message_text(
            f"✅ Factura registrada como pendiente de pago ({_fmt_eur(datos.get('total_a_pagar'))})"
        )

    elif query.data == "facpago_transferencia":
        datos["estado_pago"] = "pagada"
        datos["comentarios"] = "Pagada por transferencia"
        await _run_sync(guardar_factura_proveedor, datos)
        clear_estado(tid)
        await query.edit_message_text(
            f"✅ Factura registrada. Pagada por transferencia ({_fmt_eur(datos.get('total_a_pagar'))})"
        )

    elif query.data == "facpago_personal":
        # Show buttons: "Yo mismo" + each operario
        user = get_usuario(tid)
        mi_nombre = user["nombre"] if user else "Yo"
        buttons = [[InlineKeyboardButton(f"🙋 Yo mismo ({mi_nombre})", callback_data=f"facpago_pers_{mi_nombre}")]]
        operarios = listar_usuarios(rol="operario")
        for op in operarios:
            buttons.append([InlineKeyboardButton(f"👷 {op['nombre']}", callback_data=f"facpago_pers_{op['nombre']}")])
        await query.edit_message_text(
            "💳 ¿Quién ha pagado con su tarjeta personal?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )

    elif query.data.startswith("facpago_pers_"):
        nombre = query.data[len("facpago_pers_"):]
        datos["estado_pago"] = "pagada"
        datos["comentarios"] = f"Pagada con tarjeta personal de {nombre} — tramitar reembolso"
        await _run_sync(guardar_factura_proveedor, datos)
        clear_estado(tid)
        await query.edit_message_text(
            f"✅ Factura registrada. Pagada con tarjeta personal de {nombre} ({_fmt_eur(datos.get('total_a_pagar'))})"
        )

    elif query.data == "facpago_empresa":
        # Show available company cards
        conn = get_conn()
        try:
            rows = conn.execute("SELECT id, alias, banco, persona, ultimos4 FROM tarjetas WHERE activa = 1").fetchall()
        finally:
            conn.close()
        if rows:
            buttons = []
            for r in rows:
                label = (r["alias"] or r["banco"] or "Tarjeta") + (" *" + r["ultimos4"] if r["ultimos4"] else "") + f" ({r['persona'] or '?'})"
                buttons.append([InlineKeyboardButton(label, callback_data=f"facpago_card_{r['id']}_{label[:30]}")])
            buttons.append([InlineKeyboardButton("❌ Cancelar", callback_data="facpago_pendiente")])
            await query.edit_message_text(
                "💳 ¿Con qué tarjeta de empresa?",
                reply_markup=InlineKeyboardMarkup(buttons),
            )
        else:
            # No cards in system — ask name
            datos["_pago_tipo"] = "empresa"
            set_estado(tid, "factura_pago_nombre", datos)
            await query.edit_message_text("¿Con la tarjeta de quién la has pagado? Escribe el nombre:")

    elif query.data.startswith("facpago_card_"):
        # Selected a specific company card
        parts = query.data.split("_", 3)
        tarjeta_id = int(parts[2])
        label = parts[3] if len(parts) > 3 else "?"
        datos["estado_pago"] = "pagada"
        datos["tarjeta_id"] = tarjeta_id
        datos["comentarios"] = f"Pagada con tarjeta empresa: {label}"
        await _run_sync(guardar_factura_proveedor, datos)
        clear_estado(tid)
        await query.edit_message_text(
            f"✅ Factura registrada. Pagada con {label} ({_fmt_eur(datos.get('total_a_pagar'))})"
        )


async def handle_factura_pago_nombre(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text response for 'whose card' question (personal or empresa)."""
    tid = update.effective_user.id
    estado = get_estado(tid)
    if not estado or estado["estado"] != "factura_pago_nombre":
        return
    datos = estado["datos"]
    nombre_tarjeta = update.message.text.strip()
    pago_tipo = datos.get("_pago_tipo", "empresa")

    from core.bot_db import guardar_factura_proveedor
    datos["estado_pago"] = "pagada"
    if pago_tipo == "personal":
        datos["comentarios"] = f"Pagada con tarjeta personal de {nombre_tarjeta} — tramitar reembolso"
    else:
        datos["comentarios"] = f"Pagada con tarjeta empresa de {nombre_tarjeta}"
    await _run_sync(guardar_factura_proveedor, datos)
    clear_estado(tid)
    await update.message.reply_text(
        f"✅ Factura registrada. Pagada con tarjeta de {nombre_tarjeta} ({_fmt_eur(datos.get('total_a_pagar'))})"
    )


# ═══════════════════════════════════════════════════════════════════════════
#  TARJETA MANAGEMENT COMMANDS
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_vertarjetas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    users = listar_usuarios()
    lines = ["💳 *Tarjetas asignadas:*\n"]
    for u in users:
        if u["rol"] in ("operario", "superadmin"):
            tarjeta = u.get("tarjeta_alias") or "Sin tarjeta"
            if u.get("tarjeta_id"):
                lines.append(f"👷 {u['nombre']} → {tarjeta}")
            else:
                lines.append(f"👷 {u['nombre']} → ❌ Sin tarjeta")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


async def cmd_asignartarjeta(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _user_rol(update.effective_user.id) != "superadmin":
        return await update.message.reply_text("🚫 Solo para administradores.")
    users = [u for u in listar_usuarios() if u["rol"] in ("operario", "superadmin")]
    if not users:
        return await update.message.reply_text("No hay usuarios.")
    buttons = []
    for u in users:
        label = f"{u['nombre']} — {u.get('tarjeta_alias') or 'sin tarjeta'}"
        buttons.append([InlineKeyboardButton(label, callback_data=f"asigtar_{u['telegram_id']}")])
    await update.message.reply_text(
        "👷 Selecciona un usuario para asignar/quitar tarjeta:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def callback_asignar_tarjeta(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("asigtar_"):
        user_tid = int(data.split("_")[1])
        # Show available tarjetas
        conn = get_conn()
        try:
            rows = conn.execute("SELECT id, alias, banco, persona FROM tarjetas WHERE activa = 1").fetchall()
        finally:
            conn.close()
        buttons = []
        for r in rows:
            label = f"{r['alias'] or r['banco']} — {r['persona'] or '?'}"
            buttons.append([InlineKeyboardButton(label, callback_data=f"settar_{user_tid}_{r['id']}_{label}")])
        buttons.append([InlineKeyboardButton("❌ Quitar tarjeta", callback_data=f"settar_{user_tid}_0_none")])
        await query.edit_message_text(
            "💳 Selecciona la tarjeta a asignar:",
            reply_markup=InlineKeyboardMarkup(buttons),
        )

    elif data.startswith("settar_"):
        parts = data.split("_", 3)
        user_tid = int(parts[1])
        tarjeta_id = int(parts[2])
        label = parts[3] if len(parts) > 3 else ""
        from core.bot_db import asignar_tarjeta
        if tarjeta_id == 0:
            asignar_tarjeta(user_tid, None, "")
            await query.edit_message_text("✅ Tarjeta quitada.")
        else:
            asignar_tarjeta(user_tid, tarjeta_id, label)
            await query.edit_message_text(f"✅ Tarjeta *{label}* asignada.", parse_mode=ParseMode.MARKDOWN)


async def callback_factura_descartar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    clear_estado(query.from_user.id)
    await query.edit_message_text("❌ Factura descartada.")


async def callback_firma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id

    estado = get_estado(tid)
    if not estado or estado["estado"] != "esperando_firma":
        return await query.edit_message_text("⚠️ No hay parte pendiente.")

    datos = estado["datos"]
    es_firmado = query.data == "firma_firmado"
    estado_firma = "firmado" if es_firmado else "borrador"

    # Project: use selected project (new flow) or fallback to OCR obra match (legacy)
    proyecto_id = datos.get("_proyecto_id")
    proyecto_nombre = datos.get("_proyecto_nombre", "")
    if not proyecto_id:
        conn = get_conn()
        try:
            obra = datos.get("obra", "")
            row = conn.execute("SELECT id, nombre FROM proyectos WHERE nombre LIKE ? LIMIT 1", (f"%{obra}%",)).fetchone()
            if not row:
                clear_estado(tid)
                return await query.edit_message_text(
                    f"❌ No encontré el proyecto '{obra}'. Usa /manual para introducir los datos."
                )
            proyecto_id = row["id"]
            proyecto_nombre = row["nombre"]
        finally:
            conn.close()

    lineas = datos.get("lineas", [])
    operadores = [l for l in lineas if l.get("rol") != "ayudante"]
    ayudantes = [l for l in lineas if l.get("rol") == "ayudante"]

    parte_data = {
        "fecha": datos.get("fecha"),
        "hincas_realizadas": datos.get("total_hincas", 0),
        "horas_maquina": sum(l.get("horas", 0) for l in operadores),
        "horas_personal": sum(l.get("horas", 0) for l in lineas),
        "num_operadores": len(operadores),
        "num_ayudantes": len(ayudantes),
        "horas_admin": datos.get("horas_admin", 0),
        "incidencias": datos.get("incidencias", ""),
        "notas": json.dumps(lineas, ensure_ascii=False),
        "imagen_archivo": datos.get("_imagen_archivo", ""),
        "estado_firma": estado_firma,
    }
    if es_firmado:
        parte_data["imagen_firmado"] = datos.get("_imagen_archivo", "")
        parte_data["fecha_firma"] = datetime.now().isoformat()

    # Check for existing borrador to compare
    if es_firmado:
        conn = get_conn()
        try:
            borrador = conn.execute(
                "SELECT * FROM proyecto_partes WHERE proyecto_id = ? AND fecha = ? AND estado_firma = 'borrador' LIMIT 1",
                (proyecto_id, datos.get("fecha")),
            ).fetchone()
        finally:
            conn.close()

        if borrador:
            diffs = []
            if borrador["hincas_realizadas"] != datos.get("total_hincas", 0):
                diffs.append(f"hincas: borrador {borrador['hincas_realizadas']} → firmado {datos.get('total_hincas', 0)}")
            if diffs:
                parte_data["estado_firma"] = "firmado_con_cambios"
                parte_data["diferencias_firma"] = json.dumps(diffs, ensure_ascii=False)
                # Update existing borrador instead of creating new
                with conectar() as conn2:
                    sets = ", ".join(f"{k} = ?" for k in parte_data)
                    vals = list(parte_data.values()) + [borrador["id"]]
                    conn2.execute(f"UPDATE proyecto_partes SET {sets} WHERE id = ?", vals)
                clear_estado(tid)
                await query.edit_message_text(
                    f"⚠️ Parte firmado con cambios. Diferencias: {', '.join(diffs)}",
                )
                await _notify_superadmins(
                    context,
                    f"⚠️ Parte con diferencias: {datos.get('obra')} {datos.get('fecha')}\n{chr(10).join(diffs)}",
                )
                return
            else:
                # Same data — just update to firmado
                with conectar() as conn2:
                    conn2.execute(
                        "UPDATE proyecto_partes SET estado_firma = 'firmado', imagen_firmado = ?, fecha_firma = ? WHERE id = ?",
                        (datos.get("_imagen_archivo", ""), datetime.now().isoformat(), borrador["id"]),
                    )
                clear_estado(tid)
                return await query.edit_message_text("✅ Parte actualizado a firmado correctamente.")

    # Create new parte, then update firma fields
    from core.proyectos_db import crear_parte, init_proyectos_db
    init_proyectos_db()
    nuevo = crear_parte(proyecto_id, parte_data)
    with conectar() as conn2:
        conn2.execute(
            "UPDATE proyecto_partes SET estado_firma = ?, imagen_firmado = ?, fecha_firma = ? WHERE id = ?",
            (estado_firma, parte_data.get("imagen_firmado"), parte_data.get("fecha_firma"), nuevo["id"]),
        )
    clear_estado(tid)
    hincas = datos.get("total_hincas", 0)
    await query.edit_message_text(f"✅ Parte registrado en {proyecto_nombre} ({hincas} hincas)")


# ═══════════════════════════════════════════════════════════════════════════
#  OPERARIO: /manual ConversationHandler
# ═══════════════════════════════════════════════════════════════════════════

MANUAL_PROYECTO, MANUAL_FECHA, MANUAL_HINCAS, MANUAL_HORAS_ADMIN, MANUAL_HINCADORAS, MANUAL_INCIDENCIAS, MANUAL_CONFIRMAR = range(7)


async def cmd_manual(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        return await update.message.reply_text("🚫 No tienes acceso.")

    conn = get_conn()
    try:
        rows = conn.execute("SELECT id, nombre FROM proyectos WHERE estado IN ('vivo','en_curso') ORDER BY nombre").fetchall()
    finally:
        conn.close()

    if not rows:
        await update.message.reply_text("No hay proyectos activos.")
        return ConversationHandler.END

    buttons = [[InlineKeyboardButton(r["nombre"], callback_data=f"manproy_{r['id']}_{r['nombre']}")] for r in rows]
    await update.message.reply_text(
        "🏗 *¿En qué proyecto estás hoy?*",
        reply_markup=InlineKeyboardMarkup(buttons),
        parse_mode=ParseMode.MARKDOWN,
    )
    return MANUAL_PROYECTO


async def manual_proyecto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    parts = query.data.split("_", 2)
    hoy = datetime.now().strftime("%Y-%m-%d")
    hoy_fmt = datetime.now().strftime("%d/%m/%Y")
    context.user_data["manual"] = {"proyecto_id": int(parts[1]), "proyecto_nombre": parts[2], "fecha": hoy}
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton(f"✅ Sí, es hoy ({hoy_fmt})", callback_data="manfecha_hoy"),
            InlineKeyboardButton("📅 Cambiar fecha", callback_data="manfecha_cambiar"),
        ]
    ])
    await query.edit_message_text(
        f"🏗 Proyecto: *{parts[2]}*\n\n📅 Fecha del parte: *{hoy_fmt}* (hoy)\n¿Es correcta?",
        reply_markup=kb, parse_mode=ParseMode.MARKDOWN,
    )
    return MANUAL_FECHA


async def manual_fecha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "manfecha_hoy":
        await query.edit_message_text(f"📅 Fecha: {context.user_data['manual']['fecha']}\n\n🔨 ¿Cuántas hincas? (escribe 0 si no hay)")
        return MANUAL_HINCAS
    else:
        await query.edit_message_text("📅 Escribe la fecha del parte (DD/MM/YYYY):")
        return MANUAL_FECHA


async def manual_fecha_texto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    texto = update.message.text.strip()
    try:
        d = datetime.strptime(texto, "%d/%m/%Y")
        if d.date() > datetime.now().date():
            await update.message.reply_text("❌ No se pueden crear partes para el futuro. Escribe otra fecha:")
            return MANUAL_FECHA
        context.user_data["manual"]["fecha"] = d.strftime("%Y-%m-%d")
        await update.message.reply_text(f"📅 Fecha: *{texto}*\n\n🔨 ¿Cuántas hincas? (escribe 0 si no hay)", parse_mode=ParseMode.MARKDOWN)
        return MANUAL_HINCAS
    except ValueError:
        await update.message.reply_text("❌ Formato inválido. Escribe DD/MM/YYYY:")
        return MANUAL_FECHA


async def manual_hincas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        n = int(float(update.message.text.strip().replace(",", ".")))
    except (ValueError, TypeError):
        await update.message.reply_text("Escribe un número.")
        return MANUAL_HINCAS
    context.user_data["manual"]["hincas"] = n
    await update.message.reply_text("⏱ ¿Horas de administración? (escribe 0 si no hay)")
    return MANUAL_HORAS_ADMIN


async def manual_horas_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        n = float(update.message.text.strip().replace(",", "."))
    except ValueError:
        await update.message.reply_text("Escribe un número.")
        return MANUAL_HORAS_ADMIN
    context.user_data["manual"]["horas_admin"] = n
    await update.message.reply_text("🏗 ¿Cuántas hincadoras han trabajado hoy?")
    return MANUAL_HINCADORAS


async def manual_hincadoras(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        n = int(float(update.message.text.strip().replace(",", ".")))
    except ValueError:
        await update.message.reply_text("Escribe un número.")
        return MANUAL_HINCADORAS
    context.user_data["manual"]["hincadoras"] = n
    await update.message.reply_text("📝 ¿Incidencias? (escribe 'ninguna' si no hay)")
    return MANUAL_INCIDENCIAS


async def manual_incidencias(update: Update, context: ContextTypes.DEFAULT_TYPE):
    texto = update.message.text.strip()
    if texto.lower() in ("ninguna", "no", "nada", "0", "-"):
        texto = ""
    context.user_data["manual"]["incidencias"] = texto

    d = context.user_data["manual"]
    resumen = (
        f"📋 *Resumen del parte:*\n"
        f"🏗 Proyecto: {d['proyecto_nombre']}\n"
        f"🗓 Fecha: {d['fecha']}\n"
        f"🔨 Hincas: {d['hincas']}\n"
        f"⏱ Horas admin: {d['horas_admin']}\n"
        f"🏗 Hincadoras: {d['hincadoras']}\n"
        f"📝 Incidencias: {d.get('incidencias') or 'ninguna'}\n\n"
        f"¿Está firmado?"
    )
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Firmado", callback_data="manual_firmado"),
            InlineKeyboardButton("📝 Borrador", callback_data="manual_borrador"),
            InlineKeyboardButton("❌ Cancelar", callback_data="manual_cancelar"),
        ]
    ])
    await update.message.reply_text(resumen, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)
    return MANUAL_CONFIRMAR


async def manual_confirmar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "manual_cancelar":
        context.user_data.pop("manual", None)
        await query.edit_message_text("❌ Parte cancelado.")
        return ConversationHandler.END

    d = context.user_data.get("manual", {})
    estado_firma = "firmado" if query.data == "manual_firmado" else "borrador"

    from core.proyectos_db import crear_parte, init_proyectos_db
    init_proyectos_db()
    parte_data = {
        "fecha": d.get("fecha"),
        "hincas_realizadas": d.get("hincas", 0),
        "horas_maquina": 0,
        "horas_personal": 0,
        "num_operadores": d.get("hincadoras", 0),
        "num_ayudantes": 0,
        "horas_admin": d.get("horas_admin", 0),
        "incidencias": d.get("incidencias", ""),
    }

    nuevo = crear_parte(d["proyecto_id"], parte_data)
    fecha_firma = datetime.now().isoformat() if estado_firma == "firmado" else None
    with conectar() as conn2:
        conn2.execute(
            "UPDATE proyecto_partes SET estado_firma = ?, fecha_firma = ? WHERE id = ?",
            (estado_firma, fecha_firma, nuevo["id"]),
        )
    context.user_data.pop("manual", None)
    await query.edit_message_text("✅ Parte registrado correctamente en el ERP.")
    return ConversationHandler.END


async def manual_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("manual", None)
    await update.message.reply_text("❌ Parte cancelado.")
    return ConversationHandler.END


# ═══════════════════════════════════════════════════════════════════════════
#  OPERARIO: /mispartes
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_mispartes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        return await update.message.reply_text("🚫 No tienes acceso.")

    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT pp.fecha, p.nombre as proyecto, pp.hincas_realizadas, pp.estado_firma
            FROM proyecto_partes pp JOIN proyectos p ON p.id = pp.proyecto_id
            ORDER BY pp.fecha DESC LIMIT 10
        """).fetchall()
    finally:
        conn.close()

    if not rows:
        return await update.message.reply_text("No tienes partes registrados.")

    firma_emoji = {"borrador": "📝", "firmado": "✅", "firmado_con_cambios": "⚠️"}
    lines = ["📋 *Últimos partes:*\n"]
    for r in rows:
        e = firma_emoji.get(r["estado_firma"] or "borrador", "📝")
        lines.append(f"{e} {r['fecha']} — {r['proyecto']} — {r['hincas_realizadas']} hincas")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


# ═══════════════════════════════════════════════════════════════════════════
#  SCHEDULED ALERTS (JobQueue)
# ═══════════════════════════════════════════════════════════════════════════

async def recordatorio_partes(context: ContextTypes.DEFAULT_TYPE):
    """18:00 L-V: recordar a operarios que no han enviado parte."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    operarios = listar_usuarios(rol="operario")
    conn = get_conn()
    try:
        for op in operarios:
            # Check if they sent a parte today
            row = conn.execute(
                "SELECT id FROM proyecto_partes WHERE fecha = ? LIMIT 1", (hoy,)
            ).fetchone()
            if not row:
                try:
                    await context.bot.send_message(
                        chat_id=op["telegram_id"],
                        text="🔔 ¿Has enviado el parte de hoy? Si ya terminaste, mándame la foto del parte.",
                    )
                except Exception:
                    pass
    finally:
        conn.close()


async def alerta_viernes_firmas(context: ContextTypes.DEFAULT_TYPE):
    """14:00 viernes: avisar de partes sin firmar de la semana."""
    hoy = datetime.now()
    lunes = (hoy - timedelta(days=hoy.weekday())).strftime("%Y-%m-%d")
    operarios = listar_usuarios(rol="operario")
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT pp.fecha, p.nombre FROM proyecto_partes pp"
            " JOIN proyectos p ON p.id = pp.proyecto_id"
            " WHERE pp.fecha >= ? AND COALESCE(pp.estado_firma,'borrador') = 'borrador'"
            " ORDER BY pp.fecha", (lunes,)
        ).fetchall()
        if rows:
            lines = [f"- {r['fecha']} ({r['nombre']})" for r in rows]
            txt = (
                f"📋 Tienes {len(rows)} partes pendientes de firma:\n"
                + "\n".join(lines)
                + "\n\nRecuerda pedir la firma al jefe de obra y enviar la foto firmada."
            )
            for op in operarios:
                try:
                    await context.bot.send_message(chat_id=op["telegram_id"], text=txt)
                except Exception:
                    pass
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _split_msg(text: str, limit: int = 4000) -> list[str]:
    """Split text into chunks ≤ limit chars at line boundaries."""
    if len(text) <= limit:
        return [text]
    chunks = []
    current = ""
    for line in text.split("\n"):
        if len(current) + len(line) + 1 > limit:
            chunks.append(current)
            current = line
        else:
            current = current + "\n" + line if current else line
    if current:
        chunks.append(current)
    return chunks


# ═══════════════════════════════════════════════════════════════════════════
#  MAQUINARIA: estados de conversación para /incidencia
# ═══════════════════════════════════════════════════════════════════════════

INCIDENCIA_MAQUINA, INCIDENCIA_DESC, INCIDENCIA_FOTO = range(10, 13)

_SEVERIDAD_LABELS = {
    "baja": "🟢 Baja",
    "media": "🟡 Media",
    "alta": "🔴 Alta",
    "seguridad": "🚨 Seguridad",
}
_ESTADO_INC_LABELS = {
    "abierta": "🔴 Abierta",
    "en_curso": "🟡 En revisión",
    "cerrada": "✅ Cerrada",
}


# ═══════════════════════════════════════════════════════════════════════════
#  MAQUINARIA: jobs de notificación proactiva
# ═══════════════════════════════════════════════════════════════════════════

async def recordatorio_check_semanal(context: ContextTypes.DEFAULT_TYPE):
    """Viernes 12:00 — recordar a todos los operarios el chequeo semanal de maquinaria."""
    from core.maquinaria_db import listar_maquinas
    operarios = listar_usuarios(rol="operario")
    if not operarios:
        return
    try:
        maquinas = [m for m in listar_maquinas() if m.get("activa")]
    except Exception:
        maquinas = []

    resumen = ""
    if maquinas:
        resumen = "\n\nMáquinas activas:\n" + "\n".join(f"• {m['nombre']}" for m in maquinas[:10])

    texto = (
        "🔧 *Recordatorio semanal de maquinaria*\n\n"
        "Es viernes — recuerda hacer el chequeo semanal de mantenimiento "
        "de las máquinas a tu cargo antes de terminar la jornada."
        + resumen
    )
    for op in operarios:
        try:
            await context.bot.send_message(
                chat_id=op["telegram_id"],
                text=texto,
                parse_mode=ParseMode.MARKDOWN,
            )
        except Exception:
            pass


async def alerta_mantenimiento_pendiente(context: ContextTypes.DEFAULT_TYPE):
    """Lunes y jueves 8:00 — avisar al responsable de cada máquina con revisión pendiente."""
    from core.notificaciones_maquinaria import (
        calcular_tareas_due, _log_notification, _get_week_iso, _build_notification_message,
    )
    from core.maquinaria_db import get_telegram_id_para_maquina

    dues = calcular_tareas_due()
    week = _get_week_iso()
    enviadas = 0

    for item in dues:
        if item.get("already_notified_this_week"):
            continue

        telegram_id = get_telegram_id_para_maquina(item["maquina_id"])
        if not telegram_id:
            continue

        mensaje = _build_notification_message(item)
        token = (item.get("token") or {}).get("token", "")
        due = int(item["next_due_hours"])

        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton(
                "📋 Abrir revisión",
                url=f"{os.getenv('ERP_BASE_URL', 'https://erp.hincadodirecto.com')}"
                    f"/w/{token}/revision?machine={item['maquina_id']}&due={due}",
            )
        ]])

        try:
            await context.bot.send_message(
                chat_id=telegram_id,
                text=mensaje,
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=keyboard,
            )
            _log_notification(
                item["maquina_id"], item["task_code"], week,
                None, "telegram", mensaje, "enviado", str(telegram_id),
            )
            enviadas += 1
        except Exception as e:
            _log_notification(
                item["maquina_id"], item["task_code"], week,
                None, "telegram", mensaje, "fallido", str(e)[:100],
            )

    logger.info("alerta_mantenimiento_pendiente: %d avisos enviados", enviadas)


# ═══════════════════════════════════════════════════════════════════════════
#  MAQUINARIA: /incidencia — flujo de reporte desde operario
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_incidencia(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Inicia el flujo de reporte de incidencia en maquinaria."""
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        await update.message.reply_text("🚫 No tienes acceso.")
        return ConversationHandler.END

    from core.maquinaria_db import listar_maquinas
    try:
        maquinas = [m for m in listar_maquinas() if m.get("activa")]
    except Exception:
        maquinas = []

    if not maquinas:
        await update.message.reply_text("No hay máquinas activas registradas.")
        return ConversationHandler.END

    botones = [
        [InlineKeyboardButton(m["nombre"], callback_data=f"inc_maq_{m['id']}")]
        for m in maquinas
    ]
    await update.message.reply_text(
        "🔧 *Nueva incidencia*\n\n¿En qué máquina has detectado el problema?",
        reply_markup=InlineKeyboardMarkup(botones),
        parse_mode=ParseMode.MARKDOWN,
    )
    return INCIDENCIA_MAQUINA


async def incidencia_seleccionar_maquina(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Operario selecciona la máquina afectada."""
    query = update.callback_query
    await query.answer()
    maquina_id = int(query.data.replace("inc_maq_", ""))
    context.user_data["incidencia"] = {"maquina_id": maquina_id}

    # Guardar nombre de máquina para el mensaje de confirmación
    from core.maquinaria_db import listar_maquinas
    nombre = next((m["nombre"] for m in listar_maquinas() if m["id"] == maquina_id), f"#{maquina_id}")
    context.user_data["incidencia"]["maquina_nombre"] = nombre

    botones = InlineKeyboardMarkup([
        [InlineKeyboardButton(lbl, callback_data=f"inc_sev_{sev}")]
        for sev, lbl in _SEVERIDAD_LABELS.items()
    ])
    await query.edit_message_text(
        f"✅ Máquina: *{nombre}*\n\n¿Qué gravedad tiene la incidencia?",
        reply_markup=botones,
        parse_mode=ParseMode.MARKDOWN,
    )
    return INCIDENCIA_DESC


async def incidencia_severidad(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Operario elige la severidad y se le pide descripción."""
    query = update.callback_query
    await query.answer()
    severidad = query.data.replace("inc_sev_", "")
    context.user_data["incidencia"]["severidad"] = severidad
    lbl = _SEVERIDAD_LABELS.get(severidad, severidad)

    await query.edit_message_text(
        f"Severidad: *{lbl}*\n\nDescribe la incidencia con el mayor detalle posible:",
        parse_mode=ParseMode.MARKDOWN,
    )
    return INCIDENCIA_DESC


async def incidencia_descripcion(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Operario escribe la descripción; se pregunta si quiere añadir foto."""
    context.user_data["incidencia"]["descripcion"] = update.message.text

    botones = InlineKeyboardMarkup([[
        InlineKeyboardButton("📷 Sí, añadir foto", callback_data="inc_foto_si"),
        InlineKeyboardButton("✅ No, enviar ya", callback_data="inc_foto_no"),
    ]])
    await update.message.reply_text(
        "¿Quieres adjuntar una foto de la incidencia?",
        reply_markup=botones,
    )
    return INCIDENCIA_FOTO


async def incidencia_foto_decision(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Operario decide si añade foto o envía directamente."""
    query = update.callback_query
    await query.answer()
    if query.data == "inc_foto_si":
        await query.edit_message_text("📷 Envía la foto de la incidencia:")
        return INCIDENCIA_FOTO
    else:
        return await _guardar_incidencia(query, context, foto_path=None)


async def incidencia_recibir_foto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Recibe la foto y guarda la incidencia."""
    foto = update.message.photo[-1]
    file = await foto.get_file()
    foto_dir = Path(_APP_DIR) / "data" / "incidencias_fotos"
    foto_dir.mkdir(parents=True, exist_ok=True)
    fname = f"inc_{update.effective_user.id}_{int(datetime.now().timestamp())}.jpg"
    foto_path = str(foto_dir / fname)
    await file.download_to_drive(foto_path)
    return await _guardar_incidencia(update, context, foto_path=foto_path)


async def _guardar_incidencia(source, context: ContextTypes.DEFAULT_TYPE, foto_path: str | None):
    """Persiste la incidencia y notifica a superadmins."""
    from core.maquinaria_db import crear_incidencia

    tid = source.from_user.id if hasattr(source, "from_user") else source.effective_user.id
    usuario = get_usuario(tid)
    datos = context.user_data.get("incidencia", {})

    inc = crear_incidencia({
        "maquina_id": datos["maquina_id"],
        "descripcion": datos.get("descripcion", ""),
        "severidad": datos.get("severidad", "media"),
        "telegram_id": tid,
        "operario_nombre": usuario["nombre"] if usuario else str(tid),
        "foto_path": foto_path or "",
    })

    sev_lbl = _SEVERIDAD_LABELS.get(inc.get("severidad", "media"), "")
    maq = datos.get("maquina_nombre", f"#{datos['maquina_id']}")
    confirmacion = (
        f"✅ Incidencia #{inc['id']} registrada.\n\n"
        f"🚜 *Máquina:* {maq}\n"
        f"⚠️ *Severidad:* {sev_lbl}\n"
        f"📝 *Descripción:* {inc['descripcion']}"
    )

    msg_fn = source.edit_message_text if hasattr(source, "edit_message_text") else source.message.reply_text
    try:
        await msg_fn(confirmacion, parse_mode=ParseMode.MARKDOWN)
    except Exception:
        pass

    # Notificar a superadmins
    aviso_admins = (
        f"🚨 *Nueva incidencia #{inc['id']}*\n\n"
        f"🚜 *Máquina:* {maq}\n"
        f"👷 *Operario:* {usuario['nombre'] if usuario else str(tid)}\n"
        f"⚠️ *Severidad:* {sev_lbl}\n"
        f"📝 {inc['descripcion']}"
        + ("\n📷 (con foto adjunta)" if foto_path else "")
    )
    await _notify_superadmins(context, aviso_admins)

    context.user_data.pop("incidencia", None)
    return ConversationHandler.END


async def incidencia_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("incidencia", None)
    await update.message.reply_text("❌ Incidencia cancelada.")
    return ConversationHandler.END


# ═══════════════════════════════════════════════════════════════════════════
#  MAQUINARIA: /incidencias — gestión para superadmin
# ═══════════════════════════════════════════════════════════════════════════

async def cmd_incidencias(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Superadmin: lista incidencias abiertas o en curso."""
    rol = _user_rol(update.effective_user.id)
    if rol != "superadmin":
        await update.message.reply_text("🚫 Solo para administradores.")
        return

    from core.maquinaria_db import listar_incidencias
    args = context.args or []
    estado_filtro = args[0] if args else None  # ej. /incidencias en_curso
    abiertas = listar_incidencias(estado=estado_filtro or "abierta", limit=20)
    en_curso = listar_incidencias(estado="en_curso", limit=20) if not estado_filtro else []
    todas = abiertas + en_curso

    if not todas:
        await update.message.reply_text("✅ No hay incidencias abiertas.")
        return

    for inc in todas:
        sev = _SEVERIDAD_LABELS.get(inc.get("severidad", "media"), "")
        est = _ESTADO_INC_LABELS.get(inc.get("estado", "abierta"), "")
        op = inc.get("operario_nombre") or "—"
        texto = (
            f"🔧 *Incidencia #{inc['id']}* — {inc['maquina_nombre']}\n"
            f"⚠️ {sev}  |  {est}\n"
            f"👷 {op}\n"
            f"📅 {inc['created_at'][:10]}\n"
            f"📝 {inc['descripcion']}"
        )
        botones = InlineKeyboardMarkup([[
            InlineKeyboardButton("🟡 En revisión", callback_data=f"incest_{inc['id']}_en_curso"),
            InlineKeyboardButton("✅ Cerrar", callback_data=f"incest_{inc['id']}_cerrada"),
        ]])
        await update.message.reply_text(texto, parse_mode=ParseMode.MARKDOWN, reply_markup=botones)


async def callback_incidencia_estado(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Superadmin cambia el estado de una incidencia desde botones inline."""
    query = update.callback_query
    await query.answer()
    if _user_rol(query.from_user.id) != "superadmin":
        return

    _, inc_id_str, nuevo_estado = query.data.split("_", 2)
    inc_id = int(inc_id_str)

    from core.maquinaria_db import actualizar_incidencia
    inc = actualizar_incidencia(inc_id, {"estado": nuevo_estado})

    est_lbl = _ESTADO_INC_LABELS.get(nuevo_estado, nuevo_estado)
    await query.edit_message_text(
        query.message.text + f"\n\n→ Estado actualizado: {est_lbl}",
        parse_mode=ParseMode.MARKDOWN,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN no configurado. Saliendo.")
        return

    # Init DB tables
    from core.proyectos_db import init_proyectos_db
    init_proyectos_db()
    init_bot_db()

    app = Application.builder().token(BOT_TOKEN).build()

    # ConversationHandler for /manual (must be added before generic handlers)
    manual_conv = ConversationHandler(
        entry_points=[CommandHandler("manual", cmd_manual)],
        states={
            MANUAL_PROYECTO: [CallbackQueryHandler(manual_proyecto, pattern=r"^manproy_")],
            MANUAL_FECHA: [
                CallbackQueryHandler(manual_fecha, pattern=r"^manfecha_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, manual_fecha_texto),
            ],
            MANUAL_HINCAS: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_hincas)],
            MANUAL_HORAS_ADMIN: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_horas_admin)],
            MANUAL_HINCADORAS: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_hincadoras)],
            MANUAL_INCIDENCIAS: [MessageHandler(filters.TEXT & ~filters.COMMAND, manual_incidencias)],
            MANUAL_CONFIRMAR: [CallbackQueryHandler(manual_confirmar, pattern=r"^manual_")],
        },
        fallbacks=[CommandHandler("cancel", manual_cancel)],
        per_message=False,
    )
    app.add_handler(manual_conv)

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("resumen", cmd_resumen))
    app.add_handler(CommandHandler("alertas", cmd_alertas))
    app.add_handler(CommandHandler("proyectos", cmd_proyectos))
    app.add_handler(CommandHandler("finanzas", cmd_finanzas))
    app.add_handler(CommandHandler("pendientes", cmd_pendientes))
    app.add_handler(CommandHandler("aprobar", cmd_aprobar))
    app.add_handler(CommandHandler("usuarios", cmd_usuarios))
    app.add_handler(CommandHandler("mispartes", cmd_mispartes))
    app.add_handler(CommandHandler("incidencias", cmd_incidencias))

    # Commands: tarjeta management
    app.add_handler(CommandHandler("vertarjetas", cmd_vertarjetas))
    app.add_handler(CommandHandler("asignartarjeta", cmd_asignartarjeta))

    # Callbacks
    app.add_handler(CallbackQueryHandler(callback_aprobar, pattern=r"^aprobar_"))
    app.add_handler(CallbackQueryHandler(callback_foto_tipo, pattern=r"^foto_tipo_"))
    app.add_handler(CallbackQueryHandler(callback_parte_datos, pattern=r"^parte_datos_"))
    app.add_handler(CallbackQueryHandler(callback_parte_fecha, pattern=r"^partefecha_"))
    app.add_handler(CallbackQueryHandler(callback_parte_proyecto, pattern=r"^parteproy_"))
    app.add_handler(CallbackQueryHandler(callback_firma, pattern=r"^firma_"))
    app.add_handler(CallbackQueryHandler(callback_albaran_pago, pattern=r"^albpago_"))
    app.add_handler(CallbackQueryHandler(callback_factura_confirmar, pattern=r"^facconf_"))
    app.add_handler(CallbackQueryHandler(callback_factura_pago, pattern=r"^facpago_"))
    app.add_handler(CallbackQueryHandler(callback_asignar_tarjeta, pattern=r"^asigtar_|^settar_"))
    app.add_handler(CallbackQueryHandler(callback_incidencia_estado, pattern=r"^incest_"))

    # ConversationHandler: /incidencia (debe ir ANTES del photo handler genérico)
    incidencia_conv = ConversationHandler(
        entry_points=[CommandHandler("incidencia", cmd_incidencia)],
        states={
            INCIDENCIA_MAQUINA: [CallbackQueryHandler(incidencia_seleccionar_maquina, pattern=r"^inc_maq_")],
            INCIDENCIA_DESC: [
                CallbackQueryHandler(incidencia_severidad, pattern=r"^inc_sev_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, incidencia_descripcion),
            ],
            INCIDENCIA_FOTO: [
                CallbackQueryHandler(incidencia_foto_decision, pattern=r"^inc_foto_"),
                MessageHandler(filters.PHOTO, incidencia_recibir_foto),
            ],
        },
        fallbacks=[CommandHandler("cancel", incidencia_cancel)],
        per_message=False,
    )
    app.add_handler(incidencia_conv)

    # Photo handler
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Text handlers for correction flows (BEFORE superadmin fallback)
    _parte_corregir_handlers = {
        "parte_corregir_hincas": _handle_parte_corregir_hincas,
        "parte_corregir_horas": _handle_parte_corregir_horas,
        "parte_corregir_operadores": _handle_parte_corregir_operadores,
        "parte_corregir_incidencias": _handle_parte_corregir_incidencias,
        "parte_escribir_fecha": _handle_parte_escribir_fecha,
    }

    async def _text_router(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Route text to correction flow if active, else to superadmin GPT-4."""
        tid = update.effective_user.id
        estado = get_estado(tid)
        if estado:
            handler = _parte_corregir_handlers.get(estado["estado"])
            if handler:
                return await handler(update, context)
            if estado["estado"] == "factura_corregir":
                return await handle_correccion_factura(update, context)
            if estado["estado"] == "factura_pago_nombre":
                return await handle_factura_pago_nombre(update, context)
        return await handle_text_superadmin(update, context)

    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, _text_router))

    # Scheduled jobs
    jq = app.job_queue
    # Recordatorio partes: 18:00 L-V (Mon=0..Fri=4)
    jq.run_daily(recordatorio_partes, time=time(18, 0), days=(0, 1, 2, 3, 4))
    # Alerta viernes firmas: 14:00 viernes (Fri=4)
    jq.run_daily(alerta_viernes_firmas, time=time(14, 0), days=(4,))
    # Maquinaria: recordatorio check semanal — viernes 12:00
    jq.run_daily(recordatorio_check_semanal, time=time(12, 0), days=(4,))
    # Maquinaria: alerta revisiones pendientes — lunes y jueves 8:00
    jq.run_daily(alerta_mantenimiento_pendiente, time=time(8, 0), days=(0, 3))

    logger.info("Bot arrancado. Polling...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
