"""
Facturas de proveedores en SQLite (gestion.db).
Migración desde base_maestra_facturas.csv por empresa.
"""
from __future__ import annotations

import csv
import logging
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

try:
  from config import EMPRESAS_DIR, EMPRESAS_CLIENTE
except ImportError:
  from interfaz_facturas.config import EMPRESAS_DIR, EMPRESAS_CLIENTE

from core.db import get_conn as _get_conn

# Columnas equivalentes al CSV base_maestra_facturas (sin id).
# Nota: 'tarjeta_id' y 'liquidacion_periodo' son opcionales (solo en BD).
# liquidacion_periodo: YYYY-MM; si vacío, se usa el mes de fecha_factura para el extracto.
CAMPOS_FACTURAS_PROVEEDOR = [
  "empresa_id", "fecha_factura", "proveedor", "nif_proveedor", "pais_proveedor",
  "localidad_proveedor", "resumen_concepto", "numero_factura", "base_imponible",
  "base_imponible_detalle", "iva", "iva_cuota_detalle", "retenciones_total",
  "retenciones_detalle", "total_factura", "total_a_pagar", "total", "categoria",
  "ruta_archivo", "ruta_destino", "hash_archivo", "flag_error", "motivo_error", "comentarios_revision",
  "extraccion_vision", "estado_pago", "tarjeta_id", "liquidacion_periodo",
]


_initialized = False


def init_facturas_db() -> None:
  """Crea la tabla facturas_proveedor si no existe. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  conn = _get_conn()
  try:
    columnas_sql = [
      "id INTEGER PRIMARY KEY AUTOINCREMENT",
      "empresa_id TEXT NOT NULL",
      "fecha_factura TEXT",
      "proveedor TEXT",
      "nif_proveedor TEXT",
      "pais_proveedor TEXT",
      "localidad_proveedor TEXT",
      "resumen_concepto TEXT",
      "numero_factura TEXT",
      "base_imponible TEXT",
      "base_imponible_detalle TEXT",
      "iva TEXT",
      "iva_cuota_detalle TEXT",
      "retenciones_total TEXT",
      "retenciones_detalle TEXT",
      "total_factura TEXT",
      "total_a_pagar TEXT",
      "total TEXT",
      "categoria TEXT",
      "ruta_archivo TEXT",
      "ruta_destino TEXT",
      "hash_archivo TEXT",
      "flag_error INTEGER NOT NULL DEFAULT 0",
      "motivo_error TEXT",
      "comentarios_revision TEXT",
      "extraccion_vision TEXT",
      "estado_pago TEXT",
      "tarjeta_id INTEGER",
      "liquidacion_periodo TEXT",
    ]
    conn.execute(
      "CREATE TABLE IF NOT EXISTS facturas_proveedor (\n  " + ",\n  ".join(columnas_sql) + "\n)"
    )
    # Migración suave: añadir columna tarjeta_id si falta en instalaciones existentes.
    cur = conn.execute("PRAGMA table_info(facturas_proveedor)")
    cols_existentes = {row[1] for row in cur.fetchall()}
    if "tarjeta_id" not in cols_existentes:
      conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN tarjeta_id INTEGER")
    if "liquidacion_periodo" not in cols_existentes:
      conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN liquidacion_periodo TEXT")
    if "hash_archivo" not in cols_existentes:
      conn.execute("ALTER TABLE facturas_proveedor ADD COLUMN hash_archivo TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_facturas_proveedor_empresa ON facturas_proveedor(empresa_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_facturas_proveedor_ruta ON facturas_proveedor(empresa_id, ruta_destino)")
    conn.commit()
  finally:
    conn.close()
  _initialized = True


def _row_to_dict(row: sqlite3.Row) -> dict:
  d = dict(row)
  if "flag_error" in d and d["flag_error"] is not None:
    d["flag_error"] = bool(d["flag_error"])
  if not d.get("estado_pago") or d.get("estado_pago") not in ("pendiente", "pagada", "parcial"):
    d["estado_pago"] = "pendiente"
  if "tarjeta_id" in d and d["tarjeta_id"] is not None and d["tarjeta_id"] != "":
    try:
      d["tarjeta_id"] = int(d["tarjeta_id"])
    except Exception as e:
      logger.debug("tarjeta_id no convertible a int: %s", e)
      d["tarjeta_id"] = None
  return d


def get_facturas_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve todas las facturas de la empresa desde SQLite.
  Cada dict incluye 'id' y el resto de columnas (flag_error como bool).
  """
  init_facturas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT * FROM facturas_proveedor WHERE empresa_id = ? ORDER BY id",
      (empresa_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]
  finally:
    conn.close()


def hay_facturas_en_bd(empresa_id: str) -> bool:
  """True si hay al menos una factura en SQLite para esta empresa."""
  init_facturas_db()
  conn = _get_conn()
  try:
    r = conn.execute(
      "SELECT 1 FROM facturas_proveedor WHERE empresa_id = ? LIMIT 1",
      (empresa_id,),
    ).fetchone()
    return r is not None
  finally:
    conn.close()


def update_factura(empresa_id: str, factura: dict) -> bool:
  """
  Actualiza una factura identificada por ruta_destino o ruta_archivo.
  factura debe contener las claves de CAMPOS_FACTURAS_PROVEEDOR.
  Devuelve True si se actualizó alguna fila.
  """
  init_facturas_db()
  ruta_dest = (factura.get("ruta_destino") or "").strip()
  ruta_arch = (factura.get("ruta_archivo") or "").strip()
  if not ruta_dest and not ruta_arch:
    return False
  conn = _get_conn()
  try:
    cur = conn.execute(
      """SELECT id FROM facturas_proveedor
         WHERE empresa_id = ? AND (ruta_destino = ? OR ruta_archivo = ? OR ruta_destino = ? OR ruta_archivo = ?)
         LIMIT 1""",
      (empresa_id, ruta_dest, ruta_arch, ruta_arch, ruta_dest),
    )
    row = cur.fetchone()
    if not row:
      return False
    valores = []
    for c in CAMPOS_FACTURAS_PROVEEDOR:
      v = factura.get(c)
      if c == "flag_error":
        valores.append(1 if v else 0)
      else:
        valores.append((v if isinstance(v, str) else str(v or "")).strip())
    conn.execute(
      "UPDATE facturas_proveedor SET " + ", ".join(f"{c} = ?" for c in CAMPOS_FACTURAS_PROVEEDOR) + " WHERE id = ?",
      valores + [row["id"]],
    )
    conn.commit()
    return True
  finally:
    conn.close()


def update_facturas_proveedor_nombre_nif(
  empresa_id: str, old_proveedor: str, old_nif: str, new_proveedor: str, new_nif: str,
) -> int:
  """
  Actualiza proveedor y nif_proveedor en todas las facturas de la empresa que tengan
  el nombre y NIF antiguos. Devuelve el número de filas actualizadas.
  """
  if not (old_proveedor or old_nif):
    return 0
  init_facturas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      """UPDATE facturas_proveedor SET proveedor = ?, nif_proveedor = ?
         WHERE empresa_id = ? AND TRIM(COALESCE(proveedor, '')) = ? AND TRIM(COALESCE(nif_proveedor, '')) = ?""",
      (new_proveedor.strip(), new_nif.strip(), empresa_id, old_proveedor.strip(), old_nif.strip()),
    )
    n = cur.rowcount
    conn.commit()
    return n
  finally:
    conn.close()


def delete_facturas(empresa_id: str, rutas: list[str]) -> int:
  """
  Elimina las facturas cuya ruta_destino o ruta_archivo está en rutas.
  Devuelve el número de filas eliminadas.
  """
  if not rutas:
    return 0
  init_facturas_db()
  rutas_set = set(r.strip() for r in rutas if isinstance(r, str) and r.strip())
  if not rutas_set:
    return 0
  conn = _get_conn()
  try:
    placeholders = ",".join("?" * len(rutas_set))
    cur = conn.execute(
      f"""DELETE FROM facturas_proveedor
          WHERE empresa_id = ? AND (ruta_destino IN ({placeholders}) OR ruta_archivo IN ({placeholders}))""",
      (empresa_id,) + tuple(rutas_set) + tuple(rutas_set),
    )
    n = cur.rowcount
    conn.commit()
    return n
  finally:
    conn.close()


def get_hashes_empresa_proveedor(empresa_id: str) -> set[str]:
  """Devuelve el conjunto de hash_archivo ya existentes para la empresa (para evitar duplicados)."""
  init_facturas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT hash_archivo FROM facturas_proveedor WHERE empresa_id = ? AND hash_archivo IS NOT NULL AND hash_archivo != ''",
      (empresa_id,),
    )
    return {str(row[0]).strip() for row in cur.fetchall() if row[0]}
  finally:
    conn.close()


def get_claves_facturas_proveedor(empresa_id: str) -> list[tuple[str, str, str]]:
  """
  Devuelve la lista de (numero_factura, proveedor, fecha_factura) ya existentes para la empresa.
  Sirve para detectar duplicados por identidad lógica (mismo número, proveedor y fecha).
  """
  init_facturas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT numero_factura, proveedor, fecha_factura FROM facturas_proveedor WHERE empresa_id = ?",
      (empresa_id,),
    )
    return [(str(r[0] or "").strip(), str(r[1] or "").strip(), str(r[2] or "").strip()) for r in cur.fetchall()]
  finally:
    conn.close()


def insert_facturas(empresa_id: str, filas: list[dict]) -> int:
  """
  Inserta nuevas facturas para la empresa. Cada dict debe tener las claves de CAMPOS_FACTURAS_PROVEEDOR.
  Devuelve el número de filas insertadas.
  """
  if not filas:
    return 0
  init_facturas_db()
  conn = _get_conn()
  try:
    cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_PROVEEDOR if c != "empresa_id"]
    placeholders = ", ".join("?" * len(cols))
    insertados = 0
    for fila in filas:
      valores = [empresa_id]
      for c in CAMPOS_FACTURAS_PROVEEDOR:
        if c == "empresa_id":
          continue
        v = fila.get(c)
        if c == "flag_error":
          valores.append(1 if v else 0)
        else:
          valores.append((v if isinstance(v, str) else str(v or "")).strip())
      conn.execute(
        f"INSERT INTO facturas_proveedor ({', '.join(cols)}) VALUES ({placeholders})",
        valores,
      )
      insertados += 1
    conn.commit()
    return insertados
  finally:
    conn.close()


def migrar_desde_csv() -> dict[str, Any]:
  """
  Copia todos los base_maestra_facturas.csv a la tabla facturas_proveedor.
  Por empresa: se reemplazan filas (DELETE + INSERT) para ser idempotente.
  Devuelve { "empresas_procesadas": int, "filas_migradas": int, "errores": list }.
  """
  init_facturas_db()
  resultado: dict[str, Any] = {
    "empresas_procesadas": 0,
    "filas_migradas": 0,
    "errores": [],
  }
  empresas = list(EMPRESAS_CLIENTE.keys()) if EMPRESAS_CLIENTE else []
  if not empresas:
    for d in EMPRESAS_DIR.iterdir():
      if d.is_dir() and (d / "base_maestra_facturas.csv").exists():
        empresas.append(d.name)
  for empresa_id in empresas:
    ruta_csv: Path = EMPRESAS_DIR / empresa_id / "base_maestra_facturas.csv"
    if not ruta_csv.exists():
      continue
    filas: list[dict] = []
    try:
      with ruta_csv.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, fieldnames=CAMPOS_FACTURAS_PROVEEDOR)
        for row in reader:
          if (row.get("empresa_id") or "").strip() == "empresa_id":
            continue
          limpio = {k: (v or "").strip() for k, v in row.items() if k is not None}
          if not limpio.get("estado_pago") or limpio["estado_pago"] not in ("pendiente", "pagada", "parcial"):
            limpio["estado_pago"] = "pendiente"
          if not limpio.get("ruta_destino") and not limpio.get("ruta_archivo"):
            for key in ("ruta_destino", "ruta_archivo", "total_a_pagar", "total_factura", "motivo_error", "comentarios_revision"):
              val = limpio.get(key) or ""
              if "Facturas Recibidas" in val or (len(val) > 4 and ("\\" in val or (len(val) > 1 and val[1] == ":"))):
                limpio["ruta_destino"] = val
                break
          filas.append(limpio)
    except Exception as e:
      resultado["errores"].append(f"{empresa_id} lectura CSV: {e}")
      continue
    resultado["empresas_procesadas"] += 1
    if not filas:
      continue
    conn = _get_conn()
    try:
      conn.execute("DELETE FROM facturas_proveedor WHERE empresa_id = ?", (empresa_id,))
      for fila in filas:
        valores = [empresa_id]
        for c in CAMPOS_FACTURAS_PROVEEDOR:
          if c == "empresa_id":
            continue
          v = fila.get(c)
          if c == "flag_error":
            if isinstance(v, bool):
              valores.append(1 if v else 0)
            else:
              valores.append(1 if str(v or "").strip().lower() in ("true", "1") else 0)
          else:
            valores.append((v if isinstance(v, str) else str(v or "")).strip())
        cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_PROVEEDOR if c != "empresa_id"]
        placeholders = ", ".join("?" * len(cols))
        conn.execute(
          f"INSERT INTO facturas_proveedor ({', '.join(cols)}) VALUES ({placeholders})",
          valores,
        )
      conn.commit()
      resultado["filas_migradas"] += len(filas)
    except Exception as e:
      resultado["errores"].append(f"{empresa_id} insert: {e}")
    finally:
      conn.close()
  return resultado
