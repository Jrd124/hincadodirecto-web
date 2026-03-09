"""Geocoding de localidades a países usando Nominatim (OpenStreetMap) con cache persistente."""
from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

# Cache localidad -> país para no repetir peticiones a Nominatim en el mismo lote.
# Se persiste en JSON entre reinicios para no repetir peticiones.
_cache_pais_localidad: dict[str, str] = {}
_cache_nominatim_loaded = False


def _init_cache_path() -> Path:
  try:
    from config import DATOS_DIR
  except ImportError:
    from interfaz_facturas.config import DATOS_DIR
  return DATOS_DIR / "cache_nominatim_pais_localidad.json"


def _cargar_cache() -> None:
  """Carga el cache de Nominatim desde disco (localidad_norm -> país)."""
  global _cache_nominatim_loaded
  if _cache_nominatim_loaded:
    return
  _cache_nominatim_loaded = True
  cache_path = _init_cache_path()
  if not cache_path.exists():
    return
  try:
    with cache_path.open("r", encoding="utf-8") as f:
      data = json.load(f)
    if isinstance(data, dict):
      for k, v in data.items():
        if isinstance(k, str) and isinstance(v, str):
          _cache_pais_localidad[k] = v
  except Exception as e:
    logger.warning("Error cargando cache Nominatim: %s", e)


def _guardar_cache() -> None:
  """Persiste el cache de Nominatim en disco."""
  cache_path = _init_cache_path()
  try:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with cache_path.open("w", encoding="utf-8") as f:
      json.dump(_cache_pais_localidad, f, ensure_ascii=False, indent=0)
  except Exception as e:
    logger.warning("Error guardando cache Nominatim: %s", e)


def obtener_pais_desde_localidad(localidad: str) -> str:
  """
  Obtiene el país a partir del nombre de la localidad usando Nominatim (OpenStreetMap).
  Respeta 1 petición por segundo. Devuelve cadena vacía si no se encuentra o hay error.
  Usa cache en memoria y persistente (JSON) entre reinicios.
  """
  _cargar_cache()
  localidad = (localidad or "").strip()
  if not localidad or len(localidad) < 2:
    return ""
  localidad_norm = localidad.lower()
  if localidad_norm in _cache_pais_localidad:
    return _cache_pais_localidad[localidad_norm]

  try:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
      "q": localidad,
      "format": "json",
      "addressdetails": 1,
      "limit": 1,
    })
    req = urllib.request.Request(url, headers={"User-Agent": "FacturasApp/1.0 (dato pais por localidad)"})
    with urllib.request.urlopen(req, timeout=10) as resp:
      data = json.loads(resp.read().decode())
    time.sleep(1.0)
    if data and isinstance(data, list) and len(data) > 0:
      addr = data[0].get("address") or {}
      pais = (addr.get("country") or "").strip()
      if pais:
        _cache_pais_localidad[localidad_norm] = pais
        _guardar_cache()
        return pais
  except Exception as e:
    logger.warning("Error consultando Nominatim para '%s': %s", localidad, e)
  _cache_pais_localidad[localidad_norm] = ""
  _guardar_cache()
  return ""


def enriquecer_pais_desde_localidad(tabla: list[dict]) -> list[dict]:
  """
  Rellena pais_proveedor cuando esté vacío usando la localidad y una búsqueda en internet (Nominatim).
  """
  for fila in tabla:
    pais = (fila.get("pais_proveedor") or "").strip()
    localidad = (fila.get("localidad_proveedor") or "").strip()
    if not pais and localidad:
      pais = obtener_pais_desde_localidad(localidad)
      if pais:
        fila["pais_proveedor"] = pais
  return tabla
