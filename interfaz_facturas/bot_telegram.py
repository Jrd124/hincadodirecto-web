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
            "/usuarios — Lista de usuarios del bot\n\n"
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
    conn = get_conn()
    try:
        hoy = datetime.now()
        mes_prefix = hoy.strftime("%Y-%m")
        anio_prefix = hoy.strftime("%Y")
        _P = "CASE WHEN total_a_pagar LIKE '%,%' THEN CAST(REPLACE(REPLACE(COALESCE(total_a_pagar,'0'),'.',''),',','.') AS REAL) ELSE CAST(COALESCE(total_a_pagar,'0') AS REAL) END"

        fact_mes = _safe_scalar(conn,
            f"SELECT COALESCE(SUM({_P}),0) FROM facturas_cliente WHERE fecha_factura LIKE ?",
            (mes_prefix + "%",))
        fact_anio = _safe_scalar(conn,
            f"SELECT COALESCE(SUM({_P}),0) FROM facturas_cliente WHERE fecha_factura LIKE ?",
            (anio_prefix + "%",))

        r = conn.execute(
            f"SELECT COUNT(*) as c, COALESCE(SUM({_P}),0) as t"
            " FROM facturas_cliente WHERE LOWER(TRIM(COALESCE(estado_cobro,''))) IN ('pendiente','','parcial')"
        ).fetchone() if _table_exists(conn, "facturas_cliente") else None
        pte_cobro = r["t"] if r else 0
        pte_cobro_n = r["c"] if r else 0

        r = conn.execute(
            f"SELECT COUNT(*) as c, COALESCE(SUM({_P}),0) as t"
            " FROM facturas_proveedor WHERE LOWER(TRIM(COALESCE(estado_pago,''))) = 'pendiente'"
        ).fetchone() if _table_exists(conn, "facturas_proveedor") else None
        pte_pago = r["t"] if r else 0
        pte_pago_n = r["c"] if r else 0

        def fmt(v):
            return f"{v:,.0f} €".replace(",", ".")

        return (
            f"💰 *Finanzas*\n\n"
            f"📊 Facturado mes: *{fmt(fact_mes)}*\n"
            f"📊 Facturado año: *{fmt(fact_anio)}*\n"
            f"🟢 Pendiente cobro: *{fmt(pte_cobro)}* ({pte_cobro_n} facturas)\n"
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
#  GPT-4 FUNCTION CALLING (superadmin natural language)
# ═══════════════════════════════════════════════════════════════════════════

_GPT_SYSTEM = (
    "Eres el asistente del ERP de Hincado Directo, empresa española de hincado "
    "de pilotes para parques solares fotovoltaicos. Responde siempre en español, "
    "de forma concisa y con datos concretos. Usa emojis para hacer las respuestas "
    "más legibles. Cuando des cifras monetarias, usa formato español (punto para "
    "miles, coma para decimales). Si no tienes datos suficientes para responder, "
    "dilo claramente."
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
]

_FN_MAP = {
    "consultar_proyectos": consultar_proyectos,
    "consultar_partes": consultar_partes,
    "consultar_finanzas": consultar_finanzas,
    "consultar_maquinaria": consultar_maquinaria,
    "consultar_alertas": consultar_alertas,
    "consultar_equipo": consultar_equipo,
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
    answer = await _run_sync(_gpt_query_sync, update.message.text)
    for chunk in _split_msg(answer):
        await update.message.reply_text(chunk, parse_mode=ParseMode.MARKDOWN)


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

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📋 Parte de trabajo", callback_data="foto_tipo_parte"),
            InlineKeyboardButton("🧾 Albarán de compra", callback_data="foto_tipo_albaran"),
        ]
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


async def _procesar_foto_parte(query, context, content, tid):
    """Process photo as parte de trabajo."""
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

    lineas_txt = ""
    for l in datos.get("lineas", []):
        lineas_txt += f"👷 {l.get('operador', '?')} con {l.get('maquina', '?')}: {l.get('horas', '?')}h\n"

    conf_emoji = {"alta": "🟢", "media": "🟡", "baja": "🔴"}.get(datos.get("confianza", "?"), "⚪")
    texto_resumen = (
        f"📋 *Parte detectado:* {conf_emoji}\n"
        f"🗓 Fecha: {datos.get('fecha', '?')}\n"
        f"🏗 Obra: {datos.get('obra', '?')}\n"
        f"{lineas_txt}"
        f"🔨 Total hincas: {datos.get('total_hincas', 0)}\n"
        f"📝 Incidencias: {datos.get('incidencias') or 'ninguna'}\n\n"
        f"¿Está firmado por el jefe de obra?"
    )

    datos["_imagen_archivo"] = "subidas/" + nombre_archivo
    set_estado(tid, "esperando_firma", datos)

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Sí, firmado", callback_data="firma_firmado"),
            InlineKeyboardButton("📝 No, es borrador", callback_data="firma_borrador"),
        ]
    ])
    await context.bot.send_message(chat_id=tid, text=texto_resumen, reply_markup=kb, parse_mode=ParseMode.MARKDOWN)


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

    # Find project
    conn = get_conn()
    try:
        obra = datos.get("obra", "")
        row = conn.execute("SELECT id FROM proyectos WHERE nombre LIKE ? LIMIT 1", (f"%{obra}%",)).fetchone()
        if not row:
            clear_estado(tid)
            return await query.edit_message_text(
                f"❌ No encontré el proyecto '{obra}'. Usa /manual para introducir los datos."
            )
        proyecto_id = row["id"]
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
    await query.edit_message_text("✅ Parte registrado correctamente en el ERP.")


# ═══════════════════════════════════════════════════════════════════════════
#  OPERARIO: /manual ConversationHandler
# ═══════════════════════════════════════════════════════════════════════════

MANUAL_PROYECTO, MANUAL_HINCAS, MANUAL_HORAS_ADMIN, MANUAL_HINCADORAS, MANUAL_INCIDENCIAS, MANUAL_CONFIRMAR = range(6)


async def cmd_manual(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rol = _user_rol(update.effective_user.id)
    if not rol or rol in ("pendiente", "bloqueado"):
        return await update.message.reply_text("🚫 No tienes acceso.")

    conn = get_conn()
    try:
        rows = conn.execute("SELECT id, nombre FROM proyectos WHERE estado = 'en_curso' ORDER BY nombre").fetchall()
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
    context.user_data["manual"] = {"proyecto_id": int(parts[1]), "proyecto_nombre": parts[2], "fecha": datetime.now().strftime("%Y-%m-%d")}
    await query.edit_message_text(f"🏗 Proyecto: *{parts[2]}*\n\n🔨 ¿Cuántas hincas hoy? (escribe 0 si no hay)", parse_mode=ParseMode.MARKDOWN)
    return MANUAL_HINCAS


async def manual_hincas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        n = int(update.message.text.strip())
    except ValueError:
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
        n = int(update.message.text.strip())
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

    # Callbacks
    app.add_handler(CallbackQueryHandler(callback_aprobar, pattern=r"^aprobar_"))
    app.add_handler(CallbackQueryHandler(callback_foto_tipo, pattern=r"^foto_tipo_"))
    app.add_handler(CallbackQueryHandler(callback_firma, pattern=r"^firma_"))
    app.add_handler(CallbackQueryHandler(callback_albaran_pago, pattern=r"^albpago_"))

    # Photo handler (operario OCR)
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Text fallback (superadmin GPT-4)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_superadmin))

    # Scheduled jobs
    jq = app.job_queue
    # Recordatorio partes: 18:00 L-V (Mon=0..Fri=4)
    jq.run_daily(recordatorio_partes, time=time(18, 0), days=(0, 1, 2, 3, 4))
    # Alerta viernes firmas: 14:00 viernes (Fri=4)
    jq.run_daily(alerta_viernes_firmas, time=time(14, 0), days=(4,))

    logger.info("Bot arrancado. Polling...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
