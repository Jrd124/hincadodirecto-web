from __future__ import annotations

import base64
import csv
import difflib
import hashlib
import io
import json
import logging
import os
import re
import shutil
import sqlite3
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile

logger = logging.getLogger(__name__)
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

# Configurar ruta de Tesseract: variable de entorno > ruta Windows > ruta Linux > PATH
_TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
if _TESSERACT_CMD and Path(_TESSERACT_CMD).exists():
  pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD
elif Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe").exists():
  pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
elif Path("/usr/bin/tesseract").exists():
  pytesseract.pytesseract.tesseract_cmd = "/usr/bin/tesseract"
from flask import Flask, Blueprint, jsonify, request, send_file, send_from_directory, Response

from config import (
  BASE_DIR,
  BANCOS_DIR,
  CAMPOS_PROVEEDORES_MAESTROS,
  DATOS_DIR,
  EMPRESAS_CLIENTE,
  EMPRESAS_DIR,
  FACTURAS_EMITIDAS_DIR,
  FACTURAS_RECIBIDAS_DIR,
  GESTION_DB,
  MOVIMIENTOS_DB,
  NOMBRES_EMPRESAS_CLIENTE,
  OPENAI_API_KEY,
  OPENROUTESERVICE_API_KEY,
  PROVEEDORES_MAESTROS_NOMBRE,
  SUBIDAS_DIR,
  client,
)
from core.facturas_servicios import filtrar_filas_csv as _filtrar_filas_csv
from core.transporte_servicios import buscar_ruta_y_proveedores as _buscar_ruta_y_proveedores
from core import terceros_db, facturas_db, tarjetas_db, facturas_cliente_db

# ─── Validación de entrada centralizada (respuestas 400 consistentes) ─────────

def _bad_request(mensaje: str):
  """Devuelve respuesta 400 con formato consistente: { \"error\": \"mensaje\" }."""
  return jsonify({"error": mensaje}), 400


def _validar_empresa_id_requerido(val) -> tuple:
  """
  Valida que empresa_id esté presente y no vacío tras strip().
  Devuelve (empresa_id_limpio, None) si es válido, o (None, (response, 400)) si no.
  """
  if val is None:
    return None, _bad_request("Falta empresa_id")
  empresa_id = (val if isinstance(val, str) else str(val or "")).strip()
  if not empresa_id:
    return None, _bad_request("Falta empresa_id")
  return empresa_id, None


# ─── Configuración de rutas (Blueprints por dominio) ───────────────────────────

facturas_proveedores_bp = Blueprint("facturas_proveedores", __name__)
proveedores_bp = Blueprint("proveedores", __name__)
facturas_clientes_bp = Blueprint("facturas_clientes", __name__)
archivo_bp = Blueprint("archivo", __name__)
control_calidad_bp = Blueprint("control_calidad", __name__)
bancos_bp = Blueprint("bancos", __name__)
transporte_bp = Blueprint("transporte", __name__)

# Workers para procesamiento en paralelo del pipeline de facturas (OpenAI/vision)
_MAX_WORKERS_EXTRACTOR_LLM = 4


def ensure_dirs() -> None:
  """Crea directorios e inicializa todas las bases de datos."""
  DATOS_DIR.mkdir(exist_ok=True)
  SUBIDAS_DIR.mkdir(exist_ok=True)
  FACTURAS_RECIBIDAS_DIR.mkdir(exist_ok=True)
  FACTURAS_EMITIDAS_DIR.mkdir(exist_ok=True)
  EMPRESAS_DIR.mkdir(exist_ok=True)
  BANCOS_DIR.mkdir(parents=True, exist_ok=True)
  # Inicializar todas las BDs al arranque (idempotente gracias a flags internos)
  facturas_db.init_facturas_db()
  facturas_cliente_db.init_facturas_cliente_db()
  terceros_db.init_terceros_db()
  tarjetas_db.init_tarjetas_db()
  _init_movimientos_db()


def _ocr_pagina_fitz(page: "fitz.Page") -> str:
  """Renderiza una página PDF a imagen y extrae texto con OCR (Tesseract)."""
  try:
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img_bytes = pix.tobytes("png")
    img_pil = Image.open(io.BytesIO(img_bytes))
    return pytesseract.image_to_string(img_pil, lang="spa+eng")
  except Exception as e:
    logger.warning("OCR falló en página: %s", e)
    return ""


def _leer_texto_factura(ruta: Path) -> str:
  """
  Obtiene texto de una factura (PDF o imagen). En PDFs usa bloques y además
  una pasada OCR sobre la página renderizada para revisar/completar con OCR.
  """
  try:
    if ruta.suffix.lower() == ".pdf":
      with fitz.open(ruta) as doc:
        partes = []
        partes_ocr = []
        for page in doc:
          try:
            blocks = page.get_text("blocks")
            if blocks:
              lines = [b[4].strip() for b in blocks if b[4].strip()]
              if lines:
                partes.append("\n".join(lines))
            if not partes or not partes[-1].strip():
              t = page.get_text()
              if t.strip():
                partes.append(t)
          except Exception as e:
            logger.debug("Fallback get_text en página: %s", e)
            t = page.get_text()
            if t.strip():
              partes.append(t)
          if not partes or not partes[-1].strip():
            for img_ref in page.get_images():
              try:
                xref = img_ref[0]
                base = doc.extract_image(xref)
                img_pil = Image.open(io.BytesIO(base["image"]))
                t2 = pytesseract.image_to_string(img_pil, lang="spa+eng")
                if t2.strip():
                  partes.append(t2)
                  break
              except Exception as e:
                logger.debug("OCR de imagen embebida falló: %s", e)
          texto_ocr = _ocr_pagina_fitz(page)
          if texto_ocr.strip():
            partes_ocr.append(texto_ocr.strip())
        texto_pdf = "\n".join(partes) if partes else ""
        texto_ocr_completo = "\n\n".join(partes_ocr) if partes_ocr else ""
        if texto_pdf and texto_ocr_completo:
          return texto_pdf + "\n\n--- OCR ---\n\n" + texto_ocr_completo
        return texto_pdf or texto_ocr_completo
    else:
      # Imagen (jpg, jpeg, png, etc.)
      try:
        with Image.open(ruta) as img:
          # Corregir orientación según EXIF (fotos de móvil giradas)
          try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
          except Exception as e:
            logger.debug("No se pudo corregir orientación EXIF: %s", e)

          if img.mode not in ("L", "RGB", "RGBA"):
            img = img.convert("RGB")

          # Aumentar resolución si la imagen es pequeña (mejora el OCR en fotos)
          min_lado = min(img.size)
          if min_lado < 1000:
            factor = 1000 / float(min_lado)
            nuevo_tamaño = (int(img.width * factor), int(img.height * factor))
            img = img.resize(nuevo_tamaño, Image.LANCZOS)

          # Pasar a escala de grises y mejorar contraste automático
          img_gray = img.convert("L")
          try:
            from PIL import ImageOps
            img_gray = ImageOps.autocontrast(img_gray)
          except Exception as e:
            logger.debug("No se pudo aplicar autocontraste: %s", e)

          # Primera pasada OCR (bloque de texto estándar)
          texto = pytesseract.image_to_string(
            img_gray,
            lang="spa+eng",
            config="--oem 3 --psm 6",
          )
          if texto.strip():
            return texto

          # Segunda pasada alternativa por si el layout es más raro
          texto_alt = pytesseract.image_to_string(
            img_gray,
            lang="spa+eng",
            config="--oem 3 --psm 3",
          )
          return texto_alt
      except Exception as e:
        logger.warning("Error leyendo imagen %s: %s", ruta.name, e)
        return ""
  except Exception as e:
    logger.error("Error leyendo factura %s: %s", ruta, e)
    return ""


def _normalizar_texto(texto: str) -> str:
  """Colapsa espacios y unifica saltos de línea para búsquedas más robustas."""
  if not texto:
    return ""
  texto = re.sub(r"[ \t]+", " ", texto)
  texto = re.sub(r"\n\s*\n", "\n", texto)
  return texto.strip()


def _limpiar_json_respuesta(texto: str) -> str:
  """Elimina bloques markdown (```json ... ```) que algunos modelos envuelven alrededor del JSON."""
  t = texto.strip()
  if t.startswith("```"):
    primera_linea_fin = t.find("\n")
    if primera_linea_fin != -1:
      t = t[primera_linea_fin + 1:]
    else:
      t = t[3:]
  if t.endswith("```"):
    t = t[:-3]
  return t.strip()


def _extraer_campos_llm(texto: str, empresa_id: str, tipo: str = "proveedor") -> dict:
  """
  Usa OpenAI (gpt-4.1-mini) para extraer los campos de la factura a partir del texto OCR/Plano.
  ``tipo`` controla qué prompt y qué claves se esperan ("proveedor" o "cliente").
  """
  if client is None:
    return {}
  if tipo == "cliente":
    system_prompt = _prompt_extraccion_factura_cliente(empresa_id)
    claves_defecto = _CLAVES_FACTURA_CLIENTE
  else:
    system_prompt = _prompt_extraccion_factura(empresa_id)
    claves_defecto = [
      "proveedor", "cif_nif", "pais_proveedor", "localidad_proveedor",
      "resumen_concepto", "numero_factura", "fecha_factura",
      "bases", "retenciones", "total_factura", "total_a_pagar",
    ]
  try:
    resp = client.chat.completions.create(
      model="gpt-4.1-mini",
      messages=[
        {"role": "system", "content": system_prompt},
        {
          "role": "user",
          "content": "Texto completo (OCR/Plano) de la factura:\n\n" + texto,
        },
      ],
      temperature=0,
    )
    contenido = _limpiar_json_respuesta(resp.choices[0].message.content or "")
    datos = json.loads(contenido)
    if not isinstance(datos, dict):
      return {}
    for clave in claves_defecto:
      datos.setdefault(clave, "" if clave not in ["bases", "retenciones"] else [])
    return datos
  except Exception as e:
    logger.warning("Error extrayendo campos LLM (tipo=%s): %s", tipo, e)
    return {}


def _prompt_extraccion_factura(empresa_id: str) -> str:
  """Prompt de sistema compartido para extracción por texto (LLM) y por imagen (visión)."""
  cliente_nombre = EMPRESAS_CLIENTE.get(empresa_id, "").strip()
  return (
    "Eres un asistente experto en contabilidad que extrae datos de facturas en español.\n"
    "Debes leer el contenido (texto o imagen) de una sola factura y devolver SIEMPRE un JSON válido con esta estructura EXACTA:\n"
    "{\n"
    '  \"proveedor\": string,\n'
    '  \"cif_nif\": string,\n'
    '  \"pais_proveedor\": string,\n'
    '  \"localidad_proveedor\": string,\n'
    '  \"resumen_concepto\": string,\n'
    '  \"numero_factura\": string,\n'
    '  \"fecha_factura\": string (formato YYYY-MM-DD),\n'
    '  \"bases\": [\n'
    "    { \"tipo_iva\": string, \"base\": string, \"iva\": string, \"cuota\": string }\n"
    "  ],\n"
    '  \"retenciones\": [\n'
    "    { \"tipo\": string, \"base\": string, \"porcentaje\": string, \"importe\": string }\n"
    "  ],\n"
    '  \"total_factura\": string,\n'
    '  \"total_a_pagar\": string\n'
    "}\n"
    f"La empresa seleccionada por el usuario como CLIENTE de la factura es: \"{cliente_nombre}\".\n"
    "Las siguientes sociedades son empresas del cliente (pueden aparecer como cliente o proveedor en facturas intragrupo):\n"
    + "".join(f"- {n}\n" for n in NOMBRES_EMPRESAS_CLIENTE)
    + "Reglas para decidir el PROVEEDOR:\n"
    "- Si en el texto aparece el nombre del cliente seleccionado y otro nombre distinto, ese otro es el proveedor.\n"
    "- Si en el texto aparecen DOS de estas empresas del cliente, la que coincide con el nombre seleccionado es el CLIENTE,\n"
    "  y la otra empresa es el PROVEEDOR.\n"
    "- Nunca pongas como \"proveedor\" el mismo nombre de la empresa seleccionada por el usuario como cliente.\n"
    "Comprueba también que los importes tengan sentido: la suma de bases imponibles más las cuotas de IVA\n"
    "menos las retenciones debe aproximarse al total a pagar (salvo pequeños redondeos).\n"
    "Si en el texto hay varios totales, elige el que cumpla mejor esta relación; si no se especifica un\n"
    "total claro, calcula \"total_a_pagar\" como suma de bases y cuotas de IVA menos retenciones.\n"
    "Si algún dato no aparece claramente, deja el campo vacío (\"\" o listas vacías), pero NO inventes valores.\n"
    "Si hay varios tipos de IVA, incluye cada uno como un elemento separado en \"bases\".\n"
    "No devuelvas nada más que el JSON."
  )


def _prompt_extraccion_factura_cliente(empresa_id: str) -> str:
  """Prompt de sistema para extracción de facturas emitidas a clientes."""
  emisor_nombre = EMPRESAS_CLIENTE.get(empresa_id, "").strip()
  return (
    "Eres un asistente experto en contabilidad que extrae datos de facturas emitidas en español.\n"
    "La factura que vas a analizar ha sido EMITIDA por la empresa del usuario a un CLIENTE.\n"
    f"La empresa emisora es: \"{emisor_nombre}\".\n"
    "Debes leer el contenido (texto o imagen) de la factura y devolver SIEMPRE un JSON válido con esta estructura EXACTA:\n"
    "{\n"
    '  \"fecha_factura\": string (formato YYYY-MM-DD),\n'
    '  \"cliente\": string (nombre del cliente al que se factura),\n'
    '  \"cif_nif\": string (CIF/NIF del cliente),\n'
    '  \"pais\": string,\n'
    '  \"localidad\": string,\n'
    '  \"proyecto\": string (nombre o referencia del proyecto),\n'
    '  \"tipologia\": string (\"Administración\" o \"Producción\"),\n'
    '  \"num_hincadoras\": string (número de hincadoras utilizadas),\n'
    '  \"num_ayudantes\": string (número de ayudantes, si aplica),\n'
    '  \"pricing_servicio\": string (importe del servicio),\n'
    '  \"pricing_transporte\": string (importe de transporte, si aplica),\n'
    '  \"iva\": string (importe total de IVA),\n'
    '  \"total_a_pagar\": string (total a pagar por el cliente),\n'
    '  \"numero_factura\": string\n'
    "}\n"
    "Reglas para identificar al CLIENTE:\n"
    f"- La empresa emisora es \"{emisor_nombre}\". El otro nombre que aparezca en la factura es el CLIENTE.\n"
    "- Nunca pongas como \"cliente\" el nombre de la empresa emisora.\n"
    "Reglas para TIPOLOGÍA:\n"
    "- Si el concepto menciona \"mensualidad\", \"alquiler\", \"cuota\" o similar → \"Administración\".\n"
    "- Si el concepto menciona \"certificación\", \"hincado\", \"producción\", \"postes\" o similar → \"Producción\".\n"
    "Reglas para AYUDANTES:\n"
    "- Si el concepto menciona \"con ayudante\" o similar, indica en num_ayudantes el número (\"1\" si no especifica cuántos).\n"
    "Si algún dato no aparece claramente, deja el campo vacío (\"\"), pero NO inventes valores.\n"
    "No devuelvas nada más que el JSON."
  )


_CLAVES_FACTURA_CLIENTE = [
  "fecha_factura", "cliente", "cif_nif", "pais", "localidad",
  "proyecto", "tipologia", "num_hincadoras", "num_ayudantes",
  "pricing_servicio", "pricing_transporte", "iva", "total_a_pagar",
  "numero_factura",
]


def _extraer_campos_vision(ruta: Path, empresa_id: str, tipo: str = "proveedor") -> dict:
  """
  Extrae campos de una factura en formato imagen usando el modelo de visión de OpenAI (gpt-4o-mini).
  Se usa en cascada cuando el LLM sobre texto devuelve vacío o casi sin datos.
  ``tipo`` controla qué prompt y qué claves se esperan ("proveedor" o "cliente").
  """
  if client is None:
    return {}
  suf = (ruta.suffix or "").lower()
  if suf not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
    return {}
  try:
    raw = ruta.read_bytes()
  except Exception as e:
    logger.warning("No se pudo leer imagen para visión %s: %s", ruta.name, e)
    return {}
  b64 = base64.standard_b64encode(raw).decode("ascii")
  mime = "image/jpeg" if suf in (".jpg", ".jpeg") else "image/png" if suf == ".png" else "image/webp" if suf == ".webp" else "image/gif"
  if tipo == "cliente":
    system_prompt = _prompt_extraccion_factura_cliente(empresa_id)
    claves_defecto = _CLAVES_FACTURA_CLIENTE
  else:
    system_prompt = _prompt_extraccion_factura(empresa_id)
    claves_defecto = [
      "proveedor", "cif_nif", "pais_proveedor", "localidad_proveedor",
      "resumen_concepto", "numero_factura", "fecha_factura",
      "bases", "retenciones", "total_factura", "total_a_pagar",
    ]
  user_content = [
    {"type": "text", "text": "Extrae los datos de esta factura (imagen) y devuelve ÚNICAMENTE un JSON con la estructura indicada. No devuelvas nada más que el JSON."},
    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
  ]
  try:
    resp = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
      ],
      temperature=0,
    )
    contenido = _limpiar_json_respuesta(resp.choices[0].message.content or "")
    datos = json.loads(contenido)
    if not isinstance(datos, dict):
      return {}
    for clave in claves_defecto:
      datos.setdefault(clave, "" if clave not in ["bases", "retenciones"] else [])
    return datos
  except Exception as e:
    logger.warning("Error extrayendo campos visión %s (tipo=%s): %s", ruta.name, tipo, e)
    return {}


def _registrar_vision_control(empresa_id: str, nombre_archivo: str, ruta_archivo: str) -> None:
  """Registra en control_vision_facturas.csv el uso de visión para control de calidad y coste."""
  control_path = DATOS_DIR / "control_vision_facturas.csv"
  cabecera = ["fecha_hora", "empresa_id", "nombre_archivo", "ruta_archivo"]
  fila = [datetime.now().isoformat(), empresa_id, nombre_archivo, ruta_archivo]
  existe = control_path.exists()
  try:
    with control_path.open("a", newline="", encoding="utf-8") as f:
      w = csv.writer(f)
      if not existe:
        w.writerow(cabecera)
      w.writerow(fila)
  except Exception as e:
    logger.debug("No se pudo registrar uso de visión: %s", e)


def _normalizar_importe_str(valor: str) -> float | None:
  """
  Convierte un número con formato español o internacional a float.
  Acepta también símbolo € al final o al inicio.
  """
  valor = valor.strip().replace(" ", "").replace("€", "").strip()
  if not valor:
    return None
  if "," in valor and "." in valor:
    valor = valor.replace(".", "").replace(",", ".")
  elif "," in valor:
    valor = valor.replace(",", ".")
  try:
    return float(valor)
  except ValueError:
    return None


# Patrón para importes: número con opcional . como miles y , o . como decimal
_RE_IMPORTE = re.compile(r"\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?")


def _extraer_ultimo_importe_linea(linea: str) -> str:
  """Extrae el último número que parezca un importe de la línea. Normaliza formato español (1.234,56)."""
  candidatos = _RE_IMPORTE.findall(linea)
  if not candidatos:
    return ""
  s = candidatos[-1]
  if "," in s:
    s = s.replace(".", "").replace(",", ".")
  elif s.count(".") == 1 and len(s.split(".")[-1]) == 2:
    pass
  return s


def _normalizar_fecha_a_iso(fecha_str: str) -> str:
  """Convierte fecha en formato dd/mm/yyyy o dd-mm-yyyy a YYYY-MM-DD para el archivador."""
  fecha_str = fecha_str.strip()
  if not fecha_str:
    return ""
  # Ya en formato ISO
  if re.match(r"\d{4}-\d{2}-\d{2}", fecha_str):
    return fecha_str[:10]
  # dd/mm/yyyy o dd-mm-yyyy
  m = re.match(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})", fecha_str)
  if m:
    d, mes, a = m.group(1), m.group(2), m.group(3)
    return f"{a}-{mes.zfill(2)}-{d.zfill(2)}"
  return fecha_str


def _buscar_primera_fecha(texto: str) -> str:
  """
  Busca una fecha en la factura. Prioriza líneas que contengan "fecha" o "date".
  """
  texto_norm = _normalizar_texto(texto)
  lineas = texto_norm.splitlines()
  # Primero buscar en líneas con palabra "fecha"
  for linea in lineas:
    if "fecha" in linea.lower() or "date" in linea.lower():
      m = re.search(
        r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})|(\d{4})[/\-\.](\d{2})[/\-\.](\d{2})",
        linea,
      )
      if m:
        g = m.groups()
        if g[3] is not None:
          return f"{g[3]}-{g[4]}-{g[5]}"
        return _normalizar_fecha_a_iso(f"{g[0]}/{g[1]}/{g[2]}")
  # Buscar cualquier fecha en el texto
  patrones = [
    r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b",
    r"\b(\d{1,2})-(\d{1,2})-(\d{4})\b",
    r"\b(\d{4})-(\d{2})-(\d{2})\b",
  ]
  for patron in patrones:
    m = re.search(patron, texto_norm)
    if m:
      g = m.groups()
      if len(g) == 3 and len(g[0]) == 4 and g[0].isdigit():
        return f"{g[0]}-{g[1]}-{g[2]}"
      return _normalizar_fecha_a_iso(f"{g[0]}/{g[1]}/{g[2]}")
  return ""


def _buscar_nif_cif(texto: str) -> str:
  """
  Busca NIF/CIF: primero tras etiqueta "CIF"/"NIF", luego por patrón en el texto.
  Evita confundir con números de factura o teléfono.
  """
  lineas = texto.splitlines()
  for linea in lineas:
    l = linea.lower()
    if "cif" in l or "nif" in l or "cif/nif" in l or "nif/cif" in l:
      # Valor después de : o en la misma línea
      after = re.sub(r"^.*?(?:cif|nif)[\s\/:\-]*", "", linea, flags=re.IGNORECASE).strip()
      # Quitar "B", "A" suelto y quedarnos con el identificador
      candidato = re.sub(r"^[A-Za-z]\s*", "", after)
      # CIF español: letra + 8 dígitos/caracter
      m = re.search(r"[A-Z]\d{7}[0-9A-J]", candidato, re.IGNORECASE)
      if m:
        return m.group(0)
      m = re.search(r"\d{8}[A-Z]", candidato, re.IGNORECASE)
      if m:
        return m.group(0)
      if re.match(r"^[A-Z0-9]{8,12}$", candidato.replace(" ", "")):
        return candidato.replace(" ", "")[:12]
  # Búsqueda por patrón en todo el texto (evitar números que sean claramente importes)
  patron_cif = r"\b[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]\b"
  m = re.search(patron_cif, texto, re.IGNORECASE)
  if m:
    return m.group(0)
  patron_dni = r"\b\d{8}[A-Z]\b"
  m = re.search(patron_dni, texto, re.IGNORECASE)
  if m:
    return m.group(0)
  return ""


def _buscar_numero_factura(texto: str) -> str:
  """
  Busca el número/código de factura. Prueba varias formas: "Factura nº X", "Factura: X", número en línea siguiente.
  """
  lineas = [l.strip() for l in texto.splitlines() if l.strip()]
  for i, linea in enumerate(lineas):
    l = linea.lower()
    if "factura" not in l:
      continue
    # Misma línea: después de : o después de nº / no / num
    after_colon = re.split(r"[\:\-]", linea, maxsplit=1)
    after = after_colon[-1].strip() if len(after_colon) > 1 else ""
    if after:
      numero = re.sub(r"(?i)factura|nº|no\.?|num\.?|number|n\.?", "", after).strip()
      numero = re.sub(r"^[^\w\d]+", "", numero)
      if re.search(r"\d", numero):
        return numero[:60].strip()
    # Si en esta línea solo está "Factura" o "Factura nº", mirar la siguiente
    if i + 1 < len(lineas) and re.search(r"\d", lineas[i + 1]):
      return lineas[i + 1].strip()[:60]
  # Búsqueda por patrón: "nº 12345" o "Nº 12345" en cualquier parte
  m = re.search(r"(?:factura\s*)?nº?\s*[:\-]?\s*([A-Z0-9\/\-]+)", texto, re.IGNORECASE)
  if m:
    return m.group(1).strip()[:60]
  m = re.search(r"(?:factura|invoice)\s*[:\-]?\s*([A-Z0-9\/\-]+)", texto, re.IGNORECASE)
  if m and re.search(r"\d", m.group(1)):
    return m.group(1).strip()[:60]
  return ""


def _parece_nombre_empresa(linea: str, excluir_num_factura: str) -> bool:
  """True si la línea parece un nombre de empresa y no es número de factura ni 'Factura nº'."""
  l = linea.strip()
  if not l or len(l) < 2:
    return False
  if "factura" in l.lower() and re.search(r"nº|no\.|num|number", l, re.IGNORECASE):
    return False
  if excluir_num_factura and l == excluir_num_factura:
    return False
  if re.match(r"^[\d\s\/\-\.]+$", l):
    return False
  if re.match(r"^[A-Z0-9\/\-]{4,}$", l) and not re.search(r"[a-záéíóúñ]", l):
    return False
  return True


def _buscar_proveedor_y_localizacion(texto: str, numero_factura: str = "") -> tuple[str, str, str]:
  """
  Proveedor: líneas anteriores a CIF/NIF que parezcan nombre de empresa (no "Factura nº X").
  País y localidad: código postal 5 dígitos o palabra España.
  """
  lineas = [l.strip() for l in texto.splitlines() if l.strip()]
  if not lineas:
    return "", "", ""

  proveedor = ""
  pais = ""
  localidad = ""

  for i, linea in enumerate(lineas):
    if re.search(r"\b(CIF|NIF|NIF\/CIF)\b", linea, re.IGNORECASE):
      candidatos = [lineas[j] for j in range(max(0, i - 5), i)]
      for lin in candidatos:
        if _parece_nombre_empresa(lin, numero_factura):
          proveedor = lin[:150]
          break
      if not proveedor and candidatos:
        proveedor = candidatos[0][:150]
      break

  if not proveedor:
    for i, linea in enumerate(lineas):
      if "proveedor" in linea.lower() or "emisor" in linea.lower() or "remitente" in linea.lower():
        proveedor = re.sub(r"(?i)proveedor[:\s]*|emisor[:\s]*|remitente[:\s]*", "", linea).strip()[:150]
        if not proveedor and i > 0 and _parece_nombre_empresa(lineas[i - 1], numero_factura):
          proveedor = lineas[i - 1][:150]
        break
  if not proveedor:
    for lin in lineas:
      if _parece_nombre_empresa(lin, numero_factura):
        proveedor = lin[:150]
        break
  if not proveedor and lineas:
    proveedor = lineas[0][:150]

  for linea in lineas:
    cp_match = re.search(r"\b(28\d{3}|0[1-9]\d{2}|[1-4]\d{4}|5[0-2]\d{3})\s+(.+)", linea)
    if cp_match:
      localidad = (cp_match.group(2) or "").strip()[:100]
      if not pais:
        pais = "España"
      break
  for linea in lineas:
    if "españa" in linea.lower() or "spain" in linea.lower():
      pais = "España"
      if not localidad and re.search(r"\d{5}\s*\w+", linea):
        localidad = re.sub(r"^.*?\d{5}\s*", "", linea).strip()[:100]
      break
  if not pais and any("españa" in l.lower() or "spain" in l.lower() for l in lineas):
    pais = "España"

  return proveedor[:100], pais[:50], localidad[:100]


def _buscar_concepto(texto: str, proveedor: str) -> str:
  """
  Concepto/descripción. No devolver el nombre del proveedor ni líneas que parezcan CIF/dirección.
  """
  lineas = [l.strip() for l in texto.splitlines() if l.strip()]
  proveedor_norm = proveedor.lower().strip() if proveedor else ""

  for i, linea in enumerate(lineas):
    l = linea.lower()
    if "concepto" not in l and "descripción" not in l and "descripcion" not in l and "detalle" not in l and "servicios" not in l:
      continue
    valor = re.sub(r"(?i)concepto[:\-]?|descripci[oó]n[:\-]?|detalle[:\-]?|servicios[:\-]?", "", linea).strip()
    if valor and valor.lower() != proveedor_norm and "cif" not in valor.lower() and "nif" not in valor.lower():
      if len(valor) > 3:
        return valor[:250]
    if i + 1 < len(lineas):
      sig = lineas[i + 1].strip()
      if sig and sig.lower() != proveedor_norm and "cif" not in sig.lower() and "nif" not in sig.lower():
        if not re.match(r"^[A-Z]?\d{7,}", sig):
          return sig[:250]
  return ""


def _buscar_importes(texto: str) -> dict:
  """
  Busca importes: bases, IVA, retenciones, total. Etiquetas en español.
  También asigna por contexto: si la línea anterior tiene la etiqueta y la actual solo tiene un número.
  """
  lineas = texto.splitlines()
  bases: list[str] = []
  ivas_cuota: list[str] = []
  retenciones: list[str] = []
  total_factura = ""
  total_a_pagar = ""

  for idx, linea in enumerate(lineas):
    l = linea.lower().strip()
    imp = _extraer_ultimo_importe_linea(linea)
    previa = lineas[idx - 1].lower() if idx > 0 else ""

    if not imp:
      continue

    if "base imponible" in l or "base imponíble" in l or l.startswith("base ") or "importe neto" in l or "subtotal" in l:
      bases.append(imp)
    elif "base imponible" in previa or "base imponíble" in previa or "importe neto" in previa:
      bases.append(imp)
    elif "retenci" in l or "irpf" in l:
      retenciones.append(imp)
    elif "retenci" in previa or "irpf" in previa:
      retenciones.append(imp)
    elif "cuota" in l and "iva" in l or ("iva" in l and ("cuota" in l or "importe" in l or "%" in l)):
      ivas_cuota.append(imp)
    elif "cuota" in previa and "iva" in previa:
      ivas_cuota.append(imp)
    elif "total a pagar" in l or "total pagar" in l or "importe total" in l or "total documento" in l:
      total_a_pagar = imp
    elif "total a pagar" in previa or "importe total" in previa:
      total_a_pagar = imp
    elif "total factura" in l or ("total" in l and "base" not in l and "iva" not in l and "imponible" not in l):
      if not total_factura:
        total_factura = imp
      total_a_pagar = total_a_pagar or imp
    elif "total factura" in previa or (previa.strip() == "total"):
      total_factura = total_factura or imp
      total_a_pagar = total_a_pagar or imp
    elif re.match(r"^\s*total\s*$", l):
      total_a_pagar = total_a_pagar or imp

  if not total_a_pagar and total_factura:
    total_a_pagar = total_factura

  if not bases and not total_a_pagar:
    for idx, linea in enumerate(lineas):
      imp = _extraer_ultimo_importe_linea(linea)
      if not imp or _normalizar_importe_str(imp) is None:
        continue
      v = _normalizar_importe_str(imp)
      if v is None or v <= 0:
        continue
      previa = (lineas[idx - 1] + " " + linea).lower() if idx > 0 else linea.lower()
      if "base" in previa or "imponible" in previa:
        bases.append(imp)
      elif "total" in previa and "iva" not in previa:
        total_a_pagar = total_a_pagar or imp
      elif "iva" in previa and "cuota" in previa:
        ivas_cuota.append(imp)
      elif "retenci" in previa:
        retenciones.append(imp)

  def sumar(lista: list[str]) -> float | None:
    vals = [_normalizar_importe_str(x) for x in lista]
    vals = [v for v in vals if v is not None]
    return sum(vals) if vals else None

  return {
    "base_imponible_total": sumar(bases),
    "base_imponible_detalle": "; ".join(bases),
    "iva_cuota_total": sumar(ivas_cuota),
    "iva_cuota_detalle": "; ".join(ivas_cuota),
    "retenciones_total": sumar(retenciones),
    "retenciones_detalle": "; ".join(retenciones),
    "total_factura": total_factura,
    "total_a_pagar": total_a_pagar,
  }


def _recolector(carpeta: Path) -> list[Path]:
  """
  Recolector: devuelve los archivos de la carpeta de entrada.
  """
  if not carpeta.exists() or not carpeta.is_dir():
    return []
  return [p for p in carpeta.iterdir() if p.is_file()]


def _extraer_una_factura_llm_proveedor(ruta: Path, empresa_id: str) -> dict | None:
  """
  Extrae los campos de una sola factura (proveedor) con visión y/o LLM.
  Devuelve la fila de datos o None si no se pudo extraer (equivalente a continue).
  Usado por _extractor_llm para ejecución en paralelo.
  """
  usar_vision = False
  datos: dict = {}
  suf = (ruta.suffix or "").lower()
  es_imagen = suf in (".jpg", ".jpeg", ".png", ".webp", ".gif")

  if es_imagen:
    datos = _extraer_campos_vision(ruta, empresa_id)
    if datos:
      usar_vision = True
      _registrar_vision_control(empresa_id, ruta.name, str(ruta))

  texto = ""

  if not datos:
    texto = _leer_texto_factura(ruta)
    texto = _normalizar_texto(texto)
    datos = _extraer_campos_llm(texto, empresa_id, tipo="proveedor")

  if not datos:
    return None

  claves_clave = ["proveedor", "cif_nif", "fecha_factura", "numero_factura", "total_a_pagar", "total_factura"]

  def _es_casi_sin_datos(d: dict) -> bool:
    num_no_vacias = sum(
      1
      for c in claves_clave
      if str(d.get(c, "") or "").strip()
    )
    bases_raw_local = d.get("bases") or []
    rets_raw_local = d.get("retenciones") or []
    return num_no_vacias <= 2 and not bases_raw_local and not rets_raw_local

  if _es_casi_sin_datos(datos):
    if es_imagen and usar_vision:
      if not texto:
        texto = _leer_texto_factura(ruta)
        texto = _normalizar_texto(texto)
      datos_texto = _extraer_campos_llm(texto, empresa_id, tipo="proveedor")
      if datos_texto and not _es_casi_sin_datos(datos_texto):
        datos = datos_texto
        usar_vision = False
    elif es_imagen and not usar_vision:
      datos_vision = _extraer_campos_vision(ruta, empresa_id)
      if datos_vision and not _es_casi_sin_datos(datos_vision):
        datos = datos_vision
        usar_vision = True
        _registrar_vision_control(empresa_id, ruta.name, str(ruta))

  if _es_casi_sin_datos(datos):
    return None

  bases_raw = datos.get("bases") or []
  rets_raw = datos.get("retenciones") or []
  bases = bases_raw
  retenciones = rets_raw

  def _suma_lista(lst: list[dict], campo: str) -> float:
    total = 0.0
    for item in lst:
      val = _normalizar_importe_str(str(item.get(campo, "")))
      if val is not None:
        total += val
    return total

  base_total = _suma_lista(bases, "base")
  iva_total = _suma_lista(bases, "cuota")
  ret_total = _suma_lista(retenciones, "importe")

  def fmt(v: float | None) -> str:
    return "" if v is None else f"{v:.2f}"

  base_str = fmt(base_total)
  iva_str = fmt(iva_total)
  ret_str = fmt(ret_total)

  total_factura = str(datos.get("total_factura") or "").strip()
  total_a_pagar = str(datos.get("total_a_pagar") or "").strip() or total_factura

  return {
    "ruta_archivo": str(ruta),
    "empresa_id": empresa_id,
    "fecha_factura": str(datos.get("fecha_factura") or "").strip(),
    "proveedor": str(datos.get("proveedor") or "").strip(),
    "nif_proveedor": str(datos.get("cif_nif") or "").strip(),
    "pais_proveedor": str(datos.get("pais_proveedor") or "").strip(),
    "localidad_proveedor": str(datos.get("localidad_proveedor") or "").strip(),
    "resumen_concepto": str(datos.get("resumen_concepto") or "").strip(),
    "numero_factura": str(datos.get("numero_factura") or "").strip(),
    "base_imponible_total": base_str,
    "base_imponible_detalle": "; ".join(
      f"{(b.get('base') or '').strip()}@{(b.get('tipo_iva') or '').strip()}" for b in bases
    ).strip(),
    "iva_cuota_total": iva_str,
    "iva_cuota_detalle": "; ".join(
      f"{(b.get('cuota') or '').strip()}@{(b.get('tipo_iva') or '').strip()}" for b in bases
    ).strip(),
    "retenciones_total": ret_str,
    "retenciones_detalle": "; ".join(
      f"{(r.get('importe') or '').strip()}@{(r.get('tipo') or '').strip()}" for r in retenciones
    ).strip(),
    "total_factura": total_factura,
    "total_a_pagar": total_a_pagar,
    "base_imponible": base_str,
    "iva": iva_str,
    "total": total_a_pagar,
    "categoria": "",
    "extraccion_vision": "1" if usar_vision else "",
  }


def _extractor_llm(rutas: list[Path], empresa_id: str) -> list[dict]:
  """
  Extractor principal: usa visión para imágenes y OCR+texto para el resto.
  Procesa facturas en paralelo con ThreadPoolExecutor (respeta límites de tasa razonables).
  """
  filas: list[dict] = []
  if not rutas:
    return filas
  workers = min(_MAX_WORKERS_EXTRACTOR_LLM, len(rutas))
  with ThreadPoolExecutor(max_workers=workers) as executor:
    futures = [executor.submit(_extraer_una_factura_llm_proveedor, ruta, empresa_id) for ruta in rutas]
    for fut in futures:
      try:
        fila = fut.result()
        if fila is not None:
          filas.append(fila)
      except Exception as e:
        logger.warning("Error procesando factura en paralelo: %s", e)
  return filas


def _extractor_basico(rutas: list[Path], empresa_id: str) -> list[dict]:
  """
  Extractor basado en reglas (backup). Intenta leer el texto de la factura y
  rellenar los campos principales sin usar LLM.
  """
  filas: list[dict] = []
  for ruta in rutas:
    texto = _leer_texto_factura(ruta)
    texto = _normalizar_texto(texto)
    num_factura = _buscar_numero_factura(texto)
    proveedor, pais, localidad = _buscar_proveedor_y_localizacion(texto, num_factura)
    if proveedor and not num_factura and re.match(r"^[A-Z0-9\/\-\.]+\s*$", proveedor.strip()):
      num_factura = proveedor[:60]
      proveedor, pais, localidad = _buscar_proveedor_y_localizacion(texto, num_factura)
    nif = _buscar_nif_cif(texto)
    fecha = _buscar_primera_fecha(texto)
    concepto = _buscar_concepto(texto, proveedor)
    if concepto and proveedor and concepto.lower().strip() == proveedor.lower().strip():
      concepto = ""
    importes = _buscar_importes(texto)

    base_total = importes["base_imponible_total"]
    iva_total = importes["iva_cuota_total"]
    ret_total = importes["retenciones_total"]

    # Convertir a strings para almacenamiento
    def fmt(v: float | None) -> str:
      return "" if v is None else f"{v:.2f}"

    base_str = fmt(base_total)
    iva_str = fmt(iva_total)
    ret_str = fmt(ret_total)

    total_factura = importes["total_factura"]
    total_a_pagar = importes["total_a_pagar"] or total_factura

    fila = {
      "ruta_archivo": str(ruta),
      "empresa_id": empresa_id,
      "fecha_factura": fecha,
      "proveedor": proveedor,
      "nif_proveedor": nif,
      "pais_proveedor": pais,
      "localidad_proveedor": localidad,
      "resumen_concepto": concepto,
      "numero_factura": num_factura,
      # Campos agregados
      "base_imponible_total": base_str,
      "base_imponible_detalle": importes["base_imponible_detalle"],
      "iva_cuota_total": iva_str,
      "iva_cuota_detalle": importes["iva_cuota_detalle"],
      "retenciones_total": ret_str,
      "retenciones_detalle": importes["retenciones_detalle"],
      "total_factura": total_factura,
      "total_a_pagar": total_a_pagar,
      # Campos históricos sencillos
      "base_imponible": base_str,
      "iva": iva_str,
      "total": total_a_pagar,
      "categoria": "",
      "extraccion_vision": "",
    }
    filas.append(fila)
  return filas


def _analizar_fila_proveedor(fila: dict) -> list[str]:
  """
  Aplica las mismas reglas que _revisor_basico pero sin modificar la fila.
  Devuelve una lista de mensajes de error (vacía si no hay problemas).
  Usado por Control de calidad para listar facturas con problemas.
  """
  errores: list[str] = []
  fecha = (fila.get("fecha_factura") or "").strip()
  if not fecha:
    errores.append("Sin fecha de factura.")
  else:
    try:
      fecha_dt = datetime.fromisoformat(fecha[:10]).date()
      if fecha_dt > datetime.now().date():
        errores.append(f"Fecha futura ({fecha[:10]}).")
    except Exception as e:
      logger.debug("No se pudo parsear fecha '%s': %s", fecha[:10], e)

  base_str = (fila.get("base_imponible") or fila.get("base_imponible_total") or "").strip()
  iva_str = (fila.get("iva") or fila.get("iva_cuota_total") or "").strip()
  ret_str = (fila.get("retenciones_total") or "").strip()
  total_pagar_str = (fila.get("total_a_pagar") or "").strip()

  base_val = _normalizar_importe_str(base_str) or 0.0
  iva_val = _normalizar_importe_str(iva_str) or 0.0
  ret_val = _normalizar_importe_str(ret_str) or 0.0
  total_pagar_val = _normalizar_importe_str(total_pagar_str)
  esperado_pagar = base_val + iva_val - ret_val

  if total_pagar_val is not None and esperado_pagar > 0:
    if abs(esperado_pagar - total_pagar_val) > 0.05:
      errores.append(
        f"Descuadre: base({base_val:.2f}) + iva({iva_val:.2f}) - ret({ret_val:.2f}) != total_pagar({total_pagar_val:.2f})."
      )
  return errores


def _analizar_fila_cliente(fila: dict) -> list[str]:
  """
  Aplica las mismas reglas que _revisor_basico_clientes sin modificar la fila.
  Devuelve lista de mensajes de error. Usado por Control de calidad.
  """
  errores: list[str] = []
  fecha = (fila.get("fecha_factura") or "").strip()
  if not fecha:
    errores.append("Sin fecha de factura.")
  else:
    try:
      fecha_dt = datetime.fromisoformat(fecha[:10]).date()
      if fecha_dt > datetime.now().date():
        errores.append(f"Fecha futura ({fecha[:10]}).")
    except Exception as e:
      logger.debug("No se pudo parsear fecha '%s': %s", fecha[:10], e)

  iva_val = _normalizar_importe_str(fila.get("iva") or "")
  total_val = _normalizar_importe_str(fila.get("total_a_pagar") or "")
  pricing_sum = 0.0
  for campo_p in ("pricing_servicio", "pricing_transporte"):
    v = _normalizar_importe_str(fila.get(campo_p) or "")
    if v is not None:
      pricing_sum += v

  if pricing_sum > 0 and iva_val is not None and total_val is not None:
    esperado = pricing_sum + iva_val
    if abs(esperado - total_val) > 0.05:
      errores.append(
        f"Descuadre: pricing({pricing_sum:.2f}) + iva({iva_val:.2f}) != total({total_val:.2f})"
      )
  return errores


def _analizar_facturas_proveedores(filas: list[dict]) -> list[dict]:
  """
  Recorre las filas de facturas de proveedores y devuelve las que tienen al menos un error,
  con la lista de mensajes y la fila completa. No modifica los datos.
  """
  resultado: list[dict] = []
  for i, fila in enumerate(filas):
    errores = _analizar_fila_proveedor(fila)
    if not errores:
      continue
    ruta = (fila.get("ruta_destino") or fila.get("ruta_archivo") or "").strip()
    resultado.append({
      "indice": i,
      "ruta_archivo": ruta,
      "errores": errores,
      "fila": fila,
    })
  return resultado


def _analizar_facturas_clientes(filas: list[dict]) -> list[dict]:
  """
  Recorre las filas de facturas de clientes y devuelve las que tienen al menos un error.
  """
  resultado: list[dict] = []
  for i, fila in enumerate(filas):
    errores = _analizar_fila_cliente(fila)
    if not errores:
      continue
    ruta = (fila.get("ruta_archivo") or "").strip()
    resultado.append({
      "indice": i,
      "ruta_archivo": ruta,
      "errores": errores,
      "fila": fila,
    })
  return resultado


def _sugerencias_heuristicas(fila: dict, errores: list[str], tipo: str) -> list[dict]:
  """
  Genera sugerencias a partir de los mensajes de error y la fila (reglas heurísticas).
  tipo: "proveedores" | "clientes".
  Devuelve list[dict] con { "campo", "valor_actual", "valor_sugerido", "motivo" }.
  """
  sugerencias: list[dict] = []
  fila = fila or {}

  for texto in (errores or []):
    texto_lower = texto.lower()
    # Descuadre proveedores: base + iva - ret != total_pagar → sugerir total_a_pagar
    if "descuadre" in texto_lower and "base" in texto_lower and tipo == "proveedores":
      base_val = _normalizar_importe_str(fila.get("base_imponible") or fila.get("base_imponible_total") or "") or 0.0
      iva_val = _normalizar_importe_str(fila.get("iva") or fila.get("iva_cuota_total") or "") or 0.0
      ret_val = _normalizar_importe_str(fila.get("retenciones_total") or "") or 0.0
      total_sugerido = base_val + iva_val - ret_val
      valor_actual = (fila.get("total_a_pagar") or "").strip()
      sugerencias.append({
        "campo": "total_a_pagar",
        "valor_actual": valor_actual or "—",
        "valor_sugerido": f"{total_sugerido:.2f}",
        "motivo": "Corregir total para que cuadre con base + IVA − retenciones.",
      })
      continue
    # Descuadre clientes: pricing + iva != total → sugerir total_a_pagar
    if "descuadre" in texto_lower and "pricing" in texto_lower and tipo == "clientes":
      pricing_sum = 0.0
      for c in ("pricing_servicio", "pricing_transporte"):
        v = _normalizar_importe_str(fila.get(c) or "")
        if v is not None:
          pricing_sum += v
      iva_val = _normalizar_importe_str(fila.get("iva") or "") or 0.0
      total_sugerido = pricing_sum + iva_val
      valor_actual = (fila.get("total_a_pagar") or "").strip()
      sugerencias.append({
        "campo": "total_a_pagar",
        "valor_actual": valor_actual or "—",
        "valor_sugerido": f"{total_sugerido:.2f}",
        "motivo": "Corregir total para que cuadre con pricing + IVA.",
      })
      continue
    # Sin fecha: no sugerir valor concreto
    if "sin fecha" in texto_lower:
      sugerencias.append({
        "campo": "fecha_factura",
        "valor_actual": (fila.get("fecha_factura") or "").strip() or "—",
        "valor_sugerido": "",
        "motivo": "Requiere revisión manual.",
      })
      continue
    # Fecha futura: sugerir revisar / vacío
    if "fecha futura" in texto_lower:
      valor_actual = (fila.get("fecha_factura") or "").strip() or "—"
      sugerencias.append({
        "campo": "fecha_factura",
        "valor_actual": valor_actual,
        "valor_sugerido": "",
        "motivo": "Revisar fecha.",
      })

  return sugerencias


def _sugerencias_llm(fila: dict, errores: list[str], tipo: str) -> list[dict]:
  """
  Pide al LLM que visualice la factura y los errores y sugiera correcciones.
  Envía la fila (factura) y la lista de errores; devuelve list[dict] con
  { "campo", "valor_actual", "valor_sugerido", "motivo" }.
  Si no hay cliente OpenAI o falla la llamada, devuelve lista vacía.
  """
  if client is None or not fila or not errores:
    return []
  # Texto legible de la factura para que el LLM la "visualice"
  lineas = ["Datos de la factura (" + tipo + "):"]
  for k, v in sorted(fila.items()):
    if v is not None and str(v).strip():
      lineas.append(f"  {k}: {v}")
  texto_factura = "\n".join(lineas)
  texto_errores = "\n".join(f"  - {e}" for e in errores)

  system = (
    "Eres un asistente de control de calidad contable. Te pasan los datos de una factura y una lista de errores detectados. "
    "Debes proponer correcciones concretas: para cada error, indica el campo a corregir, el valor actual, el valor sugerido y un motivo breve. "
    "Responde ÚNICAMENTE con un JSON válido: un array de objetos con exactamente estas claves: \"campo\", \"valor_actual\", \"valor_sugerido\", \"motivo\". "
    "Si no puedes proponer un valor concreto para un error, incluye igualmente el objeto con valor_sugerido vacío y motivo explicativo. "
    "Usa los mismos nombres de campo que aparecen en los datos de la factura (ej. fecha_factura, total_a_pagar, base_imponible, iva, etc.). "
    "No devuelvas nada más que el JSON, sin markdown ni texto adicional."
  )
  user = (
    f"{texto_factura}\n\nErrores detectados:\n{texto_errores}\n\n"
    "Devuelve un JSON array con las sugerencias de corrección."
  )
  try:
    resp = client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": system},
        {"role": "user", "content": user},
      ],
      temperature=0,
    )
    contenido = (resp.choices[0].message.content or "").strip()
    contenido = _limpiar_json_respuesta(contenido)
    datos = json.loads(contenido)
    if not isinstance(datos, list):
      return []
    out: list[dict] = []
    for s in datos:
      if not isinstance(s, dict):
        continue
      campo = (s.get("campo") or "").strip()
      if not campo:
        continue
      out.append({
        "campo": campo,
        "valor_actual": str(s.get("valor_actual") or "").strip() or "—",
        "valor_sugerido": str(s.get("valor_sugerido") or "").strip(),
        "motivo": str(s.get("motivo") or "").strip() or "Sugerencia del asistente.",
      })
    return out
  except Exception as e:
    logger.warning("Error parseando sugerencias LLM: %s", e)
    return []


def _revisor_basico(filas: list[dict]) -> list[dict]:
  """
  Revisor: asegura flags y corrige intercambios evidentes (proveedor/número factura, concepto = proveedor).
  """
  for fila in filas:
    fila.setdefault("flag_error", False)
    fila.setdefault("motivo_error", "")
    fila.setdefault("comentarios_revision", "")
    fila.setdefault("extraccion_vision", "")

    proveedor = (fila.get("proveedor") or "").strip()
    num_factura = (fila.get("numero_factura") or "").strip()
    concepto = (fila.get("resumen_concepto") or "").strip()
    fecha = (fila.get("fecha_factura") or "").strip()

    if not fecha:
      fila["flag_error"] = True
      motivo = fila.get("motivo_error") or ""
      fila["motivo_error"] = (motivo + " Sin fecha de factura.").strip()
    else:
      try:
        fecha_dt = datetime.fromisoformat(fecha[:10]).date()
        if fecha_dt > datetime.now().date():
          fila["flag_error"] = True
          motivo = fila.get("motivo_error") or ""
          fila["motivo_error"] = (motivo + f" Fecha futura ({fecha[:10]}).").strip()
      except Exception as e:
        logger.debug("No se pudo parsear fecha '%s': %s", fecha[:10], e)

    if proveedor and not num_factura and (re.match(r"^[A-Z0-9\/\-\.]+\s*$", proveedor) or re.match(r"^\d+", proveedor)):
      fila["numero_factura"] = proveedor[:60]
      fila["proveedor"] = ""
    if concepto and proveedor and concepto.lower().strip() == proveedor.lower().strip():
      fila["resumen_concepto"] = ""
    if concepto and len(concepto) < 4:
      fila["resumen_concepto"] = ""

    # Comprobación de coherencia numérica: base + iva - retención ≈ total_a_pagar
    base_str = (fila.get("base_imponible") or fila.get("base_imponible_total") or "").strip()
    iva_str = (fila.get("iva") or fila.get("iva_cuota_total") or "").strip()
    ret_str = (fila.get("retenciones_total") or "").strip()
    total_factura_str = (fila.get("total_factura") or "").strip()
    total_pagar_str = (fila.get("total_a_pagar") or "").strip()

    base_val = _normalizar_importe_str(base_str) or 0.0
    iva_val = _normalizar_importe_str(iva_str) or 0.0
    ret_val = _normalizar_importe_str(ret_str) or 0.0
    total_factura_val = _normalizar_importe_str(total_factura_str)
    total_pagar_val = _normalizar_importe_str(total_pagar_str)

    esperado_pagar = base_val + iva_val - ret_val

    def fmt(v: float | None) -> str:
      return "" if v is None else f"{v:.2f}"

    # Si no hay total_a_pagar pero sí base/iva/ret, lo calculamos
    if not total_pagar_str and esperado_pagar > 0:
      fila["total_a_pagar"] = fmt(esperado_pagar)
      total_pagar_val = esperado_pagar

    # Si ya hay total_a_pagar pero no cuadra con la suma, marcamos error y dejamos pista
    if total_pagar_val is not None and esperado_pagar > 0:
      if abs(esperado_pagar - total_pagar_val) > 0.05:
        fila["flag_error"] = True
        motivo = fila.get("motivo_error") or ""
        extra = f"Descuadre: base({base_val:.2f}) + iva({iva_val:.2f}) - ret({ret_val:.2f}) != total_pagar({total_pagar_val:.2f}). "
        fila["motivo_error"] = (motivo + " " + extra).strip()
  return filas


def _hash_archivo(ruta: Path) -> str:
  """Calcula SHA-256 del contenido del archivo. Devuelve cadena hexadecimal o vacía si error."""
  try:
    with open(ruta, "rb") as f:
      return hashlib.sha256(f.read()).hexdigest()
  except Exception as e:
    logger.warning("No se pudo calcular hash de %s: %s", ruta, e)
    return ""


def _normalizar_fecha_factura_clave(s: str) -> str:
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


def _clave_logica_factura_proveedor(numero: str, proveedor: str, fecha: str) -> tuple[str, str, str]:
  """Clave normalizada (numero, proveedor, fecha) para detectar duplicados lógicos."""
  n = (numero or "").strip().lower()
  p = (proveedor or "").strip().lower()
  f = _normalizar_fecha_factura_clave(fecha or "")
  return (n, p, f)


def _añadir_hashes_tabla_proveedor(tabla: list[dict]) -> None:
  """Añade hash_archivo a cada fila que tenga ruta_archivo (antes de que el archivador mueva el archivo)."""
  for fila in tabla:
    ruta_str = (fila.get("ruta_archivo") or "").strip()
    if not ruta_str:
      fila["hash_archivo"] = ""
      continue
    p = Path(ruta_str)
    fila["hash_archivo"] = _hash_archivo(p) if p.exists() else ""


def _añadir_hashes_tabla_clientes(tabla: list[dict]) -> None:
  """Añade hash_archivo a cada fila que tenga ruta_archivo (antes de que el archivador mueva el archivo)."""
  for fila in tabla:
    ruta_str = (fila.get("ruta_archivo") or "").strip()
    if not ruta_str:
      fila["hash_archivo"] = ""
      continue
    p = Path(ruta_str)
    fila["hash_archivo"] = _hash_archivo(p) if p.exists() else ""


def _archivador_por_empresa_y_fecha(filas: list[dict]) -> list[dict]:
  """
  Archivador: mueve archivos a Facturas Recibidas/{Empresa}/{Año}/{MM. Mes}/
  usando la fecha de factura si existe, o 'Sin fecha' en caso contrario.
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
        # Se asume formato ISO básico YYYY-MM-DD; si no, se cae al except.
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

    destino_dir = FACTURAS_RECIBIDAS_DIR / empresa_id / año / mes_carpeta
    destino_dir.mkdir(parents=True, exist_ok=True)

    nombre = ruta_actual.name
    destino = destino_dir / nombre

    # Evitar sobrescribir: si ya existe, añadir sufijo numérico.
    contador = 2
    while destino.exists():
      destino = destino_dir / f"{ruta_actual.stem}_{contador}{ruta_actual.suffix}"
      contador += 1

    shutil.move(str(ruta_actual), destino)
    fila["ruta_destino"] = str(destino)
    resultados.append(fila)

  return resultados


# Cache localidad -> país para no repetir peticiones a Nominatim en el mismo lote.
# Se persiste en JSON entre reinicios para no repetir peticiones.
_cache_pais_localidad: dict[str, str] = {}
_cache_nominatim_loaded = False

CACHE_NOMINATIM_PATH = DATOS_DIR / "cache_nominatim_pais_localidad.json"


def _cargar_cache_nominatim() -> None:
  """Carga el cache de Nominatim desde disco (localidad_norm -> país)."""
  global _cache_nominatim_loaded
  if _cache_nominatim_loaded:
    return
  _cache_nominatim_loaded = True
  if not CACHE_NOMINATIM_PATH.exists():
    return
  try:
    with CACHE_NOMINATIM_PATH.open("r", encoding="utf-8") as f:
      data = json.load(f)
    if isinstance(data, dict):
      for k, v in data.items():
        if isinstance(k, str) and isinstance(v, str):
          _cache_pais_localidad[k] = v
  except Exception as e:
    logger.warning("Error cargando cache Nominatim: %s", e)


def _guardar_cache_nominatim() -> None:
  """Persiste el cache de Nominatim en disco."""
  try:
    CACHE_NOMINATIM_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_NOMINATIM_PATH.open("w", encoding="utf-8") as f:
      json.dump(_cache_pais_localidad, f, ensure_ascii=False, indent=0)
  except Exception as e:
    logger.warning("Error guardando cache Nominatim: %s", e)


def _obtener_pais_desde_localidad(localidad: str) -> str:
  """
  Obtiene el país a partir del nombre de la localidad usando Nominatim (OpenStreetMap).
  Respeta 1 petición por segundo. Devuelve cadena vacía si no se encuentra o hay error.
  Usa cache en memoria y persistente (JSON) entre reinicios.
  """
  _cargar_cache_nominatim()
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
        _guardar_cache_nominatim()
        return pais
  except Exception as e:
    logger.warning("Error consultando Nominatim para '%s': %s", localidad, e)
  _cache_pais_localidad[localidad_norm] = ""
  _guardar_cache_nominatim()
  return ""


def _enriquecer_pais_desde_localidad(tabla: list[dict]) -> list[dict]:
  """
  Rellena pais_proveedor cuando esté vacío usando la localidad y una búsqueda en internet (Nominatim).
  """
  for fila in tabla:
    pais = (fila.get("pais_proveedor") or "").strip()
    localidad = (fila.get("localidad_proveedor") or "").strip()
    if not pais and localidad:
      pais = _obtener_pais_desde_localidad(localidad)
      if pais:
        fila["pais_proveedor"] = pais
  return tabla


# --- Homogeneización de proveedores (listado maestro + doble verificación) ---


def _normalizar_texto_proveedor(s: str) -> str:
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


def _normalizar_nif(nif: str) -> str:
  """NIF/CIF para comparación: solo letras y dígitos en mayúsculas."""
  if not nif or not isinstance(nif, str):
    return ""
  n = re.sub(r"[\s.\-]", "", nif.strip().upper())
  return n


def _cargar_proveedores_maestros(empresa_id: str) -> list[dict]:
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


def _listar_proveedores_para_selector(empresa_id: str) -> list[dict]:
  """
  Listado para el desplegable de edición de facturas: maestro + proveedores únicos
  que aparecen en facturas y aún no están en el maestro. Así aparecen todos los
  proveedores registrados (maestro y los que solo salen en facturas).
  """
  lista = _cargar_proveedores_maestros(empresa_id)
  vistos: set[tuple[str, str]] = set()
  for p in lista:
    nom = _normalizar_texto_proveedor(p.get("nombre_canonico") or "")
    nif = _normalizar_nif(p.get("nif") or "")
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
    key = (_normalizar_texto_proveedor(prov), _normalizar_nif(nif_prov))
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


def _guardar_proveedores_maestros(empresa_id: str, lista: list[dict]) -> None:
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


def _sincronizar_proveedores_desde_facturas(empresa_id: str) -> None:
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

  maestro_actual = _cargar_proveedores_maestros(empresa_id)
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

  _guardar_proveedores_maestros(empresa_id, nuevo_maestro)


def _similitud_nombres(a: str, b: str) -> float:
  """Devuelve un valor entre 0 y 1 (1 = idénticos tras normalizar)."""
  an = _normalizar_texto_proveedor(a)
  bn = _normalizar_texto_proveedor(b)
  if not an or not bn:
    return 0.0
  if an == bn:
    return 1.0
  return difflib.SequenceMatcher(None, an, bn).ratio()


def _buscar_o_crear_proveedor(
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
  nif_norm = _normalizar_nif(nif or "")
  lista = list(lista)

  # 1) Match por NIF (clave fiable)
  if nif_norm:
    for p in lista:
      if _normalizar_nif(p.get("nif") or "") == nif_norm:
        return (p["nombre_canonico"], lista, False)

  # 2) Match por similitud de nombre (evitar duplicados por tildes, "S.L.", etc.)
  if proveedor_raw:
    mejor_ratio = 0.0
    mejor_canonico: str | None = None
    for p in lista:
      canonico = (p.get("nombre_canonico") or "").strip()
      if not canonico:
        continue
      r = _similitud_nombres(proveedor_raw, canonico)
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


def _homogeneizar_proveedores(tabla: list[dict], empresa_id: str) -> list[dict]:
  """
  Usa el listado maestro de proveedores: para cada factura, resuelve el nombre
  del proveedor (match por NIF o por nombre similar) y sustituye por el nombre canónico.
  Si el proveedor es nuevo, se añade al maestro.
  """
  lista = _cargar_proveedores_maestros(empresa_id)
  guardado = False
  for fila in tabla:
    proveedor = (fila.get("proveedor") or "").strip()
    nif = (fila.get("nif_proveedor") or "").strip()
    localidad = (fila.get("localidad_proveedor") or "").strip()
    pais = (fila.get("pais_proveedor") or "").strip()
    direccion = (fila.get("direccion_proveedor") or "").strip()
    canonico, lista_nueva, creado = _buscar_o_crear_proveedor(
      proveedor, nif, localidad, pais, direccion, lista,
    )
    lista = lista_nueva
    fila["proveedor"] = canonico
    if creado:
      guardado = True
  if guardado:
    _guardar_proveedores_maestros(empresa_id, lista)
  return tabla


def _base_maestra_csv(filas: list[dict], empresa_id: str) -> dict:
  """
  Guarda las filas en la base maestra de facturas (SQLite).
  Las filas recibidas ya están filtradas (sin duplicados por hash).
  """
  n = facturas_db.insert_facturas(empresa_id, filas)
  ruta_csv = EMPRESAS_DIR / empresa_id / "base_maestra_facturas.csv"
  return {
    "ruta_base_maestra": str(ruta_csv),
    "filas_añadidas": n,
  }


def procesar_lote(empresa_id: str, carpeta: Path, tarjeta_id: str | None = None) -> dict:
  """
  Orquestador interno: aplica Recolector → Extractor → Revisor → Archivador → Base de datos.
  """
  archivos = _recolector(carpeta)
  if not archivos:
    return {
      "procesado": False,
      "motivo": "No se han encontrado archivos en la carpeta de entrada.",
      "empresa_id": empresa_id,
      "carpeta_entrada": str(carpeta),
    }
  logger.info("Procesando %d archivos para empresa '%s'", len(archivos), empresa_id)

  # Primero intentamos con el extractor LLM (OpenAI). Si falla o no devuelve filas, usamos el backup.
  tabla = _extractor_llm(archivos, empresa_id)
  if not tabla:
    logger.info("Extractor LLM sin resultados, usando extractor básico")
    tabla = _extractor_basico(archivos, empresa_id)
  else:
    logger.info("Extractor LLM: %d filas extraídas", len(tabla))

  tabla = _revisor_basico(tabla)
  _añadir_hashes_tabla_proveedor(tabla)
  hashes_existentes = facturas_db.get_hashes_empresa_proveedor(empresa_id)
  claves_existentes = {
    _clave_logica_factura_proveedor(num, prov, fec)
    for num, prov, fec in facturas_db.get_claves_facturas_proveedor(empresa_id)
  }
  tabla_sin_duplicados = []
  for f in tabla:
    h = (f.get("hash_archivo") or "").strip()
    if h and h in hashes_existentes:
      continue
    clave = _clave_logica_factura_proveedor(
      f.get("numero_factura"), f.get("proveedor"), f.get("fecha_factura")
    )
    if clave in claves_existentes:
      continue
    tabla_sin_duplicados.append(f)
  duplicados_omitidos = len(tabla) - len(tabla_sin_duplicados)
  if duplicados_omitidos:
    logger.info("Duplicados omitidos: %d", duplicados_omitidos)
  tabla = _archivador_por_empresa_y_fecha(tabla_sin_duplicados)
  tabla = _homogeneizar_proveedores(tabla, empresa_id)
  tabla = _enriquecer_pais_desde_localidad(tabla)

  # Si se ha indicado tarjeta en el procesado, marcamos todas las facturas
  # de este lote como pagadas con esa tarjeta.
  tarjeta_int: int | None = None
  if tarjeta_id:
    try:
      tarjeta_int = int(str(tarjeta_id).strip())
    except ValueError:
      tarjeta_int = None
  if tarjeta_int:
    for fila in tabla:
      fila["tarjeta_id"] = tarjeta_int
      if not (fila.get("estado_pago") or "").strip():
        fila["estado_pago"] = "pagada"
  resumen_bd = _base_maestra_csv(tabla, empresa_id)
  facturas_con_vision = sum(1 for f in tabla if (str(f.get("extraccion_vision") or "").strip() == "1"))
  logger.info(
    "Lote completado: %d facturas procesadas, %d con visión, %d añadidas a BD",
    len(tabla_sin_duplicados), facturas_con_vision, resumen_bd["filas_añadidas"],
  )

  return {
    "procesado": True,
    "empresa_id": empresa_id,
    "carpeta_entrada": str(carpeta),
    "facturas_procesadas": len(tabla_sin_duplicados),
    "facturas_omitidas_duplicadas": duplicados_omitidos,
    "facturas_con_vision": facturas_con_vision,
    "ruta_base_maestra": resumen_bd["ruta_base_maestra"],
    "filas_añadidas": resumen_bd["filas_añadidas"],
  }


app = Flask(__name__, static_folder=".", static_url_path="")


@app.get("/")
def index():
  """
  Sirve la página principal de la interfaz de facturas.
  """
  # Sirve el index.html que está en el mismo directorio que este backend.
  return send_from_directory(app.static_folder, "index.html")


@app.get("/api/empresas")
def listar_empresas():
  """
  Devuelve el listado de empresas cargado desde config/empresas.toml.
  Formato: [{ "id": "...", "nombre": "..." }, ...]
  """
  empresas = [{"id": id_, "nombre": nombre} for id_, nombre in EMPRESAS_CLIENTE.items()]
  resp = jsonify(empresas)
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  resp.headers["Pragma"] = "no-cache"
  return resp


@facturas_proveedores_bp.post("/api/procesar")
def procesar():
  """
  Backend para la interfaz de facturas.

  - Recibe empresa_id + archivos.
  - Guarda los archivos en data/subidas/{empresa_id}/{timestamp}/.
  - Lanza el flujo interno (Recolector → Extractor → Revisor → Archivador → Base de datos).
  """
  ensure_dirs()

  empresa_id = request.form.get("empresa_id")
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]

  tarjeta_id = (request.form.get("tarjeta_id") or "").strip() or None

  files = request.files.getlist("archivos")
  if not files:
    return _bad_request("No se han recibido archivos")

  timestamp = int(time.time())
  destino = SUBIDAS_DIR / empresa_id / str(timestamp)
  destino.mkdir(parents=True, exist_ok=True)

  nombres_guardados = []
  for f in files:
    nombre = f.filename or f"factura_{len(nombres_guardados) + 1}.dat"
    ruta = destino / os.path.basename(nombre)
    f.save(ruta)
    nombres_guardados.append(str(ruta))

  resumen = procesar_lote(empresa_id, destino, tarjeta_id=tarjeta_id)
  _invalidar_cache_listado_proveedores(empresa_id)

  mensaje = "Facturas procesadas correctamente."
  if not resumen.get("procesado"):
    mensaje = resumen.get("motivo", "No se han podido procesar las facturas.")

  return jsonify(
    {
      "mensaje": mensaje,
      "empresa_id": empresa_id,
      "carpeta_entrada": str(destino),
      "archivos_entrada": nombres_guardados,
      "resumen_proceso": resumen,
    }
  )


@facturas_proveedores_bp.get("/api/facturas")
def listar_facturas():
  """
  Devuelve el listado de facturas de una empresa (base maestra en CSV).
  Usa cache en memoria por empresa; se invalida al editar/eliminar/procesar.
  """
  empresa_id = request.args.get("empresa_id")
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return jsonify({"facturas": [], "error": "Falta empresa_id"}), 400

  if empresa_id in _cache_listado_facturas_proveedores:
    facturas = _cache_listado_facturas_proveedores[empresa_id]
  else:
    facturas = _leer_facturas_proveedores_desde_csv(empresa_id)
    _cache_listado_facturas_proveedores[empresa_id] = facturas

  proveedor_filtro = (request.args.get("proveedor") or "").strip()
  if proveedor_filtro:
    facturas = [f for f in facturas if (f.get("proveedor") or "").strip() == proveedor_filtro]

  return jsonify({"facturas": facturas, "empresa_id": empresa_id})


@proveedores_bp.get("/api/proveedores")
def listar_proveedores():
  """
  Devuelve el listado de proveedores para la empresa: maestro + proveedores únicos
  que aparecen en facturas (para que en el desplegable de edición aparezcan todos).
  """
  empresa_id = request.args.get("empresa_id")
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return jsonify({"proveedores": [], "error": "Falta empresa_id"}), 400

  lista = _listar_proveedores_para_selector(empresa_id)
  return jsonify({"proveedores": lista, "empresa_id": empresa_id})


@proveedores_bp.get("/api/empresas/<empresa_id>/proveedores")
def listar_proveedores_por_empresa(empresa_id: str):
  """Listado de proveedores de una empresa (misma respuesta que GET /api/proveedores?empresa_id=)."""
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  lista = _listar_proveedores_para_selector(empresa_id)
  return jsonify({"proveedores": lista, "empresa_id": empresa_id})


@proveedores_bp.get("/api/empresas/<empresa_id>/terceros")
def listar_terceros_por_empresa(empresa_id: str):
  """
  Listado unificado de terceros (proveedores y/o clientes) de una empresa.
  Query: rol=proveedor|cliente|ambos (por defecto ambos).
  Cada ítem incluye "rol" ("proveedor" o "cliente") y campos comunes: nif, nombre_canonico, direccion, localidad, pais, email, telefono; proveedores añaden centro_coste; clientes añaden proyecto.
  """
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  rol = (request.args.get("rol") or "ambos").strip().lower()
  if rol not in ("proveedor", "cliente", "ambos"):
    return _bad_request('rol debe ser "proveedor", "cliente" o "ambos"')

  terceros: list[dict] = []
  if rol in ("proveedor", "ambos"):
    proveedores = _cargar_proveedores_maestros(empresa_id)
    for p in proveedores:
      terceros.append({
        "rol": "proveedor",
        "nif": (p.get("nif") or "").strip(),
        "nombre_canonico": (p.get("nombre_canonico") or "").strip(),
        "direccion": (p.get("direccion") or "").strip(),
        "localidad": (p.get("localidad") or "").strip(),
        "pais": (p.get("pais") or "").strip(),
        "email": (p.get("email") or "").strip(),
        "telefono": (p.get("telefono") or "").strip(),
        "centro_coste": (p.get("centro_coste") or "").strip(),
      })
  if rol in ("cliente", "ambos"):
    if terceros_db.hay_clientes_en_bd():
      clientes_bd = terceros_db.get_clientes_empresa(empresa_id)
    else:
      clientes_bd = []
    clientes_agg = _get_clientes_unicos_empresa(empresa_id)
    seen_cliente: set[tuple[str, str]] = set()
    for c in clientes_bd:
      nombre = (c.get("cliente") or "").strip()
      nif = (c.get("cif_nif") or "").strip()
      key = (nombre, nif)
      if key not in seen_cliente:
        seen_cliente.add(key)
        terceros.append({
          "rol": "cliente",
          "nif": nif,
          "nombre_canonico": nombre,
          "direccion": (c.get("direccion") or "").strip(),
          "localidad": (c.get("localidad") or "").strip(),
          "pais": (c.get("pais") or "").strip(),
          "email": (c.get("email") or "").strip(),
          "telefono": (c.get("telefono") or "").strip(),
          "proyecto": (c.get("proyecto") or "").strip(),
        })
    for c in clientes_agg:
      nombre = (c.get("cliente") or "").strip()
      nif = (c.get("cif_nif") or "").strip()
      key = (nombre, nif)
      if key not in seen_cliente:
        seen_cliente.add(key)
        terceros.append({
          "rol": "cliente",
          "nif": nif,
          "nombre_canonico": nombre,
          "direccion": (c.get("direccion") or "").strip(),
          "localidad": (c.get("localidad") or "").strip(),
          "pais": (c.get("pais") or "").strip(),
          "email": (c.get("email") or "").strip(),
          "telefono": (c.get("telefono") or "").strip(),
          "proyecto": (c.get("proyecto") or "").strip(),
        })

  return jsonify({"terceros": terceros, "empresa_id": empresa_id, "rol": rol})


@bancos_bp.get("/api/empresas/<empresa_id>/tarjetas")
def listar_tarjetas_por_empresa(empresa_id: str):
  """
  Listado de tarjetas de banco de una empresa.
  Query opcional: solo_activas=true|false (por defecto true).
  """
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  solo_activas_raw = (request.args.get("solo_activas") or "true").strip().lower()
  solo_activas = solo_activas_raw not in ("false", "0", "no")
  tarjetas = tarjetas_db.get_tarjetas_empresa(empresa_id, solo_activas=solo_activas)
  return jsonify({"tarjetas": tarjetas, "empresa_id": empresa_id, "solo_activas": solo_activas})


@bancos_bp.post("/api/tarjetas")
def crear_tarjeta():
  """
  Alta de tarjeta de banco en el maestro de la empresa.
  JSON: empresa_id (obligatorio), banco (obligatorio), persona (obligatorio), ultimos4?, alias?, activa?.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  banco = (data.get("banco") or "").strip()
  persona = (data.get("persona") or "").strip()
  if not banco:
    return _bad_request("El banco de la tarjeta es obligatorio")
  if not persona:
    return _bad_request("La persona titular de la tarjeta es obligatoria")
  try:
    tarjeta = tarjetas_db.crear_tarjeta(empresa_id, data)
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  return jsonify({"ok": True, "tarjeta": tarjeta, "empresa_id": empresa_id}), 201


@bancos_bp.put("/api/tarjetas/<int:tarjeta_id>")
def actualizar_tarjeta(tarjeta_id: int):
  """
  Edición de una tarjeta de banco.
  JSON: empresa_id (obligatorio) y campos a actualizar: banco?, persona?, ultimos4?, alias?, activa?.
  No permite cambiar empresa_id.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  try:
    tarjeta = tarjetas_db.actualizar_tarjeta(tarjeta_id, empresa_id, data)
  except ValueError as e:
    return _bad_request(str(e))
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  if not tarjeta:
    return jsonify({"error": "Tarjeta no encontrada"}), 404
  return jsonify({"ok": True, "tarjeta": tarjeta, "empresa_id": empresa_id}), 200


@bancos_bp.get("/api/empresas/<empresa_id>/tarjetas/liquidaciones-resumen")
def resumen_liquidaciones_tarjetas(empresa_id: str):
  """
  Resumen de \"liquidaciones\" por tarjeta y periodo (YYYY-MM) calculado a partir de las facturas
  de proveedores que tienen tarjeta_id asignada. Incluye total_movimiento (suma del importe de
  movimientos bancarios vinculados a ese tarjeta_id+periodo) para ver pendiente de incorporar.

  Periodo de la factura: liquidacion_periodo si está rellenado, si no el mes de fecha_factura.
  """
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]

  facturas_db.init_facturas_db()
  conn = sqlite3.connect(str(GESTION_DB))
  conn.row_factory = sqlite3.Row
  try:
    cur = conn.execute(
      """
      SELECT
        t.id AS tarjeta_id,
        t.banco,
        t.persona,
        t.alias,
        sub.periodo,
        sub.num_facturas,
        sub.total_facturas
      FROM (
        SELECT
          tarjeta_id,
          COALESCE(
            NULLIF(TRIM(liquidacion_periodo), ''),
            substr(COALESCE(NULLIF(fecha_factura, ''), '0000-00-00'), 1, 7)
          ) AS periodo,
          COUNT(*) AS num_facturas,
          SUM(
            CAST(
              REPLACE(
                COALESCE(
                  NULLIF(total_a_pagar, ''),
                  NULLIF(total_factura, ''),
                  '0'
                ),
                ',', '.'
              ) AS REAL
            )
          ) AS total_facturas
        FROM facturas_proveedor
        WHERE empresa_id = ?
          AND tarjeta_id IS NOT NULL
          AND TRIM(CAST(tarjeta_id AS TEXT)) <> ''
        GROUP BY tarjeta_id, periodo
      ) AS sub
      JOIN tarjetas t
        ON t.id = sub.tarjeta_id
       AND t.empresa_id = ?
      ORDER BY sub.periodo DESC, t.banco, t.persona
      """,
      (empresa_id, empresa_id),
    )
    filas = []
    for row in cur.fetchall():
      total_facturas = row["total_facturas"] or 0.0
      try:
        total_facturas = float(total_facturas)
      except Exception as e:
        logger.debug("No se pudo convertir total_facturas a float: %s", e)
        total_facturas = 0.0
      porcentaje = 100.0 if total_facturas > 0 else 0.0
      filas.append(
        {
          "tarjeta_id": row["tarjeta_id"],
          "tarjeta_banco": row["banco"],
          "tarjeta_persona": row["persona"],
          "tarjeta_alias": row["alias"],
          "periodo": row["periodo"],
          "num_facturas": row["num_facturas"],
          "total_facturas": total_facturas,
          "estado": "pendiente",
          "porcentaje_facturas": porcentaje,
          "total_movimiento": None,
        }
      )
  finally:
    conn.close()

  # Enriquecer con importe de movimientos vinculados (tarjeta_id + liquidacion_periodo) en movimientos.db
  _init_movimientos_db()
  conn_bancos = _get_bancos_db()
  try:
    for fila in filas:
      tid = fila["tarjeta_id"]
      per = fila.get("periodo") or ""
      if not per or len(per) != 7:
        continue
      row_sum = conn_bancos.execute(
        """
        SELECT COALESCE(SUM(CAST(importe AS REAL)), 0) AS total
        FROM movimientos
        WHERE tarjeta_id = ? AND liquidacion_periodo = ?
        """,
        (tid, per),
      ).fetchone()
      fila["total_movimiento"] = float(row_sum[0]) if row_sum else 0.0
    # Pendiente = total_facturas + total_movimiento (movimientos negativos; suma = saldo pendiente)
    # Estado: pendiente si no hay movimiento; conciliado si hay movimiento y pendiente ≈ 0; cargo recibido si hay movimiento pero no cuadra
    for fila in filas:
      total_fac = fila.get("total_facturas") or 0.0
      total_mov = fila.get("total_movimiento") or 0.0
      fila["pendiente_facturas"] = round(total_fac + total_mov, 2)
      if total_mov == 0:
        fila["estado"] = "pendiente"
      elif abs(fila["pendiente_facturas"]) < 0.01:
        fila["estado"] = "conciliado"
      else:
        fila["estado"] = "cargo recibido"
  finally:
    conn_bancos.close()

  return jsonify({"empresa_id": empresa_id, "liquidaciones": filas})


@bancos_bp.get("/api/empresas/<empresa_id>/tarjetas/extracto-export")
def exportar_extracto_tarjeta(empresa_id: str):
  """
  Exporta la conciliación de un extracto (tarjeta + periodo) a Excel.
  Query: tarjeta_id (int), periodo (YYYY-MM), tipo=excel|facturas.
  - tipo=excel: Excel con hojas "Facturas" y "Movimientos" (conciliación completa).
  - tipo=facturas: Excel solo con hoja "Facturas".
  """
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  try:
    tarjeta_id = int(request.args.get("tarjeta_id", 0))
  except (TypeError, ValueError):
    return _bad_request("tarjeta_id debe ser un entero")
  periodo = (request.args.get("periodo") or "").strip()
  if not periodo or len(periodo) != 7 or periodo[4] != "-":
    return _bad_request("periodo debe tener formato YYYY-MM")
  tipo = (request.args.get("tipo") or "excel").strip().lower()
  if tipo not in ("excel", "facturas"):
    tipo = "excel"

  facturas_db.init_facturas_db()
  conn_gest = sqlite3.connect(str(GESTION_DB))
  conn_gest.row_factory = sqlite3.Row
  try:
    # Facturas del extracto: tarjeta_id y periodo (liquidacion_periodo o mes de fecha_factura)
    cur_fac = conn_gest.execute(
      """
      SELECT id, empresa_id, fecha_factura, proveedor, nif_proveedor, pais_proveedor, localidad_proveedor,
             resumen_concepto, numero_factura, base_imponible, iva, retenciones_total, total_factura,
             total_a_pagar, categoria, ruta_archivo, ruta_destino, estado_pago, tarjeta_id, liquidacion_periodo
      FROM facturas_proveedor
      WHERE empresa_id = ? AND tarjeta_id = ?
        AND (
          (TRIM(COALESCE(liquidacion_periodo, '')) = ?)
          OR (TRIM(COALESCE(liquidacion_periodo, '')) = '' AND substr(COALESCE(NULLIF(fecha_factura, ''), '0000-00-00'), 1, 7) = ?)
        )
      ORDER BY fecha_factura, id
      """,
      (empresa_id, tarjeta_id, periodo, periodo),
    )
    filas_fac = [dict(row) for row in cur_fac.fetchall()]
  finally:
    conn_gest.close()

  movimientos_rows = []
  if tipo == "excel":
    _init_movimientos_db()
    conn_bancos = _get_bancos_db()
    try:
      cur_mov = conn_bancos.execute(
        """
        SELECT id, fecha_operacion, fecha_valor, concepto, importe, divisa, saldo,
               banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id,
               tarjeta_id, liquidacion_periodo, created_at
        FROM movimientos
        WHERE tarjeta_id = ? AND liquidacion_periodo = ?
        ORDER BY fecha_operacion, id
        """,
        (tarjeta_id, periodo),
      )
      movimientos_rows = list(cur_mov.fetchall())
    finally:
      conn_bancos.close()

  try:
    import openpyxl
    from openpyxl import Workbook
  except ImportError:
    return jsonify({"error": "openpyxl no instalado. pip install openpyxl"}), 500

  wb = Workbook()
  ws_fac = wb.active
  ws_fac.title = "Facturas"
  cols_fac = [
    "id", "fecha_factura", "proveedor", "nif_proveedor", "numero_factura", "resumen_concepto",
    "base_imponible", "iva", "retenciones_total", "total_factura", "total_a_pagar", "categoria", "estado_pago",
  ]
  ws_fac.append(cols_fac)
  for f in filas_fac:
    ws_fac.append([f.get(c) or "" for c in cols_fac])

  if tipo == "excel" and movimientos_rows:
    ws_mov = wb.create_sheet("Movimientos")
    cols_mov = [
      "id", "fecha_operacion", "fecha_valor", "concepto", "importe", "divisa", "saldo",
      "banco", "codigo", "numero_documento", "referencia_1", "referencia_2", "empresa_id",
      "tarjeta_id", "liquidacion_periodo", "created_at",
    ]
    ws_mov.append(cols_mov)
    for r in movimientos_rows:
      ws_mov.append(list(r))

  output = io.BytesIO()
  wb.save(output)
  output.seek(0)
  safe_per = periodo.replace("/", "-")
  nombre = f"extracto_tarjeta_{tarjeta_id}_{safe_per}_{tipo}.xlsx"
  return send_file(
    output,
    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    as_attachment=True,
    download_name=nombre,
  )


@bancos_bp.post("/api/bancos/tarjetas/conciliar-movimiento")
def conciliar_movimiento_con_liquidacion_tarjeta():
  """
  Vincula un movimiento bancario (cargo de tarjeta) con una \"liquidación\" (tarjeta_id + periodo).

  Body JSON:
    {
      "empresa_id": "...",
      "movimiento_id": 123,
      "tarjeta_id": 5,
      "periodo": "2025-02"
    }
  """
  data = request.get_json(silent=True) or {}
  empresa_id_body, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]

  try:
    mov_id = int(data.get("movimiento_id"))
    tarjeta_id = int(data.get("tarjeta_id"))
  except (TypeError, ValueError):
    return _bad_request("movimiento_id y tarjeta_id deben ser enteros válidos")
  periodo = (data.get("periodo") or "").strip()
  if not periodo or len(periodo) != 7 or periodo[4] != "-":
    return _bad_request("El periodo debe tener formato YYYY-MM")

  # Validar tarjeta pertenece a empresa
  facturas_db.init_facturas_db()
  conn_gest = sqlite3.connect(str(GESTION_DB))
  try:
    row_tar = conn_gest.execute(
      "SELECT id, empresa_id FROM tarjetas WHERE id = ?",
      (tarjeta_id,),
    ).fetchone()
    if not row_tar or (row_tar[1] or "").strip() != empresa_id_body:
      return jsonify({"error": "Tarjeta no encontrada o no pertenece a la empresa indicada"}), 404
  finally:
    conn_gest.close()

  # Actualizar movimiento en BD de bancos
  _init_movimientos_db()
  conn_bancos = _get_bancos_db()
  try:
    row_mov = conn_bancos.execute(
      "SELECT id, empresa_id, importe FROM movimientos WHERE id = ?",
      (mov_id,),
    ).fetchone()
    if not row_mov:
      return jsonify({"error": "Movimiento no encontrado"}), 404
    empresa_mov = (row_mov[1] or "").strip()
    if empresa_mov and empresa_mov != empresa_id_body:
      return jsonify({"error": "El movimiento pertenece a otra empresa"}), 400
    conn_bancos.execute(
      """
      UPDATE movimientos
         SET tarjeta_id = ?, liquidacion_periodo = ?
       WHERE id = ?
      """,
      (tarjeta_id, periodo, mov_id),
    )
    conn_bancos.commit()
  finally:
    conn_bancos.close()

  return jsonify(
    {
      "ok": True,
      "mensaje": "Movimiento vinculado a la liquidación de tarjeta.",
      "movimiento_id": mov_id,
      "tarjeta_id": tarjeta_id,
      "periodo": periodo,
      "empresa_id": empresa_id_body,
    }
  )


@bancos_bp.post("/api/bancos/tarjetas/desvincular-movimiento")
def desvincular_movimiento_de_liquidacion_tarjeta():
  """
  Quita la vinculación de un movimiento con la liquidación de tarjeta (tarjeta_id y liquidacion_periodo a NULL).
  Body JSON: { "empresa_id": "...", "movimiento_id": 123 }
  """
  data = request.get_json(silent=True) or {}
  empresa_id_body, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  try:
    mov_id = int(data.get("movimiento_id"))
  except (TypeError, ValueError):
    return _bad_request("movimiento_id debe ser un entero válido")
  _init_movimientos_db()
  conn_bancos = _get_bancos_db()
  try:
    row = conn_bancos.execute(
      "SELECT id, empresa_id FROM movimientos WHERE id = ?",
      (mov_id,),
    ).fetchone()
    if not row:
      return jsonify({"error": "Movimiento no encontrado"}), 404
    empresa_mov = (row[1] or "").strip()
    if empresa_mov and empresa_mov != empresa_id_body:
      return jsonify({"error": "El movimiento pertenece a otra empresa"}), 400
    conn_bancos.execute(
      "UPDATE movimientos SET tarjeta_id = NULL, liquidacion_periodo = NULL WHERE id = ?",
      (mov_id,),
    )
    conn_bancos.commit()
  finally:
    conn_bancos.close()
  return jsonify({"ok": True, "mensaje": "Movimiento desvinculado del extracto de tarjeta.", "movimiento_id": mov_id})


def _normalizar_proveedor_body(data: dict) -> dict:
  """Extrae y normaliza campos de proveedor desde el body (CAMPOS_PROVEEDORES_MAESTROS)."""
  return {
    "nombre_canonico": (data.get("nombre_canonico") or "").strip(),
    "nif": (data.get("nif") or "").strip(),
    "direccion": (data.get("direccion") or "").strip(),
    "localidad": (data.get("localidad") or "").strip(),
    "pais": (data.get("pais") or "").strip(),
    "email": (data.get("email") or "").strip(),
    "telefono": (data.get("telefono") or "").strip(),
    "centro_coste": (data.get("centro_coste") or "").strip(),
  }


@proveedores_bp.post("/api/proveedores")
def crear_proveedor():
  """
  Alta de proveedor en el maestro de la empresa.
  JSON: empresa_id (obligatorio), nombre_canonico, nif (mínimos), direccion, localidad, pais, email, telefono, centro_coste.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  p = _normalizar_proveedor_body(data)
  nombre = p["nombre_canonico"]
  nif = p["nif"]
  if not nombre:
    return _bad_request("El nombre del proveedor es obligatorio")
  if not nif:
    return _bad_request("El NIF/CIF del proveedor es obligatorio")

  lista = _cargar_proveedores_maestros(empresa_id)
  for existente in lista:
    if (
      (existente.get("nombre_canonico") or "").strip() == nombre
      and (existente.get("nif") or "").strip() == nif
    ):
      return jsonify({"error": "Ya existe un proveedor con ese nombre y NIF en esta empresa"}), 409
  lista.append(p)
  _guardar_proveedores_maestros(empresa_id, lista)
  return jsonify({"ok": True, "proveedores": lista, "empresa_id": empresa_id}), 201


@proveedores_bp.put("/api/proveedores")
def actualizar_proveedor():
  """
  Edición de un proveedor del maestro. Se identifica por old_nombre_canonico y old_nif.
  JSON: empresa_id, old_nombre_canonico, old_nif, y el resto de campos (nombre_canonico, nif, direccion, ...).
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  old_nombre = (data.get("old_nombre_canonico") or "").strip()
  old_nif = (data.get("old_nif") or "").strip()
  if not old_nombre and not old_nif:
    return _bad_request("Faltan old_nombre_canonico y old_nif para identificar el proveedor")
  p = _normalizar_proveedor_body(data)
  if not p["nombre_canonico"]:
    return _bad_request("El nombre del proveedor es obligatorio")
  if not p["nif"]:
    return _bad_request("El NIF/CIF del proveedor es obligatorio")

  lista = _cargar_proveedores_maestros(empresa_id)
  idx = -1
  for i, existente in enumerate(lista):
    if (
      (existente.get("nombre_canonico") or "").strip() == old_nombre
      and (existente.get("nif") or "").strip() == old_nif
    ):
      idx = i
      break
  if idx < 0:
    lista.append(p)
    _guardar_proveedores_maestros(empresa_id, lista)
    facturas_db.update_facturas_proveedor_nombre_nif(
      empresa_id, old_nombre, old_nif, p["nombre_canonico"], p["nif"],
    )
    _invalidar_cache_listado_proveedores(empresa_id)
    return jsonify({
      "ok": True,
      "proveedores": lista,
      "empresa_id": empresa_id,
      "mensaje": "Proveedor añadido al maestro con los datos indicados (no estaba en el maestro).",
    })
  lista[idx] = p
  _guardar_proveedores_maestros(empresa_id, lista)
  _invalidar_cache_listado_proveedores(empresa_id)
  return jsonify({"ok": True, "proveedores": lista, "empresa_id": empresa_id})


@proveedores_bp.delete("/api/proveedores")
def eliminar_proveedor():
  """
  Elimina un proveedor del maestro. Solo si está en el maestro.
  Body: { "empresa_id": "...", "nombre_canonico": "...", "nif": "..." }.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  nombre = (data.get("nombre_canonico") or "").strip()
  nif = (data.get("nif") or "").strip()
  if not nombre and not nif:
    return _bad_request("Faltan nombre_canonico y nif para identificar el proveedor")
  lista = _cargar_proveedores_maestros(empresa_id)
  nueva_lista = [
    p for p in lista
    if not (
      (p.get("nombre_canonico") or "").strip() == nombre
      and (p.get("nif") or "").strip() == nif
    )
  ]
  if len(nueva_lista) == len(lista):
    return jsonify({"error": "Proveedor no encontrado en el maestro"}), 404
  _guardar_proveedores_maestros(empresa_id, nueva_lista)
  _invalidar_cache_listado_proveedores(empresa_id)
  return jsonify({"ok": True, "proveedores": nueva_lista, "empresa_id": empresa_id, "mensaje": "Proveedor eliminado del maestro."})


@proveedores_bp.post("/api/terceros/migrar-desde-csv")
def migrar_terceros_desde_csv():
  """
  Migra los proveedores de todos los proveedores_maestros.csv a SQLite (terceros + empresa_tercero).
  Ejecutar una vez para pasar a usar la BD. Devuelve estadísticas y posibles errores.
  """
  try:
    resultado = terceros_db.migrar_proveedores_desde_csv()
    return jsonify({
      "ok": True,
      "mensaje": "Migración completada.",
      "empresas_procesadas": resultado["empresas_procesadas"],
      "terceros_totales": resultado["terceros_totales"],
      "relaciones_creadas": resultado["relaciones_creadas"],
      "errores": resultado.get("errores", []),
    })
  except Exception as e:
    return jsonify({"ok": False, "error": str(e)}), 500


@proveedores_bp.put("/api/proveedor_ceco")
def actualizar_centro_coste_proveedor():
  """
  Actualiza el centro de coste asociado a un proveedor en el listado maestro.
  JSON: { "empresa_id": "...", "proveedor": "nombre_canonico", "centro_coste": "..." }
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  proveedor = (data.get("proveedor") or "").strip()
  centro_coste = (data.get("centro_coste") or "").strip()
  if not proveedor:
    return _bad_request("Faltan empresa_id o proveedor")

  lista = _cargar_proveedores_maestros(empresa_id)
  if not lista:
    return jsonify({"error": "No hay proveedores maestros para esta empresa"}), 404

  actualizado = False
  for p in lista:
    if (p.get("nombre_canonico") or "").strip() == proveedor:
      p["centro_coste"] = centro_coste
      actualizado = True
      break

  if not actualizado:
    return jsonify({"error": "Proveedor no encontrado en el maestro"}), 404

  _guardar_proveedores_maestros(empresa_id, lista)
  return jsonify({"ok": True, "mensaje": "Centro de coste actualizado"})


@facturas_proveedores_bp.get("/api/facturas_export")
def exportar_facturas():
  """
  Exporta las facturas de una empresa (y filtros opcionales de año/mes) en CSV con extensión .xlsx.
  Usa la misma fuente que el listado (BD primero, luego CSV si existe).
  """
  empresa_id = request.args.get("empresa_id")
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  year = (request.args.get("year") or "").strip()
  month = (request.args.get("month") or "").strip()
  proveedor_filtro = (request.args.get("proveedor") or "").strip()
  estado_pago_filtro = (request.args.get("estado_pago") or "").strip()
  tarjeta_id_filtro = (request.args.get("tarjeta_id") or "").strip()

  CAMPOS_EXPORT = [
    "fecha_factura",
    "proveedor",
    "nif_proveedor",
    "pais_proveedor",
    "localidad_proveedor",
    "resumen_concepto",
    "numero_factura",
    "base_imponible",
    "iva",
    "retenciones_total",
    "total_a_pagar",
    "estado_pago",
    "tarjeta_asociada",
    "ruta_archivo",
    "ruta_destino",
  ]

  filas_export: list[dict] = []
  try:
    facturas_bd = facturas_db.get_facturas_empresa(empresa_id)
    facturas_filtradas = _filtrar_facturas_en_memoria(facturas_bd, year, month, proveedor_filtro)
    facturas_filtradas = _aplicar_filtros_estado_tarjeta(facturas_filtradas, estado_pago_filtro, tarjeta_id_filtro)
    tarjeta_map: dict[int, str] = {}
    try:
      tarjetas = tarjetas_db.get_tarjetas_empresa(empresa_id, solo_activas=False)
      for t in tarjetas:
        tid = t.get("id")
        if tid is not None:
          alias = (t.get("alias") or "").strip()
          if not alias:
            alias = ((t.get("banco") or "").strip() + " " + (t.get("persona") or "").strip()).strip() or "Tarjeta"
          tarjeta_map[int(tid)] = alias
    except Exception as e:
      logger.warning("Error cargando tarjetas para export: %s", e)
    for f in facturas_filtradas:
      row = {k: str(f.get(k) or "").strip() for k in CAMPOS_EXPORT}
      tid = f.get("tarjeta_id")
      if tid is not None and str(tid).strip():
        try:
          row["tarjeta_asociada"] = tarjeta_map.get(int(tid), "") or ""
        except (TypeError, ValueError):
          row["tarjeta_asociada"] = ""
      else:
        row["tarjeta_asociada"] = ""
      if not row.get("estado_pago"):
        row["estado_pago"] = (f.get("estado_pago") or "pendiente").strip() or "pendiente"
      filas_export.append(row)
  except Exception as e:
    logger.warning("Error preparando facturas para export: %s", e)
  if not filas_export:
    ruta_csv = EMPRESAS_DIR / empresa_id / "base_maestra_facturas.csv"
    if ruta_csv.exists():
      with ruta_csv.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        campos_csv = list(CAMPOS_EXPORT) + (["tarjeta_id"] if tarjeta_id_filtro else [])
        filas_export = _filtrar_filas_csv(
          reader,
          campos_csv,
          year=year,
          month=month,
          campo_filtro="proveedor",
          valor_filtro=proveedor_filtro,
          skip_header_por_empresa=False,
        )
        filas_export = _aplicar_filtros_estado_tarjeta(filas_export, estado_pago_filtro, tarjeta_id_filtro)
  if not filas_export:
    return jsonify({"error": "No hay facturas que cumplan el filtro para exportar"}), 404

  try:
    import openpyxl
    from openpyxl import Workbook
  except ImportError:
    return jsonify({"error": "openpyxl no instalado. pip install openpyxl"}), 500

  wb = Workbook()
  ws = wb.active
  if ws is None:
    return jsonify({"error": "No se pudo crear la hoja de Excel"}), 500
  ws.title = "Facturas"
  for col, key in enumerate(CAMPOS_EXPORT, start=1):
    ws.cell(row=1, column=col, value=key)
  for row_idx, fila in enumerate(filas_export, start=2):
    for col, key in enumerate(CAMPOS_EXPORT, start=1):
      val = fila.get(key)
      if val is None:
        val = ""
      ws.cell(row=row_idx, column=col, value=val)

  buf = io.BytesIO()
  wb.save(buf)
  buf.seek(0)
  nombre_empresa = EMPRESAS_CLIENTE.get(empresa_id, empresa_id)
  sufijo = (year or "todos") + "_" + (month or "todos")
  if proveedor_filtro:
    nombre_safe = re.sub(r'[^\w\s\-]', "", proveedor_filtro)[:30].strip() or "proveedor"
    nombre_safe = nombre_safe.replace(" ", "_")
    filename = f"facturas_{nombre_safe}_{sufijo}.xlsx"
  else:
    filename = f"facturas_{nombre_empresa}_{sufijo}.xlsx"
  filename = re.sub(r'[<>:"/\\|?*,]', "", filename)
  if not filename.endswith(".xlsx"):
    filename = filename.rstrip() + ".xlsx"

  return Response(
    buf.read(),
    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


def _aplicar_filtros_estado_tarjeta(
  filas: list[dict], estado_pago: str, tarjeta_id: str,
) -> list[dict]:
  """Filtra filas por estado_pago y/o tarjeta_id cuando vienen informados."""
  if not estado_pago and not tarjeta_id:
    return filas
  resultado: list[dict] = []
  tarjeta_str = (tarjeta_id or "").strip()
  for f in filas:
    if estado_pago:
      ep = (f.get("estado_pago") or "pendiente").strip() or "pendiente"
      if ep != estado_pago:
        continue
    if tarjeta_str:
      tid = f.get("tarjeta_id")
      if tid is None or str(tid).strip() != tarjeta_str:
        continue
    resultado.append(f)
  return resultado


def _filtrar_facturas_en_memoria(
  facturas: list[dict], year: str, month: str, proveedor_filtro: str = "",
) -> list[dict]:
  """Filtra lista de facturas (dicts) por año, mes y opcionalmente proveedor."""
  resultado: list[dict] = []
  for f in facturas:
    fecha = (f.get("fecha_factura") or "").strip()
    if year and not fecha.startswith(year):
      continue
    if month and (len(fecha) < 7 or fecha[5:7] != month):
      continue
    if proveedor_filtro and (f.get("proveedor") or "").strip() != proveedor_filtro:
      continue
    resultado.append(f)
  return resultado


def _facturas_filtradas_por_fecha(
  empresa_id: str, year: str, month: str, proveedor: str = "",
) -> list[dict]:
  """Devuelve facturas de la empresa filtradas por año, mes y opcionalmente proveedor. Usa BD primero (misma fuente que el listado), luego CSV si existe."""
  try:
    facturas_bd = facturas_db.get_facturas_empresa(empresa_id)
  except Exception as e:
    logger.warning("Error leyendo facturas de BD: %s", e)
    facturas_bd = []
  filas_bd = _filtrar_facturas_en_memoria(facturas_bd, year, month, proveedor)
  if filas_bd:
    return filas_bd
  ruta_csv = EMPRESAS_DIR / empresa_id / "base_maestra_facturas.csv"
  if not ruta_csv.exists():
    return []
  CAMPOS = [
    "fecha_factura", "proveedor", "numero_factura",
    "ruta_archivo", "ruta_destino",
  ]
  with ruta_csv.open("r", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    filas = _filtrar_filas_csv(
      reader,
      CAMPOS,
      year=year,
      month=month,
      campo_filtro="proveedor",
      valor_filtro=proveedor,
      skip_header_por_empresa=False,
    )
  return filas


@facturas_proveedores_bp.get("/api/facturas_zip")
def descargar_facturas_zip():
  """
  Devuelve un ZIP con todos los archivos de facturas visibles (empresa + filtros año/mes).
  """
  empresa_id = request.args.get("empresa_id")
  year = (request.args.get("year") or "").strip()
  month = (request.args.get("month") or "").strip()
  proveedor_filtro = (request.args.get("proveedor") or "").strip()
  estado_pago_filtro = (request.args.get("estado_pago") or "").strip()
  tarjeta_id_filtro = (request.args.get("tarjeta_id") or "").strip()

  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]

  filas = _facturas_filtradas_por_fecha(empresa_id, year, month, proveedor_filtro)
  filas = _aplicar_filtros_estado_tarjeta(filas, estado_pago_filtro, tarjeta_id_filtro)
  if not filas:
    return jsonify({"error": "No hay facturas que cumplan el filtro para descargar"}), 404

  datos_resolved = DATOS_DIR.resolve()
  buf = io.BytesIO()
  nombres_usados: dict[str, int] = {}
  added: list[str] = []

  with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
    for fila in filas:
      ruta_param = (fila.get("ruta_destino") or fila.get("ruta_archivo") or "").strip()
      if not ruta_param:
        continue
      ruta = Path(ruta_param)
      if not ruta.is_absolute():
        ruta = DATOS_DIR / ruta
      ruta = ruta.resolve()
      try:
        ruta.relative_to(datos_resolved)
      except ValueError:
        continue
      if not ruta.exists() or not ruta.is_file():
        continue
      nombre_base = ruta.name
      if nombre_base not in nombres_usados:
        nombres_usados[nombre_base] = 0
      else:
        nombres_usados[nombre_base] += 1
        stem, sufijo = ruta.stem, ruta.suffix
        nombre_base = f"{stem}_{nombres_usados[nombre_base]}{sufijo}"
      zf.write(ruta, arcname=nombre_base)
      added.append(nombre_base)

  if not added:
    return jsonify({"error": "No se encontraron archivos de facturas para incluir en el ZIP"}), 404

  buf.seek(0)
  nombre_empresa = EMPRESAS_CLIENTE.get(empresa_id, empresa_id)
  sufijo = (year or "todos") + "_" + (month or "todos")
  if proveedor_filtro:
    nombre_safe = re.sub(r'[^\w\s-]', "", proveedor_filtro)[:30].strip() or "proveedor"
    filename = f"facturas_{nombre_safe}_{sufijo}.zip"
  else:
    filename = f"facturas_{nombre_empresa}_{sufijo}.zip"

  return send_file(
    buf,
    mimetype="application/zip",
    as_attachment=True,
    download_name=filename,
  )


CAMPOS_CSV_LISTA = [
  "empresa_id", "fecha_factura", "proveedor", "nif_proveedor", "pais_proveedor",
  "localidad_proveedor", "resumen_concepto", "numero_factura", "base_imponible",
  "base_imponible_detalle", "iva", "iva_cuota_detalle", "retenciones_total",
  "retenciones_detalle", "total_factura", "total_a_pagar", "total", "categoria",
  "ruta_archivo", "ruta_destino", "flag_error", "motivo_error", "comentarios_revision",
  "extraccion_vision", "estado_pago", "tarjeta_id", "liquidacion_periodo",
]

# Cache en memoria de listados por empresa (invalidación al editar/eliminar/procesar)
_cache_listado_facturas_proveedores: dict[str, list[dict]] = {}
_cache_listado_facturas_clientes: dict[str, list[dict]] = {}


def _invalidar_cache_listado_proveedores(empresa_id: str) -> None:
  """Invalida el cache de listado de facturas proveedores para una empresa."""
  _cache_listado_facturas_proveedores.pop(empresa_id, None)


def _invalidar_cache_listado_clientes(empresa_id: str) -> None:
  """Invalida el cache de listado de facturas clientes para una empresa."""
  _cache_listado_facturas_clientes.pop(empresa_id, None)


def _leer_facturas_proveedores_desde_csv(empresa_id: str) -> list[dict]:
  """Lee todas las facturas de proveedores desde SQLite (siempre BD; empresas nuevas empiezan vacías)."""
  return facturas_db.get_facturas_empresa(empresa_id)


@facturas_proveedores_bp.post("/api/facturas/migrar-desde-csv")
def migrar_facturas_desde_csv():
  """
  Migra la base maestra de facturas de proveedores desde los CSV (base_maestra_facturas.csv)
  a SQLite (tabla facturas_proveedor). Ejecutar una vez para pasar a usar la BD.
  Devuelve estadísticas y posibles errores.
  """
  try:
    resultado = facturas_db.migrar_desde_csv()
    return jsonify({
      "ok": True,
      "mensaje": "Migración de facturas completada.",
      "empresas_procesadas": resultado["empresas_procesadas"],
      "filas_migradas": resultado["filas_migradas"],
      "errores": resultado.get("errores", []),
    })
  except Exception as e:
    return jsonify({"ok": False, "error": str(e)}), 500


@facturas_proveedores_bp.put("/api/factura")
def actualizar_factura():
  """
  Actualiza una fila de la base maestra (SQLite). La fila se identifica por ruta_destino o ruta_archivo.
  Recibe JSON: { "empresa_id": "...", "factura": { ... } }.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  factura = data.get("factura")
  if not isinstance(factura, dict):
    return _bad_request("Falta empresa_id o factura")

  ruta_identificar = (factura.get("ruta_destino") or factura.get("ruta_archivo") or "").strip()
  if not ruta_identificar:
    return _bad_request("La factura debe tener ruta_destino o ruta_archivo para identificarla")

  todas = facturas_db.get_facturas_empresa(empresa_id)
  actualizado = None
  for f in todas:
    if ((f.get("ruta_destino") or f.get("ruta_archivo")) or "").strip() == ruta_identificar:
      actualizado = {c: (f.get(c) or "") for c in CAMPOS_CSV_LISTA}
      break
  if not actualizado:
    return jsonify({"error": "No se encontró la factura con esa ruta"}), 404
  for k, v in factura.items():
    if k in CAMPOS_CSV_LISTA:
      actualizado[k] = (v.strip() if isinstance(v, str) else str(v or ""))
  actualizado["empresa_id"] = empresa_id
  actualizado["flag_error"] = False
  actualizado["motivo_error"] = ""
  if actualizado.get("estado_pago") not in ("pendiente", "pagada", "parcial"):
    actualizado["estado_pago"] = "pendiente"
  _revisor_basico([actualizado])
  nueva_fecha = (actualizado.get("fecha_factura") or "").strip()
  ruta_archivo_actual = Path(actualizado.get("ruta_destino") or actualizado.get("ruta_archivo") or "")
  if nueva_fecha and ruta_archivo_actual.exists():
    ano_dest = "Sin_fecha"
    mes_dest = "Sin fecha"
    try:
      dt = datetime.fromisoformat(nueva_fecha[:10])
      ano_dest = str(dt.year)
      mes_dest = f"{dt.month:02d}. {dt.strftime('%B')}"
    except Exception as e:
      logger.debug("Fecha no parseable al reubicar factura '%s': %s", nueva_fecha, e)
    destino_dir = FACTURAS_RECIBIDAS_DIR / empresa_id / ano_dest / mes_dest
    destino_dir.mkdir(parents=True, exist_ok=True)
    destino_final = destino_dir / ruta_archivo_actual.name
    if destino_final != ruta_archivo_actual:
      cnt = 2
      while destino_final.exists():
        destino_final = destino_dir / f"{ruta_archivo_actual.stem}_{cnt}{ruta_archivo_actual.suffix}"
        cnt += 1
      shutil.move(str(ruta_archivo_actual), destino_final)
      actualizado["ruta_destino"] = str(destino_final)
  ok = facturas_db.update_factura(empresa_id, actualizado)
  if not ok:
    return jsonify({"error": "No se pudo actualizar la factura en la base de datos"}), 500
  _sincronizar_proveedores_desde_facturas(empresa_id)
  _invalidar_cache_listado_proveedores(empresa_id)
  return jsonify({"ok": True, "mensaje": "Factura actualizada en la base maestra."})


@facturas_proveedores_bp.delete("/api/facturas")
def eliminar_facturas():
  """
  Elimina una o varias filas del maestro (SQLite) identificadas por sus rutas (ruta_destino o ruta_archivo).
  Recibe JSON: { "empresa_id": "...", "rutas": ["ruta1", "ruta2", ...] }.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  rutas_eliminar = data.get("rutas")
  if not isinstance(rutas_eliminar, list) or not rutas_eliminar:
    return _bad_request("Falta empresa_id o rutas")

  rutas_set = set(r.strip() for r in rutas_eliminar if isinstance(r, str) and r.strip())
  if not rutas_set:
    return _bad_request("No se proporcionaron rutas válidas")

  eliminadas = facturas_db.delete_facturas(empresa_id, list(rutas_set))
  _sincronizar_proveedores_desde_facturas(empresa_id)
  _invalidar_cache_listado_proveedores(empresa_id)
  return jsonify({"ok": True, "eliminadas": eliminadas, "mensaje": f"{eliminadas} factura(s) eliminada(s)."})


@archivo_bp.get("/api/archivo")
def servir_archivo():
  """
  Sirve un archivo de factura por ruta. Solo permite rutas dentro de data/.
  """
  ruta_param = request.args.get("ruta")
  if not ruta_param:
    return _bad_request("Falta ruta")

  ruta = Path(ruta_param)
  if not ruta.is_absolute():
    ruta = DATOS_DIR / ruta
  ruta = ruta.resolve()

  try:
    ruta.relative_to(DATOS_DIR.resolve())
  except ValueError:
    return jsonify({"error": "Ruta no permitida"}), 403

  if not ruta.exists() or not ruta.is_file():
    return jsonify({"error": "Archivo no encontrado"}), 404

  return send_file(ruta, as_attachment=False, download_name=ruta.name)


# ─── Pipeline de procesamiento de Facturas de Clientes (Emitidas) ─────────


def _extraer_una_factura_llm_cliente(ruta: Path, empresa_id: str) -> dict | None:
  """
  Extrae los campos de una sola factura emitida (cliente) con visión y/o LLM.
  Devuelve la fila de datos o None si no se pudo extraer.
  Usado por _extractor_llm_clientes para ejecución en paralelo.
  """
  usar_vision = False
  datos: dict = {}
  suf = (ruta.suffix or "").lower()
  es_imagen = suf in (".jpg", ".jpeg", ".png", ".webp", ".gif")

  if es_imagen:
    datos = _extraer_campos_vision(ruta, empresa_id, tipo="cliente")
    if datos:
      usar_vision = True
      _registrar_vision_control(empresa_id, ruta.name, str(ruta))

  texto = ""

  if not datos:
    texto = _leer_texto_factura(ruta)
    texto = _normalizar_texto(texto)
    datos = _extraer_campos_llm(texto, empresa_id, tipo="cliente")

  if not datos:
    return None

  claves_clave = ["cliente", "cif_nif", "fecha_factura", "numero_factura", "total_a_pagar"]

  def _es_casi_sin_datos(d: dict) -> bool:
    num_no_vacias = sum(1 for c in claves_clave if str(d.get(c, "") or "").strip())
    return num_no_vacias <= 2

  if _es_casi_sin_datos(datos):
    if es_imagen and usar_vision:
      if not texto:
        texto = _leer_texto_factura(ruta)
        texto = _normalizar_texto(texto)
      datos_texto = _extraer_campos_llm(texto, empresa_id, tipo="cliente")
      if datos_texto and not _es_casi_sin_datos(datos_texto):
        datos = datos_texto
        usar_vision = False
    elif es_imagen and not usar_vision:
      datos_vision = _extraer_campos_vision(ruta, empresa_id, tipo="cliente")
      if datos_vision and not _es_casi_sin_datos(datos_vision):
        datos = datos_vision
        usar_vision = True
        _registrar_vision_control(empresa_id, ruta.name, str(ruta))

  if _es_casi_sin_datos(datos):
    return None

  fila = {
    "ruta_archivo": str(ruta),
    "empresa_id": empresa_id,
    "extraccion_vision": "1" if usar_vision else "",
  }
  for campo in _CLAVES_FACTURA_CLIENTE:
    fila[campo] = str(datos.get(campo, "") or "").strip()

  return fila


def _extractor_llm_clientes(rutas: list[Path], empresa_id: str) -> list[dict]:
  """
  Extractor LLM para facturas emitidas a clientes.
  Misma cascada visión/texto que el de proveedores. Procesa en paralelo con ThreadPoolExecutor.
  """
  filas: list[dict] = []
  if not rutas:
    return filas
  workers = min(_MAX_WORKERS_EXTRACTOR_LLM, len(rutas))
  with ThreadPoolExecutor(max_workers=workers) as executor:
    futures = [executor.submit(_extraer_una_factura_llm_cliente, ruta, empresa_id) for ruta in rutas]
    for fut in futures:
      try:
        fila = fut.result()
        if fila is not None:
          filas.append(fila)
      except Exception as e:
        logger.warning("Error procesando factura cliente en paralelo: %s", e)
  return filas


def _extractor_basico_clientes(rutas: list[Path], empresa_id: str) -> list[dict]:
  """Extractor básico (backup) para facturas de clientes: solo extrae fecha, NIF y totales."""
  filas: list[dict] = []
  for ruta in rutas:
    texto = _leer_texto_factura(ruta)
    texto = _normalizar_texto(texto)
    fecha = _buscar_primera_fecha(texto)
    nif = _buscar_nif_cif(texto)
    importes = _buscar_importes(texto)

    def fmt(v) -> str:
      return "" if v is None else f"{v:.2f}" if isinstance(v, float) else str(v)

    fila = {
      "ruta_archivo": str(ruta),
      "empresa_id": empresa_id,
      "fecha_factura": fecha,
      "cliente": "",
      "cif_nif": nif,
      "pais": "",
      "localidad": "",
      "proyecto": "",
      "tipologia": "",
      "num_hincadoras": "",
      "num_ayudantes": "",
      "pricing_servicio": "",
      "pricing_transporte": "",
      "iva": fmt(importes.get("iva_cuota_total")),
      "total_a_pagar": fmt(importes.get("total_a_pagar") or importes.get("total_factura")),
      "numero_factura": _buscar_numero_factura(texto),
      "extraccion_vision": "",
    }
    filas.append(fila)
  return filas


def _revisor_basico_clientes(filas: list[dict]) -> list[dict]:
  """Revisor simplificado para facturas de clientes: asegura campos y flags."""
  for fila in filas:
    fila.setdefault("flag_error", False)
    fila.setdefault("motivo_error", "")
    fila.setdefault("extraccion_vision", "")

    fecha = (fila.get("fecha_factura") or "").strip()
    if not fecha:
      fila["flag_error"] = True
      motivo = fila.get("motivo_error") or ""
      fila["motivo_error"] = (motivo + " Sin fecha de factura.").strip()
    else:
      try:
        fecha_dt = datetime.fromisoformat(fecha[:10]).date()
        if fecha_dt > datetime.now().date():
          fila["flag_error"] = True
          motivo = fila.get("motivo_error") or ""
          fila["motivo_error"] = (motivo + f" Fecha futura ({fecha[:10]}).").strip()
      except Exception as e:
        logger.debug("No se pudo parsear fecha '%s': %s", fecha[:10], e)

    iva_val = _normalizar_importe_str(fila.get("iva") or "")
    total_val = _normalizar_importe_str(fila.get("total_a_pagar") or "")

    pricing_sum = 0.0
    for campo_p in ("pricing_servicio", "pricing_transporte"):
      v = _normalizar_importe_str(fila.get(campo_p) or "")
      if v is not None:
        pricing_sum += v

    if pricing_sum > 0 and iva_val is not None and total_val is not None:
      esperado = pricing_sum + iva_val
      if abs(esperado - total_val) > 0.05:
        fila["flag_error"] = True
        fila["motivo_error"] = (
          f"Descuadre: pricing({pricing_sum:.2f}) + iva({iva_val:.2f}) != total({total_val:.2f})"
        )
  return filas


def _archivador_facturas_emitidas(filas: list[dict]) -> list[dict]:
  """Archivador: mueve archivos a Facturas Emitidas/{Empresa}/{Año}/{MM. Mes}/."""
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

    destino_dir = FACTURAS_EMITIDAS_DIR / empresa_id / año / mes_carpeta
    destino_dir.mkdir(parents=True, exist_ok=True)

    nombre = ruta_actual.name
    destino = destino_dir / nombre

    contador = 2
    while destino.exists():
      destino = destino_dir / f"{ruta_actual.stem}_{contador}{ruta_actual.suffix}"
      contador += 1

    shutil.move(str(ruta_actual), destino)
    fila["ruta_destino"] = str(destino)
    fila["ruta_archivo"] = str(destino)
    resultados.append(fila)

  return resultados


def _get_hashes_csv_clientes(empresa_id: str) -> set[str]:
  """Devuelve el conjunto de hash_archivo ya presentes en la BD de clientes de la empresa."""
  return facturas_cliente_db.get_hashes_empresa_cliente(empresa_id)


def _base_maestra_csv_clientes(filas: list[dict], empresa_id: str) -> dict:
  """Guarda las facturas de clientes procesadas en la BD (tabla facturas_cliente)."""
  filas_escritas = facturas_cliente_db.insert_facturas_clientes(empresa_id, filas)
  return {
    "ruta_base_maestra": "BD (facturas_cliente)",
    "filas_añadidas": filas_escritas,
  }


def procesar_lote_clientes(empresa_id: str, carpeta: Path) -> dict:
  """
  Orquestador para facturas emitidas a clientes:
  Recolector → Extractor → Revisor → Archivador → Base de datos.
  """
  archivos = _recolector(carpeta)
  if not archivos:
    return {
      "procesado": False,
      "motivo": "No se han encontrado archivos en la carpeta de entrada.",
      "empresa_id": empresa_id,
      "carpeta_entrada": str(carpeta),
    }

  tabla = _extractor_llm_clientes(archivos, empresa_id)
  if not tabla:
    tabla = _extractor_basico_clientes(archivos, empresa_id)

  for fila in tabla:
    pais = (fila.get("pais") or "").strip()
    localidad = (fila.get("localidad") or "").strip()
    if not pais and localidad:
      pais_detectado = _obtener_pais_desde_localidad(localidad)
      if pais_detectado:
        fila["pais"] = pais_detectado

  tabla = _revisor_basico_clientes(tabla)
  _añadir_hashes_tabla_clientes(tabla)
  hashes_existentes = _get_hashes_csv_clientes(empresa_id)
  tabla_sin_duplicados = [
    f for f in tabla
    if (f.get("hash_archivo") or "").strip() and (f.get("hash_archivo") or "").strip() not in hashes_existentes
  ]
  duplicados_omitidos = len(tabla) - len(tabla_sin_duplicados)
  tabla = _archivador_facturas_emitidas(tabla_sin_duplicados)
  resumen_bd = _base_maestra_csv_clientes(tabla, empresa_id)
  facturas_con_vision = sum(1 for f in tabla if str(f.get("extraccion_vision") or "").strip() == "1")

  return {
    "procesado": True,
    "empresa_id": empresa_id,
    "carpeta_entrada": str(carpeta),
    "facturas_procesadas": len(tabla_sin_duplicados),
    "facturas_omitidas_duplicadas": duplicados_omitidos,
    "facturas_con_vision": facturas_con_vision,
    "ruta_base_maestra": resumen_bd["ruta_base_maestra"],
    "filas_añadidas": resumen_bd["filas_añadidas"],
  }


# ─── Facturas de Clientes (Facturas Emitidas) – Constantes y CRUD ────────────

CAMPOS_FACTURAS_CLIENTES = [
  "empresa_id",
  "fecha_factura",
  "cliente",
  "cif_nif",
  "pais",
  "localidad",
  "proyecto",
  "tipologia",
  "num_hincadoras",
  "num_ayudantes",
  "pricing_servicio",
  "pricing_transporte",
  "iva",
  "total_a_pagar",
  "numero_factura",
  "ruta_archivo",
  "hash_archivo",
]


def _ruta_csv_clientes(empresa_id: str) -> Path:
  empresa_dir = EMPRESAS_DIR / empresa_id
  empresa_dir.mkdir(parents=True, exist_ok=True)
  return empresa_dir / "facturas_clientes.csv"


def _leer_facturas_clientes_desde_csv(empresa_id: str) -> list[dict]:
  """Lee todas las facturas de clientes de la empresa desde SQLite (BD).
  Mantiene el mismo contrato que antes (lista de dicts con CAMPOS_FACTURAS_CLIENTES)
  para no romper listados, export, clientes únicos ni cache."""
  return facturas_cliente_db.get_facturas_cliente_empresa(empresa_id)


def _get_clientes_unicos_empresa(empresa_id: str) -> list[dict]:
  """
  Devuelve la lista de clientes únicos de la empresa a partir de las facturas de clientes (BD, tabla facturas_cliente).
  Agrupa por (cliente, cif_nif); cada elemento tiene cliente, cif_nif, pais, localidad
  (y opcionalmente proyecto) tomados de la primera factura que aparezca para ese cliente.
  Compatible con el maestro de terceros (GET /api/empresas/<id>/clientes fusiona maestro + este agregado).
  """
  facturas = _leer_facturas_clientes_desde_csv(empresa_id)
  vistos: dict[tuple[str, str], dict] = {}
  for f in facturas:
    cliente = (f.get("cliente") or "").strip()
    cif_nif = (f.get("cif_nif") or "").strip()
    if not cliente and not cif_nif:
      continue
    clave = (cliente, cif_nif)
    if clave not in vistos:
      vistos[clave] = {
        "cliente": cliente,
        "cif_nif": cif_nif,
        "pais": (f.get("pais") or "").strip(),
        "localidad": (f.get("localidad") or "").strip(),
        "proyecto": (f.get("proyecto") or "").strip(),
      }
  return sorted(vistos.values(), key=lambda x: (x["cliente"], x["cif_nif"]))


@facturas_clientes_bp.post("/api/procesar_clientes")
def procesar_clientes():
  """Recibe archivos de facturas emitidas a clientes y lanza el pipeline de extracción."""
  ensure_dirs()

  empresa_id = request.form.get("empresa_id")
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]

  files = request.files.getlist("archivos")
  if not files:
    return _bad_request("No se han recibido archivos")

  timestamp = int(time.time())
  destino = SUBIDAS_DIR / empresa_id / f"clientes_{timestamp}"
  destino.mkdir(parents=True, exist_ok=True)

  nombres_guardados = []
  for f in files:
    nombre = f.filename or f"factura_{len(nombres_guardados) + 1}.dat"
    ruta = destino / os.path.basename(nombre)
    f.save(ruta)
    nombres_guardados.append(str(ruta))

  resumen = procesar_lote_clientes(empresa_id, destino)
  _invalidar_cache_listado_clientes(empresa_id)

  mensaje = "Facturas de clientes procesadas correctamente."
  if not resumen.get("procesado"):
    mensaje = resumen.get("motivo", "No se han podido procesar las facturas.")

  return jsonify(
    {
      "mensaje": mensaje,
      "empresa_id": empresa_id,
      "carpeta_entrada": str(destino),
      "archivos_entrada": nombres_guardados,
      "resumen_proceso": resumen,
    }
  )


@facturas_clientes_bp.get("/api/facturas_clientes")
def listar_facturas_clientes():
  """Listado de facturas emitidas a clientes; usa cache en memoria por empresa.
  Si solo_pendientes_vinculacion=1, excluye las ya vinculadas a un movimiento de caja."""
  empresa_id, err = _validar_empresa_id_requerido(request.args.get("empresa_id"))
  if err:
    return jsonify({"facturas": [], "error": "Falta empresa_id"}), 400
  filtro_cliente = (request.args.get("cliente") or "").strip()
  solo_pendientes = request.args.get("solo_pendientes_vinculacion", "").strip().lower() in ("1", "true", "yes")
  if empresa_id in _cache_listado_facturas_clientes:
    facturas = list(_cache_listado_facturas_clientes[empresa_id])
  else:
    facturas = _leer_facturas_clientes_desde_csv(empresa_id)
    _cache_listado_facturas_clientes[empresa_id] = facturas
  if filtro_cliente:
    facturas = [f for f in facturas if (f.get("cliente") or "").strip() == filtro_cliente]
  if solo_pendientes and facturas:
    _init_movimientos_db()
    conn_bancos = _get_bancos_db()
    try:
      rows = conn_bancos.execute(
        "SELECT factura_cliente_key FROM movimientos WHERE empresa_id = ? AND factura_cliente_key IS NOT NULL AND TRIM(COALESCE(factura_cliente_key, '')) != ''",
        (empresa_id,),
      ).fetchall()
      keys_vinculadas = {r[0].strip() for r in rows if r and r[0]}
    finally:
      conn_bancos.close()
    facturas = [
      f for f in facturas
      if _factura_cliente_key(f.get("numero_factura"), f.get("fecha_factura"), f.get("cliente")) not in keys_vinculadas
    ]
  return jsonify({"facturas": facturas, "empresa_id": empresa_id})


@facturas_clientes_bp.get("/api/clientes_unicos")
def clientes_unicos():
  """Lista de nombres de cliente únicos; usa cache de listado de facturas clientes."""
  empresa_id, err = _validar_empresa_id_requerido(request.args.get("empresa_id"))
  if err:
    return jsonify({"clientes": [], "error": "Falta empresa_id"}), 400
  if empresa_id in _cache_listado_facturas_clientes:
    facturas = _cache_listado_facturas_clientes[empresa_id]
  else:
    facturas = _leer_facturas_clientes_desde_csv(empresa_id)
    _cache_listado_facturas_clientes[empresa_id] = facturas
  nombres: set[str] = set((f.get("cliente") or "").strip() for f in facturas if (f.get("cliente") or "").strip())
  return jsonify({"clientes": sorted(nombres), "empresa_id": empresa_id})


@facturas_clientes_bp.get("/api/empresas/<empresa_id>/clientes")
def listar_clientes_por_empresa(empresa_id: str):
  """Listado de clientes únicos: maestro (BD terceros) + agregado desde facturas de clientes (BD facturas_cliente). Cada item tiene en_maestro true si está en el maestro."""
  empresa_id, err = _validar_empresa_id_requerido(empresa_id)
  if err:
    return err[0], err[1]
  desde_bd = terceros_db.get_clientes_empresa(empresa_id) if terceros_db.hay_clientes_en_bd() else []
  agregado_facturas = _get_clientes_unicos_empresa(empresa_id)
  clave_bd = {((c.get("cliente") or "").strip(), (c.get("cif_nif") or "").strip()) for c in desde_bd}
  merged: list[dict] = []
  for c in desde_bd:
    merged.append({**c, "en_maestro": True})
  for c in agregado_facturas:
    cli = (c.get("cliente") or "").strip()
    cif = (c.get("cif_nif") or "").strip()
    if (cli, cif) not in clave_bd:
      merged.append({**c, "en_maestro": False})
      clave_bd.add((cli, cif))
  merged.sort(key=lambda x: ((x.get("cliente") or "").lower(), (x.get("cif_nif") or "").lower()))
  return jsonify({"clientes": merged, "empresa_id": empresa_id})


def _normalizar_cliente_body(data: dict) -> dict:
  """Extrae y normaliza campos de cliente desde el body."""
  return {
    "cliente": (data.get("cliente") or "").strip(),
    "cif_nif": (data.get("cif_nif") or "").strip(),
    "pais": (data.get("pais") or "").strip(),
    "localidad": (data.get("localidad") or "").strip(),
    "proyecto": (data.get("proyecto") or "").strip(),
    "direccion": (data.get("direccion") or "").strip(),
    "email": (data.get("email") or "").strip(),
    "telefono": (data.get("telefono") or "").strip(),
  }


@facturas_clientes_bp.post("/api/clientes")
def crear_cliente():
  """
  Alta de cliente en el maestro de la empresa (terceros + empresa_tercero con es_cliente=1).
  JSON: empresa_id (obligatorio), cliente, cif_nif (mínimos), pais, localidad, proyecto, direccion, email, telefono.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  c = _normalizar_cliente_body(data)
  if not c["cliente"]:
    return _bad_request("El nombre del cliente es obligatorio")
  if not c["cif_nif"]:
    return _bad_request("El CIF/NIF del cliente es obligatorio")
  lista_bd = terceros_db.get_clientes_empresa(empresa_id) if terceros_db.hay_clientes_en_bd() else []
  for existente in lista_bd:
    if (existente.get("cliente") or "").strip() == c["cliente"] and (existente.get("cif_nif") or "").strip() == c["cif_nif"]:
      return jsonify({"error": "Ya existe un cliente con ese nombre y CIF en esta empresa"}), 409
  lista_bd.append(c)
  terceros_db.init_terceros_db()
  terceros_db.guardar_clientes_empresa(empresa_id, lista_bd)
  return jsonify({"ok": True, "clientes": terceros_db.get_clientes_empresa(empresa_id), "empresa_id": empresa_id}), 201


@facturas_clientes_bp.put("/api/clientes")
def actualizar_cliente():
  """
  Edición de un cliente del maestro. Se identifica por old_cliente y old_cif_nif.
  JSON: empresa_id, old_cliente, old_cif_nif, y el resto de campos (cliente, cif_nif, ...).
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  old_cliente = (data.get("old_cliente") or "").strip()
  old_cif = (data.get("old_cif_nif") or "").strip()
  if not old_cliente and not old_cif:
    return _bad_request("Faltan old_cliente y old_cif_nif para identificar el cliente")
  c = _normalizar_cliente_body(data)
  if not c["cliente"]:
    return _bad_request("El nombre del cliente es obligatorio")
  if not c["cif_nif"]:
    return _bad_request("El CIF/NIF del cliente es obligatorio")
  lista_bd = terceros_db.get_clientes_empresa(empresa_id) if terceros_db.hay_clientes_en_bd() else []
  idx = -1
  for i, existente in enumerate(lista_bd):
    if (existente.get("cliente") or "").strip() == old_cliente and (existente.get("cif_nif") or "").strip() == old_cif:
      idx = i
      break
  if idx < 0:
    return jsonify({"error": "Cliente no encontrado en el maestro"}), 404
  lista_bd[idx] = c
  terceros_db.init_terceros_db()
  terceros_db.guardar_clientes_empresa(empresa_id, lista_bd)
  return jsonify({"ok": True, "clientes": terceros_db.get_clientes_empresa(empresa_id), "empresa_id": empresa_id})


@facturas_clientes_bp.delete("/api/clientes")
def eliminar_cliente():
  """
  Elimina un cliente del maestro. Solo si está en el maestro.
  Body: { "empresa_id": "...", "cliente": "...", "cif_nif": "..." }.
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  cliente = (data.get("cliente") or "").strip()
  cif_nif = (data.get("cif_nif") or "").strip()
  if not cliente and not cif_nif:
    return _bad_request("Faltan cliente y cif_nif para identificar el cliente")
  terceros_db.init_terceros_db()
  lista_bd = terceros_db.get_clientes_empresa(empresa_id) if terceros_db.hay_clientes_en_bd() else []
  nueva_lista = [
    c for c in lista_bd
    if not (
      (c.get("cliente") or "").strip() == cliente
      and (c.get("cif_nif") or "").strip() == cif_nif
    )
  ]
  if len(nueva_lista) == len(lista_bd):
    return jsonify({"error": "Cliente no encontrado en el maestro"}), 404
  terceros_db.guardar_clientes_empresa(empresa_id, nueva_lista)
  _invalidar_cache_listado_clientes(empresa_id)
  return jsonify({"ok": True, "clientes": nueva_lista, "empresa_id": empresa_id, "mensaje": "Cliente eliminado del maestro."})


@facturas_clientes_bp.get("/api/facturas_clientes_export")
def exportar_facturas_clientes():
  """Exporta las facturas de clientes en CSV con extensión .xlsx."""
  empresa_id, err = _validar_empresa_id_requerido(request.args.get("empresa_id"))
  if err:
    return err[0], err[1]
  year = (request.args.get("year") or "").strip()
  month = (request.args.get("month") or "").strip()
  cliente_filtro = (request.args.get("cliente") or "").strip()
  facturas = facturas_cliente_db.get_facturas_cliente_empresa(empresa_id)
  if not facturas:
    return jsonify({"error": "No hay datos para exportar"}), 404
  CAMPOS_EXPORT_CLI = [
    "fecha_factura", "cliente", "cif_nif", "pais", "localidad",
    "numero_factura", "proyecto", "tipologia", "num_hincadoras",
    "num_ayudantes", "pricing_servicio", "pricing_transporte",
    "iva", "total_a_pagar",
  ]
  filas_export = _filtrar_filas_csv(
    iter(facturas),
    CAMPOS_EXPORT_CLI,
    year=year,
    month=month,
    campo_filtro="cliente",
    valor_filtro=cliente_filtro,
    skip_header_por_empresa=False,
  )
  if not filas_export:
    return jsonify({"error": "No hay facturas que cumplan el filtro"}), 404
  output = io.StringIO()
  writer = csv.DictWriter(output, fieldnames=CAMPOS_EXPORT_CLI)
  writer.writeheader()
  for fila in filas_export:
    writer.writerow(fila)
  output.seek(0)
  nombre_empresa = EMPRESAS_CLIENTE.get(empresa_id, empresa_id)
  sufijo = (year or "todos") + "_" + (month or "todos")
  if cliente_filtro:
    nombre_safe = re.sub(r'[^\w\s-]', "", cliente_filtro)[:30].strip() or "cliente"
    filename = f"facturas_{nombre_safe}_{sufijo}.xlsx"
  else:
    filename = f"facturas_clientes_{nombre_empresa}_{sufijo}.xlsx"
  return Response(
    output.read(),
    mimetype="text/csv",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


@facturas_clientes_bp.get("/api/facturas_clientes_zip")
def descargar_facturas_clientes_zip():
  """Devuelve un ZIP con los archivos de facturas de clientes."""
  empresa_id, err = _validar_empresa_id_requerido(request.args.get("empresa_id"))
  if err:
    return err[0], err[1]
  year = (request.args.get("year") or "").strip()
  month = (request.args.get("month") or "").strip()
  cliente_filtro = (request.args.get("cliente") or "").strip()
  facturas = facturas_cliente_db.get_facturas_cliente_empresa(empresa_id)
  if not facturas:
    return jsonify({"error": "No hay facturas para descargar"}), 404
  CAMPOS_ZIP_CLI = [
    "fecha_factura",
    "cliente",
    "ruta_archivo",
  ]
  filas_zip = _filtrar_filas_csv(
    iter(facturas),
    CAMPOS_ZIP_CLI,
    year=year,
    month=month,
    campo_filtro="cliente",
    valor_filtro=cliente_filtro,
    skip_header_por_empresa=False,
  )
  rutas_archivos = [(f.get("ruta_archivo") or "").strip() for f in filas_zip if (f.get("ruta_archivo") or "").strip()]
  if not rutas_archivos:
    return jsonify({"error": "No hay archivos que cumplan el filtro"}), 404
  datos_resolved = DATOS_DIR.resolve()
  buf = io.BytesIO()
  nombres_usados: dict[str, int] = {}
  added: list[str] = []
  with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
    for ruta_param in rutas_archivos:
      ruta = Path(ruta_param)
      if not ruta.is_absolute():
        ruta = DATOS_DIR / ruta
      ruta = ruta.resolve()
      try:
        ruta.relative_to(datos_resolved)
      except ValueError:
        continue
      if not ruta.exists() or not ruta.is_file():
        continue
      nombre_base = ruta.name
      if nombre_base not in nombres_usados:
        nombres_usados[nombre_base] = 0
      else:
        nombres_usados[nombre_base] += 1
        stem, suf = ruta.stem, ruta.suffix
        nombre_base = f"{stem}_{nombres_usados[nombre_base]}{suf}"
      zf.write(ruta, arcname=nombre_base)
      added.append(nombre_base)
  if not added:
    return jsonify({"error": "No se encontraron archivos para incluir en el ZIP"}), 404
  buf.seek(0)
  nombre_empresa = EMPRESAS_CLIENTE.get(empresa_id, empresa_id)
  sufijo = (year or "todos") + "_" + (month or "todos")
  if cliente_filtro:
    nombre_safe = re.sub(r'[^\w\s-]', "", cliente_filtro)[:30].strip() or "cliente"
    filename = f"facturas_{nombre_safe}_{sufijo}.zip"
  else:
    filename = f"facturas_clientes_{nombre_empresa}_{sufijo}.zip"
  return Response(
    buf.read(),
    mimetype="application/zip",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


@facturas_clientes_bp.post("/api/facturas_clientes/migrar-desde-csv")
def migrar_facturas_clientes_desde_csv():
  """
  Migra las facturas de clientes desde los CSV (facturas_clientes.csv por empresa)
  a SQLite (tabla facturas_cliente). Ejecutar una vez para rellenar la BD desde CSV existentes.
  Tras ejecutarlo, la fuente de verdad es la BD; los CSV pueden conservarse como respaldo histórico.
  Devuelve estadísticas y posibles errores.
  """
  try:
    resultado = facturas_cliente_db.migrar_desde_csv_clientes()
    return jsonify({
      "ok": True,
      "mensaje": "Migración de facturas de clientes completada.",
      "empresas_procesadas": resultado["empresas_procesadas"],
      "filas_migradas": resultado["filas_migradas"],
      "errores": resultado.get("errores", []),
    })
  except Exception as e:
    return jsonify({"ok": False, "error": str(e)}), 500


@facturas_clientes_bp.post("/api/factura_cliente")
def crear_factura_cliente():
  """Crea una nueva factura de cliente (manual)."""
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  factura = data.get("factura")
  if not isinstance(factura, dict):
    return _bad_request("Falta empresa_id o factura")
  row = {c: str(factura.get(c, "") or "").strip() for c in CAMPOS_FACTURAS_CLIENTES}
  row["empresa_id"] = empresa_id
  facturas_cliente_db.insert_factura_cliente(empresa_id, row)
  _invalidar_cache_listado_clientes(empresa_id)
  return jsonify({"ok": True, "mensaje": "Factura de cliente registrada."})


@facturas_clientes_bp.put("/api/factura_cliente")
def actualizar_factura_cliente():
  """Actualiza una factura de cliente identificada por empresa_id + numero_factura + fecha_factura + cliente."""
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  factura = data.get("factura")
  clave_original = data.get("clave_original") or {}
  if not isinstance(factura, dict):
    return _bad_request("Falta empresa_id o factura")
  id_num = (clave_original.get("numero_factura") or factura.get("numero_factura") or "").strip()
  id_fecha = (clave_original.get("fecha_factura") or factura.get("fecha_factura") or "").strip()
  id_cliente = (clave_original.get("cliente") or factura.get("cliente") or "").strip()
  if not id_num and not id_fecha and not id_cliente:
    return _bad_request("No se puede identificar la factura a actualizar")
  actualizado = {c: (factura.get(c) or "").strip() for c in CAMPOS_FACTURAS_CLIENTES}
  actualizado["empresa_id"] = empresa_id
  _revisor_basico_clientes([actualizado])
  ok = facturas_cliente_db.update_factura_cliente(empresa_id, actualizado, clave_original)
  if not ok:
    return jsonify({"error": "No se encontró la factura de cliente a actualizar"}), 404
  _invalidar_cache_listado_clientes(empresa_id)
  return jsonify({"ok": True, "mensaje": "Factura de cliente actualizada."})


@facturas_clientes_bp.delete("/api/facturas_clientes")
def eliminar_facturas_clientes():
  """Elimina facturas de clientes por índice (posición en el listado)."""
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  indices = data.get("indices")
  if not isinstance(indices, list) or not indices:
    return _bad_request("Falta empresa_id o indices")
  eliminadas = facturas_cliente_db.delete_facturas_cliente_por_indices(empresa_id, indices)
  _invalidar_cache_listado_clientes(empresa_id)
  return jsonify({"ok": True, "eliminadas": eliminadas, "mensaje": f"{eliminadas} factura(s) de cliente eliminada(s)."})


@control_calidad_bp.post("/api/control-calidad/analizar")
def control_calidad_analizar():
  """
  Ejecuta el análisis de calidad sobre las facturas (proveedores y/o clientes).
  Parámetros (JSON): empresa_id (obligatorio), tipo opcional: "proveedores" | "clientes" | "ambos",
  incluir_tests opcional: true para ejecutar tests unitarios y devolver resultado.
  """
  import unittest

  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  tipo = (data.get("tipo") or "ambos").strip().lower()
  if tipo not in ("proveedores", "clientes", "ambos"):
    return _bad_request('tipo debe ser "proveedores", "clientes" o "ambos"')
  incluir_tests = data.get("incluir_tests") is True

  # Cargar facturas (misma lógica que listado, con cache)
  filas_proveedores: list[dict] = []
  filas_clientes: list[dict] = []
  if tipo in ("proveedores", "ambos"):
    if empresa_id in _cache_listado_facturas_proveedores:
      filas_proveedores = _cache_listado_facturas_proveedores[empresa_id]
    else:
      filas_proveedores = _leer_facturas_proveedores_desde_csv(empresa_id)
      _cache_listado_facturas_proveedores[empresa_id] = filas_proveedores
  if tipo in ("clientes", "ambos"):
    if empresa_id in _cache_listado_facturas_clientes:
      filas_clientes = _cache_listado_facturas_clientes[empresa_id]
    else:
      filas_clientes = _leer_facturas_clientes_desde_csv(empresa_id)
      _cache_listado_facturas_clientes[empresa_id] = filas_clientes

  # Análisis por fila (tarea 1.1)
  facturas_proveedores = _analizar_facturas_proveedores(filas_proveedores)
  facturas_clientes = _analizar_facturas_clientes(filas_clientes)

  payload = {
    "empresa_id": empresa_id,
    "tipo": tipo,
    "facturas_proveedores": facturas_proveedores,
    "facturas_clientes": facturas_clientes,
  }

  if incluir_tests:
    import sys

    inter_dir = Path(__file__).resolve().parent
    if str(inter_dir) not in sys.path:
      sys.path.insert(0, str(inter_dir))
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName("tests.test_logica_pura")
    result = unittest.TestResult()
    suite.run(result)
    payload["unit_tests"] = {
      "ok": result.wasSuccessful(),
      "total": result.testsRun,
      "fallos": [
        {"test": str(t), "error": (err or "").strip()}
        for t, err in result.failures + result.errors
      ],
    }

  return jsonify(payload)


@control_calidad_bp.post("/api/control-calidad/sugerir")
def control_calidad_sugerir():
  """
  Devuelve sugerencias para una fila con errores: heurísticas y opcionalmente LLM.
  Body (JSON): empresa_id (obligatorio), tipo ("proveedores" | "clientes"), fila (dict),
  errores (list[str]). Opcional: ruta_archivo, indice, usar_llm (bool, default False).
  Si usar_llm es true, se envía la factura y los errores al LLM para que sugiera correcciones;
  se combinan con las heurísticas (prioridad a heurísticas en descuadres).
  """
  data = request.get_json(silent=True) or {}
  empresa_id, err = _validar_empresa_id_requerido(data.get("empresa_id"))
  if err:
    return err[0], err[1]
  tipo = (data.get("tipo") or "").strip().lower()
  if tipo not in ("proveedores", "clientes"):
    return _bad_request('tipo debe ser "proveedores" o "clientes"')
  fila = data.get("fila")
  if not isinstance(fila, dict):
    fila = {}
  errores = data.get("errores")
  if not isinstance(errores, list):
    errores = []
  usar_llm = data.get("usar_llm") is True

  sugerencias = _sugerencias_heuristicas(fila, errores, tipo)
  campos_heuristicos = {s["campo"] for s in sugerencias}
  if usar_llm and client:
    llm_sug = _sugerencias_llm(fila, errores, tipo)
    for s in llm_sug:
      if s["campo"] not in campos_heuristicos:
        sugerencias.append(s)
        campos_heuristicos.add(s["campo"])
  return jsonify({"sugerencias": sugerencias})


# ─── Bancos: movimiento de caja unificado ─────────────────────────────────────

def _get_bancos_db():
  """Abre conexión a la base de datos de movimientos de caja."""
  BANCOS_DIR.mkdir(parents=True, exist_ok=True)
  return sqlite3.connect(MOVIMIENTOS_DB)


_movimientos_db_initialized = False


def _init_movimientos_db():
  """Crea la tabla movimientos si no existe y añade columnas de conciliación si faltan. No-op tras la primera llamada."""
  global _movimientos_db_initialized
  if _movimientos_db_initialized:
    return
  conn = _get_bancos_db()
  try:
    conn.execute("""
      CREATE TABLE IF NOT EXISTS movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_operacion TEXT NOT NULL,
        fecha_valor TEXT,
        concepto TEXT,
        importe REAL NOT NULL,
        divisa TEXT DEFAULT 'EUR',
        saldo REAL,
        banco TEXT NOT NULL,
        codigo TEXT,
        numero_documento TEXT,
        referencia_1 TEXT,
        referencia_2 TEXT,
        empresa_id TEXT,
        hash_dedup TEXT,
        created_at TEXT NOT NULL
      )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS ix_movimientos_banco ON movimientos(banco)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_movimientos_fecha ON movimientos(fecha_operacion)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_movimientos_empresa ON movimientos(empresa_id)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_movimientos_hash_dedup ON movimientos(hash_dedup) WHERE hash_dedup IS NOT NULL")
    # Migración G.3 / G.9: columnas de conciliación
    cur = conn.execute("PRAGMA table_info(movimientos)")
    columnas_existentes = {row[1] for row in cur.fetchall()}
    for col, sql_type in [
      ("factura_proveedor_id", "INTEGER"),
      ("factura_cliente_id", "INTEGER"),
      ("factura_cliente_key", "TEXT"),
      ("conciliado_at", "TEXT"),
      # G.9: vínculo movimiento ↔ liquidación tarjeta
      ("tarjeta_id", "INTEGER"),
      ("liquidacion_periodo", "TEXT"),
    ]:
      if col not in columnas_existentes:
        conn.execute(f"ALTER TABLE movimientos ADD COLUMN {col} {sql_type}")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_movimientos_factura_proveedor ON movimientos(factura_proveedor_id)")
    conn.commit()
  finally:
    conn.close()
  _movimientos_db_initialized = True


def _hash_dedup(banco: str, fecha_operacion: str, importe: float, concepto: str) -> str:
  """Genera un hash para detectar movimientos duplicados."""
  raw = f"{banco}|{fecha_operacion}|{importe}|{(concepto or '').strip()}"
  return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalizar_fecha_dd_mm_yyyy(val) -> str | None:
  """Convierte fecha dd/mm/yyyy, datetime o número Excel (serial) a yyyy-mm-dd."""
  if val is None:
    return None
  if hasattr(val, "strftime"):
    return val.strftime("%Y-%m-%d")
  if isinstance(val, (int, float)) and 1000 < val < 100000:
    try:
      from datetime import datetime, timedelta
      base = datetime(1899, 12, 30)
      dt = base + timedelta(days=float(val))
      return dt.strftime("%Y-%m-%d")
    except Exception as e:
      logger.debug("No se pudo convertir serial Excel %s a fecha: %s", val, e)
  s = str(val).strip()
  if not s:
    return None
  parts = re.split(r"[/\-.\s]+", s)
  if len(parts) == 3:
    try:
      d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
      if y < 100:
        y += 2000
      return f"{y:04d}-{m:02d}-{d:02d}"
    except (ValueError, TypeError):
      pass
  return s


def _normalizar_nombre_columna(s: str) -> str:
  """Normaliza nombre de columna para búsqueda: minúsculas, sin acentos, espacios a _."""
  if not s or not isinstance(s, str):
    return ""
  s = s.strip().lower()
  s = unicodedata.normalize("NFD", s)
  s = "".join(c for c in s if unicodedata.category(c) != "Mn")
  return s.replace(" ", "_").replace("-", "_")


def _buscar_fila_cabecera_santander(filas: list) -> tuple[int, dict[str, int]]:
  """
  Busca en una lista de filas (cada fila es lista de celdas) la que tiene cabeceras
  (Fecha/Concepto/Importe). Devuelve (índice_0based + 1 como fila 1-based, mapa).
  """
  for row_num in range(min(50, len(filas))):
    row = filas[row_num] if row_num < len(filas) else []
    if not row:
      continue
    row = list(row) if row else []
    mapa = {}
    for idx, cell in enumerate(row):
      nombre = _normalizar_nombre_columna(str(cell) if cell is not None else "")
      if not nombre:
        continue
      if ("operacion" in nombre or ("fecha" in nombre and "valor" not in nombre)) and "fecha_operacion" not in mapa:
        mapa["fecha_operacion"] = idx
      elif "fecha" in nombre and "valor" in nombre:
        mapa["fecha_valor"] = idx
      elif "concepto" in nombre:
        mapa["concepto"] = idx
      elif "importe" in nombre and "saldo" not in nombre:
        mapa["importe"] = idx
      elif "divisa" in nombre and mapa.get("divisa") is None:
        mapa["divisa"] = idx
      elif "saldo" in nombre and "importe" not in nombre:
        mapa["saldo"] = idx
      elif "codigo" in nombre:
        mapa["codigo"] = idx
      elif "numero" in nombre and "documento" in nombre:
        mapa["numero_documento"] = idx
      elif "referencia" in nombre and "1" in nombre:
        mapa["referencia_1"] = idx
      elif "referencia" in nombre and "2" in nombre:
        mapa["referencia_2"] = idx
    if "importe" in mapa and ("fecha_operacion" in mapa or "concepto" in mapa):
      if "fecha_operacion" not in mapa and "fecha_valor" in mapa:
        mapa["fecha_operacion"] = mapa["fecha_valor"]
      if "fecha_operacion" not in mapa and len(row) > 0:
        mapa["fecha_operacion"] = 0
      return row_num + 1, mapa  # 1-based row number
  return 0, {}


def _parse_santander_excel(stream) -> list[dict]:
  """
  Lee un Excel de extracto Santander. Carga la hoja en memoria para poder detectar
  cabecera y plan B sobre los mismos datos. Primero detecta por nombre de columna;
  si falla, usa layout fijo validando fecha e importe en la primera fila de datos.
  """
  try:
    import openpyxl
  except ImportError:
    raise RuntimeError("openpyxl no instalado. Ejecuta: pip install openpyxl")
  wb = openpyxl.load_workbook(stream, read_only=False, data_only=True)
  sheet_name = None
  for name in wb.sheetnames:
    if "movimiento" in name.lower():
      sheet_name = name
      break
  if not sheet_name:
    sheet_name = "movimientos" if "movimientos" in wb.sheetnames else (wb.sheetnames[0] if wb.sheetnames else None)
  if not sheet_name:
    wb.close()
    raise ValueError("No se encontró la hoja 'movimientos' en el Excel")
  ws = wb[sheet_name]
  filas_completas = list(ws.iter_rows(min_row=1, max_row=50000, values_only=True))
  wb.close()

  header_row, col_map = _buscar_fila_cabecera_santander(filas_completas)

  # Plan B: layout fijo. Buscar primera fila que tenga fecha válida en col 0 o 2 e importe numérico en col 3 o 5
  if not header_row or not col_map:
    layouts = [
      {"fecha_operacion": 0, "fecha_valor": 1, "concepto": 2, "importe": 3, "divisa": 4, "saldo": 5, "codigo": 7, "numero_documento": 8, "referencia_1": 9, "referencia_2": 10},
      {"fecha_operacion": 2, "fecha_valor": 3, "concepto": 4, "importe": 5, "divisa": 6, "saldo": 7, "codigo": 9, "numero_documento": 10, "referencia_1": 11, "referencia_2": 12},
    ]
    for layout_fijo in layouts:
      idx_fecha = layout_fijo["fecha_operacion"]
      idx_fecha_valor = layout_fijo.get("fecha_valor", idx_fecha + 1)
      idx_importe = layout_fijo["importe"]
      for candidato in range(6, min(14, len(filas_completas))):
        # candidato = fila 1-based de la cabecera; datos en filas candidato+1, candidato+2, ...
        for di in range(1, 7):
          i = candidato - 1 + di
          if i >= len(filas_completas):
            break
          fila = filas_completas[i]
          if not fila:
            continue
          r = list(fila)
          if len(r) <= max(idx_fecha, idx_fecha_valor, idx_importe):
            continue
          fecha_ok = _normalizar_fecha_dd_mm_yyyy(r[idx_fecha]) or _normalizar_fecha_dd_mm_yyyy(r[idx_fecha_valor])
          importe_ok = False
          try:
            float(r[idx_importe])
            importe_ok = True
          except (TypeError, ValueError):
            pass
          if fecha_ok and importe_ok:
            header_row = candidato
            col_map = layout_fijo
            break
        if header_row:
          break
      if header_row:
        break

  if not header_row or not col_map:
    raise ValueError(
      "No se encontró la fila de cabecera con Fecha operación, Concepto e Importe en el Excel. "
      "Asegúrate de usar un extracto de Santander con columnas Fecha operación, Concepto e Importe."
    )
  data_start_0 = header_row  # índice 0-based de la primera fila de datos (header está en header_row - 1)
  filas = filas_completas[data_start_0:]
  resultado = []
  for row in filas:
    if row is None or all(cell is None or str(cell).strip() == "" for cell in (row or [])):
      continue
    r = list(row) if row else []
    try:
      def get(col: str):
        idx = col_map.get(col)
        if idx is None or idx >= len(r):
          return None
        return r[idx]
      fecha_op = _normalizar_fecha_dd_mm_yyyy(get("fecha_operacion"))
      fecha_valor = _normalizar_fecha_dd_mm_yyyy(get("fecha_valor"))
      concepto = (get("concepto") or "")
      if isinstance(concepto, (int, float)):
        concepto = str(concepto).strip()
      else:
        concepto = str(concepto).strip() if concepto is not None else ""
      if not concepto and not fecha_op:
        continue
      importe_val = get("importe")
      try:
        importe = float(importe_val) if importe_val is not None else 0.0
      except (TypeError, ValueError):
        importe = 0.0
      divisa = (get("divisa") or "EUR")
      if isinstance(divisa, (int, float)):
        divisa = str(divisa).strip()
      else:
        divisa = str(divisa).strip() if divisa else "EUR"
      if not divisa:
        divisa = "EUR"
      saldo_val = get("saldo")
      try:
        saldo = float(saldo_val) if saldo_val is not None else None
      except (TypeError, ValueError):
        saldo = None
      codigo = get("codigo")
      codigo = str(codigo).strip() if codigo is not None else None
      codigo = codigo or None
      num_doc = get("numero_documento")
      num_doc = str(num_doc).strip() if num_doc is not None else None
      num_doc = num_doc or None
      ref1 = get("referencia_1")
      ref1 = str(ref1).strip() if ref1 is not None else None
      ref1 = ref1 or None
      ref2 = get("referencia_2")
      ref2 = str(ref2).strip() if ref2 is not None else None
      ref2 = ref2 or None
      if not fecha_op:
        fecha_op = fecha_valor or ""
      if not fecha_op:
        continue
      if not concepto and importe == 0:
        continue
      resultado.append({
        "fecha_operacion": fecha_op,
        "fecha_valor": fecha_valor,
        "concepto": concepto,
        "importe": importe,
        "divisa": divisa,
        "saldo": saldo,
        "banco": "santander",
        "codigo": codigo,
        "numero_documento": num_doc,
        "referencia_1": ref1,
        "referencia_2": ref2,
      })
    except Exception as e:
      logger.debug("Fila Santander no parseable: %s", e)
      continue
  return resultado


def _parse_bbva_excel(stream) -> list[dict]:
  """
  Lee un Excel de extracto BBVA (hoja 'Historico', cabecera fila 16, datos desde 17).
  Columnas: F. CONTABLE, F. VALOR, CÓDIGO, CONCEPTO, BENEFICIARIO/ORDENANTE, OBSERVACIONES, IMPORTE, SALDO, DIVISA.
  Devuelve lista de dicts con keys del modelo unificado.
  """
  try:
    import openpyxl
  except ImportError:
    raise RuntimeError("openpyxl no instalado. Ejecuta: pip install openpyxl")
  wb = openpyxl.load_workbook(stream, read_only=True, data_only=True)
  sheet_name = "Historico" if "Historico" in wb.sheetnames else (wb.sheetnames[0] if wb.sheetnames else None)
  if not sheet_name:
    raise ValueError("No se encontró ninguna hoja en el Excel")
  ws = wb[sheet_name]
  filas = list(ws.iter_rows(min_row=16, max_row=50000, values_only=True))
  wb.close()
  if not filas:
    return []
  # Fila 0 = cabecera. Datos desde fila 1. Columnas: 2=f.contable, 3=f.valor, 4=codigo, 5=concepto, 6=beneficiario, 7=observaciones, 8=importe, 9=saldo, 10=divisa
  resultado = []
  for row in filas[1:]:
    if row is None or all(cell is None or str(cell).strip() == "" for cell in (row or [])):
      continue
    try:
      r = list(row) if row else []
      fecha_op = _normalizar_fecha_dd_mm_yyyy(r[2] if len(r) > 2 else None)
      fecha_valor = _normalizar_fecha_dd_mm_yyyy(r[3] if len(r) > 3 else None)
      codigo = str(r[4]).strip() if len(r) > 4 and r[4] is not None else None
      codigo = codigo or None
      concepto_raw = str(r[5]).strip() if len(r) > 5 and r[5] is not None else ""
      beneficiario = str(r[6]).strip() if len(r) > 6 and r[6] else ""
      observaciones = str(r[7]).strip() if len(r) > 7 and r[7] else ""
      partes = [p for p in [concepto_raw, beneficiario, observaciones] if p]
      concepto = " | ".join(partes) if partes else ""
      try:
        importe = float(r[8]) if len(r) > 8 and r[8] is not None else 0.0
      except (TypeError, ValueError):
        importe = 0.0
      try:
        saldo = float(r[9]) if len(r) > 9 and r[9] is not None else None
      except (TypeError, ValueError):
        saldo = None
      divisa = str(r[10]).strip() if len(r) > 10 and r[10] else "EUR"
      if not divisa:
        divisa = "EUR"
      if not fecha_op:
        fecha_op = fecha_valor or ""
      if not fecha_op:
        continue
      if not concepto and importe == 0:
        continue
      resultado.append({
        "fecha_operacion": fecha_op,
        "fecha_valor": fecha_valor,
        "concepto": concepto,
        "importe": importe,
        "divisa": divisa,
        "saldo": saldo,
        "banco": "bbva",
        "codigo": codigo,
        "numero_documento": None,
        "referencia_1": None,
        "referencia_2": None,
      })
    except Exception as e:
      logger.debug("Fila BBVA no parseable: %s", e)
      continue
  return resultado


def _insertar_movimientos_lista(movs: list, empresa_id: str | None, omitir_duplicados: bool = True) -> tuple[int, int, list]:
  """
  Inserta una lista de movimientos en la BD. Devuelve (insertados, duplicados_omitidos, errores).
  """
  now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
  conn = _get_bancos_db()
  inserted = 0
  duplicados = 0
  errores = []
  try:
    for i, m in enumerate(movs):
      if not isinstance(m, dict):
        errores.append({"indice": i, "error": "Cada elemento debe ser un objeto"})
        continue
      fecha_op = (m.get("fecha_operacion") or "").strip()
      concepto = (m.get("concepto") or "").strip()
      try:
        importe = float(m.get("importe"))
      except (TypeError, ValueError):
        errores.append({"indice": i, "error": "importe inválido"})
        continue
      banco = (m.get("banco") or "santander").strip().lower()
      if not fecha_op or not banco:
        errores.append({"indice": i, "error": "fecha_operacion y banco son obligatorios"})
        continue
      if not concepto and importe == 0:
        continue
      fecha_valor = (m.get("fecha_valor") or "").strip() or None
      divisa = (m.get("divisa") or "EUR").strip() or "EUR"
      saldo = m.get("saldo")
      if saldo is not None:
        try:
          saldo = float(saldo)
        except (TypeError, ValueError):
          saldo = None
      codigo = (m.get("codigo") or "").strip() or None
      num_doc = (m.get("numero_documento") or "").strip() or None
      ref1 = (m.get("referencia_1") or "").strip() or None
      ref2 = (m.get("referencia_2") or "").strip() or None
      hash_dedup = _hash_dedup(banco, fecha_op, importe, concepto)
      if omitir_duplicados:
        existe = conn.execute(
          "SELECT 1 FROM movimientos WHERE hash_dedup = ? LIMIT 1",
          (hash_dedup,),
        ).fetchone()
        if existe:
          duplicados += 1
          continue
      conn.execute(
        """
        INSERT INTO movimientos (
          fecha_operacion, fecha_valor, concepto, importe, divisa, saldo,
          banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id, hash_dedup, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
          fecha_op, fecha_valor, concepto, importe, divisa, saldo,
          banco, codigo, num_doc, ref1, ref2, empresa_id, hash_dedup, now,
        ),
      )
      inserted += 1
    conn.commit()
  finally:
    conn.close()
  return inserted, duplicados, errores


@bancos_bp.route("/api/bancos/movimientos", methods=["GET"])
def listar_movimientos():
  """
  Lista movimientos de caja con filtros opcionales.
  Query: banco, fecha_desde, fecha_hasta, empresa_id, limit, offset.
  Incluye saldo_acumulado: suma del saldo de todos los bancos tras cada movimiento (orden cronológico).
  """
  _init_movimientos_db()
  banco = request.args.get("banco", "").strip() or None
  fecha_desde = request.args.get("fecha_desde", "").strip() or None
  fecha_hasta = request.args.get("fecha_hasta", "").strip() or None
  empresa_id = request.args.get("empresa_id", "").strip() or None
  concepto = request.args.get("concepto", "").strip() or None
  limit = request.args.get("limit", type=int) or 500
  offset = request.args.get("offset", type=int) or 0
  limit = min(max(1, limit), 5000)
  offset = max(0, offset)

  conn = _get_bancos_db()
  try:
    conditions = []
    params = []
    if banco:
      conditions.append("banco = ?")
      params.append(banco.lower())
    if fecha_desde:
      conditions.append("fecha_operacion >= ?")
      params.append(fecha_desde)
    if fecha_hasta:
      conditions.append("fecha_operacion <= ?")
      params.append(fecha_hasta)
    if empresa_id:
      conditions.append("(empresa_id IS NULL OR empresa_id = ?)")
      params.append(empresa_id)
    if concepto:
      conditions.append("(concepto IS NOT NULL AND concepto LIKE ?)")
      params.append("%" + concepto + "%")
    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    params_count = params.copy()
    params.extend([limit, offset])
    rows = conn.execute(
      f"""
      SELECT id, fecha_operacion, fecha_valor, concepto, importe, divisa, saldo,
             banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id, created_at,
             factura_proveedor_id, factura_cliente_id, factura_cliente_key, conciliado_at,
             tarjeta_id, liquidacion_periodo
      FROM movimientos
      {where}
      ORDER BY fecha_operacion DESC, id DESC
      LIMIT ? OFFSET ?
      """,
      params,
    ).fetchall()
    total = conn.execute(
      f"SELECT COUNT(*) FROM movimientos {where}",
      params_count,
    ).fetchone()[0]
    keys = [
      "id", "fecha_operacion", "fecha_valor", "concepto", "importe", "divisa", "saldo",
      "banco", "codigo", "numero_documento", "referencia_1", "referencia_2", "empresa_id", "created_at",
      "factura_proveedor_id", "factura_cliente_id", "factura_cliente_key", "conciliado_at",
      "tarjeta_id", "liquidacion_periodo",
    ]
    movimientos = [dict(zip(keys, r)) for r in rows]

    # Enriquecer con ruta de factura enlazada (para botón "Ver factura")
    factura_ids = [m["factura_proveedor_id"] for m in movimientos if m.get("factura_proveedor_id")]
    if factura_ids:
      conn_gest = sqlite3.connect(str(GESTION_DB))
      try:
        placeholders = ",".join("?" * len(factura_ids))
        cur_gest = conn_gest.execute(
          f"SELECT id, ruta_destino, ruta_archivo, numero_factura, proveedor FROM facturas_proveedor WHERE id IN ({placeholders})",
          factura_ids,
        )
        factura_map = {}
        for row in cur_gest.fetchall():
          ruta = (row[1] or row[2] or "").strip() or ""
          factura_map[row[0]] = {
            "factura_ruta": ruta,
            "factura_numero": (row[3] or "").strip(),
            "factura_proveedor_nombre": (row[4] or "").strip(),
          }
        for m in movimientos:
          fid = m.get("factura_proveedor_id")
          if fid and fid in factura_map:
            m.update(factura_map[fid])
      finally:
        conn_gest.close()

    # Enriquecer con ruta de factura cliente cuando está vinculado por factura_cliente_key
    movs_con_cliente = [m for m in movimientos if (m.get("factura_cliente_key") or "").strip()]
    if movs_con_cliente:
      for m in movs_con_cliente:
        empresa_id_m = (m.get("empresa_id") or "").strip()
        key = (m.get("factura_cliente_key") or "").strip()
        if not empresa_id_m or not key:
          continue
        facturas_cli = _leer_facturas_clientes_desde_csv(empresa_id_m)
        for fc in facturas_cli:
          n = (fc.get("numero_factura") or "").strip()
          f = (fc.get("fecha_factura") or "").strip()[:10]
          c = (fc.get("cliente") or "").strip()
          k = f"{n}|{f}|{c}"
          if k == key:
            ruta = (fc.get("ruta_archivo") or "").strip()
            if ruta:
              m["factura_ruta"] = ruta
            break

    # G.9: enriquecer con alias de tarjeta si está vinculado a liquidación
    tarjeta_ids = [m["tarjeta_id"] for m in movimientos if m.get("tarjeta_id")]
    if tarjeta_ids:
      conn_gest = sqlite3.connect(str(GESTION_DB))
      try:
        placeholders = ",".join("?" * len(tarjeta_ids))
        cur_gest = conn_gest.execute(
          f"SELECT id, alias, banco, persona FROM tarjetas WHERE id IN ({placeholders})",
          tarjeta_ids,
        )
        tarjeta_map = {}
        for row in cur_gest.fetchall():
          alias = (row[1] or "").strip() or ((row[2] or "").strip() + " " + (row[3] or "").strip()).strip() or "Tarjeta"
          tarjeta_map[row[0]] = {"tarjeta_alias": alias}
        for m in movimientos:
          tid = m.get("tarjeta_id")
          if tid and tid in tarjeta_map:
            m.update(tarjeta_map[tid])
      finally:
        conn_gest.close()

    # Calcular saldo acumulado
    cond_acum = []
    params_acum = []
    if fecha_desde:
      cond_acum.append("fecha_operacion >= ?")
      params_acum.append(fecha_desde)
    if fecha_hasta:
      cond_acum.append("fecha_operacion <= ?")
      params_acum.append(fecha_hasta)
    if empresa_id:
      cond_acum.append("(empresa_id IS NULL OR empresa_id = ?)")
      params_acum.append(empresa_id)
    where_acum = (" WHERE " + " AND ".join(cond_acum)) if cond_acum else ""
    params_acum.append(5000)
    rows_acum = conn.execute(
      f"""
      SELECT id, fecha_operacion, banco, saldo
      FROM movimientos
      {where_acum}
      ORDER BY fecha_operacion ASC, id ASC
      LIMIT ?
      """,
      params_acum,
    ).fetchall()
    last_saldo_by_bank = {}
    saldo_acumulado_by_id = {}
    for r in rows_acum:
      id_, fecha_op, banco_, saldo_ = r[0], r[1], r[2], r[3]
      if saldo_ is not None:
        try:
          last_saldo_by_bank[banco_] = float(saldo_)
        except (TypeError, ValueError):
          pass
      saldo_acumulado_by_id[id_] = sum(last_saldo_by_bank.values())
    for m in movimientos:
      m["saldo_acumulado"] = saldo_acumulado_by_id.get(m["id"])

    return jsonify({"movimientos": movimientos, "total": total})
  finally:
    conn.close()


# ─── G.3 Conciliación bancaria: sugerencias y confirmación ───────────────────

def _conciliacion_umbral_default() -> float:
  """Umbral en euros para considerar match importe movimiento vs factura (diferencias de céntimos)."""
  return 0.50


def _conciliacion_dias_ventana() -> int:
  """Ventana en días para considerar factura \"cerca\" de la fecha del movimiento (4 meses)."""
  return 4 * 30  # 4 meses


def _similitud_texto_concilacion(concepto_movimiento: str, factura: dict) -> float:
  """
  Devuelve una puntuación de similitud en [0, 1] entre el concepto del movimiento bancario
  y el texto de la factura (proveedor + resumen_concepto). Usa difflib para tolerar variaciones.
  """
  a = (concepto_movimiento or "").strip().lower()
  proveedor = (factura.get("proveedor") or "").strip()
  resumen = (factura.get("resumen_concepto") or "").strip()
  b = (proveedor + " " + resumen).strip().lower()
  if not a and not b:
    return 1.0
  if not a or not b:
    return 0.0
  a = " ".join(a.split())
  b = " ".join(b.split())
  return difflib.SequenceMatcher(None, a, b).ratio()


@bancos_bp.route("/api/bancos/conciliacion/sugerencias", methods=["GET"])
def conciliacion_sugerencias():
  """
  Devuelve sugerencias de conciliación: movimientos sin conciliar vs facturas de proveedor pendientes.

  Cálculo:
  - Se toman movimientos sin factura, sin conciliado_at y sin tarjeta (límite 1000), opcionalmente
    filtrados por fecha_desde/fecha_hasta (si no se envían, se consideran todos).
  - Se excluyen movimientos cuyo concepto contenga "Nomina"/"Nómina", "Adelanto" o "Liquidacion De Las Tarjetas De Credito".
  - Solo se consideran movimientos con importe negativo (pagos).
  - Para cada movimiento se busca una factura pendiente cuyo total coincida con |importe| ± umbral (default 0,50 €)
    y cuya fecha esté dentro de una ventana de días respecto a la fecha del movimiento (default 365 días).
  - Entre las facturas que cumplen importe y fecha, se elige la de mayor similitud de texto entre concepto
    del movimiento y concepto de factura (proveedor + resumen_concepto). Cada movimiento genera como máximo una sugerencia.
  - Las sugerencias se ordenan por similitud de texto (mayor primero).
  - Se devuelven paginadas (por defecto 10 por página). Parámetros: page (default 1), per_page (default 10, máx. 50).

  Query: empresa_id (obligatorio), fecha_desde, fecha_hasta (opcionales), umbral (opcional), page, per_page.
  """
  empresa_id = (request.args.get("empresa_id") or "").strip()
  if not empresa_id:
    return _bad_request("Falta empresa_id")
  fecha_desde = (request.args.get("fecha_desde") or "").strip() or None
  fecha_hasta = (request.args.get("fecha_hasta") or "").strip() or None
  try:
    umbral = float(request.args.get("umbral", _conciliacion_umbral_default()))
  except (TypeError, ValueError):
    umbral = _conciliacion_umbral_default()
  umbral = max(0, min(umbral, 100))
  try:
    page = max(1, int(request.args.get("page", 1)))
  except (TypeError, ValueError):
    page = 1
  try:
    per_page = min(50, max(1, int(request.args.get("per_page", 10))))
  except (TypeError, ValueError):
    per_page = 10

  _init_movimientos_db()
  facturas_db.init_facturas_db()

  conn_bancos = _get_bancos_db()
  try:
    cond_mov = ["(factura_proveedor_id IS NULL AND (conciliado_at IS NULL OR conciliado_at = ''))"]
    params_mov: list = []
    # Excluir movimientos ya vinculados a extracto de tarjeta (no son candidatos a conciliación con factura)
    cond_mov.append("(tarjeta_id IS NULL OR tarjeta_id = 0)")
    # Excluir nóminas, adelantos y liquidaciones de tarjetas (concepto contiene "Nomina"/"Nómina", "Adelanto" o "Liquidacion De Las Tarjetas De Credito")
    cond_mov.append("(LOWER(COALESCE(concepto, '')) NOT LIKE '%nomina%' AND LOWER(COALESCE(concepto, '')) NOT LIKE '%nómina%' AND LOWER(COALESCE(concepto, '')) NOT LIKE '%adelanto%' AND LOWER(COALESCE(concepto, '')) NOT LIKE '%liquidacion de las tarjetas de credito%')")
    if fecha_desde:
      cond_mov.append("fecha_operacion >= ?")
      params_mov.append(fecha_desde)
    if fecha_hasta:
      cond_mov.append("fecha_operacion <= ?")
      params_mov.append(fecha_hasta)
    cond_mov.append("(empresa_id IS NULL OR empresa_id = ?)")
    params_mov.append(empresa_id)
    where_mov = " AND ".join(cond_mov)
    movimientos = conn_bancos.execute(
      f"""
      SELECT id, fecha_operacion, concepto, importe, empresa_id
      FROM movimientos
      WHERE {where_mov}
      ORDER BY fecha_operacion DESC
      LIMIT 1000
      """,
      params_mov,
    ).fetchall()
  finally:
    conn_bancos.close()

  # Total ya conciliado por factura (varios movimientos pueden apuntar a la misma factura = pagos parciales)
  conn_bancos = _get_bancos_db()
  try:
    rows_pagado = conn_bancos.execute(
      """
      SELECT factura_proveedor_id, SUM(ABS(CAST(importe AS REAL)))
      FROM movimientos
      WHERE factura_proveedor_id IS NOT NULL
      GROUP BY factura_proveedor_id
      """
    ).fetchall()
    total_pagado_por_factura = {int(r[0]): float(r[1] or 0) for r in rows_pagado}
  finally:
    conn_bancos.close()

  facturas_pendientes = [
    f for f in facturas_db.get_facturas_empresa(empresa_id)
    if (f.get("estado_pago") or "").strip().lower() in ("pendiente", "parcial")
  ]

  def importe_factura(f: dict) -> float:
    for key in ("total_a_pagar", "total_factura", "total"):
      v = f.get(key)
      if v is None or v == "":
        continue
      try:
        s = str(v).strip().replace(",", ".")
        return float(s)
      except (ValueError, TypeError):
        continue
    return 0.0

  def parse_fecha(s: str | None):
    if not s or len(str(s).strip()) < 10:
      return None
    try:
      return datetime.strptime(str(s).strip()[:10], "%Y-%m-%d")
    except Exception as e:
      logger.debug("Fecha no parseable en conciliación '%s': %s", s, e)
      return None

  sugerencias: list[dict] = []
  dias_ventana = _conciliacion_dias_ventana()
  for m in movimientos:
    mov_id, fecha_op, concepto, importe_mov, emp_id = m[0], m[1], m[2], m[3], m[4]
    try:
      imp_mov = float(importe_mov) if importe_mov is not None else 0.0
    except (TypeError, ValueError):
      imp_mov = 0.0
    if imp_mov >= 0:
      continue
    abs_mov = abs(imp_mov)
    fecha_mov = parse_fecha(fecha_op)
    concepto_mov_str = (concepto or "").strip()
    candidatos: list[tuple[dict, float]] = []
    for f in facturas_pendientes:
      imp_fac = importe_factura(f)
      if imp_fac <= 0:
        continue
      fid = f.get("id")
      total_pagado = total_pagado_por_factura.get(fid, 0.0)
      remaining = imp_fac - total_pagado
      if remaining < 0.01:
        continue
      if abs_mov > remaining + umbral:
        continue
      fecha_fac = parse_fecha(f.get("fecha_factura"))
      if fecha_mov and fecha_fac:
        delta = (fecha_mov - fecha_fac).days
        if abs(delta) > dias_ventana:
          continue
      diferencia = abs(abs_mov - remaining) if abs_mov <= remaining else abs_mov - remaining
      es_parcial = abs_mov < remaining - 0.01 or total_pagado > 0.01
      similitud = _similitud_texto_concilacion(concepto_mov_str, f)
      sug = {
        "movimiento_id": mov_id,
        "movimiento_fecha": fecha_op,
        "movimiento_concepto": concepto_mov_str,
        "movimiento_importe": imp_mov,
        "factura_id": fid,
        "factura_numero": (f.get("numero_factura") or "").strip() or "—",
        "factura_proveedor": (f.get("proveedor") or "").strip() or "—",
        "factura_resumen_concepto": (f.get("resumen_concepto") or "").strip() or None,
        "factura_total": imp_fac,
        "factura_total_pagado": round(total_pagado, 2),
        "factura_remaining": round(remaining, 2),
        "factura_fecha": (f.get("fecha_factura") or "").strip()[:10] if f.get("fecha_factura") else None,
        "factura_ruta": (f.get("ruta_destino") or f.get("ruta_archivo") or "").strip() or None,
        "diferencia": round(diferencia, 2),
        "es_parcial": es_parcial,
        "similitud_texto": round(similitud, 2),
      }
      candidatos.append((sug, similitud))
    if candidatos:
      mejor = max(candidatos, key=lambda x: x[1])
      sugerencias.append(mejor[0])
  sugerencias.sort(key=lambda s: s["similitud_texto"], reverse=True)
  total_sugerencias = len(sugerencias)
  total_paginas = (total_sugerencias + per_page - 1) // per_page if total_sugerencias else 0
  inicio = (page - 1) * per_page
  sugerencias_pagina = sugerencias[inicio:inicio + per_page]
  return jsonify({
    "sugerencias": sugerencias_pagina,
    "total_sugerencias": total_sugerencias,
    "pagina_actual": page,
    "total_paginas": total_paginas,
    "per_page": per_page,
    "movimientos_sin_conciliar": len(movimientos),
    "facturas_pendientes": len(facturas_pendientes),
  })


@bancos_bp.route("/api/bancos/conciliacion/confirmar", methods=["POST"])
def conciliacion_confirmar():
  """
  Vincula un movimiento a una factura de proveedor. Si la suma de movimientos ya vinculados
  a esa factura (incluido este) alcanza o supera el total, marca la factura como pagada; si no, como parcial.
  Body: { "movimiento_id": int, "factura_proveedor_id": int }.
  Validamos factura y empresa ANTES de actualizar el movimiento para no dejar la factura sin actualizar estado_pago.
  """
  data = request.get_json(silent=True) or {}
  mov_id = data.get("movimiento_id")
  factura_id = data.get("factura_proveedor_id")
  if mov_id is None or factura_id is None:
    return _bad_request("Falta movimiento_id o factura_proveedor_id")
  try:
    mov_id = int(mov_id)
    factura_id = int(factura_id)
  except (TypeError, ValueError):
    return _bad_request("movimiento_id y factura_proveedor_id deben ser números")

  _init_movimientos_db()
  facturas_db.init_facturas_db()

  conn_bancos = _get_bancos_db()
  try:
    row = conn_bancos.execute(
      "SELECT id, empresa_id FROM movimientos WHERE id = ?",
      (mov_id,),
    ).fetchone()
  finally:
    conn_bancos.close()
  if not row:
    return jsonify({"error": "Movimiento no encontrado"}), 404
  mov_empresa = (row[1] or "").strip()

  conn_gest = sqlite3.connect(str(GESTION_DB))
  try:
    cur = conn_gest.execute(
      "SELECT id, empresa_id, total_a_pagar, total_factura, total FROM facturas_proveedor WHERE id = ?",
      (factura_id,),
    ).fetchone()
  finally:
    conn_gest.close()
  if not cur:
    return jsonify({"error": "Factura no encontrada"}), 404
  factura_empresa = (cur[1] or "").strip()
  if mov_empresa and mov_empresa != factura_empresa:
    return jsonify({"error": "El movimiento no pertenece a la empresa de la factura"}), 400
  empresa_id = factura_empresa or mov_empresa
  if not empresa_id:
    return jsonify({"error": "Factura sin empresa asignada"}), 400

  total_fac = 0.0
  for v in (cur[2], cur[3], cur[4]):
    if v is not None and str(v).strip():
      try:
        total_fac = float(str(v).strip().replace(",", "."))
        break
      except (ValueError, TypeError):
        pass

  now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
  conn_bancos = _get_bancos_db()
  try:
    if mov_empresa:
      conn_bancos.execute(
        "UPDATE movimientos SET factura_proveedor_id = ?, conciliado_at = ? WHERE id = ?",
        (factura_id, now, mov_id),
      )
    else:
      conn_bancos.execute(
        "UPDATE movimientos SET factura_proveedor_id = ?, conciliado_at = ?, empresa_id = ? WHERE id = ?",
        (factura_id, now, empresa_id, mov_id),
      )
    conn_bancos.commit()
    row_sum = conn_bancos.execute(
      "SELECT COALESCE(SUM(ABS(CAST(importe AS REAL))), 0) FROM movimientos WHERE factura_proveedor_id = ?",
      (factura_id,),
    ).fetchone()
    total_pagado = float(row_sum[0] or 0)
  finally:
    conn_bancos.close()

  estado = "pagada" if total_pagado >= total_fac - 0.02 else "parcial"
  conn_gest = sqlite3.connect(str(GESTION_DB))
  try:
    conn_gest.execute(
      "UPDATE facturas_proveedor SET estado_pago = ? WHERE id = ?",
      (estado, factura_id),
    )
    conn_gest.commit()
  finally:
    conn_gest.close()

  _invalidar_cache_listado_proveedores(empresa_id)
  msg = "Conciliación registrada. Factura marcada como pagada." if estado == "pagada" else "Pago parcial registrado. Factura en estado parcial."
  return jsonify({"ok": True, "mensaje": msg})


def _factura_cliente_key(numero_factura: str, fecha_factura: str, cliente: str) -> str:
  """Clave única para identificar una factura de cliente en el CSV."""
  n = (numero_factura or "").strip()
  f = (fecha_factura or "").strip()[:10]
  c = (cliente or "").strip()
  return f"{n}|{f}|{c}"


@bancos_bp.route("/api/bancos/conciliacion/confirmar-cliente", methods=["POST"])
def conciliacion_confirmar_cliente():
  """
  Vincula un movimiento (entrada de caja) a una factura emitida a cliente.
  Body: { "movimiento_id": int, "empresa_id": str, "numero_factura": str, "fecha_factura": str, "cliente": str }.
  """
  data = request.get_json(silent=True) or {}
  mov_id = data.get("movimiento_id")
  empresa_id = (data.get("empresa_id") or "").strip()
  numero_factura = (data.get("numero_factura") or "").strip()
  fecha_factura = (data.get("fecha_factura") or "").strip()
  cliente = (data.get("cliente") or "").strip()
  if mov_id is None or not empresa_id:
    return _bad_request("Falta movimiento_id o empresa_id")
  try:
    mov_id = int(mov_id)
  except (TypeError, ValueError):
    return _bad_request("movimiento_id debe ser un número")

  _init_movimientos_db()
  conn_bancos = _get_bancos_db()
  try:
    row = conn_bancos.execute(
      "SELECT id, empresa_id FROM movimientos WHERE id = ?",
      (mov_id,),
    ).fetchone()
    if not row:
      return jsonify({"error": "Movimiento no encontrado"}), 404
    mov_empresa = (row[1] or "").strip()
    if mov_empresa and mov_empresa != empresa_id:
      return jsonify({"error": "El movimiento no pertenece a esa empresa"}), 400
    if not mov_empresa:
      empresa_id_mov = empresa_id
    else:
      empresa_id_mov = mov_empresa
  finally:
    conn_bancos.close()

  facturas_cli = _leer_facturas_clientes_desde_csv(empresa_id)
  key = _factura_cliente_key(numero_factura, fecha_factura, cliente)
  encontrada = any(
    _factura_cliente_key(f.get("numero_factura"), f.get("fecha_factura"), f.get("cliente")) == key
    for f in facturas_cli
  )
  if not encontrada:
    return jsonify({"error": "Factura de cliente no encontrada en la base de la empresa"}), 404

  conn_bancos = _get_bancos_db()
  try:
    if mov_empresa:
      conn_bancos.execute(
        "UPDATE movimientos SET factura_cliente_key = ?, conciliado_at = ? WHERE id = ?",
        (key, datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), mov_id),
      )
    else:
      conn_bancos.execute(
        "UPDATE movimientos SET factura_cliente_key = ?, conciliado_at = ?, empresa_id = ? WHERE id = ?",
        (key, datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), empresa_id_mov, mov_id),
      )
    conn_bancos.commit()
  finally:
    conn_bancos.close()

  return jsonify({"ok": True, "mensaje": "Entrada de caja vinculada a la factura de cliente."})


@bancos_bp.route("/api/bancos/conciliacion/desvincular", methods=["POST"])
def conciliacion_desvincular():
  """
  Quita la vinculación movimiento–factura. Si la factura queda sin ningún movimiento vinculado,
  pasa a pendiente; si sigue teniendo otros pagos, se recalcula estado pagada/parcial.
  Body: { "movimiento_id": int }.
  """
  data = request.get_json(silent=True) or {}
  mov_id = data.get("movimiento_id")
  if mov_id is None:
    return _bad_request("Falta movimiento_id")
  try:
    mov_id = int(mov_id)
  except (TypeError, ValueError):
    return _bad_request("movimiento_id debe ser un número")

  _init_movimientos_db()
  conn_bancos = _get_bancos_db()
  try:
    row = conn_bancos.execute(
      "SELECT id, factura_proveedor_id, factura_cliente_key, empresa_id FROM movimientos WHERE id = ?",
      (mov_id,),
    ).fetchone()
    if not row:
      return jsonify({"error": "Movimiento no encontrado"}), 404
    factura_id = row[1]
    factura_cliente_key = (row[2] or "").strip()
    empresa_id = (row[3] or "").strip()
    if not factura_id and not factura_cliente_key:
      return jsonify({"error": "El movimiento no está conciliado con ninguna factura"}), 400
    if factura_cliente_key:
      conn_bancos.execute(
        "UPDATE movimientos SET factura_cliente_key = NULL, conciliado_at = NULL WHERE id = ?",
        (mov_id,),
      )
      conn_bancos.commit()
      return jsonify({"ok": True, "mensaje": "Vinculación con factura de cliente eliminada."})
    conn_bancos.execute(
      "UPDATE movimientos SET factura_proveedor_id = NULL, conciliado_at = NULL WHERE id = ?",
      (mov_id,),
    )
    conn_bancos.commit()
  finally:
    conn_bancos.close()

  facturas_db.init_facturas_db()
  conn_bancos = _get_bancos_db()
  try:
    row_sum = conn_bancos.execute(
      "SELECT COALESCE(SUM(ABS(CAST(importe AS REAL))), 0) FROM movimientos WHERE factura_proveedor_id = ?",
      (factura_id,),
    ).fetchone()
    total_pagado = float(row_sum[0] or 0) if row_sum else 0.0
  finally:
    conn_bancos.close()

  if total_pagado < 0.01:
    estado = "pendiente"
  else:
    conn_gest = sqlite3.connect(str(GESTION_DB))
    try:
      cur = conn_gest.execute(
        "SELECT total_a_pagar, total_factura, total FROM facturas_proveedor WHERE id = ?",
        (factura_id,),
      ).fetchone()
      total_fac = 0.0
      if cur:
        for v in (cur[0], cur[1], cur[2]):
          if v is not None and str(v).strip():
            try:
              total_fac = float(str(v).strip().replace(",", "."))
              break
            except (ValueError, TypeError):
              pass
      estado = "pagada" if total_pagado >= total_fac - 0.02 else "parcial"
    finally:
      conn_gest.close()

  facturas_db.init_facturas_db()
  conn_gest = sqlite3.connect(str(GESTION_DB))
  try:
    conn_gest.execute(
      "UPDATE facturas_proveedor SET estado_pago = ? WHERE id = ?",
      (estado, factura_id),
    )
    conn_gest.commit()
  finally:
    conn_gest.close()

  _invalidar_cache_listado_proveedores(empresa_id)
  return jsonify({"ok": True, "mensaje": "Conciliación deshecha. Factura vuelve a " + estado + "."})


@bancos_bp.route("/api/bancos/conciliacion/factura-proveedor/<int:factura_id>", methods=["GET"])
def conciliacion_resumen_factura_proveedor(factura_id: int):
  """
  Devuelve el resumen de conciliación bancaria de una factura de proveedor:
  total_factura (importe a pagar), total_pagado (suma de movimientos vinculados), pendiente, y lista de movimientos.
  Si la base de movimientos no está disponible, devuelve total_pagado=0 y movimientos=[].
  """
  total_factura = 0.0
  total_pagado = 0.0
  movimientos = []

  try:
    facturas_db.init_facturas_db()
  except Exception as e:
    logger.warning("No se pudo inicializar BD facturas: %s", e)
    return jsonify({"error": "Base de datos de facturas no disponible", "total_factura": 0, "total_pagado": 0, "pendiente": 0, "movimientos": []}), 200

  try:
    conn_gest = sqlite3.connect(str(GESTION_DB))
  except Exception as e:
    return jsonify({"error": "No se pudo conectar a la base de datos", "total_factura": 0, "total_pagado": 0, "pendiente": 0, "movimientos": []}), 200

  try:
    cur = conn_gest.execute(
      "SELECT total_a_pagar, total_factura, total FROM facturas_proveedor WHERE id = ?",
      (factura_id,),
    ).fetchone()
    if not cur:
      conn_gest.close()
      return jsonify({"error": "Factura no encontrada", "total_factura": 0, "total_pagado": 0, "pendiente": 0, "movimientos": []}), 200
    for v in (cur[0], cur[1], cur[2]):
      if v is not None and str(v).strip():
        try:
          total_factura = float(str(v).strip().replace(",", "."))
          break
        except (ValueError, TypeError):
          pass
  finally:
    conn_gest.close()

  try:
    _init_movimientos_db()
    conn_bancos = _get_bancos_db()
  except Exception as e:
    logger.warning("No se pudo conectar a BD movimientos: %s", e)
    pendiente = max(0.0, total_factura - total_pagado)
    return jsonify({
      "total_factura": round(total_factura, 2),
      "total_pagado": round(total_pagado, 2),
      "pendiente": round(pendiente, 2),
      "movimientos": [],
      "error": "Base de movimientos no disponible",
    })

  try:
    rows = conn_bancos.execute(
      """SELECT id, fecha_operacion, concepto, importe
         FROM movimientos WHERE factura_proveedor_id = ?
         ORDER BY fecha_operacion, id""",
      (factura_id,),
    ).fetchall()
    movimientos = [
      {
        "id": r[0],
        "fecha_operacion": (r[1] or "").strip(),
        "concepto": (r[2] or "").strip(),
        "importe": r[3],
      }
      for r in rows
    ]
    row_sum = conn_bancos.execute(
      "SELECT COALESCE(SUM(ABS(CAST(importe AS REAL))), 0) FROM movimientos WHERE factura_proveedor_id = ?",
      (factura_id,),
    ).fetchone()
    total_pagado = float(row_sum[0] or 0) if row_sum else 0.0
  finally:
    conn_bancos.close()

  pendiente = max(0.0, total_factura - total_pagado)
  return jsonify({
    "total_factura": round(total_factura, 2),
    "total_pagado": round(total_pagado, 2),
    "pendiente": round(pendiente, 2),
    "movimientos": movimientos,
  })


@bancos_bp.route("/api/bancos/movimientos_export", methods=["GET"])
def exportar_movimientos_bancos():
  """
  Exporta los movimientos de bancos a CSV (con extensión .xlsx) aplicando los mismos filtros
  que el listado: banco, fecha_desde, fecha_hasta, empresa_id.
  """
  _init_movimientos_db()
  banco = (request.args.get("banco") or "").strip() or None
  fecha_desde = (request.args.get("fecha_desde") or "").strip() or None
  fecha_hasta = (request.args.get("fecha_hasta") or "").strip() or None
  empresa_id = (request.args.get("empresa_id") or "").strip() or None
  concepto = (request.args.get("concepto") or "").strip() or None

  conn = _get_bancos_db()
  try:
    conditions = []
    params = []
    if banco:
      conditions.append("banco = ?")
      params.append(banco.lower())
    if fecha_desde:
      conditions.append("fecha_operacion >= ?")
      params.append(fecha_desde)
    if fecha_hasta:
      conditions.append("fecha_operacion <= ?")
      params.append(fecha_hasta)
    if empresa_id:
      conditions.append("(empresa_id IS NULL OR empresa_id = ?)")
      params.append(empresa_id)
    if concepto:
      conditions.append("(concepto IS NOT NULL AND concepto LIKE ?)")
      params.append("%" + concepto + "%")
    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
      f"""
      SELECT fecha_operacion, fecha_valor, concepto, importe, divisa, saldo,
             banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id, created_at
      FROM movimientos
      {where}
      ORDER BY fecha_operacion DESC, id DESC
      """,
      params,
    ).fetchall()
    if not rows:
      return jsonify({"error": "No hay movimientos que cumplan el filtro para exportar"}), 404

    campos = [
      "fecha_operacion",
      "fecha_valor",
      "concepto",
      "importe",
      "divisa",
      "saldo",
      "banco",
      "codigo",
      "numero_documento",
      "referencia_1",
      "referencia_2",
      "empresa_id",
      "created_at",
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(campos)
    for r in rows:
      writer.writerow(list(r))
    output.seek(0)

    fecha_tag = datetime.utcnow().strftime("%Y%m%d")
    nombre = f"movimientos_bancos_{fecha_tag}.xlsx"
    return Response(
      output.getvalue().encode("utf-8-sig"),
      mimetype="text/csv; charset=utf-8",
      headers={
        "Content-Disposition": f'attachment; filename="{nombre}"',
      },
    )
  finally:
    conn.close()

@bancos_bp.route("/api/bancos/movimientos", methods=["DELETE"])
def borrar_movimientos_por_ids():
  """
  Elimina movimientos por lista de IDs. Body: { "ids": [1, 2, 3] }.
  Devuelve { "eliminados": n }.
  """
  _init_movimientos_db()
  data = request.get_json() or {}
  ids_raw = data.get("ids")
  if not isinstance(ids_raw, list):
    return _bad_request("Se espera un array 'ids' en el body")
  ids = []
  for x in ids_raw:
    try:
      ids.append(int(x))
    except (ValueError, TypeError):
      pass
  if not ids:
    return jsonify({"eliminados": 0, "mensaje": "No se indicaron IDs válidos."})
  conn = _get_bancos_db()
  try:
    placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
      f"DELETE FROM movimientos WHERE id IN ({placeholders})",
      ids,
    )
    conn.commit()
    n = cur.rowcount
    return jsonify({"eliminados": n, "mensaje": f"Eliminados {n} movimiento(s)."})
  finally:
    conn.close()

@bancos_bp.route("/api/bancos/movimientos/solo-fecha", methods=["DELETE"])
def eliminar_movimientos_solo_fecha():
  """
  Elimina de la base de datos los movimientos que solo tienen fecha
  (concepto vacío o nulo e importe 0). Irreversible.
  """
  _init_movimientos_db()
  conn = _get_bancos_db()
  try:
    cur = conn.execute(
      """
      SELECT COUNT(*) FROM movimientos
      WHERE TRIM(COALESCE(concepto, '')) = '' AND COALESCE(importe, 0) = 0
      """
    )
    n = cur.fetchone()[0]
    if n == 0:
      return jsonify({"eliminados": 0, "mensaje": "No hay movimientos que solo tengan fecha."})
    conn.execute(
      """
      DELETE FROM movimientos
      WHERE TRIM(COALESCE(concepto, '')) = '' AND COALESCE(importe, 0) = 0
      """
    )
    conn.commit()
    return jsonify({"eliminados": n, "mensaje": f"Eliminados {n} movimiento(s) que solo tenían fecha."})
  finally:
    conn.close()


@bancos_bp.route("/api/bancos/movimientos", methods=["POST"])
def crear_movimientos():
  """
  Crea uno o más movimientos. Body: { movimientos: [ {...} ], empresa_id?, omitir_duplicados?: true }.
  Cada movimiento: fecha_operacion, concepto, importe, banco; opcionales: fecha_valor, divisa, saldo, codigo, numero_documento, referencia_1, referencia_2.
  Si omitir_duplicados es true, no se insertan los que tengan el mismo hash_dedup (por defecto true).
  """
  _init_movimientos_db()
  data = request.get_json() or {}
  movs = data.get("movimientos")
  if not isinstance(movs, list):
    return _bad_request("Se espera un array 'movimientos'")
  empresa_id = (data.get("empresa_id") or "").strip() or None
  omitir_duplicados = data.get("omitir_duplicados", True)
  insertados, duplicados, errores = _insertar_movimientos_lista(movs, empresa_id, omitir_duplicados)
  return jsonify({
    "insertados": insertados,
    "duplicados_omitidos": duplicados,
    "errores": errores,
  })


@bancos_bp.route("/api/bancos/importar/santander", methods=["POST"])
def importar_santander():
  """
  Recibe un Excel de extracto Santander (multipart: archivo o file).
  Opcional: empresa_id en form. Omite duplicados por defecto.
  """
  _init_movimientos_db()
  archivo = request.files.get("archivo") or request.files.get("file")
  if not archivo or not archivo.filename:
    return _bad_request("Falta el archivo Excel (campo 'archivo' o 'file')")
  if not archivo.filename.lower().endswith((".xlsx", ".xls")):
    return _bad_request("El archivo debe ser Excel (.xlsx o .xls)")
  empresa_id = (request.form.get("empresa_id") or request.args.get("empresa_id") or "").strip() or None
  omitir_duplicados = request.form.get("omitir_duplicados", "true").lower() in ("1", "true", "sí", "si")
  try:
    movs = _parse_santander_excel(archivo.stream)
  except ValueError as e:
    return _bad_request(str(e))
  except RuntimeError as e:
    return jsonify({"error": str(e)}), 500
  if not movs:
    return jsonify({"insertados": 0, "duplicados_omitidos": 0, "errores": [], "mensaje": "No se encontraron movimientos en el Excel"})
  insertados, duplicados, errores = _insertar_movimientos_lista(movs, empresa_id, omitir_duplicados)
  return jsonify({
    "insertados": insertados,
    "duplicados_omitidos": duplicados,
    "errores": errores,
    "leidos": len(movs),
  })


@bancos_bp.route("/api/bancos/importar/bbva", methods=["POST"])
def importar_bbva():
  """
  Recibe un Excel de extracto BBVA (multipart: archivo o file).
  Opcional: empresa_id en form. Omite duplicados por defecto.
  """
  _init_movimientos_db()
  archivo = request.files.get("archivo") or request.files.get("file")
  if not archivo or not archivo.filename:
    return _bad_request("Falta el archivo Excel (campo 'archivo' o 'file')")
  if not archivo.filename.lower().endswith((".xlsx", ".xls")):
    return _bad_request("El archivo debe ser Excel (.xlsx o .xls)")
  empresa_id = (request.form.get("empresa_id") or request.args.get("empresa_id") or "").strip() or None
  omitir_duplicados = request.form.get("omitir_duplicados", "true").lower() in ("1", "true", "sí", "si")
  try:
    movs = _parse_bbva_excel(archivo.stream)
  except ValueError as e:
    return _bad_request(str(e))
  except RuntimeError as e:
    return jsonify({"error": str(e)}), 500
  if not movs:
    return jsonify({"insertados": 0, "duplicados_omitidos": 0, "errores": [], "mensaje": "No se encontraron movimientos en el Excel"})
  insertados, duplicados, errores = _insertar_movimientos_lista(movs, empresa_id, omitir_duplicados)
  return jsonify({
    "insertados": insertados,
    "duplicados_omitidos": duplicados,
    "errores": errores,
    "leidos": len(movs),
  })


# ─── Proyectos > Transporte: ruta y proveedores en la ruta ─────────────────
@transporte_bp.route("/api/proyectos/transporte/buscar", methods=["POST"])
def transporte_buscar():
  """
  Recibe origen y destino (texto). Calcula la ruta con OpenRouteService y devuelve
  proveedores de transporte de maquinaria situados a menos de 50 km de la ruta.
  Requiere OPENROUTESERVICE_API_KEY en .env (clave gratuita en openrouteservice.org).
  """
  data = request.get_json(silent=True) or {}
  origen = (data.get("origen") or "").strip()
  destino = (data.get("destino") or "").strip()
  paradas = data.get("paradas")
  if paradas is not None and not isinstance(paradas, list):
    paradas = []
  paradas = [str(p).strip() for p in (paradas or []) if str(p).strip()]
  if not origen or not destino:
    return jsonify({"error": "Faltan origen o destino"}), 400
  api_key = (OPENROUTESERVICE_API_KEY or "").strip()
  if not api_key:
    return jsonify({"error": "No está configurada la API key de OpenRouteService. Añade OPENROUTESERVICE_API_KEY en .env"}), 503
  try:
    resultado = _buscar_ruta_y_proveedores(origen, destino, BASE_DIR, api_key, radio_km=50.0, paradas=paradas)
  except Exception as e:
    return jsonify({"error": "Error al calcular ruta o proveedores: " + str(e)}), 500
  return jsonify(resultado)


# Registrar blueprints
app.register_blueprint(facturas_proveedores_bp)
app.register_blueprint(proveedores_bp)
app.register_blueprint(facturas_clientes_bp)
app.register_blueprint(archivo_bp)
app.register_blueprint(control_calidad_bp)
app.register_blueprint(bancos_bp)
app.register_blueprint(transporte_bp)


if __name__ == "__main__":
  # Configurar logging: consola + archivo persistente
  _log_dir = DATOS_DIR / "logs"
  _log_dir.mkdir(parents=True, exist_ok=True)
  logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
      logging.StreamHandler(),
      logging.FileHandler(_log_dir / "app.log", encoding="utf-8"),
    ],
  )
  ensure_dirs()
  app.run(debug=True, port=8000)

