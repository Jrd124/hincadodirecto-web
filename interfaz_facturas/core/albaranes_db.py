# -*- coding: utf-8 -*-
"""Tabla y CRUD para albaranes de compra."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from core.db import conectar, get_conn


_initialized = False


def init_albaranes_db():
    global _initialized
    if _initialized:
        return
    with conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS albaranes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_albaran TEXT NOT NULL,
                fecha TEXT NOT NULL,
                proveedor TEXT,
                tercero_id INTEGER,
                importe REAL NOT NULL DEFAULT 0,
                iva REAL DEFAULT 0,
                total REAL NOT NULL DEFAULT 0,
                metodo_pago TEXT DEFAULT 'pendiente'
                    CHECK(metodo_pago IN ('tarjeta','transferencia','efectivo','pendiente')),
                tarjeta_id INTEGER,
                tarjeta_persona TEXT,
                proyecto_id INTEGER,
                factura_id INTEGER,
                estado TEXT DEFAULT 'pendiente'
                    CHECK(estado IN ('pendiente','facturado','anulado')),
                imagen_archivo TEXT,
                notas TEXT,
                registrado_por TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_albaranes_proveedor ON albaranes(proveedor)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_albaranes_estado ON albaranes(estado)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_albaranes_factura ON albaranes(factura_id)")
    _initialized = True


def _now():
    return datetime.now().isoformat()


def crear_albaran(data: dict) -> dict:
    init_albaranes_db()
    ahora = _now()
    with conectar() as conn:
        cur = conn.execute("""
            INSERT INTO albaranes (numero_albaran, fecha, proveedor, tercero_id,
                importe, iva, total, metodo_pago, tarjeta_id, tarjeta_persona,
                proyecto_id, imagen_archivo, notas, registrado_por, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            (data.get("numero_albaran") or "").strip(),
            (data.get("fecha") or ahora[:10]).strip(),
            (data.get("proveedor") or "").strip(),
            data.get("tercero_id"),
            float(data.get("importe") or 0),
            float(data.get("iva") or 0),
            float(data.get("total") or 0),
            data.get("metodo_pago") or "pendiente",
            data.get("tarjeta_id"),
            (data.get("tarjeta_persona") or "").strip() or None,
            data.get("proyecto_id"),
            (data.get("imagen_archivo") or "").strip() or None,
            (data.get("notas") or "").strip() or None,
            (data.get("registrado_por") or "").strip() or None,
            ahora, ahora,
        ))
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM albaranes WHERE id = ?", (new_id,)).fetchone()
        return dict(row)


def listar_albaranes(
    proveedor: str | None = None,
    estado: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    proyecto_id: int | None = None,
    factura_id: int | None = None,
    limit: int = 500,
) -> list[dict]:
    init_albaranes_db()
    conn = get_conn()
    try:
        where = ["1=1"]
        params: list[Any] = []
        if proveedor:
            where.append("proveedor LIKE ?")
            params.append(f"%{proveedor}%")
        if estado:
            where.append("estado = ?")
            params.append(estado)
        if fecha_desde:
            where.append("fecha >= ?")
            params.append(fecha_desde)
        if fecha_hasta:
            where.append("fecha <= ?")
            params.append(fecha_hasta)
        if proyecto_id is not None:
            where.append("proyecto_id = ?")
            params.append(proyecto_id)
        if factura_id is not None:
            where.append("factura_id = ?")
            params.append(factura_id)
        params.append(limit)
        rows = conn.execute(
            f"SELECT a.*, p.nombre as proyecto_nombre FROM albaranes a"
            f" LEFT JOIN proyectos p ON a.proyecto_id = p.id"
            f" WHERE {' AND '.join(where)}"
            f" ORDER BY a.fecha DESC, a.id DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def obtener_albaran(albaran_id: int) -> dict | None:
    init_albaranes_db()
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM albaranes WHERE id = ?", (albaran_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def actualizar_albaran(albaran_id: int, data: dict) -> dict | None:
    init_albaranes_db()
    campos = [
        "numero_albaran", "fecha", "proveedor", "tercero_id", "importe", "iva", "total",
        "metodo_pago", "tarjeta_id", "tarjeta_persona", "proyecto_id", "imagen_archivo",
        "notas", "estado",
    ]
    sets = []
    params: list[Any] = []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            params.append(data[c])
    if not sets:
        return obtener_albaran(albaran_id)
    sets.append("updated_at = ?")
    params.append(_now())
    params.append(albaran_id)
    with conectar() as conn:
        conn.execute(f"UPDATE albaranes SET {', '.join(sets)} WHERE id = ?", params)
        row = conn.execute("SELECT * FROM albaranes WHERE id = ?", (albaran_id,)).fetchone()
        return dict(row) if row else None


def eliminar_albaran(albaran_id: int) -> bool:
    init_albaranes_db()
    with conectar() as conn:
        cur = conn.execute("DELETE FROM albaranes WHERE id = ?", (albaran_id,))
        return cur.rowcount > 0


def vincular_a_factura(albaran_ids: list[int], factura_id: int) -> int:
    """Vincula albaranes a una factura y los marca como facturado. Returns count."""
    init_albaranes_db()
    ahora = _now()
    with conectar() as conn:
        placeholders = ",".join("?" for _ in albaran_ids)
        params = [factura_id, ahora] + albaran_ids
        cur = conn.execute(
            f"UPDATE albaranes SET factura_id = ?, estado = 'facturado', updated_at = ?"
            f" WHERE id IN ({placeholders})",
            params,
        )
        return cur.rowcount


def desvincular_de_factura(factura_id: int) -> int:
    """Desvincula todos los albaranes de una factura."""
    init_albaranes_db()
    with conectar() as conn:
        cur = conn.execute(
            "UPDATE albaranes SET factura_id = NULL, estado = 'pendiente', updated_at = ? WHERE factura_id = ?",
            (_now(), factura_id),
        )
        return cur.rowcount


def albaranes_sin_factura(proveedor: str | None = None) -> list[dict]:
    """Lista albaranes pendientes (sin factura) de un proveedor."""
    init_albaranes_db()
    conn = get_conn()
    try:
        if proveedor:
            rows = conn.execute(
                "SELECT * FROM albaranes WHERE estado = 'pendiente' AND factura_id IS NULL"
                " AND proveedor LIKE ? ORDER BY fecha DESC",
                (f"%{proveedor}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM albaranes WHERE estado = 'pendiente' AND factura_id IS NULL"
                " ORDER BY fecha DESC",
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
