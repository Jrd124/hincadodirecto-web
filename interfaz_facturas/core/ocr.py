"""Extracción de texto desde PDFs e imágenes (OCR con Tesseract + PyMuPDF)."""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

# Configurar ruta de Tesseract: variable de entorno > ruta Windows > ruta Linux > PATH
_TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
if _TESSERACT_CMD and Path(_TESSERACT_CMD).exists():
  pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD
elif Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe").exists():
  pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
elif Path("/usr/bin/tesseract").exists():
  pytesseract.pytesseract.tesseract_cmd = "/usr/bin/tesseract"


def ocr_pagina_fitz(page: "fitz.Page") -> str:
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


def leer_texto_factura(ruta: Path) -> str:
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
          texto_ocr = ocr_pagina_fitz(page)
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
          try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
          except Exception as e:
            logger.debug("No se pudo corregir orientación EXIF: %s", e)

          if img.mode not in ("L", "RGB", "RGBA"):
            img = img.convert("RGB")

          min_lado = min(img.size)
          if min_lado < 1000:
            factor = 1000 / float(min_lado)
            nuevo_tamaño = (int(img.width * factor), int(img.height * factor))
            img = img.resize(nuevo_tamaño, Image.LANCZOS)

          img_gray = img.convert("L")
          try:
            from PIL import ImageOps
            img_gray = ImageOps.autocontrast(img_gray)
          except Exception as e:
            logger.debug("No se pudo aplicar autocontraste: %s", e)

          texto = pytesseract.image_to_string(
            img_gray,
            lang="spa+eng",
            config="--oem 3 --psm 6",
          )
          if texto.strip():
            return texto

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
