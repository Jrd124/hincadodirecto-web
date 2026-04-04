# -*- coding: utf-8 -*-
"""Tablas y helpers para el bot de Telegram."""
from __future__ import annotations

import json
import os
from datetime import datetime

from core.db import conectar, get_conn


def init_bot_db():
    """Crea las tablas del bot si no existen y seedea el superadmin."""
    with conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bot_telegram_usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                rol TEXT DEFAULT 'pendiente'
                    CHECK(rol IN ('superadmin','operario','pendiente','bloqueado')),
                empleado_id INTEGER,
                activo INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bot_telegram_estado (
                telegram_id INTEGER PRIMARY KEY,
                estado TEXT,
                datos TEXT,
                updated_at TEXT
            )
        """)

        # Seed superadmins from env
        ids_str = os.getenv("TELEGRAM_SUPERADMIN_IDS", "")
        for tid_str in ids_str.split(","):
            tid_str = tid_str.strip()
            if not tid_str:
                continue
            tid = int(tid_str)
            existing = conn.execute(
                "SELECT id FROM bot_telegram_usuarios WHERE telegram_id = ?", (tid,)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO bot_telegram_usuarios (telegram_id, nombre, rol, created_at)"
                    " VALUES (?, ?, 'superadmin', ?)",
                    (tid, "Admin", datetime.now().isoformat()),
                )

        # Ensure conciliacion_multiple table exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conciliacion_multiple (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movimiento_id INTEGER NOT NULL,
                movimiento_fecha TEXT,
                movimiento_importe REAL,
                factura_cliente_id INTEGER NOT NULL,
                importe_aplicado REAL NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        # Migrate: fix swapped columns in conciliacion_multiple
        # Some records may have factura_cliente_id and importe_aplicado swapped
        # Detect: if factura_cliente_id > 1000 and importe_aplicado < 1000, likely swapped
        try:
            swapped = conn.execute("""
                SELECT cm.id, cm.factura_cliente_id, cm.importe_aplicado
                FROM conciliacion_multiple cm
                WHERE cm.factura_cliente_id > 1000
                  AND cm.importe_aplicado < 1000
                  AND NOT EXISTS (SELECT 1 FROM facturas_cliente fc WHERE fc.id = cm.factura_cliente_id)
            """).fetchall()
            for r in swapped:
                old_fid = r["factura_cliente_id"]
                old_imp = r["importe_aplicado"]
                conn.execute(
                    "UPDATE conciliacion_multiple SET factura_cliente_id = CAST(? AS INTEGER), importe_aplicado = ? WHERE id = ?",
                    (int(old_imp), float(old_fid), r["id"]),
                )
        except Exception:
            pass

        # Migrate: mark movements with MULTI that have conciliacion_multiple records
        try:
            mov_ids = [r["movimiento_id"] for r in conn.execute(
                "SELECT DISTINCT movimiento_id FROM conciliacion_multiple"
            ).fetchall()]
            if mov_ids:
                import sqlite3 as _sq
                from config import MOVIMIENTOS_DB
                conn_b = _sq.connect(str(MOVIMIENTOS_DB))
                for mid in mov_ids:
                    conn_b.execute(
                        "UPDATE movimientos SET factura_cliente_key = 'MULTI', factura_cliente_id = -1"
                        " WHERE id = ? AND (factura_cliente_key IS NULL OR factura_cliente_key != 'MULTI')",
                        (mid,),
                    )
                conn_b.commit()
                conn_b.close()
        except Exception:
            pass

        # Migrate proyecto_partes: add firma columns
        cols = [r[1] for r in conn.execute("PRAGMA table_info(proyecto_partes)").fetchall()]
        for col, typedef in [
            ("estado_firma", "TEXT DEFAULT 'borrador'"),
            ("imagen_firmado", "TEXT"),
            ("fecha_firma", "TEXT"),
            ("diferencias_firma", "TEXT"),
        ]:
            if col not in cols:
                conn.execute(f"ALTER TABLE proyecto_partes ADD COLUMN {col} {typedef}")

        # Migrate bot_telegram_usuarios: add tarjeta fields
        bot_cols = [r[1] for r in conn.execute("PRAGMA table_info(bot_telegram_usuarios)").fetchall()]
        for col, typedef in [
            ("tarjeta_id", "INTEGER"),
            ("tarjeta_alias", "TEXT"),
        ]:
            if col not in bot_cols:
                conn.execute(f"ALTER TABLE bot_telegram_usuarios ADD COLUMN {col} {typedef}")


# ── CRUD helpers ──────────────────────────────────────────────────────────

def get_usuario(telegram_id: int) -> dict | None:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM bot_telegram_usuarios WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def registrar_usuario(telegram_id: int, nombre: str) -> dict:
    with conectar() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO bot_telegram_usuarios (telegram_id, nombre, rol, created_at)"
            " VALUES (?, ?, 'pendiente', ?)",
            (telegram_id, nombre, datetime.now().isoformat()),
        )
        row = conn.execute(
            "SELECT * FROM bot_telegram_usuarios WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        return dict(row)


def aprobar_usuario(telegram_id: int, rol: str = "operario"):
    with conectar() as conn:
        conn.execute(
            "UPDATE bot_telegram_usuarios SET rol = ? WHERE telegram_id = ?",
            (rol, telegram_id),
        )


def listar_usuarios(rol: str | None = None) -> list[dict]:
    conn = get_conn()
    try:
        if rol:
            rows = conn.execute(
                "SELECT * FROM bot_telegram_usuarios WHERE rol = ? ORDER BY created_at", (rol,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM bot_telegram_usuarios ORDER BY rol, created_at"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def listar_superadmins() -> list[int]:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT telegram_id FROM bot_telegram_usuarios WHERE rol = 'superadmin'"
        ).fetchall()
        return [r["telegram_id"] for r in rows]
    finally:
        conn.close()


def get_estado(telegram_id: int) -> dict | None:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM bot_telegram_estado WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("datos"):
            d["datos"] = json.loads(d["datos"])
        return d
    finally:
        conn.close()


def set_estado(telegram_id: int, estado: str, datos: dict | None = None):
    with conectar() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO bot_telegram_estado (telegram_id, estado, datos, updated_at)"
            " VALUES (?, ?, ?, ?)",
            (telegram_id, estado, json.dumps(datos or {}, ensure_ascii=False),
             datetime.now().isoformat()),
        )


def clear_estado(telegram_id: int):
    with conectar() as conn:
        conn.execute("DELETE FROM bot_telegram_estado WHERE telegram_id = ?", (telegram_id,))


def asignar_tarjeta(telegram_id: int, tarjeta_id: int | None, tarjeta_alias: str = ""):
    with conectar() as conn:
        conn.execute(
            "UPDATE bot_telegram_usuarios SET tarjeta_id = ?, tarjeta_alias = ? WHERE telegram_id = ?",
            (tarjeta_id, tarjeta_alias or "", telegram_id),
        )


def guardar_factura_proveedor(datos: dict) -> int:
    """Save a supplier invoice from bot OCR data. Returns the new factura id."""
    from core.facturas_db import init_facturas_db, insert_facturas
    init_facturas_db()
    fila = {
        "empresa_id": datos.get("empresa_id", "hincado_directo"),
        "fecha_factura": datos.get("fecha_factura", ""),
        "proveedor": datos.get("proveedor", ""),
        "nif_proveedor": datos.get("cif_proveedor", ""),
        "resumen_concepto": datos.get("concepto", ""),
        "numero_factura": datos.get("numero_factura", ""),
        "base_imponible": str(datos.get("base_imponible", "")),
        "iva": str(datos.get("iva_importe", "")),
        "total_a_pagar": str(datos.get("total_a_pagar", "")),
        "total": str(datos.get("total_a_pagar", "")),
        "ruta_archivo": datos.get("imagen_archivo", ""),
        "estado_pago": datos.get("estado_pago", "pendiente"),
        "tarjeta_id": datos.get("tarjeta_id"),
        "comentarios_revision": datos.get("comentarios", ""),
    }
    result = insert_facturas(fila["empresa_id"], [fila])
    return result["ids"][0] if result["ids"] else 0


def guardar_factura_cliente(datos: dict) -> int:
    """Save a client invoice from bot OCR data. Returns the new factura id."""
    from core.facturas_cliente_db import init_facturas_cliente_db
    init_facturas_cliente_db()
    with conectar() as conn:
        cur = conn.execute(
            "INSERT INTO facturas_cliente (empresa_id, fecha_factura, cliente, cif_nif,"
            " iva, total_a_pagar, numero_factura, ruta_archivo, estado_cobro)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')",
            (
                datos.get("empresa_id", "hincado_directo"),
                datos.get("fecha_factura", ""),
                datos.get("cliente", ""),
                datos.get("cif_cliente", ""),
                str(datos.get("iva_importe", "")),
                str(datos.get("total_a_pagar", "")),
                datos.get("numero_factura", ""),
                datos.get("imagen_archivo", ""),
            ),
        )
        return cur.lastrowid
