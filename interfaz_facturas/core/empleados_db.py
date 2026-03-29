"""Modulo Empleados: CRUD de empleados/operarios del ERP."""
from __future__ import annotations

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


# ── Columnas de formación / PRL que se añaden con ALTER TABLE ────────────
_EXTRA_COLUMNS = [
    ("nss", "TEXT"),                      # Nº Seguridad Social
    ("carnet_conducir", "TEXT"),           # Tipo: B, C, C+E, etc.
    ("carnet_conducir_caducidad", "TEXT"), # Fecha ISO
    ("carnet_maquinaria", "TEXT"),         # Tipos habilitados
    ("carnet_maquinaria_caducidad", "TEXT"),
    ("prl_basico", "INTEGER DEFAULT 0"),  # 1 = tiene curso PRL básico (20h/60h)
    ("prl_basico_horas", "INTEGER"),      # Horas del curso (20 o 60)
    ("prl_basico_caducidad", "TEXT"),
    ("prl_especifico", "TEXT"),           # Descripción del curso específico
    ("prl_especifico_caducidad", "TEXT"),
    ("apto_medico", "INTEGER DEFAULT 0"), # 1 = tiene apto médico vigente
    ("apto_medico_caducidad", "TEXT"),
    ("formacion_especifica", "TEXT"),      # Otros cursos / habilitaciones (texto libre)
    ("foto_url", "TEXT"),                 # Ruta o URL de foto del empleado
]


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
        # Migración progresiva: añadir columnas nuevas si no existen
        existing = {r[1] for r in conn.execute("PRAGMA table_info(empleados)").fetchall()}
        for col_name, col_type in _EXTRA_COLUMNS:
            if col_name not in existing:
                conn.execute(f"ALTER TABLE empleados ADD COLUMN {col_name} {col_type}")
    _initialized = True


# ── Campos permitidos en CREATE / UPDATE ─────────────────────────────────

_CAMPOS = [
    "nombre", "apellidos", "dni", "puesto", "categoria",
    "telefono", "email", "fecha_alta", "fecha_baja", "estado", "notas",
    # Formación y PRL
    "nss", "carnet_conducir", "carnet_conducir_caducidad",
    "carnet_maquinaria", "carnet_maquinaria_caducidad",
    "prl_basico", "prl_basico_horas", "prl_basico_caducidad",
    "prl_especifico", "prl_especifico_caducidad",
    "apto_medico", "apto_medico_caducidad",
    "formacion_especifica", "foto_url",
]


# ── CRUD Empleados ──────────────────────────────────────────────────────


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
    cols = ["created_at", "updated_at"]
    vals = [now, now]
    for c in _CAMPOS:
        if c in data:
            cols.append(c)
            vals.append(data[c])
    placeholders = ", ".join(["?"] * len(vals))
    col_names = ", ".join(cols)
    with _conectar() as conn:
        cur = conn.execute(
            f"INSERT INTO empleados ({col_names}) VALUES ({placeholders})", vals
        )
        return obtener_empleado(cur.lastrowid) or {"id": cur.lastrowid}


def actualizar_empleado(emp_id: int, data: dict) -> dict:
    init_empleados_db()
    now = _now()
    sets = []
    vals = []
    for c in _CAMPOS:
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
