"""
Migración CRM – Seed inicial
Lee terceros existentes (proveedores y clientes) y crea entradas en crm_empresas.

Lógica:
  1. Lee todos los terceros con es_proveedor=1 → crm_empresas tipo='proveedor'
  2. Lee todos los terceros con es_cliente=1  → crm_empresas tipo='cliente'
  3. Si un tercero tiene es_proveedor=1 AND es_cliente=1 → tipo='ambos'
  4. Si ya existe una crm_empresa con el mismo tercero_id → skip (idempotente)
  5. NO crea contactos (eso será manual)
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DATOS_DIR = BASE_DIR / "data"
GESTION_DB = DATOS_DIR / "gestion.db"


def now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def conectar() -> sqlite3.Connection:
    DATOS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(GESTION_DB))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def main() -> None:
    print(f"Base de datos: {GESTION_DB}")
    if not GESTION_DB.exists():
        print("ERROR: gestion.db no existe. Ejecuta primero migration_crm.py")
        sys.exit(1)

    conn = conectar()
    try:
        # Verificar que las tablas CRM existen
        tablas = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        if "crm_empresas" not in tablas:
            print("ERROR: tabla crm_empresas no existe. Ejecuta primero migration_crm.py")
            sys.exit(1)
        if "terceros" not in tablas:
            print("AVISO: tabla terceros no existe. No hay datos para migrar.")
            return

        # Leer todos los terceros
        terceros = conn.execute("""
            SELECT id, nif, nombre_canonico, pais, localidad, direccion,
                   email, telefono, es_cliente, es_proveedor
            FROM terceros
        """).fetchall()

        if not terceros:
            print("No hay terceros en la base de datos. Nada que migrar.")
            return

        print(f"\nTerceros encontrados: {len(terceros)}")

        # Leer crm_empresas existentes para idempotencia
        existentes = {r[0] for r in conn.execute(
            "SELECT tercero_id FROM crm_empresas WHERE tercero_id IS NOT NULL"
        ).fetchall()}

        ahora = now_iso()
        stats = {"proveedor": 0, "cliente": 0, "ambos": 0, "saltados": 0}

        for t in terceros:
            tercero_id = t["id"]
            if tercero_id in existentes:
                stats["saltados"] += 1
                continue

            es_prov = bool(t["es_proveedor"])
            es_cli = bool(t["es_cliente"])

            if es_prov and es_cli:
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
                tercero_id,
                ahora,
            ))
            stats[tipo] = stats.get(tipo, 0) + 1

        conn.commit()

        # Estadísticas finales
        total_migrados = stats["proveedor"] + stats["cliente"] + stats["ambos"]
        total_crm = conn.execute("SELECT COUNT(*) FROM crm_empresas").fetchone()[0]

        print("\n" + "=" * 60)
        print("RESUMEN DE SEED CRM")
        print("=" * 60)
        print(f"\nEmpresas migradas en esta ejecución: {total_migrados}")
        print(f"  - Tipo proveedor:  {stats['proveedor']}")
        print(f"  - Tipo cliente:    {stats['cliente']}")
        print(f"  - Tipo ambos:      {stats['ambos']}")
        print(f"  - Saltadas (ya existían): {stats['saltados']}")
        print(f"\nTotal empresas en crm_empresas: {total_crm}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
