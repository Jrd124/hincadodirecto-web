"""
Script único de migración: lee proveedores de transporte desde
data/proveedores_transporte.xlsx (o .csv) e inserta en la tabla
proveedores_transporte de gestion.db.

Ejecutar desde la raíz del proyecto (cursor_test):
  python scripts/migrar_proveedores_transporte_a_sqlite.py

O desde interfaz_facturas:
  cd interfaz_facturas && python -c "from pathlib import Path; import sys; sys.path.insert(0, '.'); from config import BASE_DIR; from core.proveedores_transporte_db import migrar_desde_archivos; n = migrar_desde_archivos(BASE_DIR); print('Insertados:', n)"
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ejecutar con interfaz_facturas como raíz para que "core" resuelva a interfaz_facturas.core
_root = Path(__file__).resolve().parents[1]
_if = _root / "interfaz_facturas"
if str(_if) not in sys.path:
  sys.path.insert(0, str(_if))

from config import BASE_DIR
from core.proveedores_transporte_db import migrar_desde_archivos


def main() -> None:
  n = migrar_desde_archivos(BASE_DIR)
  if n == 0:
    # Comprobar si fue porque ya hay datos o porque no había filas en el archivo
    from core.proveedores_transporte_db import init_proveedores_transporte_db
    from core.db import conectar
    init_proveedores_transporte_db()
    with conectar() as c:
      count = c.execute("SELECT COUNT(*) FROM proveedores_transporte").fetchone()[0]
    if count > 0:
      print("La tabla proveedores_transporte ya tiene datos. No se ha insertado nada para evitar duplicados.")
    else:
      print("No se encontraron proveedores en data/proveedores_transporte.xlsx (ni .csv).")
  else:
    print(f"Migración correcta: {n} proveedores insertados en gestion.db (tabla proveedores_transporte).")


if __name__ == "__main__":
  main()
