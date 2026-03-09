"""Archivado de facturas: hash, deduplicación, mover a carpetas por fecha."""
from __future__ import annotations

import hashlib
import logging
import shutil
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


def hash_archivo(ruta: Path) -> str:
  """Calcula SHA-256 del contenido del archivo. Devuelve cadena hexadecimal o vacía si error."""
  try:
    with open(ruta, "rb") as f:
      return hashlib.sha256(f.read()).hexdigest()
  except Exception as e:
    logger.warning("No se pudo calcular hash de %s: %s", ruta, e)
    return ""


def normalizar_fecha_factura_clave(s: str) -> str:
  """Normaliza una fecha a YYYY-MM-DD para comparar facturas (evitar duplicados por formato distinto)."""
  s = (s or "").strip()[:10]
  if not s:
    return ""
  try:
    datetime.strptime(s, "%Y-%m-%d")
    return s
  except Exception as e:
    logger.debug("Fecha no es YYYY-MM-DD '%s': %s", s, e)
  try:
    d = datetime.strptime((s or "").strip(), "%d/%m/%Y")
    return d.strftime("%Y-%m-%d")
  except Exception as e:
    logger.debug("Fecha no es DD/MM/YYYY '%s': %s", s, e)
  try:
    d = datetime.strptime((s or "").strip(), "%d-%m-%Y")
    return d.strftime("%Y-%m-%d")
  except Exception as e:
    logger.debug("Fecha no es DD-MM-YYYY '%s': %s", s, e)
    return s


def clave_logica_factura_proveedor(numero: str, proveedor: str, fecha: str) -> tuple[str, str, str]:
  """Clave normalizada (numero, proveedor, fecha) para detectar duplicados lógicos."""
  n = (numero or "").strip().lower()
  p = (proveedor or "").strip().lower()
  f = normalizar_fecha_factura_clave(fecha or "")
  return (n, p, f)


def añadir_hashes_tabla(tabla: list[dict]) -> None:
  """Añade hash_archivo a cada fila que tenga ruta_archivo (antes de que el archivador mueva el archivo)."""
  for fila in tabla:
    ruta_str = (fila.get("ruta_archivo") or "").strip()
    if not ruta_str:
      fila["hash_archivo"] = ""
      continue
    p = Path(ruta_str)
    fila["hash_archivo"] = hash_archivo(p) if p.exists() else ""


def archivar_por_fecha(filas: list[dict], destino_base: Path, actualizar_ruta_archivo: bool = False) -> list[dict]:
  """
  Mueve archivos a destino_base/{empresa_id}/{Año}/{MM. Mes}/.
  Si actualizar_ruta_archivo es True, también actualiza la clave ruta_archivo (usado en facturas emitidas).
  """
  resultados: list[dict] = []

  for fila in filas:
    ruta_actual = Path(fila["ruta_archivo"])
    empresa_id = fila.get("empresa_id") or "sin_empresa"
    fecha_str = (fila.get("fecha_factura") or "").strip()

    if fecha_str:
      año = "Sin_fecha"
      mes_carpeta = "Sin fecha"
      try:
        dt = datetime.fromisoformat(fecha_str[:10])
        año = str(dt.year)
        mes_carpeta = f"{dt.month:02d}. {dt.strftime('%B')}"
      except Exception as e:
        logger.debug("Fecha no parseable para archivar '%s': %s", fecha_str, e)
        año = "Sin_fecha"
        mes_carpeta = "Sin fecha"
    else:
      año = "Sin_fecha"
      mes_carpeta = "Sin fecha"

    destino_dir = destino_base / empresa_id / año / mes_carpeta
    destino_dir.mkdir(parents=True, exist_ok=True)

    nombre = ruta_actual.name
    destino = destino_dir / nombre

    contador = 2
    while destino.exists():
      destino = destino_dir / f"{ruta_actual.stem}_{contador}{ruta_actual.suffix}"
      contador += 1

    shutil.move(str(ruta_actual), destino)
    fila["ruta_destino"] = str(destino)
    if actualizar_ruta_archivo:
      fila["ruta_archivo"] = str(destino)
    resultados.append(fila)

  return resultados
