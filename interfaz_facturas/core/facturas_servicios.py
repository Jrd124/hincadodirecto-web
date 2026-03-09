from __future__ import annotations

from typing import Iterable


def filtrar_filas_csv(
  reader: Iterable[dict],
  campos_export: list[str],
  *,
  year: str = "",
  month: str = "",
  campo_filtro: str | None = None,
  valor_filtro: str = "",
  skip_header_por_empresa: bool = False,
) -> list[dict]:
  """
  Aplica un filtrado genérico sobre filas de un CSV de facturas.

  - Filtro por año/mes usando la columna fecha_factura.
  - Filtro por proveedor/cliente (u otra columna) si se indica.
  - Puede saltar la fila de cabecera cuando trae empresa_id como texto.
  """
  filas_export: list[dict] = []
  for row in reader:
    if skip_header_por_empresa and (row.get("empresa_id") or "").strip() == "empresa_id":
      continue
    fila = {k: (row.get(k, "") or "").strip() for k in campos_export}
    fecha = fila.get("fecha_factura", "")
    if year and not fecha.startswith(year):
      continue
    if month and (len(fecha) < 7 or fecha[5:7] != month):
      continue
    if campo_filtro and valor_filtro:
      if (fila.get(campo_filtro) or "").strip() != valor_filtro:
        continue
    filas_export.append(fila)
  return filas_export

