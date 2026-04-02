"""
Módulo CRM – Modelo de datos y operaciones CRUD.
Tablas: crm_empresas, crm_contactos, crm_interacciones, crm_oportunidades,
        crm_etiquetas, crm_contacto_etiquetas, crm_empresa_etiquetas.
"""
from __future__ import annotations

import logging
import re
import sqlite3
from difflib import SequenceMatcher
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

            CREATE TABLE IF NOT EXISTS crm_oportunidades_historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                oportunidad_id INTEGER NOT NULL,
                estado_anterior TEXT,
                estado_nuevo TEXT NOT NULL,
                motivo TEXT,
                fecha TEXT NOT NULL,
                usuario TEXT,
                FOREIGN KEY (oportunidad_id) REFERENCES crm_oportunidades(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS ix_crm_oph_oportunidad ON crm_oportunidades_historial(oportunidad_id);
        """)
        # Migration: add CAE columns to crm_empresas
        try:
            emp_cols = {r[1] for r in conn.execute("PRAGMA table_info(crm_empresas)").fetchall()}
            if "cae_plataforma" not in emp_cols:
                conn.execute("ALTER TABLE crm_empresas ADD COLUMN cae_plataforma TEXT")
            if "cae_url" not in emp_cols:
                conn.execute("ALTER TABLE crm_empresas ADD COLUMN cae_url TEXT")
        except Exception:
            pass

        # ── Tablas auxiliares para duplicados ────────────────────────────────
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS terceros_fusiones_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tercero_conservado_id INTEGER,
                tercero_eliminado_id INTEGER,
                nombre_conservado TEXT,
                nombre_eliminado TEXT,
                motivo TEXT,
                usuario TEXT,
                fecha TEXT
            );
            CREATE TABLE IF NOT EXISTS terceros_no_duplicados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tercero_id_1 INTEGER,
                tercero_id_2 INTEGER,
                usuario TEXT,
                fecha TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_tnd_par ON terceros_no_duplicados(tercero_id_1, tercero_id_2);
        """)

        # Migration: backfill fusiones_log from existing [FUSIONADO→X] entries
        existing_log = conn.execute("SELECT COUNT(*) FROM terceros_fusiones_log").fetchone()[0]
        if existing_log == 0:
            fusionados = conn.execute(
                "SELECT id, nombre_canonico, updated_at FROM terceros WHERE nombre_canonico LIKE '[FUSIONADO→%'"
            ).fetchall()
            for f in fusionados:
                nombre = f["nombre_canonico"]
                # Parse: [FUSIONADO→123] Nombre Original
                try:
                    arrow_end = nombre.index("]")
                    principal_id = int(nombre[len("[FUSIONADO→"):arrow_end])
                    nombre_eliminado = nombre[arrow_end + 2:]  # skip "] "
                    principal = conn.execute(
                        "SELECT nombre_canonico FROM terceros WHERE id = ?", (principal_id,)
                    ).fetchone()
                    nombre_conservado = principal["nombre_canonico"] if principal else "?"
                    conn.execute(
                        """INSERT INTO terceros_fusiones_log
                           (tercero_conservado_id, tercero_eliminado_id, nombre_conservado, nombre_eliminado, motivo, usuario, fecha)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (principal_id, f["id"], nombre_conservado, nombre_eliminado,
                         "Fusión histórica (migrada)", "sistema", f["updated_at"] or _now())
                    )
                except (ValueError, IndexError):
                    pass
    _initialized = True


def sincronizar_desde_terceros() -> dict[str, int]:
    """Importa terceros sin crm_empresa y actualiza nombre/cif en las existentes."""
    init_crm_db()
    insertados = 0
    actualizados = 0
    with _conectar() as conn:
        # 1. Crear crm_empresas para terceros que no tengan
        rows = conn.execute("""
            SELECT t.*
            FROM terceros t
            LEFT JOIN crm_empresas ce ON ce.tercero_id = t.id
            WHERE ce.id IS NULL
        """).fetchall()
        for t in rows:
            es_cli = t["es_cliente"]
            es_prov = t["es_proveedor"]
            if es_cli and es_prov:
                tipo = "ambos"
            elif es_cli:
                tipo = "cliente"
            elif es_prov:
                tipo = "proveedor"
            else:
                tipo = "lead"
            conn.execute("""
                INSERT INTO crm_empresas
                    (nombre, cif, direccion, localidad, pais, telefono, email,
                     tipo, tercero_id, fecha_creacion, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                t["nombre_canonico"],
                t["nif"],
                t["direccion"],
                t["localidad"],
                t["pais"],
                t["telefono"],
                t["email"],
                tipo,
                t["id"],
                _now(),
            ))
            insertados += 1

        # 2. Sincronizar nombre y cif desde terceros a crm_empresas existentes
        actualizados = conn.execute("""
            UPDATE crm_empresas SET
                nombre = (SELECT t.nombre_canonico FROM terceros t WHERE t.id = crm_empresas.tercero_id),
                cif = (SELECT t.nif FROM terceros t WHERE t.id = crm_empresas.tercero_id)
            WHERE tercero_id IS NOT NULL
              AND (
                nombre != (SELECT t.nombre_canonico FROM terceros t WHERE t.id = crm_empresas.tercero_id)
                OR COALESCE(cif, '') != COALESCE((SELECT t.nif FROM terceros t WHERE t.id = crm_empresas.tercero_id), '')
              )
        """).rowcount

    return {"insertados": insertados, "actualizados": actualizados, "total_terceros": len(rows)}


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
        row = conn.execute("SELECT id, tercero_id FROM crm_empresas WHERE id = ?", (empresa_id,)).fetchone()
        if not row:
            return None
        nombre = (data.get("nombre") or "").strip()
        cif = (data.get("cif") or "").strip() or None
        conn.execute("""
            UPDATE crm_empresas SET
                nombre = ?, cif = ?, direccion = ?, localidad = ?, provincia = ?, pais = ?,
                telefono = ?, email = ?, web = ?, sector = ?, tipo = ?, tercero_id = ?,
                notas = ?, activo = ?
            WHERE id = ?
        """, (
            nombre,
            cif,
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
        # Propagar nombre/cif al tercero vinculado (fuente unica de verdad)
        tercero_id = data.get("tercero_id") or row["tercero_id"]
        if tercero_id:
            conn.execute(
                "UPDATE terceros SET nombre_canonico = ?, nif = ?, updated_at = ? WHERE id = ?",
                (nombre, cif, _now(), tercero_id),
            )
    return obtener_empresa(empresa_id)


def estadisticas_crm() -> dict[str, Any]:
    init_crm_db()
    import datetime
    with _conectar() as conn:
        total_empresas = conn.execute("SELECT COUNT(*) FROM crm_empresas WHERE activo = 1").fetchone()[0]
        total_contactos = conn.execute("SELECT COUNT(*) FROM crm_contactos WHERE activo = 1").fetchone()[0]
        oportunidades_abiertas = conn.execute(
            "SELECT COUNT(*) FROM crm_oportunidades WHERE estado NOT IN ('ganada','perdida')"
        ).fetchone()[0]
        importe_pipeline = conn.execute(
            "SELECT COALESCE(SUM(importe_estimado), 0) FROM crm_oportunidades WHERE estado NOT IN ('ganada','perdida')"
        ).fetchone()[0]
        mes_actual = datetime.datetime.utcnow().strftime("%Y-%m")
        interacciones_mes = conn.execute(
            "SELECT COUNT(*) FROM crm_interacciones WHERE fecha LIKE ?",
            (mes_actual + "%",)
        ).fetchone()[0]
        hoy = datetime.datetime.utcnow().strftime("%Y-%m-%d")
        en_7_dias = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
        pendientes_seguimiento = conn.execute(
            """SELECT COUNT(*) FROM crm_interacciones
               WHERE siguiente_accion IS NOT NULL AND siguiente_accion != ''
                 AND fecha_siguiente_accion IS NOT NULL
                 AND fecha_siguiente_accion <= ?""",
            (en_7_dias,)
        ).fetchone()[0]

        ganadas = conn.execute("SELECT COUNT(*) FROM crm_oportunidades WHERE estado = 'ganada'").fetchone()[0]
        cerradas = conn.execute("SELECT COUNT(*) FROM crm_oportunidades WHERE estado IN ('ganada','perdida')").fetchone()[0]
        tasa_conversion = round(ganadas * 100 / cerradas, 1) if cerradas > 0 else 0

        return {
            "total_empresas": total_empresas,
            "total_contactos": total_contactos,
            "oportunidades_abiertas": oportunidades_abiertas,
            "importe_pipeline": round(importe_pipeline, 2),
            "interacciones_mes": interacciones_mes,
            "pendientes_seguimiento": pendientes_seguimiento,
            "tasa_conversion": tasa_conversion,
        }


# ─── CONTACTOS CRM ──────────────────────────────────────────────────────────

def listar_contactos(
    empresa_id: int | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    init_crm_db()
    where_parts: list[str] = ["c.activo = 1"]
    params: list[Any] = []
    if empresa_id:
        where_parts.append("c.empresa_vinculada_id = ?")
        params.append(empresa_id)
    if q:
        where_parts.append("(c.nombre LIKE ? OR c.apellidos LIKE ? OR c.email LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])
    where = "WHERE " + " AND ".join(where_parts)

    with _conectar() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM crm_contactos c {where}", params).fetchone()[0]
        rows = conn.execute(f"""
            SELECT c.*,
                e.nombre AS nombre_empresa,
                (SELECT COUNT(*) FROM crm_interacciones i WHERE i.contacto_id = c.id) AS num_interacciones
            FROM crm_contactos c
            LEFT JOIN crm_empresas e ON e.id = c.empresa_vinculada_id
            {where}
            ORDER BY c.nombre COLLATE NOCASE
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        return {"contactos": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


def obtener_contacto(contacto_id: int) -> dict[str, Any] | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute("""
            SELECT c.*, e.nombre AS nombre_empresa
            FROM crm_contactos c
            LEFT JOIN crm_empresas e ON e.id = c.empresa_vinculada_id
            WHERE c.id = ?
        """, (contacto_id,)).fetchone()
        if not row:
            return None
        contacto = dict(row)
        interacciones = conn.execute("""
            SELECT i.*, e.nombre AS nombre_empresa
            FROM crm_interacciones i
            LEFT JOIN crm_empresas e ON e.id = i.empresa_id
            WHERE i.contacto_id = ?
            ORDER BY i.fecha DESC
        """, (contacto_id,)).fetchall()
        contacto["interacciones"] = [dict(i) for i in interacciones]
        return contacto


def crear_contacto(data: dict) -> dict:
    init_crm_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO crm_contactos (nombre, apellidos, cargo, email, telefono, telefono2,
                empresa_vinculada_id, tipo_relacion, notas, fecha_creacion, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            (data.get("nombre") or "").strip(),
            (data.get("apellidos") or "").strip() or None,
            (data.get("cargo") or "").strip() or None,
            (data.get("email") or "").strip() or None,
            (data.get("telefono") or "").strip() or None,
            (data.get("telefono2") or "").strip() or None,
            data.get("empresa_vinculada_id") or None,
            (data.get("tipo_relacion") or "otro").strip(),
            (data.get("notas") or "").strip() or None,
            ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return obtener_contacto(new_id)


def actualizar_contacto(contacto_id: int, data: dict) -> dict | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM crm_contactos WHERE id = ?", (contacto_id,)).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE crm_contactos SET
                nombre = ?, apellidos = ?, cargo = ?, email = ?, telefono = ?, telefono2 = ?,
                empresa_vinculada_id = ?, tipo_relacion = ?, notas = ?, fecha_actualizacion = ?
            WHERE id = ?
        """, (
            (data.get("nombre") or "").strip(),
            (data.get("apellidos") or "").strip() or None,
            (data.get("cargo") or "").strip() or None,
            (data.get("email") or "").strip() or None,
            (data.get("telefono") or "").strip() or None,
            (data.get("telefono2") or "").strip() or None,
            data.get("empresa_vinculada_id") or None,
            (data.get("tipo_relacion") or "otro").strip(),
            (data.get("notas") or "").strip() or None,
            _now(),
            contacto_id,
        ))
    return obtener_contacto(contacto_id)


def eliminar_contacto(contacto_id: int) -> bool:
    init_crm_db()
    with _conectar() as conn:
        n = conn.execute("UPDATE crm_contactos SET activo = 0, fecha_actualizacion = ? WHERE id = ? AND activo = 1",
                         (_now(), contacto_id)).rowcount
    return n > 0


# ─── INTERACCIONES CRM ──────────────────────────────────────────────────────

def listar_interacciones(
    empresa_id: int | None = None,
    contacto_id: int | None = None,
    tipo: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    init_crm_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if empresa_id:
        where_parts.append("i.empresa_id = ?")
        params.append(empresa_id)
    if contacto_id:
        where_parts.append("i.contacto_id = ?")
        params.append(contacto_id)
    if tipo:
        where_parts.append("i.tipo = ?")
        params.append(tipo)
    if fecha_desde:
        where_parts.append("i.fecha >= ?")
        params.append(fecha_desde)
    if fecha_hasta:
        where_parts.append("i.fecha <= ?")
        params.append(fecha_hasta + "T23:59:59")
    if q:
        where_parts.append("(i.asunto LIKE ? OR i.descripcion LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with _conectar() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM crm_interacciones i {where}", params).fetchone()[0]
        rows = conn.execute(f"""
            SELECT i.*,
                c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
                e.nombre AS nombre_empresa
            FROM crm_interacciones i
            LEFT JOIN crm_contactos c ON c.id = i.contacto_id
            LEFT JOIN crm_empresas e ON e.id = i.empresa_id
            {where}
            ORDER BY i.fecha DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        return {"interacciones": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


def crear_interaccion(data: dict) -> dict:
    init_crm_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO crm_interacciones (contacto_id, empresa_id, tipo, asunto, descripcion,
                fecha, duracion_minutos, resultado, siguiente_accion, fecha_siguiente_accion,
                oportunidad_id, creado_por, fecha_creacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("contacto_id") or None,
            data.get("empresa_id") or None,
            (data.get("tipo") or "nota").strip(),
            (data.get("asunto") or "").strip() or None,
            (data.get("descripcion") or "").strip() or None,
            (data.get("fecha") or ahora[:10]).strip(),
            data.get("duracion_minutos") or None,
            (data.get("resultado") or "").strip() or None,
            (data.get("siguiente_accion") or "").strip() or None,
            (data.get("fecha_siguiente_accion") or "").strip() or None,
            data.get("oportunidad_id") or None,
            (data.get("creado_por") or "").strip() or None,
            ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("""
            SELECT i.*, c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
                   e.nombre AS nombre_empresa
            FROM crm_interacciones i
            LEFT JOIN crm_contactos c ON c.id = i.contacto_id
            LEFT JOIN crm_empresas e ON e.id = i.empresa_id
            WHERE i.id = ?
        """, (new_id,)).fetchone())


def actualizar_interaccion(interaccion_id: int, data: dict) -> dict | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM crm_interacciones WHERE id = ?", (interaccion_id,)).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE crm_interacciones SET
                contacto_id = ?, empresa_id = ?, tipo = ?, asunto = ?, descripcion = ?,
                fecha = ?, duracion_minutos = ?, resultado = ?, siguiente_accion = ?,
                fecha_siguiente_accion = ?, oportunidad_id = ?
            WHERE id = ?
        """, (
            data.get("contacto_id") or None,
            data.get("empresa_id") or None,
            (data.get("tipo") or "nota").strip(),
            (data.get("asunto") or "").strip() or None,
            (data.get("descripcion") or "").strip() or None,
            (data.get("fecha") or "").strip() or None,
            data.get("duracion_minutos") or None,
            (data.get("resultado") or "").strip() or None,
            (data.get("siguiente_accion") or "").strip() or None,
            (data.get("fecha_siguiente_accion") or "").strip() or None,
            data.get("oportunidad_id") or None,
            interaccion_id,
        ))
        return dict(conn.execute("""
            SELECT i.*, c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
                   e.nombre AS nombre_empresa
            FROM crm_interacciones i
            LEFT JOIN crm_contactos c ON c.id = i.contacto_id
            LEFT JOIN crm_empresas e ON e.id = i.empresa_id
            WHERE i.id = ?
        """, (interaccion_id,)).fetchone())


def eliminar_interaccion(interaccion_id: int) -> bool:
    init_crm_db()
    with _conectar() as conn:
        n = conn.execute("DELETE FROM crm_interacciones WHERE id = ?", (interaccion_id,)).rowcount
    return n > 0


def interacciones_pendientes() -> list[dict[str, Any]]:
    init_crm_db()
    import datetime
    en_7_dias = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    with _conectar() as conn:
        rows = conn.execute("""
            SELECT i.*, c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
                   e.nombre AS nombre_empresa
            FROM crm_interacciones i
            LEFT JOIN crm_contactos c ON c.id = i.contacto_id
            LEFT JOIN crm_empresas e ON e.id = i.empresa_id
            WHERE i.siguiente_accion IS NOT NULL AND i.siguiente_accion != ''
              AND i.fecha_siguiente_accion IS NOT NULL
              AND i.fecha_siguiente_accion <= ?
            ORDER BY i.fecha_siguiente_accion ASC
        """, (en_7_dias,)).fetchall()
    return [dict(r) for r in rows]


# ─── OPORTUNIDADES CRM ───────────────────────────────────────────────────────

_OPORT_ESTADOS = ('lead', 'contacto_inicial', 'cotizacion_enviada', 'negociacion', 'ganada', 'perdida', 'aplazada')

_OPORT_SELECT = """
    SELECT o.*,
        e.nombre AS nombre_empresa, e.tipo AS tipo_empresa,
        c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto,
        pres.referencia AS presupuesto_ref,
        proy.nombre AS proyecto_nombre,
        (SELECT COUNT(*) FROM crm_interacciones i WHERE i.oportunidad_id = o.id) AS num_interacciones
    FROM crm_oportunidades o
    LEFT JOIN crm_empresas e ON e.id = o.empresa_id
    LEFT JOIN crm_contactos c ON c.id = o.contacto_id
    LEFT JOIN presupuestos pres ON pres.id = o.presupuesto_id
    LEFT JOIN proyectos proy ON proy.id = o.proyecto_id
"""


def listar_oportunidades(
    estado: str | None = None,
    empresa_id: int | None = None,
    contacto_id: int | None = None,
    fuente: str | None = None,
    q: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    init_crm_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if estado:
        where_parts.append("o.estado = ?")
        params.append(estado)
    if empresa_id:
        where_parts.append("o.empresa_id = ?")
        params.append(empresa_id)
    if contacto_id:
        where_parts.append("o.contacto_id = ?")
        params.append(contacto_id)
    if fuente:
        where_parts.append("o.fuente = ?")
        params.append(fuente)
    if q:
        where_parts.append("o.nombre LIKE ?")
        params.append(f"%{q}%")
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with _conectar() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM crm_oportunidades o {where}", params).fetchone()[0]
        rows = conn.execute(f"""
            {_OPORT_SELECT} {where}
            ORDER BY o.fecha_creacion DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        return {"oportunidades": [dict(r) for r in rows], "total": total}


def obtener_oportunidad(oportunidad_id: int) -> dict[str, Any] | None:
    init_crm_db()
    with _conectar() as conn:
        row = conn.execute(f"{_OPORT_SELECT} WHERE o.id = ?", (oportunidad_id,)).fetchone()
        if not row:
            return None
        op = dict(row)
        op["interacciones"] = [dict(i) for i in conn.execute("""
            SELECT i.*, c.nombre AS nombre_contacto, c.apellidos AS apellidos_contacto
            FROM crm_interacciones i
            LEFT JOIN crm_contactos c ON c.id = i.contacto_id
            WHERE i.oportunidad_id = ? ORDER BY i.fecha DESC
        """, (oportunidad_id,)).fetchall()]
        op["historial"] = [dict(h) for h in conn.execute("""
            SELECT * FROM crm_oportunidades_historial
            WHERE oportunidad_id = ? ORDER BY fecha DESC
        """, (oportunidad_id,)).fetchall()]
        return op


def crear_oportunidad(data: dict) -> dict:
    init_crm_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO crm_oportunidades
                (empresa_id, contacto_id, nombre, descripcion, estado, importe_estimado,
                 probabilidad, fecha_estimada_cierre, motivo_perdida, proyecto_id,
                 presupuesto_id, fuente, fecha_creacion, fecha_actualizacion, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("empresa_id"),
            data.get("contacto_id") or None,
            (data.get("nombre") or "").strip(),
            (data.get("descripcion") or "").strip() or None,
            (data.get("estado") or "lead").strip(),
            data.get("importe_estimado") or None,
            data.get("probabilidad") or None,
            (data.get("fecha_estimada_cierre") or "").strip() or None,
            (data.get("motivo_perdida") or "").strip() or None,
            data.get("proyecto_id") or None,
            data.get("presupuesto_id") or None,
            (data.get("fuente") or "otro").strip(),
            ahora, ahora,
            (data.get("creado_por") or "").strip() or None,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute("""
            INSERT INTO crm_oportunidades_historial (oportunidad_id, estado_anterior, estado_nuevo, fecha, usuario)
            VALUES (?, NULL, ?, ?, ?)
        """, (new_id, (data.get("estado") or "lead").strip(), ahora, None))
    return obtener_oportunidad(new_id)


def actualizar_oportunidad(oportunidad_id: int, data: dict) -> dict | None:
    init_crm_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT id, estado FROM crm_oportunidades WHERE id = ?", (oportunidad_id,)).fetchone()
        if not row:
            return None
        estado_anterior = row["estado"]
        nuevo_estado = (data.get("estado") or estado_anterior).strip()
        conn.execute("""
            UPDATE crm_oportunidades SET
                empresa_id = ?, contacto_id = ?, nombre = ?, descripcion = ?, estado = ?,
                importe_estimado = ?, probabilidad = ?, fecha_estimada_cierre = ?,
                motivo_perdida = ?, proyecto_id = ?, presupuesto_id = ?, fuente = ?,
                fecha_actualizacion = ?
            WHERE id = ?
        """, (
            data.get("empresa_id"),
            data.get("contacto_id") or None,
            (data.get("nombre") or "").strip(),
            (data.get("descripcion") or "").strip() or None,
            nuevo_estado,
            data.get("importe_estimado") or None,
            data.get("probabilidad") or None,
            (data.get("fecha_estimada_cierre") or "").strip() or None,
            (data.get("motivo_perdida") or "").strip() or None,
            data.get("proyecto_id") or None,
            data.get("presupuesto_id") or None,
            (data.get("fuente") or "otro").strip(),
            ahora,
            oportunidad_id,
        ))
        if nuevo_estado != estado_anterior:
            conn.execute("""
                INSERT INTO crm_oportunidades_historial (oportunidad_id, estado_anterior, estado_nuevo, motivo, fecha, usuario)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (oportunidad_id, estado_anterior, nuevo_estado,
                  (data.get("motivo_perdida") or "").strip() or None, ahora, None))
    return obtener_oportunidad(oportunidad_id)


def cambiar_estado_oportunidad(oportunidad_id: int, nuevo_estado: str, motivo: str | None = None) -> dict | None:
    init_crm_db()
    if nuevo_estado not in _OPORT_ESTADOS:
        return None
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute("SELECT id, estado FROM crm_oportunidades WHERE id = ?", (oportunidad_id,)).fetchone()
        if not row:
            return None
        estado_anterior = row["estado"]
        updates = "estado = ?, fecha_actualizacion = ?"
        params: list[Any] = [nuevo_estado, ahora]
        if nuevo_estado == "perdida" and motivo:
            updates += ", motivo_perdida = ?"
            params.append(motivo)
        params.append(oportunidad_id)
        conn.execute(f"UPDATE crm_oportunidades SET {updates} WHERE id = ?", params)
        if nuevo_estado != estado_anterior:
            conn.execute("""
                INSERT INTO crm_oportunidades_historial (oportunidad_id, estado_anterior, estado_nuevo, motivo, fecha, usuario)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (oportunidad_id, estado_anterior, nuevo_estado, motivo, ahora, None))
    return obtener_oportunidad(oportunidad_id)


def pipeline_oportunidades() -> list[dict[str, Any]]:
    init_crm_db()
    with _conectar() as conn:
        rows = conn.execute("""
            SELECT estado, COUNT(*) AS count, COALESCE(SUM(importe_estimado), 0) AS importe_total
            FROM crm_oportunidades
            GROUP BY estado
        """).fetchall()
    result = {e: {"count": 0, "importe_total": 0} for e in _OPORT_ESTADOS}
    for r in rows:
        result[r["estado"]] = {"count": r["count"], "importe_total": round(r["importe_total"], 2)}
    return [{"estado": e, **v} for e, v in result.items()]


# ─── NORMALIZACIÓN (delegada a terceros_db como fuente única) ─────────────────

from core.terceros_db import _normalizar_cif as normalizar_cif
from core.terceros_db import _normalizar_nombre as _nombre_normalizado
from core.terceros_db import validar_cif_nif


# ─── DETECCIÓN DE DUPLICADOS ─────────────────────────────────────────────────

def _cargar_pares_no_duplicados(conn: sqlite3.Connection) -> set[tuple[int, int]]:
    """Devuelve set de pares (min_id, max_id) marcados como no-duplicados."""
    rows = conn.execute("SELECT tercero_id_1, tercero_id_2 FROM terceros_no_duplicados").fetchall()
    return {(min(r[0], r[1]), max(r[0], r[1])) for r in rows}


def _grupo_tiene_par_descartado(registros: list[dict], no_dup: set[tuple[int, int]]) -> bool:
    """Devuelve True si TODOS los pares del grupo están descartados."""
    ids = [r["id"] for r in registros]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            par = (min(ids[i], ids[j]), max(ids[i], ids[j]))
            if par not in no_dup:
                return False
    return True


def detectar_duplicados(tipo: str = "all") -> list[dict[str, Any]]:
    """Detecta grupos de posibles duplicados en terceros por CIF o nombre.

    Args:
        tipo: 'all', 'proveedor' o 'cliente' — filtra por rol del tercero.

    Returns lista de grupos, cada uno con:
      { "motivo": str, "registros": [dict, ...] }
    Solo devuelve terceros NO fusionados y excluye pares marcados como no-duplicados.
    """
    init_crm_db()
    grupos: list[dict[str, Any]] = []
    vistos: set[int] = set()

    # Filtro de tipo
    tipo_filtro = ""
    if tipo == "proveedor":
        tipo_filtro = " AND t.es_proveedor = 1"
    elif tipo == "cliente":
        tipo_filtro = " AND t.es_cliente = 1"

    with _conectar() as conn:
        no_dup = _cargar_pares_no_duplicados(conn)

        # 1) Duplicados por CIF normalizado — excluir fusionados
        all_terceros = conn.execute(f"""
            SELECT t.*, ce.id AS crm_id
            FROM terceros t
            LEFT JOIN crm_empresas ce ON ce.tercero_id = t.id
            WHERE t.nif IS NOT NULL AND t.nif != ''
              AND t.nombre_canonico NOT LIKE '[FUSIONADO→%'
              {tipo_filtro}
        """).fetchall()

        por_cif: dict[str, list[dict]] = {}
        for t in all_terceros:
            cif_norm = normalizar_cif(t["nif"])
            if not cif_norm:
                continue
            por_cif.setdefault(cif_norm, []).append(dict(t))

        for cif_norm, registros in por_cif.items():
            if len(registros) < 2:
                continue
            # Excluir grupos cuyos pares están todos descartados
            if _grupo_tiene_par_descartado(registros, no_dup):
                continue
            ids = tuple(r["id"] for r in registros)
            vistos.update(ids)
            for r in registros:
                r["num_facturas_prov"] = conn.execute(
                    "SELECT COUNT(*) FROM facturas_proveedor WHERE UPPER(REPLACE(REPLACE(REPLACE(nif_proveedor,' ',''),'.',''),'-','')) = ?",
                    (cif_norm,)
                ).fetchone()[0]
                r["num_facturas_cli"] = conn.execute(
                    "SELECT COUNT(*) FROM facturas_cliente WHERE UPPER(REPLACE(REPLACE(REPLACE(cif_nif,' ',''),'.',''),'-','')) = ?",
                    (cif_norm,)
                ).fetchone()[0]
            grupos.append({"motivo": f"Mismo CIF normalizado: {cif_norm}", "registros": registros})

        # 2) Duplicados por nombre normalizado (excluir ya detectados por CIF)
        all_t = conn.execute(f"""
            SELECT t.*, ce.id AS crm_id
            FROM terceros t
            LEFT JOIN crm_empresas ce ON ce.tercero_id = t.id
            WHERE t.nombre_canonico NOT LIKE '[FUSIONADO→%'
              {tipo_filtro}
        """).fetchall()

        por_nombre: dict[str, list[dict]] = {}
        for t in all_t:
            if t["id"] in vistos:
                continue
            nn = _nombre_normalizado(t["nombre_canonico"])
            if not nn:
                continue
            por_nombre.setdefault(nn, []).append(dict(t))

        for nn, registros in por_nombre.items():
            if len(registros) < 2:
                continue
            if _grupo_tiene_par_descartado(registros, no_dup):
                continue
            for r in registros:
                nif_norm = normalizar_cif(r.get("nif"))
                r["num_facturas_prov"] = conn.execute(
                    "SELECT COUNT(*) FROM facturas_proveedor WHERE proveedor = ? OR (? != '' AND UPPER(REPLACE(REPLACE(REPLACE(nif_proveedor,' ',''),'.',''),'-','')) = ?)",
                    (r["nombre_canonico"], nif_norm, nif_norm)
                ).fetchone()[0]
                r["num_facturas_cli"] = conn.execute(
                    "SELECT COUNT(*) FROM facturas_cliente WHERE cliente = ? OR (? != '' AND UPPER(REPLACE(REPLACE(REPLACE(cif_nif,' ',''),'.',''),'-','')) = ?)",
                    (r["nombre_canonico"], nif_norm, nif_norm)
                ).fetchone()[0]
            grupos.append({"motivo": f"Mismo nombre: {nn}", "registros": registros})

    return grupos


def fusionar_terceros(principal_id: int, absorbido_id: int) -> dict[str, Any]:
    """Fusiona dos terceros: el absorbido se marca inactivo, sus datos y
    referencias se transfieren al principal.

    Pasos:
      1. Copiar datos faltantes del absorbido al principal
      2. Reasignar facturas_proveedor (por nombre/CIF del absorbido)
      3. Reasignar facturas_cliente (por nombre/CIF del absorbido)
      4. Reasignar empresa_tercero del absorbido al principal
      5. Reasignar CRM: contactos, interacciones, oportunidades
      6. Marcar absorbido como inactivo en terceros
      7. Marcar crm_empresa del absorbido como inactivo
    """
    init_crm_db()
    resultado = {
        "facturas_prov_reasignadas": 0,
        "facturas_cli_reasignadas": 0,
        "campos_copiados": [],
    }

    with _conectar() as conn:
        principal = dict(conn.execute("SELECT * FROM terceros WHERE id = ?", (principal_id,)).fetchone())
        absorbido = dict(conn.execute("SELECT * FROM terceros WHERE id = ?", (absorbido_id,)).fetchone())

        # 1. Copiar datos faltantes
        campos_copiables = ["nif", "pais", "localidad", "direccion", "email", "telefono"]
        updates = []
        params = []
        for campo in campos_copiables:
            val_p = (principal.get(campo) or "").strip()
            val_a = (absorbido.get(campo) or "").strip()
            if not val_p and val_a:
                updates.append(f"{campo} = ?")
                params.append(val_a)
                resultado["campos_copiados"].append(campo)
        # Also merge roles
        if absorbido["es_cliente"] and not principal["es_cliente"]:
            updates.append("es_cliente = 1")
            resultado["campos_copiados"].append("es_cliente")
        if absorbido["es_proveedor"] and not principal["es_proveedor"]:
            updates.append("es_proveedor = 1")
            resultado["campos_copiados"].append("es_proveedor")
        if absorbido.get("es_transportista") and not principal.get("es_transportista"):
            updates.append("es_transportista = 1")
            resultado["campos_copiados"].append("es_transportista")
        if updates:
            updates.append("updated_at = ?")
            params.append(_now())
            params.append(principal_id)
            conn.execute(f"UPDATE terceros SET {', '.join(updates)} WHERE id = ?", params)

        # 2. Reasignar facturas_proveedor por nombre y CIF del absorbido
        abs_cif = normalizar_cif(absorbido["nif"])
        # Add tercero_id column if missing (PASO 3 may not have run yet)
        _ensure_tercero_id_columns(conn)
        if abs_cif:
            n = conn.execute(
                "UPDATE facturas_proveedor SET tercero_id = ? WHERE tercero_id = ? OR (tercero_id IS NULL AND UPPER(REPLACE(REPLACE(REPLACE(nif_proveedor,' ',''),'.',''),'-','')) = ?)",
                (principal_id, absorbido_id, abs_cif)
            ).rowcount
            resultado["facturas_prov_reasignadas"] += n
        n = conn.execute(
            "UPDATE facturas_proveedor SET tercero_id = ? WHERE tercero_id = ? OR (tercero_id IS NULL AND proveedor = ?)",
            (principal_id, absorbido_id, absorbido["nombre_canonico"])
        ).rowcount
        resultado["facturas_prov_reasignadas"] = max(resultado["facturas_prov_reasignadas"], n)

        # 3. Reasignar facturas_cliente
        if abs_cif:
            n = conn.execute(
                "UPDATE facturas_cliente SET tercero_id = ? WHERE tercero_id = ? OR (tercero_id IS NULL AND UPPER(REPLACE(REPLACE(REPLACE(cif_nif,' ',''),'.',''),'-','')) = ?)",
                (principal_id, absorbido_id, abs_cif)
            ).rowcount
            resultado["facturas_cli_reasignadas"] += n
        n = conn.execute(
            "UPDATE facturas_cliente SET tercero_id = ? WHERE tercero_id = ? OR (tercero_id IS NULL AND cliente = ?)",
            (principal_id, absorbido_id, absorbido["nombre_canonico"])
        ).rowcount
        resultado["facturas_cli_reasignadas"] = max(resultado["facturas_cli_reasignadas"], n)

        # 3b. Actualizar campos de texto en facturas ya reasignadas al principal
        # para que muestren el nombre/CIF del tercero conservado
        prin_nif = (principal.get("nif") or "").strip()
        prin_nombre = principal["nombre_canonico"]
        abs_nombre = absorbido["nombre_canonico"]

        # facturas_proveedor: actualizar proveedor y nif_proveedor
        conn.execute(
            "UPDATE facturas_proveedor SET proveedor = ?, nif_proveedor = ?"
            " WHERE tercero_id = ? AND (proveedor = ? OR nif_proveedor = ?)",
            (prin_nombre, prin_nif, principal_id, abs_nombre,
             absorbido.get("nif") or ""),
        )
        # También por CIF normalizado del absorbido (cubre variantes con/sin guiones)
        if abs_cif:
            conn.execute(
                "UPDATE facturas_proveedor SET proveedor = ?, nif_proveedor = ?"
                " WHERE tercero_id = ? AND UPPER(REPLACE(REPLACE(REPLACE(nif_proveedor,' ',''),'.',''),'-','')) = ?",
                (prin_nombre, prin_nif, principal_id, abs_cif),
            )

        # facturas_cliente: actualizar cliente y cif_nif
        conn.execute(
            "UPDATE facturas_cliente SET cliente = ?, cif_nif = ?"
            " WHERE tercero_id = ? AND (cliente = ? OR cif_nif = ?)",
            (prin_nombre, prin_nif, principal_id, abs_nombre,
             absorbido.get("nif") or ""),
        )
        if abs_cif:
            conn.execute(
                "UPDATE facturas_cliente SET cliente = ?, cif_nif = ?"
                " WHERE tercero_id = ? AND UPPER(REPLACE(REPLACE(REPLACE(cif_nif,' ',''),'.',''),'-','')) = ?",
                (prin_nombre, prin_nif, principal_id, abs_cif),
            )

        # 4. Reasignar empresa_tercero
        # Delete duplicates first, then update
        conn.execute("""
            DELETE FROM empresa_tercero
            WHERE tercero_id = ? AND empresa_id IN (
                SELECT empresa_id FROM empresa_tercero WHERE tercero_id = ?
            )
        """, (absorbido_id, principal_id))
        conn.execute("UPDATE empresa_tercero SET tercero_id = ? WHERE tercero_id = ?",
                      (principal_id, absorbido_id))

        # 5. CRM: reasignar contactos, interacciones, oportunidades
        crm_principal = conn.execute(
            "SELECT id FROM crm_empresas WHERE tercero_id = ?", (principal_id,)
        ).fetchone()
        crm_absorbido = conn.execute(
            "SELECT id FROM crm_empresas WHERE tercero_id = ?", (absorbido_id,)
        ).fetchone()
        if crm_principal and crm_absorbido:
            pid = crm_principal["id"]
            aid = crm_absorbido["id"]
            conn.execute("UPDATE crm_contactos SET empresa_vinculada_id = ? WHERE empresa_vinculada_id = ?", (pid, aid))
            conn.execute("UPDATE crm_interacciones SET empresa_id = ? WHERE empresa_id = ?", (pid, aid))
            conn.execute("UPDATE crm_oportunidades SET empresa_id = ? WHERE empresa_id = ?", (pid, aid))
            # Copiar datos CRM faltantes
            cp = dict(conn.execute("SELECT * FROM crm_empresas WHERE id = ?", (pid,)).fetchone())
            ca = dict(conn.execute("SELECT * FROM crm_empresas WHERE id = ?", (aid,)).fetchone())
            crm_updates = []
            crm_params = []
            for campo in ["cif", "direccion", "localidad", "provincia", "pais", "telefono", "email", "web", "sector", "notas"]:
                if not (cp.get(campo) or "").strip() and (ca.get(campo) or "").strip():
                    crm_updates.append(f"{campo} = ?")
                    crm_params.append(ca[campo])
            if crm_updates:
                crm_params.append(pid)
                conn.execute(f"UPDATE crm_empresas SET {', '.join(crm_updates)} WHERE id = ?", crm_params)
            # Marcar CRM absorbido como inactivo
            conn.execute("UPDATE crm_empresas SET activo = 0 WHERE id = ?", (aid,))

        # 6. Marcar absorbido como inactivo en terceros (añadir nota)
        conn.execute(
            "UPDATE terceros SET updated_at = ?, nombre_canonico = ? WHERE id = ?",
            (_now(), f"[FUSIONADO→{principal_id}] {absorbido['nombre_canonico']}", absorbido_id)
        )

        # 7. Registrar en log de fusiones
        conn.execute(
            """INSERT INTO terceros_fusiones_log
               (tercero_conservado_id, tercero_eliminado_id, nombre_conservado, nombre_eliminado, motivo, usuario, fecha)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (principal_id, absorbido_id, principal["nombre_canonico"],
             absorbido["nombre_canonico"], "Fusión manual", "sistema", _now())
        )

    return resultado


def _ensure_tercero_id_columns(conn: sqlite3.Connection) -> None:
    """Añade columna tercero_id a facturas_proveedor/facturas_cliente si no existe."""
    for tabla in ("facturas_proveedor", "facturas_cliente"):
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tabla})").fetchall()]
        if "tercero_id" not in cols:
            conn.execute(f"ALTER TABLE {tabla} ADD COLUMN tercero_id INTEGER REFERENCES terceros(id)")


# ─── PASO 3: VINCULAR FACTURAS A TERCEROS ────────────────────────────────────

def vincular_facturas_a_terceros() -> dict[str, Any]:
    """Migración: añade tercero_id a facturas y las vincula por CIF o nombre."""
    init_crm_db()
    stats = {
        "facturas_prov_total": 0,
        "facturas_prov_vinculadas": 0,
        "facturas_prov_sin_vincular": 0,
        "facturas_cli_total": 0,
        "facturas_cli_vinculadas": 0,
        "facturas_cli_sin_vincular": 0,
    }

    with _conectar() as conn:
        _ensure_tercero_id_columns(conn)

        # Construir índice de terceros por CIF normalizado y por nombre
        terceros = conn.execute("SELECT id, nif, nombre_canonico FROM terceros").fetchall()
        por_cif: dict[str, int] = {}
        por_nombre: dict[str, int] = {}
        for t in terceros:
            cif_n = normalizar_cif(t["nif"])
            if cif_n:
                por_cif[cif_n] = t["id"]
            nn = _nombre_normalizado(t["nombre_canonico"])
            if nn:
                por_nombre[nn] = t["id"]

        # Vincular facturas_proveedor
        facturas_prov = conn.execute(
            "SELECT id, proveedor, nif_proveedor FROM facturas_proveedor WHERE tercero_id IS NULL"
        ).fetchall()
        stats["facturas_prov_total"] = conn.execute("SELECT COUNT(*) FROM facturas_proveedor").fetchone()[0]
        for f in facturas_prov:
            tid = None
            cif_n = normalizar_cif(f["nif_proveedor"])
            if cif_n and cif_n in por_cif:
                tid = por_cif[cif_n]
            if not tid:
                nn = _nombre_normalizado(f["proveedor"])
                if nn in por_nombre:
                    tid = por_nombre[nn]
            if not tid and f["proveedor"]:
                # Fuzzy match nombre
                nn = _nombre_normalizado(f["proveedor"])
                best_score = 0.0
                best_id = None
                for nombre_t, id_t in por_nombre.items():
                    score = SequenceMatcher(None, nn, nombre_t).ratio()
                    if score > best_score:
                        best_score = score
                        best_id = id_t
                if best_score >= 0.90:
                    tid = best_id
            if tid:
                conn.execute("UPDATE facturas_proveedor SET tercero_id = ? WHERE id = ?", (tid, f["id"]))
                stats["facturas_prov_vinculadas"] += 1
            else:
                stats["facturas_prov_sin_vincular"] += 1

        # Vincular facturas_cliente
        facturas_cli = conn.execute(
            "SELECT id, cliente, cif_nif FROM facturas_cliente WHERE tercero_id IS NULL"
        ).fetchall()
        stats["facturas_cli_total"] = conn.execute("SELECT COUNT(*) FROM facturas_cliente").fetchone()[0]
        for f in facturas_cli:
            tid = None
            cif_n = normalizar_cif(f["cif_nif"])
            if cif_n and cif_n in por_cif:
                tid = por_cif[cif_n]
            if not tid:
                nn = _nombre_normalizado(f["cliente"])
                if nn in por_nombre:
                    tid = por_nombre[nn]
            if not tid and f["cliente"]:
                nn = _nombre_normalizado(f["cliente"])
                best_score = 0.0
                best_id = None
                for nombre_t, id_t in por_nombre.items():
                    score = SequenceMatcher(None, nn, nombre_t).ratio()
                    if score > best_score:
                        best_score = score
                        best_id = id_t
                if best_score >= 0.90:
                    tid = best_id
            if tid:
                conn.execute("UPDATE facturas_cliente SET tercero_id = ? WHERE id = ?", (tid, f["id"]))
                stats["facturas_cli_vinculadas"] += 1
            else:
                stats["facturas_cli_sin_vincular"] += 1

        # Contar ya vinculadas previamente
        ya_vinculadas_prov = conn.execute("SELECT COUNT(*) FROM facturas_proveedor WHERE tercero_id IS NOT NULL").fetchone()[0]
        ya_vinculadas_cli = conn.execute("SELECT COUNT(*) FROM facturas_cliente WHERE tercero_id IS NOT NULL").fetchone()[0]
        stats["facturas_prov_vinculadas"] = ya_vinculadas_prov
        stats["facturas_cli_vinculadas"] = ya_vinculadas_cli
        stats["facturas_prov_sin_vincular"] = stats["facturas_prov_total"] - ya_vinculadas_prov
        stats["facturas_cli_sin_vincular"] = stats["facturas_cli_total"] - ya_vinculadas_cli

    return stats


# ─── HISTORIAL DE FUSIONES ──────────────────────────────────────────────────

def listar_fusiones_log(limit: int = 100, offset: int = 0) -> dict[str, Any]:
    """Devuelve el historial de fusiones con paginación."""
    init_crm_db()
    with _conectar() as conn:
        total = conn.execute("SELECT COUNT(*) FROM terceros_fusiones_log").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM terceros_fusiones_log ORDER BY fecha DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        return {"fusiones": [dict(r) for r in rows], "total": total}


# ─── MARCAR COMO NO-DUPLICADOS ──────────────────────────────────────────────

def marcar_no_duplicados(tercero_id_1: int, tercero_id_2: int, usuario: str = "sistema") -> dict[str, Any]:
    """Marca un par de terceros como no-duplicados para excluirlos del detector."""
    init_crm_db()
    id_min = min(tercero_id_1, tercero_id_2)
    id_max = max(tercero_id_1, tercero_id_2)
    with _conectar() as conn:
        existe = conn.execute(
            "SELECT id FROM terceros_no_duplicados WHERE tercero_id_1 = ? AND tercero_id_2 = ?",
            (id_min, id_max)
        ).fetchone()
        if not existe:
            conn.execute(
                "INSERT INTO terceros_no_duplicados (tercero_id_1, tercero_id_2, usuario, fecha) VALUES (?, ?, ?, ?)",
                (id_min, id_max, usuario, _now())
            )
    return {"ok": True}


def contar_duplicados(tipo: str = "all") -> int:
    """Devuelve solo el número total de grupos de duplicados pendientes."""
    return len(detectar_duplicados(tipo=tipo))
