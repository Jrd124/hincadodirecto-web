"""Modulo Maquinaria: CRUD de maquinas, checks semanales, revisiones, incidencias y tokens operario."""
from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta

from core.db import conectar as _conectar, now_iso as _now

_initialized = False

# Zonas / subsistemas de la máquina para clasificar incidencias (Fase 1)
ZONAS_INCIDENCIA = [
    "hidraulico",
    "motor",
    "electrico",
    "martillo",
    "guias",
    "latiguillos",
    "traslacion",
    "perforacion",
    "bomba_inyeccion",
    "orugas_rodillos",
    "reductor",
    "estructura_chasis",
    "barrena",
    "cabina",
    "refrigeracion",
    "otro",
]

ZONAS_LABELS = {
    "hidraulico": "Hidráulico",
    "motor": "Motor",
    "electrico": "Eléctrico",
    "martillo": "Martillo",
    "guias": "Guías",
    "latiguillos": "Latiguillos",
    "traslacion": "Traslación",
    "perforacion": "Perforación",
    "bomba_inyeccion": "Bomba de inyección",
    "orugas_rodillos": "Orugas / Rodillos",
    "reductor": "Reductor",
    "estructura_chasis": "Estructura / Chasis",
    "barrena": "Barrena",
    "cabina": "Cabina",
    "refrigeracion": "Refrigeración",
    "otro": "Otro",
}

# Tipos de incidencia (Fase 1)
TIPOS_INCIDENCIA = ["averia", "anomalia", "correctivo", "observacion_preventiva"]
TIPOS_INCIDENCIA_LABELS = {
    "averia": "Avería",
    "anomalia": "Anomalía",
    "correctivo": "Correctivo",
    "observacion_preventiva": "Observación preventiva",
}

# Estados de incidencia (Fase 1 — 7 estados)
ESTADOS_INCIDENCIA = [
    "abierta", "en_diagnostico", "pendiente_pieza", "pendiente_taller",
    "en_reparacion", "resuelta", "cerrada_validada",
]

# Transiciones permitidas entre estados de incidencia
TRANSICIONES_INCIDENCIA = {
    "abierta": ["en_diagnostico", "resuelta"],
    "en_diagnostico": ["pendiente_pieza", "pendiente_taller", "en_reparacion", "resuelta"],
    "pendiente_pieza": ["en_reparacion"],
    "pendiente_taller": ["en_reparacion"],
    "en_reparacion": ["resuelta"],
    "resuelta": ["cerrada_validada"],
    "cerrada_validada": [],  # estado terminal
    # Compatibilidad: estados legacy
    "en_curso": ["resuelta", "cerrada_validada", "en_diagnostico"],
    "cerrada": [],
}

# Estados operativos de máquina (Fase 1) — ordenados por gravedad (1=máxima)
ESTADOS_OPERATIVOS = [
    "decomisionada",               # 1 - fuera de servicio permanente
    "en_reparacion",               # 2 - intervenida activamente
    "parada_pendiente_pieza",      # 3 - parada, esperando material
    "parada_diagnostico",          # 4 - parada, evaluando
    "pendiente_taller",            # 5 - esperando slot en taller
    "en_reserva",                  # 6 - no asignada pero disponible
    "operativa_con_limitaciones",  # 7 - funciona con restricciones
    "operativa",                   # 8 - todo correcto
]
# Mapa estado → prioridad (menor = más grave)
PRIORIDAD_ESTADO_OPERATIVO = {e: i + 1 for i, e in enumerate(ESTADOS_OPERATIVOS)}

# Motivos de downtime
MOTIVOS_DOWNTIME = ["averia", "espera_pieza", "espera_taller", "diagnostico"]

# Coste por día parado (configurable, default 900 EUR)
COSTE_DIA_PARADO = 900


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
                estado TEXT DEFAULT 'abierta' CHECK(estado IN (
                    'abierta','en_diagnostico','pendiente_pieza','pendiente_taller',
                    'en_reparacion','resuelta','cerrada_validada',
                    'en_curso','cerrada'
                )),
                resolucion TEXT,
                cerrada_at TEXT,
                created_at TEXT NOT NULL,
                -- Fase 1: campos ampliados
                hora_deteccion TEXT,
                horometro_deteccion REAL,
                proyecto_id INTEGER REFERENCES proyectos(id),
                operario_detecta TEXT,
                tipo_incidencia TEXT CHECK(tipo_incidencia IN ('averia','anomalia','correctivo','observacion_preventiva')),
                subsistema TEXT,
                sintoma_inicial TEXT,
                maquina_siguio_operando INTEGER,
                fecha_hora_parada TEXT,
                fecha_hora_vuelta TEXT,
                horas_downtime REAL,
                motivo_downtime TEXT CHECK(motivo_downtime IN ('averia','espera_pieza','espera_taller','diagnostico')),
                diagnostico_provisional TEXT,
                causa_raiz TEXT,
                accion_tomada TEXT,
                pieza_sustituida TEXT,
                repuesto_id INTEGER,
                taller_id INTEGER,
                resuelto_en TEXT CHECK(resuelto_en IN ('campo','taller')),
                espera_pieza INTEGER DEFAULT 0,
                espera_mecanico INTEGER DEFAULT 0,
                coste_repuesto REAL DEFAULT 0,
                coste_servicio REAL DEFAULT 0,
                coste_downtime REAL DEFAULT 0,
                es_repetida INTEGER DEFAULT 0,
                incidencia_anterior_id INTEGER REFERENCES maquinaria_incidencias(id),
                leccion_aprendida TEXT,
                accion_preventiva TEXT,
                es_historico INTEGER DEFAULT 0,
                fuente_dato TEXT CHECK(fuente_dato IN ('factura','whatsapp','memoria','albaran','otro')),
                -- Campos existentes migrados
                telegram_id INTEGER,
                operario_nombre TEXT,
                zona TEXT
            )
        """)
        # ── Migración: detectar tabla vieja (3 estados) y migrar a 7 estados + campos nuevos ──
        # IMPORTANTE: ejecutar ANTES de crear índices, porque la tabla puede existir
        # sin las columnas nuevas (tipo_incidencia, subsistema, etc.) y CREATE INDEX fallaría.
        _migrate_incidencias_fase1(conn)

        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_maq ON maquinaria_incidencias(maquina_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_estado ON maquinaria_incidencias(estado)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_tipo ON maquinaria_incidencias(tipo_incidencia)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_subsistema ON maquinaria_incidencias(subsistema)")

        # ── Tokens de acceso operario (sin login) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                operario_nombre TEXT,
                created_by INTEGER REFERENCES usuarios(id),
                expires_at TEXT,
                activo INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_tok_token ON maquinaria_tokens(token)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_tok_maq ON maquinaria_tokens(maquina_id)")

        # ── Fotos adjuntas a checks/incidencias/revisiones ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_fotos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entidad_tipo TEXT NOT NULL CHECK(entidad_tipo IN ('check','incidencia','revision','inc_update')),
                entidad_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_fotos_ent ON maquinaria_fotos(entidad_tipo, entidad_id)")

        # Migrar CHECK constraint de maquinaria_fotos para soportar 'inc_update'
        try:
            tbl_sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='maquinaria_fotos'"
            ).fetchone()
            if tbl_sql and "inc_update" not in (tbl_sql[0] or ""):
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS _maq_fotos_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        entidad_tipo TEXT NOT NULL CHECK(entidad_tipo IN ('check','incidencia','revision','inc_update')),
                        entidad_id INTEGER NOT NULL,
                        filename TEXT NOT NULL,
                        filepath TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    );
                    INSERT OR IGNORE INTO _maq_fotos_new SELECT * FROM maquinaria_fotos;
                    DROP TABLE maquinaria_fotos;
                    ALTER TABLE _maq_fotos_new RENAME TO maquinaria_fotos;
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_fotos_ent ON maquinaria_fotos(entidad_tipo, entidad_id)")
        except Exception:
            pass  # tabla ya migrada o no existía

        # ── Actualizaciones / notas de progreso en incidencias ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_incidencia_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incidencia_id INTEGER NOT NULL REFERENCES maquinaria_incidencias(id) ON DELETE CASCADE,
                texto TEXT NOT NULL,
                autor_nombre TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_upd ON maquinaria_incidencia_updates(incidencia_id)")

        # ── Tareas de mantenimiento programado (manual Orteco HD800-1000) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_maintenance_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                intervalo_horas INTEGER NOT NULL,
                rol TEXT NOT NULL CHECK(rol IN ('mantenedor','tecnico_especializado')),
                requires_workshop INTEGER DEFAULT 0,
                checklist_json TEXT,
                activo INTEGER DEFAULT 1
            )
        """)

        # ── Logs de mantenimiento completado por tarea ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_maintenance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                task_code TEXT NOT NULL,
                horometro_at REAL NOT NULL,
                due_hours REAL NOT NULL,
                operario_nombre TEXT,
                token_id INTEGER REFERENCES maquinaria_tokens(id),
                observaciones TEXT,
                checklist_result TEXT,
                completed_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maint_log_maq ON maquinaria_maintenance_logs(maquina_id, task_code)")

        # ── Contacto operario (teléfono para WhatsApp/SMS) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_operario_contacto (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_id INTEGER NOT NULL UNIQUE REFERENCES maquinaria_tokens(id) ON DELETE CASCADE,
                telefono TEXT,
                canal_preferido TEXT DEFAULT 'whatsapp' CHECK(canal_preferido IN ('whatsapp','sms','email')),
                email TEXT,
                notificaciones_activas INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)

        # ── Log de notificaciones (anti-spam) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_notification_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                task_code TEXT NOT NULL,
                week_iso TEXT NOT NULL,
                token_id INTEGER REFERENCES maquinaria_tokens(id),
                canal TEXT,
                mensaje TEXT,
                estado TEXT DEFAULT 'enviado' CHECK(estado IN ('enviado','fallido','cancelado')),
                external_id TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(maquina_id, task_code, week_iso)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_notif_log_maq ON maquinaria_notification_log(maquina_id, task_code)")

        # ── Documentos generados (certificados, exports, passports) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_documentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER REFERENCES maquinas(id),
                tipo TEXT NOT NULL CHECK(tipo IN (
                    'service_history_pdf', 'service_history_xlsx',
                    'certificado_cae', 'asset_passport', 'data_room_zip',
                    'ficha_maquina_pdf', 'historial_incidencias_pdf',
                    'informe_disponibilidad_pdf', 'informe_costes_pdf',
                    'checklist_pdf', 'otro'
                )),
                titulo TEXT NOT NULL,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                mime_type TEXT,
                size_bytes INTEGER,
                hash_sha256 TEXT,
                provider TEXT DEFAULT 'local',
                canonical_path TEXT,
                generado_por TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_docs_maq ON maquinaria_documentos(maquina_id, tipo)")

        # ── Auditor links (Fase 4) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_auditor_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                maquina_id INTEGER REFERENCES maquinas(id),
                flota_completa INTEGER DEFAULT 0,
                creado_por INTEGER REFERENCES usuarios(id),
                nombre_destinatario TEXT,
                expires_at TEXT NOT NULL,
                revocado INTEGER DEFAULT 0,
                max_accesos INTEGER,
                accesos_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_auditor_links_token ON maquinaria_auditor_links(token)")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auditor_link_id INTEGER REFERENCES maquinaria_auditor_links(id),
                ip TEXT,
                user_agent TEXT,
                accion TEXT,
                detalle TEXT,
                created_at TEXT NOT NULL
            )
        """)

        # ── Historial de asignaciones máquina-obra (Fase 1) ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_asignaciones_obra (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
                proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT,
                ubicacion TEXT,
                operario_id INTEGER REFERENCES empleados(id),
                notas TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_asig_obra ON maquinaria_asignaciones_obra(maquina_id)")

        # Añadir responsable_id a maquinas si no existe (FK a empleados)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinas)").fetchall()]
        if "responsable_id" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN responsable_id INTEGER REFERENCES empleados(id)")

        # Añadir marca a maquinas si no existe (ORTECO por defecto)
        if "marca" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN marca TEXT NOT NULL DEFAULT 'ORTECO'")

        # ── Fase 1: columnas nuevas en maquinas ──
        if "estado_operativo" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN estado_operativo TEXT DEFAULT 'operativa'")
        if "tipo_maquina" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN tipo_maquina TEXT DEFAULT 'hincadora'")
        if "ano_fabricacion" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN ano_fabricacion INTEGER")
        if "matricula" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN matricula TEXT")
        if "criticidad" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN criticidad TEXT DEFAULT 'media'")
        if "operario_habitual_id" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN operario_habitual_id INTEGER REFERENCES empleados(id)")
        if "override_estado_manual" not in cols:
            conn.execute("ALTER TABLE maquinas ADD COLUMN override_estado_manual INTEGER DEFAULT 0")

        # Añadir marca a maquinaria_maintenance_tasks si no existe
        task_cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinaria_maintenance_tasks)").fetchall()]
        if "marca" not in task_cols:
            conn.execute("ALTER TABLE maquinaria_maintenance_tasks ADD COLUMN marca TEXT NOT NULL DEFAULT 'ORTECO'")

        # Migrar asignaciones existentes a tabla historial (si proyecto_id no NULL y no hay registro)
        _migrate_asignaciones_obra(conn)

        _seed_maquinas(conn)
        _seed_checklist_templates(conn)
        _seed_maintenance_tasks(conn)
    _initialized = True


# ── Migraciones Fase 1 ─────────────────────────────────────────────────────


def _migrate_incidencias_fase1(conn):
    """Migra la tabla maquinaria_incidencias de 3 estados a 7 estados + campos nuevos.

    Estrategia segura:
    1. Detectar si la tabla tiene el CHECK viejo (solo 3 estados)
    2. Crear tabla nueva con schema completo
    3. Copiar datos (mapeando estados: en_curso→en_diagnostico, cerrada→cerrada_validada)
    4. Drop vieja, rename nueva
    5. Recrear índices
    """
    tbl_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='maquinaria_incidencias'"
    ).fetchone()
    if not tbl_sql or not tbl_sql[0]:
        return  # tabla no existe, se creará fresca

    sql = tbl_sql[0]
    # Si ya tiene los 7 estados, no migrar
    if "en_diagnostico" in sql:
        # Ya migrada, pero verificar que tiene los campos nuevos via ALTER TABLE
        inc_cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinaria_incidencias)").fetchall()]
        _add_missing_incidencia_columns(conn, inc_cols)
        return

    # Necesita migración completa: tabla vieja con 3 estados
    import logging
    logger = logging.getLogger("erp")
    logger.info("Migrando maquinaria_incidencias: 3 estados → 7 estados + campos Fase 1")

    # Obtener columnas actuales para saber qué copiar
    old_cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinaria_incidencias)").fetchall()]

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS _maq_incidencias_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            maquina_id INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
            check_id INTEGER REFERENCES maquinaria_checks(id),
            revision_id INTEGER REFERENCES maquinaria_revisiones(id),
            usuario_id INTEGER REFERENCES usuarios(id),
            fecha TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            severidad TEXT DEFAULT 'media' CHECK(severidad IN ('baja','media','alta','seguridad')),
            estado TEXT DEFAULT 'abierta' CHECK(estado IN (
                'abierta','en_diagnostico','pendiente_pieza','pendiente_taller',
                'en_reparacion','resuelta','cerrada_validada',
                'en_curso','cerrada'
            )),
            resolucion TEXT,
            cerrada_at TEXT,
            created_at TEXT NOT NULL,
            hora_deteccion TEXT,
            horometro_deteccion REAL,
            proyecto_id INTEGER REFERENCES proyectos(id),
            operario_detecta TEXT,
            tipo_incidencia TEXT CHECK(tipo_incidencia IN ('averia','anomalia','correctivo','observacion_preventiva')),
            subsistema TEXT,
            sintoma_inicial TEXT,
            maquina_siguio_operando INTEGER,
            fecha_hora_parada TEXT,
            fecha_hora_vuelta TEXT,
            horas_downtime REAL,
            motivo_downtime TEXT CHECK(motivo_downtime IN ('averia','espera_pieza','espera_taller','diagnostico')),
            diagnostico_provisional TEXT,
            causa_raiz TEXT,
            accion_tomada TEXT,
            pieza_sustituida TEXT,
            repuesto_id INTEGER,
            taller_id INTEGER,
            resuelto_en TEXT CHECK(resuelto_en IN ('campo','taller')),
            espera_pieza INTEGER DEFAULT 0,
            espera_mecanico INTEGER DEFAULT 0,
            coste_repuesto REAL DEFAULT 0,
            coste_servicio REAL DEFAULT 0,
            coste_downtime REAL DEFAULT 0,
            es_repetida INTEGER DEFAULT 0,
            incidencia_anterior_id INTEGER REFERENCES _maq_incidencias_new(id),
            leccion_aprendida TEXT,
            accion_preventiva TEXT,
            es_historico INTEGER DEFAULT 0,
            fuente_dato TEXT CHECK(fuente_dato IN ('factura','whatsapp','memoria','albaran','otro')),
            telegram_id INTEGER,
            operario_nombre TEXT,
            zona TEXT
        );
    """)

    # Copiar datos existentes — solo columnas que existen en la tabla vieja
    base_cols = ["id", "maquina_id", "check_id", "revision_id", "usuario_id",
                 "fecha", "descripcion", "severidad", "estado", "resolucion",
                 "cerrada_at", "created_at"]
    optional_cols = ["telegram_id", "operario_nombre", "zona"]
    copy_cols = [c for c in base_cols if c in old_cols]
    copy_cols += [c for c in optional_cols if c in old_cols]

    cols_str = ", ".join(copy_cols)

    # Mapear zona a subsistema al copiar (zona existente se preserva, subsistema se copia de zona)
    conn.execute(f"""
        INSERT INTO _maq_incidencias_new ({cols_str})
        SELECT {cols_str} FROM maquinaria_incidencias
    """)

    # Copiar zona a subsistema para registros existentes
    if "zona" in old_cols:
        conn.execute("UPDATE _maq_incidencias_new SET subsistema = zona WHERE zona IS NOT NULL")

    # Drop vieja, rename nueva
    conn.execute("DROP TABLE maquinaria_incidencias")
    conn.execute("ALTER TABLE _maq_incidencias_new RENAME TO maquinaria_incidencias")

    # Recrear índices
    conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_maq ON maquinaria_incidencias(maquina_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_estado ON maquinaria_incidencias(estado)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_tipo ON maquinaria_incidencias(tipo_incidencia)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_maq_inc_subsistema ON maquinaria_incidencias(subsistema)")

    logger.info("Migración maquinaria_incidencias completada: %d registros migrados",
                conn.execute("SELECT COUNT(*) FROM maquinaria_incidencias").fetchone()[0])


def _add_missing_incidencia_columns(conn, existing_cols):
    """Añade columnas nuevas de Fase 1 si faltan (para tablas ya migradas parcialmente)."""
    new_cols = {
        "hora_deteccion": "TEXT",
        "horometro_deteccion": "REAL",
        "proyecto_id": "INTEGER REFERENCES proyectos(id)",
        "operario_detecta": "TEXT",
        "tipo_incidencia": "TEXT",
        "subsistema": "TEXT",
        "sintoma_inicial": "TEXT",
        "maquina_siguio_operando": "INTEGER",
        "fecha_hora_parada": "TEXT",
        "fecha_hora_vuelta": "TEXT",
        "horas_downtime": "REAL",
        "motivo_downtime": "TEXT",
        "diagnostico_provisional": "TEXT",
        "causa_raiz": "TEXT",
        "accion_tomada": "TEXT",
        "pieza_sustituida": "TEXT",
        "repuesto_id": "INTEGER",
        "taller_id": "INTEGER",
        "resuelto_en": "TEXT",
        "espera_pieza": "INTEGER DEFAULT 0",
        "espera_mecanico": "INTEGER DEFAULT 0",
        "coste_repuesto": "REAL DEFAULT 0",
        "coste_servicio": "REAL DEFAULT 0",
        "coste_downtime": "REAL DEFAULT 0",
        "es_repetida": "INTEGER DEFAULT 0",
        "incidencia_anterior_id": "INTEGER",
        "leccion_aprendida": "TEXT",
        "accion_preventiva": "TEXT",
        "es_historico": "INTEGER DEFAULT 0",
        "fuente_dato": "TEXT",
        "telegram_id": "INTEGER",
        "operario_nombre": "TEXT",
        "zona": "TEXT",
    }
    for col, tipo in new_cols.items():
        if col not in existing_cols:
            try:
                conn.execute(f"ALTER TABLE maquinaria_incidencias ADD COLUMN {col} {tipo}")
            except Exception:
                pass  # columna ya existe o error de constraint


def _migrate_asignaciones_obra(conn):
    """Migra asignaciones actuales (proyecto_id en maquinas) a tabla historial."""
    count = conn.execute("SELECT COUNT(*) FROM maquinaria_asignaciones_obra").fetchone()[0]
    if count > 0:
        return  # ya hay datos, no migrar
    now = _now()
    maquinas_con_proyecto = conn.execute(
        "SELECT id, proyecto_id, fecha_comision FROM maquinas WHERE proyecto_id IS NOT NULL"
    ).fetchall()
    for m in maquinas_con_proyecto:
        conn.execute(
            "INSERT INTO maquinaria_asignaciones_obra "
            "(maquina_id, proyecto_id, fecha_inicio, created_at) VALUES (?, ?, ?, ?)",
            [m["id"], m["proyecto_id"], m["fecha_comision"] or now[:10], now],
        )


# ── Seed data ────────────────────────────────────────────────────────────────


def _seed_maquinas(conn):
    if conn.execute("SELECT COUNT(*) FROM maquinas").fetchone()[0] > 0:
        return
    now = _now()
    maquinas = [
        ("HD1000-01", "Nicoletta", "ORTECO HD1000", 6086, 6086, "2019-01-01"),
        ("HD1000-02", "Antonella", "ORTECO HD1000", 4791, 4534, "2020-01-01"),
        ("HD1000-03", "Enmanuela", "ORTECO HD1000", 5657, 5389, "2020-01-01"),
        ("HD1000-04", "Lauretta", "ORTECO HD1000", 4483, 4483, "2021-01-01"),
        ("HD1000-05", "Marietta", "ORTECO HD1000", 4450, 4450, "2021-01-01"),
        ("HD1000-06", "Carmela", "ORTECO HD1000", 1671, 1671, "2023-01-01"),
        ("HD1000-07", "Nieves", "ORTECO HD1000", 1065, 423, "2024-01-01"),
        ("MHPW-01", "Olivia", "ORTECO MHPW-1000", 39, 0, "2026-01-01"),
    ]
    for m in maquinas:
        conn.execute(
            "INSERT INTO maquinas (internal_id, nombre, modelo, horometro_actual, horometro_inicial, fecha_comision, estado, activa, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'disponible', 1, ?)",
            [m[0], m[1], m[2], m[3], m[4], m[5], now],
        )


def _seed_checklist_templates(conn):
    """Seed de templates de checklist según manual Orteco HD 800-1000 + checklist Grupo Ortiz."""
    if conn.execute("SELECT COUNT(*) FROM maquinaria_checklist_templates").fetchone()[0] > 0:
        # Migración: añadir ítems Grupo Ortiz si aún no existen
        _migrate_checklist_ortiz(conn)
        return
    items = [
        # ── Semanal (check general del operario — Orteco + Grupo Ortiz) ──
        ("semanal", 1, "Tornillería", "Revisar apriete de tornillería general", 0),
        ("semanal", 2, "Estado general equipo", "Inspección visual: golpes, abolladuras, daños estructurales", 0),
        ("semanal", 3, "Estado de mangueras", "Revisar mangueras hidráulicas y de combustible — fugas, desgaste, roces", 0),
        ("semanal", 4, "Niveles aceite", "Verificar nivel aceite hidráulico y reductores; rellenar si necesario", 0),
        ("semanal", 5, "Nivel combustible", "Verificar nivel de combustible", 0),
        ("semanal", 6, "Nivel refrigerante", "Verificar nivel de refrigerante del motor", 0),
        ("semanal", 7, "Batería", "Comprobar estado y bornes de la batería", 0),
        ("semanal", 8, "Parada de emergencia", "Comprobar funcionamiento de la seta de emergencia", 0),
        ("semanal", 9, "Cables/cadenas sujeción martillo y bulones", "Revisar estado de cables o cadenas de sujeción del martillo y bulones", 0),
        ("semanal", 10, "Orugas y rodillos", "Verificar tensión de orugas y estado de los rodillos", 0),
        ("semanal", 11, "Engrase de guías carro", "Engrasar guías del carro según esquema de lubricación", 0),
        ("semanal", 12, "Faros de trabajo", "Comprobar funcionamiento de faros de trabajo", 0),
        ("semanal", 13, "Zumbador acústico", "Comprobar funcionamiento del zumbador acústico / claxon", 0),
        ("semanal", 14, "Luz rotativa", "Comprobar funcionamiento de la luz rotativa de señalización", 0),
        ("semanal", 15, "Filtro aire", "Limpiar o sustituir filtro de aire", 0),
        ("semanal", 16, "Extintor", "Verificar fecha de caducidad y carga correcta del extintor", 0),
        ("semanal", 17, "Botiquín", "Comprobar que el botiquín está completo y en buen estado", 0),
        ("semanal", 18, "Kit antiderrame", "Comprobar disponibilidad y estado del kit antiderrame", 0),
        ("semanal", 19, "Fugas visibles aceite o combustible", "Inspección visual de fugas de aceite o combustible en la máquina", 0),
        ("semanal", 20, "Limpieza general", "Limpieza general de la máquina", 0),
        # ── 100h — Mantenedor ──
        ("100h", 1, "Reductores orugas — Control nivel aceite", "Control nivel del aceite de los reductores de orugas", 0),
        ("100h", 2, "Reductores orugas — Sustitución aceite (1ª vez)", "Sustitución aceite (solo la primera vez a 100h)", 0),
        ("100h", 3, "Cadena elevación martillo — Limpieza y lubricación", "Limpieza y lubricación (frecuencia mayor si uso intensivo)", 0),
        ("100h", 4, "Cadena elevación martillo — Control", "Control visual del estado de la cadena", 0),
        ("100h", 5, "Patín — Lubricación", "Lubricación del patín (ref. esquema de lubricación)", 0),
        ("100h", 6, "Interior columna — Lubricación", "Lubricación interior columna (ref. esquema de lubricación)", 0),
        ("100h", 7, "Barrena — Sustitución aceite (1ª vez)", "Sustitución aceite barrena (solo la primera vez a 100h)", 0),
        ("100h", 8, "Sacamuestras — Engrasar", "Engrasar sacamuestras (ref. mantenimiento del sacamuestras)", 0),
        ("100h", 9, "Perforador (RP500) — Control nivel aceite reductor", "Control nivel aceite del reductor del perforador", 0),
        ("100h", 10, "Perforador (RP500) — Regulación de resortes", "Regulación de resortes del perforador", 0),
        # ── 250h — Mantenedor ──
        ("250h", 1, "Orugas — Control tensión", "Control de la tensión de las orugas", 0),
        # ── 250h — Técnico especializado ──
        ("250h", 2, "Membrana acumulador martillo percusión — Control estado", "Control estado en taller autorizado — REQUIERE TALLER", 1),
        ("250h", 3, "Tirantes y pernos — Control estado y apriete", "Control de estado y apriete de tirantes y pernos", 0),
        # ── 500h — Mantenedor ──
        ("500h", 1, "Depósito aceite hidráulico — Control nivel del aceite", "Control nivel del aceite hidráulico", 0),
        ("500h", 2, "Pinza de extracción postes — Limpieza", "Limpieza de la pinza de extracción de postes", 0),
        ("500h", 3, "Pinza de extracción postes — Engrasar", "Engrasar la pinza de extracción de postes", 0),
        ("500h", 4, "Levantador de guardarraíles — Engrasar", "Engrasar el levantador de guardarraíles", 0),
        # ── 1000h — Mantenedor ──
        ("1000h", 1, "Reductor orugas — Sustitución aceite", "Sustitución aceite de los reductores de orugas", 0),
        ("1000h", 2, "Filtro aceite hidráulico en envío — Control atascamiento", "Control atascamiento del cartucho filtrante (alta presión)", 0),
        ("1000h", 3, "Filtro aceite hidráulico en descarga — Sustitución cartucho", "Sustitución cartucho filtrante filtro en descarga (baja presión)", 0),
        ("1000h", 4, "Filtro aceite hidráulico en envío — Sustitución cartucho", "Sustitución cartucho filtrante filtro en envío (alta presión)", 0),
        ("1000h", 5, "Barrena — Sustitución aceite del reductor", "Sustitución aceite del reductor de la barrena", 0),
        ("1000h", 6, "Perforador — Sustitución aceite del reductor", "Sustitución aceite del reductor del perforador", 0),
        # ── 1000h — Técnico especializado ──
        ("1000h", 7, "Cadena elevación martillo — Sustitución", "Sustitución de la cadena de elevación — REQUIERE TALLER", 1),
        # ── 2000h — Técnico especializado ──
        ("2000h", 1, "Depósito aceite hidráulico — Sustitución aceite", "Sustitución aceite depósito hidráulico — REQUIERE TALLER AUTORIZADO", 1),
    ]
    for item in items:
        conn.execute(
            "INSERT INTO maquinaria_checklist_templates (tipo, orden, nombre, descripcion, requiere_taller) "
            "VALUES (?, ?, ?, ?, ?)",
            item,
        )


def _migrate_checklist_ortiz(conn):
    """Migra los 6 ítems semanales originales (Orteco) al checklist ampliado (Orteco + Grupo Ortiz).

    - Actualiza los existentes (nombre, descripción, orden) para alinear con el nuevo listado
    - Añade los ítems nuevos que no existían
    - No borra nada para no romper checks ya completados
    """
    existing = conn.execute(
        "SELECT id, nombre FROM maquinaria_checklist_templates WHERE tipo = 'semanal'"
    ).fetchall()
    existing_names = {r[1] for r in existing}

    new_items = [
        (2, "Estado general equipo", "Inspección visual: golpes, abolladuras, daños estructurales"),
        (3, "Estado de mangueras", "Revisar mangueras hidráulicas y de combustible — fugas, desgaste, roces"),
        (5, "Nivel combustible", "Verificar nivel de combustible"),
        (6, "Nivel refrigerante", "Verificar nivel de refrigerante del motor"),
        (7, "Batería", "Comprobar estado y bornes de la batería"),
        (8, "Parada de emergencia", "Comprobar funcionamiento de la seta de emergencia"),
        (9, "Cables/cadenas sujeción martillo y bulones", "Revisar estado de cables o cadenas de sujeción del martillo y bulones"),
        (11, "Engrase de guías carro", "Engrasar guías del carro según esquema de lubricación"),
        (12, "Faros de trabajo", "Comprobar funcionamiento de faros de trabajo"),
        (13, "Zumbador acústico", "Comprobar funcionamiento del zumbador acústico / claxon"),
        (14, "Luz rotativa", "Comprobar funcionamiento de la luz rotativa de señalización"),
        (16, "Extintor", "Verificar fecha de caducidad y carga correcta del extintor"),
        (17, "Botiquín", "Comprobar que el botiquín está completo y en buen estado"),
        (18, "Kit antiderrame", "Comprobar disponibilidad y estado del kit antiderrame"),
        (19, "Fugas visibles aceite o combustible", "Inspección visual de fugas de aceite o combustible en la máquina"),
    ]

    for orden, nombre, desc in new_items:
        if nombre not in existing_names:
            conn.execute(
                "INSERT INTO maquinaria_checklist_templates (tipo, orden, nombre, descripcion, requiere_taller) "
                "VALUES ('semanal', ?, ?, ?, 0)",
                (orden, nombre, desc),
            )

    # Actualizar orden y descripciones de los existentes para alinear
    renames = {
        "Nivel aceite hidráulico": (4, "Niveles aceite", "Verificar nivel aceite hidráulico y reductores; rellenar si necesario"),
        "Nivel aceite reductores": None,  # fusionado con "Niveles aceite" — desactivar
        "Tornillería": (1, "Tornillería", "Revisar apriete de tornillería general"),
        "Filtro aire": (15, "Filtro aire", "Limpiar o sustituir filtro de aire"),
        "Tensión orugas": (10, "Orugas y rodillos", "Verificar tensión de orugas y estado de los rodillos"),
        "Limpieza general": (20, "Limpieza general", "Limpieza general de la máquina"),
    }
    for old_name, val in renames.items():
        if old_name in existing_names:
            if val is None:
                conn.execute(
                    "UPDATE maquinaria_checklist_templates SET activo = 0 WHERE tipo = 'semanal' AND nombre = ?",
                    (old_name,),
                )
            else:
                orden, new_name, desc = val
                conn.execute(
                    "UPDATE maquinaria_checklist_templates SET orden = ?, nombre = ?, descripcion = ? "
                    "WHERE tipo = 'semanal' AND nombre = ?",
                    (orden, new_name, desc, old_name),
                )


def _seed_maintenance_tasks(conn):
    """Seed de tareas de mantenimiento programado según manual Orteco HD 800-1000 (págs. 76-77).

    Estructura exacta del manual:
      - Mantenedor cada 100h: reductores orugas, cadena elevación, patín, columna, barrena, sacamuestras, perforador
      - Mantenedor cada 250h: orugas tensión
      - Mantenedor cada 500h: depósito hidráulico, pinza extracción, levantador guardarraíles
      - Mantenedor cada 1000h: reductor orugas aceite, filtros hidráulicos (envío+descarga), barrena aceite, perforador aceite
      - Técnico cada 250h: membrana acumulador, tirantes y pernos
      - Técnico cada 1000h: cadena elevación sustitución
      - Técnico cada 2000h: depósito hidráulico sustitución aceite
    Notas del manual:
      (1) La sustitución del aceite con frecuencia 100h se refiere sólo a la primera sustitución.
      (2) Cadena elevación 100h: efectuar con frecuencia mayor en caso de uso intensivo.
    """
    if conn.execute("SELECT COUNT(*) FROM maquinaria_maintenance_tasks").fetchone()[0] > 0:
        return
    tasks = [
        # (code, nombre, descripcion, intervalo_horas, rol, requires_workshop, checklist_json)

        # ═══════════════════════════════════════════════════════════════════════════
        # MANTENEDOR — cada 100 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("REDUCTORES_ORUGAS_100H",
         "Reductores orugas — Control nivel aceite + Sustitución aceite (1ª vez)",
         "Control nivel del aceite de los reductores de orugas. La sustitución del aceite a 100h se refiere sólo a la primera sustitución. Ref: 'Control nivel del aceite reductores orugas' / 'Sustitución del aceite reductores orugas'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Control nivel aceite reductor oruga izquierda", "tipo": "check"},
             {"item": "Control nivel aceite reductor oruga derecha", "tipo": "check"},
             {"item": "Rellenar si nivel bajo (ref. manual)", "tipo": "check"},
             {"item": "Sustitución aceite reductor izquierdo (solo 1ª vez)", "tipo": "check"},
             {"item": "Sustitución aceite reductor derecho (solo 1ª vez)", "tipo": "check"},
             {"item": "Verificar ausencia de fugas tras sustitución", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("CADENA_ELEVACION_100H",
         "Cadena elevación martillo — Limpieza, lubricación y control",
         "Limpieza y lubricación de la cadena de elevación del martillo de percusión. Efectuar el control con frecuencia mayor en caso de uso intensivo. Ref: 'Limpieza y lubricación cadena de elevación martillo' / 'Sustitución de la cadena'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Limpieza de la cadena de elevación", "tipo": "check"},
             {"item": "Lubricación de la cadena de elevación", "tipo": "check"},
             {"item": "Control visual del estado de la cadena", "tipo": "check"},
             {"item": "Control de eslabones — desgaste o deformación", "tipo": "check"},
             {"item": "Control de anclajes de la cadena", "tipo": "check"},
             {"item": "¿Uso intensivo? Programar control adicional antes de 100h", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("PATIN_LUBRICACION_100H",
         "Patín — Lubricación",
         "Lubricación del patín según esquema de lubricación del manual. Ref: 'Esquema de lubricación'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Lubricar patín según esquema de lubricación", "tipo": "check"},
             {"item": "Verificar estado visual del patín", "tipo": "check"},
             {"item": "Verificar desgaste superficial", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("INTERIOR_COLUMNA_100H",
         "Interior columna — Lubricación",
         "Lubricación del interior de la columna según esquema de lubricación del manual. Ref: 'Esquema de lubricación'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Lubricar interior de la columna según esquema", "tipo": "check"},
             {"item": "Verificar estado visual interior columna", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("BARRENA_ACEITE_100H",
         "Barrena — Sustitución aceite (1ª vez)",
         "Sustitución del aceite de la barrena. A 100h se refiere sólo a la primera sustitución. Ref: 'Mantenimiento barrena'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Drenar aceite de la barrena", "tipo": "check"},
             {"item": "Rellenar con aceite nuevo (ref. manual 'Mantenimiento barrena')", "tipo": "check"},
             {"item": "Verificar nivel correcto", "tipo": "check"},
             {"item": "Verificar ausencia de fugas", "tipo": "check"},
             {"item": "Nota: esta sustitución a 100h es solo la 1ª vez", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("SACAMUESTRAS_ENGRASAR_100H",
         "Sacamuestras — Engrasar",
         "Engrasar el sacamuestras. Ref: 'Mantenimiento del sacamuestras'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Engrasar sacamuestras según manual", "tipo": "check"},
             {"item": "Verificar funcionamiento del sacamuestras", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("PERFORADOR_RP500_100H",
         "Perforador (RP500) — Control nivel aceite reductor + Regulación resortes",
         "Control del nivel de aceite del reductor del perforador y regulación de resortes. Ref: 'Mantenimiento del perforador'.",
         100, "mantenedor", 0,
         json.dumps([
             {"item": "Control nivel aceite del reductor del perforador", "tipo": "check"},
             {"item": "Rellenar aceite reductor si nivel bajo", "tipo": "check"},
             {"item": "Regulación de resortes del perforador", "tipo": "check"},
             {"item": "Verificar funcionamiento del perforador", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # MANTENEDOR — cada 250 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("ORUGAS_TENSION_250H",
         "Orugas — Control tensión",
         "Controlar la tensión de las orugas y ajustar si es necesario. Ref: 'Control tensión de las orugas'.",
         250, "mantenedor", 0,
         json.dumps([
             {"item": "Verificar tensión oruga izquierda", "tipo": "check"},
             {"item": "Verificar tensión oruga derecha", "tipo": "check"},
             {"item": "Ajustar tensión si necesario", "tipo": "check"},
             {"item": "Estado visual de las zapatas", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # MANTENEDOR — cada 500 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("HIDRAULICO_NIVEL_500H",
         "Depósito aceite hidráulico — Control nivel del aceite",
         "Controlar el nivel del aceite del depósito hidráulico y rellenar si es necesario. Ref: 'Control nivel del aceite hidráulico'.",
         500, "mantenedor", 0,
         json.dumps([
             {"item": "Comprobar nivel aceite hidráulico con varilla/visor", "tipo": "check"},
             {"item": "Verificar color y estado del aceite", "tipo": "check"},
             {"item": "Rellenar si nivel bajo (ref. manual 'Control nivel del aceite hidráulico')", "tipo": "check"},
             {"item": "Inspeccionar depósito: fugas o daños visibles", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("PINZA_EXTRACCION_500H",
         "Pinza de extracción postes — Limpieza + Engrasar",
         "Limpieza y engrase de la pinza de extracción de postes según manual.",
         500, "mantenedor", 0,
         json.dumps([
             {"item": "Limpieza general de la pinza de extracción", "tipo": "check"},
             {"item": "Engrasar puntos de articulación de la pinza", "tipo": "check"},
             {"item": "Verificar desgaste de las mordazas", "tipo": "check"},
             {"item": "Comprobar funcionamiento apertura/cierre", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("LEVANTADOR_GUARDARRAILES_500H",
         "Levantador de guardarraíles — Engrasar",
         "Engrasar el mecanismo del levantador de guardarraíles según manual.",
         500, "mantenedor", 0,
         json.dumps([
             {"item": "Engrasar articulaciones del levantador de guardarraíles", "tipo": "check"},
             {"item": "Verificar estado de pasadores y articulaciones", "tipo": "check"},
             {"item": "Comprobar funcionamiento del levantador", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # MANTENEDOR — cada 1000 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("REDUCTOR_ORUGAS_ACEITE_1000H",
         "Reductor orugas — Sustitución aceite",
         "Sustituir el aceite del reductor de orugas. Ref: 'Sustitución del aceite reductores orugas'.",
         1000, "mantenedor", 0,
         json.dumps([
             {"item": "Drenar aceite reductor oruga izquierda", "tipo": "check"},
             {"item": "Drenar aceite reductor oruga derecha", "tipo": "check"},
             {"item": "Rellenar con aceite nuevo (ref. manual 'Sustitución del aceite reductores orugas')", "tipo": "check"},
             {"item": "Verificar nivel correcto en ambos reductores", "tipo": "check"},
             {"item": "Comprobar ausencia de fugas", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("FILTRO_HIDRAULICO_ENVIO_1000H",
         "Filtro aceite hidráulico en envío — Control atascamiento + Sustitución cartucho",
         "Control de atascamiento del cartucho filtrante del filtro en envío (alta presión) y sustitución del cartucho. Ref: 'Sustitución cartucho filtrante filtro en envío (alta presión)'.",
         1000, "mantenedor", 0,
         json.dumps([
             {"item": "Control atascamiento del cartucho filtrante en envío", "tipo": "check"},
             {"item": "Sustitución del cartucho filtrante en envío (alta presión)", "tipo": "check"},
             {"item": "Verificar juntas y sellos del filtro en envío", "tipo": "check"},
             {"item": "Comprobar presión del sistema tras sustitución", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("FILTRO_HIDRAULICO_DESCARGA_1000H",
         "Filtro aceite hidráulico en descarga — Sustitución cartucho filtrante",
         "Sustitución del cartucho filtrante del filtro en descarga (baja presión). Ref: 'Sustitución cartucho filtrante filtro en descarga (baja presión)'.",
         1000, "mantenedor", 0,
         json.dumps([
             {"item": "Sustitución del cartucho filtrante en descarga (baja presión)", "tipo": "check"},
             {"item": "Verificar juntas y sellos del filtro en descarga", "tipo": "check"},
             {"item": "Comprobar presión del sistema tras sustitución", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("BARRENA_ACEITE_REDUCTOR_1000H",
         "Barrena — Sustitución aceite del reductor",
         "Sustituir el aceite del reductor de la barrena. Ref: 'Mantenimiento barrena'.",
         1000, "mantenedor", 0,
         json.dumps([
             {"item": "Drenar aceite del reductor de la barrena", "tipo": "check"},
             {"item": "Rellenar con aceite nuevo (ref. manual 'Mantenimiento barrena')", "tipo": "check"},
             {"item": "Verificar nivel correcto", "tipo": "check"},
             {"item": "Verificar ausencia de fugas", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        ("PERFORADOR_ACEITE_REDUCTOR_1000H",
         "Perforador — Sustitución aceite del reductor",
         "Sustituir el aceite del reductor del perforador. Ref: 'Mantenimiento del perforador'.",
         1000, "mantenedor", 0,
         json.dumps([
             {"item": "Drenar aceite del reductor del perforador", "tipo": "check"},
             {"item": "Rellenar con aceite nuevo (ref. manual 'Mantenimiento del perforador')", "tipo": "check"},
             {"item": "Verificar nivel correcto", "tipo": "check"},
             {"item": "Verificar ausencia de fugas", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # TÉCNICO ESPECIALIZADO — cada 250 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("MEMBRANA_ACUMULADOR_250H",
         "Membrana acumulador martillo de percusión — Control estado",
         "Controlar el estado de la membrana del acumulador del martillo de percusión. Efectuar el control en un taller autorizado. Ref: manual pág. 77.",
         250, "tecnico_especializado", 1,
         json.dumps([
             {"item": "Inspección visual de la membrana del acumulador", "tipo": "check"},
             {"item": "Test de presión del acumulador", "tipo": "check"},
             {"item": "Sustituir membrana si deteriorada", "tipo": "check"},
             {"item": "Registrar presión final", "tipo": "texto"},
             {"item": "Realizado en taller autorizado: nombre del taller", "tipo": "texto"},
         ])),

        ("TIRANTES_PERNOS_250H",
         "Tirantes y pernos — Control de estado y apriete",
         "Controlar el estado y apriete de tirantes y pernos. Ref: manual pág. 77.",
         250, "tecnico_especializado", 0,
         json.dumps([
             {"item": "Control estado tirantes superiores", "tipo": "check"},
             {"item": "Control estado tirantes inferiores", "tipo": "check"},
             {"item": "Verificar apriete de pernos de fijación", "tipo": "check"},
             {"item": "Reapretar si necesario (par según manual)", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # TÉCNICO ESPECIALIZADO — cada 1000 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("CADENA_ELEVACION_1000H",
         "Cadena de elevación martillo de percusión — Sustitución",
         "Sustituir la cadena de elevación del martillo de percusión. Ref: 'Sustitución de la cadena'.",
         1000, "tecnico_especializado", 1,
         json.dumps([
             {"item": "Retirar cadena usada", "tipo": "check"},
             {"item": "Instalar cadena nueva (ref. manual 'Sustitución de la cadena')", "tipo": "check"},
             {"item": "Ajustar tensión de la cadena nueva", "tipo": "check"},
             {"item": "Test de funcionamiento del martillo de percusión", "tipo": "check"},
             {"item": "Observaciones", "tipo": "texto"},
         ])),

        # ═══════════════════════════════════════════════════════════════════════════
        # TÉCNICO ESPECIALIZADO — cada 2000 horas
        # ═══════════════════════════════════════════════════════════════════════════
        ("DEPOSITO_HIDRAULICO_2000H",
         "Depósito aceite hidráulico — Sustitución aceite",
         "Sustituir completamente el aceite del depósito hidráulico. Dirigirse a un taller autorizado. Ref: manual pág. 77.",
         2000, "tecnico_especializado", 1,
         json.dumps([
             {"item": "Drenar depósito completo", "tipo": "check"},
             {"item": "Limpiar interior del depósito", "tipo": "check"},
             {"item": "Rellenar con aceite nuevo (ref. manual)", "tipo": "check"},
             {"item": "Purgar circuito hidráulico", "tipo": "check"},
             {"item": "Verificar nivel y ausencia de fugas", "tipo": "check"},
             {"item": "Test de presión del sistema", "tipo": "check"},
             {"item": "Realizado en taller autorizado: nombre del taller", "tipo": "texto"},
         ])),
    ]
    for t in tasks:
        conn.execute(
            "INSERT INTO maquinaria_maintenance_tasks "
            "(code, nombre, descripcion, intervalo_horas, rol, requires_workshop, checklist_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)", t,
        )


# ── CRUD Maquinas ────────────────────────────────────────────────────────────


def listar_maquinas(solo_activas: bool = True) -> list:
    init_maquinaria_db()
    with _conectar() as conn:
        q = ("SELECT m.*, p.nombre AS proyecto_nombre, "
             "(e.nombre || ' ' || COALESCE(e.apellidos, '')) AS operario_nombre "
             "FROM maquinas m "
             "LEFT JOIN proyectos p ON p.id = m.proyecto_id "
             "LEFT JOIN empleados e ON e.id = m.responsable_id")
        if solo_activas:
            q += " WHERE m.activa = 1"
        q += " ORDER BY m.nombre"
        maquinas = [dict(r) for r in conn.execute(q).fetchall()]

        # Enriquecer con estado calculado en tiempo real desde Operaciones
        from datetime import date
        hoy = date.today().isoformat()

        # Pre-cargar asignaciones de hoy para todas las máquinas (una sola query)
        # Incluir asignaciones de hoy Y averías activas (cualquier fecha futura)
        asig_hoy = {}
        averias = {}
        try:
            for r in conn.execute(
                "SELECT pa.recurso_id, pa.proyecto_id, pa.estado as asig_estado, pa.notas, "
                "COALESCE(p.nombre, 'Proyecto #' || pa.proyecto_id) as proy_nombre, "
                "COALESCE(p.codigo, '') as proy_codigo "
                "FROM proyecto_asignaciones pa "
                "LEFT JOIN proyectos p ON p.id = pa.proyecto_id "
                "WHERE pa.recurso_tipo = 'maquina' AND pa.fecha = ?", (hoy,)
            ).fetchall():
                d = dict(r)
                if d.get("asig_estado") == "averia":
                    averias[r["recurso_id"]] = d
                else:
                    asig_hoy[r["recurso_id"]] = d
        except Exception as e:
            import logging
            logging.getLogger("erp").warning("Error cargando asignaciones maquinas: %s", e)

        # Pre-cargar última lectura de horómetro para cada máquina (una sola query)
        ultima_lecturas = {}
        for r in conn.execute(
            "SELECT maquina_id, fecha, created_at FROM maquinaria_checks "
            "WHERE horometro IS NOT NULL AND horometro > 0 "
            "ORDER BY created_at DESC"
        ).fetchall():
            mid = r["maquina_id"]
            if mid not in ultima_lecturas:
                ultima_lecturas[mid] = r["fecha"]

        for maq in maquinas:
            mid = maq["id"]
            maq["horometro_ultima_lectura"] = ultima_lecturas.get(mid)

            inc_graves = conn.execute(
                "SELECT COUNT(*) FROM maquinaria_incidencias "
                "WHERE maquina_id = ? AND estado NOT IN ('cerrada','cerrada_validada','resuelta') "
                "AND severidad IN ('alta','seguridad')",
                [mid],
            ).fetchone()[0]
            maq["_tiene_incidencia_grave"] = inc_graves > 0

            # Estado calculado desde operaciones
            asig = asig_hoy.get(mid)
            averia = averias.get(mid)
            if not maq.get("activa", 1):
                maq["estado_computado"] = "baja"
                maq["proyecto_actual"] = None
            elif averia:
                maq["estado_computado"] = "en_taller"
                maq["proyecto_actual"] = None
                maq["averia_notas"] = averia.get("notas", "")
            elif inc_graves > 0:
                maq["estado_computado"] = "en_taller"
                maq["proyecto_actual"] = None
            elif asig:
                maq["estado_computado"] = "en_proyecto"
                maq["proyecto_actual"] = {
                    "id": asig["proyecto_id"],
                    "nombre": asig.get("proy_nombre", ""),
                    "codigo": asig.get("proy_codigo", ""),
                }
            else:
                maq["estado_computado"] = "disponible"
                maq["proyecto_actual"] = None
        return maquinas


def obtener_maquina(maq_id: int) -> dict | None:
    init_maquinaria_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT m.*, p.nombre AS proyecto_nombre, "
            "(e.nombre || ' ' || COALESCE(e.apellidos, '')) AS responsable_nombre, "
            "e.telefono AS responsable_telefono "
            "FROM maquinas m "
            "LEFT JOIN proyectos p ON p.id = m.proyecto_id "
            "LEFT JOIN empleados e ON e.id = m.responsable_id "
            "WHERE m.id = ?",
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

        # Fecha de la última lectura de horómetro (del check más reciente con horómetro)
        ultima = conn.execute(
            "SELECT fecha, horometro, created_at FROM maquinaria_checks "
            "WHERE maquina_id = ? AND horometro IS NOT NULL AND horometro > 0 "
            "ORDER BY created_at DESC LIMIT 1",
            [maq_id],
        ).fetchone()
        maq["horometro_ultima_lectura"] = ultima["fecha"] if ultima else None
        maq["horometro_ultima_lectura_at"] = ultima["created_at"] if ultima else None

        # Revisiones legacy (maquinaria_revisiones)
        revs_legacy = [dict(r) for r in conn.execute(
            "SELECT mr.*, u.nombre AS usuario_nombre FROM maquinaria_revisiones mr "
            "LEFT JOIN usuarios u ON u.id = mr.usuario_id "
            "WHERE mr.maquina_id = ? ORDER BY mr.fecha DESC LIMIT 10",
            [maq_id],
        ).fetchall()]

        # Histórico de revisiones (maintenance_logs) — agrupado por revisión real
        revs_logs_raw = conn.execute(
            "SELECT horometro_at, due_hours, completed_at, observaciones, "
            "       task_code, operario_nombre "
            "FROM maquinaria_maintenance_logs "
            "WHERE maquina_id = ? ORDER BY horometro_at DESC, task_code",
            [maq_id],
        ).fetchall()

        # Agrupar logs por (horometro_at, completed_at) para mostrar como una "revisión"
        _revs_agrupadas = {}
        for r in revs_logs_raw:
            key = (r["horometro_at"], (r["completed_at"] or "")[:10])
            if key not in _revs_agrupadas:
                _revs_agrupadas[key] = {
                    "tipo": "maint_log",
                    "horometro_al_revision": r["horometro_at"],
                    "fecha": (r["completed_at"] or "")[:10],
                    "estado": "cerrado",
                    "operario_nombre": r["operario_nombre"],
                    "n_tareas": 0,
                    "observaciones": r["observaciones"],
                }
            _revs_agrupadas[key]["n_tareas"] += 1

        revs_from_logs = sorted(
            _revs_agrupadas.values(),
            key=lambda x: x["horometro_al_revision"],
            reverse=True,
        )

        # Combinar: legacy primero (si hay), luego logs
        maq["revisiones"] = revs_legacy if revs_legacy else []
        maq["revisiones_historico"] = revs_from_logs

        maq["incidencias"] = [dict(r) for r in conn.execute(
            "SELECT mi.*, u.nombre AS usuario_nombre FROM maquinaria_incidencias mi "
            "LEFT JOIN usuarios u ON u.id = mi.usuario_id "
            "WHERE mi.maquina_id = ? AND mi.estado NOT IN ('cerrada','cerrada_validada') "
            "ORDER BY mi.severidad DESC, mi.fecha DESC",
            [maq_id],
        ).fetchall()]
        # Adjuntar fotos y actualizaciones a cada incidencia abierta
        for inc in maq["incidencias"]:
            inc["fotos"] = [dict(f) for f in conn.execute(
                "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'incidencia' AND entidad_id = ?",
                [inc["id"]],
            ).fetchall()]
            inc["updates"] = [dict(u) for u in conn.execute(
                "SELECT * FROM maquinaria_incidencia_updates WHERE incidencia_id = ? ORDER BY created_at ASC",
                [inc["id"]],
            ).fetchall()]
            for u in inc["updates"]:
                u["fotos"] = [dict(f) for f in conn.execute(
                    "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'inc_update' AND entidad_id = ?",
                    [u["id"]],
                ).fetchall()]

        maq["incidencias_historial"] = [dict(r) for r in conn.execute(
            "SELECT mi.*, u.nombre AS usuario_nombre FROM maquinaria_incidencias mi "
            "LEFT JOIN usuarios u ON u.id = mi.usuario_id "
            "WHERE mi.maquina_id = ? AND mi.estado IN ('cerrada','cerrada_validada','resuelta') "
            "ORDER BY mi.cerrada_at DESC, mi.fecha DESC LIMIT 50",
            [maq_id],
        ).fetchall()]
        # Adjuntar fotos y actualizaciones a cada incidencia del historial
        for inc in maq["incidencias_historial"]:
            inc["fotos"] = [dict(f) for f in conn.execute(
                "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'incidencia' AND entidad_id = ?",
                [inc["id"]],
            ).fetchall()]
            inc["updates"] = [dict(u) for u in conn.execute(
                "SELECT * FROM maquinaria_incidencia_updates WHERE incidencia_id = ? ORDER BY created_at ASC",
                [inc["id"]],
            ).fetchall()]
            for u in inc["updates"]:
                u["fotos"] = [dict(f) for f in conn.execute(
                    "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'inc_update' AND entidad_id = ?",
                    [u["id"]],
                ).fetchall()]

        maq["revisiones_pendientes"] = _calcular_revisiones_pendientes(
            conn, maq_id, maq["horometro_actual"],
        )

        # Fase 1: Historial de asignaciones a obra
        maq["asignaciones_obra"] = [dict(r) for r in conn.execute(
            "SELECT a.*, p.nombre AS proyecto_nombre, p.codigo AS proyecto_codigo, "
            "(e.nombre || ' ' || COALESCE(e.apellidos, '')) AS operario_nombre_asig "
            "FROM maquinaria_asignaciones_obra a "
            "LEFT JOIN proyectos p ON p.id = a.proyecto_id "
            "LEFT JOIN empleados e ON e.id = a.operario_id "
            "WHERE a.maquina_id = ? ORDER BY a.fecha_inicio DESC LIMIT 20",
            [maq_id],
        ).fetchall()]

        # Fase 1: Asignación actual (sin fecha_fin)
        asig_actual = conn.execute(
            "SELECT a.*, p.nombre AS proyecto_nombre "
            "FROM maquinaria_asignaciones_obra a "
            "LEFT JOIN proyectos p ON p.id = a.proyecto_id "
            "WHERE a.maquina_id = ? AND a.fecha_fin IS NULL "
            "ORDER BY a.fecha_inicio DESC LIMIT 1",
            [maq_id],
        ).fetchone()
        maq["asignacion_actual"] = dict(asig_actual) if asig_actual else None

        # Fase 1: Operario habitual (FK a empleados)
        if maq.get("operario_habitual_id"):
            op_hab = conn.execute(
                "SELECT id, nombre, apellidos, telefono FROM empleados WHERE id = ?",
                [maq["operario_habitual_id"]],
            ).fetchone()
            maq["operario_habitual"] = dict(op_hab) if op_hab else None
        else:
            maq["operario_habitual"] = None

        # Estado calculado en tiempo real desde Operaciones
        from datetime import date
        hoy = date.today().isoformat()
        asig = None
        try:
            for r in conn.execute(
                "SELECT pa.proyecto_id, pa.estado as asig_estado, pa.notas, "
                "COALESCE(p.nombre, 'Proyecto #' || pa.proyecto_id) as proy_nombre, "
                "COALESCE(p.codigo, '') as proy_codigo "
                "FROM proyecto_asignaciones pa "
                "LEFT JOIN proyectos p ON p.id = pa.proyecto_id "
                "WHERE pa.recurso_tipo = 'maquina' AND pa.recurso_id = ? AND pa.fecha = ?",
                (maq_id, hoy),
            ).fetchall():
                d = dict(r)
                if d.get("asig_estado") == "averia":
                    asig = d  # avería tiene prioridad
                    break
                asig = d
        except Exception as e:
            import logging
            logging.getLogger("erp").warning("Error cargando asignacion maquina %s: %s", maq_id, e)

        if not maq.get("activa", 1):
            maq["estado_computado"] = "baja"
            maq["proyecto_actual"] = None
        elif asig and asig.get("asig_estado") == "averia":
            maq["estado_computado"] = "en_taller"
            maq["proyecto_actual"] = None
            maq["averia_notas"] = asig.get("notas", "")
        elif maq.get("incidencias"):
            maq["estado_computado"] = "en_taller"
            maq["proyecto_actual"] = None
        elif asig:
            maq["estado_computado"] = "en_proyecto"
            maq["proyecto_actual"] = {
                "id": asig["proyecto_id"],
                "nombre": asig.get("proy_nombre", ""),
                "codigo": asig.get("proy_codigo", ""),
            }
        else:
            maq["estado_computado"] = _computar_estado(maq)
            maq["proyecto_actual"] = None
        return maq


def _computar_estado(maq: dict) -> str:
    """Computa el estado real de la máquina basándose en sus datos.

    Prioridad:
      1. Si activa=0 → 'baja' (decomisionada manualmente)
      2. Si estado manual == 'baja' → 'baja'
      3. Si tiene incidencias abiertas alta/seguridad → 'en_taller'
      4. Si tiene proyecto_id asignado → 'en_proyecto'
      5. Default → 'disponible'
    """
    if not maq.get("activa", 1):
        return "baja"
    if maq.get("estado") == "baja":
        return "baja"

    # Incidencias abiertas graves → en taller (prioridad sobre estado manual)
    incidencias = maq.get("incidencias", [])
    for inc in incidencias:
        if inc.get("severidad") in ("alta", "seguridad") and inc.get("estado") != "cerrada":
            return "en_taller"

    # Estado manual en_taller (sin incidencia grave abierta, ej: revisión preventiva)
    if maq.get("estado") == "en_taller":
        return "en_taller"

    # En proyecto: por FK o por estado manual
    if maq.get("proyecto_id") or maq.get("estado") == "en_proyecto":
        return "en_proyecto"

    return "disponible"


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
    """Actualiza una máquina. Si cambia proyecto_id, gestiona asignaciones automáticamente (RN-07)."""
    init_maquinaria_db()
    with _conectar() as conn:
        # Leer proyecto_id actual para detectar cambio
        old = conn.execute("SELECT proyecto_id FROM maquinas WHERE id = ?", [maq_id]).fetchone()
        old_proyecto_id = old["proyecto_id"] if old else None

        campos = []
        valores = []
        for k in ("nombre", "modelo", "numero_serie", "horometro_actual", "estado",
                   "proyecto_id", "ubicacion", "notas", "activa",
                   # Fase 1
                   "estado_operativo", "tipo_maquina", "ano_fabricacion",
                   "matricula", "criticidad", "operario_habitual_id",
                   "override_estado_manual"):
            if k in data:
                campos.append(f"{k} = ?")
                valores.append(data[k])
        if campos:
            campos.append("updated_at = ?")
            valores.append(_now())
            valores.append(maq_id)
            conn.execute(f"UPDATE maquinas SET {', '.join(campos)} WHERE id = ?", valores)

        # RN-07: Si cambió proyecto_id, cerrar asignación anterior y crear nueva
        new_proyecto_id = data.get("proyecto_id")
        if "proyecto_id" in data and new_proyecto_id != old_proyecto_id:
            _gestionar_cambio_asignacion(conn, maq_id, old_proyecto_id, new_proyecto_id)

        return dict(conn.execute("SELECT * FROM maquinas WHERE id = ?", [maq_id]).fetchone())


# ── Motor de reglas de revisiones ────────────────────────────────────────────


def _calcular_revisiones_pendientes(conn, maquina_id: int, horometro_actual: float) -> list:
    """Calcula revisiones pendientes consultando tanto maquinaria_revisiones (legacy)
    como maquinaria_maintenance_logs (histórico importado + nuevas revisiones).

    Para cada intervalo, busca el hito más alto cerrado en ambas tablas y calcula
    si toca la siguiente revisión.
    """
    INTERVALOS = {"100h": 100, "250h": 250, "500h": 500, "1000h": 1000, "2000h": 2000}

    # Task codes agrupados por intervalo (para consultar maintenance_logs)
    TASK_CODES_BY_INTERVAL = {
        100: ["REDUCTORES_ORUGAS_100H", "CADENA_ELEVACION_100H", "PATIN_LUBRICACION_100H",
              "INTERIOR_COLUMNA_100H", "BARRENA_ACEITE_100H", "SACAMUESTRAS_ENGRASAR_100H",
              "PERFORADOR_RP500_100H"],
        250: ["ORUGAS_TENSION_250H", "MEMBRANA_ACUMULADOR_250H", "TIRANTES_PERNOS_250H"],
        500: ["HIDRAULICO_NIVEL_500H", "PINZA_EXTRACCION_500H", "LEVANTADOR_GUARDARRAILES_500H"],
        1000: ["REDUCTOR_ORUGAS_ACEITE_1000H", "FILTRO_HIDRAULICO_ENVIO_1000H",
               "FILTRO_HIDRAULICO_DESCARGA_1000H", "BARRENA_ACEITE_REDUCTOR_1000H",
               "PERFORADOR_ACEITE_REDUCTOR_1000H", "CADENA_ELEVACION_1000H"],
        2000: ["DEPOSITO_HIDRAULICO_2000H"],
    }

    pendientes = []
    for tipo, intervalo in INTERVALOS.items():
        # 1) Buscar en maquinaria_revisiones (legacy)
        legacy = conn.execute(
            "SELECT horometro_al_revision FROM maquinaria_revisiones "
            "WHERE maquina_id = ? AND tipo = ? AND estado = 'cerrado' "
            "ORDER BY horometro_al_revision DESC LIMIT 1",
            [maquina_id, tipo],
        ).fetchone()
        legacy_h = legacy["horometro_al_revision"] if legacy else 0

        # 2) Buscar en maquinaria_maintenance_logs (histórico importado)
        codes = TASK_CODES_BY_INTERVAL.get(intervalo, [])
        logs_h = 0
        if codes:
            placeholders = ",".join("?" for _ in codes)
            log_row = conn.execute(
                f"SELECT MAX(due_hours) as max_due FROM maquinaria_maintenance_logs "
                f"WHERE maquina_id = ? AND task_code IN ({placeholders})",
                [maquina_id] + codes,
            ).fetchone()
            logs_h = log_row["max_due"] if log_row and log_row["max_due"] else 0

        # Tomar el mayor de ambas fuentes
        ultimo_h = max(legacy_h, logs_h)

        # Próximo hito = último cerrado + intervalo
        proximo_hito = ultimo_h + intervalo
        if proximo_hito <= horometro_actual:
            horas_desde = horometro_actual - ultimo_h
            veces = int(horas_desde / intervalo)
            pendientes.append({
                "tipo": tipo,
                "intervalo": intervalo,
                "proximo_hito": int(proximo_hito),
                "ultimo_horometro": ultimo_h,
                "horas_desde_ultima": round(horas_desde, 1),
                "veces_pendiente": veces,
                "urgente": veces > 1,
            })
    return pendientes


def marcar_revision_completada(maquina_id: int, intervalo: int, horometro_actual: float) -> dict:
    """Marca todas las tareas de un intervalo como completadas al hito correspondiente.

    Inserta logs en maquinaria_maintenance_logs con due_hours = floor(horometro / intervalo) * intervalo.
    """
    init_maquinaria_db()

    TASK_CODES_BY_INTERVAL = {
        100: ["REDUCTORES_ORUGAS_100H", "CADENA_ELEVACION_100H", "PATIN_LUBRICACION_100H",
              "INTERIOR_COLUMNA_100H", "BARRENA_ACEITE_100H", "SACAMUESTRAS_ENGRASAR_100H",
              "PERFORADOR_RP500_100H"],
        250: ["ORUGAS_TENSION_250H", "MEMBRANA_ACUMULADOR_250H", "TIRANTES_PERNOS_250H"],
        500: ["HIDRAULICO_NIVEL_500H", "PINZA_EXTRACCION_500H", "LEVANTADOR_GUARDARRAILES_500H"],
        1000: ["REDUCTOR_ORUGAS_ACEITE_1000H", "FILTRO_HIDRAULICO_ENVIO_1000H",
               "FILTRO_HIDRAULICO_DESCARGA_1000H", "BARRENA_ACEITE_REDUCTOR_1000H",
               "PERFORADOR_ACEITE_REDUCTOR_1000H", "CADENA_ELEVACION_1000H"],
        2000: ["DEPOSITO_HIDRAULICO_2000H"],
    }

    codes = TASK_CODES_BY_INTERVAL.get(intervalo, [])
    if not codes:
        return {"error": f"Intervalo {intervalo} no válido"}

    due_hours = int((horometro_actual // intervalo) * intervalo)
    now = _now()
    inserted = 0

    with _conectar() as conn:
        for tc in codes:
            existing = conn.execute(
                "SELECT id FROM maquinaria_maintenance_logs "
                "WHERE maquina_id = ? AND task_code = ? AND due_hours = ?",
                [maquina_id, tc, due_hours],
            ).fetchone()
            if existing:
                continue
            conn.execute(
                "INSERT INTO maquinaria_maintenance_logs "
                "(maquina_id, task_code, horometro_at, due_hours, "
                " operario_nombre, observaciones, completed_at, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [maquina_id, tc, horometro_actual, due_hours,
                 "Admin (manual)", "Marcada como realizada desde panel admin.", now, now],
            )
            inserted += 1
    return {"ok": True, "inserted": inserted, "due_hours": due_hours}


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


def obtener_check(check_id: int) -> dict | None:
    """Obtiene un check semanal por ID, con fotos."""
    init_maquinaria_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT mc.*, u.nombre AS usuario_nombre FROM maquinaria_checks mc "
            "LEFT JOIN usuarios u ON u.id = mc.usuario_id WHERE mc.id = ?",
            [check_id],
        ).fetchone()
        if not row:
            return None
        check = dict(row)
        check["fotos"] = [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'check' AND entidad_id = ? ORDER BY created_at",
            [check_id],
        ).fetchall()]
        # Parse checklist JSON
        try:
            check["checklist_parsed"] = json.loads(check.get("checklist") or "{}")
        except Exception:
            check["checklist_parsed"] = {}
        return check


def actualizar_check(check_id: int, data: dict) -> dict:
    """Actualiza campos de un check semanal (admin)."""
    init_maquinaria_db()
    with _conectar() as conn:
        campos = []
        valores = []
        for k in ("horometro", "observaciones", "estado"):
            if k in data:
                campos.append(f"{k} = ?")
                valores.append(data[k])
        if "checklist" in data:
            campos.append("checklist = ?")
            valores.append(json.dumps(data["checklist"]) if isinstance(data["checklist"], dict) else data["checklist"])
        if campos:
            valores.append(check_id)
            conn.execute(f"UPDATE maquinaria_checks SET {', '.join(campos)} WHERE id = ?", valores)
        return dict(conn.execute("SELECT * FROM maquinaria_checks WHERE id = ?", [check_id]).fetchone())


def eliminar_check(check_id: int) -> bool:
    """Elimina un check semanal y sus fotos asociadas."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute("DELETE FROM maquinaria_fotos WHERE entidad_tipo = 'check' AND entidad_id = ?", [check_id])
        conn.execute("DELETE FROM maquinaria_checks WHERE id = ?", [check_id])
        return True


# ── Incidencias ──────────────────────────────────────────────────────────────


def crear_incidencia(data: dict) -> dict:
    """Crea una incidencia con todos los campos de Fase 1.

    Campos mínimos obligatorios (operario): maquina_id, descripcion (o sintoma_inicial).
    El resto se rellena en pasos posteriores (triage, ejecución, cierre).
    """
    init_maquinaria_db()
    now = _now()
    with _conectar() as conn:
        # Auto-rellenar proyecto_id desde la máquina si no se proporciona
        if not data.get("proyecto_id"):
            maq = conn.execute("SELECT proyecto_id FROM maquinas WHERE id = ?",
                               [data["maquina_id"]]).fetchone()
            if maq and maq["proyecto_id"]:
                data["proyecto_id"] = maq["proyecto_id"]

        # Campos base + Fase 1
        cols = ["maquina_id", "check_id", "revision_id", "usuario_id",
                "fecha", "descripcion", "severidad", "estado",
                "zona", "telegram_id", "operario_nombre", "created_at",
                # Fase 1 nuevos
                "hora_deteccion", "horometro_deteccion", "proyecto_id",
                "operario_detecta", "tipo_incidencia", "subsistema",
                "sintoma_inicial", "maquina_siguio_operando",
                "fecha_hora_parada", "es_historico", "fuente_dato"]

        vals = [
            data["maquina_id"], data.get("check_id"), data.get("revision_id"),
            data.get("usuario_id"), data.get("fecha", date.today().isoformat()),
            data.get("descripcion") or data.get("sintoma_inicial", ""),
            data.get("severidad", "media"), "abierta",
            data.get("zona") or data.get("subsistema"), data.get("telegram_id"),
            data.get("operario_nombre"), now,
            # Fase 1 nuevos
            data.get("hora_deteccion"), data.get("horometro_deteccion"),
            data.get("proyecto_id"), data.get("operario_detecta"),
            data.get("tipo_incidencia"), data.get("subsistema") or data.get("zona"),
            data.get("sintoma_inicial"), data.get("maquina_siguio_operando"),
            data.get("fecha_hora_parada"), data.get("es_historico", 0),
            data.get("fuente_dato"),
        ]

        placeholders = ", ".join("?" for _ in cols)
        cols_str = ", ".join(cols)
        conn.execute(
            f"INSERT INTO maquinaria_incidencias ({cols_str}) VALUES ({placeholders})",
            vals,
        )
        iid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Aplicar reglas de negocio RN-01: incidencia alta/seguridad + no sigue operando
        inc = dict(conn.execute("SELECT * FROM maquinaria_incidencias WHERE id = ?", [iid]).fetchone())
        if not data.get("es_historico"):
            _aplicar_regla_estado_operativo_nueva_incidencia(conn, inc)

        return inc


def actualizar_incidencia(inc_id: int, data: dict) -> dict:
    """Actualiza una incidencia con campos de cualquier paso del flujo.

    Soporta:
    - Cambio de estado con validación de transiciones permitidas
    - Todos los campos de Fase 1 (triage, ejecución, cierre)
    - Cálculo automático de horas_downtime y coste_downtime al cerrar (RN-04, RN-05)
    """
    init_maquinaria_db()
    now = _now()

    # Todos los campos editables
    EDITABLE_COLS = (
        "estado", "descripcion", "severidad", "zona", "resolucion",
        # Fase 1
        "hora_deteccion", "horometro_deteccion", "proyecto_id",
        "operario_detecta", "tipo_incidencia", "subsistema",
        "sintoma_inicial", "maquina_siguio_operando",
        "fecha_hora_parada", "fecha_hora_vuelta", "horas_downtime",
        "motivo_downtime", "diagnostico_provisional", "causa_raiz",
        "accion_tomada", "pieza_sustituida", "repuesto_id", "taller_id",
        "resuelto_en", "espera_pieza", "espera_mecanico",
        "coste_repuesto", "coste_servicio", "coste_downtime",
        "es_repetida", "incidencia_anterior_id",
        "leccion_aprendida", "accion_preventiva",
        "es_historico", "fuente_dato",
    )

    with _conectar() as conn:
        # Obtener estado actual
        old = conn.execute("SELECT * FROM maquinaria_incidencias WHERE id = ?", [inc_id]).fetchone()
        if not old:
            return {"error": "Incidencia no encontrada"}
        old = dict(old)

        nuevo_estado = data.get("estado")

        # Validar transición de estado si se cambia
        if nuevo_estado and nuevo_estado != old["estado"]:
            transiciones = TRANSICIONES_INCIDENCIA.get(old["estado"], [])
            # Compatibilidad: 'cerrada' → 'cerrada_validada' se acepta siempre
            if nuevo_estado == "cerrada":
                nuevo_estado = "cerrada_validada"
                data["estado"] = "cerrada_validada"
            if nuevo_estado not in transiciones and nuevo_estado != old["estado"]:
                return {"error": f"Transición no permitida: {old['estado']} → {nuevo_estado}. "
                                 f"Transiciones válidas: {transiciones}"}

        # Construir SET dinámico
        sets = []
        params = []
        for col in EDITABLE_COLS:
            if col in data:
                sets.append(f"{col} = ?")
                params.append(data[col])

        # Sincronizar subsistema ↔ zona
        if "subsistema" in data and "zona" not in data:
            sets.append("zona = ?")
            params.append(data["subsistema"])
        elif "zona" in data and "subsistema" not in data:
            sets.append("subsistema = ?")
            params.append(data["zona"])

        # Si se está cerrando (cerrada_validada o resuelta), poner cerrada_at
        if nuevo_estado in ("cerrada_validada", "resuelta") and not old.get("cerrada_at"):
            sets.append("cerrada_at = ?")
            params.append(now)

        if not sets:
            return old

        params.append(inc_id)
        conn.execute(
            f"UPDATE maquinaria_incidencias SET {', '.join(sets)} WHERE id = ?",
            params,
        )

        # Re-leer tras update
        inc = dict(conn.execute("SELECT * FROM maquinaria_incidencias WHERE id = ?", [inc_id]).fetchone())

        # RN-04: Recalcular horas_downtime si hay parada y vuelta
        if inc.get("fecha_hora_parada") and inc.get("fecha_hora_vuelta"):
            if not data.get("horas_downtime"):  # solo si no se proporcionó manualmente
                try:
                    parada = datetime.fromisoformat(inc["fecha_hora_parada"])
                    vuelta = datetime.fromisoformat(inc["fecha_hora_vuelta"])
                    horas = (vuelta - parada).total_seconds() / 3600
                    if horas >= 0:
                        conn.execute(
                            "UPDATE maquinaria_incidencias SET horas_downtime = ? WHERE id = ?",
                            [round(horas, 2), inc_id],
                        )
                        inc["horas_downtime"] = round(horas, 2)
                except (ValueError, TypeError):
                    pass

        # RN-05: Calcular coste_downtime si hay horas_downtime
        if inc.get("horas_downtime") and inc["horas_downtime"] > 0:
            if not data.get("coste_downtime"):  # solo si no se proporcionó manualmente
                coste = (inc["horas_downtime"] / 8) * COSTE_DIA_PARADO
                conn.execute(
                    "UPDATE maquinaria_incidencias SET coste_downtime = ? WHERE id = ?",
                    [round(coste, 2), inc_id],
                )
                inc["coste_downtime"] = round(coste, 2)

        # Aplicar reglas de estado operativo (si no es histórico)
        if not inc.get("es_historico") and nuevo_estado:
            _aplicar_regla_estado_operativo_cambio_incidencia(conn, inc, old["estado"])

        return inc


def eliminar_incidencia(inc_id: int) -> bool:
    """Elimina una incidencia y sus datos asociados (updates, fotos)."""
    init_maquinaria_db()
    with _conectar() as conn:
        # Eliminar fotos de updates asociados
        update_ids = [r["id"] for r in conn.execute(
            "SELECT id FROM maquinaria_incidencia_updates WHERE incidencia_id = ?", [inc_id]
        ).fetchall()]
        for uid in update_ids:
            conn.execute("DELETE FROM maquinaria_fotos WHERE entidad_tipo = 'inc_update' AND entidad_id = ?", [uid])
        # Eliminar updates
        conn.execute("DELETE FROM maquinaria_incidencia_updates WHERE incidencia_id = ?", [inc_id])
        # Eliminar fotos de la incidencia
        conn.execute("DELETE FROM maquinaria_fotos WHERE entidad_tipo = 'incidencia' AND entidad_id = ?", [inc_id])
        # Eliminar la incidencia
        conn.execute("DELETE FROM maquinaria_incidencias WHERE id = ?", [inc_id])
        return True


def crear_incidencia_update(incidencia_id: int, texto: str, autor_nombre: str = "") -> dict:
    """Añade una actualización / nota de progreso a una incidencia."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_incidencia_updates (incidencia_id, texto, autor_nombre, created_at) "
            "VALUES (?, ?, ?, ?)",
            [incidencia_id, texto, autor_nombre or "", _now()],
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_incidencia_updates WHERE id = ?", [uid]).fetchone())


def listar_incidencia_updates(incidencia_id: int) -> list[dict]:
    """Devuelve todas las actualizaciones de una incidencia, con sus fotos."""
    init_maquinaria_db()
    with _conectar() as conn:
        updates = [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_incidencia_updates WHERE incidencia_id = ? ORDER BY created_at ASC",
            [incidencia_id],
        ).fetchall()]
        for u in updates:
            u["fotos"] = [dict(f) for f in conn.execute(
                "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = 'inc_update' AND entidad_id = ?",
                [u["id"]],
            ).fetchall()]
        return updates


def listar_incidencias(maquina_id: int | None = None,
                       estado: str | None = None,
                       desde: str | None = None,
                       severidad: str | None = None,
                       limit: int = 50) -> list[dict]:
    """Lista incidencias, opcionalmente filtradas por máquina, estado, fecha y severidad."""
    init_maquinaria_db()
    with _conectar() as conn:
        q = (
            "SELECT mi.*, m.nombre AS maquina_nombre, "
            "(e.nombre || ' ' || COALESCE(e.apellidos, '')) AS operario_nombre "
            "FROM maquinaria_incidencias mi "
            "JOIN maquinas m ON m.id = mi.maquina_id "
            "LEFT JOIN empleados e ON e.id = m.responsable_id "
            "WHERE 1=1"
        )
        params: list = []
        if maquina_id:
            q += " AND mi.maquina_id = ?"
            params.append(maquina_id)
        if estado:
            q += " AND mi.estado = ?"
            params.append(estado)
        if desde:
            q += " AND mi.fecha >= ?"
            params.append(desde)
        if severidad:
            q += " AND mi.severidad = ?"
            params.append(severidad)
        q += f" ORDER BY mi.created_at DESC LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def stats_incidencias() -> dict:
    """KPIs de incidencias para el dashboard de maquinaria (Fase 1 — 7 estados)."""
    init_maquinaria_db()
    ESTADOS_CERRADOS = ("cerrada", "cerrada_validada", "resuelta")
    with _conectar() as conn:
        total = conn.execute("SELECT COUNT(*) FROM maquinaria_incidencias").fetchone()[0]
        abiertas = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias WHERE estado = 'abierta'"
        ).fetchone()[0]

        # En curso: incluye todos los estados intermedios
        en_curso = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias WHERE estado IN "
            "('en_diagnostico','pendiente_pieza','pendiente_taller','en_reparacion','en_curso')"
        ).fetchone()[0]

        cerradas = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias WHERE estado IN "
            "('cerrada','cerrada_validada','resuelta')"
        ).fetchone()[0]

        # Por estado detallado
        por_estado = {}
        for row in conn.execute(
            "SELECT estado, COUNT(*) FROM maquinaria_incidencias GROUP BY estado"
        ).fetchall():
            por_estado[row[0]] = row[1]

        # Por severidad (solo no cerradas)
        por_severidad = {}
        for row in conn.execute(
            "SELECT severidad, COUNT(*) FROM maquinaria_incidencias "
            "WHERE estado NOT IN ('cerrada','cerrada_validada','resuelta') GROUP BY severidad"
        ).fetchall():
            por_severidad[row[0]] = row[1]

        # Por máquina (solo no cerradas)
        por_maquina = [dict(r) for r in conn.execute(
            "SELECT m.nombre AS maquina_nombre, m.id AS maquina_id, COUNT(*) AS total "
            "FROM maquinaria_incidencias mi JOIN maquinas m ON m.id = mi.maquina_id "
            "WHERE mi.estado NOT IN ('cerrada','cerrada_validada','resuelta') "
            "GROUP BY mi.maquina_id ORDER BY total DESC"
        ).fetchall()]

        # Tiempo medio resolución (días) de las cerradas
        avg_row = conn.execute(
            "SELECT AVG(julianday(cerrada_at) - julianday(created_at)) "
            "FROM maquinaria_incidencias WHERE estado IN ('cerrada','cerrada_validada','resuelta') "
            "AND cerrada_at IS NOT NULL"
        ).fetchone()
        tiempo_medio_dias = round(avg_row[0], 1) if avg_row and avg_row[0] else None

        # MTTR medio (horas) — solo con datos de downtime
        mttr_row = conn.execute(
            "SELECT AVG(horas_downtime) FROM maquinaria_incidencias "
            "WHERE estado IN ('cerrada','cerrada_validada','resuelta') "
            "AND horas_downtime IS NOT NULL AND horas_downtime > 0"
        ).fetchone()
        mttr_horas = round(mttr_row[0], 1) if mttr_row and mttr_row[0] else None

        # Últimas 5 incidencias no cerradas (para alertas)
        urgentes = [dict(r) for r in conn.execute(
            "SELECT mi.*, m.nombre AS maquina_nombre "
            "FROM maquinaria_incidencias mi JOIN maquinas m ON m.id = mi.maquina_id "
            "WHERE mi.estado NOT IN ('cerrada','cerrada_validada','resuelta') "
            "ORDER BY CASE mi.severidad WHEN 'seguridad' THEN 0 WHEN 'alta' THEN 1 "
            "WHEN 'media' THEN 2 ELSE 3 END, mi.created_at DESC LIMIT 5"
        ).fetchall()]

        return {
            "total": total,
            "abiertas": abiertas,
            "en_curso": en_curso,
            "cerradas": cerradas,
            "por_estado": por_estado,
            "por_severidad": por_severidad,
            "por_maquina": por_maquina,
            "tiempo_medio_dias": tiempo_medio_dias,
            "mttr_horas": mttr_horas,
            "urgentes": urgentes,
        }


# ── Asignaciones máquina-obra (Fase 1) ─────────────────────────────────────


def listar_asignaciones_obra(maquina_id: int) -> list[dict]:
    """Lista el historial de asignaciones de una máquina a obras."""
    init_maquinaria_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT a.*, p.nombre AS proyecto_nombre, p.codigo AS proyecto_codigo, "
            "(e.nombre || ' ' || COALESCE(e.apellidos, '')) AS operario_nombre "
            "FROM maquinaria_asignaciones_obra a "
            "LEFT JOIN proyectos p ON p.id = a.proyecto_id "
            "LEFT JOIN empleados e ON e.id = a.operario_id "
            "WHERE a.maquina_id = ? ORDER BY a.fecha_inicio DESC",
            [maquina_id],
        ).fetchall()]


def crear_asignacion_obra(data: dict) -> dict:
    """Crea una nueva asignación máquina-obra. Cierra la anterior si existe."""
    init_maquinaria_db()
    now = _now()
    with _conectar() as conn:
        # Cerrar asignación vigente (sin fecha_fin)
        conn.execute(
            "UPDATE maquinaria_asignaciones_obra SET fecha_fin = ? "
            "WHERE maquina_id = ? AND fecha_fin IS NULL",
            [data.get("fecha_inicio", date.today().isoformat()), data["maquina_id"]],
        )
        # Crear nueva
        conn.execute(
            "INSERT INTO maquinaria_asignaciones_obra "
            "(maquina_id, proyecto_id, fecha_inicio, ubicacion, operario_id, notas, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [data["maquina_id"], data["proyecto_id"],
             data.get("fecha_inicio", date.today().isoformat()),
             data.get("ubicacion"), data.get("operario_id"), data.get("notas"), now],
        )
        aid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_asignaciones_obra WHERE id = ?", [aid]).fetchone())


def _gestionar_cambio_asignacion(conn, maquina_id, old_proyecto_id, new_proyecto_id):
    """RN-07: Al cambiar proyecto_id, cierra asignación anterior y crea nueva."""
    hoy = date.today().isoformat()
    now = _now()
    # Cerrar asignación anterior
    if old_proyecto_id:
        conn.execute(
            "UPDATE maquinaria_asignaciones_obra SET fecha_fin = ? "
            "WHERE maquina_id = ? AND fecha_fin IS NULL",
            [hoy, maquina_id],
        )
    # Crear nueva asignación si hay nuevo proyecto
    if new_proyecto_id:
        conn.execute(
            "INSERT INTO maquinaria_asignaciones_obra "
            "(maquina_id, proyecto_id, fecha_inicio, created_at) VALUES (?, ?, ?, ?)",
            [maquina_id, new_proyecto_id, hoy, now],
        )


# ── Estado operativo (Fase 1) ──────────────────────────────────────────────


def actualizar_estado_operativo_manual(maquina_id: int, estado: str, usuario_id: int | None = None) -> dict:
    """Admin cambia manualmente el estado operativo de una máquina.

    Si baja la gravedad respecto al sugerido, activa override_estado_manual.
    """
    init_maquinaria_db()
    if estado not in PRIORIDAD_ESTADO_OPERATIVO:
        return {"error": f"Estado operativo no válido: {estado}. "
                         f"Valores permitidos: {list(PRIORIDAD_ESTADO_OPERATIVO.keys())}"}

    with _conectar() as conn:
        old = conn.execute("SELECT estado_operativo FROM maquinas WHERE id = ?",
                           [maquina_id]).fetchone()
        if not old:
            return {"error": "Máquina no encontrada"}

        old_estado = old["estado_operativo"] or "operativa"
        old_prio = PRIORIDAD_ESTADO_OPERATIVO.get(old_estado, 8)
        new_prio = PRIORIDAD_ESTADO_OPERATIVO.get(estado, 8)

        # Si baja gravedad (new_prio > old_prio), activar override
        override = 1 if new_prio > old_prio else 0

        conn.execute(
            "UPDATE maquinas SET estado_operativo = ?, override_estado_manual = ?, updated_at = ? WHERE id = ?",
            [estado, override, _now(), maquina_id],
        )
        return dict(conn.execute("SELECT * FROM maquinas WHERE id = ?", [maquina_id]).fetchone())


# ── KPIs de disponibilidad (Fase 1) ────────────────────────────────────────


def calcular_disponibilidad(maquina_id: int, dias: int = 90) -> dict:
    """Calcula KPIs de disponibilidad para una máquina en un periodo dado.

    Retorna: incidencias_abiertas, incidencias_periodo, horas_downtime,
    dias_parados, incidencias_por_100h, mttr, coste_acumulado.
    """
    init_maquinaria_db()
    with _conectar() as conn:
        desde = (date.today() - timedelta(days=dias)).isoformat()

        # Incidencias abiertas (activas ahora)
        abiertas = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND estado NOT IN ('cerrada','cerrada_validada','resuelta')",
            [maquina_id],
        ).fetchone()[0]

        # Incidencias en el periodo
        periodo = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND fecha >= ?",
            [maquina_id, desde],
        ).fetchone()[0]

        # Horas downtime en el periodo
        dt_row = conn.execute(
            "SELECT COALESCE(SUM(horas_downtime), 0) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND fecha >= ? AND horas_downtime IS NOT NULL",
            [maquina_id, desde],
        ).fetchone()
        horas_downtime = round(dt_row[0], 1)
        dias_parados = round(horas_downtime / 8, 1) if horas_downtime > 0 else 0

        # Incidencias por 100h (necesita horómetro)
        maq = conn.execute("SELECT horometro_actual, horometro_inicial FROM maquinas WHERE id = ?",
                           [maquina_id]).fetchone()
        horas_operacion = (maq["horometro_actual"] or 0) - (maq["horometro_inicial"] or 0)
        total_inc = conn.execute("SELECT COUNT(*) FROM maquinaria_incidencias WHERE maquina_id = ?",
                                 [maquina_id]).fetchone()[0]
        inc_por_100h = round((total_inc / horas_operacion) * 100, 2) if horas_operacion > 0 else 0

        # MTTR: tiempo medio de resolución en horas (solo cerradas con downtime)
        mttr_row = conn.execute(
            "SELECT AVG(horas_downtime) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND estado IN ('cerrada','cerrada_validada','resuelta') "
            "AND horas_downtime IS NOT NULL AND horas_downtime > 0",
            [maquina_id],
        ).fetchone()
        mttr = round(mttr_row[0], 1) if mttr_row and mttr_row[0] else 0

        # Coste acumulado
        coste_row = conn.execute(
            "SELECT COALESCE(SUM(coste_repuesto), 0) + COALESCE(SUM(coste_servicio), 0) "
            "+ COALESCE(SUM(coste_downtime), 0) "
            "FROM maquinaria_incidencias WHERE maquina_id = ? AND fecha >= ?",
            [maquina_id, desde],
        ).fetchone()
        coste_acumulado = round(coste_row[0], 2) if coste_row and coste_row[0] else 0

        return {
            "maquina_id": maquina_id,
            "dias": dias,
            "incidencias_abiertas": abiertas,
            "incidencias_periodo": periodo,
            "horas_downtime": horas_downtime,
            "dias_parados": dias_parados,
            "incidencias_por_100h": inc_por_100h,
            "mttr_horas": mttr,
            "coste_acumulado": coste_acumulado,
        }


# ── Reglas de negocio: estado operativo automático (Fase 1) ────────────────


def _aplicar_regla_estado_operativo_nueva_incidencia(conn, inc: dict):
    """RN-01: Al crear incidencia alta/seguridad + no sigue operando → sugerir parada_diagnostico."""
    if inc.get("severidad") not in ("alta", "seguridad"):
        return
    if inc.get("maquina_siguio_operando") == 1:
        # RN: sigue operando con incidencia → operativa_con_limitaciones
        _sugerir_estado_operativo(conn, inc["maquina_id"], "operativa_con_limitaciones")
        return
    # No sigue operando o no especificado → parada_diagnostico
    _sugerir_estado_operativo(conn, inc["maquina_id"], "parada_diagnostico")


def _aplicar_regla_estado_operativo_cambio_incidencia(conn, inc: dict, estado_anterior: str):
    """Reglas RN-02 a RN-05 al cambiar estado de incidencia."""
    nuevo_estado = inc.get("estado")
    maq_id = inc["maquina_id"]

    if nuevo_estado == "pendiente_pieza":
        # RN-02
        _sugerir_estado_operativo(conn, maq_id, "parada_pendiente_pieza")
    elif nuevo_estado == "pendiente_taller":
        _sugerir_estado_operativo(conn, maq_id, "pendiente_taller")
    elif nuevo_estado == "en_reparacion":
        _sugerir_estado_operativo(conn, maq_id, "en_reparacion")
    elif nuevo_estado in ("cerrada_validada", "resuelta"):
        # Verificar si quedan incidencias abiertas
        abiertas = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND id != ? "
            "AND estado NOT IN ('cerrada','cerrada_validada','resuelta')",
            [maq_id, inc["id"]],
        ).fetchone()[0]
        if abiertas == 0:
            # Todas cerradas → resetear override y proponer operativa
            # (no se aplica automáticamente, solo se propone)
            conn.execute(
                "UPDATE maquinas SET override_estado_manual = 0 WHERE id = ?",
                [maq_id],
            )


def _sugerir_estado_operativo(conn, maquina_id: int, estado_sugerido: str):
    """Aplica estado operativo sugerido según matriz de precedencia (sección 7).

    Solo sube gravedad (nunca baja automáticamente).
    Respeta override manual.
    """
    row = conn.execute(
        "SELECT estado_operativo, override_estado_manual FROM maquinas WHERE id = ?",
        [maquina_id],
    ).fetchone()
    if not row:
        return

    actual = row["estado_operativo"] or "operativa"
    override = row["override_estado_manual"] or 0

    # Si hay override manual activo, no cambiar automáticamente
    if override:
        return

    prio_actual = PRIORIDAD_ESTADO_OPERATIVO.get(actual, 8)
    prio_sugerido = PRIORIDAD_ESTADO_OPERATIVO.get(estado_sugerido, 8)

    # Solo subir gravedad (menor número = más grave)
    if prio_sugerido < prio_actual:
        conn.execute(
            "UPDATE maquinas SET estado_operativo = ?, updated_at = ? WHERE id = ?",
            [estado_sugerido, _now(), maquina_id],
        )


def get_telegram_id_para_maquina(maquina_id: int) -> int | None:
    """Devuelve el telegram_id del responsable asignado a una máquina.

    Sigue la cadena: maquinas.responsable_id → empleados.id
                     ← bot_telegram_usuarios.empleado_id → telegram_id

    Returns None si la máquina no tiene responsable o el responsable
    no está registrado en el bot.
    """
    init_maquinaria_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT btu.telegram_id "
            "FROM maquinas m "
            "JOIN bot_telegram_usuarios btu ON btu.empleado_id = m.responsable_id "
            "WHERE m.id = ? AND btu.rol NOT IN ('pendiente', 'bloqueado')",
            [maquina_id],
        ).fetchone()
        return row["telegram_id"] if row else None


def asignar_responsable_maquina(maquina_id: int, responsable_id: int | None) -> bool:
    """Asigna (o desasigna con None) un empleado como responsable de una máquina."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "UPDATE maquinas SET responsable_id = ? WHERE id = ?",
            [responsable_id, maquina_id],
        )
        return True


# ── Tokens de acceso operario ────────────────────────────────────────────────


def crear_token(maquina_id: int, operario_nombre: str = "",
                created_by: int | None = None, dias_validez: int = 90) -> dict:
    """Crea un token de acceso para un operario a una máquina específica."""
    init_maquinaria_db()
    token = secrets.token_urlsafe(16)  # 22 chars, URL-safe
    expires = (datetime.utcnow() + timedelta(days=dias_validez)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_tokens (token, maquina_id, operario_nombre, "
            "created_by, expires_at, activo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
            [token, maquina_id, operario_nombre, created_by, expires, _now()],
        )
        tid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_tokens WHERE id = ?", [tid]).fetchone())


def listar_tokens(maquina_id: int | None = None, solo_activos: bool = True) -> list:
    """Lista tokens, opcionalmente filtrados por máquina."""
    init_maquinaria_db()
    with _conectar() as conn:
        q = ("SELECT t.*, m.nombre AS maquina_nombre, u.nombre AS creado_por_nombre "
             "FROM maquinaria_tokens t "
             "LEFT JOIN maquinas m ON m.id = t.maquina_id "
             "LEFT JOIN usuarios u ON u.id = t.created_by "
             "WHERE 1=1")
        params: list = []
        if maquina_id:
            q += " AND t.maquina_id = ?"
            params.append(maquina_id)
        if solo_activos:
            q += " AND t.activo = 1"
        q += " ORDER BY t.created_at DESC"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def validar_token(token: str) -> dict | None:
    """Valida un token y devuelve info de la máquina si es válido."""
    init_maquinaria_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT t.*, m.nombre AS maquina_nombre, m.modelo, m.internal_id, "
            "m.horometro_actual, m.estado AS maquina_estado "
            "FROM maquinaria_tokens t "
            "JOIN maquinas m ON m.id = t.maquina_id "
            "WHERE t.token = ? AND t.activo = 1",
            [token],
        ).fetchone()
        if not row:
            return None
        t = dict(row)
        # Verificar expiración
        if t.get("expires_at"):
            try:
                exp = datetime.strptime(t["expires_at"], "%Y-%m-%dT%H:%M:%SZ")
                if datetime.utcnow() > exp:
                    return None
            except ValueError:
                pass
        return t


def desactivar_token(token_id: int) -> bool:
    """Desactiva un token."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute("UPDATE maquinaria_tokens SET activo = 0 WHERE id = ?", [token_id])
        return True


def reactivar_token(token_id: int, dias_extra: int = 90) -> dict:
    """Reactiva un token y extiende su validez."""
    init_maquinaria_db()
    expires = (datetime.utcnow() + timedelta(days=dias_extra)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with _conectar() as conn:
        conn.execute(
            "UPDATE maquinaria_tokens SET activo = 1, expires_at = ? WHERE id = ?",
            [expires, token_id],
        )
        return dict(conn.execute("SELECT * FROM maquinaria_tokens WHERE id = ?", [token_id]).fetchone())


# ── Fotos adjuntas ───────────────────────────────────────────────────────────


def guardar_foto(entidad_tipo: str, entidad_id: int, filename: str, filepath: str) -> dict:
    """Guarda referencia a una foto subida."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_fotos (entidad_tipo, entidad_id, filename, filepath, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [entidad_tipo, entidad_id, filename, filepath, _now()],
        )
        fid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_fotos WHERE id = ?", [fid]).fetchone())


def listar_fotos(entidad_tipo: str, entidad_id: int) -> list:
    """Lista fotos de una entidad."""
    init_maquinaria_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_fotos WHERE entidad_tipo = ? AND entidad_id = ? ORDER BY created_at",
            [entidad_tipo, entidad_id],
        ).fetchall()]


# ── Revisiones CRUD ──────────────────────────────────────────────────────────


def crear_revision(data: dict) -> dict:
    """Crea una revisión horométrica."""
    init_maquinaria_db()
    with _conectar() as conn:
        checklist = data.get("checklist") or {}
        conn.execute(
            "INSERT INTO maquinaria_revisiones (maquina_id, tipo, usuario_id, fecha, "
            "horometro_al_revision, tipo_ejecucion, coste, checklist, observaciones, estado, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'abierto', ?)",
            [data["maquina_id"], data["tipo"], data.get("usuario_id"),
             data.get("fecha", date.today().isoformat()),
             data.get("horometro_al_revision", 0),
             data.get("tipo_ejecucion", "interno"),
             data.get("coste", 0),
             json.dumps(checklist),
             data.get("observaciones", ""), _now()],
        )
        rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Actualizar horómetro si es mayor
        if data.get("horometro_al_revision"):
            conn.execute(
                "UPDATE maquinas SET horometro_actual = ?, updated_at = ? "
                "WHERE id = ? AND horometro_actual < ?",
                [data["horometro_al_revision"], _now(),
                 data["maquina_id"], data["horometro_al_revision"]],
            )
        return dict(conn.execute("SELECT * FROM maquinaria_revisiones WHERE id = ?", [rid]).fetchone())


def cerrar_revision(rev_id: int) -> dict:
    """Cierra una revisión."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "UPDATE maquinaria_revisiones SET estado = 'cerrado', cerrado_at = ? WHERE id = ?",
            [_now(), rev_id],
        )
        return dict(conn.execute("SELECT * FROM maquinaria_revisiones WHERE id = ?", [rev_id]).fetchone())


# ── Dashboard de mantenimiento ───────────────────────────────────────────────


def dashboard_mantenimiento() -> dict:
    """Devuelve resumen de mantenimiento para el dashboard."""
    init_maquinaria_db()
    with _conectar() as conn:
        maquinas = [dict(r) for r in conn.execute(
            "SELECT * FROM maquinas WHERE activa = 1 ORDER BY nombre"
        ).fetchall()]

        # Incidencias abiertas
        inc_abiertas = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE estado NOT IN ('cerrada','cerrada_validada','resuelta')"
        ).fetchone()[0]

        # Incidencias de seguridad abiertas
        inc_seguridad = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE estado NOT IN ('cerrada','cerrada_validada','resuelta') AND severidad = 'seguridad'"
        ).fetchone()[0]

        # Checks esta semana
        hoy = date.today()
        inicio_semana = (hoy - timedelta(days=hoy.weekday())).isoformat()
        checks_semana = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_checks WHERE fecha >= ?", [inicio_semana]
        ).fetchone()[0]

        # Revisiones pendientes por máquina
        rev_pendientes_total = 0
        maquinas_con_revision = []
        for m in maquinas:
            pend = _calcular_revisiones_pendientes(conn, m["id"], m["horometro_actual"])
            if pend:
                rev_pendientes_total += len(pend)
                maquinas_con_revision.append({
                    "maquina_id": m["id"],
                    "maquina_nombre": m["nombre"],
                    "revisiones": pend,
                })

        # Tokens activos
        tokens_activos = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_tokens WHERE activo = 1"
        ).fetchone()[0]

        return {
            "total_maquinas": len(maquinas),
            "maquinas_en_taller": sum(1 for m in maquinas if m["estado"] == "en_taller"),
            "maquinas_baja": sum(1 for m in maquinas if m["estado"] == "baja"),
            "incidencias_abiertas": inc_abiertas,
            "incidencias_seguridad": inc_seguridad,
            "checks_esta_semana": checks_semana,
            "revisiones_pendientes": rev_pendientes_total,
            "maquinas_con_revision_pendiente": maquinas_con_revision,
            "tokens_activos": tokens_activos,
        }


# ══════════════════════════════════════════════════════════════════════════════
# ██  Historial completo de servicio (para exports)                         ██
# ══════════════════════════════════════════════════════════════════════════════


def obtener_historial_servicio(maquina_id: int, desde: str = None, hasta: str = None) -> dict:
    """Obtiene historial completo de una máquina para export.

    Retorna dict con: maquina, revisiones (maintenance_logs agrupados),
    checks, incidencias, todo filtrable por rango de fechas.
    """
    init_maquinaria_db()
    with _conectar() as conn:
        maq = conn.execute(
            "SELECT m.*, p.nombre AS proyecto_nombre FROM maquinas m "
            "LEFT JOIN proyectos p ON p.id = m.proyecto_id WHERE m.id = ?",
            [maquina_id],
        ).fetchone()
        if not maq:
            return None
        maq = dict(maq)

        # ── Revisiones (maintenance_logs) ──
        sql_rev = (
            "SELECT horometro_at, due_hours, completed_at, task_code, operario_nombre, observaciones "
            "FROM maquinaria_maintenance_logs WHERE maquina_id = ?"
        )
        params_rev = [maquina_id]
        if desde:
            sql_rev += " AND completed_at >= ?"
            params_rev.append(desde)
        if hasta:
            sql_rev += " AND completed_at <= ?"
            params_rev.append(hasta + "T23:59:59")
        sql_rev += " ORDER BY horometro_at DESC, task_code"
        revs_raw = conn.execute(sql_rev, params_rev).fetchall()

        # Agrupar por (horometro_at, completed_at) → evento de revisión
        rev_events = {}
        for r in revs_raw:
            r = dict(r)
            key = (r["horometro_at"], (r["completed_at"] or "")[:10])
            if key not in rev_events:
                rev_events[key] = {
                    "horometro": r["horometro_at"],
                    "fecha": (r["completed_at"] or "")[:10],
                    "operario": r["operario_nombre"],
                    "tareas": [],
                    "observaciones": r["observaciones"],
                }
            rev_events[key]["tareas"].append(r["task_code"])
        revisiones = sorted(rev_events.values(), key=lambda x: x["horometro"], reverse=True)

        # ── Checks semanales ──
        sql_chk = (
            "SELECT mc.*, u.nombre AS usuario_nombre FROM maquinaria_checks mc "
            "LEFT JOIN usuarios u ON u.id = mc.usuario_id WHERE mc.maquina_id = ?"
        )
        params_chk = [maquina_id]
        if desde:
            sql_chk += " AND mc.fecha >= ?"
            params_chk.append(desde)
        if hasta:
            sql_chk += " AND mc.fecha <= ?"
            params_chk.append(hasta)
        sql_chk += " ORDER BY mc.fecha DESC"
        checks = [dict(r) for r in conn.execute(sql_chk, params_chk).fetchall()]

        # ── Incidencias ──
        sql_inc = (
            "SELECT mi.*, u.nombre AS usuario_nombre FROM maquinaria_incidencias mi "
            "LEFT JOIN usuarios u ON u.id = mi.usuario_id WHERE mi.maquina_id = ?"
        )
        params_inc = [maquina_id]
        if desde:
            sql_inc += " AND mi.fecha >= ?"
            params_inc.append(desde)
        if hasta:
            sql_inc += " AND mi.fecha <= ?"
            params_inc.append(hasta)
        sql_inc += " ORDER BY mi.fecha DESC"
        incidencias = [dict(r) for r in conn.execute(sql_inc, params_inc).fetchall()]

        return {
            "maquina": maq,
            "revisiones": revisiones,
            "checks": checks,
            "incidencias": incidencias,
            "filtro_desde": desde,
            "filtro_hasta": hasta,
        }


# ══════════════════════════════════════════════════════════════════════════════
# ██  Documentos generados (CRUD)                                           ██
# ══════════════════════════════════════════════════════════════════════════════


def registrar_documento(data: dict) -> dict:
    """Registra un documento generado en maquinaria_documentos."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_documentos "
            "(maquina_id, tipo, titulo, filename, filepath, mime_type, size_bytes, "
            " hash_sha256, provider, canonical_path, generado_por, metadata_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [data.get("maquina_id"), data["tipo"], data["titulo"], data["filename"],
             data["filepath"], data.get("mime_type"), data.get("size_bytes"),
             data.get("hash_sha256"), data.get("provider", "local"),
             data.get("canonical_path"), data.get("generado_por"),
             json.dumps(data.get("metadata")) if data.get("metadata") else None,
             _now()],
        )
        did = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM maquinaria_documentos WHERE id = ?", [did]).fetchone())


def listar_documentos(maquina_id: int = None, tipo: str = None) -> list:
    """Lista documentos, opcionalmente filtrados por máquina y/o tipo."""
    init_maquinaria_db()
    with _conectar() as conn:
        sql = "SELECT d.*, m.nombre AS maquina_nombre FROM maquinaria_documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id WHERE 1=1"
        params = []
        if maquina_id:
            sql += " AND d.maquina_id = ?"
            params.append(maquina_id)
        if tipo:
            sql += " AND d.tipo = ?"
            params.append(tipo)
        sql += " ORDER BY d.created_at DESC"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Auditor Links (Fase 4)                                                 ██
# ═══════════════════════════════════════════════════════════════════════════════

import hmac
import hashlib as _hashlib


def _generar_token_auditor() -> str:
    """Genera un token seguro URL-safe de 32 bytes."""
    return secrets.token_urlsafe(32)


def crear_auditor_link(maquina_id: int, creado_por: int, nombre_destinatario: str = None,
                       dias_expiracion: int = 14, max_accesos: int = None) -> dict:
    """Crea un link de auditor temporal para una máquina."""
    init_maquinaria_db()
    token = _generar_token_auditor()
    expires_at = (datetime.now() + timedelta(days=dias_expiracion)).isoformat()
    now = _now()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_auditor_links "
            "(token, maquina_id, flota_completa, creado_por, nombre_destinatario, "
            " expires_at, max_accesos, created_at) "
            "VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
            [token, maquina_id, creado_por, nombre_destinatario, expires_at, max_accesos, now],
        )
        lid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute(
            "SELECT al.*, m.nombre AS maquina_nombre "
            "FROM maquinaria_auditor_links al "
            "LEFT JOIN maquinas m ON m.id = al.maquina_id "
            "WHERE al.id = ?", [lid]).fetchone())


def listar_auditor_links(maquina_id: int = None) -> list:
    """Lista links de auditor activos (no revocados, no expirados)."""
    init_maquinaria_db()
    now = _now()
    with _conectar() as conn:
        sql = (
            "SELECT al.*, m.nombre AS maquina_nombre, u.nombre AS creador_nombre "
            "FROM maquinaria_auditor_links al "
            "LEFT JOIN maquinas m ON m.id = al.maquina_id "
            "LEFT JOIN usuarios u ON u.id = al.creado_por "
            "WHERE al.revocado = 0 "
        )
        params = []
        if maquina_id:
            sql += " AND al.maquina_id = ? "
            params.append(maquina_id)
        sql += " ORDER BY al.created_at DESC"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def revocar_auditor_link(link_id: int) -> bool:
    """Revoca un link de auditor."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute("UPDATE maquinaria_auditor_links SET revocado = 1 WHERE id = ?", [link_id])
        return conn.total_changes > 0


def validar_auditor_token(token: str) -> dict | None:
    """Valida un token de auditor. Devuelve el link si es válido, None si no."""
    init_maquinaria_db()
    now = _now()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT al.*, m.nombre AS maquina_nombre, m.internal_id, m.modelo, "
            "       m.numero_serie, m.horometro_actual, m.horometro_inicial, "
            "       m.fecha_comision, m.estado, p.nombre AS proyecto_nombre "
            "FROM maquinaria_auditor_links al "
            "LEFT JOIN maquinas m ON m.id = al.maquina_id "
            "LEFT JOIN proyectos p ON p.id = m.proyecto_id "
            "WHERE al.token = ? AND al.revocado = 0",
            [token],
        ).fetchone()
        if not row:
            return None
        link = dict(row)
        # Check expiration
        if link["expires_at"] < now:
            return None
        # Check max accesses
        if link["max_accesos"] and link["accesos_count"] >= link["max_accesos"]:
            return None
        return link


def registrar_acceso_auditor(link_id: int, ip: str, user_agent: str,
                             accion: str, detalle: str = None) -> None:
    """Registra un acceso en el audit log e incrementa el contador."""
    init_maquinaria_db()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_audit_log (auditor_link_id, ip, user_agent, accion, detalle, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [link_id, ip, user_agent, accion, detalle, _now()],
        )
        conn.execute(
            "UPDATE maquinaria_auditor_links SET accesos_count = accesos_count + 1 WHERE id = ?",
            [link_id],
        )


def obtener_audit_log(link_id: int) -> list:
    """Obtiene el log de accesos de un link de auditor."""
    init_maquinaria_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM maquinaria_audit_log WHERE auditor_link_id = ? ORDER BY created_at DESC",
            [link_id],
        ).fetchall()]
