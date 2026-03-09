"""
Modelo de terceros (clientes y proveedores) en SQLite.
Esquema: terceros (entidad global) + empresa_tercero (relación por empresa).
Migración desde proveedores_maestros.csv y lectura unificada para la API.
"""
from __future__ import annotations

import csv
import logging
import sqlite3
from datetime import datetime

logger = logging.getLogger(__name__)
from pathlib import Path
from typing import Any

# Importación según contexto (backend corre desde interfaz_facturas)
try:
  from config import GESTION_DB, EMPRESAS_DIR, EMPRESAS_CLIENTE
  from config import PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS
except ImportError:
  from interfaz_facturas.config import GESTION_DB, EMPRESAS_DIR, EMPRESAS_CLIENTE
  from interfaz_facturas.config import PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS


def _get_conn() -> sqlite3.Connection:
  GESTION_DB.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(str(GESTION_DB))
  conn.row_factory = sqlite3.Row
  return conn


def init_terceros_db() -> None:
  """Crea las tablas terceros y empresa_tercero si no existen."""
  conn = _get_conn()
  try:
    conn.executescript("""
      CREATE TABLE IF NOT EXISTS terceros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nif TEXT,
        nombre_canonico TEXT NOT NULL,
        pais TEXT,
        localidad TEXT,
        direccion TEXT,
        email TEXT,
        telefono TEXT,
        es_cliente INTEGER NOT NULL DEFAULT 0,
        es_proveedor INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_terceros_nif ON terceros(nif);
      CREATE INDEX IF NOT EXISTS ix_terceros_nombre ON terceros(nombre_canonico);

      CREATE TABLE IF NOT EXISTS empresa_tercero (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id TEXT NOT NULL,
        tercero_id INTEGER NOT NULL,
        alias_local TEXT,
        condiciones_pago TEXT,
        iban_principal TEXT,
        centro_coste TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        es_proveedor INTEGER NOT NULL DEFAULT 1,
        es_cliente INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (tercero_id) REFERENCES terceros(id),
        UNIQUE(empresa_id, tercero_id)
      );
      CREATE INDEX IF NOT EXISTS ix_empresa_tercero_empresa ON empresa_tercero(empresa_id);
      CREATE INDEX IF NOT EXISTS ix_empresa_tercero_tercero ON empresa_tercero(tercero_id);
    """)
    conn.commit()
  finally:
    conn.close()


def _now() -> str:
  return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _buscar_o_crear_tercero(conn: sqlite3.Connection, row: dict) -> int:
  """Devuelve tercero_id existente o inserta uno nuevo. Usa nif+nombre para deduplicar. Para proveedores (es_proveedor=1)."""
  nif = (row.get("nif") or "").strip()
  nombre = (row.get("nombre_canonico") or "").strip()
  if not nombre:
    raise ValueError("nombre_canonico vacío")
  cur = conn.execute(
    "SELECT id FROM terceros WHERE COALESCE(nif,'') = ? AND nombre_canonico = ?",
    (nif, nombre),
  )
  r = cur.fetchone()
  if r:
    conn.execute("UPDATE terceros SET es_proveedor = 1, updated_at = ? WHERE id = ?", (_now(), r["id"]))
    return r["id"]
  conn.execute(
    """INSERT INTO terceros (nif, nombre_canonico, pais, localidad, direccion, email, telefono, es_cliente, es_proveedor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)""",
    (
      nif or None,
      nombre,
      (row.get("pais") or "").strip() or None,
      (row.get("localidad") or "").strip() or None,
      (row.get("direccion") or "").strip() or None,
      (row.get("email") or "").strip() or None,
      (row.get("telefono") or "").strip() or None,
      _now(),
      _now(),
    ),
  )
  return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def _buscar_o_crear_tercero_cliente(conn: sqlite3.Connection, row: dict) -> int:
  """Devuelve tercero_id existente o inserta uno nuevo para rol cliente. Usa nif+nombre para deduplicar."""
  nif = (row.get("cif_nif") or row.get("nif") or "").strip()
  nombre = (row.get("cliente") or row.get("nombre_canonico") or "").strip()
  if not nombre:
    raise ValueError("cliente vacío")
  cur = conn.execute(
    "SELECT id FROM terceros WHERE COALESCE(nif,'') = ? AND nombre_canonico = ?",
    (nif, nombre),
  )
  r = cur.fetchone()
  if r:
    conn.execute("UPDATE terceros SET es_cliente = 1, updated_at = ? WHERE id = ?", (_now(), r["id"]))
    return r["id"]
  conn.execute(
    """INSERT INTO terceros (nif, nombre_canonico, pais, localidad, direccion, email, telefono, es_cliente, es_proveedor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)""",
    (
      nif or None,
      nombre,
      (row.get("pais") or "").strip() or None,
      (row.get("localidad") or "").strip() or None,
      (row.get("direccion") or "").strip() or None,
      (row.get("email") or "").strip() or None,
      (row.get("telefono") or "").strip() or None,
      _now(),
      _now(),
    ),
  )
  return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def migrar_proveedores_desde_csv() -> dict[str, Any]:
  """
  Lee todos los proveedores_maestros.csv por empresa, inserta en terceros y empresa_tercero.
  Devuelve { "empresas_procesadas": int, "terceros_creados": int, "relaciones_creadas": int, "errores": list }.
  """
  init_terceros_db()
  conn = _get_conn()
  resultado: dict[str, Any] = {
    "empresas_procesadas": 0,
    "terceros_totales": 0,
    "relaciones_creadas": 0,
    "errores": [],
  }
  try:
    # Carpetas de empresa: las definidas en TOML o las que existan bajo EMPRESAS_DIR
    empresas = list(EMPRESAS_CLIENTE.keys()) if EMPRESAS_CLIENTE else []
    if not empresas:
      for d in EMPRESAS_DIR.iterdir():
        if d.is_dir() and (d / PROVEEDORES_MAESTROS_NOMBRE).exists():
          empresas.append(d.name)
    for empresa_id in empresas:
      ruta = EMPRESAS_DIR / empresa_id / PROVEEDORES_MAESTROS_NOMBRE
      if not ruta.exists():
        continue
      lista: list[dict] = []
      with ruta.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, fieldnames=CAMPOS_PROVEEDORES_MAESTROS)
        for row in reader:
          if (row.get("nombre_canonico") or "").strip() == "nombre_canonico":
            continue
          limpio = {k: (v or "").strip() for k, v in row.items() if k}
          nombre = limpio.get("nombre_canonico", "")
          if nombre and nombre.lower() != "proveedor sin nombre":
            lista.append(limpio)
      for p in lista:
        try:
          tercero_id = _buscar_o_crear_tercero(conn, p)
          # ¿Relación ya existe?
          cur = conn.execute(
            "SELECT id FROM empresa_tercero WHERE empresa_id = ? AND tercero_id = ?",
            (empresa_id, tercero_id),
          )
          if cur.fetchone():
            continue
          centro = (p.get("centro_coste") or "").strip() or None
          conn.execute(
    """INSERT INTO empresa_tercero (empresa_id, tercero_id, centro_coste, activo, es_proveedor, es_cliente, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, 0, ?, ?)""",
            (empresa_id, tercero_id, centro, _now(), _now()),
          )
          resultado["relaciones_creadas"] += 1
        except Exception as e:
          resultado["errores"].append(f"{empresa_id} / {p.get('nombre_canonico','')}: {e}")
      resultado["empresas_procesadas"] += 1
    resultado["terceros_totales"] = conn.execute("SELECT COUNT(*) FROM terceros").fetchone()[0]
    conn.commit()
  finally:
    conn.close()
  return resultado


def get_proveedores_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve la lista de proveedores de la empresa desde SQLite, con el mismo
  formato que el CSV (CAMPOS_PROVEEDORES_MAESTROS) para compatibilidad.
  Si la tabla empresa_tercero está vacía para esta empresa, devuelve [].
  """
  init_terceros_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      """SELECT t.nif, t.nombre_canonico, t.direccion, t.localidad, t.pais, t.email, t.telefono, e.centro_coste
         FROM empresa_tercero e
         JOIN terceros t ON t.id = e.tercero_id
         WHERE e.empresa_id = ? AND e.activo = 1 AND e.es_proveedor = 1
         ORDER BY t.nombre_canonico""",
      (empresa_id,),
    )
    filas = cur.fetchall()
    return [
      {
        "nif": r["nif"] or "",
        "nombre_canonico": r["nombre_canonico"] or "",
        "direccion": r["direccion"] or "",
        "localidad": r["localidad"] or "",
        "pais": r["pais"] or "",
        "email": r["email"] or "",
        "telefono": r["telefono"] or "",
        "centro_coste": r["centro_coste"] or "",
      }
      for r in filas
    ]
  finally:
    conn.close()


def hay_proveedores_en_bd() -> bool:
  """True si hay al menos una fila en empresa_tercero (proveedores migrados)."""
  init_terceros_db()
  conn = _get_conn()
  try:
    r = conn.execute("SELECT 1 FROM empresa_tercero LIMIT 1").fetchone()
    return r is not None
  finally:
    conn.close()


def guardar_proveedores_empresa(empresa_id: str, lista: list[dict]) -> None:
  """
  Sustituye la lista de proveedores de la empresa en SQLite.
  Solo toca filas con es_proveedor=1 para no afectar a clientes.
  """
  init_terceros_db()
  conn = _get_conn()
  try:
    conn.execute("DELETE FROM empresa_tercero WHERE empresa_id = ? AND es_proveedor = 1", (empresa_id,))
    for p in lista:
      nombre = (p.get("nombre_canonico") or "").strip()
      if not nombre or nombre.lower() == "proveedor sin nombre":
        continue
      tercero_id = _buscar_o_crear_tercero(conn, p)
      centro = (p.get("centro_coste") or "").strip() or None
      conn.execute(
        """INSERT INTO empresa_tercero (empresa_id, tercero_id, centro_coste, activo, es_proveedor, es_cliente, created_at, updated_at)
           VALUES (?, ?, ?, 1, 1, 0, ?, ?)""",
        (empresa_id, tercero_id, centro, _now(), _now()),
      )
    conn.commit()
  finally:
    conn.close()


def get_clientes_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve la lista de clientes de la empresa desde SQLite (rol es_cliente=1).
  Formato: cliente (nombre_canonico), cif_nif, pais, localidad, proyecto (alias_local), direccion, email, telefono.
  """
  init_terceros_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      """SELECT t.nif, t.nombre_canonico, t.direccion, t.localidad, t.pais, t.email, t.telefono, e.alias_local
         FROM empresa_tercero e
         JOIN terceros t ON t.id = e.tercero_id
         WHERE e.empresa_id = ? AND e.activo = 1 AND e.es_cliente = 1
         ORDER BY t.nombre_canonico""",
      (empresa_id,),
    )
    filas = cur.fetchall()
    return [
      {
        "cliente": r["nombre_canonico"] or "",
        "cif_nif": r["nif"] or "",
        "direccion": r["direccion"] or "",
        "localidad": r["localidad"] or "",
        "pais": r["pais"] or "",
        "email": r["email"] or "",
        "telefono": r["telefono"] or "",
        "proyecto": r["alias_local"] or "",
      }
      for r in filas
    ]
  finally:
    conn.close()


def hay_clientes_en_bd() -> bool:
  """True si hay al menos una relación empresa_tercero con es_cliente=1."""
  init_terceros_db()
  conn = _get_conn()
  try:
    r = conn.execute("SELECT 1 FROM empresa_tercero WHERE es_cliente = 1 LIMIT 1").fetchone()
    return r is not None
  finally:
    conn.close()


def guardar_clientes_empresa(empresa_id: str, lista: list[dict]) -> None:
  """
  Sustituye la lista de clientes de la empresa en SQLite (solo filas es_cliente=1).
  Cada dict: cliente, cif_nif, pais, localidad, proyecto, direccion, email, telefono.
  """
  init_terceros_db()
  conn = _get_conn()
  try:
    conn.execute("DELETE FROM empresa_tercero WHERE empresa_id = ? AND es_cliente = 1", (empresa_id,))
    for c in lista:
      nombre = (c.get("cliente") or c.get("nombre_canonico") or "").strip()
      if not nombre or nombre.lower() == "sin nombre":
        continue
      tercero_id = _buscar_o_crear_tercero_cliente(conn, c)
      proyecto = (c.get("proyecto") or "").strip() or None
      conn.execute(
        """INSERT INTO empresa_tercero (empresa_id, tercero_id, alias_local, activo, es_proveedor, es_cliente, created_at, updated_at)
           VALUES (?, ?, ?, 1, 0, 1, ?, ?)""",
        (empresa_id, tercero_id, proyecto, _now(), _now()),
      )
    conn.commit()
  finally:
    conn.close()
