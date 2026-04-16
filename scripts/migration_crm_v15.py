"""
Migración CRM v1.5 — Fase 2, Bloques 1-2
=========================================

Añade los campos persistidos por el motor de seguimiento a `gestion.db`.
No modifica columnas existentes, solo añade. Idempotente: puede correrse N veces.

Cambios:
  1. `crm_oportunidades` — 9 columnas derivadas (todas nullables):
       - ultima_interaccion_fecha    TEXT     última interacción COMERCIAL válida
                                               (notas NO cuentan — Corrección 2)
       - fecha_entrada_etapa         TEXT     última entrada a la etapa actual
       - next_action_date            TEXT     fecha recomendada (respeta override)
       - next_action_type            TEXT     enum: primer_contacto / perseguir_respuesta /
                                                    recordar_presupuesto / cerrar /
                                                    reactivar / revisar_estancada
       - next_action_source          TEXT     'motor' | 'usuario'
       - priority_score              INTEGER  0..~150
       - riesgo                      TEXT     'verde' | 'ambar' | 'rojo'
       - estado_respuesta            TEXT     'pendiente' | 'recibida' | 'na'
       - seguimiento_recalculado_en  TEXT     timestamp ISO del último recálculo

  2. `crm_interacciones` — columna nueva:
       - direccion                   TEXT     'out' | 'in' | 'none'

  3. `crm_etapa_sla` — tabla nueva con seed inicial (7 filas).

  4. Índices nuevos para queries de seguimiento.

  5. Backfill: `direccion='none'` para interacciones existentes.

  6. Recálculo inicial del motor sobre todas las oportunidades abiertas.

Uso:
    python scripts/migration_crm_v15.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DATOS_DIR = BASE_DIR / "data"
GESTION_DB = DATOS_DIR / "gestion.db"


def conectar() -> sqlite3.Connection:
    DATOS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(GESTION_DB))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


# ── Esquema aditivo ──────────────────────────────────────────────────────────

COLUMNAS_OPORTUNIDADES = [
    ("ultima_interaccion_fecha",    "TEXT"),
    ("fecha_entrada_etapa",         "TEXT"),
    ("next_action_date",            "TEXT"),
    ("next_action_type",            "TEXT"),
    ("next_action_source",          "TEXT"),
    ("priority_score",              "INTEGER"),
    ("riesgo",                      "TEXT"),
    ("estado_respuesta",            "TEXT"),
    ("seguimiento_recalculado_en",  "TEXT"),
]

COLUMNAS_INTERACCIONES = [
    ("direccion", "TEXT"),
]

SQL_CREATE_SLA = """
CREATE TABLE IF NOT EXISTS crm_etapa_sla (
    etapa                   TEXT PRIMARY KEY,
    sla_dias_sin_contacto   INTEGER NOT NULL,
    sla_dias_en_etapa       INTEGER NOT NULL,
    accion_default          TEXT    NOT NULL,
    prioridad_base          INTEGER NOT NULL
);
"""

# Seed (aliñado con core/crm_seguimiento.DEFAULT_SLAS — si se cambia uno se cambia el otro)
SEED_SLA = [
    ("lead",                5,  14, "primer_contacto",      40),
    ("contacto_inicial",    7,  21, "perseguir_respuesta",  55),
    ("cotizacion_enviada",  5,  30, "recordar_presupuesto", 75),
    ("negociacion",         3,  20, "cerrar",               90),
    ("aplazada",           30, 120, "reactivar",            20),
    ("ganada",           9999, 9999, "cerrar",               0),
    ("perdida",          9999, 9999, "cerrar",               0),
]

SQL_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_crm_oport_next_action_date ON crm_oportunidades(next_action_date)",
    "CREATE INDEX IF NOT EXISTS ix_crm_oport_priority_score   ON crm_oportunidades(priority_score DESC)",
    "CREATE INDEX IF NOT EXISTS ix_crm_oport_riesgo           ON crm_oportunidades(riesgo)",
    "CREATE INDEX IF NOT EXISTS ix_crm_interacciones_direccion ON crm_interacciones(oportunidad_id, direccion, fecha DESC)",
]


def _add_columns(conn: sqlite3.Connection, tabla: str, columnas: list[tuple[str, str]]) -> list[str]:
    existentes = {r[1] for r in conn.execute(f"PRAGMA table_info({tabla})").fetchall()}
    añadidas: list[str] = []
    for nombre, tipo in columnas:
        if nombre in existentes:
            continue
        conn.execute(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {tipo}")
        añadidas.append(nombre)
    return añadidas


def _crear_tabla_sla(conn: sqlite3.Connection) -> int:
    conn.execute(SQL_CREATE_SLA)
    inserted = 0
    for fila in SEED_SLA:
        cur = conn.execute(
            "INSERT OR IGNORE INTO crm_etapa_sla "
            "(etapa, sla_dias_sin_contacto, sla_dias_en_etapa, accion_default, prioridad_base) "
            "VALUES (?, ?, ?, ?, ?)",
            fila,
        )
        inserted += cur.rowcount or 0
    return inserted


def _crear_indices(conn: sqlite3.Connection) -> None:
    for sql in SQL_INDEXES:
        conn.execute(sql)


def _backfill_direccion(conn: sqlite3.Connection) -> int:
    cur = conn.execute(
        "UPDATE crm_interacciones SET direccion = 'none' WHERE direccion IS NULL"
    )
    return cur.rowcount or 0


def _recalcular_inicial(conn: sqlite3.Connection) -> int:
    """Recalcula el motor para todas las oportunidades abiertas, si el módulo está disponible."""
    # Importamos lazy para que el script pueda correr aunque el módulo aún no
    # haya sido cargado en el backend (el backend puede estar parado).
    try:
        sys.path.insert(0, str(BASE_DIR / "interfaz_facturas"))
        from core import crm_seguimiento  # noqa: E402
    except Exception as exc:
        print(f"⚠ No se pudo importar core.crm_seguimiento para recálculo inicial: {exc}")
        print("  El motor se poblará en el primer arranque del backend.")
        return 0
    return crm_seguimiento.recalcular_seguimiento_todas(conn)


def main() -> None:
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    print(f"Base de datos: {GESTION_DB}")
    print(f"Existe: {GESTION_DB.exists()}\n")

    conn = conectar()
    try:
        añadidas_op = _add_columns(conn, "crm_oportunidades", COLUMNAS_OPORTUNIDADES)
        añadidas_in = _add_columns(conn, "crm_interacciones", COLUMNAS_INTERACCIONES)
        nuevas_slas = _crear_tabla_sla(conn)
        _crear_indices(conn)
        backfilled = _backfill_direccion(conn)
        conn.commit()

        print("=" * 60)
        print("RESUMEN MIGRACIÓN CRM v1.5")
        print("=" * 60)
        print(f"\nColumnas añadidas en crm_oportunidades ({len(añadidas_op)}):")
        for c in añadidas_op:
            print(f"  + {c}")
        if not añadidas_op:
            print("  (ninguna — ya estaban)")

        print(f"\nColumnas añadidas en crm_interacciones ({len(añadidas_in)}):")
        for c in añadidas_in:
            print(f"  + {c}")
        if not añadidas_in:
            print("  (ninguna — ya estaban)")

        print(f"\nFilas insertadas en crm_etapa_sla: {nuevas_slas}")
        print(f"Interacciones backfilled con direccion='none': {backfilled}")

        # Recálculo inicial (opcional, no-fatal si el módulo no importa)
        print("\nEjecutando recálculo inicial del motor de seguimiento...")
        procesadas = _recalcular_inicial(conn)
        conn.commit()
        print(f"Oportunidades procesadas: {procesadas}")

        print("\n" + "=" * 60)
        print("Migración completada.")
        print("=" * 60)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
