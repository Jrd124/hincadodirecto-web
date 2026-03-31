"""Modulo CAE: tablas del dominio de Coordinacion de Actividades Empresariales.

Todas las tablas usan prefijo cae_ para evitar colision con tablas existentes.
Las unicas excepciones son 'empleados' y 'vehiculos', que son entidades de
primera clase del ERP y viven en sus propios modulos.
"""
from __future__ import annotations

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


# ── Constantes del dominio ──────────────────────────────────────────────────

# Tipos de documento organizados por sección / entity_type
DOC_TYPES_BY_SECTION = {
    "EMPRESA": [
        "ESCRITURA_CONSTITUCION",
        "CIF",
        "ITA",             # Informe Trabajadores en Alta
        "RNT",             # Relación Nominal de Trabajadores
        "RLC",             # Recibo de Liquidación de Cotizaciones
        "SEGURO_RC",
        "SEGURO_RC_PATRONAL",
        "TC1_TC2",
        "CERTIFICADO_ESTAR_AL_CORRIENTE_SS",
        "CERTIFICADO_ESTAR_AL_CORRIENTE_HACIENDA",
        "PREVENCION_RIESGOS",
        "ADHESION_MANCOMUNADA",
    ],
    "OPERARIO": [
        "DNI",
        "NIE",
        "FOTO",
        "ALTA_SEGURIDAD_SOCIAL",
        "CONTRATO_TRABAJO",
        "TC2_OPERARIO",
        "APTO_MEDICO",
        "CURSO_PRL_BASICO",
        "CURSO_PRL_ESPECIFICO",
        "FORMACION_ESPECIFICA",
        "CARNET_CONDUCIR",
        "AUTORIZACION_USO_EQUIPOS",
    ],
    "MAQUINA": [
        "FICHA_TECNICA",
        "SEGURO_MAQUINA",
        "CERTIFICADO_CE",
        "MANUAL_INSTRUCCIONES",
        "INSPECCION_PERIODICA",
        "PLAN_MANTENIMIENTO",
        "NUMERO_SERIE",
    ],
    "VEHICULO": [
        "PERMISO_CIRCULACION",
        "ITV",
        "SEGURO_VEHICULO",
        "MATRICULA",
    ],
}

# Lista plana para compatibilidad con código existente
DOC_TYPES = []
for _sec in DOC_TYPES_BY_SECTION.values():
    DOC_TYPES.extend(_sec)
DOC_TYPES.append("OTRO")

ENTITY_TYPES = ["EMPRESA", "OPERARIO", "MAQUINA", "VEHICULO"]

EXPEDIENTE_ESTADOS = ["ABIERTO", "EN_REVISION", "COMPLETO", "CERRADO"]

RESULTADO_ESTADOS = ["READY", "MISSING", "EXPIRED", "DOUBTFUL"]

TAREA_TIPOS = ["GET_DOCUMENT", "RENEW_DOCUMENT", "REVIEW_DOUBTFUL"]

TAREA_PRIORIDADES = ["HIGH", "MEDIUM", "LOW"]

TAREA_ESTADOS = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "DESCARTADA"]

CONFIDENCE_LEVELS = ["CONFIRMED", "SUGGESTED", "UNKNOWN"]


# ── Inicializacion ──────────────────────────────────────────────────────────


def init_cae_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        # Documentos indexados desde OneDrive
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_documentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                onedrive_item_id TEXT UNIQUE,
                drive_id TEXT,
                nombre TEXT NOT NULL,
                ruta TEXT,
                extension TEXT,
                tamano INTEGER,
                doc_type TEXT,
                entity_type TEXT CHECK(entity_type IN ('EMPRESA','OPERARIO','MAQUINA','VEHICULO')),
                entity_id INTEGER,
                confidence TEXT DEFAULT 'UNKNOWN' CHECK(confidence IN ('CONFIRMED','SUGGESTED','UNKNOWN')),
                fecha_documento TEXT,
                fecha_caducidad TEXT,
                hash_sha256 TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cae_doc_type ON cae_documentos(doc_type)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cae_doc_entity ON cae_documentos(entity_type, entity_id)")

        # Plantillas de requisitos documentales
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_plantillas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_empresa_id INTEGER REFERENCES crm_empresas(id),
                nombre TEXT NOT NULL,
                descripcion TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)

        # Items individuales de cada plantilla
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_plantilla_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plantilla_id INTEGER NOT NULL REFERENCES cae_plantillas(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL,
                target_entity_type TEXT NOT NULL CHECK(target_entity_type IN ('EMPRESA','OPERARIO','MAQUINA','VEHICULO')),
                doc_type TEXT NOT NULL,
                has_expiry INTEGER DEFAULT 1,
                expiry_warning_days INTEGER DEFAULT 30,
                is_mandatory INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)

        # Expedientes CAE vinculados a proyectos
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_expedientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER UNIQUE REFERENCES proyectos(id),
                plantilla_id INTEGER REFERENCES cae_plantillas(id),
                estado TEXT DEFAULT 'ABIERTO' CHECK(estado IN ('ABIERTO','EN_REVISION','COMPLETO','CERRADO')),
                last_analysis_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)

        # Entidades asignadas a un expediente
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_expediente_entidades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expediente_id INTEGER NOT NULL REFERENCES cae_expedientes(id) ON DELETE CASCADE,
                entity_type TEXT NOT NULL CHECK(entity_type IN ('OPERARIO','MAQUINA','VEHICULO')),
                entity_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(expediente_id, entity_type, entity_id)
            )
        """)

        # Resultados de matching (requisito x entidad)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_resultados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expediente_id INTEGER NOT NULL REFERENCES cae_expedientes(id) ON DELETE CASCADE,
                plantilla_item_id INTEGER NOT NULL REFERENCES cae_plantilla_items(id),
                entity_type TEXT,
                entity_id INTEGER,
                documento_id INTEGER REFERENCES cae_documentos(id),
                status TEXT NOT NULL CHECK(status IN ('READY','MISSING','EXPIRED','DOUBTFUL')),
                last_checked_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cae_res_exp ON cae_resultados(expediente_id)")

        # Tareas derivadas del analisis documental
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_tareas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expediente_id INTEGER NOT NULL REFERENCES cae_expedientes(id) ON DELETE CASCADE,
                resultado_id INTEGER REFERENCES cae_resultados(id),
                tipo TEXT NOT NULL CHECK(tipo IN ('GET_DOCUMENT','RENEW_DOCUMENT','REVIEW_DOUBTFUL')),
                prioridad TEXT DEFAULT 'MEDIUM' CHECK(prioridad IN ('HIGH','MEDIUM','LOW')),
                titulo TEXT NOT NULL,
                descripcion TEXT,
                entity_label TEXT,
                estado TEXT DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','EN_CURSO','COMPLETADA','DESCARTADA')),
                assigned_to INTEGER REFERENCES usuarios(id),
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cae_tar_exp ON cae_tareas(expediente_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_cae_tar_est ON cae_tareas(estado)")

        # Carpetas OneDrive seleccionadas para indexacion
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_sync_carpetas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                drive_id TEXT NOT NULL,
                folder_id TEXT NOT NULL,
                folder_path TEXT,
                label TEXT,
                enabled INTEGER DEFAULT 1,
                delta_token TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(drive_id, folder_id)
            )
        """)

        # Auditoria de sincronizaciones
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                carpeta_id INTEGER NOT NULL REFERENCES cae_sync_carpetas(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                items_found INTEGER DEFAULT 0,
                items_new INTEGER DEFAULT 0,
                items_updated INTEGER DEFAULT 0,
                status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','OK','ERROR')),
                error_message TEXT
            )
        """)

        # Tipos de documento personalizados (añadidos por el usuario desde la UI)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cae_doc_types_custom (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                section TEXT NOT NULL CHECK(section IN ('EMPRESA','OPERARIO','MAQUINA','VEHICULO')),
                has_expiry INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)

    _initialized = True


# ── Tipos de documento personalizados ─────────────────────────────────────


def listar_doc_types_custom() -> list:
    init_cae_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT * FROM cae_doc_types_custom ORDER BY section, label"
        ).fetchall()
    return [dict(r) for r in rows]


def crear_doc_type_custom(code: str, label: str, section: str, has_expiry: bool = True) -> dict:
    init_cae_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO cae_doc_types_custom (code, label, section, has_expiry, created_at) VALUES (?,?,?,?,?)",
            [code.upper(), label, section, int(has_expiry), _now()],
        )
        row = conn.execute(
            "SELECT * FROM cae_doc_types_custom WHERE code = ?", [code.upper()]
        ).fetchone()
    return dict(row)


def eliminar_doc_type_custom(dtid: int) -> bool:
    init_cae_db()
    with _conectar() as conn:
        cur = conn.execute("DELETE FROM cae_doc_types_custom WHERE id = ?", [dtid])
    return cur.rowcount > 0


def get_all_doc_types_by_section() -> dict:
    """Devuelve DOC_TYPES_BY_SECTION + tipos personalizados fusionados."""
    custom = listar_doc_types_custom()
    result = {k: list(v) for k, v in DOC_TYPES_BY_SECTION.items()}
    for c in custom:
        sec = c["section"]
        if sec in result and c["code"] not in result[sec]:
            result[sec].append(c["code"])
    return result


def get_all_doc_types_flat() -> list:
    """DOC_TYPES + custom types como lista plana."""
    sections = get_all_doc_types_by_section()
    flat = []
    for v in sections.values():
        flat.extend(v)
    if "OTRO" not in flat:
        flat.append("OTRO")
    return flat


# ── CRUD Documentos CAE ─────────────────────────────────────────────────────


def listar_documentos(filtros: dict | None = None) -> list:
    init_cae_db()
    filtros = filtros or {}
    q = "SELECT * FROM cae_documentos WHERE 1=1"
    params = []
    if filtros.get("doc_type"):
        q += " AND doc_type = ?"
        params.append(filtros["doc_type"])
    if filtros.get("entity_type"):
        q += " AND entity_type = ?"
        params.append(filtros["entity_type"])
    if filtros.get("confidence"):
        q += " AND confidence = ?"
        params.append(filtros["confidence"])
    if filtros.get("busqueda"):
        q += " AND (nombre LIKE ? OR ruta LIKE ?)"
        like = f"%{filtros['busqueda']}%"
        params.extend([like, like])
    q += " ORDER BY created_at DESC"
    if filtros.get("limit"):
        q += f" LIMIT {int(filtros['limit'])}"
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def obtener_documento(doc_id: int) -> dict | None:
    init_cae_db()
    with _conectar() as conn:
        row = conn.execute("SELECT * FROM cae_documentos WHERE id = ?", [doc_id]).fetchone()
        return dict(row) if row else None


def upsert_documento(data: dict) -> dict:
    """Inserta o actualiza un documento por onedrive_item_id."""
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        existing = None
        if data.get("onedrive_item_id"):
            existing = conn.execute(
                "SELECT id FROM cae_documentos WHERE onedrive_item_id = ?",
                [data["onedrive_item_id"]],
            ).fetchone()
        if existing:
            doc_id = existing["id"]
            conn.execute(
                "UPDATE cae_documentos SET nombre=?, ruta=?, extension=?, tamano=?, "
                "doc_type=?, entity_type=?, entity_id=?, confidence=?, "
                "fecha_documento=?, fecha_caducidad=?, hash_sha256=?, "
                "last_synced_at=?, updated_at=? WHERE id=?",
                [
                    data.get("nombre"), data.get("ruta"), data.get("extension"),
                    data.get("tamano"), data.get("doc_type"), data.get("entity_type"),
                    data.get("entity_id"), data.get("confidence", "UNKNOWN"),
                    data.get("fecha_documento"), data.get("fecha_caducidad"),
                    data.get("hash_sha256"), now, now, doc_id,
                ],
            )
            return obtener_documento(doc_id) or {}
        else:
            cur = conn.execute(
                "INSERT INTO cae_documentos (onedrive_item_id, drive_id, nombre, ruta, "
                "extension, tamano, doc_type, entity_type, entity_id, confidence, "
                "fecha_documento, fecha_caducidad, hash_sha256, last_synced_at, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                    data.get("onedrive_item_id"), data.get("drive_id"),
                    data.get("nombre"), data.get("ruta"), data.get("extension"),
                    data.get("tamano"), data.get("doc_type"), data.get("entity_type"),
                    data.get("entity_id"), data.get("confidence", "UNKNOWN"),
                    data.get("fecha_documento"), data.get("fecha_caducidad"),
                    data.get("hash_sha256"), now, now, now,
                ],
            )
            return obtener_documento(cur.lastrowid) or {}


def actualizar_documento(doc_id: int, data: dict) -> dict:
    """Actualizar clasificacion o confirmacion de un documento."""
    init_cae_db()
    now = _now()
    campos = ["doc_type", "entity_type", "entity_id", "confidence",
              "fecha_documento", "fecha_caducidad"]
    sets = []
    vals = []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            vals.append(data[c])
    if not sets:
        return obtener_documento(doc_id) or {}
    sets.append("updated_at = ?")
    vals.append(now)
    vals.append(doc_id)
    with _conectar() as conn:
        conn.execute(f"UPDATE cae_documentos SET {', '.join(sets)} WHERE id = ?", vals)
    return obtener_documento(doc_id) or {}


# ── CRUD Plantillas ─────────────────────────────────────────────────────────


def listar_plantillas() -> list:
    init_cae_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT p.*, e.nombre AS cliente_nombre FROM cae_plantillas p "
            "LEFT JOIN crm_empresas e ON e.id = p.cliente_empresa_id "
            "ORDER BY p.nombre"
        ).fetchall()
        result = []
        for r in rows:
            p = dict(r)
            p["items"] = [dict(i) for i in conn.execute(
                "SELECT * FROM cae_plantilla_items WHERE plantilla_id = ? ORDER BY sort_order",
                [p["id"]],
            ).fetchall()]
            result.append(p)
        return result


def obtener_plantilla(pid: int) -> dict | None:
    init_cae_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT p.*, e.nombre AS cliente_nombre FROM cae_plantillas p "
            "LEFT JOIN crm_empresas e ON e.id = p.cliente_empresa_id WHERE p.id = ?",
            [pid],
        ).fetchone()
        if not row:
            return None
        p = dict(row)
        p["items"] = [dict(i) for i in conn.execute(
            "SELECT * FROM cae_plantilla_items WHERE plantilla_id = ? ORDER BY sort_order",
            [pid],
        ).fetchall()]
        return p


def crear_plantilla(data: dict) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO cae_plantillas (cliente_empresa_id, nombre, descripcion, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [data.get("cliente_empresa_id"), data.get("nombre", ""), data.get("descripcion"), now, now],
        )
        pid = cur.lastrowid
        for item in data.get("items", []):
            conn.execute(
                "INSERT INTO cae_plantilla_items (plantilla_id, nombre, target_entity_type, "
                "doc_type, has_expiry, expiry_warning_days, is_mandatory, sort_order, notas, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [
                    pid, item.get("nombre", ""), item.get("target_entity_type", "EMPRESA"),
                    item.get("doc_type", "OTRO"), item.get("has_expiry", 1),
                    item.get("expiry_warning_days", 30), item.get("is_mandatory", 1),
                    item.get("sort_order", 0), item.get("notas"), now, now,
                ],
            )
        return obtener_plantilla(pid) or {}


def actualizar_plantilla(pid: int, data: dict) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        conn.execute(
            "UPDATE cae_plantillas SET nombre=?, descripcion=?, cliente_empresa_id=?, updated_at=? WHERE id=?",
            [data.get("nombre"), data.get("descripcion"), data.get("cliente_empresa_id"), now, pid],
        )
    return obtener_plantilla(pid) or {}


def reemplazar_plantilla_items(pid: int, items: list) -> None:
    """Borra todos los items existentes y los recrea desde la lista proporcionada."""
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        conn.execute("DELETE FROM cae_plantilla_items WHERE plantilla_id = ?", [pid])
        for i, item in enumerate(items):
            conn.execute(
                "INSERT INTO cae_plantilla_items (plantilla_id, nombre, target_entity_type, "
                "doc_type, has_expiry, expiry_warning_days, is_mandatory, sort_order, notas, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [
                    pid, item.get("nombre", ""), item.get("target_entity_type", "EMPRESA"),
                    item.get("doc_type", "OTRO"), item.get("has_expiry", 1),
                    item.get("expiry_warning_days", 30), item.get("is_mandatory", 1),
                    item.get("sort_order", i), item.get("notas"), now, now,
                ],
            )


def eliminar_plantilla(pid: int) -> bool:
    init_cae_db()
    with _conectar() as conn:
        cur = conn.execute("DELETE FROM cae_plantillas WHERE id = ?", [pid])
        return cur.rowcount > 0


# ── CRUD Items de plantilla ─────────────────────────────────────────────────


def crear_plantilla_item(plantilla_id: int, data: dict) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO cae_plantilla_items (plantilla_id, nombre, target_entity_type, "
            "doc_type, has_expiry, expiry_warning_days, is_mandatory, sort_order, notas, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [
                plantilla_id, data.get("nombre", ""), data.get("target_entity_type", "EMPRESA"),
                data.get("doc_type", "OTRO"), data.get("has_expiry", 1),
                data.get("expiry_warning_days", 30), data.get("is_mandatory", 1),
                data.get("sort_order", 0), data.get("notas"), now, now,
            ],
        )
        row = conn.execute("SELECT * FROM cae_plantilla_items WHERE id = ?", [cur.lastrowid]).fetchone()
        return dict(row) if row else {}


def actualizar_plantilla_item(item_id: int, data: dict) -> dict:
    init_cae_db()
    now = _now()
    campos = ["nombre", "target_entity_type", "doc_type", "has_expiry",
              "expiry_warning_days", "is_mandatory", "sort_order", "notas"]
    sets = []
    vals = []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            vals.append(data[c])
    if not sets:
        return {}
    sets.append("updated_at = ?")
    vals.append(now)
    vals.append(item_id)
    with _conectar() as conn:
        conn.execute(f"UPDATE cae_plantilla_items SET {', '.join(sets)} WHERE id = ?", vals)
        row = conn.execute("SELECT * FROM cae_plantilla_items WHERE id = ?", [item_id]).fetchone()
        return dict(row) if row else {}


def eliminar_plantilla_item(item_id: int) -> bool:
    init_cae_db()
    with _conectar() as conn:
        cur = conn.execute("DELETE FROM cae_plantilla_items WHERE id = ?", [item_id])
        return cur.rowcount > 0


# ── CRUD Expedientes ────────────────────────────────────────────────────────


def listar_expedientes() -> list:
    init_cae_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT e.*, p.nombre AS proyecto_nombre, p.codigo AS proyecto_codigo, "
            "pl.nombre AS plantilla_nombre "
            "FROM cae_expedientes e "
            "LEFT JOIN proyectos p ON p.id = e.proyecto_id "
            "LEFT JOIN cae_plantillas pl ON pl.id = e.plantilla_id "
            "ORDER BY e.created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def obtener_expediente(eid: int) -> dict | None:
    init_cae_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT e.*, p.nombre AS proyecto_nombre, p.codigo AS proyecto_codigo, "
            "pl.nombre AS plantilla_nombre "
            "FROM cae_expedientes e "
            "LEFT JOIN proyectos p ON p.id = e.proyecto_id "
            "LEFT JOIN cae_plantillas pl ON pl.id = e.plantilla_id "
            "WHERE e.id = ?",
            [eid],
        ).fetchone()
        if not row:
            return None
        exp = dict(row)
        # Entidades asignadas
        exp["entidades"] = [dict(r) for r in conn.execute(
            "SELECT * FROM cae_expediente_entidades WHERE expediente_id = ? ORDER BY entity_type, entity_id",
            [eid],
        ).fetchall()]
        # Resultados del ultimo analisis
        exp["resultados"] = [dict(r) for r in conn.execute(
            "SELECT r.*, i.nombre AS item_nombre, i.target_entity_type, i.doc_type, i.is_mandatory, "
            "d.nombre AS documento_nombre "
            "FROM cae_resultados r "
            "JOIN cae_plantilla_items i ON i.id = r.plantilla_item_id "
            "LEFT JOIN cae_documentos d ON d.id = r.documento_id "
            "WHERE r.expediente_id = ? ORDER BY i.sort_order",
            [eid],
        ).fetchall()]
        # Tareas pendientes
        exp["tareas"] = [dict(r) for r in conn.execute(
            "SELECT * FROM cae_tareas WHERE expediente_id = ? ORDER BY "
            "CASE prioridad WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, created_at DESC",
            [eid],
        ).fetchall()]
        return exp


def crear_expediente(data: dict) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO cae_expedientes (proyecto_id, plantilla_id, estado, created_at, updated_at) "
            "VALUES (?, ?, 'ABIERTO', ?, ?)",
            [data.get("proyecto_id"), data.get("plantilla_id"), now, now],
        )
        return obtener_expediente(cur.lastrowid) or {}


def actualizar_expediente(eid: int, data: dict) -> dict:
    init_cae_db()
    now = _now()
    campos = ["plantilla_id", "estado"]
    sets = []
    vals = []
    for c in campos:
        if c in data:
            sets.append(f"{c} = ?")
            vals.append(data[c])
    if not sets:
        return obtener_expediente(eid) or {}
    sets.append("updated_at = ?")
    vals.append(now)
    vals.append(eid)
    with _conectar() as conn:
        conn.execute(f"UPDATE cae_expedientes SET {', '.join(sets)} WHERE id = ?", vals)
    return obtener_expediente(eid) or {}


# ── Entidades de expediente ─────────────────────────────────────────────────


def asignar_entidad(expediente_id: int, entity_type: str, entity_id: int) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        try:
            conn.execute(
                "INSERT INTO cae_expediente_entidades (expediente_id, entity_type, entity_id, created_at) "
                "VALUES (?, ?, ?, ?)",
                [expediente_id, entity_type, entity_id, now],
            )
        except Exception:
            pass  # Ya existe (UNIQUE constraint)
        rows = conn.execute(
            "SELECT * FROM cae_expediente_entidades WHERE expediente_id = ?",
            [expediente_id],
        ).fetchall()
        return {"entidades": [dict(r) for r in rows]}


def desasignar_entidad(expediente_id: int, entity_type: str, entity_id: int) -> dict:
    init_cae_db()
    with _conectar() as conn:
        conn.execute(
            "DELETE FROM cae_expediente_entidades WHERE expediente_id = ? AND entity_type = ? AND entity_id = ?",
            [expediente_id, entity_type, entity_id],
        )
        rows = conn.execute(
            "SELECT * FROM cae_expediente_entidades WHERE expediente_id = ?",
            [expediente_id],
        ).fetchall()
        return {"entidades": [dict(r) for r in rows]}


# ── CRUD Tareas ─────────────────────────────────────────────────────────────


def listar_tareas(filtros: dict | None = None) -> list:
    init_cae_db()
    filtros = filtros or {}
    q = "SELECT t.*, e.proyecto_id FROM cae_tareas t JOIN cae_expedientes e ON e.id = t.expediente_id WHERE 1=1"
    params = []
    if filtros.get("estado"):
        q += " AND t.estado = ?"
        params.append(filtros["estado"])
    if filtros.get("tipo"):
        q += " AND t.tipo = ?"
        params.append(filtros["tipo"])
    if filtros.get("prioridad"):
        q += " AND t.prioridad = ?"
        params.append(filtros["prioridad"])
    if filtros.get("expediente_id"):
        q += " AND t.expediente_id = ?"
        params.append(filtros["expediente_id"])
    q += " ORDER BY CASE t.prioridad WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.created_at DESC"
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def actualizar_tarea(tarea_id: int, data: dict) -> dict:
    init_cae_db()
    now = _now()
    sets = []
    vals = []
    if "estado" in data:
        sets.append("estado = ?")
        vals.append(data["estado"])
        if data["estado"] == "COMPLETADA":
            sets.append("completed_at = ?")
            vals.append(now)
    if "assigned_to" in data:
        sets.append("assigned_to = ?")
        vals.append(data["assigned_to"])
    if not sets:
        return {}
    vals.append(tarea_id)
    with _conectar() as conn:
        conn.execute(f"UPDATE cae_tareas SET {', '.join(sets)} WHERE id = ?", vals)
        row = conn.execute("SELECT * FROM cae_tareas WHERE id = ?", [tarea_id]).fetchone()
        return dict(row) if row else {}


# ── CRUD Sync Carpetas ──────────────────────────────────────────────────────


def listar_sync_carpetas() -> list:
    init_cae_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM cae_sync_carpetas ORDER BY label, folder_path"
        ).fetchall()]


def crear_sync_carpeta(data: dict) -> dict:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO cae_sync_carpetas (drive_id, folder_id, folder_path, label, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [data.get("drive_id"), data.get("folder_id"), data.get("folder_path"), data.get("label"), now],
        )
        if cur.lastrowid:
            row = conn.execute("SELECT * FROM cae_sync_carpetas WHERE id = ?", [cur.lastrowid]).fetchone()
            return dict(row) if row else {}
        # Ya existia
        row = conn.execute(
            "SELECT * FROM cae_sync_carpetas WHERE drive_id = ? AND folder_id = ?",
            [data.get("drive_id"), data.get("folder_id")],
        ).fetchone()
        return dict(row) if row else {}


def eliminar_sync_carpeta(cid: int) -> bool:
    init_cae_db()
    with _conectar() as conn:
        cur = conn.execute("DELETE FROM cae_sync_carpetas WHERE id = ?", [cid])
        return cur.rowcount > 0


def actualizar_delta_token(carpeta_id: int, delta_token: str) -> None:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        conn.execute(
            "UPDATE cae_sync_carpetas SET delta_token = ?, last_synced_at = ? WHERE id = ?",
            [delta_token, now, carpeta_id],
        )


# ── Sync Runs ───────────────────────────────────────────────────────────────


def crear_sync_run(carpeta_id: int) -> int:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO cae_sync_runs (carpeta_id, started_at) VALUES (?, ?)",
            [carpeta_id, now],
        )
        return cur.lastrowid


def finalizar_sync_run(run_id: int, items_found: int, items_new: int,
                        items_updated: int, status: str = "OK", error: str | None = None) -> None:
    init_cae_db()
    now = _now()
    with _conectar() as conn:
        conn.execute(
            "UPDATE cae_sync_runs SET finished_at=?, items_found=?, items_new=?, "
            "items_updated=?, status=?, error_message=? WHERE id=?",
            [now, items_found, items_new, items_updated, status, error, run_id],
        )


def listar_sync_runs(limit: int = 20) -> list:
    init_cae_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT sr.*, sc.label AS carpeta_label, sc.folder_path "
            "FROM cae_sync_runs sr "
            "JOIN cae_sync_carpetas sc ON sc.id = sr.carpeta_id "
            "ORDER BY sr.started_at DESC LIMIT ?",
            [limit],
        ).fetchall()]


# ── Dashboard stats ─────────────────────────────────────────────────────────


def obtener_dashboard_stats() -> dict:
    init_cae_db()
    with _conectar() as conn:
        exp_activos = conn.execute(
            "SELECT COUNT(*) FROM cae_expedientes WHERE estado IN ('ABIERTO','EN_REVISION')"
        ).fetchone()[0]
        docs_total = conn.execute("SELECT COUNT(*) FROM cae_documentos").fetchone()[0]
        docs_caducados = conn.execute(
            "SELECT COUNT(*) FROM cae_documentos WHERE fecha_caducidad < date('now') AND fecha_caducidad IS NOT NULL"
        ).fetchone()[0]
        tareas_pendientes = conn.execute(
            "SELECT COUNT(*) FROM cae_tareas WHERE estado IN ('PENDIENTE','EN_CURSO')"
        ).fetchone()[0]
        resultados = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM cae_resultados GROUP BY status"
        ).fetchall()
        resultados_por_estado = {r["status"]: r["cnt"] for r in resultados}
        return {
            "expedientes_activos": exp_activos,
            "documentos_total": docs_total,
            "documentos_caducados": docs_caducados,
            "tareas_pendientes": tareas_pendientes,
            "resultados_por_estado": resultados_por_estado,
        }
