"""
Proveedores de transporte de maquinaria en SQLite (gestion.db).
Tabla proveedores_transporte para el módulo de rutas y proveedores en la ruta.
Migración desde proveedores_transporte.xlsx / .csv (ver transporte_servicios y script de migración).
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_proveedores_transporte_db() -> None:
  """Crea la tabla proveedores_transporte si no existe. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  with _conectar() as conn:
    conn.executescript("""
      CREATE TABLE IF NOT EXISTS proveedores_transporte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL DEFAULT '',
        telefono TEXT DEFAULT '',
        telefono_fijo TEXT DEFAULT '',
        telefono_movil TEXT DEFAULT '',
        email TEXT DEFAULT '',
        web TEXT DEFAULT '',
        localidad TEXT DEFAULT '',
        provincia TEXT DEFAULT '',
        codigo_postal TEXT DEFAULT '',
        direccion TEXT DEFAULT '',
        lat REAL,
        lon REAL,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_proveedores_transporte_nombre ON proveedores_transporte(nombre);
      CREATE INDEX IF NOT EXISTS ix_proveedores_transporte_localidad ON proveedores_transporte(localidad);
    """)
  _initialized = True


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
  """Convierte una fila SQLite a dict con las claves esperadas por transporte_servicios."""
  d = dict(row)
  return {
    "nombre": d.get("nombre") or "",
    "telefono": d.get("telefono") or "",
    "telefono_fijo": d.get("telefono_fijo") or "",
    "telefono_movil": d.get("telefono_movil") or "",
    "email": d.get("email") or "",
    "web": d.get("web") or "",
    "localidad": d.get("localidad") or "",
    "provincia": d.get("provincia") or "",
    "codigo_postal": d.get("codigo_postal") or "",
    "direccion": d.get("direccion") or "",
    "lat": d.get("lat"),
    "lon": d.get("lon"),
  }


def listar_proveedores() -> list[dict[str, Any]]:
  """Devuelve todos los proveedores desde SQLite (mismo formato que transporte_servicios espera)."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    cur = conn.execute("SELECT * FROM proveedores_transporte")
    return [_row_to_dict(row) for row in cur.fetchall()]


def listar_proveedores_para_admin() -> list[dict[str, Any]]:
  """Lista todos los proveedores con id para el modal de gestión."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    cur = conn.execute("SELECT * FROM proveedores_transporte ORDER BY nombre")
    rows = cur.fetchall()
  return [_row_to_dict(row) | {"id": row["id"]} for row in rows]


def obtener_proveedor(proveedor_id: int) -> dict[str, Any] | None:
  """Devuelve un proveedor por id o None si no existe."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    cur = conn.execute("SELECT * FROM proveedores_transporte WHERE id = ?", (proveedor_id,))
    row = cur.fetchone()
  if not row:
    return None
  return _row_to_dict(row) | {"id": row["id"]}


def actualizar_proveedor(proveedor_id: int, datos: dict[str, Any]) -> bool:
  """Actualiza un proveedor existente. Devuelve True si existía y se actualizó."""
  init_proveedores_transporte_db()
  tel_fijo = (datos.get("telefono_fijo") or "").strip()
  tel_movil = (datos.get("telefono_movil") or "").strip()
  telefono = (datos.get("telefono") or "").strip()
  if not telefono and (tel_fijo or tel_movil):
    telefono = " / ".join(x for x in [tel_fijo, tel_movil] if x)
  with _conectar() as conn:
    cur = conn.execute(
      """UPDATE proveedores_transporte SET
         nombre = ?, telefono = ?, telefono_fijo = ?, telefono_movil = ?, email = ?, web = ?,
         localidad = ?, provincia = ?, codigo_postal = ?, direccion = ?, lat = ?, lon = ?
         WHERE id = ?""",
      (
        (datos.get("nombre") or "").strip(),
        telefono,
        tel_fijo,
        tel_movil,
        (datos.get("email") or "").strip(),
        (datos.get("web") or "").strip(),
        (datos.get("localidad") or "").strip(),
        (datos.get("provincia") or "").strip(),
        (datos.get("codigo_postal") or "").strip(),
        (datos.get("direccion") or "").strip(),
        datos.get("lat") if datos.get("lat") is not None else None,
        datos.get("lon") if datos.get("lon") is not None else None,
        proveedor_id,
      ),
    )
    return cur.rowcount > 0


def insertar_desde_lista(lista: list[dict[str, Any]]) -> int:
  """Inserta múltiples proveedores. Devuelve el número de filas insertadas."""
  if not lista:
    return 0
  init_proveedores_transporte_db()
  created = _now()
  insertados = 0
  with _conectar() as conn:
    for p in lista:
      tel_fijo = (p.get("telefono_fijo") or "").strip()
      tel_movil = (p.get("telefono_movil") or "").strip()
      telefono = (p.get("telefono") or "").strip()
      if not telefono and (tel_fijo or tel_movil):
        telefono = " / ".join(x for x in [tel_fijo, tel_movil] if x)
      conn.execute(
        """INSERT INTO proveedores_transporte (
           nombre, telefono, telefono_fijo, telefono_movil, email, web,
           localidad, provincia, codigo_postal, direccion, lat, lon, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
          p.get("nombre") or "",
          telefono,
          tel_fijo,
          tel_movil,
          p.get("email") or "",
          p.get("web") or "",
          p.get("localidad") or "",
          p.get("provincia") or "",
          p.get("codigo_postal") or "",
          p.get("direccion") or "",
          p.get("lat"),
          p.get("lon"),
          created,
        ),
      )
      insertados += 1
  return insertados


def alta_proveedor(datos: dict[str, Any]) -> int:
  """Inserta un nuevo proveedor de transporte. Devuelve el id asignado."""
  init_proveedores_transporte_db()
  tel_fijo = (datos.get("telefono_fijo") or "").strip()
  tel_movil = (datos.get("telefono_movil") or "").strip()
  telefono = (datos.get("telefono") or "").strip()
  if not telefono and (tel_fijo or tel_movil):
    telefono = " / ".join(x for x in [tel_fijo, tel_movil] if x)
  created = _now()
  with _conectar() as conn:
    cur = conn.execute(
      """INSERT INTO proveedores_transporte (
         nombre, telefono, telefono_fijo, telefono_movil, email, web,
         localidad, provincia, codigo_postal, direccion, lat, lon, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
      (
        (datos.get("nombre") or "").strip(),
        telefono,
        tel_fijo,
        tel_movil,
        (datos.get("email") or "").strip(),
        (datos.get("web") or "").strip(),
        (datos.get("localidad") or "").strip(),
        (datos.get("provincia") or "").strip(),
        (datos.get("codigo_postal") or "").strip(),
        (datos.get("direccion") or "").strip(),
        datos.get("lat") if datos.get("lat") is not None else None,
        datos.get("lon") if datos.get("lon") is not None else None,
        created,
      ),
    )
    return cur.lastrowid


def migrar_desde_archivos(base_dir: Path) -> int:
  """
  Carga proveedores desde Excel/CSV (lógica actual) e inserta en proveedores_transporte.
  Ejecutar una sola vez para migrar. Si la tabla ya tiene filas, no inserta (evita duplicados).
  Devuelve el número de filas insertadas.
  """
  from core.transporte_servicios import cargar_proveedores_transporte

  init_proveedores_transporte_db()
  lista = cargar_proveedores_transporte(base_dir)
  if not lista:
    return 0

  created = _now()
  insertados = 0
  with _conectar() as conn:
    n = conn.execute("SELECT COUNT(*) FROM proveedores_transporte").fetchone()[0]
    if n > 0:
      return 0  # Ya hay datos; no sobrescribir ni duplicar
    for p in lista:
      conn.execute(
        """INSERT INTO proveedores_transporte (
           nombre, telefono, telefono_fijo, telefono_movil, email, web,
           localidad, provincia, codigo_postal, direccion, lat, lon, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
          p.get("nombre") or "",
          p.get("telefono") or "",
          p.get("telefono_fijo") or "",
          p.get("telefono_movil") or "",
          p.get("email") or "",
          p.get("web") or "",
          p.get("localidad") or "",
          p.get("provincia") or "",
          p.get("codigo_postal") or "",
          p.get("direccion") or "",
          p.get("lat"),
          p.get("lon"),
          created,
        ),
      )
      insertados += 1
  return insertados
