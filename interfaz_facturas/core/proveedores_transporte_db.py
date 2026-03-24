"""
Proveedores de transporte - Capa de acceso unificada.
Lee/escribe desde terceros + terceros_transporte_datos (sistema unificado).
Mantiene la tabla legacy proveedores_transporte para compatibilidad.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_proveedores_transporte_db() -> None:
  """Inicializa tablas legacy y unificadas. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  with _conectar() as conn:
    # Legacy table (kept for reference, no longer primary source)
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
  _initialized = True


_QUERY_BASE = """
  SELECT t.id, t.nombre_canonico AS nombre, t.telefono, t.email,
         ttd.lat, ttd.lon, ttd.provincia, ttd.codigo_postal,
         ttd.direccion_completa AS localidad, ttd.direccion_completa AS direccion,
         ttd.web, ttd.telefono_fijo, ttd.telefono_movil
  FROM terceros t
  JOIN terceros_transporte_datos ttd ON ttd.tercero_id = t.id
  WHERE t.es_transportista = 1
"""


def _row_to_dict(row) -> dict[str, Any]:
  """Convierte una fila del JOIN unificado al formato esperado por el frontend."""
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
  """Devuelve todos los transportistas desde el sistema unificado."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    rows = conn.execute(_QUERY_BASE).fetchall()
  return [_row_to_dict(r) for r in rows]


def listar_proveedores_para_admin() -> list[dict[str, Any]]:
  """Lista todos los transportistas con id para el modal de gestion."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    rows = conn.execute(_QUERY_BASE + " ORDER BY t.nombre_canonico").fetchall()
  return [_row_to_dict(r) | {"id": r["id"]} for r in rows]


def obtener_proveedor(proveedor_id: int) -> dict[str, Any] | None:
  """Devuelve un transportista por tercero_id o None si no existe."""
  init_proveedores_transporte_db()
  with _conectar() as conn:
    row = conn.execute(_QUERY_BASE + " AND t.id = ?", (proveedor_id,)).fetchone()
  if not row:
    return None
  return _row_to_dict(row) | {"id": row["id"]}


def actualizar_proveedor(proveedor_id: int, datos: dict[str, Any]) -> bool:
  """Actualiza un transportista en el sistema unificado. Devuelve True si se actualizo."""
  init_proveedores_transporte_db()
  nombre = (datos.get("nombre") or "").strip()
  tel_fijo = (datos.get("telefono_fijo") or "").strip()
  tel_movil = (datos.get("telefono_movil") or "").strip()
  telefono = (datos.get("telefono") or "").strip()
  if not telefono and (tel_fijo or tel_movil):
    telefono = " / ".join(x for x in [tel_fijo, tel_movil] if x)
  ahora = _now()

  with _conectar() as conn:
    # Verificar que existe
    existe = conn.execute(
      "SELECT 1 FROM terceros WHERE id = ? AND es_transportista = 1", (proveedor_id,)
    ).fetchone()
    if not existe:
      return False

    # Actualizar terceros
    conn.execute(
      """UPDATE terceros SET nombre_canonico = ?, telefono = ?, email = ?, updated_at = ?
         WHERE id = ?""",
      (nombre, telefono, (datos.get("email") or "").strip(), ahora, proveedor_id),
    )

    # Actualizar terceros_transporte_datos
    conn.execute(
      """UPDATE terceros_transporte_datos SET
         lat = ?, lon = ?, provincia = ?, codigo_postal = ?,
         direccion_completa = ?, web = ?, telefono_fijo = ?, telefono_movil = ?,
         updated_at = ?
         WHERE tercero_id = ?""",
      (
        datos.get("lat") if datos.get("lat") is not None else None,
        datos.get("lon") if datos.get("lon") is not None else None,
        (datos.get("provincia") or "").strip() or None,
        (datos.get("codigo_postal") or "").strip() or None,
        (datos.get("localidad") or datos.get("direccion") or "").strip() or None,
        (datos.get("web") or "").strip() or None,
        tel_fijo or None,
        tel_movil or None,
        ahora,
        proveedor_id,
      ),
    )

    # Sincronizar crm_empresas
    conn.execute(
      """UPDATE crm_empresas SET nombre = ?, telefono = ?, email = ?, web = ?,
         provincia = ?, localidad = ?
         WHERE tercero_id = ?""",
      (
        nombre,
        telefono,
        (datos.get("email") or "").strip() or None,
        (datos.get("web") or "").strip() or None,
        (datos.get("provincia") or "").strip() or None,
        (datos.get("localidad") or "").strip() or None,
        proveedor_id,
      ),
    )

  return True


def alta_proveedor(datos: dict[str, Any]) -> int:
  """Crea un nuevo transportista en el sistema unificado. Devuelve el tercero_id."""
  init_proveedores_transporte_db()
  nombre = (datos.get("nombre") or "").strip()
  tel_fijo = (datos.get("telefono_fijo") or "").strip()
  tel_movil = (datos.get("telefono_movil") or "").strip()
  telefono = (datos.get("telefono") or "").strip()
  if not telefono and (tel_fijo or tel_movil):
    telefono = " / ".join(x for x in [tel_fijo, tel_movil] if x)
  ahora = _now()

  with _conectar() as conn:
    # Insertar en terceros
    conn.execute(
      """INSERT INTO terceros
         (nif, nombre_canonico, pais, localidad, direccion, email, telefono,
          es_cliente, es_proveedor, es_transportista, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)""",
      (
        None,
        nombre,
        "España",
        (datos.get("provincia") or "").strip() or None,
        (datos.get("direccion") or "").strip() or None,
        (datos.get("email") or "").strip() or None,
        telefono or None,
        ahora, ahora,
      ),
    )
    tercero_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Insertar datos de transporte
    conn.execute(
      """INSERT INTO terceros_transporte_datos
         (tercero_id, lat, lon, provincia, codigo_postal, direccion_completa,
          web, telefono_fijo, telefono_movil, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
      (
        tercero_id,
        datos.get("lat") if datos.get("lat") is not None else None,
        datos.get("lon") if datos.get("lon") is not None else None,
        (datos.get("provincia") or "").strip() or None,
        (datos.get("codigo_postal") or "").strip() or None,
        (datos.get("localidad") or datos.get("direccion") or "").strip() or None,
        (datos.get("web") or "").strip() or None,
        tel_fijo or None,
        tel_movil or None,
        ahora, ahora,
      ),
    )

    # Crear crm_empresas
    conn.execute(
      """INSERT INTO crm_empresas
         (nombre, cif, direccion, localidad, provincia, pais,
          telefono, email, web, tipo, tercero_id, fecha_creacion, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
      (
        nombre, None,
        (datos.get("direccion") or "").strip() or None,
        (datos.get("localidad") or "").strip() or None,
        (datos.get("provincia") or "").strip() or None,
        "España",
        telefono or None,
        (datos.get("email") or "").strip() or None,
        (datos.get("web") or "").strip() or None,
        "proveedor",
        tercero_id,
        ahora,
      ),
    )

  return tercero_id


def insertar_desde_lista(lista: list[dict[str, Any]]) -> int:
  """Inserta multiples transportistas en el sistema unificado."""
  if not lista:
    return 0
  insertados = 0
  for p in lista:
    if (p.get("nombre") or "").strip():
      alta_proveedor(p)
      insertados += 1
  return insertados


def migrar_desde_archivos(base_dir: Path) -> int:
  """Legacy: carga desde Excel/CSV e inserta en el sistema unificado."""
  from core.transporte_servicios import _cargar_proveedores_desde_xlsx

  init_proveedores_transporte_db()
  with _conectar() as conn:
    n = conn.execute("SELECT COUNT(*) FROM terceros_transporte_datos").fetchone()[0]
    if n > 0:
      return 0
  lista = _cargar_proveedores_desde_xlsx(base_dir)
  return insertar_desde_lista(lista)
