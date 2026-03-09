"""
Facturas de clientes (emitidas) en SQLite (gestion.db).
Migración desde facturas_clientes.csv por empresa (Parte J del plan maestro).
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

# Columnas equivalentes al CSV facturas_clientes (sin id).
# Debe coincidir con CAMPOS_FACTURAS_CLIENTES del backend para compatibilidad.
CAMPOS_FACTURAS_CLIENTE = [
  "empresa_id",
  "fecha_factura",
  "cliente",
  "cif_nif",
  "pais",
  "localidad",
  "proyecto",
  "tipologia",
  "num_hincadoras",
  "num_ayudantes",
  "pricing_servicio",
  "pricing_transporte",
  "iva",
  "total_a_pagar",
  "numero_factura",
  "ruta_archivo",
  "hash_archivo",
]


_initialized = False


def init_facturas_cliente_db() -> None:
  """Crea la tabla facturas_cliente si no existe. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  conn = _get_conn()
  try:
    columnas_sql = [
      "id INTEGER PRIMARY KEY AUTOINCREMENT",
      "empresa_id TEXT NOT NULL",
      "fecha_factura TEXT",
      "cliente TEXT",
      "cif_nif TEXT",
      "pais TEXT",
      "localidad TEXT",
      "proyecto TEXT",
      "tipologia TEXT",
      "num_hincadoras TEXT",
      "num_ayudantes TEXT",
      "pricing_servicio TEXT",
      "pricing_transporte TEXT",
      "iva TEXT",
      "total_a_pagar TEXT",
      "numero_factura TEXT",
      "ruta_archivo TEXT",
      "hash_archivo TEXT",
    ]
    conn.execute(
      "CREATE TABLE IF NOT EXISTS facturas_cliente (\n  " + ",\n  ".join(columnas_sql) + "\n)"
    )
    conn.execute(
      "CREATE INDEX IF NOT EXISTS ix_facturas_cliente_empresa ON facturas_cliente(empresa_id)"
    )
    conn.execute(
      "CREATE INDEX IF NOT EXISTS ix_facturas_cliente_empresa_ruta ON facturas_cliente(empresa_id, ruta_archivo)"
    )
    conn.commit()
  finally:
    conn.close()
  _initialized = True


def _row_to_dict(row: sqlite3.Row) -> dict:
  """Convierte una fila SQLite en dict con las claves de CAMPOS_FACTURAS_CLIENTE (y id si existe)."""
  d = dict(row)
  out = {}
  for k in CAMPOS_FACTURAS_CLIENTE:
    v = d.get(k)
    out[k] = (v if isinstance(v, str) else str(v or "")).strip()
  if "id" in d and d["id"] is not None:
    out["id"] = int(d["id"])
  return out


def get_facturas_cliente_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve todas las facturas de clientes de la empresa desde SQLite.
  Cada dict tiene las claves de CAMPOS_FACTURAS_CLIENTE (y opcionalmente 'id').
  Mismo contrato que la lectura desde CSV para no romper listados, export y clientes únicos.
  """
  init_facturas_cliente_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT * FROM facturas_cliente WHERE empresa_id = ? ORDER BY id",
      (empresa_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]
  finally:
    conn.close()


def migrar_desde_csv_clientes() -> dict[str, Any]:
  """
  Copia todos los facturas_clientes.csv a la tabla facturas_cliente.
  Por empresa: se reemplazan filas (DELETE + INSERT) para ser idempotente.
  Devuelve { "empresas_procesadas": int, "filas_migradas": int, "errores": list }.
  Tras ejecutar esta migración (p. ej. vía POST /api/facturas_clientes/migrar-desde-csv),
  la fuente de verdad es la BD; los CSV pueden conservarse como respaldo histórico.
  """
  init_facturas_cliente_db()
  resultado: dict[str, Any] = {
    "empresas_procesadas": 0,
    "filas_migradas": 0,
    "errores": [],
  }
  empresas = list(EMPRESAS_CLIENTE.keys()) if EMPRESAS_CLIENTE else []
  if not empresas:
    for d in EMPRESAS_DIR.iterdir():
      if d.is_dir() and (d / "facturas_clientes.csv").exists():
        empresas.append(d.name)
  for empresa_id in empresas:
    ruta_csv: Path = EMPRESAS_DIR / empresa_id / "facturas_clientes.csv"
    if not ruta_csv.exists():
      continue
    filas: list[dict] = []
    try:
      with ruta_csv.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, fieldnames=CAMPOS_FACTURAS_CLIENTE)
        for row in reader:
          if (row.get("empresa_id") or "").strip() == "empresa_id":
            continue
          limpio = {k: (row.get(k) or "").strip() for k in CAMPOS_FACTURAS_CLIENTE}
          filas.append(limpio)
    except Exception as e:
      resultado["errores"].append(f"{empresa_id} lectura CSV: {e}")
      continue
    resultado["empresas_procesadas"] += 1
    if not filas:
      continue
    conn = _get_conn()
    try:
      conn.execute("DELETE FROM facturas_cliente WHERE empresa_id = ?", (empresa_id,))
      cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id"]
      placeholders = ", ".join("?" * len(cols))
      for fila in filas:
        valores = [empresa_id]
        for c in CAMPOS_FACTURAS_CLIENTE:
          if c == "empresa_id":
            continue
          v = fila.get(c)
          valores.append((v if isinstance(v, str) else str(v or "")).strip())
        conn.execute(
          f"INSERT INTO facturas_cliente ({', '.join(cols)}) VALUES ({placeholders})",
          valores,
        )
      conn.commit()
      resultado["filas_migradas"] += len(filas)
    except Exception as e:
      resultado["errores"].append(f"{empresa_id} insert: {e}")
    finally:
      conn.close()
  return resultado


def get_hashes_empresa_cliente(empresa_id: str) -> set[str]:
  """Devuelve el conjunto de hash_archivo ya existentes para la empresa (evitar duplicados)."""
  init_facturas_cliente_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT hash_archivo FROM facturas_cliente WHERE empresa_id = ? AND hash_archivo IS NOT NULL AND TRIM(COALESCE(hash_archivo, '')) != ''",
      (empresa_id,),
    )
    return {str(row[0]).strip() for row in cur.fetchall() if row[0]}
  finally:
    conn.close()


def insert_factura_cliente(empresa_id: str, factura: dict) -> int:
  """Inserta una factura de cliente. factura debe contener claves de CAMPOS_FACTURAS_CLIENTE. Devuelve el id asignado."""
  init_facturas_cliente_db()
  conn = _get_conn()
  try:
    cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id"]
    placeholders = ", ".join("?" * len(cols))
    valores = [empresa_id]
    for c in CAMPOS_FACTURAS_CLIENTE:
      if c == "empresa_id":
        continue
      v = factura.get(c)
      valores.append((v if isinstance(v, str) else str(v or "")).strip())
    conn.execute(
      f"INSERT INTO facturas_cliente ({', '.join(cols)}) VALUES ({placeholders})",
      valores,
    )
    conn.commit()
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]
  finally:
    conn.close()


def insert_facturas_clientes(empresa_id: str, filas: list[dict]) -> int:
  """Inserta varias facturas de cliente. Cada dict debe tener claves de CAMPOS_FACTURAS_CLIENTE. Devuelve número de filas insertadas."""
  if not filas:
    return 0
  init_facturas_cliente_db()
  conn = _get_conn()
  try:
    cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id"]
    placeholders = ", ".join("?" * len(cols))
    insertados = 0
    for fila in filas:
      valores = [empresa_id]
      for c in CAMPOS_FACTURAS_CLIENTE:
        if c == "empresa_id":
          continue
        v = fila.get(c)
        valores.append((v if isinstance(v, str) else str(v or "")).strip())
      conn.execute(
        f"INSERT INTO facturas_cliente ({', '.join(cols)}) VALUES ({placeholders})",
        valores,
      )
      insertados += 1
    conn.commit()
    return insertados
  finally:
    conn.close()


def update_factura_cliente(empresa_id: str, factura: dict, clave_original: dict) -> bool:
  """
  Actualiza una factura de cliente identificada por clave_original (numero_factura, fecha_factura, cliente).
  factura contiene los nuevos valores (solo se usan claves de CAMPOS_FACTURAS_CLIENTE).
  Devuelve True si se actualizó alguna fila.
  """
  init_facturas_cliente_db()
  id_num = (clave_original.get("numero_factura") or factura.get("numero_factura") or "").strip()
  id_fecha = (clave_original.get("fecha_factura") or factura.get("fecha_factura") or "").strip()
  id_cliente = (clave_original.get("cliente") or factura.get("cliente") or "").strip()
  conn = _get_conn()
  try:
    cur = conn.execute(
      """SELECT id FROM facturas_cliente WHERE empresa_id = ?
         AND (? = '' OR numero_factura = ?) AND (? = '' OR fecha_factura = ?) AND (? = '' OR cliente = ?)
         LIMIT 1""",
      (empresa_id, id_num, id_num, id_fecha, id_fecha, id_cliente, id_cliente),
    )
    row = cur.fetchone()
    if not row:
      return False
    vid = row[0]
    valores = []
    for c in CAMPOS_FACTURAS_CLIENTE:
      if c == "empresa_id":
        continue
      v = factura.get(c)
      valores.append((v if isinstance(v, str) else str(v or "")).strip())
    conn.execute(
      "UPDATE facturas_cliente SET " + ", ".join(f"{c} = ?" for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id") + " WHERE id = ?",
      valores + [vid],
    )
    conn.commit()
    return True
  finally:
    conn.close()


def delete_facturas_cliente_por_indices(empresa_id: str, indices: list[int]) -> int:
  """
  Elimina facturas de cliente por posición en el listado ordenado por id.
  indices: lista de índices 0-based (ej. [0, 2, 5]). Devuelve número de filas eliminadas.
  """
  if not indices:
    return 0
  indices_set = set(int(i) for i in indices if isinstance(i, (int, float)))
  init_facturas_cliente_db()
  conn = _get_conn()
  try:
    cur = conn.execute("SELECT id FROM facturas_cliente WHERE empresa_id = ? ORDER BY id", (empresa_id,))
    ids_ordenados = [r[0] for r in cur.fetchall()]
    ids_a_borrar = [ids_ordenados[i] for i in indices_set if 0 <= i < len(ids_ordenados)]
    if not ids_a_borrar:
      return 0
    placeholders = ",".join("?" * len(ids_a_borrar))
    cur = conn.execute(f"DELETE FROM facturas_cliente WHERE id IN ({placeholders})", ids_a_borrar)
    conn.commit()
    return cur.rowcount
  finally:
    conn.close()
