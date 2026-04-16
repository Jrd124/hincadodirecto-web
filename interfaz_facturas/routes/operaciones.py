"""
Operaciones — Planificador de recursos (cuadrante Gantt).
Blueprint: /api/operaciones/*
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, date, timedelta
from core.db import get_conn

operaciones_bp = Blueprint("operaciones", __name__)

_tables_ok = False


@operaciones_bp.before_request
def _ensure_tables():
    global _tables_ok
    if _tables_ok:
        return
    c = get_conn()
    try:
        c.execute("""CREATE TABLE IF NOT EXISTS proyecto_asignaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL,
            recurso_tipo TEXT NOT NULL CHECK(recurso_tipo IN ('empleado','maquina','vehiculo')),
            recurso_id INTEGER NOT NULL,
            recurso_nombre TEXT NOT NULL,
            fecha TEXT NOT NULL,
            estado TEXT DEFAULT 'planificado' CHECK(estado IN ('planificado','confirmado','incidencia','cancelado','averia')),
            notas TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(recurso_tipo, recurso_id, fecha)
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_asig_proy ON proyecto_asignaciones(proyecto_id)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_asig_fecha ON proyecto_asignaciones(fecha)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_asig_recurso ON proyecto_asignaciones(recurso_tipo, recurso_id)")

        # Migrar CHECK constraint si la tabla ya existía sin 'averia'
        row = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='proyecto_asignaciones'").fetchone()
        if row and "'averia'" not in (row[0] or ""):
            c.execute("ALTER TABLE proyecto_asignaciones RENAME TO _asig_old")
            c.execute("""CREATE TABLE proyecto_asignaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL,
                recurso_tipo TEXT NOT NULL CHECK(recurso_tipo IN ('empleado','maquina','vehiculo')),
                recurso_id INTEGER NOT NULL,
                recurso_nombre TEXT NOT NULL,
                fecha TEXT NOT NULL,
                estado TEXT DEFAULT 'planificado' CHECK(estado IN ('planificado','confirmado','incidencia','cancelado','averia')),
                notas TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(recurso_tipo, recurso_id, fecha)
            )""")
            c.execute("INSERT INTO proyecto_asignaciones SELECT * FROM _asig_old")
            c.execute("DROP TABLE _asig_old")
            c.execute("CREATE INDEX IF NOT EXISTS ix_asig_proy ON proyecto_asignaciones(proyecto_id)")
            c.execute("CREATE INDEX IF NOT EXISTS ix_asig_fecha ON proyecto_asignaciones(fecha)")
            c.execute("CREATE INDEX IF NOT EXISTS ix_asig_recurso ON proyecto_asignaciones(recurso_tipo, recurso_id)")

        # Add funcion_dia column if missing
        asig_cols = {r[1] for r in c.execute("PRAGMA table_info(proyecto_asignaciones)").fetchall()}
        if "funcion_dia" not in asig_cols:
            c.execute("ALTER TABLE proyecto_asignaciones ADD COLUMN funcion_dia TEXT DEFAULT NULL")

        c.commit()
        _tables_ok = True
    finally:
        c.close()


def _conn():
    return get_conn()


def _dias_mes(anio, mes):
    """Genera lista de dicts {fecha, dia_semana, num, laborable, es_hoy} para un mes."""
    DIAS_ES = ["L", "M", "X", "J", "V", "S", "D"]
    hoy = date.today().isoformat()
    d = date(anio, mes, 1)
    dias = []
    while d.month == mes:
        dias.append({
            "fecha": d.isoformat(),
            "dia_semana": DIAS_ES[d.weekday()],
            "num": d.day,
            "laborable": d.weekday() < 5,
            "es_hoy": d.isoformat() == hoy,
        })
        d += timedelta(days=1)
    return dias


@operaciones_bp.get("/api/operaciones/cuadrante")
def cuadrante():
    mes_str = request.args.get("mes", date.today().strftime("%Y-%m"))
    try:
        anio, mes = int(mes_str[:4]), int(mes_str[5:7])
    except (ValueError, IndexError):
        return jsonify({"error": "mes inválido, usar YYYY-MM"}), 400

    dias = _dias_mes(anio, mes)
    fecha_ini = dias[0]["fecha"]
    fecha_fin = dias[-1]["fecha"]

    conn = _conn()
    try:
        # Empleados activos
        empleados = [dict(r) for r in conn.execute(
            "SELECT id, nombre, apellidos, puesto, estado FROM empleados WHERE estado = 'activo' ORDER BY nombre"
        ).fetchall()]

        # Máquinas activas
        maquinas = [dict(r) for r in conn.execute(
            "SELECT id, nombre, modelo, estado FROM maquinas WHERE activa = 1 ORDER BY nombre"
        ).fetchall()]

        # Proyectos activos (para paleta de colores y asignación)
        proyectos = [dict(r) for r in conn.execute(
            "SELECT id, nombre, codigo, estado FROM proyectos WHERE estado IN ('vivo','en_curso') ORDER BY nombre"
        ).fetchall()]
        # Generar abreviatura y color_idx
        for i, p in enumerate(proyectos):
            nombre = p["nombre"] or ""
            # Tomar primeras 3 letras de la última palabra significativa
            partes = [w for w in nombre.split() if len(w) > 2]
            p["abreviatura"] = (partes[-1][:3].upper() if partes else nombre[:3].upper())
            p["color_idx"] = i % 10

        # Asignaciones del mes
        rows = conn.execute(
            "SELECT recurso_tipo, recurso_id, fecha, proyecto_id, estado, notas "
            "FROM proyecto_asignaciones WHERE fecha >= ? AND fecha <= ? "
            "ORDER BY fecha",
            (fecha_ini, fecha_fin),
        ).fetchall()

        asignaciones = {}
        for r in rows:
            key = f"{r['recurso_tipo']}_{r['recurso_id']}"
            if key not in asignaciones:
                asignaciones[key] = {}
            asignaciones[key][r["fecha"]] = {
                "proyecto_id": r["proyecto_id"],
                "estado": r["estado"],
                "notas": r["notas"],
            }

        return jsonify({
            "mes": mes_str,
            "dias": dias,
            "empleados": empleados,
            "maquinas": maquinas,
            "proyectos": proyectos,
            "asignaciones": asignaciones,
        })
    finally:
        conn.close()


@operaciones_bp.post("/api/operaciones/asignar")
def asignar():
    data = request.get_json(silent=True) or {}
    recurso_tipo = data.get("recurso_tipo")
    recurso_id = data.get("recurso_id")
    proyecto_id = data.get("proyecto_id")
    fecha = data.get("fecha")
    fecha_desde = data.get("fecha_desde")
    fecha_hasta = data.get("fecha_hasta")

    estado = data.get("estado", "planificado")
    notas = data.get("notas", "")
    funcion_dia = data.get("funcion_dia") or None

    if not recurso_tipo or not recurso_id:
        return jsonify({"error": "recurso_tipo y recurso_id requeridos"}), 400

    # Avería: proyecto_id = 0, estado = 'averia'
    if estado == "averia":
        proyecto_id = 0
    elif not proyecto_id:
        return jsonify({"error": "proyecto_id requerido (o estado=averia)"}), 400

    conn = _conn()
    try:
        # Obtener nombre del recurso
        if recurso_tipo == "empleado":
            r = conn.execute("SELECT nombre, apellidos FROM empleados WHERE id = ?", (recurso_id,)).fetchone()
            nombre = f"{r['nombre']} {r['apellidos'] or ''}".strip() if r else "?"
        else:
            r = conn.execute("SELECT nombre FROM maquinas WHERE id = ?", (recurso_id,)).fetchone()
            nombre = r["nombre"] if r else "?"

        # Calcular fechas
        if fecha_desde and fecha_hasta:
            fechas = []
            d = date.fromisoformat(fecha_desde)
            fin = date.fromisoformat(fecha_hasta)
            while d <= fin:
                fechas.append(d.isoformat())
                d += timedelta(days=1)
        elif fecha:
            fechas = [fecha]
        else:
            return jsonify({"error": "fecha o fecha_desde/fecha_hasta requeridos"}), 400

        ahora = datetime.now().isoformat()
        insertadas = 0
        for f in fechas:
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO proyecto_asignaciones "
                    "(proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, estado, notas, funcion_dia, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (proyecto_id, recurso_tipo, recurso_id, nombre, f, estado, notas, funcion_dia, ahora),
                )
                insertadas += 1
            except Exception:
                pass
        conn.commit()
        return jsonify({"ok": True, "insertadas": insertadas})
    finally:
        conn.close()


@operaciones_bp.post("/api/operaciones/desasignar")
def desasignar():
    data = request.get_json(silent=True) or {}
    recurso_tipo = data.get("recurso_tipo")
    recurso_id = data.get("recurso_id")
    fecha = data.get("fecha")
    fecha_desde = data.get("fecha_desde")
    fecha_hasta = data.get("fecha_hasta")

    if not recurso_tipo or not recurso_id:
        return jsonify({"error": "recurso_tipo y recurso_id requeridos"}), 400

    conn = _conn()
    try:
        if fecha_desde and fecha_hasta:
            conn.execute(
                "DELETE FROM proyecto_asignaciones WHERE recurso_tipo = ? AND recurso_id = ? "
                "AND fecha >= ? AND fecha <= ?",
                (recurso_tipo, recurso_id, fecha_desde, fecha_hasta),
            )
        elif fecha:
            conn.execute(
                "DELETE FROM proyecto_asignaciones WHERE recurso_tipo = ? AND recurso_id = ? AND fecha = ?",
                (recurso_tipo, recurso_id, fecha),
            )
        else:
            return jsonify({"error": "fecha o fecha_desde/fecha_hasta requeridos"}), 400
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@operaciones_bp.post("/api/operaciones/averia-nota")
def averia_nota():
    """Editar la nota de una avería existente."""
    data = request.get_json(silent=True) or {}
    recurso_tipo = data.get("recurso_tipo")
    recurso_id = data.get("recurso_id")
    fecha = data.get("fecha")
    notas = data.get("notas", "")

    if not recurso_tipo or not recurso_id or not fecha:
        return jsonify({"error": "recurso_tipo, recurso_id y fecha requeridos"}), 400

    conn = _conn()
    try:
        conn.execute(
            "UPDATE proyecto_asignaciones SET notas = ? "
            "WHERE recurso_tipo = ? AND recurso_id = ? AND fecha = ? AND estado = 'averia'",
            (notas, recurso_tipo, recurso_id, fecha),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@operaciones_bp.post("/api/operaciones/asignar-masivo")
def asignar_masivo():
    data = request.get_json(silent=True) or {}
    proyecto_id = data.get("proyecto_id")
    recursos = data.get("recursos", [])
    fecha_desde = data.get("fecha_desde")
    fecha_hasta = data.get("fecha_hasta")

    if not proyecto_id or not recursos or not fecha_desde or not fecha_hasta:
        return jsonify({"error": "proyecto_id, recursos, fecha_desde y fecha_hasta requeridos"}), 400

    # Generar todos los días del rango
    fechas = []
    d = date.fromisoformat(fecha_desde)
    fin = date.fromisoformat(fecha_hasta)
    while d <= fin:
        fechas.append(d.isoformat())
        d += timedelta(days=1)

    conn = _conn()
    try:
        ahora = datetime.now().isoformat()
        total = 0
        for rec in recursos:
            tipo = rec.get("tipo")
            rid = rec.get("id")
            # Nombre
            if tipo == "empleado":
                r = conn.execute("SELECT nombre, apellidos FROM empleados WHERE id = ?", (rid,)).fetchone()
                nombre = f"{r['nombre']} {r['apellidos'] or ''}".strip() if r else "?"
            else:
                r = conn.execute("SELECT nombre FROM maquinas WHERE id = ?", (rid,)).fetchone()
                nombre = r["nombre"] if r else "?"
            for f in fechas:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO proyecto_asignaciones "
                        "(proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, estado, created_at) "
                        "VALUES (?, ?, ?, ?, ?, 'planificado', ?)",
                        (proyecto_id, tipo, rid, nombre, f, ahora),
                    )
                    total += 1
                except sqlite3.IntegrityError:
                    pass
        conn.commit()
        return jsonify({"ok": True, "insertadas": total})
    finally:
        conn.close()


@operaciones_bp.get("/api/operaciones/resumen")
def resumen():
    mes_str = request.args.get("mes", date.today().strftime("%Y-%m"))
    try:
        anio, mes = int(mes_str[:4]), int(mes_str[5:7])
    except (ValueError, IndexError):
        return jsonify({"error": "mes inválido"}), 400

    hoy = date.today().isoformat()
    dias = _dias_mes(anio, mes)
    fecha_ini = dias[0]["fecha"]
    fecha_fin = dias[-1]["fecha"]
    dias_lab = sum(1 for d in dias if d["laborable"])

    conn = _conn()
    try:
        total_emp = conn.execute("SELECT COUNT(*) FROM empleados WHERE estado = 'activo'").fetchone()[0]
        total_maq = conn.execute("SELECT COUNT(*) FROM maquinas WHERE activa = 1").fetchone()[0]

        emp_hoy = conn.execute(
            "SELECT COUNT(DISTINCT recurso_id) FROM proyecto_asignaciones "
            "WHERE recurso_tipo = 'empleado' AND fecha = ?", (hoy,)
        ).fetchone()[0]

        maq_hoy = conn.execute(
            "SELECT COUNT(DISTINCT recurso_id) FROM proyecto_asignaciones "
            "WHERE recurso_tipo = 'maquina' AND fecha = ? AND estado != 'averia'", (hoy,)
        ).fetchone()[0]

        maq_averia = conn.execute(
            "SELECT COUNT(DISTINCT recurso_id) FROM proyecto_asignaciones "
            "WHERE recurso_tipo = 'maquina' AND fecha = ? AND estado = 'averia'", (hoy,)
        ).fetchone()[0]

        proy_activos = conn.execute(
            "SELECT COUNT(*) FROM proyectos WHERE estado IN ('vivo','en_curso')"
        ).fetchone()[0]

        # Ocupación: días-recurso asignados / (total_recursos * días_laborables)
        asig_mes = conn.execute(
            "SELECT COUNT(*) FROM proyecto_asignaciones WHERE fecha >= ? AND fecha <= ?",
            (fecha_ini, fecha_fin),
        ).fetchone()[0]
        capacidad = (total_emp + total_maq) * dias_lab
        ocupacion = round(asig_mes / capacidad * 100) if capacidad > 0 else 0

        return jsonify({
            "emp_hoy": emp_hoy, "emp_total": total_emp,
            "maq_hoy": maq_hoy, "maq_averia": maq_averia, "maq_total": total_maq,
            "proy_activos": proy_activos,
            "ocupacion": ocupacion,
        })
    finally:
        conn.close()
