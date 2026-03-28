"""Clasificador deterministico de documentos CAE.

Estrategia: lista de palabras clave por DocType.
Si el nombre del archivo contiene alguna keyword -> SUGGESTED.
Si no hay match -> UNKNOWN (requiere clasificacion manual o IA).

IMPORTANTE: Este clasificador genera SUGGESTED, nunca CONFIRMED.
La confirmacion siempre la hace el usuario.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date as _date

# ── Mapa de keywords por tipo documental ────────────────────────────────────

DOC_TYPE_KEYWORDS: dict[str, list[str]] = {
    # Empresa
    "ESCRITURA_CONSTITUCION":    ["escritura", "constitucion", "sociedad"],
    "CIF":                       ["cif"],
    "SEGURO_RC":                 ["rc", "responsabilidad civil", "seguro empresa", "poliza empresa"],
    "SEGURO_RC_PATRONAL":        ["patronal", "rc patronal"],
    "TC1_TC2":                   ["tc1", "tc2", "tc-1", "tc-2", "boletin cotizacion", "cotizacion ss"],
    "CERTIFICADO_ESTAR_AL_CORRIENTE_SS": ["certificado ss", "corriente ss", "seguridad social corriente", "estar al corriente ss"],
    "CERTIFICADO_ESTAR_AL_CORRIENTE_HACIENDA": ["certificado hacienda", "corriente hacienda", "agencia tributaria corriente"],
    "PREVENCION_RIESGOS":        ["prevencion riesgos", "prl empresa", "plan prevencion", "evaluacion riesgos"],
    "ADHESION_MANCOMUNADA":      ["adhesion", "mancomunada", "servicio prevencion ajeno", "spa"],
    # Operarios
    "DNI":                       ["dni", "documento nacional identidad", "documento identidad"],
    "NIE":                       ["nie", "numero identidad extranjero"],
    "ALTA_SEGURIDAD_SOCIAL":     ["alta ss", "alta seguridad social", "afiliacion"],
    "CONTRATO_TRABAJO":          ["contrato", "contrato trabajo"],
    "TC2_OPERARIO":              ["nomina", "tc2 operario", "recibo salario"],
    "APTO_MEDICO":               ["apto", "aptitud", "reconocimiento medico", "vigilancia salud"],
    "CURSO_PRL_BASICO":          ["prl basico", "prevencion basica", "nivel basico prl"],
    "CURSO_PRL_ESPECIFICO":      ["prl especifico", "formacion prl", "curso prl"],
    "FORMACION_ESPECIFICA":      ["formacion", "curso", "carnet", "certificado formacion", "trabajos altura", "baja tension"],
    "CARNET_CONDUCIR":           ["carnet conducir", "permiso conducir", "permiso de conduccion", "licencia conduccion"],
    # Maquinas
    "FICHA_TECNICA":             ["ficha tecnica", "ficha maquina"],
    "SEGURO_MAQUINA":            ["seguro maquina", "poliza maquina"],
    "CERTIFICADO_CE":            ["marcado ce", "declaracion conformidad", "certificado ce"],
    "MANUAL_INSTRUCCIONES":      ["manual instrucciones", "manual operacion", "manual uso"],
    "INSPECCION_PERIODICA":      ["inspeccion periodica", "ite", "inspeccion reglamentaria"],
    "PLAN_MANTENIMIENTO":        ["mantenimiento", "plan mantenimiento"],
    # Vehiculos
    "PERMISO_CIRCULACION":       ["permiso circulacion", "ficha vehiculo", "tarjeta itv"],
    "ITV":                       ["itv", "inspeccion tecnica"],
    "SEGURO_VEHICULO":           ["seguro vehiculo", "seguro coche", "seguro furgoneta", "carta verde"],
    # Generico
    "OTRO":                      [],
}

MONTH_MAP: dict[str, int] = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


# ── Normalizacion de texto ──────────────────────────────────────────────────


def _normalize(text: str) -> str:
    """Lowercase, quita acentos, reemplaza separadores por espacios."""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = re.sub(r"[\u0300-\u036f]", "", text)  # quitar combining diacriticals
    text = re.sub(r"[_\-.]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ── Clasificador principal ──────────────────────────────────────────────────


def classify_document(file_name: str, folder_path: str | None = None) -> dict:
    """Clasifica un archivo por su nombre y ruta.

    Returns: {doc_type: str|None, confidence: str, matched_keyword: str|None}
    """
    normalized_name = _normalize(file_name)
    normalized_path = _normalize(folder_path) if folder_path else ""
    combined = f"{normalized_path} {normalized_name}"

    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        if doc_type == "OTRO":
            continue
        for kw in keywords:
            if _normalize(kw) in combined:
                return {"doc_type": doc_type, "confidence": "SUGGESTED", "matched_keyword": kw}

    return {"doc_type": None, "confidence": "UNKNOWN", "matched_keyword": None}


# ── Deteccion de fecha en nombre de archivo ─────────────────────────────────


def extract_date_from_filename(file_name: str) -> _date | None:
    """Intenta extraer una fecha del nombre del archivo.

    Patrones soportados: YYYY-MM-DD, DD-MM-YYYY, mesYY, mesYYYY.
    """
    normalized = _normalize(file_name)

    # YYYY-MM-DD o YYYY/MM/DD
    m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", normalized)
    if m:
        try:
            return _date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # DD-MM-YYYY o DD/MM/YYYY
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", normalized)
    if m:
        try:
            return _date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # Mes abreviado + anio (ene25, feb2025)
    m = re.search(r"(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[-_]?(\d{2,4})", normalized)
    if m:
        month = MONTH_MAP.get(m.group(1))
        year_str = m.group(2)
        if len(year_str) == 2:
            year_str = f"20{year_str}"
        if month:
            try:
                return _date(int(year_str), month, 1)
            except ValueError:
                pass

    return None


# ── Inferencia de tipo de entidad por carpeta ───────────────────────────────


def infer_entity_type(folder_path: str) -> str | None:
    """Determina el tipo de entidad probable a partir de la ruta de carpeta.

    Returns: OPERARIO, MAQUINA, VEHICULO, EMPRESA, o None.
    """
    normalized = _normalize(folder_path)

    if any(kw in normalized for kw in ("operario", "personal", "trabajador", "rrhh", "empleado")):
        return "OPERARIO"
    if any(kw in normalized for kw in ("maquina", "maquinaria", "equipo")):
        return "MAQUINA"
    if any(kw in normalized for kw in ("vehiculo", "coche", "furgoneta", "flota")):
        return "VEHICULO"
    if any(kw in normalized for kw in ("empresa", "compania", "sociedad")):
        return "EMPRESA"

    return None
