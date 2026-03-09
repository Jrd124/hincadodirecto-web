"""Revisores básicos de facturas: validación de campos, coherencia numérica y flags de error."""
from __future__ import annotations

import logging
import re
from datetime import datetime

from core.parser import normalizar_importe_str

logger = logging.getLogger(__name__)


def revisor_basico(filas: list[dict]) -> list[dict]:
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

    base_val = normalizar_importe_str(base_str) or 0.0
    iva_val = normalizar_importe_str(iva_str) or 0.0
    ret_val = normalizar_importe_str(ret_str) or 0.0
    total_factura_val = normalizar_importe_str(total_factura_str)
    total_pagar_val = normalizar_importe_str(total_pagar_str)

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


def revisor_basico_clientes(filas: list[dict]) -> list[dict]:
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

    iva_val = normalizar_importe_str(fila.get("iva") or "")
    total_val = normalizar_importe_str(fila.get("total_a_pagar") or "")

    pricing_sum = 0.0
    for campo_p in ("pricing_servicio", "pricing_transporte"):
      v = normalizar_importe_str(fila.get(campo_p) or "")
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
