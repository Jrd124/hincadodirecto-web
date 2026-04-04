"""Modulo Proyectos: CRUD de proyectos, partes de trabajo, recursos."""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger(__name__)

_initialized = False

_ESTADOS = ("cotizado", "vivo", "pausado", "terminado", "cancelado")


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
        _backfill_codigos(conn)
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
        t.nombre_canonico AS nombre_cliente,
        pres.referencia AS presupuesto_ref,
        oport.nombre AS oportunidad_nombre,
        CASE WHEN p.hincas_estimadas > 0
             THEN ROUND(p.hincas_realizadas * 100.0 / p.hincas_estimadas, 1)
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
                   t.nombre_canonico AS cliente_nombre,
                   t.nif AS cliente_nif,
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
                ubicacion_lat, ubicacion_lon, provincia, mw_parque, hincas_estimadas,
                precio_unitario_hinca, precio_hora_maquina, precio_hora_ayudante, precio_jornada,
                importe_presupuestado, fecha_inicio_estimada, fecha_fin_estimada, notas,
                created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                ubicacion_lat=?, ubicacion_lon=?, provincia=?, mw_parque=?, hincas_estimadas=?,
                precio_unitario_hinca=?, precio_hora_maquina=?, precio_hora_ayudante=?, precio_jornada=?,
                importe_presupuestado=?, fecha_inicio_estimada=?, fecha_fin_estimada=?,
                fecha_inicio_real=?, fecha_fin_real=?, notas=?, updated_at=?
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
