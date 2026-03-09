"""Funciones de llamada a OpenAI (LLM texto y visión) para extracción y sugerencias."""
from __future__ import annotations

import base64
import csv
import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

try:
  from config import EMPRESAS_CLIENTE, NOMBRES_EMPRESAS_CLIENTE, DATOS_DIR, client
except ImportError:
  from interfaz_facturas.config import EMPRESAS_CLIENTE, NOMBRES_EMPRESAS_CLIENTE, DATOS_DIR, client


def limpiar_json_respuesta(texto: str) -> str:
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


CLAVES_FACTURA_CLIENTE = [
  "fecha_factura", "cliente", "cif_nif", "pais", "localidad",
  "proyecto", "tipologia", "num_hincadoras", "num_ayudantes",
  "pricing_servicio", "pricing_transporte", "iva", "total_a_pagar",
  "numero_factura",
]


def extraer_campos_llm(texto: str, empresa_id: str, tipo: str = "proveedor") -> dict:
  """
  Usa OpenAI (gpt-4.1-mini) para extraer los campos de la factura a partir del texto OCR/Plano.
  ``tipo`` controla qué prompt y qué claves se esperan ("proveedor" o "cliente").
  """
  if client is None:
    return {}
  if tipo == "cliente":
    system_prompt = _prompt_extraccion_factura_cliente(empresa_id)
    claves_defecto = CLAVES_FACTURA_CLIENTE
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
    contenido = limpiar_json_respuesta(resp.choices[0].message.content or "")
    datos = json.loads(contenido)
    if not isinstance(datos, dict):
      return {}
    for clave in claves_defecto:
      datos.setdefault(clave, "" if clave not in ["bases", "retenciones"] else [])
    return datos
  except Exception as e:
    logger.warning("Error extrayendo campos LLM (tipo=%s): %s", tipo, e)
    return {}


def extraer_campos_vision(ruta: Path, empresa_id: str, tipo: str = "proveedor") -> dict:
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
    claves_defecto = CLAVES_FACTURA_CLIENTE
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
    contenido = limpiar_json_respuesta(resp.choices[0].message.content or "")
    datos = json.loads(contenido)
    if not isinstance(datos, dict):
      return {}
    for clave in claves_defecto:
      datos.setdefault(clave, "" if clave not in ["bases", "retenciones"] else [])
    return datos
  except Exception as e:
    logger.warning("Error extrayendo campos visión %s (tipo=%s): %s", ruta.name, tipo, e)
    return {}


def registrar_vision_control(empresa_id: str, nombre_archivo: str, ruta_archivo: str) -> None:
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


def sugerencias_llm(fila: dict, errores: list[str], tipo: str) -> list[dict]:
  """
  Pide al LLM que visualice la factura y los errores y sugiera correcciones.
  Envía la fila (factura) y la lista de errores; devuelve list[dict] con
  { "campo", "valor_actual", "valor_sugerido", "motivo" }.
  Si no hay cliente OpenAI o falla la llamada, devuelve lista vacía.
  """
  if client is None or not fila or not errores:
    return []
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
    contenido = limpiar_json_respuesta(contenido)
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
