"""
Seed de empleados desde CSV exportado de Notion.

Uso:
    python scripts/seed_empleados.py [ruta_csv]

Si no se pasa ruta, busca 'Empleados*_all.csv' en el directorio actual.
El script es idempotente: si un DNI ya existe, actualiza en vez de duplicar.
"""
from __future__ import annotations

import csv
import os
import re
import sys
from datetime import datetime

# Ajustar path para importar core/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core import empleados_db


# ── Helpers de parseo ──────────────────────────────────────────────────────

MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def parse_fecha_es(txt: str) -> str | None:
    """Convierte '7 de febrero de 2022' → '2022-02-07'."""
    if not txt or not txt.strip():
        return None
    txt = txt.strip().lower()
    m = re.match(r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", txt)
    if not m:
        return None
    dia, mes_str, anio = int(m.group(1)), m.group(2), int(m.group(3))
    mes = MESES_ES.get(mes_str)
    if not mes:
        return None
    # Sanity check (e.g. "29 de febrero de 2068" es inválido)
    try:
        datetime(anio, mes, dia)
    except ValueError:
        return None
    return f"{anio:04d}-{mes:02d}-{dia:02d}"


def limpiar_nombre(nombre_raw: str) -> tuple[str, str]:
    """Separa nombre y apellidos. Quita apodos entre paréntesis del campo nombre."""
    nombre_raw = nombre_raw.strip()
    # Quitar apodos como "(Padre)", "(Hijo)", "(Colombiano)", "(Churrero)"
    limpio = re.sub(r"\s*\([^)]*\)\s*", " ", nombre_raw).strip()
    partes = limpio.split()
    if len(partes) >= 3:
        nombre = partes[0]
        apellidos = " ".join(partes[1:])
    elif len(partes) == 2:
        nombre = partes[0]
        apellidos = partes[1]
    else:
        nombre = limpio
        apellidos = ""
    return nombre, apellidos


def limpiar_telefono(tel: str) -> str:
    """Limpia el teléfono: quita espacios invisibles y formato."""
    if not tel:
        return ""
    # Quitar caracteres Unicode invisibles (LTR mark, etc.)
    tel = re.sub(r"[^\d+]", "", tel)
    return tel


def mapear_estado(estado_notion: str) -> str:
    """Mapea estados de Notion → estados del ERP."""
    estado = estado_notion.strip().lower()
    if estado in ("asignado", "en reserva"):
        return "activo"
    elif estado in ("fuera de servicio",):
        return "baja"
    return "baja"


def limpiar_notion_links(txt: str) -> str:
    """Quita links de Notion tipo 'Texto (https://www.notion.so/...)'."""
    if not txt:
        return ""
    return re.sub(r"\s*\(https?://www\.notion\.so/[^)]*\)", "", txt).strip()


# ── Main ───────────────────────────────────────────────────────────────────

def seed(csv_path: str):
    empleados_db.init_empleados_db()

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Leyendo {len(rows)} empleados de {csv_path}")

    insertados = 0
    actualizados = 0

    # Debug: mostrar headers detectados
    if rows:
        print(f"  Columnas CSV: {list(rows[0].keys())}")
        print(f"  Fila 1: Nombre='{rows[0].get('Nombre', '???')}' DNI='{rows[0].get('DNI/NIE', '???')}'")

    for row in rows:
        nombre_raw = row.get("Nombre", "").strip()
        if not nombre_raw:
            print(f"  ⚠ Fila sin nombre, saltando: {dict(list(row.items())[:3])}")
            continue

        nombre, apellidos = limpiar_nombre(nombre_raw)
        dni = row.get("DNI/NIE", "").strip()
        email = row.get("Email", "").strip()
        telefono = limpiar_telefono(row.get("Teléfono", ""))
        estado = mapear_estado(row.get("Estado", ""))
        fecha_alta = parse_fecha_es(row.get("Fecha alta", ""))
        puesto = row.get("Rol", "").strip()
        notas_raw = row.get("Notas", "").strip()
        geo = row.get("Geo", "").strip()
        contrato = row.get("Tipo de contrato", "").strip()
        hincadoras = limpiar_notion_links(row.get("Hincadoras asignadas", ""))
        proyectos = limpiar_notion_links(row.get("📋 Proyectos", ""))

        # Compilar notas con info extra
        notas_partes = []
        if notas_raw:
            notas_partes.append(notas_raw)
        if geo:
            notas_partes.append(f"Geo: {geo}")
        if contrato:
            notas_partes.append(f"Contrato: {contrato}")
        if hincadoras:
            notas_partes.append(f"Hincadora: {hincadoras}")
        if proyectos:
            notas_partes.append(f"Proyecto: {proyectos}")
        # Preservar nombre original con apodo si difiere
        if nombre_raw != f"{nombre} {apellidos}".strip():
            notas_partes.insert(0, f"Notion: {nombre_raw}")
        notas = "\n".join(notas_partes)

        data = {
            "nombre": nombre,
            "apellidos": apellidos,
            "dni": dni,
            "email": email,
            "telefono": telefono,
            "estado": estado,
            "fecha_alta": fecha_alta or "",
            "puesto": puesto,
            "notas": notas,
            "categoria": "",
        }

        # Buscar si ya existe por DNI
        existente = None
        if dni:
            todos = empleados_db.listar_empleados(solo_activos=False)
            existente = next((e for e in todos if e.get("dni") == dni), None)

        try:
            if existente:
                empleados_db.actualizar_empleado(existente["id"], data)
                actualizados += 1
                print(f"  ↻ Actualizado: {nombre} {apellidos} ({dni})")
            else:
                empleados_db.crear_empleado(data)
                insertados += 1
                print(f"  ✓ Insertado:   {nombre} {apellidos} ({dni or 'sin DNI'})")
        except Exception as exc:
            print(f"  ✗ Error con {nombre} {apellidos}: {exc}")

    print(f"\nResumen: {insertados} insertados, {actualizados} actualizados, {len(rows)} total")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        # Buscar CSV en directorio actual
        import glob
        candidates = glob.glob("Empleados*_all.csv") + glob.glob("scripts/Empleados*_all.csv")
        if not candidates:
            print("Error: No se encontró CSV. Pasa la ruta como argumento.")
            sys.exit(1)
        path = candidates[0]

    seed(path)
