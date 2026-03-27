from __future__ import annotations

import logging
import os
import tomllib
from pathlib import Path

logger = logging.getLogger(__name__)

from dotenv import load_dotenv
from openai import OpenAI


# Rutas base de la aplicación
# APP_BASE_DIR permite sobreescribir en Docker donde parents[1] resuelve a "/"
BASE_DIR = Path(os.environ.get("APP_BASE_DIR", Path(__file__).resolve().parents[1]))
DATOS_DIR = BASE_DIR / "data"
SUBIDAS_DIR = DATOS_DIR / "subidas"
FACTURAS_RECIBIDAS_DIR = DATOS_DIR / "Facturas Recibidas"
FACTURAS_EMITIDAS_DIR = DATOS_DIR / "Facturas Emitidas"
EMPRESAS_DIR = DATOS_DIR / "empresas"
BANCOS_DIR = DATOS_DIR / "bancos"
MOVIMIENTOS_DB = BANCOS_DIR / "movimientos.db"
# Base de datos de gestión (terceros, empresa_tercero; futuro: más entidades ERP)
GESTION_DB = DATOS_DIR / "gestion.db"

# Cargar variables de entorno desde .env
load_dotenv(BASE_DIR / ".env")


def _cargar_empresas_desde_toml() -> dict[str, str]:
  """Carga el diccionario id -> nombre desde config/empresas.toml."""
  ruta = BASE_DIR / "config" / "empresas.toml"
  if not ruta.exists():
    return {}
  try:
    with open(ruta, "rb") as f:
      data = tomllib.load(f)
    return {e["id"]: e["nombre"] for e in data.get("empresa", [])}
  except Exception as e:
    logger.warning("Error leyendo empresas.toml: %s", e)
    return {}


# Empresas: una sola fuente de verdad
EMPRESAS_CLIENTE: dict[str, str] = _cargar_empresas_desde_toml()
NOMBRES_EMPRESAS_CLIENTE = list(EMPRESAS_CLIENTE.values())


# Listado maestro de proveedores por empresa (nombre canónico, NIF, etc.)
PROVEEDORES_MAESTROS_NOMBRE = "proveedores_maestros.csv"
CAMPOS_PROVEEDORES_MAESTROS = [
  "nombre_canonico",
  "nif",
  "direccion",
  "localidad",
  "pais",
  "email",
  "telefono",
  "centro_coste",
]


# Autenticación
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
SECRET_KEY = os.getenv("SECRET_KEY", "cambia-esta-clave-en-produccion")

# Configuración de OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# OpenRouteService (rutas y geocoding) - opcional para Proyectos > Transporte
OPENROUTESERVICE_API_KEY = os.getenv("OPENROUTESERVICE_API_KEY", "")

