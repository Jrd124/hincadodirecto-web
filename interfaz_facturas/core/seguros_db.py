# -*- coding: utf-8 -*-
"""Tabla y CRUD para el módulo de Seguros."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from core.db import conectar, get_conn

_initialized = False


def init_seguros_db():
    global _initialized
    if _initialized:
        return
    with conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS polizas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sociedad TEXT NOT NULL DEFAULT 'hincado_directo',
                tipo TEXT NOT NULL CHECK(tipo IN ('maquinaria','vehiculo','responsabilidad_civil','accidentes_convenio','dyo','otro')),
                numero_poliza TEXT,
                aseguradora TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                recurso_tipo TEXT,
                recurso_id INTEGER,
                recurso_nombre TEXT,
                fecha_inicio TEXT NOT NULL,
                fecha_vencimiento TEXT NOT NULL,
                prima_anual REAL DEFAULT 0,
                prima_mensual REAL DEFAULT 0,
                forma_pago TEXT DEFAULT 'anual',
                estado TEXT DEFAULT 'vigente' CHECK(estado IN ('vigente','vencida','cancelada','en_renovacion')),
                renovacion_automatica INTEGER DEFAULT 1,
                cobertura TEXT,
                franquicia REAL DEFAULT 0,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS siniestros (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                poliza_id INTEGER NOT NULL REFERENCES polizas(id),
                fecha_siniestro TEXT NOT NULL,
                fecha_comunicacion TEXT,
                numero_expediente TEXT,
                descripcion TEXT NOT NULL,
                importe_reclamado REAL DEFAULT 0,
                importe_indemnizado REAL,
                estado TEXT DEFAULT 'abierto' CHECK(estado IN ('abierto','en_tramite','resuelto','rechazado')),
                proyecto_id INTEGER,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS seguros_documentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                poliza_id INTEGER REFERENCES polizas(id),
                siniestro_id INTEGER REFERENCES siniestros(id),
                nombre_archivo TEXT NOT NULL,
                ruta_archivo TEXT,
                tipo TEXT DEFAULT 'poliza' CHECK(tipo IN ('poliza','recibo','certificado','siniestro','otro')),
                descripcion TEXT,
                fecha_subida TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_polizas_sociedad ON polizas(sociedad)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_polizas_tipo ON polizas(tipo)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_siniestros_poliza ON siniestros(poliza_id)")
        # Migración: columnas de pago/conciliación bancaria
        cur = conn.execute("PRAGMA table_info(polizas)")
        cols_existentes = {row[1] for row in cur.fetchall()}
        for col, sql in [
            ("movimiento_banco_id", "TEXT"),
            ("fecha_pago", "TEXT"),
            ("estado_pago", "TEXT DEFAULT 'pendiente'"),
        ]:
            if col not in cols_existentes:
                conn.execute(f"ALTER TABLE polizas ADD COLUMN {col} {sql}")
    _initialized = True


def _now():
    return datetime.now().isoformat()


# ── Pólizas CRUD ─────────────────────────────────────────────────────────

def crear_poliza(data: dict) -> dict:
    init_seguros_db()
    ahora = _now()
    with conectar() as conn:
        cur = conn.execute("""
            INSERT INTO polizas (sociedad, tipo, numero_poliza, aseguradora, descripcion,
                recurso_tipo, recurso_id, recurso_nombre,
                fecha_inicio, fecha_vencimiento, prima_anual, prima_mensual, forma_pago,
                estado, renovacion_automatica, cobertura, franquicia, notas, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data.get("sociedad", "hincado_directo"),
            data["tipo"],
            (data.get("numero_poliza") or "").strip(),
            data["aseguradora"],
            data["descripcion"],
            data.get("recurso_tipo"),
            data.get("recurso_id"),
            (data.get("recurso_nombre") or "").strip() or None,
            data["fecha_inicio"],
            data["fecha_vencimiento"],
            float(data.get("prima_anual") or 0),
            float(data.get("prima_mensual") or 0),
            data.get("forma_pago", "anual"),
            data.get("estado", "vigente"),
            1 if data.get("renovacion_automatica", True) else 0,
            (data.get("cobertura") or "").strip() or None,
            float(data.get("franquicia") or 0),
            (data.get("notas") or "").strip() or None,
            ahora, ahora,
        ))
        return dict(conn.execute("SELECT * FROM polizas WHERE id = ?", (cur.lastrowid,)).fetchone())


def listar_polizas(sociedad: str = "", tipo: str = "", estado: str = "") -> list[dict]:
    init_seguros_db()
    conn = get_conn()
    try:
        where, params = ["1=1"], []
        if sociedad:
            where.append("sociedad = ?"); params.append(sociedad)
        if tipo:
            where.append("tipo = ?"); params.append(tipo)
        if estado:
            where.append("estado = ?"); params.append(estado)
        rows = conn.execute(
            f"SELECT * FROM polizas WHERE {' AND '.join(where)} ORDER BY fecha_vencimiento ASC",
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def obtener_poliza(poliza_id: int) -> dict | None:
    init_seguros_db()
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM polizas WHERE id = ?", (poliza_id,)).fetchone()
        if not row:
            return None
        p = dict(row)
        p["siniestros"] = [dict(r) for r in conn.execute(
            "SELECT * FROM siniestros WHERE poliza_id = ? ORDER BY fecha_siniestro DESC", (poliza_id,)
        ).fetchall()]
        p["documentos"] = [dict(r) for r in conn.execute(
            "SELECT * FROM seguros_documentos WHERE poliza_id = ? ORDER BY fecha_subida DESC", (poliza_id,)
        ).fetchall()]
        return p
    finally:
        conn.close()


def actualizar_poliza(poliza_id: int, data: dict) -> dict | None:
    init_seguros_db()
    campos = [
        "sociedad", "tipo", "numero_poliza", "aseguradora", "descripcion",
        "recurso_tipo", "recurso_id", "recurso_nombre",
        "fecha_inicio", "fecha_vencimiento", "prima_anual", "prima_mensual", "forma_pago",
        "estado", "renovacion_automatica", "cobertura", "franquicia", "notas",
    ]
    sets, params = [], []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            v = data[c]
            if c in ("prima_anual", "prima_mensual", "franquicia"):
                v = float(v or 0)
            elif c == "renovacion_automatica":
                v = 1 if v else 0
            params.append(v)
    if not sets:
        return obtener_poliza(poliza_id)
    sets.append("updated_at = ?"); params.append(_now()); params.append(poliza_id)
    with conectar() as conn:
        conn.execute(f"UPDATE polizas SET {', '.join(sets)} WHERE id = ?", params)
        row = conn.execute("SELECT * FROM polizas WHERE id = ?", (poliza_id,)).fetchone()
        return dict(row) if row else None


def eliminar_poliza(poliza_id: int) -> bool:
    init_seguros_db()
    with conectar() as conn:
        conn.execute("DELETE FROM seguros_documentos WHERE poliza_id = ?", (poliza_id,))
        conn.execute("DELETE FROM siniestros WHERE poliza_id = ?", (poliza_id,))
        return conn.execute("DELETE FROM polizas WHERE id = ?", (poliza_id,)).rowcount > 0


# ── Siniestros CRUD ──────────────────────────────────────────────────────

def crear_siniestro(data: dict) -> dict:
    init_seguros_db()
    ahora = _now()
    with conectar() as conn:
        cur = conn.execute("""
            INSERT INTO siniestros (poliza_id, fecha_siniestro, fecha_comunicacion,
                numero_expediente, descripcion, importe_reclamado, importe_indemnizado,
                estado, proyecto_id, notas, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            int(data["poliza_id"]),
            data["fecha_siniestro"],
            data.get("fecha_comunicacion"),
            (data.get("numero_expediente") or "").strip() or None,
            data["descripcion"],
            float(data.get("importe_reclamado") or 0),
            float(data["importe_indemnizado"]) if data.get("importe_indemnizado") is not None else None,
            data.get("estado", "abierto"),
            data.get("proyecto_id"),
            (data.get("notas") or "").strip() or None,
            ahora, ahora,
        ))
        return dict(conn.execute("SELECT * FROM siniestros WHERE id = ?", (cur.lastrowid,)).fetchone())


def actualizar_siniestro(siniestro_id: int, data: dict) -> dict | None:
    init_seguros_db()
    campos = ["fecha_siniestro", "fecha_comunicacion", "numero_expediente", "descripcion",
              "importe_reclamado", "importe_indemnizado", "estado", "proyecto_id", "notas"]
    sets, params = [], []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            v = data[c]
            if c in ("importe_reclamado",):
                v = float(v or 0)
            elif c == "importe_indemnizado":
                v = float(v) if v is not None else None
            params.append(v)
    if not sets:
        return None
    sets.append("updated_at = ?"); params.append(_now()); params.append(siniestro_id)
    with conectar() as conn:
        conn.execute(f"UPDATE siniestros SET {', '.join(sets)} WHERE id = ?", params)
        row = conn.execute("SELECT * FROM siniestros WHERE id = ?", (siniestro_id,)).fetchone()
        return dict(row) if row else None


def listar_siniestros(poliza_id: int | None = None, estado: str = "") -> list[dict]:
    init_seguros_db()
    conn = get_conn()
    try:
        where, params = ["1=1"], []
        if poliza_id:
            where.append("poliza_id = ?"); params.append(poliza_id)
        if estado:
            where.append("estado = ?"); params.append(estado)
        return [dict(r) for r in conn.execute(
            f"SELECT s.*, p.numero_poliza, p.aseguradora FROM siniestros s"
            f" JOIN polizas p ON s.poliza_id = p.id WHERE {' AND '.join(where)}"
            f" ORDER BY s.fecha_siniestro DESC", params
        ).fetchall()]
    finally:
        conn.close()


# ── Documentos ────────────────────────────────────────────────────────────

def crear_documento(data: dict) -> dict:
    init_seguros_db()
    ahora = _now()
    with conectar() as conn:
        cur = conn.execute("""
            INSERT INTO seguros_documentos (poliza_id, siniestro_id, nombre_archivo, ruta_archivo,
                tipo, descripcion, fecha_subida, created_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            data.get("poliza_id"), data.get("siniestro_id"),
            data["nombre_archivo"], data.get("ruta_archivo"),
            data.get("tipo", "poliza"), (data.get("descripcion") or "").strip() or None,
            ahora[:10], ahora,
        ))
        return dict(conn.execute("SELECT * FROM seguros_documentos WHERE id = ?", (cur.lastrowid,)).fetchone())


def listar_documentos(poliza_id: int) -> list[dict]:
    init_seguros_db()
    conn = get_conn()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM seguros_documentos WHERE poliza_id = ? ORDER BY fecha_subida DESC",
            (poliza_id,),
        ).fetchall()]
    finally:
        conn.close()


def eliminar_documento(doc_id: int) -> bool:
    init_seguros_db()
    with conectar() as conn:
        return conn.execute("DELETE FROM seguros_documentos WHERE id = ?", (doc_id,)).rowcount > 0


# ── Resumen y alertas ─────────────────────────────────────────────────────

def listar_polizas_pendientes_pago() -> list[dict]:
    """Devuelve pólizas vigentes sin pago conciliado."""
    init_seguros_db()
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM polizas WHERE estado = 'vigente' AND (estado_pago IS NULL OR estado_pago = 'pendiente') ORDER BY prima_anual DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def conciliar_poliza(poliza_id: int, movimiento_id: str, fecha_pago: str) -> dict | None:
    """Marca una póliza como pagada vinculándola a un movimiento bancario."""
    init_seguros_db()
    with conectar() as conn:
        conn.execute(
            "UPDATE polizas SET movimiento_banco_id = ?, fecha_pago = ?, estado_pago = 'pagada', updated_at = ? WHERE id = ?",
            (movimiento_id, fecha_pago, _now(), poliza_id),
        )
        row = conn.execute("SELECT * FROM polizas WHERE id = ?", (poliza_id,)).fetchone()
        return dict(row) if row else None


def desconciliar_poliza(poliza_id: int) -> dict | None:
    """Quita la vinculación de pago de una póliza."""
    init_seguros_db()
    with conectar() as conn:
        conn.execute(
            "UPDATE polizas SET movimiento_banco_id = NULL, fecha_pago = NULL, estado_pago = 'pendiente', updated_at = ? WHERE id = ?",
            (_now(), poliza_id),
        )
        row = conn.execute("SELECT * FROM polizas WHERE id = ?", (poliza_id,)).fetchone()
        return dict(row) if row else None


def resumen_seguros() -> dict:
    init_seguros_db()
    conn = get_conn()
    try:
        hoy = datetime.now().strftime("%Y-%m-%d")
        en_30 = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")

        vigentes = conn.execute("SELECT COUNT(*) FROM polizas WHERE estado = 'vigente'").fetchone()[0]
        por_vencer = conn.execute(
            "SELECT COUNT(*) FROM polizas WHERE estado = 'vigente' AND fecha_vencimiento <= ? AND fecha_vencimiento >= ?",
            (en_30, hoy),
        ).fetchone()[0]
        coste_anual = conn.execute("SELECT COALESCE(SUM(prima_anual), 0) FROM polizas WHERE estado = 'vigente'").fetchone()[0]
        coste_pagado = conn.execute("SELECT COALESCE(SUM(prima_anual), 0) FROM polizas WHERE estado = 'vigente' AND estado_pago = 'pagada'").fetchone()[0]
        siniestros_abiertos = conn.execute("SELECT COUNT(*) FROM siniestros WHERE estado IN ('abierto','en_tramite')").fetchone()[0]

        return {
            "vigentes": vigentes,
            "por_vencer_30d": por_vencer,
            "coste_anual": round(coste_anual, 2),
            "coste_pagado": round(coste_pagado, 2),
            "coste_pendiente": round(coste_anual - coste_pagado, 2),
            "siniestros_abiertos": siniestros_abiertos,
        }
    finally:
        conn.close()


def alertas_seguros() -> list[dict]:
    init_seguros_db()
    conn = get_conn()
    try:
        hoy = datetime.now().strftime("%Y-%m-%d")
        en_30 = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        en_60 = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")

        alertas = []
        # Vencidas con estado vigente
        for r in conn.execute(
            "SELECT id, numero_poliza, aseguradora, descripcion, fecha_vencimiento"
            " FROM polizas WHERE estado = 'vigente' AND fecha_vencimiento < ?", (hoy,)
        ).fetchall():
            alertas.append({
                "severidad": "alta", "poliza_id": r["id"],
                "mensaje": f"Póliza {r['numero_poliza'] or '?'} ({r['aseguradora']}) VENCIDA el {r['fecha_vencimiento']}",
            })
        # Vencen en 30 días
        for r in conn.execute(
            "SELECT id, numero_poliza, aseguradora, descripcion, fecha_vencimiento"
            " FROM polizas WHERE estado = 'vigente' AND fecha_vencimiento >= ? AND fecha_vencimiento <= ?",
            (hoy, en_30),
        ).fetchall():
            alertas.append({
                "severidad": "media", "poliza_id": r["id"],
                "mensaje": f"Póliza {r['numero_poliza'] or '?'} ({r['aseguradora']}) vence el {r['fecha_vencimiento']}",
            })
        # Vencen en 60 días
        for r in conn.execute(
            "SELECT id, numero_poliza, aseguradora, descripcion, fecha_vencimiento"
            " FROM polizas WHERE estado = 'vigente' AND fecha_vencimiento > ? AND fecha_vencimiento <= ?",
            (en_30, en_60),
        ).fetchall():
            alertas.append({
                "severidad": "baja", "poliza_id": r["id"],
                "mensaje": f"Póliza {r['numero_poliza'] or '?'} ({r['aseguradora']}) vence el {r['fecha_vencimiento']}",
            })
        return alertas
    finally:
        conn.close()
