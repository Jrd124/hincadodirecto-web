"""Modulo Empleados: CRUD de empleados/operarios del ERP."""
from __future__ import annotations

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_empleados_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS empleados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                apellidos TEXT,
                dni TEXT UNIQUE,
                puesto TEXT,
                categoria TEXT,
                telefono TEXT,
                email TEXT,
                fecha_alta TEXT,
                fecha_baja TEXT,
                estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo','baja','vacaciones')),
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
    _initialized = True


# ── CRUD Empleados ──────────────────────────────────────────────────────────


def listar_empleados(solo_activos: bool = True) -> list:
    init_empleados_db()
    with _conectar() as conn:
        q = "SELECT * FROM empleados"
        if solo_activos:
            q += " WHERE estado = 'activo'"
        q += " ORDER BY apellidos, nombre"
        return [dict(r) for r in conn.execute(q).fetchall()]


def obtener_empleado(emp_id: int) -> dict | None:
    init_empleados_db()
    with _conectar() as conn:
        row = conn.execute("SELECT * FROM empleados WHERE id = ?", [emp_id]).fetchone()
        return dict(row) if row else None


def crear_empleado(data: dict) -> dict:
    init_empleados_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO empleados (nombre, apellidos, dni, puesto, categoria, "
            "telefono, email, fecha_alta, fecha_baja, estado, notas, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                data.get("nombre", ""),
                data.get("apellidos"),
                data.get("dni"),
                data.get("puesto"),
                data.get("categoria"),
                data.get("telefono"),
                data.get("email"),
                data.get("fecha_alta"),
                data.get("fecha_baja"),
                data.get("estado", "activo"),
                data.get("notas"),
                now,
                now,
            ],
        )
        return obtener_empleado(cur.lastrowid) or {"id": cur.lastrowid}


def actualizar_empleado(emp_id: int, data: dict) -> dict:
    init_empleados_db()
    now = _now()
    campos_permitidos = [
        "nombre", "apellidos", "dni", "puesto", "categoria",
        "telefono", "email", "fecha_alta", "fecha_baja", "estado", "notas",
    ]
    sets = []
    vals = []
    for c in campos_permitidos:
        if c in data:
            sets.append(f"{c} = ?")
            vals.append(data[c])
    if not sets:
        return obtener_empleado(emp_id) or {}
    sets.append("updated_at = ?")
    vals.append(now)
    vals.append(emp_id)
    with _conectar() as conn:
        conn.execute(f"UPDATE empleados SET {', '.join(sets)} WHERE id = ?", vals)
    return obtener_empleado(emp_id) or {}


def eliminar_empleado(emp_id: int) -> bool:
    """Baja logica: cambia estado a 'baja' y pone fecha_baja."""
    init_empleados_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "UPDATE empleados SET estado = 'baja', fecha_baja = ?, updated_at = ? WHERE id = ?",
            [now, now, emp_id],
        )
        return cur.rowcount > 0
