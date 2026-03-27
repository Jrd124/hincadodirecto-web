"""Modulo Maquinaria: CRUD de maquinas, checks semanales, revisiones e incidencias."""
from __future__ import annotations

import json
from datetime import date

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_maquinaria_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                internal_id TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL,
                modelo TEXT DEFAULT 'ORTECO HD1000',
                numero_serie TEXT,
                horometro_actual REAL DEFAULT 0,
                horometro_inicial REAL DEFAULT 0,
                fecha_comision TEXT,
                estado TEXT DEFAULT 'disponible' CHECK(estado IN ('disponible','en_proyecto','en_taller','baja')),
                proyecto_id INTEGER REFERENCES proyectos(id),
                ubicacion TEXT,
                notas TEXT,
                foto_url TEXT,
                activa INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_checklist_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL CHECK(tipo IN ('semanal','100h','250h','500h','1000h','2000h')),
                orden INTEGER DEFAULT 0,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                requiere_taller INTEGER DEFAULT 0,
                activo INTEGER DEFAULT 1
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                usuario_id INTEGER REFERENCES usuarios(id),
                fecha TEXT NOT NULL,
                horometro REAL,
                checklist TEXT,
                observaciones TEXT,
                estado TEXT DEFAULT 'abierto' CHECK(estado IN ('abierto','cerrado','enmendado')),
                cerrado_at TEXT,
                enmienda_de_id INTEGER REFERENCES maquinaria_checks(id),
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_checks_maq ON maquinaria_checks(maquina_id)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_revisiones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL CHECK(tipo IN ('100h','250h','500h','1000h','2000h')),
                usuario_id INTEGER REFERENCES usuarios(id),
                fecha TEXT NOT NULL,
                horometro_al_revision REAL,
                tipo_ejecucion TEXT DEFAULT 'interno' CHECK(tipo_ejecucion IN ('interno','taller')),
                coste REAL DEFAULT 0,
                checklist TEXT,
                observaciones TEXT,
                estado TEXT DEFAULT 'abierto' CHECK(estado IN ('abierto','cerrado')),
                cerrado_at TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_rev_maq ON maquinaria_revisiones(maquina_id)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_incidencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                check_id INTEGER REFERENCES maquinaria_checks(id),
                revision_id INTEGER REFERENCES maquinaria_revisiones(id),
                usuario_id INTEGER REFERENCES usuarios(id),
                fecha TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                severidad TEXT DEFAULT 'media' CHECK(severidad IN ('baja','media','alta','seguridad')),
                estado TEXT DEFAULT 'abierta' CHECK(estado IN ('abierta','en_curso','cerrada')),
                resolucion TEXT,
                cerrada_at TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_maq ON maquinaria_incidencias(maquina_id)")
        _seed_maquinas(conn)
        _seed_checklist_templates(conn)
    _initialized = True


# ── Seed data ────────────────────────────────────────────────────────────────


def _seed_maquinas(conn):
    if conn.execute("SELECT COUNT(*) FROM maquinas").fetchone()[0] > 0:
        return
    now = _now()
    maquinas = [
        ("HD1000-01", "Nicoletta", "ORTECO HD1000", 6086, 6086, "2019-01-01"),
        ("HD1000-02", "Antonella", "ORTECO HD1000", 4534, 4534, "2020-01-01"),
        ("HD1000-03", "Enmanuela", "ORTECO HD1000", 5389, 5389, "2020-01-01"),
        ("HD1000-04", "Lauretta", "ORTECO HD1000", 4483, 4483, "2021-01-01"),
        ("HD1000-05", "Marietta", "ORTECO HD1000", 4450, 4450, "2021-01-01"),
        ("HD1000-06", "Carmela", "ORTECO HD1000", 1671, 1671, "2023-01-01"),
        ("HD1000-07", "Nieves", "ORTECO HD1000", 423, 423, "2024-01-01"),
    ]
    for m in maquinas:
        conn.execute(
            "INSERT INTO maquinas (internal_id, nombre, modelo, horometro_actual, horometro_inicial, fecha_comision, estado, activa, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'disponible', 1, ?)",
            [m[0], m[1], m[2], m[3], m[4], m[5], now],
        )


def _seed_checklist_templates(conn):
    if conn.execute("SELECT COUNT(*) FROM maquinaria_checklist_templates").fetchone()[0] > 0:
        return
    items = [
        # Semanal
        ("semanal", 1, "Nivel aceite hidraulico", "Verificar nivel y rellenar si necesario", 0),
        ("semanal", 2, "Nivel aceite reductores", "Verificar nivel en ambos reductores", 0),
        ("semanal", 3, "Tornilleria", "Revisar apriete de tornilleria general", 0),
        ("semanal", 4, "Filtro aire", "Limpiar o sustituir filtro de aire", 0),
        ("semanal", 5, "Tension orugas", "Verificar tension de las orugas", 0),
        ("semanal", 6, "Limpieza general", "Limpieza general de la maquina", 0),
        # 100h
        ("100h", 1, "Reductores", "Revision de reductores cada 100h", 0),
        ("100h", 2, "Cadena", "Revision de cadena cada 100h", 0),
        ("100h", 3, "Patin", "Revision del patin cada 100h", 0),
        ("100h", 4, "Columna", "Revision de la columna cada 100h", 0),
        ("100h", 5, "Barrena", "Revision de la barrena cada 100h", 0),
        ("100h", 6, "Sacamuestras", "Revision del sacamuestras cada 100h", 0),
        ("100h", 7, "Perforador", "Revision del perforador cada 100h", 0),
        # 250h
        ("250h", 1, "Orugas", "Revision de orugas cada 250h", 0),
        ("250h", 2, "Membrana acumulador", "Revision membrana acumulador — REQUIERE TALLER", 1),
        ("250h", 3, "Tirantes/pernos", "Revision tirantes y pernos — REQUIERE TALLER", 1),
        # 500h
        ("500h", 1, "Deposito hidraulico", "Revision deposito hidraulico cada 500h", 0),
        ("500h", 2, "Pinza extraccion", "Revision pinza de extraccion cada 500h", 0),
        ("500h", 3, "Levantador guardarrailes", "Revision levantador guardarrailes cada 500h", 0),
        # 1000h
        ("1000h", 1, "Reductor aceite", "Cambio aceite reductor cada 1000h", 0),
        ("1000h", 2, "Filtros envio", "Cambio filtros de envio cada 1000h", 0),
        ("1000h", 3, "Filtros descarga", "Cambio filtros de descarga cada 1000h", 0),
        ("1000h", 4, "Barrena/perforador aceite", "Cambio aceite barrena/perforador cada 1000h", 0),
        ("1000h", 5, "Cadena", "Revision cadena cada 1000h — REQUIERE TALLER", 1),
        ("1000h", 6, "Revision general 1000h", "Revision general completa cada 1000h", 0),
        # 2000h
        ("2000h", 1, "Deposito hidraulico sustitucion", "Sustitucion deposito hidraulico — REQUIERE TALLER", 1),
    ]
    for item in items:
        conn.execute(
            "INSERT INTO maquinaria_checklist_templates (tipo, orden, nombre, descripcion, requiere_taller) "
            "VALUES (?, ?, ?, ?, ?)",
            item,
        )


# ── CRUD Maquinas ────────────────────────────────────────────────────────────


def listar_maquinas(solo_activas: bool = True) -> list:
    init_maquinaria_db()
    with _conectar() as conn:
        q = ("SELECT m.*, p.nombre AS proyecto_nombre FROM maquinas m "
             "LEFT JOIN proyectos p ON p.id = m.proyecto_id")
        if solo_activas:
            q += " WHERE m.activa = 1"
        q += " ORDER BY m.nombre"
        return [dict(r) for r in conn.execute(q).fetchall()]


def obtener_maquina(maq_id: int) -> dict | None:
    init_maquinaria_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT m.*, p.nombre AS proyecto_nombre FROM maquinas m "
            "LEFT JOIN proyectos p ON p.id = m.proyecto_id WHERE m.id = ?",
            [maq_id],
        ).fetchone()
        if not row:
            return None
        maq = dict(row)

        maq["checks"] = [dict(r) for r in conn.execute(
            "SELECT mc.*, u.nombre AS usuario_nombre FROM maquinaria_checks mc "
            "LEFT JOIN usuarios u ON u.id = mc.usuario_id "
            "WHERE mc.maquina_id = ? ORDER BY mc.fecha DESC LIMIT 10",
            [maq_id],
        ).fetchall()]

        maq["revisiones"] = [dict(r) for r in conn.execute(
            "SELECT mr.*, u.nombre AS usuario_nombre FROM maquinaria_revisiones mr "
            "LEFT JOIN usuarios u ON u.id = mr.usuario_id "
            "WHERE mr.maquina_id = ? ORDER BY mr.fecha DESC LIMIT 10",
            [maq_id],
        ).fetchall()]

        maq["incidencias"] = [dict(r) for r in conn.execute(
            "SELECT mi.*, u.nombre AS usuario_nombre FROM maquinaria_incidencias mi "
            "LEFT JOIN usuarios u ON u.id = mi.usuario_id "
            "WHERE mi.maquina_id = ? AND mi.estado != 'cerrada' "
            "ORDER BY mi.severidad DESC, mi.fecha DESC",
            [maq_id],
        ).fetchall()]

        maq["revisiones_pendientes"] = _calcular_revisiones_pendientes(
            conn, maq_id, maq["horometro_actual"],
        )
        return maq


def crear_maquina(data: dict) -> dict:
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinas (internal_id, nombre, modelo, numero_serie, "
            "horometro_actual, horometro_inicial, fecha_comision, estado, ubicacion, notas, activa, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            [data.get("internal_id", ""), data.get("nombre", ""), data.get("modelo", "ORTECO HD1000"),
             data.get("numero_serie"), data.get("horometro_actual", 0), data.get("horometro_inicial", 0),
             data.get("fecha_comision"), data.get("estado", "disponible"),
             data.get("ubicacion"), data.get("notas"), _now()],
        )
        mid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinas WHERE id = ?", [mid]).fetchone())


def actualizar_maquina(maq_id: int, data: dict) -> dict:
    init_maquinaria_db()
    with _conectar() as conn:
        campos = []
        valores = []
        for k in ("nombre", "modelo", "numero_serie", "horometro_actual", "estado",
                   "proyecto_id", "ubicacion", "notas"):
            if k in data:
                campos.append(f"{k} = ?")
                valores.append(data[k])
        if campos:
            campos.append("updated_at = ?")
            valores.append(_now())
            valores.append(maq_id)
            conn.execute(f"UPDATE maquinas SET {', '.join(campos)} WHERE id = ?", valores)
        return dict(conn.execute("SELECT * FROM maquinas WHERE id = ?", [maq_id]).fetchone())


# ── Motor de reglas de revisiones ────────────────────────────────────────────


def _calcular_revisiones_pendientes(conn, maquina_id: int, horometro_actual: float) -> list:
    intervalos = {"100h": 100, "250h": 250, "500h": 500, "1000h": 1000, "2000h": 2000}
    pendientes = []
    for tipo, intervalo in intervalos.items():
        ultima = conn.execute(
            "SELECT horometro_al_revision FROM maquinaria_revisiones "
            "WHERE maquina_id = ? AND tipo = ? AND estado = 'cerrado' "
            "ORDER BY horometro_al_revision DESC LIMIT 1",
            [maquina_id, tipo],
        ).fetchone()
        ultimo_h = ultima["horometro_al_revision"] if ultima else 0
        horas_desde = horometro_actual - ultimo_h
        if horas_desde >= intervalo:
            veces = int(horas_desde / intervalo)
            pendientes.append({
                "tipo": tipo,
                "intervalo": intervalo,
                "ultimo_horometro": ultimo_h,
                "horas_desde_ultima": round(horas_desde, 1),
                "veces_pendiente": veces,
                "urgente": veces > 1,
            })
    return pendientes


# ── Checklist templates ──────────────────────────────────────────────────────


def obtener_templates_checklist(tipo: str) -> list:
    init_maquinaria_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_checklist_templates WHERE tipo = ? AND activo = 1 ORDER BY orden",
            [tipo],
        ).fetchall()]


# ── Checks semanales ─────────────────────────────────────────────────────────


def crear_check_semanal(data: dict) -> dict:
    init_maquinaria_db()
    templates = obtener_templates_checklist("semanal")
    checklist = data.get("checklist") or {str(t["id"]): {"ok": False, "nota": ""} for t in templates}

    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_checks (maquina_id, usuario_id, fecha, horometro, "
            "checklist, observaciones, estado, created_at) VALUES (?, ?, ?, ?, ?, ?, 'abierto', ?)",
            [data["maquina_id"], data.get("usuario_id"),
             data.get("fecha", date.today().isoformat()),
             data.get("horometro", 0), json.dumps(checklist),
             data.get("observaciones", ""), _now()],
        )
        cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if data.get("horometro"):
            conn.execute(
                "UPDATE maquinas SET horometro_actual = ?, updated_at = ? "
                "WHERE id = ? AND horometro_actual < ?",
                [data["horometro"], _now(), data["maquina_id"], data["horometro"]],
            )
        return dict(conn.execute("SELECT * FROM maquinaria_checks WHERE id = ?", [cid]).fetchone())


def cerrar_check(check_id: int) -> dict:
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "UPDATE maquinaria_checks SET estado = 'cerrado', cerrado_at = ? WHERE id = ?",
            [_now(), check_id],
        )
        return dict(conn.execute("SELECT * FROM maquinaria_checks WHERE id = ?", [check_id]).fetchone())


# ── Incidencias ──────────────────────────────────────────────────────────────


def crear_incidencia(data: dict) -> dict:
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_incidencias (maquina_id, check_id, revision_id, usuario_id, "
            "fecha, descripcion, severidad, estado, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'abierta', ?)",
            [data["maquina_id"], data.get("check_id"), data.get("revision_id"),
             data.get("usuario_id"), data.get("fecha", date.today().isoformat()),
             data["descripcion"], data.get("severidad", "media"), _now()],
        )
        iid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_incidencias WHERE id = ?", [iid]).fetchone())


def actualizar_incidencia(inc_id: int, data: dict) -> dict:
    init_maquinaria_db()
    with _conectar() as conn:
        if data.get("estado") == "cerrada":
            conn.execute(
                "UPDATE maquinaria_incidencias SET estado = 'cerrada', resolucion = ?, cerrada_at = ? WHERE id = ?",
                [data.get("resolucion", ""), _now(), inc_id],
            )
        else:
            conn.execute(
                "UPDATE maquinaria_incidencias SET estado = ?, descripcion = ?, severidad = ? WHERE id = ?",
                [data.get("estado", "abierta"), data.get("descripcion", ""),
                 data.get("severidad", "media"), inc_id],
            )
        return dict(conn.execute("SELECT * FROM maquinaria_incidencias WHERE id = ?", [inc_id]).fetchone())
