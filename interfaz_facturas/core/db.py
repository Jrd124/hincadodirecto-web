"""Utilidades compartidas de acceso a SQLite (gestion.db)."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Generator

try:
  from config import GESTION_DB
except ImportError:
  from interfaz_facturas.config import GESTION_DB


def get_conn() -> sqlite3.Connection:
  """Abre una conexión a gestion.db con row_factory=Row."""
  GESTION_DB.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(str(GESTION_DB))
  conn.row_factory = sqlite3.Row
  return conn


@contextmanager
def conectar() -> Generator[sqlite3.Connection, None, None]:
  """Context manager: abre conexión, hace commit si no hay error, cierra siempre."""
  conn = get_conn()
  try:
    yield conn
    conn.commit()
  except Exception:
    conn.rollback()
    raise
  finally:
    conn.close()


def now_iso() -> str:
  """Devuelve la fecha/hora UTC actual en formato ISO 8601."""
  return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
