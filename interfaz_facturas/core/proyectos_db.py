"""Modulo Proyectos: CRUD de proyectos, partes de trabajo, recursos."""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger(__name__)

_initialized = False

_ESTADOS = ("cotizado", "adjudicado", "vivo", "pausado", "terminado", "cancelado", "perdido")


def init_proyectos_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS proyectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                codigo TEXT UNIQUE,
                empresa_id TEXT NOT NULL,
                cliente_tercero_id INTEGER REFERENCES terceros(id),
                oportunidad_id INTEGER REFERENCES crm_oportunidades(id),
                estado TEXT NOT NULL DEFAULT 'cotizado'
                    CHECK(estado IN ('cotizado','vivo','pausado','terminado','cancelado')),
                tipo_trabajo TEXT
                    CHECK(tipo_trabajo IN ('hincado','perforado','pull_out_test','mixto','otro')),
                modalidad_facturacion TEXT
                    CHECK(modalidad_facturacion IN ('produccion','administracion','cerrado','mixto')),
                nombre_parque TEXT,
                ubicacion_texto TEXT,
                ubicacion_lat REAL,
                ubicacion_lon REAL,
                provincia TEXT,
                mw_parque REAL,
                hincas_estimadas INTEGER,
                hincas_realizadas INTEGER DEFAULT 0,
                precio_unitario_hinca REAL,
                precio_hora_maquina REAL,
                precio_hora_ayudante REAL,
                precio_jornada REAL,
                importe_presupuestado REAL,
                importe_facturado REAL DEFAULT 0,
                importe_costes REAL DEFAULT 0,
                fecha_inicio_estimada TEXT,
                fecha_fin_estimada TEXT,
                fecha_inicio_real TEXT,
                fecha_fin_real TEXT,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_proyectos_estado ON proyectos(estado);
            CREATE INDEX IF NOT EXISTS ix_proyectos_empresa ON proyectos(empresa_id);
            CREATE INDEX IF NOT EXISTS ix_proyectos_cliente ON proyectos(cliente_tercero_id);
            CREATE INDEX IF NOT EXISTS ix_proyectos_codigo ON proyectos(codigo);

            CREATE TABLE IF NOT EXISTS proyecto_recursos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL CHECK(tipo IN ('maquina','operador','ayudante','ayudante_tiralineas','otro')),
                tercero_id INTEGER REFERENCES terceros(id),
                descripcion TEXT,
                fecha_inicio TEXT,
                fecha_fin TEXT,
                activo INTEGER DEFAULT 1,
                notas TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_pr_proyecto ON proyecto_recursos(proyecto_id);

            CREATE TABLE IF NOT EXISTS proyecto_partes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
                fecha TEXT NOT NULL,
                hincas_realizadas INTEGER DEFAULT 0,
                horas_maquina REAL DEFAULT 0,
                horas_personal REAL DEFAULT 0,
                num_operadores INTEGER DEFAULT 1,
                num_ayudantes INTEGER DEFAULT 0,
                incidencias TEXT,
                condiciones_terreno TEXT,
                meteorologia TEXT,
                combustible_litros REAL,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_by TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_pp_proyecto ON proyecto_partes(proyecto_id);
            CREATE INDEX IF NOT EXISTS ix_pp_fecha ON proyecto_partes(fecha);

            CREATE TABLE IF NOT EXISTS proyecto_historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
                estado_anterior TEXT,
                estado_nuevo TEXT NOT NULL,
                fecha TEXT NOT NULL,
                usuario TEXT,
                motivo TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_ph_proyecto ON proyecto_historial(proyecto_id);
        """)
        # Migration: add presupuesto_id if missing
        cols = {r[1] for r in conn.execute("PRAGMA table_info(proyectos)").fetchall()}
        if "presupuesto_id" not in cols:
            conn.execute("ALTER TABLE proyectos ADD COLUMN presupuesto_id INTEGER REFERENCES presupuestos(id)")
        # Documentos del proyecto
        conn.execute("""
            CREATE TABLE IF NOT EXISTS proyecto_documentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL,
                tipo TEXT DEFAULT 'otro' CHECK(tipo IN ('contrato','acta','certificacion','plano','foto','informe','otro')),
                descripcion TEXT,
                ruta_archivo TEXT,
                url_externa TEXT,
                fecha_documento TEXT,
                created_at TEXT NOT NULL,
                subido_por TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_proy_docs_proyecto ON proyecto_documentos(proyecto_id)")
        # Migration: add proyecto_id to facturas_proveedor if missing
        try:
            fp_cols = {r[1] for r in conn.execute("PRAGMA table_info(facturas_proveedor)").fetchall()}
            if "proyecto_id" not in fp_cols:
                conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN proyecto_id INTEGER REFERENCES proyectos(id)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_fact_prov_proyecto ON facturas_proveedor(proyecto_id)")
        except Exception:
            pass
        # Migration: add proyecto_id to facturas_cliente if missing
        try:
            fc_cols = {r[1] for r in conn.execute("PRAGMA table_info(facturas_cliente)").fetchall()}
            if "proyecto_id" not in fc_cols:
                conn.execute("ALTER TABLE facturas_cliente ADD COLUMN proyecto_id INTEGER REFERENCES proyectos(id)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_fact_cli_proyecto ON facturas_cliente(proyecto_id)")
        except Exception:
            pass
        # Migration: add horas_admin to proyecto_partes if missing
        try:
            pp_cols = {r[1] for r in conn.execute("PRAGMA table_info(proyecto_partes)").fetchall()}
            if "horas_admin" not in pp_cols:
                conn.execute("ALTER TABLE proyecto_partes ADD COLUMN horas_admin REAL DEFAULT 0")
        except Exception:
            pass
        # Migration: add perforaciones_realizadas to proyecto_partes if missing
        try:
            if "perforaciones_realizadas" not in pp_cols:
                conn.execute("ALTER TABLE proyecto_partes ADD COLUMN perforaciones_realizadas INTEGER DEFAULT 0")
        except Exception:
            pass
        # Migration: add imagen_archivo to proyecto_partes if missing
        try:
            if "imagen_archivo" not in pp_cols:
                conn.execute("ALTER TABLE proyecto_partes ADD COLUMN imagen_archivo TEXT")
        except Exception:
            pass
        # Migration: add cae_expediente_id to proyectos (CAE module)
        try:
            if "cae_expediente_id" not in cols:
                conn.execute("ALTER TABLE proyectos ADD COLUMN cae_expediente_id INTEGER")
        except Exception:
            pass
        # ── Certificaciones ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS certificaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
                numero INTEGER NOT NULL DEFAULT 1,
                fecha_desde TEXT NOT NULL,
                fecha_hasta TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'mixto' CHECK(tipo IN ('produccion','administracion','mixto')),
                total_hincas INTEGER DEFAULT 0,
                precio_hinca REAL DEFAULT 0,
                importe_produccion REAL DEFAULT 0,
                total_horas_admin REAL DEFAULT 0,
                precio_hora_admin REAL DEFAULT 0,
                importe_administracion REAL DEFAULT 0,
                importe_transporte REAL DEFAULT 0,
                importe_total REAL DEFAULT 0,
                estado TEXT DEFAULT 'borrador' CHECK(estado IN ('borrador','enviada','aprobada')),
                factura_cliente_id INTEGER REFERENCES facturas_cliente(id),
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT,
                UNIQUE(proyecto_id, numero)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cert_proyecto ON certificaciones(proyecto_id)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS certificacion_detalle (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                certificacion_id INTEGER NOT NULL REFERENCES certificaciones(id) ON DELETE CASCADE,
                fecha TEXT NOT NULL,
                descripcion TEXT,
                hincas INTEGER DEFAULT 0,
                horas_admin REAL DEFAULT 0,
                horas_maquina1 REAL DEFAULT 0,
                horas_maquina2 REAL DEFAULT 0,
                parte_id INTEGER REFERENCES proyecto_partes(id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cert_det_cert ON certificacion_detalle(certificacion_id)")
        # ── Asignaciones diarias de recursos ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS proyecto_asignaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER NOT NULL,
                recurso_tipo TEXT NOT NULL CHECK(recurso_tipo IN ('empleado','maquina','vehiculo')),
                recurso_id INTEGER NOT NULL,
                recurso_nombre TEXT NOT NULL,
                fecha TEXT NOT NULL,
                estado TEXT DEFAULT 'planificado' CHECK(estado IN ('planificado','confirmado','incidencia','cancelado')),
                notas TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(recurso_tipo, recurso_id, fecha)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_asig_proy ON proyecto_asignaciones(proyecto_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_asig_fecha ON proyecto_asignaciones(fecha)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_asig_recurso ON proyecto_asignaciones(recurso_tipo, recurso_id)")
        # Migration: add funcion_dia column if missing
        _asig_cols = {r[1] for r in conn.execute("PRAGMA table_info(proyecto_asignaciones)").fetchall()}
        if "funcion_dia" not in _asig_cols:
            conn.execute("ALTER TABLE proyecto_asignaciones ADD COLUMN funcion_dia TEXT DEFAULT NULL")
        _backfill_codigos(conn)

        # Migración: añadir estado 'perdido' si no existe en CHECK
        row_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='proyectos'").fetchone()
        if row_sql and "'perdido'" not in (row_sql[0] or ""):
            # SQLite no permite ALTER CHECK, hay que recrear
            conn.execute("ALTER TABLE proyectos RENAME TO _proyectos_old")
            old_sql = row_sql[0]
            new_sql = old_sql.replace(
                "'cotizado','vivo','pausado','terminado','cancelado'",
                "'cotizado','vivo','pausado','terminado','cancelado','perdido'"
            )
            conn.execute(new_sql)
            cols = [r[1] for r in conn.execute("PRAGMA table_info(proyectos)").fetchall()]
            col_list = ", ".join(cols)
            conn.execute(f"INSERT INTO proyectos ({col_list}) SELECT {col_list} FROM _proyectos_old")
            conn.execute("DROP TABLE _proyectos_old")

        # Migración: añadir estado 'adjudicado' si no existe
        row_sql2 = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='proyectos'").fetchone()
        if row_sql2 and "'adjudicado'" not in (row_sql2[0] or ""):
            conn.execute("ALTER TABLE proyectos RENAME TO _proyectos_old2")
            old2 = row_sql2[0]
            new2 = old2.replace(
                "'cotizado','vivo','pausado','terminado','cancelado','perdido'",
                "'cotizado','adjudicado','vivo','pausado','terminado','cancelado','perdido'"
            )
            conn.execute(new2)
            cols2 = [r[1] for r in conn.execute("PRAGMA table_info(proyectos)").fetchall()]
            col2_list = ", ".join(cols2)
            conn.execute(f"INSERT INTO proyectos ({col2_list}) SELECT {col2_list} FROM _proyectos_old2")
            conn.execute("DROP TABLE _proyectos_old2")

        # Migración: campos pricing hinca/perforación
        existing = {r[1] for r in conn.execute("PRAGMA table_info(proyectos)").fetchall()}
        _new_cols = [
            ("tipo_actividad", "TEXT DEFAULT 'hinca'"),
            ("hinca_cantidad", "INTEGER DEFAULT 0"),
            ("hinca_precio_prod_operador", "REAL DEFAULT 0"),
            ("hinca_precio_prod_ayudante", "REAL DEFAULT 0"),
            ("hinca_precio_admin_operador", "REAL DEFAULT 1300"),
            ("hinca_precio_admin_ayudante", "REAL DEFAULT 1600"),
            ("perforacion_cantidad", "INTEGER DEFAULT 0"),
            ("perforacion_precio_prod_operador", "REAL DEFAULT 0"),
            ("perforacion_precio_prod_ayudante", "REAL DEFAULT 0"),
            ("perforacion_precio_admin_operador", "REAL DEFAULT 0"),
            ("perforacion_precio_admin_ayudante", "REAL DEFAULT 0"),
        ]
        for col_name, col_type in _new_cols:
            if col_name not in existing:
                conn.execute(f"ALTER TABLE proyectos ADD COLUMN {col_name} {col_type}")
        # Location fields
        if "direccion" not in existing:
            conn.execute("ALTER TABLE proyectos ADD COLUMN direccion TEXT")
        if "municipio" not in existing:
            conn.execute("ALTER TABLE proyectos ADD COLUMN municipio TEXT")
        if "dias_laborables" not in existing:
            conn.execute("ALTER TABLE proyectos ADD COLUMN dias_laborables TEXT DEFAULT 'LMXJV'")

    _initialized = True


# ── Código único automático ──────────────────────────────────────────────────

def _generar_codigo_proyecto(conn=None) -> str:
    """Genera PRY-YYYY-NNN donde NNN es secuencial dentro del año."""
    year = date.today().year
    def _next(c):
        row = c.execute(
            "SELECT codigo FROM proyectos WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1",
            [f"PRY-{year}-%"],
        ).fetchone()
        if row and row["codigo"]:
            ultimo_num = int(row["codigo"].split("-")[-1])
            return ultimo_num + 1
        return 1
    if conn:
        siguiente = _next(conn)
    else:
        with _conectar() as c:
            siguiente = _next(c)
    return f"PRY-{year}-{siguiente:03d}"


def _backfill_codigos(conn) -> None:
    """Asigna código a proyectos existentes que no lo tienen."""
    proyectos_sin = conn.execute(
        "SELECT id, created_at FROM proyectos WHERE codigo IS NULL OR codigo = '' ORDER BY id"
    ).fetchall()
    for p in proyectos_sin:
        year = p["created_at"][:4] if p["created_at"] else "2025"
        row = conn.execute(
            "SELECT MAX(CAST(SUBSTR(codigo, -3) AS INTEGER)) AS mx FROM proyectos WHERE codigo LIKE ?",
            [f"PRY-{year}-%"],
        ).fetchone()
        siguiente = (row["mx"] or 0) + 1
        conn.execute(
            "UPDATE proyectos SET codigo = ? WHERE id = ?",
            [f"PRY-{year}-{siguiente:03d}", p["id"]],
        )


# ── Proyectos CRUD ───────────────────────────────────────────────────────────

_PROY_SELECT = """
    SELECT p.*,
        COALESCE(t.nombre_canonico,
                 (SELECT ce.nombre FROM crm_empresas ce WHERE ce.tercero_id = p.cliente_tercero_id LIMIT 1)
        ) AS nombre_cliente,
        pres.referencia AS presupuesto_ref,
        oport.nombre AS oportunidad_nombre,
        CASE WHEN COALESCE(NULLIF(p.hinca_cantidad,0), p.hincas_estimadas, 0) > 0
             THEN ROUND(p.hincas_realizadas * 100.0 / COALESCE(NULLIF(p.hinca_cantidad,0), p.hincas_estimadas), 1)
             ELSE 0 END AS progreso,
        CASE WHEN p.fecha_inicio_real IS NOT NULL
             THEN CAST(julianday('now') - julianday(p.fecha_inicio_real) AS INTEGER)
             ELSE 0 END AS dias_activo
    FROM proyectos p
    LEFT JOIN terceros t ON t.id = p.cliente_tercero_id
    LEFT JOIN presupuestos pres ON pres.id = p.presupuesto_id
    LEFT JOIN crm_oportunidades oport ON oport.id = p.oportunidad_id
"""


def obtener_estado_cae(proyecto_id: int) -> dict | None:
    """Obtiene resumen del estado CAE de un proyecto (si tiene expediente vinculado)."""
    init_proyectos_db()
    with _conectar() as conn:
        exp = conn.execute(
            "SELECT id, estado FROM cae_expedientes WHERE proyecto_id = ?", [proyecto_id]
        ).fetchone()
        if not exp:
            return None
        resultados = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM cae_resultados WHERE expediente_id = ? GROUP BY status",
            [exp["id"]],
        ).fetchall()
        counts = {r["status"]: r["cnt"] for r in resultados}
        total = sum(counts.values())
        pct = round(counts.get("READY", 0) / total * 100) if total > 0 else 0
        return {
            "expediente_id": exp["id"],
            "estado": exp["estado"],
            "total": total,
            "ready": counts.get("READY", 0),
            "missing": counts.get("MISSING", 0),
            "expired": counts.get("EXPIRED", 0),
            "doubtful": counts.get("DOUBTFUL", 0),
            "porcentaje_completo": pct,
        }


def listar_proyectos(
    estado: str | None = None,
    empresa_id: str | None = None,
    tipo_trabajo: str | None = None,
    q: str | None = None,
    tercero_id: int | None = None,
) -> list[dict]:
    init_proyectos_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if estado:
        estados = [e.strip() for e in estado.split(",") if e.strip()]
        if len(estados) == 1:
            where_parts.append("p.estado = ?")
            params.append(estados[0])
        elif estados:
            placeholders = ",".join("?" * len(estados))
            where_parts.append(f"p.estado IN ({placeholders})")
            params.extend(estados)
    if empresa_id:
        where_parts.append("p.empresa_id = ?")
        params.append(empresa_id)
    if tipo_trabajo:
        where_parts.append("p.tipo_trabajo = ?")
        params.append(tipo_trabajo)
    if q:
        where_parts.append("(p.nombre LIKE ? OR p.nombre_parque LIKE ? OR p.codigo LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])
    if tercero_id:
        where_parts.append("p.cliente_tercero_id = ?")
        params.append(tercero_id)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    with _conectar() as conn:
        rows = conn.execute(f"{_PROY_SELECT} {where} ORDER BY p.created_at DESC", params).fetchall()
    return [dict(r) for r in rows]


def obtener_proyecto(proyecto_id: int) -> dict | None:
    init_proyectos_db()
    with _conectar() as conn:
        row = conn.execute(f"{_PROY_SELECT} WHERE p.id = ?", (proyecto_id,)).fetchone()
        if not row:
            return None
        p = dict(row)
        p["recursos"] = [dict(r) for r in conn.execute(
            "SELECT * FROM proyecto_recursos WHERE proyecto_id = ? AND activo = 1 ORDER BY tipo", (proyecto_id,)
        ).fetchall()]
        p["partes"] = [dict(r) for r in conn.execute(
            "SELECT * FROM proyecto_partes WHERE proyecto_id = ? ORDER BY fecha DESC LIMIT 20", (proyecto_id,)
        ).fetchall()]
        p["historial"] = [dict(r) for r in conn.execute(
            "SELECT * FROM proyecto_historial WHERE proyecto_id = ? ORDER BY fecha DESC", (proyecto_id,)
        ).fetchall()]
        return p


def obtener_dashboard_proyecto(proyecto_id: int) -> dict | None:
    """Retorna toda la información del proyecto para el dashboard."""
    init_proyectos_db()
    with _conectar() as conn:
        row = conn.execute("""
            SELECT p.*,
                   COALESCE(t.nombre_canonico,
                            (SELECT ce2.nombre FROM crm_empresas ce2 WHERE ce2.tercero_id = p.cliente_tercero_id LIMIT 1)
                   ) AS cliente_nombre,
                   COALESCE(t.nif,
                            (SELECT ce3.cif FROM crm_empresas ce3 WHERE ce3.tercero_id = p.cliente_tercero_id LIMIT 1)
                   ) AS cliente_nif,
                   pres.referencia AS presupuesto_ref,
                   pres.id AS presupuesto_id_vinculado,
                   o.nombre AS oportunidad_nombre,
                   o.id AS oportunidad_id_vinculado
            FROM proyectos p
            LEFT JOIN terceros t ON t.id = p.cliente_tercero_id
            LEFT JOIN presupuestos pres ON pres.id = p.presupuesto_id
            LEFT JOIN crm_oportunidades o ON o.id = p.oportunidad_id
            WHERE p.id = ?
        """, (proyecto_id,)).fetchone()
        if not row:
            return None
        proyecto = dict(row)

        # Historial de estados
        proyecto["historial"] = [dict(r) for r in conn.execute(
            "SELECT * FROM proyecto_historial WHERE proyecto_id = ? ORDER BY fecha DESC",
            (proyecto_id,),
        ).fetchall()]

        # Partes de trabajo
        proyecto["partes"] = [dict(r) for r in conn.execute(
            "SELECT * FROM proyecto_partes WHERE proyecto_id = ? ORDER BY fecha DESC",
            (proyecto_id,),
        ).fetchall()]

        # Resumen de partes (acumulados)
        rp = conn.execute("""
            SELECT COUNT(*) AS total_partes,
                   COALESCE(SUM(hincas_realizadas), 0) AS total_hincas,
                   COALESCE(SUM(horas_maquina), 0) AS total_horas_maquina,
                   COALESCE(SUM(horas_personal), 0) AS total_horas_personal,
                   COALESCE(SUM(combustible_litros), 0) AS total_combustible,
                   MIN(fecha) AS primera_fecha,
                   MAX(fecha) AS ultima_fecha
            FROM proyecto_partes WHERE proyecto_id = ?
        """, (proyecto_id,)).fetchone()
        proyecto["resumen_partes"] = dict(rp) if rp else {}

        # Recursos asignados
        proyecto["recursos"] = [dict(r) for r in conn.execute("""
            SELECT pr.*, t.nombre_canonico AS tercero_nombre
            FROM proyecto_recursos pr
            LEFT JOIN terceros t ON t.id = pr.tercero_id
            WHERE pr.proyecto_id = ? ORDER BY pr.tipo, pr.fecha_inicio
        """, (proyecto_id,)).fetchall()]

        # Facturas de cliente vinculadas: FK directa primero, fallback por nombre
        nombre_proy = (proyecto.get("nombre") or "").strip()
        try:
            # Primero por FK directa (proyecto_id)
            fc_cols = {r[1] for r in conn.execute("PRAGMA table_info(facturas_cliente)").fetchall()}
            if "proyecto_id" in fc_cols:
                proyecto["facturas_cliente"] = [dict(r) for r in conn.execute(
                    "SELECT * FROM facturas_cliente WHERE proyecto_id = ? ORDER BY fecha_factura DESC",
                    (proyecto_id,),
                ).fetchall()]
            else:
                proyecto["facturas_cliente"] = []
            # Fallback: si no hay por FK, buscar por nombre (facturas anteriores a la migración)
            if not proyecto["facturas_cliente"] and nombre_proy:
                proyecto["facturas_cliente"] = [dict(r) for r in conn.execute(
                    "SELECT * FROM facturas_cliente WHERE proyecto = ? ORDER BY fecha_factura DESC",
                    (nombre_proy,),
                ).fetchall()]
        except Exception:
            proyecto["facturas_cliente"] = []

        # Presupuestos vinculados
        pres_id = proyecto.get("presupuesto_id") or -1
        try:
            proyecto["presupuestos"] = [dict(r) for r in conn.execute("""
                SELECT p2.id, p2.referencia, p2.nombre_proyecto, p2.estado, p2.created_at,
                       v.revision, v.total, v.es_activa
                FROM presupuestos p2
                LEFT JOIN presupuesto_versiones v ON v.presupuesto_id = p2.id AND v.es_activa = 1
                WHERE p2.proyecto_id = ? OR p2.id = ?
                ORDER BY p2.created_at DESC
            """, (proyecto_id, pres_id)).fetchall()]
        except Exception:
            proyecto["presupuestos"] = []

        # Interacciones CRM (vía empresa CRM del cliente)
        try:
            if proyecto.get("cliente_tercero_id"):
                proyecto["interacciones"] = [dict(r) for r in conn.execute("""
                    SELECT i.*, c.nombre AS contacto_nombre, c.apellidos AS contacto_apellidos,
                           e.nombre AS empresa_nombre
                    FROM crm_interacciones i
                    LEFT JOIN crm_contactos c ON c.id = i.contacto_id
                    LEFT JOIN crm_empresas e ON e.id = i.empresa_id
                    WHERE i.empresa_id IN (
                        SELECT id FROM crm_empresas WHERE tercero_id = ?
                    )
                    ORDER BY i.fecha DESC LIMIT 20
                """, (proyecto["cliente_tercero_id"],)).fetchall()]
            else:
                proyecto["interacciones"] = []
        except Exception:
            proyecto["interacciones"] = []

        # Documentos del proyecto
        try:
            proyecto["documentos"] = [dict(r) for r in conn.execute(
                "SELECT * FROM proyecto_documentos WHERE proyecto_id = ? ORDER BY fecha_documento DESC, created_at DESC",
                (proyecto_id,),
            ).fetchall()]
        except Exception:
            proyecto["documentos"] = []

        # Certificaciones
        try:
            proyecto["certificaciones"] = [dict(r) for r in conn.execute("""
                SELECT c.*, fc.numero_factura AS factura_ref
                FROM certificaciones c
                LEFT JOIN facturas_cliente fc ON fc.id = c.factura_cliente_id
                WHERE c.proyecto_id = ? ORDER BY c.numero DESC
            """, (proyecto_id,)).fetchall()]
        except Exception:
            proyecto["certificaciones"] = []

        # Costes (facturas de proveedor imputadas al proyecto)
        try:
            proyecto["costes"] = [dict(r) for r in conn.execute("""
                SELECT fp.id, fp.fecha_factura, fp.proveedor, fp.nif_proveedor,
                       fp.resumen_concepto, fp.numero_factura,
                       fp.base_imponible, fp.iva, fp.total_a_pagar, fp.total,
                       fp.estado_pago, fp.categoria
                FROM facturas_proveedor fp
                WHERE fp.proyecto_id = ?
                ORDER BY fp.fecha_factura DESC
            """, (proyecto_id,)).fetchall()]
        except Exception:
            proyecto["costes"] = []

        # Resumen de costes
        try:
            rc = conn.execute("""
                SELECT COUNT(*) AS total_facturas,
                       COALESCE(SUM(CAST(
                           REPLACE(REPLACE(COALESCE(total_a_pagar, total, '0'), '.', ''), ',', '.')
                       AS REAL)), 0) AS total_costes
                FROM facturas_proveedor WHERE proyecto_id = ?
            """, (proyecto_id,)).fetchone()
            proyecto["resumen_costes"] = dict(rc) if rc else {}
        except Exception:
            proyecto["resumen_costes"] = {}

        return proyecto


def crear_proyecto(data: dict) -> dict:
    init_proyectos_db()
    ahora = _now()
    with _conectar() as conn:
        codigo = _generar_codigo_proyecto(conn)
        conn.execute("""
            INSERT INTO proyectos (nombre, codigo, empresa_id, cliente_tercero_id, oportunidad_id,
                presupuesto_id,
                estado, tipo_trabajo, modalidad_facturacion, nombre_parque, ubicacion_texto,
                ubicacion_lat, ubicacion_lon, provincia, direccion, municipio, mw_parque, hincas_estimadas,
                precio_unitario_hinca, precio_hora_maquina, precio_hora_ayudante, precio_jornada,
                importe_presupuestado, fecha_inicio_estimada, fecha_fin_estimada, notas,
                tipo_actividad, hinca_cantidad, hinca_precio_prod_operador, hinca_precio_prod_ayudante,
                hinca_precio_admin_operador, hinca_precio_admin_ayudante,
                perforacion_cantidad, perforacion_precio_prod_operador, perforacion_precio_prod_ayudante,
                perforacion_precio_admin_operador, perforacion_precio_admin_ayudante,
                dias_laborables,
                created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            (data.get("nombre") or "").strip(),
            codigo,
            data.get("empresa_id", ""),
            data.get("cliente_tercero_id") or None,
            data.get("oportunidad_id") or None,
            data.get("presupuesto_id") or None,
            (data.get("estado") or "cotizado").strip(),
            (data.get("tipo_trabajo") or "").strip() or None,
            (data.get("modalidad_facturacion") or "").strip() or None,
            (data.get("nombre_parque") or "").strip() or None,
            (data.get("ubicacion_texto") or "").strip() or None,
            data.get("ubicacion_lat") or None,
            data.get("ubicacion_lon") or None,
            (data.get("provincia") or "").strip() or None,
            (data.get("direccion") or "").strip() or None,
            (data.get("municipio") or "").strip() or None,
            data.get("mw_parque") or None,
            data.get("hincas_estimadas") or None,
            data.get("precio_unitario_hinca") or None,
            data.get("precio_hora_maquina") or None,
            data.get("precio_hora_ayudante") or None,
            data.get("precio_jornada") or None,
            data.get("importe_presupuestado") or None,
            (data.get("fecha_inicio_estimada") or "").strip() or None,
            (data.get("fecha_fin_estimada") or "").strip() or None,
            (data.get("notas") or "").strip() or None,
            data.get("tipo_actividad") or "hinca",
            data.get("hinca_cantidad") or 0,
            data.get("hinca_precio_prod_operador") or 0,
            data.get("hinca_precio_prod_ayudante") or 0,
            data.get("hinca_precio_admin_operador") or 1300,
            data.get("hinca_precio_admin_ayudante") or 1600,
            data.get("perforacion_cantidad") or 0,
            data.get("perforacion_precio_prod_operador") or 0,
            data.get("perforacion_precio_prod_ayudante") or 0,
            data.get("perforacion_precio_admin_operador") or 0,
            data.get("perforacion_precio_admin_ayudante") or 0,
            (data.get("dias_laborables") or "LMXJV").strip() or "LMXJV",
            ahora, ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        estado = (data.get("estado") or "cotizado").strip()
        conn.execute("""
            INSERT INTO proyecto_historial (proyecto_id, estado_anterior, estado_nuevo, fecha)
            VALUES (?, NULL, ?, ?)
        """, (new_id, estado, ahora))

        # If linked to oportunidad, mark it as ganada
        op_id = data.get("oportunidad_id")
        if op_id:
            conn.execute(
                "UPDATE crm_oportunidades SET estado = 'ganada', fecha_actualizacion = ? WHERE id = ? AND estado != 'ganada'",
                (ahora, op_id),
            )

    return obtener_proyecto(new_id)


def actualizar_proyecto(proyecto_id: int, data: dict) -> dict | None:
    init_proyectos_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT id, estado, codigo FROM proyectos WHERE id = ?", (proyecto_id,)).fetchone()
        if not row:
            return None
        estado_anterior = row["estado"]
        codigo_existente = row["codigo"]
        nuevo_estado = (data.get("estado") or estado_anterior).strip()
        conn.execute("""
            UPDATE proyectos SET nombre=?, codigo=?, cliente_tercero_id=?, oportunidad_id=?,
                presupuesto_id=?,
                estado=?, tipo_trabajo=?, modalidad_facturacion=?, nombre_parque=?, ubicacion_texto=?,
                ubicacion_lat=?, ubicacion_lon=?, provincia=?, direccion=?, municipio=?, mw_parque=?, hincas_estimadas=?,
                precio_unitario_hinca=?, precio_hora_maquina=?, precio_hora_ayudante=?, precio_jornada=?,
                importe_presupuestado=?, fecha_inicio_estimada=?, fecha_fin_estimada=?,
                fecha_inicio_real=?, fecha_fin_real=?, notas=?,
                tipo_actividad=?, hinca_cantidad=?, hinca_precio_prod_operador=?, hinca_precio_prod_ayudante=?,
                hinca_precio_admin_operador=?, hinca_precio_admin_ayudante=?,
                perforacion_cantidad=?, perforacion_precio_prod_operador=?, perforacion_precio_prod_ayudante=?,
                perforacion_precio_admin_operador=?, perforacion_precio_admin_ayudante=?,
                dias_laborables=?,
                updated_at=?
            WHERE id=?
        """, (
            (data.get("nombre") or "").strip(),
            codigo_existente,
            data.get("cliente_tercero_id") or None,
            data.get("oportunidad_id") or None,
            data.get("presupuesto_id") or None,
            nuevo_estado,
            (data.get("tipo_trabajo") or "").strip() or None,
            (data.get("modalidad_facturacion") or "").strip() or None,
            (data.get("nombre_parque") or "").strip() or None,
            (data.get("ubicacion_texto") or "").strip() or None,
            data.get("ubicacion_lat") or None,
            data.get("ubicacion_lon") or None,
            (data.get("provincia") or "").strip() or None,
            (data.get("direccion") or "").strip() or None,
            (data.get("municipio") or "").strip() or None,
            data.get("mw_parque") or None,
            data.get("hincas_estimadas") or None,
            data.get("precio_unitario_hinca") or None,
            data.get("precio_hora_maquina") or None,
            data.get("precio_hora_ayudante") or None,
            data.get("precio_jornada") or None,
            data.get("importe_presupuestado") or None,
            (data.get("fecha_inicio_estimada") or "").strip() or None,
            (data.get("fecha_fin_estimada") or "").strip() or None,
            (data.get("fecha_inicio_real") or "").strip() or None,
            (data.get("fecha_fin_real") or "").strip() or None,
            (data.get("notas") or "").strip() or None,
            data.get("tipo_actividad") or "hinca",
            data.get("hinca_cantidad") or 0,
            data.get("hinca_precio_prod_operador") or 0,
            data.get("hinca_precio_prod_ayudante") or 0,
            data.get("hinca_precio_admin_operador") or 1300,
            data.get("hinca_precio_admin_ayudante") or 1600,
            data.get("perforacion_cantidad") or 0,
            data.get("perforacion_precio_prod_operador") or 0,
            data.get("perforacion_precio_prod_ayudante") or 0,
            data.get("perforacion_precio_admin_operador") or 0,
            data.get("perforacion_precio_admin_ayudante") or 0,
            (data.get("dias_laborables") or "LMXJV").strip() or "LMXJV",
            ahora, proyecto_id,
        ))
        if nuevo_estado != estado_anterior:
            conn.execute("""
                INSERT INTO proyecto_historial (proyecto_id, estado_anterior, estado_nuevo, fecha, motivo)
                VALUES (?, ?, ?, ?, ?)
            """, (proyecto_id, estado_anterior, nuevo_estado, ahora,
                  (data.get("motivo") or "").strip() or None))
    return obtener_proyecto(proyecto_id)


def cambiar_estado_proyecto(proyecto_id: int, nuevo_estado: str, motivo: str | None = None) -> dict | None:
    init_proyectos_db()
    if nuevo_estado not in _ESTADOS:
        return None
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT id, estado FROM proyectos WHERE id = ?", (proyecto_id,)).fetchone()
        if not row:
            return None
        estado_anterior = row["estado"]
        updates = ["estado = ?", "updated_at = ?"]
        params: list[Any] = [nuevo_estado, ahora]
        if nuevo_estado == "vivo" and estado_anterior == "cotizado":
            updates.append("fecha_inicio_real = COALESCE(fecha_inicio_real, ?)")
            params.append(ahora[:10])
        if nuevo_estado == "terminado":
            updates.append("fecha_fin_real = COALESCE(fecha_fin_real, ?)")
            params.append(ahora[:10])
        params.append(proyecto_id)
        conn.execute(f"UPDATE proyectos SET {', '.join(updates)} WHERE id = ?", params)
        if nuevo_estado != estado_anterior:
            conn.execute("""
                INSERT INTO proyecto_historial (proyecto_id, estado_anterior, estado_nuevo, fecha, motivo)
                VALUES (?, ?, ?, ?, ?)
            """, (proyecto_id, estado_anterior, nuevo_estado, ahora, motivo))
    return obtener_proyecto(proyecto_id)


# ── Partes de trabajo ────────────────────────────────────────────────────────

def listar_partes(proyecto_id: int) -> list[dict]:
    init_proyectos_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT * FROM proyecto_partes WHERE proyecto_id = ? ORDER BY fecha DESC", (proyecto_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def crear_parte(proyecto_id: int, data: dict) -> dict:
    init_proyectos_db()
    ahora = _now()
    hincas = int(data.get("hincas_realizadas") or 0)
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO proyecto_partes (proyecto_id, fecha, hincas_realizadas, horas_maquina,
                horas_personal, num_operadores, num_ayudantes, horas_admin, incidencias,
                condiciones_terreno, meteorologia, combustible_litros, notas, imagen_archivo,
                created_at, updated_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            proyecto_id,
            (data.get("fecha") or ahora[:10]).strip(),
            hincas,
            data.get("horas_maquina") or 0,
            data.get("horas_personal") or 0,
            data.get("num_operadores") or 1,
            data.get("num_ayudantes") or 0,
            data.get("horas_admin") or 0,
            (data.get("incidencias") or "").strip() or None,
            (data.get("condiciones_terreno") or "").strip() or None,
            (data.get("meteorologia") or "").strip() or None,
            data.get("combustible_litros") or None,
            (data.get("notas") or "").strip() or None,
            (data.get("imagen_archivo") or "").strip() or None,
            ahora, None,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Update project hincas_realizadas
        if hincas > 0:
            conn.execute(
                "UPDATE proyectos SET hincas_realizadas = COALESCE(hincas_realizadas, 0) + ?, updated_at = ? WHERE id = ?",
                (hincas, ahora, proyecto_id),
            )
        return dict(conn.execute("SELECT * FROM proyecto_partes WHERE id = ?", (new_id,)).fetchone())


def actualizar_parte(parte_id: int, data: dict) -> dict | None:
    init_proyectos_db()
    ahora = _now()
    with _conectar() as conn:
        old = conn.execute("SELECT * FROM proyecto_partes WHERE id = ?", (parte_id,)).fetchone()
        if not old:
            return None
        old_hincas = old["hincas_realizadas"] or 0
        new_hincas = int(data.get("hincas_realizadas") or 0)
        conn.execute("""
            UPDATE proyecto_partes SET fecha=?, hincas_realizadas=?, horas_maquina=?,
                horas_personal=?, num_operadores=?, num_ayudantes=?, horas_admin=?,
                incidencias=?, condiciones_terreno=?, meteorologia=?, combustible_litros=?,
                notas=?, estado_firma=?, updated_by=?
            WHERE id=?
        """, (
            (data.get("fecha") or "").strip(),
            new_hincas,
            data.get("horas_maquina") or 0,
            data.get("horas_personal") or 0,
            data.get("num_operadores") or 1,
            data.get("num_ayudantes") or 0,
            data.get("horas_admin") or 0,
            (data.get("incidencias") or "").strip() or None,
            (data.get("condiciones_terreno") or "").strip() or None,
            (data.get("meteorologia") or "").strip() or None,
            data.get("combustible_litros") or None,
            (data.get("notas") or "").strip() or None,
            (data.get("estado_firma") or "").strip() or None,
            None, parte_id,
        ))
        diff = new_hincas - old_hincas
        if diff != 0:
            conn.execute(
                "UPDATE proyectos SET hincas_realizadas = MAX(0, COALESCE(hincas_realizadas, 0) + ?), updated_at = ? WHERE id = ?",
                (diff, ahora, old["proyecto_id"]),
            )
        return dict(conn.execute("SELECT * FROM proyecto_partes WHERE id = ?", (parte_id,)).fetchone())


def eliminar_parte(parte_id: int) -> bool:
    init_proyectos_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT proyecto_id, hincas_realizadas FROM proyecto_partes WHERE id = ?", (parte_id,)).fetchone()
        if not row:
            return False
        hincas = row["hincas_realizadas"] or 0
        conn.execute("DELETE FROM proyecto_partes WHERE id = ?", (parte_id,))
        if hincas > 0:
            conn.execute(
                "UPDATE proyectos SET hincas_realizadas = MAX(0, COALESCE(hincas_realizadas, 0) - ?), updated_at = ? WHERE id = ?",
                (hincas, ahora, row["proyecto_id"]),
            )
    return True


# ── Recursos ─────────────────────────────────────────────────────────────────

def asignar_recurso(proyecto_id: int, data: dict) -> dict:
    init_proyectos_db()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO proyecto_recursos (proyecto_id, tipo, tercero_id, descripcion, fecha_inicio, fecha_fin, notas)
            VALUES (?,?,?,?,?,?,?)
        """, (
            proyecto_id,
            (data.get("tipo") or "otro").strip(),
            data.get("tercero_id") or None,
            (data.get("descripcion") or "").strip() or None,
            (data.get("fecha_inicio") or "").strip() or None,
            (data.get("fecha_fin") or "").strip() or None,
            (data.get("notas") or "").strip() or None,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM proyecto_recursos WHERE id = ?", (new_id,)).fetchone())


def desasignar_recurso(recurso_id: int) -> bool:
    init_proyectos_db()
    with _conectar() as conn:
        n = conn.execute("UPDATE proyecto_recursos SET activo = 0 WHERE id = ? AND activo = 1", (recurso_id,)).rowcount
    return n > 0


# ── Dashboard ────────────────────────────────────────────────────────────────

def dashboard() -> dict:
    init_proyectos_db()
    import datetime
    mes = datetime.datetime.utcnow().strftime("%Y-%m")
    with _conectar() as conn:
        por_estado = {}
        for e in _ESTADOS:
            por_estado[e] = conn.execute("SELECT COUNT(*) FROM proyectos WHERE estado = ?", (e,)).fetchone()[0]
        hincas_mes = conn.execute(
            "SELECT COALESCE(SUM(hincas_realizadas), 0) FROM proyecto_partes WHERE fecha LIKE ?", (mes + "%",)
        ).fetchone()[0]
        horas_mes = conn.execute(
            "SELECT COALESCE(SUM(horas_maquina), 0) FROM proyecto_partes WHERE fecha LIKE ?", (mes + "%",)
        ).fetchone()[0]
        facturado = conn.execute(
            "SELECT COALESCE(SUM(importe_facturado), 0) FROM proyectos WHERE estado IN ('vivo','terminado')"
        ).fetchone()[0]
        costes = conn.execute(
            "SELECT COALESCE(SUM(importe_costes), 0) FROM proyectos WHERE estado IN ('vivo','terminado')"
        ).fetchone()[0]
    return {
        "por_estado": por_estado,
        "hincas_mes": hincas_mes,
        "horas_maquina_mes": round(horas_mes, 1),
        "importe_facturado": round(facturado, 2),
        "importe_costes": round(costes, 2),
    }


def dashboard_landing() -> dict:
    """Complete landing page dashboard with KPIs, pipeline, health table, production, top clients."""
    init_proyectos_db()
    from datetime import date, timedelta
    import calendar

    hoy = date.today()
    anio = hoy.year
    mes_actual = hoy.strftime("%Y-%m")
    m_prev = hoy.month - 1
    y_prev = hoy.year
    if m_prev < 1:
        m_prev = 12; y_prev -= 1
    mes_anterior = f"{y_prev}-{m_prev:02d}"
    dias_en_mes = calendar.monthrange(hoy.year, hoy.month)[1]

    with _conectar() as conn:
        # ── KPIs globales ──
        vivos = conn.execute("SELECT COUNT(*) FROM proyectos WHERE estado IN ('vivo','en_curso')").fetchone()[0]
        cotizados = conn.execute("SELECT COUNT(*) FROM proyectos WHERE estado='cotizado'").fetchone()[0]

        # Facturado YTD from facturas_cliente
        fact_ytd = 0
        fact_ytd_prev = 0
        try:
            for r in conn.execute("SELECT total_a_pagar, fecha_factura FROM facturas_cliente").fetchall():
                val = _safe_float(r["total_a_pagar"])
                f = r["fecha_factura"] or ""
                if f[:4] == str(anio):
                    # Only count up to current month/day for fair comparison
                    fact_ytd += val
                elif f[:4] == str(anio - 1) and f[5:10] <= hoy.strftime("%m-%d"):
                    fact_ytd_prev += val
        except Exception:
            pass
        fact_ytd_var = round((fact_ytd - fact_ytd_prev) / fact_ytd_prev * 100, 1) if fact_ytd_prev > 0 else 0

        # Margen medio proyectos vivos
        margenes = []
        proy_vivos = [dict(r) for r in conn.execute("""
            SELECT p.id, p.nombre, p.codigo, p.estado, p.tipo_actividad, p.modalidad_facturacion,
                   COALESCE(NULLIF(p.hinca_cantidad,0), p.hincas_estimadas) as hincas_estimadas, p.hincas_realizadas, p.perforacion_cantidad,
                   p.importe_presupuestado, p.importe_facturado, p.importe_costes,
                   p.fecha_inicio_estimada, p.fecha_fin_estimada, p.fecha_inicio_real, p.fecha_fin_real,
                   p.ubicacion_lat, p.ubicacion_lon, p.provincia,
                   COALESCE(t.nombre_canonico, '') as cliente
            FROM proyectos p
            LEFT JOIN terceros t ON t.id = p.cliente_tercero_id
            WHERE p.estado IN ('vivo','en_curso')
            ORDER BY COALESCE(p.importe_presupuestado, 0) DESC
        """).fetchall()]
        for pv in proy_vivos:
            fac = _safe_float(pv.get("importe_facturado"))
            cos = _safe_float(pv.get("importe_costes"))
            if fac > 0:
                margenes.append(round((fac - cos) / fac * 100, 1))
        margen_medio = round(sum(margenes) / len(margenes), 1) if margenes else 0
        margen_status = "saludable" if margen_medio > 25 else ("atencion" if margen_medio > 15 else "riesgo")

        # Hincas mes actual vs anterior
        hincas_mes = conn.execute("SELECT COALESCE(SUM(hincas_realizadas),0) FROM proyecto_partes WHERE fecha LIKE ?", (mes_actual + "%",)).fetchone()[0]
        hincas_prev = conn.execute("SELECT COALESCE(SUM(hincas_realizadas),0) FROM proyecto_partes WHERE fecha LIKE ?", (mes_anterior + "%",)).fetchone()[0]

        # Horas maq mes + maquinas activas
        horas_mes = conn.execute("SELECT COALESCE(SUM(horas_maquina),0) FROM proyecto_partes WHERE fecha LIKE ?", (mes_actual + "%",)).fetchone()[0]
        try:
            maq_activas = conn.execute(
                "SELECT COUNT(DISTINCT recurso_id) FROM proyecto_asignaciones WHERE recurso_tipo='maquina' AND fecha LIKE ?",
                (mes_actual + "%",)
            ).fetchone()[0]
        except Exception:
            maq_activas = 0

        # En riesgo count
        en_riesgo = 0
        for pv in proy_vivos:
            fac = _safe_float(pv.get("importe_facturado"))
            cos = _safe_float(pv.get("importe_costes"))
            m_pct = round((fac - cos) / fac * 100, 1) if fac > 0 else 0
            hincas_est = pv.get("hinca_cantidad") or pv.get("hincas_estimadas") or 0
            hincas_real = pv.get("hincas_realizadas") or 0
            avance = round(hincas_real / hincas_est * 100, 1) if hincas_est > 0 else 0
            if m_pct < 15 or (avance < 50 and hincas_est > 0):
                en_riesgo += 1

        kpis = {
            "vivos": vivos, "cotizados": cotizados,
            "facturado_ytd": round(fact_ytd, 2), "facturado_ytd_var": fact_ytd_var,
            "margen_medio_pct": margen_medio, "margen_status": margen_status,
            "hincas_mes": hincas_mes, "hincas_prev": hincas_prev,
            "horas_maq_mes": round(horas_mes, 1), "maquinas_activas": maq_activas,
            "en_riesgo": en_riesgo,
        }

        # ── Pipeline with leads ──
        # Leads from CRM
        pip_leads = {"c": 0, "s": 0}
        try:
            r = conn.execute("SELECT COUNT(*) as c, COALESCE(SUM(importe_estimado),0) as s FROM crm_oportunidades WHERE estado NOT IN ('ganada','perdida','descartada')").fetchone()
            pip_leads = {"c": r["c"], "s": _safe_float(r["s"])}
        except Exception:
            pass
        pip_cotizados = conn.execute("SELECT COUNT(*) as c, COALESCE(SUM(importe_presupuestado),0) as s FROM proyectos WHERE estado='cotizado'").fetchone()
        pip_adjudicados = conn.execute("SELECT COUNT(*) as c, COALESCE(SUM(importe_presupuestado),0) as s FROM proyectos WHERE estado='adjudicado'").fetchone()
        pip_vivos = conn.execute("SELECT COUNT(*) as c, COALESCE(SUM(importe_presupuestado),0) as s FROM proyectos WHERE estado IN ('vivo','en_curso')").fetchone()
        pip_terminados = conn.execute("SELECT COUNT(*) as c, COALESCE(SUM(importe_facturado),0) as s FROM proyectos WHERE estado='terminado' AND SUBSTR(COALESCE(fecha_fin_real, created_at),1,4)=?", (str(anio),)).fetchone()
        total_pipeline = _safe_float(pip_cotizados["s"]) + _safe_float(pip_adjudicados["s"]) + _safe_float(pip_vivos["s"])
        total_count = pip_cotizados["c"] + pip_adjudicados["c"] + pip_vivos["c"] + pip_terminados["c"]

        pipeline = {
            "leads": {"count": pip_leads["c"], "importe": round(pip_leads["s"], 0)},
            "cotizados": {"count": pip_cotizados["c"], "importe": round(_safe_float(pip_cotizados["s"]), 0)},
            "adjudicados": {"count": pip_adjudicados["c"], "importe": round(_safe_float(pip_adjudicados["s"]), 0)},
            "vivos": {"count": pip_vivos["c"], "importe": round(_safe_float(pip_vivos["s"]), 0)},
            "terminados_ytd": {"count": pip_terminados["c"], "importe": round(_safe_float(pip_terminados["s"]), 0)},
            "tasa_conversion": round(pip_adjudicados["c"] / max(pip_adjudicados["c"] + pip_cotizados["c"], 1) * 100, 0),
            "pipeline_total": round(total_pipeline, 0),
            "ticket_medio": round(total_pipeline / max(total_count, 1), 0),
        }

        # ── Proyectos activos con salud ──
        proyectos_activos = []
        for pv in proy_vivos:
            fac = _safe_float(pv.get("importe_facturado"))
            cos = _safe_float(pv.get("importe_costes"))
            pres = _safe_float(pv.get("importe_presupuestado"))
            m_pct = round((fac - cos) / fac * 100, 1) if fac > 0 else 0
            hincas_est = pv.get("hinca_cantidad") or pv.get("hincas_estimadas") or 0
            hincas_real = pv.get("hincas_realizadas") or 0
            avance = round(hincas_real / hincas_est * 100, 1) if hincas_est > 0 else 0

            # Health
            if m_pct < 15 or (avance < 50 and hincas_est > 0):
                salud = "riesgo"
            elif m_pct < 25 or (avance < 75 and hincas_est > 0):
                salud = "atencion"
            else:
                salud = "saludable"

            proyectos_activos.append({
                "id": pv["id"], "codigo": pv.get("codigo") or "", "nombre": pv["nombre"],
                "cliente": pv.get("cliente") or "", "provincia": pv.get("provincia") or "",
                "ubicacion_lat": pv.get("ubicacion_lat"), "ubicacion_lon": pv.get("ubicacion_lon"),
                "avance_pct": avance, "importe_facturado": round(fac, 0), "importe_presupuestado": round(pres, 0),
                "margen_pct": m_pct, "salud": salud,
            })
        salud_order = {"riesgo": 0, "atencion": 1, "saludable": 2}
        proyectos_activos.sort(key=lambda x: (salud_order.get(x["salud"], 9), -x["importe_presupuestado"]))

        # ── Alertas ──
        alertas = []
        riesgo_proys = [p["nombre"] for p in proyectos_activos if p["salud"] == "riesgo"]
        if riesgo_proys:
            alertas.append({"nivel": "RIESGO", "contexto": f"{len(riesgo_proys)} proyecto(s)", "descripcion": "Margen bajo o avance insuficiente: " + ", ".join(riesgo_proys[:3])})
        try:
            sin_firmar = conn.execute("SELECT COUNT(*) FROM proyecto_partes WHERE COALESCE(estado_firma,'borrador') != 'firmado' AND fecha < ?", ((hoy - timedelta(days=3)).isoformat(),)).fetchone()[0]
            if sin_firmar:
                alertas.append({"nivel": "ATENCION", "contexto": "Partes", "descripcion": f"{sin_firmar} parte(s) sin firmar hace +3 d\u00edas"})
        except Exception:
            pass
        try:
            certs_pend = conn.execute("SELECT COUNT(*) FROM certificaciones WHERE estado IN ('borrador','enviada')").fetchone()[0]
            if certs_pend:
                alertas.append({"nivel": "ATENCION", "contexto": "Certificaciones", "descripcion": f"{certs_pend} certificaci\u00f3n(es) pendiente(s)"})
        except Exception:
            pass
        near_complete = [p["nombre"] for p in proyectos_activos if p["avance_pct"] >= 80]
        if near_complete:
            alertas.append({"nivel": "INFO", "contexto": "Pr\u00f3ximos a terminar", "descripcion": ", ".join(near_complete[:3]) + (" y m\u00e1s" if len(near_complete) > 3 else "")})

        # ── Produccion mes ──
        prod_actual = {}
        for r in conn.execute("SELECT SUBSTR(fecha,9,2) as dia, SUM(hincas_realizadas) as h FROM proyecto_partes WHERE fecha LIKE ? GROUP BY dia ORDER BY dia", (mes_actual + "%",)).fetchall():
            prod_actual[int(r["dia"])] = r["h"] or 0
        prod_anterior = {}
        for r in conn.execute("SELECT SUBSTR(fecha,9,2) as dia, SUM(hincas_realizadas) as h FROM proyecto_partes WHERE fecha LIKE ? GROUP BY dia ORDER BY dia", (mes_anterior + "%",)).fetchall():
            prod_anterior[int(r["dia"])] = r["h"] or 0

        dias_arr = list(range(1, dias_en_mes + 1))
        actual_arr = [prod_actual.get(d, 0) for d in dias_arr]
        anterior_arr = [prod_anterior.get(d, 0) for d in dias_arr]
        total_actual = sum(actual_arr)
        total_anterior = sum(prod_anterior.values())
        dias_con_datos = sum(1 for v in actual_arr if v > 0)
        media_dia = round(total_actual / max(dias_con_datos, 1), 1)
        mejor_dia = max(actual_arr) if actual_arr else 0

        # Objetivo diario: total hincas estimadas de vivos / meses restantes estimados / dias laborables
        total_obj = sum(pv.get("hinca_cantidad") or pv.get("hincas_estimadas") or 0 for pv in proy_vivos)
        obj_diario = round(total_obj / max(dias_en_mes * 6, 1), 1)  # rough: 6 months avg

        produccion_mes = {
            "dias": dias_arr, "mes_actual": actual_arr, "mes_anterior": anterior_arr,
            "objetivo_diario": obj_diario,
            "total_mes": total_actual, "media_dia": media_dia, "mejor_dia": mejor_dia,
            "vs_anterior_pct": round((total_actual - total_anterior) / max(total_anterior, 1) * 100, 1),
        }

        # ── Top clientes YTD ──
        top_clientes = [dict(r) for r in conn.execute("""
            SELECT t.nombre_canonico as nombre, SUM(p.importe_facturado) as total
            FROM proyectos p
            JOIN terceros t ON t.id = p.cliente_tercero_id
            WHERE p.importe_facturado > 0
            GROUP BY p.cliente_tercero_id ORDER BY total DESC LIMIT 7
        """).fetchall()]

    return {
        "kpis_globales": kpis,
        "pipeline": pipeline,
        "proyectos_activos": proyectos_activos,
        "alertas": alertas[:8],
        "produccion_mes": produccion_mes,
        "top_clientes_ytd": top_clientes,
    }


# ── Certificaciones ──────────────────────────────────────────────────────────


def crear_certificacion(proyecto_id: int, fecha_desde: str, fecha_hasta: str, precios: dict) -> dict:
    """Genera una certificación a partir de los partes de trabajo entre las fechas dadas."""
    init_proyectos_db()
    if fecha_desde > fecha_hasta:
        fecha_desde, fecha_hasta = fecha_hasta, fecha_desde
    with _conectar() as conn:
        partes = conn.execute("""
            SELECT * FROM proyecto_partes
            WHERE proyecto_id = ? AND fecha >= ? AND fecha <= ?
            ORDER BY fecha ASC
        """, [proyecto_id, fecha_desde, fecha_hasta]).fetchall()

        total_hincas = sum(p['hincas_realizadas'] or 0 for p in partes)
        total_horas_admin = sum(p['horas_admin'] or 0 for p in partes)

        precio_hinca = precios.get('precio_hinca', 0)
        precio_hora_admin = precios.get('precio_hora_admin', 0)
        importe_transporte = precios.get('importe_transporte', 0)

        importe_produccion = total_hincas * precio_hinca
        importe_administracion = total_horas_admin * precio_hora_admin
        importe_total = importe_produccion + importe_administracion + importe_transporte

        row = conn.execute(
            "SELECT COALESCE(MAX(numero), 0) + 1 FROM certificaciones WHERE proyecto_id = ?",
            [proyecto_id],
        ).fetchone()
        numero = row[0]

        if total_hincas > 0 and total_horas_admin > 0:
            tipo = 'mixto'
        elif total_hincas > 0:
            tipo = 'produccion'
        else:
            tipo = 'administracion'

        ahora = _now()
        conn.execute("""
            INSERT INTO certificaciones
            (proyecto_id, numero, fecha_desde, fecha_hasta, tipo,
             total_hincas, precio_hinca, importe_produccion,
             total_horas_admin, precio_hora_admin, importe_administracion,
             importe_transporte, importe_total, estado, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador', ?)
        """, [proyecto_id, numero, fecha_desde, fecha_hasta, tipo,
              total_hincas, precio_hinca, importe_produccion,
              total_horas_admin, precio_hora_admin, importe_administracion,
              importe_transporte, importe_total, ahora])

        cert_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        for p in partes:
            conn.execute("""
                INSERT INTO certificacion_detalle
                (certificacion_id, fecha, descripcion, hincas, horas_admin, parte_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, [cert_id, p['fecha'], p['notas'] or p['incidencias'] or '',
                  p['hincas_realizadas'] or 0, p['horas_admin'] or 0, p['id']])

        return dict(conn.execute("SELECT * FROM certificaciones WHERE id = ?", [cert_id]).fetchone())


def listar_certificaciones(proyecto_id: int) -> list:
    init_proyectos_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute("""
            SELECT c.*, fc.numero_factura AS factura_ref
            FROM certificaciones c
            LEFT JOIN facturas_cliente fc ON fc.id = c.factura_cliente_id
            WHERE c.proyecto_id = ? ORDER BY c.numero DESC
        """, [proyecto_id]).fetchall()]


def obtener_certificacion(cert_id: int) -> dict | None:
    init_proyectos_db()
    with _conectar() as conn:
        cert = conn.execute("SELECT * FROM certificaciones WHERE id = ?", [cert_id]).fetchone()
        if not cert:
            return None
        cert = dict(cert)
        cert['detalle'] = [dict(r) for r in conn.execute("""
            SELECT * FROM certificacion_detalle WHERE certificacion_id = ? ORDER BY fecha ASC
        """, [cert_id]).fetchall()]
        return cert


# ── Asignaciones diarias ─────────────────────────────────────────────────

def asignar_recurso(proyecto_id: int, recurso_tipo: str, recurso_id: int,
                    recurso_nombre: str, fecha: str, notas: str = "",
                    funcion_dia: str | None = None) -> dict | None:
    init_proyectos_db()
    with _conectar() as conn:
        try:
            conn.execute(
                "INSERT INTO proyecto_asignaciones (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, notas, funcion_dia, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, notas or None, funcion_dia, _now()),
            )
            row = conn.execute(
                "SELECT * FROM proyecto_asignaciones WHERE recurso_tipo=? AND recurso_id=? AND fecha=?",
                (recurso_tipo, recurso_id, fecha),
            ).fetchone()
            return dict(row) if row else None
        except Exception:
            return None  # UNIQUE violation — already assigned


def asignar_rango(proyecto_id: int, recurso_tipo: str, recurso_id: int,
                  recurso_nombre: str, fecha_desde: str, fecha_hasta: str,
                  funcion_dia: str | None = None) -> int:
    """Assign a resource for each weekday in [fecha_desde, fecha_hasta]. Returns count."""
    from datetime import datetime as _dt, timedelta as _td
    init_proyectos_db()
    d = _dt.strptime(fecha_desde, "%Y-%m-%d").date()
    end = _dt.strptime(fecha_hasta, "%Y-%m-%d").date()
    ahora = _now()
    count = 0
    with _conectar() as conn:
        while d <= end:
            if d.weekday() < 5:  # Mon-Fri
                try:
                    conn.execute(
                        "INSERT OR IGNORE INTO proyecto_asignaciones"
                        " (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, funcion_dia, created_at)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, d.isoformat(), funcion_dia, ahora),
                    )
                    count += 1
                except Exception:
                    pass
            d += _td(days=1)
    return count


def asignar_fechas(proyecto_id: int, recurso_tipo: str, recurso_id: int,
                   recurso_nombre: str, fechas: list[str]) -> int:
    """Insert assignments for a list of specific dates. Returns count inserted."""
    init_proyectos_db()
    ahora = _now()
    count = 0
    with _conectar() as conn:
        for fecha in fechas:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO proyecto_asignaciones"
                    " (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (proyecto_id, recurso_tipo, recurso_id, recurso_nombre, fecha, ahora),
                )
                count += 1
            except Exception:
                pass
    return count


def desasignar(proyecto_id: int, recurso_tipo: str, recurso_id: int, fecha: str) -> bool:
    init_proyectos_db()
    with _conectar() as conn:
        n = conn.execute(
            "DELETE FROM proyecto_asignaciones WHERE proyecto_id=? AND recurso_tipo=? AND recurso_id=? AND fecha=?",
            (proyecto_id, recurso_tipo, recurso_id, fecha),
        ).rowcount
        return n > 0


def desasignar_rango(proyecto_id: int, recurso_tipo: str, recurso_id: int,
                     fecha_desde: str, fecha_hasta: str) -> int:
    init_proyectos_db()
    with _conectar() as conn:
        n = conn.execute(
            "DELETE FROM proyecto_asignaciones WHERE proyecto_id=? AND recurso_tipo=? AND recurso_id=?"
            " AND fecha >= ? AND fecha <= ?",
            (proyecto_id, recurso_tipo, recurso_id, fecha_desde, fecha_hasta),
        ).rowcount
        return n


def obtener_asignaciones_proyecto(proyecto_id: int, fecha_desde: str = "", fecha_hasta: str = "",
                                  recurso_tipo: str = "", recurso_id: int | None = None) -> list[dict]:
    init_proyectos_db()
    conn = _get_conn()
    try:
        where = "proyecto_id = ?"
        params: list = [proyecto_id]
        if fecha_desde:
            where += " AND fecha >= ?"
            params.append(fecha_desde)
        if fecha_hasta:
            where += " AND fecha <= ?"
            params.append(fecha_hasta)
        if recurso_tipo:
            where += " AND recurso_tipo = ?"
            params.append(recurso_tipo)
        if recurso_id is not None:
            where += " AND recurso_id = ?"
            params.append(recurso_id)
        rows = conn.execute(
            f"SELECT * FROM proyecto_asignaciones WHERE {where} ORDER BY fecha, recurso_tipo, recurso_nombre",
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def obtener_asignaciones_recurso(recurso_tipo: str, recurso_id: int,
                                 fecha_desde: str = "", fecha_hasta: str = "") -> list[dict]:
    init_proyectos_db()
    conn = _get_conn()
    try:
        where = "recurso_tipo = ? AND recurso_id = ?"
        params: list = [recurso_tipo, recurso_id]
        if fecha_desde:
            where += " AND fecha >= ?"
            params.append(fecha_desde)
        if fecha_hasta:
            where += " AND fecha <= ?"
            params.append(fecha_hasta)
        rows = conn.execute(
            f"SELECT pa.*, p.nombre as proyecto_nombre FROM proyecto_asignaciones pa"
            f" JOIN proyectos p ON pa.proyecto_id = p.id WHERE {where} ORDER BY fecha",
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def obtener_recursos_proyecto(proyecto_id: int) -> list[dict]:
    """Unique resources that are or have been assigned to this project."""
    init_proyectos_db()
    conn = _get_conn()
    try:
        rows = conn.execute("""
            SELECT recurso_tipo, recurso_id, recurso_nombre,
                   MIN(fecha) as primera_fecha, MAX(fecha) as ultima_fecha,
                   COUNT(*) as dias_asignados
            FROM proyecto_asignaciones WHERE proyecto_id = ?
            GROUP BY recurso_tipo, recurso_id
            ORDER BY recurso_tipo, recurso_nombre
        """, (proyecto_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def recursos_disponibles(fecha: str, recurso_tipo: str = "") -> list[dict]:
    """Resources NOT assigned to any project on the given date."""
    init_proyectos_db()
    conn = _get_conn()
    try:
        # Get occupied resource IDs for this date
        ocu_emp = set()
        ocu_maq = set()
        ocu_veh = set()
        for r in conn.execute("SELECT recurso_tipo, recurso_id FROM proyecto_asignaciones WHERE fecha = ?", (fecha,)).fetchall():
            if r["recurso_tipo"] == "empleado":
                ocu_emp.add(r["recurso_id"])
            elif r["recurso_tipo"] == "maquina":
                ocu_maq.add(r["recurso_id"])
            elif r["recurso_tipo"] == "vehiculo":
                ocu_veh.add(r["recurso_id"])

        result = []
        if not recurso_tipo or recurso_tipo == "empleado":
            try:
                for r in conn.execute("SELECT id, nombre, COALESCE(apellidos,'') as ap, puesto FROM empleados WHERE estado='activo' ORDER BY nombre").fetchall():
                    if r["id"] not in ocu_emp:
                        result.append({"tipo": "empleado", "id": r["id"], "nombre": f"{r['nombre']} {r['ap']}".strip(), "detalle": r["puesto"] or ""})
            except Exception:
                pass
        if not recurso_tipo or recurso_tipo == "maquina":
            for r in conn.execute("SELECT id, nombre, modelo FROM maquinas WHERE activa=1 ORDER BY nombre").fetchall():
                if r["id"] not in ocu_maq:
                    result.append({"tipo": "maquina", "id": r["id"], "nombre": r["nombre"], "detalle": r["modelo"] or ""})

        if not recurso_tipo or recurso_tipo == "vehiculo":
            try:
                for r in conn.execute("SELECT id, matricula, tipo, marca FROM vehiculos WHERE activa=1 ORDER BY matricula").fetchall():
                    if r["id"] not in ocu_veh:
                        result.append({"tipo": "vehiculo", "id": r["id"], "nombre": r["matricula"], "detalle": (r["tipo"] or "") + (" " + r["marca"] if r["marca"] else "")})
            except Exception:
                pass

        return result
    finally:
        conn.close()


def _get_conn():
    from core.db import get_conn
    return get_conn()


# ── Dashboard V2: enrichment with adaptive KPIs ──────────────────────────

def _safe_float(val):
    """Convert possibly Spanish-formatted money string to float."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return float(s.replace(".", "").replace(",", "."))


def calcular_dashboard_v2(proyecto_id: int) -> dict | None:
    """Enrich project dashboard with adaptive KPIs, cost breakdown, curve S, financials."""
    data = obtener_dashboard_proyecto(proyecto_id)
    if not data:
        return None

    tipo = data.get("tipo_actividad") or "hinca"
    modalidad = data.get("modalidad_facturacion") or "produccion"
    partes = data.get("partes") or []

    # ── Adaptive production metrics ──
    total_hincas = sum(p.get("hincas_realizadas") or 0 for p in partes)
    total_perforaciones = sum(p.get("perforaciones_realizadas") or 0 for p in partes)
    total_horas_maquina = sum(p.get("horas_maquina") or 0 for p in partes)
    total_horas_admin = sum(p.get("horas_admin") or 0 for p in partes)
    total_partes = len(partes)
    partes_sin_firmar = sum(1 for p in partes if (p.get("estado_firma") or "borrador") != "firmado")
    partes_con_incidencia = sum(1 for p in partes if p.get("incidencias"))

    obj_hinca = data.get("hinca_cantidad") or data.get("hincas_estimadas") or 0
    obj_perforacion = data.get("perforacion_cantidad") or 0

    # Determine primary unit and objective
    if tipo == "hinca":
        unidad_principal = "hincas"
        ejecutadas = total_hincas
        objetivo = obj_hinca
    elif tipo == "perforacion":
        unidad_principal = "perforaciones"
        ejecutadas = total_perforaciones
        objetivo = obj_perforacion
    else:  # mixto
        unidad_principal = "hincas+perforaciones"
        ejecutadas = total_hincas + total_perforaciones
        objetivo = obj_hinca + obj_perforacion

    avance_pct = round(ejecutadas / objetivo * 100, 1) if objetivo > 0 else 0

    # Days with actual work
    fechas_partes = sorted(set(p.get("fecha") for p in partes if p.get("fecha")))
    dias_con_partes = len(fechas_partes)

    # Ritmo and prediction
    ritmo_diario = round(ejecutadas / dias_con_partes, 2) if dias_con_partes > 0 else 0
    restantes = max(objetivo - ejecutadas, 0)
    dias_restantes = round(restantes / ritmo_diario) if ritmo_diario > 0 else None

    from datetime import date, timedelta
    hoy = date.today()
    fecha_fin_estimada = (hoy + timedelta(days=dias_restantes)).isoformat() if dias_restantes else None
    fecha_fin_plan = data.get("fecha_fin_estimada") or data.get("fecha_fin")

    desviacion_dias = None
    if fecha_fin_estimada and fecha_fin_plan:
        try:
            d_est = date.fromisoformat(fecha_fin_estimada)
            d_plan = date.fromisoformat(fecha_fin_plan)
            desviacion_dias = (d_est - d_plan).days
        except Exception:
            pass

    data["kpis"] = {
        "tipo_actividad": tipo,
        "modalidad": modalidad,
        "unidad_principal": unidad_principal,
        "ejecutadas": ejecutadas,
        "objetivo": objetivo,
        "avance_pct": avance_pct,
        "total_hincas": total_hincas,
        "total_perforaciones": total_perforaciones,
        "total_horas_maquina": round(total_horas_maquina, 1),
        "total_horas_admin": round(total_horas_admin, 1),
        "total_partes": total_partes,
        "partes_sin_firmar": partes_sin_firmar,
        "partes_con_incidencia": partes_con_incidencia,
        "dias_con_partes": dias_con_partes,
        "ritmo_diario": ritmo_diario,
        "dias_restantes": dias_restantes,
        "fecha_fin_estimada": fecha_fin_estimada,
        "fecha_fin_plan": fecha_fin_plan,
        "desviacion_dias": desviacion_dias,
    }

    # ── Curve S series ──
    serie = []
    acum = 0
    for fecha in fechas_partes:
        dia_hincas = sum(p.get("hincas_realizadas") or 0 for p in partes if p.get("fecha") == fecha)
        dia_perf = sum(p.get("perforaciones_realizadas") or 0 for p in partes if p.get("fecha") == fecha)
        dia_total = dia_hincas + dia_perf if tipo == "mixto" else (dia_hincas if tipo == "hinca" else dia_perf)
        acum += dia_total
        obj_lineal = round(objetivo * (len(serie) + 1) / max(dias_con_partes + (dias_restantes or 0), 1), 1) if objetivo > 0 else 0
        serie.append({
            "fecha": fecha,
            "produccion": dia_total,
            "hincas": dia_hincas,
            "perforaciones": dia_perf,
            "acumulado": acum,
            "objetivo_lineal": obj_lineal,
        })
    data["serie_curva_s"] = serie

    # ── Rendimiento por día semana ──
    dias_semana = {i: {"total": 0, "count": 0} for i in range(7)}
    for fecha in fechas_partes:
        try:
            d = date.fromisoformat(fecha)
            dia_prod = sum((p.get("hincas_realizadas") or 0) + (p.get("perforaciones_realizadas") or 0)
                           for p in partes if p.get("fecha") == fecha)
            dias_semana[d.weekday()]["total"] += dia_prod
            dias_semana[d.weekday()]["count"] += 1
        except Exception:
            pass
    data["rendimiento_dia_semana"] = [
        round(dias_semana[i]["total"] / dias_semana[i]["count"], 1) if dias_semana[i]["count"] > 0 else 0
        for i in range(7)
    ]

    # ── Financial metrics ──
    facturas_cli = data.get("facturas_cliente") or []
    total_facturado = sum(_safe_float(f.get("total_a_pagar") or f.get("total")) for f in facturas_cli)
    total_cobrado = sum(_safe_float(f.get("total_a_pagar") or f.get("total"))
                        for f in facturas_cli if (f.get("estado_cobro") or "") == "cobrada")

    costes_list = data.get("costes") or []
    total_costes = sum(_safe_float(c.get("total_a_pagar") or c.get("total")) for c in costes_list)

    presupuesto = _safe_float(data.get("importe_presupuestado"))
    margen = total_facturado - total_costes
    margen_pct = round(margen / total_facturado * 100, 1) if total_facturado > 0 else 0

    data["financiero"] = {
        "presupuesto": round(presupuesto, 2),
        "facturado": round(total_facturado, 2),
        "cobrado": round(total_cobrado, 2),
        "pendiente_cobro": round(total_facturado - total_cobrado, 2),
        "costes": round(total_costes, 2),
        "margen": round(margen, 2),
        "margen_pct": margen_pct,
    }

    # ── Cost breakdown by category ──
    desglose = {}
    for c in costes_list:
        cat = (c.get("categoria") or "otros").lower()
        concepto = (c.get("resumen_concepto") or "").lower()
        if "gasoil" in concepto or "combustible" in concepto or "carburante" in concepto:
            cat = "gasoil"
        elif "hotel" in concepto or "alojamiento" in concepto:
            cat = "hoteles"
        elif "transporte" in concepto or "grua" in concepto:
            cat = "transporte"
        elif cat not in ("gasoil", "hoteles", "transporte", "personal"):
            cat = "otros"
        desglose[cat] = desglose.get(cat, 0) + _safe_float(c.get("total_a_pagar") or c.get("total"))

    # Add personal costs (dietas + HE of assigned employees)
    conn2 = _get_conn()
    try:
        # Dietas of employees assigned to this project
        dietas_proy = conn2.execute("""
            SELECT COALESCE(SUM(dd.importe), 0) as total
            FROM dietas_diarias dd
            JOIN proyecto_asignaciones pa ON pa.recurso_id = dd.empleado_id
                AND pa.fecha = dd.fecha AND pa.recurso_tipo = 'empleado'
            WHERE pa.proyecto_id = ?
        """, (proyecto_id,)).fetchone()["total"]
        # HE of employees assigned to this project
        try:
            he_proy = conn2.execute("""
                SELECT COALESCE(SUM(he.importe), 0) as total
                FROM horas_extras_dias he
                JOIN proyecto_asignaciones pa ON pa.recurso_id = he.empleado_id
                    AND pa.fecha = he.fecha AND pa.recurso_tipo = 'empleado'
                WHERE pa.proyecto_id = ?
            """, (proyecto_id,)).fetchone()["total"]
        except Exception:
            he_proy = 0
        # Prorrata nómina: average coste_dia × days assigned
        prorrata = 0
        try:
            for r in conn2.execute("""
                SELECT pa.recurso_id, COUNT(DISTINCT pa.fecha) as dias,
                       COALESCE(AVG(n.coste_dia), 0) as coste_dia_medio
                FROM proyecto_asignaciones pa
                LEFT JOIN nominas n ON n.empleado_id = pa.recurso_id AND n.tipo = 'NOMINA'
                WHERE pa.proyecto_id = ? AND pa.recurso_tipo = 'empleado'
                GROUP BY pa.recurso_id
            """, (proyecto_id,)).fetchall():
                prorrata += r["dias"] * r["coste_dia_medio"]
        except Exception:
            pass
        desglose["personal"] = round(dietas_proy + he_proy + prorrata, 2)

        # Combustible from imputated fuel transactions
        comb = conn2.execute("""
            SELECT COALESCE(SUM(importe_final),0) as total,
                   COALESCE(SUM(CASE WHEN tipo_producto='diesel' THEN importe_final ELSE 0 END),0) as diesel,
                   COALESCE(SUM(CASE WHEN tipo_producto='gasolina' THEN importe_final ELSE 0 END),0) as gasolina,
                   COALESCE(SUM(litros),0) as litros,
                   COUNT(*) as repostajes
            FROM combustible_transacciones
            WHERE proyecto_id = ? AND COALESCE(tipo_producto,'') NOT IN ('descuento','peaje')
        """, (proyecto_id,)).fetchone()
        comb_total = comb["total"] or 0
        if comb_total > 0:
            desglose["gasoil"] = desglose.get("gasoil", 0) + comb_total
            data["combustible_detalle"] = {
                "total": round(comb_total, 2), "diesel": round(comb["diesel"], 2),
                "gasolina": round(comb["gasolina"], 2), "litros": round(comb["litros"], 1),
                "repostajes": comb["repostajes"],
            }
    except Exception:
        pass
    finally:
        conn2.close()
    data["desglose_costes"] = {k: round(v, 2) for k, v in desglose.items()}

    # ── Partes pendientes de registrar ──
    try:
        from core.alertas_partes import obtener_partes_pendientes
        from datetime import date as _d, timedelta as _td
        _pp = obtener_partes_pendientes(proyecto_id=proyecto_id, desde=(_d.today() - _td(days=30)).isoformat())
        data["partes_pendientes"] = _pp.get("por_proyecto", [{}])[0].get("dias_pendientes", []) if _pp.get("por_proyecto") else []
    except Exception:
        data["partes_pendientes"] = []

    # ── Alerts ──
    alertas = []
    if data["partes_pendientes"]:
        alertas.append({"nivel": "alta", "texto": f"{len(data['partes_pendientes'])} día(s) sin parte de trabajo"})
    if partes_sin_firmar > 0:
        alertas.append({"nivel": "alta", "texto": f"{partes_sin_firmar} parte(s) sin firmar"})
    facturas_pend = [f for f in facturas_cli if (f.get("estado_cobro") or "") in ("pendiente", "parcial")]
    if facturas_pend:
        alertas.append({"nivel": "media", "texto": f"{len(facturas_pend)} factura(s) pendiente(s) de cobro"})
    certs = data.get("certificaciones") or []
    certs_pendientes = [c for c in certs if (c.get("estado") or "") in ("borrador", "enviada")]
    if certs_pendientes:
        alertas.append({"nivel": "info", "texto": f"{len(certs_pendientes)} certificación(es) sin facturar"})
    # Suggest certification
    ultima_cert_fecha = None
    for c in certs:
        if c.get("fecha_hasta") and (not ultima_cert_fecha or c["fecha_hasta"] > ultima_cert_fecha):
            ultima_cert_fecha = c["fecha_hasta"]
    partes_sin_cert = [p for p in partes if not ultima_cert_fecha or (p.get("fecha") or "") > ultima_cert_fecha]
    unidades_sin_cert = sum((p.get("hincas_realizadas") or 0) + (p.get("perforaciones_realizadas") or 0) for p in partes_sin_cert)
    if unidades_sin_cert > 0:
        alertas.append({"nivel": "info", "texto": f"{unidades_sin_cert} unidades desde última certificación"})
    data["alertas"] = alertas

    # ── Certificaciones resumen ──
    cert_resumen = {"borrador": 0, "enviada": 0, "aprobada": 0, "total_importe": 0}
    for c in certs:
        est = c.get("estado") or "borrador"
        cert_resumen[est] = cert_resumen.get(est, 0) + 1
        cert_resumen["total_importe"] += _safe_float(c.get("importe_total"))
    data["certificaciones_resumen"] = cert_resumen

    # ── Equipo asignado hoy ──
    conn = _get_conn()
    try:
        equipo_hoy = [dict(r) for r in conn.execute("""
            SELECT pa.recurso_nombre, pa.recurso_tipo,
                   COALESCE(pa.funcion_dia, e.puesto) as funcion
            FROM proyecto_asignaciones pa
            LEFT JOIN empleados e ON pa.recurso_id = e.id AND pa.recurso_tipo = 'empleado'
            WHERE pa.proyecto_id = ? AND pa.fecha = ?
            ORDER BY pa.recurso_tipo, pa.recurso_nombre
        """, (proyecto_id, hoy.isoformat())).fetchall()]
    except Exception:
        equipo_hoy = []
    finally:
        conn.close()
    data["equipo_hoy"] = equipo_hoy

    return data
