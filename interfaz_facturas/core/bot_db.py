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
