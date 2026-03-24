"""
Migración: Unificar proveedores_transporte → terceros + terceros_transporte_datos + crm_empresas.

PASO 1: ALTER TABLE terceros ADD COLUMN es_transportista
PASO 2: CREATE TABLE terceros_transporte_datos
PASO 3: Migrar 780 registros de proveedores_transporte al sistema unificado

Ejecutar una sola vez. Idempotente (verifica estado antes de actuar).
"""
from __future__ import annotations

import re
import sqlite3
import sys
from difflib import SequenceMatcher
from datetime import datetime
from pathlib import Path

# Asegurar que el proyecto esté en el path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "interfaz_facturas"))

from core.db import conectar as _conectar, now_iso as _now


def _normalizar_nombre(nombre: str | None) -> str:
    if not nombre:
        return ""
    return re.sub(r"[,.\s]+", " ", nombre).strip().lower()


def migrar() -> dict:
    stats = {
        "paso1_columna_creada": False,
        "paso2_tabla_creada": False,
        "paso3_nuevos": 0,
        "paso3_existentes": 0,
        "paso3_con_latlon": 0,
        "paso3_crm_creados": 0,
        "paso3_total_procesados": 0,
        "terceros_total_final": 0,
        "crm_empresas_total_final": 0,
        "terceros_transporte_datos_total": 0,
    }

    with _conectar() as conn:
        # ═══════════════════════════════════════════════════════════════════
        # PASO 1: ALTER TABLE terceros ADD COLUMN es_transportista
        # ═══════════════════════════════════════════════════════════════════
        cols = [r[1] for r in conn.execute("PRAGMA table_info(terceros)").fetchall()]
        if "es_transportista" not in cols:
            conn.execute("ALTER TABLE terceros ADD COLUMN es_transportista INTEGER NOT NULL DEFAULT 0")
            stats["paso1_columna_creada"] = True
            print("[PASO 1] Columna es_transportista añadida a terceros")
        else:
            print("[PASO 1] Columna es_transportista ya existe — skip")

        # Verificar
        cols = [r[1] for r in conn.execute("PRAGMA table_info(terceros)").fetchall()]
        assert "es_transportista" in cols, "ERROR: columna es_transportista no encontrada"
        print(f"[PASO 1] Verificación OK. Columnas terceros: {cols}")

        # ═══════════════════════════════════════════════════════════════════
        # PASO 2: CREATE TABLE terceros_transporte_datos
        # ═══════════════════════════════════════════════════════════════════
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS terceros_transporte_datos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tercero_id INTEGER NOT NULL UNIQUE,
                lat REAL,
                lon REAL,
                provincia TEXT,
                codigo_postal TEXT,
                direccion_completa TEXT,
                web TEXT,
                telefono_fijo TEXT,
                telefono_movil TEXT,
                notas_transporte TEXT,
                created_at TEXT,
                updated_at TEXT,
                FOREIGN KEY (tercero_id) REFERENCES terceros(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS ix_ttd_tercero ON terceros_transporte_datos(tercero_id);
            CREATE INDEX IF NOT EXISTS ix_ttd_lat_lon ON terceros_transporte_datos(lat, lon);
            CREATE INDEX IF NOT EXISTS ix_ttd_provincia ON terceros_transporte_datos(provincia);
            CREATE INDEX IF NOT EXISTS ix_ttd_cp ON terceros_transporte_datos(codigo_postal);
        """)
        stats["paso2_tabla_creada"] = True
        print("[PASO 2] Tabla terceros_transporte_datos creada/verificada")

        # ═══════════════════════════════════════════════════════════════════
        # PASO 3: Migrar 780 transportistas
        # ═══════════════════════════════════════════════════════════════════

        # Verificar si ya se migró (idempotencia)
        ya_migrados = conn.execute(
            "SELECT COUNT(*) FROM terceros_transporte_datos"
        ).fetchone()[0]
        if ya_migrados > 0:
            print(f"[PASO 3] Ya hay {ya_migrados} registros en terceros_transporte_datos — skip migración")
            stats["terceros_total_final"] = conn.execute("SELECT COUNT(*) FROM terceros").fetchone()[0]
            stats["crm_empresas_total_final"] = conn.execute("SELECT COUNT(*) FROM crm_empresas").fetchone()[0]
            stats["terceros_transporte_datos_total"] = ya_migrados
            return stats

        # Cargar todos los proveedores de transporte
        transportistas = conn.execute("SELECT * FROM proveedores_transporte").fetchall()
        print(f"[PASO 3] Procesando {len(transportistas)} transportistas...")

        # Cargar terceros existentes para deduplicación
        terceros_existentes = conn.execute(
            "SELECT id, nombre_canonico FROM terceros"
        ).fetchall()
        # Índice por nombre normalizado
        idx_nombre = {}
        for t in terceros_existentes:
            nn = _normalizar_nombre(t["nombre_canonico"])
            if nn:
                idx_nombre[nn] = t["id"]

        ahora = _now()

        for pt in transportistas:
            nombre = (pt["nombre"] or "").strip()
            if not nombre:
                continue

            nombre_norm = _normalizar_nombre(nombre)
            tercero_id = None
            es_existente = False

            # a) Buscar por nombre exacto normalizado
            if nombre_norm in idx_nombre:
                tercero_id = idx_nombre[nombre_norm]
                es_existente = True
            else:
                # Buscar por similitud >= 95%
                best_score = 0.0
                best_id = None
                for nn, tid in idx_nombre.items():
                    score = SequenceMatcher(None, nombre_norm, nn).ratio()
                    if score > best_score:
                        best_score = score
                        best_id = tid
                if best_score >= 0.95 and best_id is not None:
                    tercero_id = best_id
                    es_existente = True

            if es_existente and tercero_id:
                # Marcar es_transportista=1
                conn.execute(
                    "UPDATE terceros SET es_transportista = 1, es_proveedor = 1, updated_at = ? WHERE id = ?",
                    (ahora, tercero_id),
                )
                stats["paso3_existentes"] += 1
            else:
                # b) Crear nuevo tercero
                # Extraer localidad limpia: el campo localidad original contiene
                # dirección completa tipo "C/ Calle 15, Pol. Ind., 22004, Huesca, Huesca"
                # Intentar extraer la ciudad (penúltimo elemento antes de provincia)
                localidad_raw = (pt["localidad"] or "").strip()
                provincia = (pt["provincia"] or "").strip()
                localidad_limpia = provincia  # fallback a provincia

                if localidad_raw:
                    partes = [p.strip() for p in localidad_raw.split(",") if p.strip()]
                    # Buscar la parte que coincida con la provincia y tomar la anterior
                    for i, parte in enumerate(partes):
                        if parte.lower() == provincia.lower() and i > 0:
                            localidad_limpia = partes[i - 1]
                            # Si parece un CP (4-5 dígitos), tomar el anterior
                            if re.match(r"^\d{4,5}$", localidad_limpia) and i > 1:
                                localidad_limpia = partes[i - 2]
                            break

                conn.execute(
                    """INSERT INTO terceros
                       (nif, nombre_canonico, pais, localidad, direccion, email, telefono,
                        es_cliente, es_proveedor, es_transportista, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)""",
                    (
                        None,  # nif no disponible
                        nombre,
                        "España",
                        localidad_limpia or None,
                        (pt["direccion"] or "").strip() or None,
                        (pt["email"] or "").strip() or None,
                        (pt["telefono"] or "").strip() or None,
                        ahora,
                        ahora,
                    ),
                )
                tercero_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                # Añadir al índice para evitar duplicados dentro del mismo batch
                idx_nombre[nombre_norm] = tercero_id
                stats["paso3_nuevos"] += 1

            # c) INSERT en terceros_transporte_datos
            lat = pt["lat"]
            lon = pt["lon"]
            if lat is not None and lon is not None:
                stats["paso3_con_latlon"] += 1

            # Verificar que no exista ya (por si re-run parcial)
            existe_ttd = conn.execute(
                "SELECT 1 FROM terceros_transporte_datos WHERE tercero_id = ?",
                (tercero_id,),
            ).fetchone()
            if not existe_ttd:
                conn.execute(
                    """INSERT INTO terceros_transporte_datos
                       (tercero_id, lat, lon, provincia, codigo_postal, direccion_completa,
                        web, telefono_fijo, telefono_movil, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        tercero_id,
                        lat,
                        lon,
                        (pt["provincia"] or "").strip() or None,
                        (pt["codigo_postal"] or "").strip() or None,
                        (pt["localidad"] or "").strip() or None,  # localidad original = dirección completa
                        (pt["web"] or "").strip() or None,
                        (pt["telefono_fijo"] or "").strip() or None,
                        (pt["telefono_movil"] or "").strip() or None,
                        ahora,
                        ahora,
                    ),
                )

            # d) Sincronizar con crm_empresas
            crm_existe = conn.execute(
                "SELECT id FROM crm_empresas WHERE tercero_id = ?",
                (tercero_id,),
            ).fetchone()
            if not crm_existe:
                conn.execute(
                    """INSERT INTO crm_empresas
                       (nombre, cif, direccion, localidad, provincia, pais,
                        telefono, email, web, tipo, tercero_id, fecha_creacion, activo)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                    (
                        nombre,
                        None,
                        (pt["direccion"] or "").strip() or None,
                        (pt["localidad"] or "").strip() or None,
                        (pt["provincia"] or "").strip() or None,
                        "España",
                        (pt["telefono"] or "").strip() or None,
                        (pt["email"] or "").strip() or None,
                        (pt["web"] or "").strip() or None,
                        "proveedor",
                        tercero_id,
                        ahora,
                    ),
                )
                stats["paso3_crm_creados"] += 1

            stats["paso3_total_procesados"] += 1

        # Conteos finales
        stats["terceros_total_final"] = conn.execute("SELECT COUNT(*) FROM terceros").fetchone()[0]
        stats["crm_empresas_total_final"] = conn.execute("SELECT COUNT(*) FROM crm_empresas").fetchone()[0]
        stats["terceros_transporte_datos_total"] = conn.execute(
            "SELECT COUNT(*) FROM terceros_transporte_datos"
        ).fetchone()[0]

    return stats


if __name__ == "__main__":
    print("=" * 70)
    print("MIGRACION: Unificar proveedores_transporte -> terceros")
    print("=" * 70)
    stats = migrar()
    print()
    print("=" * 70)
    print("RESULTADOS:")
    print("=" * 70)
    for k, v in stats.items():
        print(f"  {k}: {v}")
