"""
Maestro de tarjetas de banco por empresa en SQLite (gestion.db).

Tablas:
- tarjetas: una fila por tarjeta (empresa, banco, persona, alias, últimos 4 dígitos).

Se usa desde el módulo de Bancos para:
- Listar tarjetas por empresa.
- Crear/editar tarjetas.
- (Futuro) enlazar tarjetas con liquidaciones y movimientos.
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from typing import Any, List, Dict

logger = logging.getLogger(__name__)

try:
  from config import GESTION_DB
except ImportError:
  from interfaz_facturas.config import GESTION_DB


def _get_conn() -> sqlite3.Connection:
  GESTION_DB.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(str(GESTION_DB))
  conn.row_factory = sqlite3.Row
  return conn


def _now() -> str:
  return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def init_tarjetas_db() -> None:
  """Crea la tabla tarjetas si no existe."""
  conn = _get_conn()
  try:
    conn.execute(
      """
      CREATE TABLE IF NOT EXISTS tarjetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id TEXT NOT NULL,
        banco TEXT NOT NULL,
        persona TEXT NOT NULL,
        ultimos4 TEXT,
        alias TEXT,
        activa INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      """
    )
    conn.execute(
      "CREATE INDEX IF NOT EXISTS ix_tarjetas_empresa ON tarjetas(empresa_id)"
    )
    conn.execute(
      "CREATE INDEX IF NOT EXISTS ix_tarjetas_empresa_activa ON tarjetas(empresa_id, activa)"
    )
    conn.commit()
  finally:
    conn.close()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
  return {
    "id": row["id"],
    "empresa_id": row["empresa_id"],
    "banco": row["banco"] or "",
    "persona": row["persona"] or "",
    "ultimos4": row["ultimos4"] or "",
    "alias": row["alias"] or "",
    "activa": bool(row["activa"]),
    "created_at": row["created_at"] or "",
    "updated_at": row["updated_at"] or "",
  }


def get_tarjetas_empresa(empresa_id: str, solo_activas: bool = True) -> List[Dict[str, Any]]:
  """Devuelve las tarjetas de una empresa. Por defecto solo activas."""
  init_tarjetas_db()
  conn = _get_conn()
  try:
    params: list[Any] = [empresa_id]
    where = "WHERE empresa_id = ?"
    if solo_activas:
      where += " AND activa = 1"
    cur = conn.execute(
      f"""
      SELECT id, empresa_id, banco, persona, ultimos4, alias, activa, created_at, updated_at
      FROM tarjetas
      {where}
      ORDER BY banco, persona, id
      """,
      params,
    )
    return [_row_to_dict(r) for r in cur.fetchall()]
  finally:
    conn.close()


def get_tarjeta_por_id(tarjeta_id: int) -> Dict[str, Any] | None:
  """Devuelve una tarjeta por id o None si no existe."""
  init_tarjetas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      """
      SELECT id, empresa_id, banco, persona, ultimos4, alias, activa, created_at, updated_at
      FROM tarjetas
      WHERE id = ?
      """,
      (tarjeta_id,),
    )
    row = cur.fetchone()
    return _row_to_dict(row) if row else None
  finally:
    conn.close()


def crear_tarjeta(empresa_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
  """Crea una tarjeta para la empresa y devuelve el dict resultante."""
  init_tarjetas_db()
  conn = _get_conn()
  try:
    ahora = _now()
    banco = (data.get("banco") or "").strip()
    persona = (data.get("persona") or "").strip()
    ultimos4 = (data.get("ultimos4") or "").strip() or None
    alias = (data.get("alias") or "").strip() or None
    activa = 1 if bool(data.get("activa", True)) else 0
    conn.execute(
      """
      INSERT INTO tarjetas (empresa_id, banco, persona, ultimos4, alias, activa, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (empresa_id, banco, persona, ultimos4, alias, activa, ahora, ahora),
    )
    tarjeta_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
  finally:
    conn.close()
  return get_tarjeta_por_id(int(tarjeta_id))


def actualizar_tarjeta(tarjeta_id: int, empresa_id: str, data: Dict[str, Any]) -> Dict[str, Any] | None:
  """
  Actualiza una tarjeta (misma empresa) y devuelve el dict actualizado o None si no existe.
  No permite cambiar empresa_id.
  """
  init_tarjetas_db()
  conn = _get_conn()
  try:
    cur = conn.execute(
      "SELECT empresa_id FROM tarjetas WHERE id = ?",
      (tarjeta_id,),
    )
    row = cur.fetchone()
    if not row:
      return None
    if (row["empresa_id"] or "").strip() != (empresa_id or "").strip():
      raise ValueError("La tarjeta no pertenece a la empresa indicada")
    ahora = _now()
    # Leer valores actuales para solo sobrescribir lo presente en data
    cur = conn.execute(
      """
      SELECT banco, persona, ultimos4, alias, activa
      FROM tarjetas
      WHERE id = ?
      """,
      (tarjeta_id,),
    )
    actual = cur.fetchone()
    if not actual:
      return None
    banco = (data.get("banco", actual["banco"]) or "").strip()
    persona = (data.get("persona", actual["persona"]) or "").strip()
    ultimos4 = (data.get("ultimos4", actual["ultimos4"]) or "")
    ultimos4 = ultimos4.strip() or None
    alias = (data.get("alias", actual["alias"]) or "")
    alias = alias.strip() or None
    if "activa" in data:
      activa = 1 if bool(data.get("activa")) else 0
    else:
      activa = int(actual["activa"])
    conn.execute(
      """
      UPDATE tarjetas
      SET banco = ?, persona = ?, ultimos4 = ?, alias = ?, activa = ?, updated_at = ?
      WHERE id = ?
      """,
      (banco, persona, ultimos4, alias, activa, ahora, tarjeta_id),
    )
    conn.commit()
  finally:
    conn.close()
  return get_tarjeta_por_id(int(tarjeta_id))

