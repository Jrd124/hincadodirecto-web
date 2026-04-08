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

from core.db import conectar as _conectar

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
  "retenciones",
  "anticipos",
  "iva",
  "total_a_pagar",
  "numero_factura",
  "ruta_archivo",
  "hash_archivo",
  "estado_cobro",
]


_initialized = False


def init_facturas_cliente_db() -> None:
  """Crea la tabla facturas_cliente si no existe. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  with _conectar() as conn:
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
    # G.11: migración – añadir estado_cobro si no existe
    cur_info = conn.execute("PRAGMA table_info(facturas_cliente)")
    cols_existentes = {row[1] for row in cur_info.fetchall()}
    if "estado_cobro" not in cols_existentes:
      conn.execute("ALTER TABLE facturas_cliente ADD COLUMN estado_cobro TEXT DEFAULT 'pendiente'")
    if "retenciones" not in cols_existentes:
      try:
        conn.execute("ALTER TABLE facturas_cliente ADD COLUMN retenciones TEXT DEFAULT '0'")
      except Exception:
        pass
    if "anticipos" not in cols_existentes:
      try:
        conn.execute("ALTER TABLE facturas_cliente ADD COLUMN anticipos TEXT DEFAULT '0'")
      except Exception:
        pass
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
  with _conectar() as conn:
    cur = conn.execute(
      "SELECT * FROM facturas_cliente WHERE empresa_id = ? ORDER BY id",
      (empresa_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


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
    try:
      with _conectar() as conn:
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
      resultado["filas_migradas"] += len(filas)
    except Exception as e:
      resultado["errores"].append(f"{empresa_id} insert: {e}")
  return resultado


def get_hashes_empresa_cliente(empresa_id: str) -> set[str]:
  """Devuelve el conjunto de hash_archivo ya existentes para la empresa (evitar duplicados)."""
  init_facturas_cliente_db()
  with _conectar() as conn:
    cur = conn.execute(
      "SELECT hash_archivo FROM facturas_cliente WHERE empresa_id = ? AND hash_archivo IS NOT NULL AND TRIM(COALESCE(hash_archivo, '')) != ''",
      (empresa_id,),
    )
    return {str(row[0]).strip() for row in cur.fetchall() if row[0]}


def insert_factura_cliente(empresa_id: str, factura: dict) -> int:
  """Inserta una factura de cliente. factura debe contener claves de CAMPOS_FACTURAS_CLIENTE. Devuelve el id asignado."""
  init_facturas_cliente_db()
  with _conectar() as conn:
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
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def insert_facturas_clientes(empresa_id: str, filas: list[dict]) -> dict:
  """Inserta varias facturas de cliente. Cada dict debe tener claves de CAMPOS_FACTURAS_CLIENTE.
  Devuelve dict con {"insertados": int, "ids": list[int]}."""
  if not filas:
    return {"insertados": 0, "ids": []}
  init_facturas_cliente_db()
  ids: list[int] = []
  with _conectar() as conn:
    cols = ["empresa_id"] + [c for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id"]
    placeholders = ", ".join("?" * len(cols))
    for fila in filas:
      valores = [empresa_id]
      for c in CAMPOS_FACTURAS_CLIENTE:
        if c == "empresa_id":
          continue
        v = fila.get(c)
        valores.append((v if isinstance(v, str) else str(v or "")).strip())
      cur = conn.execute(
        f"INSERT INTO facturas_cliente ({', '.join(cols)}) VALUES ({placeholders})",
        valores,
      )
      ids.append(cur.lastrowid)
    return {"insertados": len(ids), "ids": ids}


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
  with _conectar() as conn:
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
    # Preserve ruta_archivo, hash_archivo and estado_cobro if not explicitly provided
    _preserve = {"ruta_archivo", "hash_archivo", "estado_cobro"}
    existing = dict(conn.execute("SELECT * FROM facturas_cliente WHERE id = ?", (vid,)).fetchone())
    valores = []
    for c in CAMPOS_FACTURAS_CLIENTE:
      if c == "empresa_id":
        continue
      v = factura.get(c)
      v_str = (v if isinstance(v, str) else str(v or "")).strip()
      if c in _preserve and not v_str:
        v_str = existing.get(c) or ""
      valores.append(v_str)
    conn.execute(
      "UPDATE facturas_cliente SET " + ", ".join(f"{c} = ?" for c in CAMPOS_FACTURAS_CLIENTE if c != "empresa_id") + " WHERE id = ?",
      valores + [vid],
    )
    return True


def update_estado_cobro(factura_id: int, estado: str) -> bool:
  """Actualiza el estado_cobro de una factura de cliente. Devuelve True si se actualizó."""
  init_facturas_cliente_db()
  with _conectar() as conn:
    cur = conn.execute(
      "UPDATE facturas_cliente SET estado_cobro = ? WHERE id = ?",
      (estado, factura_id),
    )
    return cur.rowcount > 0


def get_factura_cliente_por_id(factura_id: int) -> dict | None:
  """Devuelve una factura de cliente por su id, o None."""
  init_facturas_cliente_db()
  with _conectar() as conn:
    cur = conn.execute("SELECT * FROM facturas_cliente WHERE id = ?", (factura_id,))
    row = cur.fetchone()
    if not row:
      return None
    return _row_to_dict(row)


def delete_facturas_cliente_por_indices(empresa_id: str, indices: list[int]) -> int:
  """
  Elimina facturas de cliente por posición en el listado ordenado por id.
  indices: lista de índices 0-based (ej. [0, 2, 5]). Devuelve número de filas eliminadas.
  """
  if not indices:
    return 0
  indices_set = set(int(i) for i in indices if isinstance(i, (int, float)))
  init_facturas_cliente_db()
  with _conectar() as conn:
    cur = conn.execute("SELECT id FROM facturas_cliente WHERE empresa_id = ? ORDER BY id", (empresa_id,))
    ids_ordenados = [r[0] for r in cur.fetchall()]
    ids_a_borrar = [ids_ordenados[i] for i in indices_set if 0 <= i < len(ids_ordenados)]
    if not ids_a_borrar:
      return 0
    placeholders = ",".join("?" * len(ids_a_borrar))
    cur = conn.execute(f"DELETE FROM facturas_cliente WHERE id IN ({placeholders})", ids_a_borrar)
    return cur.rowcount


def recalcular_todos_estados_cobro() -> dict:
  """Recalcula estado_cobro de TODAS las facturas de cliente basándose en cobros conciliados.

  Para cada factura:
  - Suma cobros directos (movimientos.db WHERE factura_cliente_id = X)
  - Suma cobros por clave compuesta (movimientos.db WHERE factura_cliente_key = clave, legacy)
  - Suma cobros múltiples (conciliacion_multiple WHERE factura_cliente_id = X)
  - Compara con total_a_pagar: cobrado >= total - 1€ → 'cobrada', cobrado > 0 → 'parcial', else 'pendiente'
  - Actualiza SOLO si el estado calculado difiere del actual

  Returns {"actualizadas": int, "detalle": [...]}.
  """
  import sqlite3
  from config import MOVIMIENTOS_DB
  from routes.helpers import _parse_importe_es

  init_facturas_cliente_db()

  # 1. Build cobrado map by factura_cliente_id from movimientos.db
  cobrado_by_id = {}
  cobrado_by_key = {}
  try:
    conn_b = sqlite3.connect(str(MOVIMIENTOS_DB))
    conn_b.row_factory = sqlite3.Row
    # By ID (modern conciliation)
    for row in conn_b.execute(
      "SELECT factura_cliente_id, SUM(ABS(CAST(importe AS REAL))) as t"
      " FROM movimientos WHERE factura_cliente_id IS NOT NULL AND factura_cliente_id > 0"
      " AND conciliado_at IS NOT NULL GROUP BY factura_cliente_id"
    ).fetchall():
      cobrado_by_id[row["factura_cliente_id"]] = float(row["t"] or 0)
    # By key (legacy conciliation — factura_cliente_key set but factura_cliente_id may be NULL)
    for row in conn_b.execute(
      "SELECT factura_cliente_key, SUM(ABS(CAST(importe AS REAL))) as t"
      " FROM movimientos WHERE factura_cliente_key IS NOT NULL AND factura_cliente_key != 'MULTI'"
      " AND conciliado_at IS NOT NULL AND (factura_cliente_id IS NULL OR factura_cliente_id <= 0)"
      " GROUP BY factura_cliente_key"
    ).fetchall():
      cobrado_by_key[row["factura_cliente_key"]] = float(row["t"] or 0)
    conn_b.close()
  except Exception:
    pass

  # 2. Conciliacion_multiple from gestion.db
  cobrado_multi = {}
  with _conectar() as conn:
    try:
      for row in conn.execute(
        "SELECT factura_cliente_id, SUM(importe_aplicado) as t"
        " FROM conciliacion_multiple GROUP BY factura_cliente_id"
      ).fetchall():
        cobrado_multi[row["factura_cliente_id"]] = float(row["t"] or 0)
    except Exception:
      pass

  # 3. Recalculate every invoice
  actualizadas = 0
  detalle = []
  with _conectar() as conn:
    facturas = conn.execute(
      "SELECT id, numero_factura, fecha_factura, cliente, total_a_pagar, estado_cobro FROM facturas_cliente"
    ).fetchall()
    for f in facturas:
      fid = f["id"]
      total = _parse_importe_es(f["total_a_pagar"])
      # Sum all sources of payment
      cobrado = cobrado_by_id.get(fid, 0)
      # Legacy key-based lookup
      num = (f["numero_factura"] or "").strip()
      fecha = (f["fecha_factura"] or "").strip()[:10]
      cli = (f["cliente"] or "").strip()
      key = f"{num}|{fecha}|{cli}"
      cobrado += cobrado_by_key.get(key, 0)
      # Multi conciliation
      cobrado += cobrado_multi.get(fid, 0)

      old = (f["estado_cobro"] or "").strip().lower()

      if total > 0 and cobrado >= total - 1.0:
        new = "cobrada"
      elif cobrado > 0.01:
        new = "parcial"
      else:
        new = "pendiente"

      # Update if different
      if new != old:
        conn.execute("UPDATE facturas_cliente SET estado_cobro = ? WHERE id = ?", (new, fid))
        actualizadas += 1
        detalle.append({"id": fid, "numero_factura": num, "cliente": cli, "old": old or "(empty)", "new": new, "cobrado": round(cobrado, 2), "total": round(total, 2)})

  return {"actualizadas": actualizadas, "detalle": detalle}
