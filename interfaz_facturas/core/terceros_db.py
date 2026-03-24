"""
Modelo de terceros (clientes y proveedores) en SQLite.
Esquema: terceros (entidad global) + empresa_tercero (relación por empresa).
Migración desde proveedores_maestros.csv y lectura unificada para la API.

Punto único de entrada para crear/vincular terceros:
  crear_o_vincular_tercero(nombre, cif, datos_extra, rol, origen)
"""
from __future__ import annotations

import csv
import logging
import re
import sqlite3
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Importación según contexto (backend corre desde interfaz_facturas)
try:
  from config import EMPRESAS_DIR, EMPRESAS_CLIENTE
  from config import PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS
except ImportError:
  from interfaz_facturas.config import EMPRESAS_DIR, EMPRESAS_CLIENTE
  from interfaz_facturas.config import PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS

from core.db import conectar as _conectar, now_iso as _now


_initialized = False


# ─── Normalización y validación ──────────────────────────────────────────────

def _normalizar_cif(cif: str | None) -> str:
  """Elimina espacios, puntos, guiones y pasa a mayúsculas."""
  if not cif:
    return ""
  return re.sub(r"[\s.\-]", "", cif).upper()


def _normalizar_nombre(nombre: str | None) -> str:
  """Minúsculas, sin comas/puntos extra, trim."""
  if not nombre:
    return ""
  return re.sub(r"[,.\s]+", " ", nombre).strip().lower()


_RE_NIF = re.compile(r"^[0-9]{8}[A-Z]$")              # 12345678A
_RE_NIE = re.compile(r"^[XYZ][0-9]{7}[A-Z]$")          # X1234567A
_RE_CIF = re.compile(r"^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$")  # B12345678 o B1234567A


def validar_cif_nif(cif_normalizado: str) -> bool:
  """Valida que un CIF/NIF normalizado tenga formato español válido.

  Returns True si es válido, False si no (no debe usarse para búsqueda)."""
  if not cif_normalizado:
    return False
  return bool(
    _RE_NIF.match(cif_normalizado)
    or _RE_NIE.match(cif_normalizado)
    or _RE_CIF.match(cif_normalizado)
  )


def init_terceros_db() -> None:
  """Crea las tablas terceros y empresa_tercero si no existen. No-op tras la primera llamada."""
  global _initialized
  if _initialized:
    return
  with _conectar() as conn:
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
        es_transportista INTEGER NOT NULL DEFAULT 0,
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
  _initialized = True


# ─── Propagación terceros → crm_empresas ────────────────────────────────────

def _propagar_a_crm_empresa(conn: sqlite3.Connection, tercero_id: int) -> None:
  """Sincroniza nombre, nif, localidad, pais, telefono, email de terceros a crm_empresas."""
  row = conn.execute("SELECT * FROM terceros WHERE id = ?", (tercero_id,)).fetchone()
  if not row:
    return
  crm = conn.execute(
    "SELECT id FROM crm_empresas WHERE tercero_id = ?", (tercero_id,)
  ).fetchone()
  if crm:
    conn.execute(
      """UPDATE crm_empresas SET
           nombre = ?, cif = ?, localidad = ?, pais = ?,
           direccion = ?, telefono = ?, email = ?
         WHERE tercero_id = ?""",
      (
        row["nombre_canonico"],
        row["nif"],
        row["localidad"],
        row["pais"],
        row["direccion"],
        row["telefono"],
        row["email"],
        tercero_id,
      ),
    )


# ─── PUNTO ÚNICO DE ENTRADA ──────────────────────────────────────────────────

def crear_o_vincular_tercero(
  nombre: str,
  cif: str | None = None,
  datos_extra: dict | None = None,
  rol: str = "proveedor",
  origen: str = "ocr",
  conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
  """Punto único de entrada para crear o vincular un tercero.

  Estrategia de deduplicación:
    1. Validar y normalizar CIF. Si no pasa validacion, tratarlo como vacio.
    2. Buscar por CIF normalizado (match exacto)
    3. Buscar por nombre normalizado exacto
    4. Buscar por similitud de nombre:
       - >= 95%: vincular automaticamente (diferencias menores de puntuacion)
       - 85-95%: vincular pero marcar como 'requiere_revision'
       - < 85%: crear nuevo
    5. Crear nuevo si no hay match

  Args:
    nombre: nombre de la empresa/persona
    cif: CIF/NIF (puede ser None o invalido)
    datos_extra: dict con pais, localidad, direccion, email, telefono
    rol: 'proveedor' | 'cliente'
    origen: 'ocr' | 'manual' | 'import' | 'migracion'
    conn: conexion SQLite existente (para usar dentro de transacciones)

  Returns:
    dict con 'id', 'accion' ('vinculado_cif'|'vinculado_nombre'|'vinculado_similar'|'creado'),
    'similitud' (float si aplica), 'requiere_revision' (bool),
    'nombre_match' (nombre del tercero encontrado si fue similar)
  """
  nombre = (nombre or "").strip()
  if not nombre:
    raise ValueError("nombre vacio")

  datos = datos_extra or {}
  cif_raw = (cif or "").strip()
  cif_norm = _normalizar_cif(cif_raw)

  # Validacion de CIF: si no pasa, no usarlo para busqueda
  cif_valido = False
  if cif_norm:
    if validar_cif_nif(cif_norm):
      cif_valido = True
    else:
      logger.warning(
        "[terceros][%s] CIF invalido (formato no reconocido), ignorado para busqueda: '%s' (raw: '%s') - empresa: '%s'",
        origen, cif_norm, cif_raw, nombre,
      )

  nombre_norm = _normalizar_nombre(nombre)

  def _ejecutar(c: sqlite3.Connection) -> dict[str, Any]:
    resultado: dict[str, Any] = {
      "id": 0,
      "accion": "",
      "similitud": None,
      "requiere_revision": False,
      "nombre_match": None,
      "cif_warning": None if cif_valido or not cif_norm else f"CIF ignorado (formato invalido): {cif_norm}",
    }

    es_cliente = 1 if rol == "cliente" else 0
    es_proveedor = 1 if rol == "proveedor" else 0
    update_rol = "es_cliente = 1" if rol == "cliente" else "es_proveedor = 1"

    def _actualizar_tercero_existente(tercero_id: int) -> None:
      """Actualiza campos del tercero existente con datos nuevos (sin sobrescribir con vacios)."""
      campos_update = []
      params_update: list[Any] = []
      for campo in ("pais", "localidad", "direccion", "email", "telefono"):
        val_nuevo = (datos.get(campo) or "").strip()
        if val_nuevo:
          campos_update.append(f"{campo} = ?")
          params_update.append(val_nuevo)
      campos_update.append(f"{update_rol}")
      campos_update.append("updated_at = ?")
      params_update.append(_now())
      params_update.append(tercero_id)
      c.execute(
        f"UPDATE terceros SET {', '.join(campos_update)} WHERE id = ?",
        params_update,
      )
      # Propagar a crm_empresas vinculada
      _propagar_a_crm_empresa(c, tercero_id)

    # 1. Buscar por CIF normalizado (solo si valido)
    if cif_valido and cif_norm:
      todos_cif = c.execute(
        "SELECT id, nif, nombre_canonico FROM terceros WHERE nif IS NOT NULL AND nif != ''",
      ).fetchall()
      for t in todos_cif:
        if _normalizar_cif(t["nif"]) == cif_norm:
          _actualizar_tercero_existente(t["id"])
          resultado["id"] = t["id"]
          resultado["accion"] = "vinculado_cif"
          resultado["nombre_match"] = t["nombre_canonico"]
          logger.info("[terceros][%s] Vinculado por CIF %s: '%s' -> #%d '%s'",
                      origen, cif_norm, nombre, t["id"], t["nombre_canonico"])
          return resultado

    # 2. Buscar por nombre normalizado exacto
    todos_nombres = c.execute("SELECT id, nombre_canonico FROM terceros").fetchall()
    for t in todos_nombres:
      if _normalizar_nombre(t["nombre_canonico"]) == nombre_norm:
        _actualizar_tercero_existente(t["id"])
        resultado["id"] = t["id"]
        resultado["accion"] = "vinculado_nombre"
        resultado["nombre_match"] = t["nombre_canonico"]
        logger.info("[terceros][%s] Vinculado por nombre exacto: '%s' -> #%d", origen, nombre, t["id"])
        return resultado

    # 3. Buscar por similitud de nombre
    best_score = 0.0
    best_id = None
    best_nombre = None
    for t in todos_nombres:
      t_norm = _normalizar_nombre(t["nombre_canonico"])
      if not t_norm:
        continue
      score = SequenceMatcher(None, nombre_norm, t_norm).ratio()
      if score > best_score:
        best_score = score
        best_id = t["id"]
        best_nombre = t["nombre_canonico"]

    if best_score >= 0.85 and best_id is not None:
      _actualizar_tercero_existente(best_id)
      resultado["id"] = best_id
      resultado["accion"] = "vinculado_similar"
      resultado["similitud"] = round(best_score, 3)
      resultado["nombre_match"] = best_nombre
      # >= 95%: auto, 85-95%: requiere revision
      resultado["requiere_revision"] = best_score < 0.95
      level = "info" if best_score >= 0.95 else "warning"
      getattr(logger, level)(
        "[terceros][%s] Similar (%.0f%%): '%s' -> #%d '%s'%s",
        origen, best_score * 100, nombre, best_id, best_nombre,
        " [REQUIERE REVISION]" if resultado["requiere_revision"] else "",
      )
      return resultado

    # 4. Crear nuevo
    c.execute(
      """INSERT INTO terceros (nif, nombre_canonico, pais, localidad, direccion, email, telefono,
         es_cliente, es_proveedor, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
      (
        cif_raw or None,
        nombre,
        (datos.get("pais") or "").strip() or None,
        (datos.get("localidad") or "").strip() or None,
        (datos.get("direccion") or "").strip() or None,
        (datos.get("email") or "").strip() or None,
        (datos.get("telefono") or "").strip() or None,
        es_cliente,
        es_proveedor,
        _now(),
        _now(),
      ),
    )
    nuevo_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    resultado["id"] = nuevo_id
    resultado["accion"] = "creado"
    # Propagar a crm_empresas
    _propagar_a_crm_empresa(c, nuevo_id)
    logger.info("[terceros][%s] Nuevo tercero creado: '%s' (CIF: %s) -> #%d",
                origen, nombre, cif_raw or "sin CIF", nuevo_id)
    return resultado

  # Ejecutar con conexion proporcionada o nueva
  if conn is not None:
    return _ejecutar(conn)
  else:
    with _conectar() as c:
      return _ejecutar(c)


# ─── Wrappers de compatibilidad (delegados al gateway) ──────────────────────

def _buscar_o_crear_tercero(conn: sqlite3.Connection, row: dict) -> int:
  """Wrapper legacy para proveedores. Delega en crear_o_vincular_tercero."""
  nombre = (row.get("nombre_canonico") or "").strip()
  cif = (row.get("nif") or "").strip()
  datos = {k: row.get(k) for k in ("pais", "localidad", "direccion", "email", "telefono")}
  resultado = crear_o_vincular_tercero(nombre, cif, datos, rol="proveedor", origen="import", conn=conn)
  return resultado["id"]


def _buscar_o_crear_tercero_cliente(conn: sqlite3.Connection, row: dict) -> int:
  """Wrapper legacy para clientes. Delega en crear_o_vincular_tercero."""
  nombre = (row.get("cliente") or row.get("nombre_canonico") or "").strip()
  cif = (row.get("cif_nif") or row.get("nif") or "").strip()
  datos = {k: row.get(k) for k in ("pais", "localidad", "direccion", "email", "telefono")}
  resultado = crear_o_vincular_tercero(nombre, cif, datos, rol="cliente", origen="import", conn=conn)
  return resultado["id"]


def migrar_proveedores_desde_csv() -> dict[str, Any]:
  """
  Lee todos los proveedores_maestros.csv por empresa, inserta en terceros y empresa_tercero.
  Devuelve { "empresas_procesadas": int, "terceros_creados": int, "relaciones_creadas": int, "errores": list }.
  """
  init_terceros_db()
  resultado: dict[str, Any] = {
    "empresas_procesadas": 0,
    "terceros_totales": 0,
    "relaciones_creadas": 0,
    "errores": [],
  }
  with _conectar() as conn:
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
  return resultado


def get_proveedores_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve la lista de proveedores de la empresa desde SQLite, con el mismo
  formato que el CSV (CAMPOS_PROVEEDORES_MAESTROS) para compatibilidad.
  Si la tabla empresa_tercero está vacía para esta empresa, devuelve [].
  """
  init_terceros_db()
  with _conectar() as conn:
    cur = conn.execute(
      """SELECT t.id AS tercero_id, t.nif, t.nombre_canonico, t.direccion, t.localidad, t.pais, t.email, t.telefono, e.centro_coste
         FROM empresa_tercero e
         JOIN terceros t ON t.id = e.tercero_id
         WHERE e.empresa_id = ? AND e.activo = 1 AND e.es_proveedor = 1
         ORDER BY t.nombre_canonico""",
      (empresa_id,),
    )
    filas = cur.fetchall()
    return [
      {
        "tercero_id": r["tercero_id"],
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


def hay_proveedores_en_bd() -> bool:
  """True si hay al menos una fila en empresa_tercero (proveedores migrados)."""
  init_terceros_db()
  with _conectar() as conn:
    r = conn.execute("SELECT 1 FROM empresa_tercero LIMIT 1").fetchone()
    return r is not None


def guardar_proveedores_empresa(empresa_id: str, lista: list[dict]) -> None:
  """
  Sustituye la lista de proveedores de la empresa en SQLite.
  Solo toca filas con es_proveedor=1 para no afectar a clientes.
  """
  init_terceros_db()
  with _conectar() as conn:
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


def get_clientes_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve la lista de clientes de la empresa desde SQLite (rol es_cliente=1).
  Formato: cliente (nombre_canonico), cif_nif, pais, localidad, proyecto (alias_local), direccion, email, telefono.
  """
  init_terceros_db()
  with _conectar() as conn:
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


def hay_clientes_en_bd() -> bool:
  """True si hay al menos una relación empresa_tercero con es_cliente=1."""
  init_terceros_db()
  with _conectar() as conn:
    r = conn.execute("SELECT 1 FROM empresa_tercero WHERE es_cliente = 1 LIMIT 1").fetchone()
    return r is not None


def guardar_clientes_empresa(empresa_id: str, lista: list[dict]) -> None:
  """
  Sustituye la lista de clientes de la empresa en SQLite (solo filas es_cliente=1).
  Cada dict: cliente, cif_nif, pais, localidad, proyecto, direccion, email, telefono.
  """
  init_terceros_db()
  with _conectar() as conn:
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
