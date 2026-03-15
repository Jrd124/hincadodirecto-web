"""
Módulo CRM – Modelo de datos y operaciones CRUD.
Tablas: crm_empresas, crm_contactos, crm_interacciones, crm_oportunidades,
        crm_etiquetas, crm_contacto_etiquetas, crm_empresa_etiquetas.
"""
from __future__ import annotations

import logging
import sqlite3
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger(__name__)

_initialized = False


def init_crm_db() -> None:
    """Crea las tablas CRM si no existen. No-op tras la primera llamada."""
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS crm_empresas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                cif TEXT,
                direccion TEXT,
                localidad TEXT,
                provincia TEXT,
                pais TEXT,
                telefono TEXT,
                email TEXT,
                web TEXT,
                sector TEXT,
                tipo TEXT NOT NULL DEFAULT 'lead'
                    CHECK (tipo IN ('cliente', 'proveedor', 'ambos', 'lead')),
                tercero_id INTEGER,
                notas TEXT,
                fecha_creacion TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (tercero_id) REFERENCES terceros(id)
            );
            CREATE TABLE IF NOT EXISTS crm_contactos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                apellidos TEXT,
                cargo TEXT,
                email TEXT,
                telefono TEXT,
                telefono2 TEXT,
                empresa_vinculada_id INTEGER,
                tipo_relacion TEXT NOT NULL DEFAULT 'otro'
                    CHECK (tipo_relacion IN ('cliente', 'proveedor', 'ambos', 'lead', 'otro')),
                notas TEXT,
                fecha_creacion TEXT NOT NULL,
                fecha_actualizacion TEXT,
                creado_por TEXT,
                activo INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (empresa_vinculada_id) REFERENCES crm_empresas(id)
            );
            CREATE TABLE IF NOT EXISTS crm_oportunidades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empresa_id INTEGER NOT NULL,
                contacto_id INTEGER,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                estado TEXT NOT NULL DEFAULT 'lead'
                    CHECK (estado IN ('lead','contacto_inicial','cotizacion_enviada','negociacion','ganada','perdida','aplazada')),
                importe_estimado REAL,
                probabilidad INTEGER,
                fecha_estimada_cierre TEXT,
                motivo_perdida TEXT,
                proyecto_id INTEGER,
                presupuesto_id INTEGER,
                fuente TEXT DEFAULT 'otro'
                    CHECK (fuente IN ('web','referido','llamada_fria','feria','otro')),
                fecha_creacion TEXT NOT NULL,
                fecha_actualizacion TEXT,
                creado_por TEXT,
                FOREIGN KEY (empresa_id) REFERENCES crm_empresas(id),
                FOREIGN KEY (contacto_id) REFERENCES crm_contactos(id)
            );
            CREATE TABLE IF NOT EXISTS crm_interacciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contacto_id INTEGER,
                empresa_id INTEGER,
                tipo TEXT NOT NULL
                    CHECK (tipo IN ('llamada','email','reunion','nota','whatsapp','visita')),
                asunto TEXT,
                descripcion TEXT,
                fecha TEXT NOT NULL,
                duracion_minutos INTEGER,
                resultado TEXT,
                siguiente_accion TEXT,
                fecha_siguiente_accion TEXT,
                oportunidad_id INTEGER,
                creado_por TEXT,
                fecha_creacion TEXT NOT NULL,
                FOREIGN KEY (contacto_id) REFERENCES crm_contactos(id),
                FOREIGN KEY (empresa_id) REFERENCES crm_empresas(id),
                FOREIGN KEY (oportunidad_id) REFERENCES crm_oportunidades(id)
            );
            CREATE TABLE IF NOT EXISTS crm_etiquetas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL UNIQUE,
                color TEXT
            );
            CREATE TABLE IF NOT EXISTS crm_contacto_etiquetas (
                contacto_id INTEGER NOT NULL,
                etiqueta_id INTEGER NOT NULL,
                PRIMARY KEY (contacto_id, etiqueta_id),
                FOREIGN KEY (contacto_id) REFERENCES crm_contactos(id) ON DELETE CASCADE,
                FOREIGN KEY (etiqueta_id) REFERENCES crm_etiquetas(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS crm_empresa_etiquetas (
                empresa_id INTEGER NOT NULL,
                etiqueta_id INTEGER NOT NULL,
                PRIMARY KEY (empresa_id, etiqueta_id),
                FOREIGN KEY (empresa_id) REFERENCES crm_empresas(id) ON DELETE CASCADE,
                FOREIGN KEY (etiqueta_id) REFERENCES crm_etiquetas(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ix_crm_empresas_nombre ON crm_empresas(nombre);
            CREATE INDEX IF NOT EXISTS ix_crm_empresas_cif ON crm_empresas(cif);
            CREATE INDEX IF NOT EXISTS ix_crm_empresas_tipo ON crm_empresas(tipo);
            CREATE INDEX IF NOT EXISTS ix_crm_empresas_tercero ON crm_empresas(tercero_id);
            CREATE INDEX IF NOT EXISTS ix_crm_empresas_email ON crm_empresas(email);
            CREATE INDEX IF NOT EXISTS ix_crm_contactos_nombre ON crm_contactos(nombre);
            CREATE INDEX IF NOT EXISTS ix_crm_contactos_email ON crm_contactos(email);
            CREATE INDEX IF NOT EXISTS ix_crm_contactos_empresa ON crm_contactos(empresa_vinculada_id);
            CREATE INDEX IF NOT EXISTS ix_crm_contactos_tipo ON crm_contactos(tipo_relacion);
            CREATE INDEX IF NOT EXISTS ix_crm_interacciones_contacto ON crm_interacciones(contacto_id);
            CREATE INDEX IF NOT EXISTS ix_crm_interacciones_empresa ON crm_interacciones(empresa_id);
            CREATE INDEX IF NOT EXISTS ix_crm_interacciones_oportunidad ON crm_interacciones(oportunidad_id);
            CREATE INDEX IF NOT EXISTS ix_crm_interacciones_fecha ON crm_interacciones(fecha);
            CREATE INDEX IF NOT EXISTS ix_crm_interacciones_tipo ON crm_interacciones(tipo);
            CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_empresa ON crm_oportunidades(empresa_id);
            CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_contacto ON crm_oportunidades(contacto_id);
            CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_estado ON crm_oportunidades(estado);
            CREATE INDEX IF NOT EXISTS ix_crm_contacto_etiquetas_etiqueta ON crm_contacto_etiquetas(etiqueta_id);
            CREATE INDEX IF NOT EXISTS ix_crm_empresa_etiquetas_etiqueta ON crm_empresa_etiquetas(etiqueta_id);
        """)
    _initialized = True


# ─── EMPRESAS CRM ─────────────────────────────────────────────────────────────

def listar_empresas(
    tipo: str | None = None,
    q: str | None = None,
    activo: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    init_crm_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if tipo:
        where_parts.append("e.tipo = ?")
        params.append(tipo)
    if q:
        where_parts.append("(e.nombre LIKE ? OR e.cif LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    if activo is not None:
        where_parts.append("e.activo = ?")
        params.append(activo)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with _conectar() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM crm_empresas e {where}", params
        ).fetchone()[0]

        rows = conn.execute(f"""
            SELECT e.*,
                (SELECT COUNT(*) FROM crm_contactos c WHERE c.empresa_vinculada_id = e.id AND c.activo = 1) AS num_contactos,
                (SELECT COUNT(*) FROM crm_interacciones i WHERE i.empresa_id = e.id) AS num_interacciones,
                (SELECT COUNT(*) FROM crm_oportunidades o WHERE o.empresa_id = e.id AND o.estado NOT IN ('ganada','perdida')) AS num_oportunidades
            FROM crm_empresas e {where}
            ORDER BY e.nombre COLLATE NOCASE
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {
            "empresas": [dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


def obtener_empresa(empresa_id: int) -> dict[str, Any] | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute("SELECT * FROM crm_empresas WHERE id = ?", (empresa_id,)).fetchone()
        if not row:
            return None
        empresa = dict(row)

        contactos = conn.execute(
            "SELECT * FROM crm_contactos WHERE empresa_vinculada_id = ? AND activo = 1 ORDER BY nombre",
            (empresa_id,)
        ).fetchall()
        empresa["contactos"] = [dict(c) for c in contactos]

        interacciones = conn.execute(
            "SELECT * FROM crm_interacciones WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 10",
            (empresa_id,)
        ).fetchall()
        empresa["interacciones"] = [dict(i) for i in interacciones]

        oportunidades = conn.execute(
            "SELECT * FROM crm_oportunidades WHERE empresa_id = ? AND estado NOT IN ('ganada','perdida') ORDER BY fecha_creacion DESC",
            (empresa_id,)
        ).fetchall()
        empresa["oportunidades"] = [dict(o) for o in oportunidades]

        return empresa


def crear_empresa(data: dict) -> dict:
    init_crm_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO crm_empresas (nombre, cif, direccion, localidad, provincia, pais,
                telefono, email, web, sector, tipo, tercero_id, notas, fecha_creacion, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            (data.get("nombre") or "").strip(),
            (data.get("cif") or "").strip() or None,
            (data.get("direccion") or "").strip() or None,
            (data.get("localidad") or "").strip() or None,
            (data.get("provincia") or "").strip() or None,
            (data.get("pais") or "").strip() or None,
            (data.get("telefono") or "").strip() or None,
            (data.get("email") or "").strip() or None,
            (data.get("web") or "").strip() or None,
            (data.get("sector") or "").strip() or None,
            (data.get("tipo") or "lead").strip(),
            data.get("tercero_id"),
            (data.get("notas") or "").strip() or None,
            ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return obtener_empresa(new_id)


def actualizar_empresa(empresa_id: int, data: dict) -> dict | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM crm_empresas WHERE id = ?", (empresa_id,)).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE crm_empresas SET
                nombre = ?, cif = ?, direccion = ?, localidad = ?, provincia = ?, pais = ?,
                telefono = ?, email = ?, web = ?, sector = ?, tipo = ?, tercero_id = ?,
                notas = ?, activo = ?
            WHERE id = ?
        """, (
            (data.get("nombre") or "").strip(),
            (data.get("cif") or "").strip() or None,
            (data.get("direccion") or "").strip() or None,
            (data.get("localidad") or "").strip() or None,
            (data.get("provincia") or "").strip() or None,
            (data.get("pais") or "").strip() or None,
            (data.get("telefono") or "").strip() or None,
            (data.get("email") or "").strip() or None,
            (data.get("web") or "").strip() or None,
            (data.get("sector") or "").strip() or None,
            (data.get("tipo") or "lead").strip(),
            data.get("tercero_id"),
            (data.get("notas") or "").strip() or None,
            1 if data.get("activo", True) else 0,
            empresa_id,
        ))
    return obtener_empresa(empresa_id)


def estadisticas_crm() -> dict[str, Any]:
    init_crm_db()
    with _conectar() as conn:
        total_empresas = conn.execute("SELECT COUNT(*) FROM crm_empresas WHERE activo = 1").fetchone()[0]
        total_contactos = conn.execute("SELECT COUNT(*) FROM crm_contactos WHERE activo = 1").fetchone()[0]
        oportunidades_abiertas = conn.execute(
            "SELECT COUNT(*) FROM crm_oportunidades WHERE estado NOT IN ('ganada','perdida')"
        ).fetchone()[0]
        importe_pipeline = conn.execute(
            "SELECT COALESCE(SUM(importe_estimado), 0) FROM crm_oportunidades WHERE estado NOT IN ('ganada','perdida')"
        ).fetchone()[0]
        # Interacciones este mes (formato ISO: YYYY-MM)
        import datetime
        mes_actual = datetime.datetime.utcnow().strftime("%Y-%m")
        interacciones_mes = conn.execute(
            "SELECT COUNT(*) FROM crm_interacciones WHERE fecha LIKE ?",
            (mes_actual + "%",)
        ).fetchone()[0]

        return {
            "total_empresas": total_empresas,
            "total_contactos": total_contactos,
            "oportunidades_abiertas": oportunidades_abiertas,
            "importe_pipeline": round(importe_pipeline, 2),
            "interacciones_mes": interacciones_mes,
        }
