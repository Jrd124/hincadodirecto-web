# -*- coding: utf-8 -*-
"""Rutas API para el módulo de Estados Financieros (EEFF)."""
from __future__ import annotations

import logging
import os
import tempfile

from flask import Blueprint, jsonify, request
from flask_login import login_required

from core.db import conectar
from core.eeff_db import (
    crear_tablas,
    importar_eeff,
    listar_periodos,
    obtener_lineas,
    eliminar_periodo,
    calcular_metricas,
    seed_plan_cuentas,
    seed_formulas,
    calcular_informe,
    obtener_plan_cuentas,
    actualizar_cuenta,
    crear_cuenta,
    obtener_formulas,
)

logger = logging.getLogger("erp")
eeff_bp = Blueprint("eeff", __name__)


@eeff_bp.post("/api/eeff/importar")
@login_required
def api_eeff_importar():
    """Recibe fichero Excel, parsea e importa periodos EEFF."""
    if "file" not in request.files:
        return jsonify({"error": "No se recibió fichero"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Nombre de fichero vacío"}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        return jsonify({"error": "Solo se aceptan ficheros .xlsx o .xls"}), 400

    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        f.save(tmp.name)
        tmp.close()
        with conectar() as conn:
            crear_tablas(conn)
            result = importar_eeff(tmp.name, conn)
            # Auto-seed new accounts
            seed_plan_cuentas(conn)
            seed_formulas(conn)
        return jsonify(result)
    except Exception as e:
        logger.exception("Error importando EEFF: %s", e)
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@eeff_bp.get("/api/eeff/periodos")
@login_required
def api_eeff_periodos():
    """Lista periodos importados con filtros opcionales."""
    sociedad = request.args.get("sociedad")
    tipo = request.args.get("tipo")
    año = request.args.get("año")
    with conectar() as conn:
        crear_tablas(conn)
        rows = listar_periodos(conn, sociedad=sociedad, tipo=tipo, año=año)
    return jsonify(rows)


@eeff_bp.get("/api/eeff/informe")
@login_required
def api_eeff_informe():
    """Genera informe completo (Balance + P&G + Métricas) desde SS + plan de cuentas.

    Accepts either periodo_id directly, or sociedad + año + mes (optional) to find best match.
    """
    periodo_id = request.args.get("periodo_id")
    with conectar() as conn:
        crear_tablas(conn)
        seed_plan_cuentas(conn)
        seed_formulas(conn)

        if not periodo_id:
            sociedad = request.args.get("sociedad", "")
            anio = request.args.get("año") or request.args.get("anio") or ""
            mes = request.args.get("mes", "")
            if not sociedad or not anio:
                return jsonify({"error": "periodo_id o (sociedad + año) requeridos"}), 400
            periodo_id = _buscar_periodo_ss(conn, sociedad, int(anio), mes)
            if not periodo_id:
                return jsonify({"error": "No hay sumas y saldos para esa selección"}), 404

        result = calcular_informe(conn, int(periodo_id))
    return jsonify(result)


def _buscar_periodo_ss(conn, sociedad, anio, mes=""):
    """Encuentra el periodo de sumas_saldos más apropiado."""
    if mes:
        # Buscar SS mensual exacto
        target_hasta = f"{anio}-{mes}-"
        row = conn.execute(
            "SELECT id FROM eeff_periodos WHERE tipo='sumas_saldos' AND sociedad=?"
            " AND \"año\"=? AND fecha_hasta LIKE ? ORDER BY fecha_hasta DESC LIMIT 1",
            (sociedad, anio, target_hasta + "%"),
        ).fetchone()
        if row:
            return row["id"]
        # Fallback: buscar trimestre que contenga ese mes
        m = int(mes)
        q_end_month = ((m - 1) // 3 + 1) * 3
        target = f"{anio}-{q_end_month:02d}-"
        row = conn.execute(
            "SELECT id FROM eeff_periodos WHERE tipo='sumas_saldos' AND sociedad=?"
            " AND \"año\"=? AND fecha_hasta LIKE ? ORDER BY fecha_hasta DESC LIMIT 1",
            (sociedad, anio, target + "%"),
        ).fetchone()
        if row:
            return row["id"]
    # Año completo: último periodo del año
    row = conn.execute(
        "SELECT id FROM eeff_periodos WHERE tipo='sumas_saldos' AND sociedad=?"
        " AND \"año\"=? ORDER BY fecha_hasta DESC LIMIT 1",
        (sociedad, anio),
    ).fetchone()
    return row["id"] if row else None


@eeff_bp.get("/api/eeff/plan-cuentas")
@login_required
def api_eeff_plan_cuentas():
    """Lista el plan de cuentas con su mapeo."""
    with conectar() as conn:
        crear_tablas(conn)
        rows = obtener_plan_cuentas(conn)
    return jsonify(rows)


@eeff_bp.put("/api/eeff/plan-cuentas/<int:cuenta_id>")
@login_required
def api_eeff_actualizar_cuenta(cuenta_id):
    """Actualiza el mapeo de una cuenta."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON requerido"}), 400
    with conectar() as conn:
        crear_tablas(conn)
        actualizar_cuenta(
            conn, cuenta_id,
            data.get("nivel1", "Sin clasificar"),
            data.get("nivel2", "Sin clasificar"),
            data.get("nivel3", "Sin clasificar"),
            data.get("signo", 1),
        )
    return jsonify({"ok": True})


@eeff_bp.post("/api/eeff/plan-cuentas")
@login_required
def api_eeff_crear_cuenta():
    """Crea/actualiza una cuenta en el plan."""
    data = request.get_json()
    if not data or not data.get("codigo"):
        return jsonify({"error": "codigo requerido"}), 400
    with conectar() as conn:
        crear_tablas(conn)
        crear_cuenta(
            conn,
            data["codigo"],
            data.get("nombre", data["codigo"]),
            data.get("nivel1", "Sin clasificar"),
            data.get("nivel2", "Sin clasificar"),
            data.get("nivel3", "Sin clasificar"),
            data.get("signo", 1),
        )
    return jsonify({"ok": True})


@eeff_bp.get("/api/eeff/formulas")
@login_required
def api_eeff_formulas():
    """Lista las fórmulas configuradas."""
    with conectar() as conn:
        crear_tablas(conn)
        seed_formulas(conn)
        rows = obtener_formulas(conn)
    return jsonify(rows)


@eeff_bp.get("/api/eeff/config-resumen")
@login_required
def api_eeff_config_resumen():
    """Datos de resumen para las cards de configuración."""
    from datetime import date
    with conectar() as conn:
        crear_tablas(conn)
        seed_plan_cuentas(conn)
        seed_formulas(conn)

        mapeadas = conn.execute(
            "SELECT COUNT(*) as c FROM eeff_plan_cuentas WHERE nivel1 != 'Sin clasificar'"
        ).fetchone()["c"]
        sin_mapear = conn.execute(
            "SELECT COUNT(*) as c FROM eeff_plan_cuentas WHERE nivel1 = 'Sin clasificar'"
        ).fetchone()["c"]
        periodos_count = conn.execute("SELECT COUNT(*) as c FROM eeff_periodos").fetchone()["c"]
        formulas_count = conn.execute(
            "SELECT COUNT(*) as c FROM eeff_formulas WHERE activo = 1"
        ).fetchone()["c"]

        ultimo = conn.execute(
            "SELECT fecha_hasta, periodo FROM eeff_periodos ORDER BY fecha_hasta DESC LIMIT 1"
        ).fetchone()
        ultimo_str = ultimo["periodo"] if ultimo else "\u2014"

        # Detect missing monthly periods
        ss_periodos = conn.execute(
            "SELECT fecha_desde, fecha_hasta, sociedad FROM eeff_periodos"
            " WHERE tipo='sumas_saldos' ORDER BY fecha_hasta"
        ).fetchall()
        meses_importados = set()
        for p in ss_periodos:
            meses_importados.add(p["fecha_hasta"][:7])  # "YYYY-MM"

        faltantes = []
        if meses_importados:
            from datetime import datetime, timedelta
            first = min(meses_importados)
            last = max(meses_importados)
            y, m = int(first[:4]), int(first[5:7])
            ly, lm = int(last[:4]), int(last[5:7])
            while (y, m) <= (ly, lm):
                key = f"{y}-{m:02d}"
                if key not in meses_importados:
                    meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
                    faltantes.append(f"{meses_es[m-1]} {y}")
                m += 1
                if m > 12:
                    m = 1
                    y += 1

    return jsonify({
        "cuentas_mapeadas": mapeadas,
        "cuentas_sin_mapear": sin_mapear,
        "periodos_importados": periodos_count,
        "ultimo_periodo": ultimo_str,
        "formulas_activas": formulas_count,
        "periodos_faltantes": faltantes,
    })


@eeff_bp.delete("/api/eeff/periodos/<int:pid>")
@login_required
def api_eeff_eliminar(pid):
    """Elimina un periodo importado."""
    with conectar() as conn:
        crear_tablas(conn)
        eliminar_periodo(conn, pid)
    return jsonify({"ok": True})


# Keep old endpoints for backwards compatibility
@eeff_bp.get("/api/eeff/balance")
@login_required
def api_eeff_balance():
    pid = request.args.get("periodo_id")
    if not pid:
        return jsonify({"error": "periodo_id requerido"}), 400
    with conectar() as conn:
        crear_tablas(conn)
        lineas = obtener_lineas(conn, int(pid))
    return jsonify(lineas)


@eeff_bp.get("/api/eeff/metricas")
@login_required
def api_eeff_metricas():
    sociedad = request.args.get("sociedad")
    año = request.args.get("año")
    if not sociedad or not año:
        return jsonify({"error": "sociedad y año requeridos"}), 400
    with conectar() as conn:
        crear_tablas(conn)
        m = calcular_metricas(conn, sociedad, año)
    return jsonify(m)
