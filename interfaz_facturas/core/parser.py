"""Parsing de texto de facturas: fechas, NIF/CIF, importes, proveedor, concepto."""
from __future__ import annotations

import re


def normalizar_texto(texto: str) -> str:
  """Colapsa espacios y unifica saltos de línea para búsquedas más robustas."""
  if not texto:
    return ""
  texto = re.sub(r"[ \t]+", " ", texto)
  texto = re.sub(r"\n\s*\n", "\n", texto)
  return texto.strip()


def normalizar_importe_str(valor: str) -> float | None:
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


def extraer_ultimo_importe_linea(linea: str) -> str:
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


def normalizar_fecha_a_iso(fecha_str: str) -> str:
  """Convierte fecha en formato dd/mm/yyyy o dd-mm-yyyy a YYYY-MM-DD para el archivador."""
  fecha_str = fecha_str.strip()
  if not fecha_str:
    return ""
  if re.match(r"\d{4}-\d{2}-\d{2}", fecha_str):
    return fecha_str[:10]
  m = re.match(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})", fecha_str)
  if m:
    d, mes, a = m.group(1), m.group(2), m.group(3)
    return f"{a}-{mes.zfill(2)}-{d.zfill(2)}"
  return fecha_str


def buscar_primera_fecha(texto: str) -> str:
  """
  Busca una fecha en la factura. Prioriza líneas que contengan "fecha" o "date".
  """
  texto_norm = normalizar_texto(texto)
  lineas = texto_norm.splitlines()
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
        return normalizar_fecha_a_iso(f"{g[0]}/{g[1]}/{g[2]}")
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
      return normalizar_fecha_a_iso(f"{g[0]}/{g[1]}/{g[2]}")
  return ""


def buscar_nif_cif(texto: str) -> str:
  """
  Busca NIF/CIF: primero tras etiqueta "CIF"/"NIF", luego por patrón en el texto.
  Evita confundir con números de factura o teléfono.
  """
  lineas = texto.splitlines()
  for linea in lineas:
    l = linea.lower()
    if "cif" in l or "nif" in l or "cif/nif" in l or "nif/cif" in l:
      after = re.sub(r"^.*?(?:cif|nif)[\s\/:\-]*", "", linea, flags=re.IGNORECASE).strip()
      candidato = re.sub(r"^[A-Za-z]\s*", "", after)
      m = re.search(r"[A-Z]\d{7}[0-9A-J]", candidato, re.IGNORECASE)
      if m:
        return m.group(0)
      m = re.search(r"\d{8}[A-Z]", candidato, re.IGNORECASE)
      if m:
        return m.group(0)
      if re.match(r"^[A-Z0-9]{8,12}$", candidato.replace(" ", "")):
        return candidato.replace(" ", "")[:12]
  patron_cif = r"\b[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]\b"
  m = re.search(patron_cif, texto, re.IGNORECASE)
  if m:
    return m.group(0)
  patron_dni = r"\b\d{8}[A-Z]\b"
  m = re.search(patron_dni, texto, re.IGNORECASE)
  if m:
    return m.group(0)
  return ""


def buscar_numero_factura(texto: str) -> str:
  """
  Busca el número/código de factura. Prueba varias formas: "Factura nº X", "Factura: X", número en línea siguiente.
  """
  lineas = [l.strip() for l in texto.splitlines() if l.strip()]
  for i, linea in enumerate(lineas):
    l = linea.lower()
    if "factura" not in l:
      continue
    after_colon = re.split(r"[\:\-]", linea, maxsplit=1)
    after = after_colon[-1].strip() if len(after_colon) > 1 else ""
    if after:
      numero = re.sub(r"(?i)factura|nº|no\.?|num\.?|number|n\.?", "", after).strip()
      numero = re.sub(r"^[^\w\d]+", "", numero)
      if re.search(r"\d", numero):
        return numero[:60].strip()
    if i + 1 < len(lineas) and re.search(r"\d", lineas[i + 1]):
      return lineas[i + 1].strip()[:60]
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


def buscar_proveedor_y_localizacion(texto: str, numero_factura: str = "") -> tuple[str, str, str]:
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


def buscar_concepto(texto: str, proveedor: str) -> str:
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


def buscar_importes(texto: str) -> dict:
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
    imp = extraer_ultimo_importe_linea(linea)
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
      imp = extraer_ultimo_importe_linea(linea)
      if not imp or normalizar_importe_str(imp) is None:
        continue
      v = normalizar_importe_str(imp)
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
    vals = [normalizar_importe_str(x) for x in lista]
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
