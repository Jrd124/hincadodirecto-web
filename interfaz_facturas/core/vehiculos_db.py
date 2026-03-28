"""Modulo Vehiculos: CRUD de flota de vehiculos del ERP."""
from __future__ import annotations

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_vehiculos_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vehiculos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matricula TEXT NOT NULL UNIQUE,
                tipo TEXT DEFAULT 'pickup' CHECK(tipo IN ('pickup','furgoneta','camion','remolque','otro')),
                marca TEXT,
                modelo TEXT,
                bastidor TEXT,
                km_actual INTEGER DEFAULT 0,
                estado TEXT DEFAULT 'disponible' CHECK(estado IN ('disponible','en_proyecto','en_taller','baja')),
                fecha_itv TEXT,
                fecha_seguro TEXT,
                proyecto_id INTEGER REFERENCES proyectos(id),
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
    _initialized = True


# ── CRUD Vehiculos ──────────────────────────────────────────────────────────


def listar_vehiculos(solo_activos: bool = True) -> list:
    init_vehiculos_db()
    with _conectar() as conn:
        q = ("SELECT v.*, p.nombre AS proyecto_nombre FROM vehiculos v "
             "LEFT JOIN proyectos p ON p.id = v.proyecto_id")
        if solo_activos:
            q += " WHERE v.estado != 'baja'"
        q += " ORDER BY v.matricula"
        return [dict(r) for r in conn.execute(q).fetchall()]


def obtener_vehiculo(vid: int) -> dict | None:
    init_vehiculos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT v.*, p.nombre AS proyecto_nombre FROM vehiculos v "
            "LEFT JOIN proyectos p ON p.id = v.proyecto_id WHERE v.id = ?",
            [vid],
        ).fetchone()
        return dict(row) if row else None


def crear_vehiculo(data: dict) -> dict:
    init_vehiculos_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO vehiculos (matricula, tipo, marca, modelo, bastidor, "
            "km_actual, estado, fecha_itv, fecha_seguro, proyecto_id, notas, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                data.get("matricula", ""),
                data.get("tipo", "pickup"),
                data.get("marca"),
                data.get("modelo"),
                data.get("bastidor"),
                data.get("km_actual", 0),
                data.get("estado", "disponible"),
                data.get("fecha_itv"),
                data.get("fecha_seguro"),
                data.get("proyecto_id"),
                data.get("notas"),
                now,
                now,
            ],
        )
        return obtener_vehiculo(cur.lastrowid) or {"id": cur.lastrowid}


def actualizar_vehiculo(vid: int, data: dict) -> dict:
    init_vehiculos_db()
    now = _now()
    campos_permitidos = [
        "matricula", "tipo", "marca", "modelo", "bastidor",
        "km_actual", "estado", "fecha_itv", "fecha_seguro", "proyecto_id", "notas",
    ]
    sets = []
    vals = []
    for c in campos_permitidos:
        if c in data:
            sets.append(f"{c} = ?")
            vals.append(data[c])
    if not sets:
        return obtener_vehiculo(vid) or {}
    sets.append("updated_at = ?")
    vals.append(now)
    vals.append(vid)
    with _conectar() as conn:
        conn.execute(f"UPDATE vehiculos SET {', '.join(sets)} WHERE id = ?", vals)
    return obtener_vehiculo(vid) or {}


def eliminar_vehiculo(vid: int) -> bool:
    """Baja logica: cambia estado a 'baja'."""
    init_vehiculos_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "UPDATE vehiculos SET estado = 'baja', updated_at = ? WHERE id = ?",
            [now, vid],
        )
        return cur.rowcount > 0
