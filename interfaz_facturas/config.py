from __future__ import annotations

import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# Rutas base de la aplicación
BASE_DIR = Path(__file__).resolve().parents[1]
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
  out: dict[str, str] = {}
  if not ruta.exists():
    return out
  try:
    texto = ruta.read_text(encoding="utf-8")
    for m in re.finditer(r"\[\[empresa\]\](.*?)(?=\[\[empresa\]\]|\Z)", texto, re.DOTALL):
      bloque = m.group(1)
      id_m = re.search(r'id\s*=\s*"([^"]*)"', bloque)
      nom_m = re.search(r'nombre\s*=\s*"([^"]*)"', bloque)
      if id_m and nom_m:
        out[id_m.group(1).strip()] = nom_m.group(1).strip()
  except Exception:
    # Si hay un error leyendo el TOML, devolvemos lo que tengamos (o vacío)
    pass
  return out


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


# Configuración de OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# OpenRouteService (rutas y geocoding) - opcional para Proyectos > Transporte
OPENROUTESERVICE_API_KEY = os.getenv("OPENROUTESERVICE_API_KEY", "")

