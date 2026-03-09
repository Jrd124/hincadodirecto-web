"""Homogeneización de proveedores: maestro, normalización, búsqueda por NIF/nombre, sincronización."""
from __future__ import annotations

import csv
import difflib
import logging
import re
import unicodedata
from pathlib import Path

logger = logging.getLogger(__name__)

try:
  from config import EMPRESAS_DIR, PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS
except ImportError:
  from interfaz_facturas.config import EMPRESAS_DIR, PROVEEDORES_MAESTROS_NOMBRE, CAMPOS_PROVEEDORES_MAESTROS

from core import terceros_db, facturas_db


def normalizar_texto_proveedor(s: str) -> str:
  """
  Normaliza un nombre o texto para comparación: minúsculas, sin acentos (NFKD),
  variantes de S.L./S.A. unificadas, espacios colapsados.
  """
  if not s or not isinstance(s, str):
    return ""
  s = s.strip()
  s = unicodedata.normalize("NFKD", s)
  s = "".join(c for c in s if not unicodedata.combining(c))
  s = s.lower()
  for variant in ("s.l.", "s.l", "sl", "s. l.", "s.a.", "s.a", "sa", "s. a."):
    s = re.sub(re.escape(variant) + r"\b", " sl ", s, flags=re.IGNORECASE)
  s = re.sub(r"\s+", " ", s).strip()
  return s


def normalizar_nif(nif: str) -> str:
  """NIF/CIF para comparación: solo letras y dígitos en mayúsculas."""
  if not nif or not isinstance(nif, str):
    return ""
  n = re.sub(r"[\s.\-]", "", nif.strip().upper())
  return n


def cargar_proveedores_maestros(empresa_id: str) -> list[dict]:
  """Carga el listado maestro de proveedores de la empresa.
  Si ya se ha migrado a SQLite (terceros), lee desde BD; si no, desde CSV."""
  try:
    if terceros_db.hay_proveedores_en_bd():
      return terceros_db.get_proveedores_empresa(empresa_id)
  except Exception as e:
    logger.warning("Error leyendo proveedores de BD, fallback a CSV: %s", e)
  return _cargar_proveedores_maestros_csv(empresa_id)


def _cargar_proveedores_maestros_csv(empresa_id: str) -> list[dict]:
  """Carga el listado maestro de proveedores de la empresa desde CSV (fallback)."""
  ruta = EMPRESAS_DIR / empresa_id / PROVEEDORES_MAESTROS_NOMBRE
  if not ruta.exists():
    return []
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
  return lista


def listar_proveedores_para_selector(empresa_id: str) -> list[dict]:
  """
  Listado para el desplegable de edición de facturas: maestro + proveedores únicos
  que aparecen en facturas y aún no están en el maestro. Así aparecen todos los
  proveedores registrados (maestro y los que solo salen en facturas).
  """
  lista = cargar_proveedores_maestros(empresa_id)
  vistos: set[tuple[str, str]] = set()
  for p in lista:
    nom = normalizar_texto_proveedor(p.get("nombre_canonico") or "")
    nif = normalizar_nif(p.get("nif") or "")
    vistos.add((nom, nif))
  try:
    facturas = facturas_db.get_facturas_empresa(empresa_id)
  except Exception as e:
    logger.warning("Error leyendo facturas para selector proveedores: %s", e)
    facturas = []
  for f in facturas:
    prov = (f.get("proveedor") or "").strip()
    nif_prov = (f.get("nif_proveedor") or "").strip()
    if not prov and not nif_prov:
      continue
    key = (normalizar_texto_proveedor(prov), normalizar_nif(nif_prov))
    if key in vistos:
      continue
    vistos.add(key)
    lista.append({
      "nombre_canonico": prov,
      "nif": nif_prov,
      "direccion": "",
      "localidad": (f.get("localidad_proveedor") or "").strip(),
      "pais": (f.get("pais_proveedor") or "").strip(),
      "email": "",
      "telefono": "",
      "centro_coste": "",
    })
  return lista


def guardar_proveedores_maestros(empresa_id: str, lista: list[dict]) -> None:
  """Guarda el listado maestro de proveedores. Si hay datos en SQLite, escribe en BD; si no, en CSV."""
  try:
    if terceros_db.hay_proveedores_en_bd():
      terceros_db.guardar_proveedores_empresa(empresa_id, lista)
      return
  except Exception as e:
    logger.warning("Error guardando proveedores en BD, fallback a CSV: %s", e)
  _guardar_proveedores_maestros_csv(empresa_id, lista)


def _guardar_proveedores_maestros_csv(empresa_id: str, lista: list[dict]) -> None:
  """Guarda el listado maestro de proveedores en CSV (fallback)."""
  EMPRESAS_DIR.mkdir(parents=True, exist_ok=True)
  (EMPRESAS_DIR / empresa_id).mkdir(parents=True, exist_ok=True)
  ruta = EMPRESAS_DIR / empresa_id / PROVEEDORES_MAESTROS_NOMBRE
  with ruta.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=CAMPOS_PROVEEDORES_MAESTROS)
    w.writeheader()
    for p in lista:
      w.writerow({c: p.get(c, "") for c in CAMPOS_PROVEEDORES_MAESTROS})


def sincronizar_proveedores_desde_facturas(empresa_id: str) -> None:
  """Reconstruye el maestro de proveedores a partir de las facturas reales,
  conservando campos manuales como centro_coste, email, telefono."""
  ruta_csv = EMPRESAS_DIR / empresa_id / "base_maestra_facturas.csv"
  if not ruta_csv.exists():
    return

  proveedores_en_facturas: dict[str, dict] = {}
  with ruta_csv.open("r", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
      nombre = (row.get("proveedor") or "").strip()
      if not nombre or nombre.lower() == "proveedor sin nombre":
        continue
      nif = (row.get("nif_proveedor") or "").strip()
      clave = nif.upper() if nif else nombre.lower()
      if clave not in proveedores_en_facturas:
        proveedores_en_facturas[clave] = {
          "nombre_canonico": nombre,
          "nif": nif,
          "direccion": "",
          "localidad": (row.get("localidad_proveedor") or "").strip(),
          "pais": (row.get("pais_proveedor") or "").strip(),
          "email": "",
          "telefono": "",
          "centro_coste": "",
        }

  maestro_actual = cargar_proveedores_maestros(empresa_id)
  campos_manuales = ("centro_coste", "email", "telefono", "direccion")
  indice_maestro: dict[str, dict] = {}
  for p in maestro_actual:
    nif_m = (p.get("nif") or "").strip()
    nombre_m = (p.get("nombre_canonico") or "").strip()
    clave_m = nif_m.upper() if nif_m else nombre_m.lower()
    indice_maestro[clave_m] = p

  nuevo_maestro: list[dict] = []
  for clave, datos in proveedores_en_facturas.items():
    anterior = indice_maestro.get(clave)
    if anterior:
      for campo in campos_manuales:
        val_anterior = (anterior.get(campo) or "").strip()
        if val_anterior:
          datos[campo] = val_anterior
    nuevo_maestro.append(datos)

  guardar_proveedores_maestros(empresa_id, nuevo_maestro)


def similitud_nombres(a: str, b: str) -> float:
  """Devuelve un valor entre 0 y 1 (1 = idénticos tras normalizar)."""
  an = normalizar_texto_proveedor(a)
  bn = normalizar_texto_proveedor(b)
  if not an or not bn:
    return 0.0
  if an == bn:
    return 1.0
  return difflib.SequenceMatcher(None, an, bn).ratio()


def buscar_o_crear_proveedor(
  proveedor_raw: str,
  nif: str,
  localidad: str,
  pais: str,
  direccion: str,
  lista: list[dict],
) -> tuple[str, list[dict], bool]:
  """
  Busca en el listado maestro por NIF (prioritario) o por similitud de nombre.
  Si hay match, devuelve (nombre_canonico, lista_sin_cambios, False).
  Si no hay match, añade un nuevo proveedor y devuelve (nombre_canonico, lista_actualizada, True).
  """
  proveedor_raw = (proveedor_raw or "").strip()
  nif_norm = normalizar_nif(nif or "")
  lista = list(lista)

  # 1) Match por NIF (clave fiable)
  if nif_norm:
    for p in lista:
      if normalizar_nif(p.get("nif") or "") == nif_norm:
        return (p["nombre_canonico"], lista, False)

  # 2) Match por similitud de nombre (evitar duplicados por tildes, "S.L.", etc.)
  if proveedor_raw:
    mejor_ratio = 0.0
    mejor_canonico: str | None = None
    for p in lista:
      canonico = (p.get("nombre_canonico") or "").strip()
      if not canonico:
        continue
      r = similitud_nombres(proveedor_raw, canonico)
      if r > mejor_ratio and r >= 0.82:
        mejor_ratio = r
        mejor_canonico = canonico
    if mejor_canonico:
      return (mejor_canonico, lista, False)

  # 3) Nuevo proveedor: solo si tiene nombre real (no registrar proveedores vacíos/genéricos)
  if not proveedor_raw:
    return ("", lista, False)
  lista.append({
    "nombre_canonico": proveedor_raw,
    "nif": (nif or "").strip(),
    "direccion": (direccion or "").strip(),
    "localidad": (localidad or "").strip(),
    "pais": (pais or "").strip(),
    "email": "",
    "telefono": "",
    "centro_coste": "",
  })
  return (proveedor_raw, lista, True)


def homogeneizar_proveedores(tabla: list[dict], empresa_id: str) -> list[dict]:
  """
  Usa el listado maestro de proveedores: para cada factura, resuelve el nombre
  del proveedor (match por NIF o por nombre similar) y sustituye por el nombre canónico.
  Si el proveedor es nuevo, se añade al maestro.
  """
  lista = cargar_proveedores_maestros(empresa_id)
  guardado = False
  for fila in tabla:
    proveedor = (fila.get("proveedor") or "").strip()
    nif = (fila.get("nif_proveedor") or "").strip()
    localidad = (fila.get("localidad_proveedor") or "").strip()
    pais = (fila.get("pais_proveedor") or "").strip()
    direccion = (fila.get("direccion_proveedor") or "").strip()
    canonico, lista_nueva, creado = buscar_o_crear_proveedor(
      proveedor, nif, localidad, pais, direccion, lista,
    )
    lista = lista_nueva
    fila["proveedor"] = canonico
    if creado:
      guardado = True
  if guardado:
    guardar_proveedores_maestros(empresa_id, lista)
  return tabla
