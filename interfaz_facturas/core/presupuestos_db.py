"""Modulo Presupuestos: CRUD de presupuestos, versiones, lineas y plantillas T&C."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger(__name__)

_initialized = False

_ESTADOS = ("borrador", "enviada", "negociacion", "adjudicada", "perdida", "cancelada")
_SECCIONES = ("principal", "adicionales")
_TIPOS_PLANTILLA = ("hincado_admin", "hincado_produccion", "perforado", "mixto", "general")


# ── Init ─────────────────────────────────────────────────────────────────────

def init_presupuestos_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS presupuestos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empresa_id TEXT NOT NULL,
                tercero_id INTEGER NOT NULL REFERENCES terceros(id),
                oportunidad_id INTEGER REFERENCES crm_oportunidades(id),
                proyecto_id INTEGER REFERENCES proyectos(id),
                referencia TEXT NOT NULL,
                nombre_proyecto TEXT NOT NULL,
                nombre_cliente_display TEXT,
                estado TEXT NOT NULL DEFAULT 'borrador'
                    CHECK(estado IN ('borrador','enviada','negociacion','adjudicada','perdida','cancelada')),
                created_at TEXT NOT NULL,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_presupuestos_tercero ON presupuestos(tercero_id);
            CREATE INDEX IF NOT EXISTS ix_presupuestos_estado ON presupuestos(estado);
            CREATE INDEX IF NOT EXISTS ix_presupuestos_empresa ON presupuestos(empresa_id);
            CREATE INDEX IF NOT EXISTS ix_presupuestos_referencia ON presupuestos(referencia);

            CREATE TABLE IF NOT EXISTS presupuesto_plantillas_tc (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                tipo TEXT DEFAULT 'general'
                    CHECK(tipo IN ('hincado_admin','hincado_produccion','perforado','mixto','general')),
                contenido TEXT NOT NULL,
                exclusiones TEXT,
                created_at TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS presupuesto_versiones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
                revision TEXT NOT NULL DEFAULT 'R00',
                fecha TEXT NOT NULL,
                plantilla_tc_id INTEGER REFERENCES presupuesto_plantillas_tc(id),
                forma_pago TEXT,
                notas_capacidad TEXT,
                validez_dias INTEGER DEFAULT 30,
                total REAL DEFAULT 0,
                es_activa INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE(presupuesto_id, revision)
            );
            CREATE INDEX IF NOT EXISTS ix_presupuesto_versiones_presupuesto
                ON presupuesto_versiones(presupuesto_id);

            CREATE TABLE IF NOT EXISTS presupuesto_lineas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER NOT NULL REFERENCES presupuesto_versiones(id) ON DELETE CASCADE,
                seccion TEXT NOT NULL DEFAULT 'principal'
                    CHECK(seccion IN ('principal','adicionales')),
                codigo TEXT NOT NULL,
                titulo TEXT NOT NULL,
                descripcion TEXT,
                unidad TEXT NOT NULL DEFAULT 'Ud',
                cantidad REAL DEFAULT 0,
                precio_unitario REAL DEFAULT 0,
                total REAL DEFAULT 0,
                rendimiento_diario INTEGER,
                orden INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS ix_presupuesto_lineas_version
                ON presupuesto_lineas(version_id);
        """)
    # Migración: añadir presupuesto_id a proyectos si no existe
    with _conectar() as conn2:
        try:
            conn2.execute("ALTER TABLE proyectos ADD COLUMN presupuesto_id INTEGER REFERENCES presupuestos(id)")
        except Exception:
            pass  # Ya existe
    # Tabla catálogo de partidas predefinidas
    with _conectar() as conn3:
        conn3.executescript("""
            CREATE TABLE IF NOT EXISTS presupuesto_catalogo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seccion TEXT NOT NULL DEFAULT 'principal' CHECK(seccion IN ('principal','adicionales')),
                categoria TEXT NOT NULL DEFAULT 'hincado' CHECK(categoria IN ('hincado','perforado','transporte','parada','otro')),
                codigo_default TEXT,
                titulo TEXT NOT NULL,
                descripcion TEXT,
                unidad TEXT NOT NULL DEFAULT 'Ud',
                precio_orientativo REAL,
                rendimiento_orientativo INTEGER,
                orden INTEGER NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_catalogo_seccion ON presupuesto_catalogo(seccion);
            CREATE INDEX IF NOT EXISTS ix_catalogo_categoria ON presupuesto_catalogo(categoria);
        """)
    _seed_plantillas_tc()
    _seed_catalogo()
    _initialized = True


# ── Seed data ────────────────────────────────────────────────────────────────

_EXCLUSIONES_HINCADO_ADMIN = (
    "Se excluye perforación, relleno, topografía, reparto de perfiles, ayudante, "
    "tirado de líneas, reparación, corte, pintado, limpieza, desengrasado, rechazo, "
    "PPI's, casetas de obra, almacén, baños, comedor, gestión de residuos ni "
    "seguridad 24h, lo cual debe ser provisto por el cliente y estar listo antes "
    "de realizar la movilización.\n"
    "La falta de producción debida a montaje y desmontaje de la máquina, chequeos, "
    "inducción, charlas de seguridad, falta de ayudante de líneas o ayudante de "
    "levantado de perfiles, reuniones, condiciones climatológicas o cualquier otra "
    "razón ajena a Hincado Directo así como el control de calidad, desperfectos en "
    "los perfiles no son responsabilidad de Hincado Directo. Las paradas de máquina "
    "serán imputadas según coste unitario ofertado.\n"
    "No incluye obra civil ni descarga de material en zona de acopio.\n"
    "La movilización se realizará al menos a los 10 días de recibir el pago."
)

_EXCLUSIONES_PERFORADO = (
    "Se excluye obra civil, topografía, rechazos, PPI's, casetas de obra, almacén, "
    "baños, comedor, gestión de residuos ni seguridad 24h, lo cual debe ser provisto "
    "por el cliente y estar listo antes de realizar la movilización.\n"
    "Se incluye ayudante de perforación.\n"
    "No incluye obra civil ni descarga de material en zona de acopio.\n"
    "La movilización se realizará al menos a los 10 días de recibir el pago."
)

_EXCLUSIONES_MIXTO = (
    "Se excluye obra civil, rechazos (tiempo de hincado superior a 4min), gestión "
    "de residuos ni seguridad 24h, lo cual debe ser provisto por el cliente y estar "
    "listo antes de realizar la movilización.\n"
    "La movilización se realizará al menos a los 10 días de recibir el pago."
)

_CONTENIDO_BASE = (
    "Esta oferta solo incluye lo específicamente descrito en ella. Cualquier cambio "
    "en las condiciones puede ocasionar una modificación del presupuesto."
)

_SEED_PLANTILLAS = [
    {
        "nombre": "Hincado por administración",
        "tipo": "hincado_admin",
        "contenido": _CONTENIDO_BASE,
        "exclusiones": _EXCLUSIONES_HINCADO_ADMIN,
    },
    {
        "nombre": "Perforado por producción",
        "tipo": "perforado",
        "contenido": _CONTENIDO_BASE,
        "exclusiones": _EXCLUSIONES_PERFORADO,
    },
    {
        "nombre": "Hincado y perforado mixto",
        "tipo": "mixto",
        "contenido": _CONTENIDO_BASE,
        "exclusiones": _EXCLUSIONES_MIXTO,
    },
]


def _seed_plantillas_tc() -> None:
    with _conectar() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM presupuesto_plantillas_tc").fetchone()[0]
        if existing > 0:
            return
        ahora = _now()
        for p in _SEED_PLANTILLAS:
            conn.execute(
                """INSERT INTO presupuesto_plantillas_tc (nombre, tipo, contenido, exclusiones, created_at, activo)
                   VALUES (?, ?, ?, ?, ?, 1)""",
                (p["nombre"], p["tipo"], p["contenido"], p["exclusiones"], ahora),
            )
        logger.info("Plantillas T&C de presupuestos inicializadas (%d)", len(_SEED_PLANTILLAS))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _generar_referencia(conn, empresa_id: str) -> str:
    anio = datetime.utcnow().year
    prefijo = f"PRE-{anio}-"
    row = conn.execute(
        "SELECT COUNT(*) FROM presupuestos WHERE referencia LIKE ?",
        (f"{prefijo}%",),
    ).fetchone()
    seq = (row[0] or 0) + 1
    return f"{prefijo}{seq:03d}"


def _row_dict(row) -> dict | None:
    return dict(row) if row else None


# ── Presupuestos CRUD ────────────────────────────────────────────────────────

_PRES_SELECT = """
    SELECT p.*,
           t.nombre_canonico AS nombre_cliente,
           proy.nombre AS proyecto_nombre,
           oport.nombre AS oportunidad_nombre
    FROM presupuestos p
    LEFT JOIN terceros t ON t.id = p.tercero_id
    LEFT JOIN proyectos proy ON proy.id = p.proyecto_id
    LEFT JOIN crm_oportunidades oport ON oport.id = p.oportunidad_id
"""


def listar_presupuestos(
    estado: str | None = None,
    tercero_id: int | None = None,
    empresa_id: str | None = None,
) -> list[dict]:
    init_presupuestos_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if estado:
        estados = [e.strip() for e in estado.split(",") if e.strip()]
        if len(estados) == 1:
            where_parts.append("p.estado = ?")
            params.append(estados[0])
        elif estados:
            ph = ",".join("?" * len(estados))
            where_parts.append(f"p.estado IN ({ph})")
            params.extend(estados)
    if tercero_id:
        where_parts.append("p.tercero_id = ?")
        params.append(tercero_id)
    if empresa_id:
        where_parts.append("p.empresa_id = ?")
        params.append(empresa_id)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    with _conectar() as conn:
        rows = conn.execute(
            f"{_PRES_SELECT} {where} ORDER BY p.created_at DESC", params
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # Incluir total de version activa
            v = conn.execute(
                "SELECT total FROM presupuesto_versiones WHERE presupuesto_id = ? AND es_activa = 1",
                (d["id"],),
            ).fetchone()
            d["total_version_activa"] = float(v["total"]) if v and v["total"] else 0.0
            # Incluir revision activa
            rv = conn.execute(
                "SELECT revision FROM presupuesto_versiones WHERE presupuesto_id = ? AND es_activa = 1",
                (d["id"],),
            ).fetchone()
            d["revision_activa"] = rv["revision"] if rv else None
            result.append(d)
    return result


def obtener_presupuesto(presupuesto_id: int) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(f"{_PRES_SELECT} WHERE p.id = ?", (presupuesto_id,)).fetchone()
        if not row:
            return None
        p = dict(row)
        # Versiones con lineas
        versiones_rows = conn.execute(
            "SELECT * FROM presupuesto_versiones WHERE presupuesto_id = ? ORDER BY revision DESC",
            (presupuesto_id,),
        ).fetchall()
        versiones = []
        for vr in versiones_rows:
            v = dict(vr)
            lineas = conn.execute(
                """SELECT * FROM presupuesto_lineas WHERE version_id = ?
                   ORDER BY seccion ASC, orden ASC, id ASC""",
                (v["id"],),
            ).fetchall()
            v["lineas"] = [dict(l) for l in lineas]
            versiones.append(v)
        p["versiones"] = versiones
        return p


def crear_presupuesto(data: dict) -> dict:
    init_presupuestos_db()
    ahora = _now()
    fecha_hoy = datetime.utcnow().strftime("%Y-%m-%d")
    with _conectar() as conn:
        referencia = _generar_referencia(conn, data.get("empresa_id", ""))
        conn.execute("""
            INSERT INTO presupuestos
                (empresa_id, tercero_id, oportunidad_id, proyecto_id, referencia,
                 nombre_proyecto, nombre_cliente_display, estado, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("empresa_id", ""),
            data.get("tercero_id"),
            data.get("oportunidad_id") or None,
            data.get("proyecto_id") or None,
            referencia,
            (data.get("nombre_proyecto") or "").strip(),
            (data.get("nombre_cliente_display") or "").strip() or None,
            "borrador",
            ahora, ahora,
        ))
        pres_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Crear version R00 vacia
        conn.execute("""
            INSERT INTO presupuesto_versiones
                (presupuesto_id, revision, fecha, validez_dias, total, es_activa, created_at)
            VALUES (?, 'R00', ?, 30, 0, 1, ?)
        """, (pres_id, fecha_hoy, ahora))
    return obtener_presupuesto(pres_id)


def actualizar_presupuesto(presupuesto_id: int, data: dict) -> dict | None:
    init_presupuestos_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM presupuestos WHERE id = ?", (presupuesto_id,)).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE presupuestos SET
                tercero_id = ?,
                oportunidad_id = ?,
                proyecto_id = ?,
                nombre_proyecto = ?,
                nombre_cliente_display = ?,
                updated_at = ?
            WHERE id = ?
        """, (
            data.get("tercero_id"),
            data.get("oportunidad_id") or None,
            data.get("proyecto_id") or None,
            (data.get("nombre_proyecto") or "").strip(),
            (data.get("nombre_cliente_display") or "").strip() or None,
            ahora,
            presupuesto_id,
        ))
    return obtener_presupuesto(presupuesto_id)


def cambiar_estado_presupuesto(presupuesto_id: int, nuevo_estado: str) -> dict | None:
    if nuevo_estado not in _ESTADOS:
        return None
    init_presupuestos_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT id, estado, oportunidad_id, proyecto_id FROM presupuestos WHERE id = ?",
            (presupuesto_id,),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE presupuestos SET estado = ?, updated_at = ? WHERE id = ?",
            (nuevo_estado, ahora, presupuesto_id),
        )
        if nuevo_estado == "adjudicada":
            # Vincular oportunidad CRM: marcar como ganada y apuntar presupuesto_id
            if row["oportunidad_id"]:
                conn.execute(
                    """UPDATE crm_oportunidades
                       SET presupuesto_id = ?, estado = 'ganada', fecha_actualizacion = ?
                       WHERE id = ? AND estado != 'ganada'""",
                    (presupuesto_id, ahora, row["oportunidad_id"]),
                )
            # Vincular proyecto: solo asegurar que presupuesto_id está asignado
            # El proyecto se mantiene en 'cotizado' — el usuario lo pasa a 'vivo' manualmente
            if row["proyecto_id"]:
                conn.execute(
                    """UPDATE proyectos SET presupuesto_id = ?, updated_at = ?
                       WHERE id = ? AND presupuesto_id IS NULL""",
                    (presupuesto_id, ahora, row["proyecto_id"]),
                )
    return obtener_presupuesto(presupuesto_id)


# ── Versiones ────────────────────────────────────────────────────────────────

def crear_version(presupuesto_id: int) -> dict | None:
    init_presupuestos_db()
    ahora = _now()
    fecha_hoy = datetime.utcnow().strftime("%Y-%m-%d")
    with _conectar() as conn:
        # Obtener version activa actual
        activa = conn.execute(
            "SELECT * FROM presupuesto_versiones WHERE presupuesto_id = ? AND es_activa = 1",
            (presupuesto_id,),
        ).fetchone()
        if not activa:
            # No hay version activa, buscar la ultima
            activa = conn.execute(
                "SELECT * FROM presupuesto_versiones WHERE presupuesto_id = ? ORDER BY revision DESC LIMIT 1",
                (presupuesto_id,),
            ).fetchone()
        # Calcular siguiente revision
        if activa:
            rev_actual = activa["revision"]  # "R00", "R01", ...
            try:
                num = int(rev_actual[1:]) + 1
            except (ValueError, IndexError):
                num = 1
            nueva_rev = f"R{num:02d}"
            activa_id = activa["id"]
        else:
            nueva_rev = "R00"
            activa_id = None
        # Desactivar todas las versiones anteriores
        conn.execute(
            "UPDATE presupuesto_versiones SET es_activa = 0 WHERE presupuesto_id = ?",
            (presupuesto_id,),
        )
        # Crear nueva version
        conn.execute("""
            INSERT INTO presupuesto_versiones
                (presupuesto_id, revision, fecha, plantilla_tc_id, forma_pago,
                 notas_capacidad, validez_dias, total, es_activa, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (
            presupuesto_id,
            nueva_rev,
            fecha_hoy,
            activa["plantilla_tc_id"] if activa else None,
            activa["forma_pago"] if activa else None,
            activa["notas_capacidad"] if activa else None,
            activa["validez_dias"] if activa else 30,
            activa["total"] if activa else 0,
            ahora,
        ))
        nueva_version_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Copiar lineas de la version anterior
        if activa_id:
            lineas = conn.execute(
                "SELECT * FROM presupuesto_lineas WHERE version_id = ? ORDER BY seccion, orden, id",
                (activa_id,),
            ).fetchall()
            for l in lineas:
                conn.execute("""
                    INSERT INTO presupuesto_lineas
                        (version_id, seccion, codigo, titulo, descripcion, unidad,
                         cantidad, precio_unitario, total, rendimiento_diario, orden)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    nueva_version_id,
                    l["seccion"], l["codigo"], l["titulo"], l["descripcion"],
                    l["unidad"], l["cantidad"], l["precio_unitario"], l["total"],
                    l["rendimiento_diario"], l["orden"],
                ))
        conn.execute(
            "UPDATE presupuestos SET updated_at = ? WHERE id = ?",
            (ahora, presupuesto_id),
        )
    return obtener_version(nueva_version_id)


def obtener_version(version_id: int) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT * FROM presupuesto_versiones WHERE id = ?", (version_id,)
        ).fetchone()
        if not row:
            return None
        v = dict(row)
        lineas = conn.execute(
            """SELECT * FROM presupuesto_lineas WHERE version_id = ?
               ORDER BY seccion ASC, orden ASC, id ASC""",
            (version_id,),
        ).fetchall()
        v["lineas"] = [dict(l) for l in lineas]
        return v


def actualizar_version(version_id: int, data: dict) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT id, presupuesto_id FROM presupuesto_versiones WHERE id = ?", (version_id,)
        ).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE presupuesto_versiones SET
                fecha = COALESCE(?, fecha),
                plantilla_tc_id = ?,
                forma_pago = ?,
                notas_capacidad = ?,
                validez_dias = COALESCE(?, validez_dias)
            WHERE id = ?
        """, (
            (data.get("fecha") or "").strip() or None,
            data.get("plantilla_tc_id") or None,
            (data.get("forma_pago") or "").strip() or None,
            (data.get("notas_capacidad") or "").strip() or None,
            data.get("validez_dias"),
            version_id,
        ))
        conn.execute(
            "UPDATE presupuestos SET updated_at = ? WHERE id = ?",
            (_now(), row["presupuesto_id"]),
        )
    return obtener_version(version_id)


# ── Lineas ───────────────────────────────────────────────────────────────────

def guardar_lineas(version_id: int, lineas: list[dict]) -> list[dict]:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT id, presupuesto_id FROM presupuesto_versiones WHERE id = ?", (version_id,)
        ).fetchone()
        if not row:
            return []
        presupuesto_id = row["presupuesto_id"]
        # Borrar lineas existentes
        conn.execute("DELETE FROM presupuesto_lineas WHERE version_id = ?", (version_id,))
        # Insertar nuevas
        total_version = 0.0
        for i, l in enumerate(lineas):
            cantidad = _to_float(l.get("cantidad"))
            precio = _to_float(l.get("precio_unitario"))
            total_linea = round(cantidad * precio, 2)
            seccion = l.get("seccion", "principal")
            if seccion not in _SECCIONES:
                seccion = "principal"
            conn.execute("""
                INSERT INTO presupuesto_lineas
                    (version_id, seccion, codigo, titulo, descripcion, unidad,
                     cantidad, precio_unitario, total, rendimiento_diario, orden)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                version_id,
                seccion,
                (l.get("codigo") or "").strip(),
                (l.get("titulo") or "").strip(),
                (l.get("descripcion") or "").strip() or None,
                (l.get("unidad") or "Ud").strip(),
                cantidad,
                precio,
                total_linea,
                l.get("rendimiento_diario") or None,
                l.get("orden", i),
            ))
            if seccion == "principal":
                total_version += total_linea
        total_version = round(total_version, 2)
        conn.execute(
            "UPDATE presupuesto_versiones SET total = ? WHERE id = ?",
            (total_version, version_id),
        )
        conn.execute(
            "UPDATE presupuestos SET updated_at = ? WHERE id = ?",
            (_now(), presupuesto_id),
        )
        # Retornar lineas insertadas
        result = conn.execute(
            """SELECT * FROM presupuesto_lineas WHERE version_id = ?
               ORDER BY seccion ASC, orden ASC, id ASC""",
            (version_id,),
        ).fetchall()
    return [dict(r) for r in result]


def _to_float(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


# ── Plantillas T&C ───────────────────────────────────────────────────────────

def listar_plantillas_tc(activas_solo: bool = True) -> list[dict]:
    init_presupuestos_db()
    with _conectar() as conn:
        if activas_solo:
            rows = conn.execute(
                "SELECT * FROM presupuesto_plantillas_tc WHERE activo = 1 ORDER BY nombre"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM presupuesto_plantillas_tc ORDER BY nombre"
            ).fetchall()
    return [dict(r) for r in rows]


def obtener_plantilla_tc(plantilla_id: int) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT * FROM presupuesto_plantillas_tc WHERE id = ?", (plantilla_id,)
        ).fetchone()
    return _row_dict(row)


def crear_plantilla_tc(data: dict) -> dict:
    init_presupuestos_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO presupuesto_plantillas_tc (nombre, tipo, contenido, exclusiones, created_at, activo)
            VALUES (?, ?, ?, ?, ?, 1)
        """, (
            (data.get("nombre") or "").strip(),
            (data.get("tipo") or "general").strip(),
            (data.get("contenido") or "").strip(),
            (data.get("exclusiones") or "").strip() or None,
            ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return obtener_plantilla_tc(new_id)


def actualizar_plantilla_tc(plantilla_id: int, data: dict) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT id FROM presupuesto_plantillas_tc WHERE id = ?", (plantilla_id,)
        ).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE presupuesto_plantillas_tc SET
                nombre = COALESCE(?, nombre),
                tipo = COALESCE(?, tipo),
                contenido = COALESCE(?, contenido),
                exclusiones = ?,
                activo = COALESCE(?, activo)
            WHERE id = ?
        """, (
            (data.get("nombre") or "").strip() or None,
            (data.get("tipo") or "").strip() or None,
            (data.get("contenido") or "").strip() or None,
            (data.get("exclusiones") or "").strip() or None,
            data.get("activo"),
            plantilla_id,
        ))
    return obtener_plantilla_tc(plantilla_id)


# ── Catálogo de partidas predefinidas ────────────────────────────────────────

_SEED_CATALOGO = [
    # PRINCIPAL — Hincado
    {"seccion": "principal", "categoria": "hincado", "codigo_default": "01.01", "orden": 1,
     "titulo": "Alquiler mensual de máquina de hincado con operador",
     "descripcion": "Alquiler mensual (20 días laborables) de máquina de hincado Orteco HD 1000 para postes de hasta 4,5 m con operador, incluyendo gasoil y mantenimiento diario.\nIncluidas 8h diarias de Lunes a Viernes. Excluidas horas extras, fines de semana y festivos.",
     "unidad": "Ud"},
    {"seccion": "principal", "categoria": "hincado", "codigo_default": "01.02", "orden": 2,
     "titulo": "Alquiler mensual de máquina de hincado con operador y ayudante",
     "descripcion": "Alquiler mensual (20 jornadas) de máquina de hincado Orteco HD 1000 para postes de hasta 4,5 m con operador, ayudante, incluyendo gasoil y mantenimiento diario.\nIncluidas 8h diarias de Lunes a Viernes. Excluidas horas extras, fines de semana y festivos.\nEl inicio de la mensualidad se considerará desde la carga de la maquinaria en origen. El fin de la mensualidad se considerará a la descarga de la maquinaria a origen.",
     "unidad": "Ud"},
    {"seccion": "principal", "categoria": "hincado", "codigo_default": "01.03", "orden": 3,
     "titulo": "Servicio mensual de ayudante de hincado",
     "descripcion": "Servicio mensual (20 días laborables) de ayudante de hincado incluyendo desplazamiento y dietas. Incluidas 8h diarias de Lunes a Viernes. Excluidas horas extras, fines de semana y festivos. Sujeto al alquiler de máquina con operador, un operador adicional por cada máquina alquilada.",
     "unidad": "Ud"},
    {"seccion": "principal", "categoria": "hincado", "codigo_default": "01.04", "orden": 4,
     "titulo": "Hincado directo de postes - precio por hinca",
     "descripcion": "Máquina de hincado Orteco HD 1000. Incluido descarga, reparto, hincado, cepillado y pintado.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud"},
    # PRINCIPAL — Perforado
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.05", "orden": 5,
     "titulo": "Alquiler mensual de máquina de perforado con operador y ayudante",
     "descripcion": "Alquiler mensual (20 jornadas) de máquina de perforado con operador, ayudante, incluyendo gasoil y mantenimiento diario.\nExcluye compresor y su combustible que deberá ser provisto por el cliente. Incluidas 8h diarias de Lunes a Viernes. Excluidas horas extras, fines de semana y festivos.\nEl inicio de la mensualidad se considerará desde la carga de la maquinaria en origen. El fin de la mensualidad se considerará a la descarga de la maquinaria a origen.",
     "unidad": "Ud"},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.06", "orden": 6,
     "titulo": "Predrilling Ø100mm",
     "descripcion": "Máquina Perforadora. Relleno NO incluido.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 175},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.07", "orden": 7,
     "titulo": "Predrilling Ø110-115mm",
     "descripcion": "Máquina Perforadora. Excluido relleno con material granular.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 160},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.08", "orden": 8,
     "titulo": "Predrilling Ø127-135mm",
     "descripcion": "Máquina Perforadora. Excluido relleno con material granular.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 155},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.09", "orden": 9,
     "titulo": "Predrilling Ø140-150mm",
     "descripcion": "Máquina Perforadora. Excluido relleno con material granular.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 150},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.10", "orden": 10,
     "titulo": "Predrilling Ø160-170mm",
     "descripcion": "Máquina Perforadora. Excluido relleno con material granular.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 145},
    {"seccion": "principal", "categoria": "perforado", "codigo_default": "01.11", "orden": 11,
     "titulo": "Predrilling Ø180-200mm",
     "descripcion": "Máquina Perforadora. Excluido relleno con material granular.\nSe debe permitir trabajar horas extras, fines de semana y festivos.",
     "unidad": "Ud", "rendimiento_orientativo": 140},
    # ADICIONALES — Paradas
    {"seccion": "adicionales", "categoria": "parada", "codigo_default": "02.01", "orden": 1,
     "titulo": "Hora de parada de hincadora por causas ajenas a Hincado Directo",
     "descripcion": "Un día se considera de 8h",
     "unidad": "Ud", "precio_orientativo": 250},
    {"seccion": "adicionales", "categoria": "parada", "codigo_default": "02.02", "orden": 2,
     "titulo": "Hora de parada de perforadora por causas ajenas a Hincado Directo",
     "descripcion": "Un día se considera de 8h",
     "unidad": "Ud", "precio_orientativo": 300},
    {"seccion": "adicionales", "categoria": "parada", "codigo_default": "02.03", "orden": 3,
     "titulo": "Hora extra máquina de hincado con operador",
     "descripcion": "Máximo de horas mensuales según legislación laboral.",
     "unidad": "Ud", "precio_orientativo": 250},
    # ADICIONALES — Transporte
    {"seccion": "adicionales", "categoria": "transporte", "codigo_default": "02.04", "orden": 4,
     "titulo": "Transporte de máquina ida y vuelta para movilización y desmovilización",
     "descripcion": "€/km\nLa movilización se realizará al menos a los 10 días de recibir el pago.",
     "unidad": "Ud"},
]


def _seed_catalogo() -> None:
    with _conectar() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM presupuesto_catalogo").fetchone()[0]
        if existing > 0:
            return
        ahora = _now()
        for p in _SEED_CATALOGO:
            conn.execute(
                """INSERT INTO presupuesto_catalogo
                   (seccion, categoria, codigo_default, titulo, descripcion, unidad,
                    precio_orientativo, rendimiento_orientativo, orden, activo, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (p["seccion"], p["categoria"], p.get("codigo_default"),
                 p["titulo"], p.get("descripcion"), p.get("unidad", "Ud"),
                 p.get("precio_orientativo"), p.get("rendimiento_orientativo"),
                 p.get("orden", 0), ahora),
            )
        logger.info("Catálogo de partidas predefinidas inicializado (%d)", len(_SEED_CATALOGO))


def listar_catalogo(seccion: str | None = None, categoria: str | None = None,
                    activos_solo: bool = True) -> list[dict]:
    init_presupuestos_db()
    sql = "SELECT * FROM presupuesto_catalogo WHERE 1=1"
    params: list = []
    if activos_solo:
        sql += " AND activo = 1"
    if seccion:
        sql += " AND seccion = ?"
        params.append(seccion)
    if categoria:
        sql += " AND categoria = ?"
        params.append(categoria)
    sql += " ORDER BY seccion, orden, id"
    with _conectar() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def obtener_item_catalogo(item_id: int) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute("SELECT * FROM presupuesto_catalogo WHERE id = ?", (item_id,)).fetchone()
    return _row_dict(row)


def crear_item_catalogo(data: dict) -> dict:
    init_presupuestos_db()
    titulo = (data.get("titulo") or "").strip()
    if not titulo:
        raise ValueError("El título es obligatorio")
    ahora = _now()
    with _conectar() as conn:
        conn.execute(
            """INSERT INTO presupuesto_catalogo
               (seccion, categoria, codigo_default, titulo, descripcion, unidad,
                precio_orientativo, rendimiento_orientativo, orden, activo, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (
                (data.get("seccion") or "principal").strip(),
                (data.get("categoria") or "hincado").strip(),
                (data.get("codigo_default") or "").strip() or None,
                titulo,
                (data.get("descripcion") or "").strip() or None,
                (data.get("unidad") or "Ud").strip(),
                data.get("precio_orientativo"),
                data.get("rendimiento_orientativo"),
                data.get("orden", 0),
                ahora,
            ),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return obtener_item_catalogo(new_id)


def actualizar_item_catalogo(item_id: int, data: dict) -> dict | None:
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM presupuesto_catalogo WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE presupuesto_catalogo SET
                seccion = COALESCE(?, seccion),
                categoria = COALESCE(?, categoria),
                codigo_default = ?,
                titulo = COALESCE(?, titulo),
                descripcion = ?,
                unidad = COALESCE(?, unidad),
                precio_orientativo = ?,
                rendimiento_orientativo = ?,
                orden = COALESCE(?, orden)
            WHERE id = ?
        """, (
            (data.get("seccion") or "").strip() or None,
            (data.get("categoria") or "").strip() or None,
            (data.get("codigo_default") or "").strip() or None,
            (data.get("titulo") or "").strip() or None,
            (data.get("descripcion") or "").strip() or None,
            (data.get("unidad") or "").strip() or None,
            data.get("precio_orientativo"),
            data.get("rendimiento_orientativo"),
            data.get("orden"),
            item_id,
        ))
    return obtener_item_catalogo(item_id)


def eliminar_item_catalogo(item_id: int) -> dict | None:
    """Soft delete: marca activo=0."""
    init_presupuestos_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM presupuesto_catalogo WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE presupuesto_catalogo SET activo = 0 WHERE id = ?", (item_id,))
    return obtener_item_catalogo(item_id)
