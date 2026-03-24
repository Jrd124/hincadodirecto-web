"""Migracion: Añadir campos de vencimiento a facturas + tabla condiciones de pago."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "interfaz_facturas"))

from core.db import conectar as _conectar


def migrar() -> dict:
    stats = {"prov_actualizadas": 0, "cli_actualizadas": 0}
    with _conectar() as conn:
        # Add columns to facturas_proveedor
        cols = [r[1] for r in conn.execute("PRAGMA table_info(facturas_proveedor)").fetchall()]
        if "fecha_vencimiento" not in cols:
            conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN fecha_vencimiento TEXT")
            print("[OK] facturas_proveedor: fecha_vencimiento added")
        if "dias_pago" not in cols:
            conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN dias_pago INTEGER DEFAULT 30")
            print("[OK] facturas_proveedor: dias_pago added")

        # Add columns to facturas_cliente
        cols2 = [r[1] for r in conn.execute("PRAGMA table_info(facturas_cliente)").fetchall()]
        if "fecha_vencimiento" not in cols2:
            conn.execute("ALTER TABLE facturas_cliente ADD COLUMN fecha_vencimiento TEXT")
            print("[OK] facturas_cliente: fecha_vencimiento added")
        if "dias_cobro" not in cols2:
            conn.execute("ALTER TABLE facturas_cliente ADD COLUMN dias_cobro INTEGER DEFAULT 30")
            print("[OK] facturas_cliente: dias_cobro added")

        # Create condiciones de pago table
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tesoreria_condiciones_pago (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tercero_id INTEGER NOT NULL UNIQUE,
                dias_pago INTEGER NOT NULL DEFAULT 30,
                notas TEXT,
                FOREIGN KEY (tercero_id) REFERENCES terceros(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS ix_tcp_tercero ON tesoreria_condiciones_pago(tercero_id);
        """)
        print("[OK] tesoreria_condiciones_pago table created")

        # Calculate fecha_vencimiento for pending facturas_proveedor
        n = conn.execute("""
            UPDATE facturas_proveedor SET
                fecha_vencimiento = date(fecha_factura, '+' || COALESCE(dias_pago, 30) || ' days')
            WHERE fecha_vencimiento IS NULL
              AND fecha_factura IS NOT NULL AND fecha_factura != ''
              AND (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
        """).rowcount
        stats["prov_actualizadas"] = n
        print(f"[OK] {n} facturas_proveedor: fecha_vencimiento calculated")

        # Calculate fecha_vencimiento for pending facturas_cliente
        n2 = conn.execute("""
            UPDATE facturas_cliente SET
                fecha_vencimiento = date(fecha_factura, '+' || COALESCE(dias_cobro, 30) || ' days')
            WHERE fecha_vencimiento IS NULL
              AND fecha_factura IS NOT NULL AND fecha_factura != ''
              AND (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
        """).rowcount
        stats["cli_actualizadas"] = n2
        print(f"[OK] {n2} facturas_cliente: fecha_vencimiento calculated")

    return stats


if __name__ == "__main__":
    print("=" * 50)
    print("MIGRACION: Tesoreria")
    print("=" * 50)
    stats = migrar()
    print(f"\nResultado: {stats}")
