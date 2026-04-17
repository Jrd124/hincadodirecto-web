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
                estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo','baja','vacaciones','exempleado')),
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        # Migrar CHECK constraint: necesita incluir 'reserva' y 'exempleado'
        row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='empleados'").fetchone()
        if row and "'reserva'" not in (row[0] or ""):
            conn.execute("ALTER TABLE empleados RENAME TO _empleados_old")
            conn.execute("""
                CREATE TABLE empleados (
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
                    estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo','baja','vacaciones','reserva','exempleado')),
                    notas TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                )
            """)
            conn.execute("INSERT INTO empleados SELECT id,nombre,apellidos,dni,puesto,categoria,telefono,email,fecha_alta,fecha_baja,estado,notas,created_at,updated_at FROM _empleados_old")
            conn.execute("DROP TABLE _empleados_old")

        # Migración progresiva: añadir columnas nuevas si no existen
        existing = {r[1] for r in conn.execute("PRAGMA table_info(empleados)").fetchall()}
        for col_name, col_type in _EXTRA_COLUMNS:
            if col_name not in existing:
                conn.execute(f"ALTER TABLE empleados ADD COLUMN {col_name} {col_type}")

        # Columnas extra para nóminas y verificador
        if "fecha_antiguedad" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN fecha_antiguedad TEXT")
        if "neto_pactado" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN neto_pactado REAL DEFAULT 0")
        if "iban" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN iban TEXT")
        if "direccion" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN direccion TEXT")
        if "dias_vacaciones_anuales" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN dias_vacaciones_anuales INTEGER DEFAULT 22")
        if "fecha_nacimiento" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN fecha_nacimiento TEXT")
        if "fecha_baja_inicio" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN fecha_baja_inicio TEXT")
        if "fecha_baja_fin" not in existing:
            conn.execute("ALTER TABLE empleados ADD COLUMN fecha_baja_fin TEXT")

        # Normalizar puesto a operador/ayudante
        conn.execute("UPDATE empleados SET puesto = 'operador' WHERE LOWER(puesto) IN ('hincador','hincador, perforador','hincador/perforador','perforador')")
        conn.execute("UPDATE empleados SET puesto = 'ayudante' WHERE LOWER(puesto) = 'ayudante'")
        conn.execute("UPDATE empleados SET puesto = NULL WHERE puesto IN ('', 'None')")

        # ── Tablas de nóminas ──────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS nominas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                periodo TEXT NOT NULL,
                tipo TEXT NOT NULL,
                dias INTEGER DEFAULT 30,
                salario_base REAL DEFAULT 0,
                antiguedad_euros REAL DEFAULT 0,
                plus_asistencia REAL DEFAULT 0,
                extra_mes REAL DEFAULT 0,
                mejora_voluntaria REAL DEFAULT 0,
                a_cuenta_convenio REAL DEFAULT 0,
                dietas REAL DEFAULT 0,
                indemnizacion REAL DEFAULT 0,
                vacaciones_proporcionales REAL DEFAULT 0,
                cot_cc REAL DEFAULT 0,
                cot_mei REAL DEFAULT 0,
                cot_fp REAL DEFAULT 0,
                cot_desempleo REAL DEFAULT 0,
                irpf_porcentaje REAL DEFAULT 0,
                irpf_euros REAL DEFAULT 0,
                embargo REAL DEFAULT 0,
                rem_total REAL DEFAULT 0,
                base_ss REAL DEFAULT 0,
                total_devengado REAL DEFAULT 0,
                total_deducir REAL DEFAULT 0,
                liquido REAL DEFAULT 0,
                coste_empresa REAL DEFAULT 0,
                coste_dia REAL DEFAULT 0,
                ss_empresa REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id),
                UNIQUE(empleado_id, periodo, tipo)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_nominas_emp ON nominas(empleado_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_nominas_periodo ON nominas(periodo)")

        # ── Tablas futuras (Fase 2) ───────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS adelantos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                fecha TEXT NOT NULL,
                importe REAL NOT NULL,
                concepto TEXT,
                estado TEXT DEFAULT 'pendiente',
                nomina_descuento_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ausencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                tipo TEXT NOT NULL,
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT,
                dias INTEGER,
                motivo TEXT,
                estado TEXT DEFAULT 'aprobada',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dietas_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                subtipo TEXT NOT NULL,
                categoria TEXT,
                importe REAL NOT NULL,
                fecha_vigencia_desde TEXT NOT NULL,
                fecha_vigencia_hasta TEXT,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dietas_diarias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                fecha TEXT NOT NULL,
                tipo TEXT NOT NULL,
                importe REAL DEFAULT 0,
                proyecto_id INTEGER,
                notas TEXT,
                funcion TEXT DEFAULT 'operador',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id),
                FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
                UNIQUE(empleado_id, fecha)
            )
        """)
        # Migration: add funcion column if missing
        dd_cols = {r[1] for r in conn.execute("PRAGMA table_info(dietas_diarias)").fetchall()}
        if "funcion" not in dd_cols:
            conn.execute("ALTER TABLE dietas_diarias ADD COLUMN funcion TEXT DEFAULT 'operador'")

        # ── Tabla de vacaciones ───────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vacaciones_dias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                fecha TEXT NOT NULL,
                estado TEXT DEFAULT 'aprobada',
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id),
                UNIQUE(empleado_id, fecha)
            )
        """)

        # ── Tablas de horas extras ────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS horas_extras_dias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                fecha TEXT NOT NULL,
                horas REAL NOT NULL,
                precio_hora REAL NOT NULL,
                importe REAL NOT NULL,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (empleado_id) REFERENCES empleados(id),
                UNIQUE(empleado_id, fecha)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS horas_extras_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                precio_hora REAL NOT NULL,
                fecha_vigencia_desde TEXT,
                fecha_vigencia_hasta TEXT,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Seed initial config if empty
        if conn.execute("SELECT COUNT(*) FROM horas_extras_config").fetchone()[0] == 0:
            conn.execute("INSERT INTO horas_extras_config (precio_hora, fecha_vigencia_desde, notas) VALUES (15.0, '2026-01-01', 'Tarifa inicial')")

        # ── Tabla de cumpleaños enviados (bot) ────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bot_cumpleanos_enviados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                fecha_cumple TEXT NOT NULL,
                hito TEXT NOT NULL,
                fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(empleado_id, fecha_cumple, hito)
            )
        """)

        # ── Tabla de embargos mensuales ────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS embargos_mensuales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empleado_id INTEGER NOT NULL,
                periodo TEXT NOT NULL,
                importe REAL NOT NULL,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(empleado_id, periodo)
            )
        """)

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
    "formacion_especifica", "foto_url", "fecha_antiguedad",
    "neto_pactado", "iban", "direccion", "dias_vacaciones_anuales",
    "fecha_nacimiento", "fecha_baja_inicio", "fecha_baja_fin",
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
