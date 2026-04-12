"""
Procesador OCR de nóminas PDF usando GPT-4 Vision.
Extrae campos estructurados de PDFs de nómina de la gestoría.
Soporta nóminas simples y liquidaciones/finiquitos (multi-página).
"""
from __future__ import annotations

import base64
import json
import logging
import tempfile
from pathlib import Path

import fitz  # PyMuPDF

from core.llm import limpiar_json_respuesta

logger = logging.getLogger("erp")

# ── Prompt para GPT-4 Vision ────────────────────────────────────────────

_SYSTEM_PROMPT = """Eres un experto en nóminas españolas. Se te enviarán imágenes de páginas de un PDF de nómina.

TAREA: Extraer TODOS los campos numéricos y de texto de cada nómina que encuentres.

REGLAS:
- Si la página es una carta de comunicación de extinción o un documento sin datos de nómina, devuelve: {"tipo": "no_nomina"}
- Si la página contiene una nómina (mensual o finiquito), extrae TODOS los campos
- Los importes son SIEMPRE numéricos (float), nunca strings. Usar 0 si no aparece
- DNI sin guiones ni espacios, en mayúsculas
- Periodo: extraer año y mes del campo "MENS DD MMM AA a DD MMM AA" → formato "YYYY-MM"
  Ejemplos: "MENS 01 FEB 26" → "2026-02", "MENS 01 ENE 25" → "2025-01"
  Si el año es de 2 dígitos, asumir 20XX
- Tipo: "MENS" o vacío = "NOMINA", "FINIQUITO" o "LIQUIDACION" = "FINIQUITO"
- Si hay campo "COSTE EMPRESA:" extraerlo. Si NO aparece, poner null (se calculará después)
- Categoría: copiar tal cual aparece (ej. "OFICIAL DE 1ª", "PEONES ORD", "JEFES DE 1")

Devuelve ÚNICAMENTE un JSON (o array de JSON si hay varias nóminas en las páginas) con esta estructura:

{
  "nombre": "APELLIDO1 APELLIDO2, NOMBRE",
  "dni": "12345678A",
  "categoria": "OFICIAL DE 1ª",
  "antiguedad": "7 FEB 22",
  "periodo_texto": "MENS 01 FEB 26 a 28 FEB 26",
  "periodo": "2026-02",
  "tipo": "NOMINA",
  "dias": 30,
  "salario_base": 1099.80,
  "antiguedad_euros": 0,
  "plus_asistencia": 287.60,
  "extra_mes": 274.95,
  "mejora_voluntaria": 0,
  "a_cuenta_convenio": 378.46,
  "dietas": 241.00,
  "indemnizacion": 0,
  "vacaciones_proporcionales": 0,
  "cot_cc": 95.92,
  "cot_mei": 3.06,
  "cot_fp": 2.04,
  "cot_desempleo": 31.63,
  "irpf_porcentaje": 20.00,
  "irpf_euros": 408.16,
  "embargo": 0,
  "rem_total": 2040.81,
  "base_ss": 2040.81,
  "total_devengado": 2281.81,
  "total_deducir": 540.81,
  "liquido": 1741.00,
  "coste_empresa": 3044.07,
  "aportacion_cc": 481.63,
  "aportacion_mei": 15.31,
  "aportacion_at": 136.73,
  "aportacion_desempleo": 112.24,
  "aportacion_fp": 12.24,
  "aportacion_fogasa": 4.08
}

No devuelvas nada más que el JSON."""


# ── PDF → imágenes base64 ───────────────────────────────────────────────

def _pdf_pages_to_base64(pdf_path: str | Path) -> list[str]:
    """Convierte cada página del PDF a imagen PNG en base64."""
    doc = fitz.open(str(pdf_path))
    images = []
    for page in doc:
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for readability
        pix = page.get_pixmap(matrix=mat, alpha=False)
        png_bytes = pix.tobytes("png")
        b64 = base64.standard_b64encode(png_bytes).decode("ascii")
        images.append(b64)
    doc.close()
    return images


# ── Procesamiento de un PDF ──────────────────────────────────────────────

def procesar_nomina_pdf(pdf_path: str | Path) -> list[dict]:
    """Procesa UN PDF de nómina con GPT-4 Vision.
    Puede contener 1 nómina (PDF simple) o 2+ (nómina + finiquito en liquidaciones).
    Returns: list de dicts con los campos extraídos.
    """
    try:
        from config import client
    except ImportError:
        from interfaz_facturas.config import client

    if client is None:
        raise RuntimeError("OpenAI API key no configurada")

    pages_b64 = _pdf_pages_to_base64(pdf_path)
    if not pages_b64:
        return []

    # Build message content: all pages as images
    user_content = [
        {"type": "text", "text": (
            "Estas son las páginas de un PDF de nómina española. "
            "Extrae los datos de CADA nómina que encuentres (puede haber varias: nómina mensual + finiquito). "
            "Ignora páginas que sean cartas o documentos sin datos de nómina. "
            "Devuelve un array JSON con todas las nóminas encontradas."
        )},
    ]
    for b64 in pages_b64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"},
        })

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0,
            max_tokens=4096,
        )
        raw = resp.choices[0].message.content or ""
        cleaned = limpiar_json_respuesta(raw)
        parsed = json.loads(cleaned)

        # Normalize: always return list
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            return []

        # Filter out non-payroll pages and enrich
        results = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            if item.get("tipo") == "no_nomina":
                continue
            # Ensure all expected fields
            item = _normalizar_resultado(item)
            # Calculate coste_empresa if missing
            if item.get("coste_empresa") is None or item.get("coste_empresa") == 0:
                item["coste_empresa"] = _calcular_coste_empresa(item)
            # Calculate coste_dia
            dias = item.get("dias") or 0
            if dias > 0 and item.get("coste_empresa"):
                item["coste_dia"] = round(item["coste_empresa"] / dias, 2)
            else:
                item["coste_dia"] = 0
            # SS empresa
            item["ss_empresa"] = round(
                (item.get("coste_empresa") or 0) - (item.get("total_devengado") or 0), 2
            )
            # Source file
            item["_archivo"] = str(Path(pdf_path).name)
            results.append(item)

        return results

    except json.JSONDecodeError as e:
        logger.warning("Error parseando JSON de GPT para %s: %s", pdf_path, e)
        return []
    except Exception as e:
        logger.warning("Error procesando nómina PDF %s: %s", pdf_path, e)
        raise


def _normalizar_resultado(item: dict) -> dict:
    """Ensure all expected numeric fields exist and are float."""
    defaults_float = [
        "salario_base", "antiguedad_euros", "plus_asistencia", "extra_mes",
        "mejora_voluntaria", "a_cuenta_convenio", "dietas", "indemnizacion",
        "vacaciones_proporcionales", "cot_cc", "cot_mei", "cot_fp",
        "cot_desempleo", "irpf_porcentaje", "irpf_euros", "embargo",
        "rem_total", "base_ss", "total_devengado", "total_deducir", "liquido",
        "aportacion_cc", "aportacion_mei", "aportacion_at",
        "aportacion_desempleo", "aportacion_fp", "aportacion_fogasa",
    ]
    defaults_str = ["nombre", "dni", "categoria", "antiguedad", "periodo_texto", "periodo", "tipo"]

    for k in defaults_float:
        val = item.get(k)
        if val is None or val == "" or val == "null":
            item[k] = 0
        else:
            try:
                item[k] = float(val)
            except (ValueError, TypeError):
                item[k] = 0

    for k in defaults_str:
        if not item.get(k):
            item[k] = ""

    item.setdefault("dias", 30)
    if not isinstance(item["dias"], (int, float)):
        try:
            item["dias"] = int(item["dias"])
        except (ValueError, TypeError):
            item["dias"] = 30

    # Normalize DNI
    dni = (item.get("dni") or "").replace("-", "").replace(" ", "").upper().strip()
    item["dni"] = dni

    # Normalize tipo
    tipo = (item.get("tipo") or "").upper().strip()
    if tipo in ("FINIQUITO", "LIQUIDACION", "LIQUIDACIÓN"):
        item["tipo"] = "FINIQUITO"
    else:
        item["tipo"] = "NOMINA"

    return item


def _calcular_coste_empresa(item: dict) -> float:
    """Calcula coste empresa = T.Devengado + aportaciones empresariales."""
    devengado = item.get("total_devengado") or 0
    aportaciones = sum([
        item.get("aportacion_cc") or 0,
        item.get("aportacion_mei") or 0,
        item.get("aportacion_at") or 0,
        item.get("aportacion_desempleo") or 0,
        item.get("aportacion_fp") or 0,
        item.get("aportacion_fogasa") or 0,
    ])
    if aportaciones > 0:
        return round(devengado + aportaciones, 2)
    # Fallback: estimate SS at ~37.35% of base_ss
    base_ss = item.get("base_ss") or 0
    if base_ss > 0:
        return round(devengado + base_ss * 0.3735, 2)
    return round(devengado * 1.3735, 2)


# ── Procesamiento en lote ────────────────────────────────────────────────

def procesar_lote_nominas(pdf_paths: list[str | Path]) -> dict:
    """Procesa múltiples PDFs de nóminas.
    Returns dict con resumen y lista de nóminas extraídas.
    """
    results = {
        "nominas": [],
        "errores": [],
        "total_archivos": len(pdf_paths),
        "procesados": 0,
    }

    for path in pdf_paths:
        try:
            nominas = procesar_nomina_pdf(path)
            results["nominas"].extend(nominas)
            results["procesados"] += 1
        except Exception as e:
            results["errores"].append({"archivo": str(Path(path).name), "error": str(e)})

    return results


# ── Confirmar e insertar en BD ───────────────────────────────────────────

def confirmar_nominas(nominas: list[dict]) -> dict:
    """Inserta/actualiza nóminas confirmadas en la BD.
    Matchea empleados por DNI normalizado. Crea empleados nuevos si no existen.
    Returns dict con resumen.
    """
    from core.db import get_conn
    from core import empleados_db
    from datetime import datetime

    empleados_db.init_empleados_db()
    conn = get_conn()
    now = datetime.now().isoformat()

    stats = {"insertadas": 0, "actualizadas": 0, "empleados_creados": 0, "errores": []}

    try:
        for nom in nominas:
            dni = (nom.get("dni") or "").replace("-", "").replace(" ", "").upper().strip()
            if not dni:
                stats["errores"].append(f"Sin DNI: {nom.get('nombre', '?')}")
                continue

            periodo = nom.get("periodo", "")
            tipo = nom.get("tipo", "NOMINA")
            if not periodo:
                stats["errores"].append(f"Sin periodo: {nom.get('nombre', '?')} DNI={dni}")
                continue

            # Find or create employee
            emp = conn.execute("SELECT id FROM empleados WHERE dni = ?", (dni,)).fetchone()
            if emp:
                emp_id = emp[0]
            else:
                # Create employee from payroll data
                nombre_raw = nom.get("nombre", "")
                if "," in nombre_raw:
                    parts = nombre_raw.split(",", 1)
                    apellidos = parts[0].strip().title()
                    nombre = parts[1].strip().title()
                else:
                    words = nombre_raw.strip().split()
                    if len(words) >= 3:
                        nombre = words[-1].title()
                        apellidos = " ".join(w.title() for w in words[:-1])
                    elif len(words) == 2:
                        apellidos = words[0].title()
                        nombre = words[1].title()
                    else:
                        nombre = nombre_raw.title()
                        apellidos = ""

                categoria = nom.get("categoria", "")
                cur = conn.execute(
                    "INSERT INTO empleados (nombre, apellidos, dni, categoria, fecha_antiguedad, "
                    "fecha_alta, estado, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'activo', ?, ?)",
                    (nombre, apellidos, dni, categoria, nom.get("antiguedad", ""),
                     periodo + "-01", now, now),
                )
                emp_id = cur.lastrowid
                stats["empleados_creados"] += 1

            # Upsert nomina
            existing = conn.execute(
                "SELECT id FROM nominas WHERE empleado_id = ? AND periodo = ? AND tipo = ?",
                (emp_id, periodo, tipo),
            ).fetchone()

            params = (
                emp_id, periodo, tipo, nom.get("dias", 30),
                nom.get("salario_base", 0), nom.get("antiguedad_euros", 0),
                nom.get("plus_asistencia", 0), nom.get("extra_mes", 0),
                nom.get("mejora_voluntaria", 0), nom.get("a_cuenta_convenio", 0),
                nom.get("dietas", 0), nom.get("indemnizacion", 0),
                nom.get("vacaciones_proporcionales", 0),
                nom.get("cot_cc", 0), nom.get("cot_mei", 0),
                nom.get("cot_fp", 0), nom.get("cot_desempleo", 0),
                nom.get("irpf_porcentaje", 0), nom.get("irpf_euros", 0),
                nom.get("embargo", 0), nom.get("rem_total", 0),
                nom.get("base_ss", 0), nom.get("total_devengado", 0),
                nom.get("total_deducir", 0), nom.get("liquido", 0),
                nom.get("coste_empresa", 0), nom.get("coste_dia", 0),
                nom.get("ss_empresa", 0), now,
            )

            if existing:
                conn.execute("""
                    UPDATE nominas SET dias=?, salario_base=?, antiguedad_euros=?,
                    plus_asistencia=?, extra_mes=?, mejora_voluntaria=?, a_cuenta_convenio=?,
                    dietas=?, indemnizacion=?, vacaciones_proporcionales=?,
                    cot_cc=?, cot_mei=?, cot_fp=?, cot_desempleo=?,
                    irpf_porcentaje=?, irpf_euros=?, embargo=?, rem_total=?, base_ss=?,
                    total_devengado=?, total_deducir=?, liquido=?, coste_empresa=?,
                    coste_dia=?, ss_empresa=?, created_at=?
                    WHERE empleado_id=? AND periodo=? AND tipo=?
                """, params[3:] + (emp_id, periodo, tipo))
                stats["actualizadas"] += 1
            else:
                conn.execute("""
                    INSERT INTO nominas (
                        empleado_id, periodo, tipo, dias,
                        salario_base, antiguedad_euros, plus_asistencia, extra_mes,
                        mejora_voluntaria, a_cuenta_convenio, dietas,
                        indemnizacion, vacaciones_proporcionales,
                        cot_cc, cot_mei, cot_fp, cot_desempleo,
                        irpf_porcentaje, irpf_euros, embargo,
                        rem_total, base_ss, total_devengado, total_deducir,
                        liquido, coste_empresa, coste_dia, ss_empresa, created_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, params)
                stats["insertadas"] += 1

        conn.commit()
    except Exception as e:
        logger.exception("Error confirmando nóminas")
        stats["errores"].append(str(e))
    finally:
        conn.close()

    return stats
