"""
Migración CRM – Fase 1, Tarea 1.3
Crea las tablas del módulo CRM en gestion.db sin modificar tablas existentes.

Tablas creadas:
  - crm_empresas          Empresas externas (clientes/proveedores/leads)
  - crm_contactos         Personas físicas vinculadas a empresas CRM
  - crm_interacciones     Registro de cada contacto/comunicación
  - crm_oportunidades     Pipeline comercial
  - crm_etiquetas         Tags flexibles
  - crm_contacto_etiquetas  Puente contacto ↔ etiqueta
  - crm_empresa_etiquetas   Puente empresa ↔ etiqueta
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

# Resolver ruta a gestion.db (mismo esquema que config.py)
BASE_DIR = Path(__file__).resolve().parents[1]
DATOS_DIR = BASE_DIR / "data"
GESTION_DB = DATOS_DIR / "gestion.db"


def conectar() -> sqlite3.Connection:
    DATOS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(GESTION_DB))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


SQL_TABLES = """
-- =============================================================
-- CRM EMPRESAS: Empresas externas con las que interactuamos
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_empresas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre            TEXT    NOT NULL,
    cif               TEXT,
    direccion         TEXT,
    localidad         TEXT,
    provincia         TEXT,
    pais              TEXT,
    telefono          TEXT,
    email             TEXT,
    web               TEXT,
    sector            TEXT,
    tipo              TEXT    NOT NULL DEFAULT 'lead'
                      CHECK (tipo IN ('cliente', 'proveedor', 'ambos', 'lead')),
    tercero_id        INTEGER,
    notas             TEXT,
    fecha_creacion    TEXT    NOT NULL,
    activo            INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (tercero_id) REFERENCES terceros(id)
);

-- =============================================================
-- CRM CONTACTOS: Personas físicas
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_contactos (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre                TEXT    NOT NULL,
    apellidos             TEXT,
    cargo                 TEXT,
    email                 TEXT,
    telefono              TEXT,
    telefono2             TEXT,
    empresa_vinculada_id  INTEGER,
    tipo_relacion         TEXT    NOT NULL DEFAULT 'otro'
                          CHECK (tipo_relacion IN ('cliente', 'proveedor', 'ambos', 'lead', 'otro')),
    notas                 TEXT,
    fecha_creacion        TEXT    NOT NULL,
    fecha_actualizacion   TEXT,
    creado_por            TEXT,
    activo                INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (empresa_vinculada_id) REFERENCES crm_empresas(id)
);

-- =============================================================
-- CRM OPORTUNIDADES: Pipeline comercial
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_oportunidades (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id            INTEGER NOT NULL,
    contacto_id           INTEGER,
    nombre                TEXT    NOT NULL,
    descripcion           TEXT,
    estado                TEXT    NOT NULL DEFAULT 'lead'
                          CHECK (estado IN (
                              'lead', 'contacto_inicial', 'cotizacion_enviada',
                              'negociacion', 'ganada', 'perdida', 'aplazada'
                          )),
    importe_estimado      REAL,
    probabilidad          INTEGER,
    fecha_estimada_cierre TEXT,
    motivo_perdida        TEXT,
    proyecto_id           INTEGER,
    presupuesto_id        INTEGER,
    fuente                TEXT    DEFAULT 'otro'
                          CHECK (fuente IN ('web', 'referido', 'llamada_fria', 'feria', 'otro')),
    fecha_creacion        TEXT    NOT NULL,
    fecha_actualizacion   TEXT,
    creado_por            TEXT,
    FOREIGN KEY (empresa_id)  REFERENCES crm_empresas(id),
    FOREIGN KEY (contacto_id) REFERENCES crm_contactos(id)
);

-- =============================================================
-- CRM INTERACCIONES: Registro de cada comunicación
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_interacciones (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    contacto_id           INTEGER,
    empresa_id            INTEGER,
    tipo                  TEXT    NOT NULL
                          CHECK (tipo IN ('llamada', 'email', 'reunion', 'nota', 'whatsapp', 'visita')),
    asunto                TEXT,
    descripcion           TEXT,
    fecha                 TEXT    NOT NULL,
    duracion_minutos      INTEGER,
    resultado             TEXT,
    siguiente_accion      TEXT,
    fecha_siguiente_accion TEXT,
    oportunidad_id        INTEGER,
    creado_por            TEXT,
    fecha_creacion        TEXT    NOT NULL,
    FOREIGN KEY (contacto_id)    REFERENCES crm_contactos(id),
    FOREIGN KEY (empresa_id)     REFERENCES crm_empresas(id),
    FOREIGN KEY (oportunidad_id) REFERENCES crm_oportunidades(id)
);

-- =============================================================
-- CRM ETIQUETAS: Tags flexibles
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_etiquetas (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT    NOT NULL UNIQUE,
    color  TEXT
);

-- =============================================================
-- Tablas puente (many-to-many)
-- =============================================================
CREATE TABLE IF NOT EXISTS crm_contacto_etiquetas (
    contacto_id  INTEGER NOT NULL,
    etiqueta_id  INTEGER NOT NULL,
    PRIMARY KEY (contacto_id, etiqueta_id),
    FOREIGN KEY (contacto_id) REFERENCES crm_contactos(id) ON DELETE CASCADE,
    FOREIGN KEY (etiqueta_id) REFERENCES crm_etiquetas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm_empresa_etiquetas (
    empresa_id   INTEGER NOT NULL,
    etiqueta_id  INTEGER NOT NULL,
    PRIMARY KEY (empresa_id, etiqueta_id),
    FOREIGN KEY (empresa_id)  REFERENCES crm_empresas(id)  ON DELETE CASCADE,
    FOREIGN KEY (etiqueta_id) REFERENCES crm_etiquetas(id) ON DELETE CASCADE
);
"""

SQL_INDEXES = """
-- Índices crm_empresas
CREATE INDEX IF NOT EXISTS ix_crm_empresas_nombre     ON crm_empresas(nombre);
CREATE INDEX IF NOT EXISTS ix_crm_empresas_cif        ON crm_empresas(cif);
CREATE INDEX IF NOT EXISTS ix_crm_empresas_tipo       ON crm_empresas(tipo);
CREATE INDEX IF NOT EXISTS ix_crm_empresas_tercero    ON crm_empresas(tercero_id);
CREATE INDEX IF NOT EXISTS ix_crm_empresas_email      ON crm_empresas(email);

-- Índices crm_contactos
CREATE INDEX IF NOT EXISTS ix_crm_contactos_nombre    ON crm_contactos(nombre);
CREATE INDEX IF NOT EXISTS ix_crm_contactos_email     ON crm_contactos(email);
CREATE INDEX IF NOT EXISTS ix_crm_contactos_empresa   ON crm_contactos(empresa_vinculada_id);
CREATE INDEX IF NOT EXISTS ix_crm_contactos_tipo      ON crm_contactos(tipo_relacion);

-- Índices crm_interacciones
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_contacto    ON crm_interacciones(contacto_id);
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_empresa     ON crm_interacciones(empresa_id);
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_oportunidad ON crm_interacciones(oportunidad_id);
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_fecha       ON crm_interacciones(fecha);
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_tipo        ON crm_interacciones(tipo);

-- Índices crm_oportunidades
CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_empresa  ON crm_oportunidades(empresa_id);
CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_contacto ON crm_oportunidades(contacto_id);
CREATE INDEX IF NOT EXISTS ix_crm_oportunidades_estado   ON crm_oportunidades(estado);

-- Índices tablas puente
CREATE INDEX IF NOT EXISTS ix_crm_contacto_etiquetas_etiqueta ON crm_contacto_etiquetas(etiqueta_id);
CREATE INDEX IF NOT EXISTS ix_crm_empresa_etiquetas_etiqueta  ON crm_empresa_etiquetas(etiqueta_id);
"""


CRM_TABLES = [
    "crm_empresas",
    "crm_contactos",
    "crm_oportunidades",
    "crm_interacciones",
    "crm_etiquetas",
    "crm_contacto_etiquetas",
    "crm_empresa_etiquetas",
]


def main() -> None:
    import io, sys
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    print(f"Base de datos: {GESTION_DB}")
    print(f"Existe: {GESTION_DB.exists()}\n")

    conn = conectar()
    try:
        # Tablas antes
        antes = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        print(f"Tablas existentes antes de migración: {sorted(antes)}\n")

        # Crear tablas
        conn.executescript(SQL_TABLES)
        conn.executescript(SQL_INDEXES)
        conn.commit()

        # Tablas después
        despues = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}

        nuevas = sorted(despues - antes)
        print("=" * 60)
        print("RESUMEN DE MIGRACIÓN CRM")
        print("=" * 60)

        if nuevas:
            print(f"\nTablas creadas ({len(nuevas)}):")
            for t in nuevas:
                cols = conn.execute(f"PRAGMA table_info({t})").fetchall()
                print(f"  ✓ {t} ({len(cols)} columnas)")
                for c in cols:
                    nullable = "" if c[3] else " NULL"
                    pk = " PK" if c[5] else ""
                    default = f" DEFAULT {c[4]}" if c[4] is not None else ""
                    print(f"      - {c[1]} {c[2]}{nullable}{default}{pk}")
        else:
            print("\nNo se crearon tablas nuevas (ya existían todas).")

        # Verificar índices CRM
        indices = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_crm_%'"
        ).fetchall()
        print(f"\nÍndices CRM creados: {len(indices)}")
        for idx in sorted(indices, key=lambda r: r[0]):
            print(f"  ✓ {idx[0]}")

        print(f"\nTablas totales en gestion.db: {len(despues)}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
