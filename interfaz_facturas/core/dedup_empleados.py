"""
Deduplicación de empleados por DNI normalizado.

Detecta pares de empleados con el mismo DNI (tras normalizar: quitar guiones,
espacios, uppercase) y los fusiona conservando el registro más completo.

Reglas:
- Conservar el registro con más datos (categoría, nóminas vinculadas)
- Copiar campos no vacíos del eliminado al conservado (teléfono, email, puesto)
- Reasignar FKs en todas las tablas relacionadas
- Normalizar todos los DNI tras la fusión
"""
from __future__ import annotations

import logging
from collections import defaultdict

from core.db import get_conn
from core import empleados_db

logger = logging.getLogger("erp")

# Tablas con FK a empleados (columna, filtro extra si aplica)
_FK_TABLES = [
    ("nominas", "empleado_id", None),
    ("adelantos", "empleado_id", None),
    ("ausencias", "empleado_id", None),
    ("bot_telegram_usuarios", "empleado_id", None),
    ("proyecto_asignaciones", "recurso_id", "recurso_tipo = 'empleado'"),
]

# Campos a copiar del eliminado al conservado si el conservado los tiene vacíos
_COPY_FIELDS = ["telefono", "email", "puesto"]


def dedup_empleados(dry_run: bool = False) -> dict:
    """Ejecuta deduplicación. Si dry_run=True, solo reporta sin modificar.

    Returns dict con resumen de la operación.
    """
    empleados_db.init_empleados_db()
    conn = get_conn()

    try:
        # Leer todos los empleados
        rows = conn.execute(
            "SELECT id, dni, nombre, apellidos, categoria, telefono, email, puesto, estado "
            "FROM empleados ORDER BY id"
        ).fetchall()

        # Agrupar por DNI normalizado
        by_dni = defaultdict(list)
        for r in rows:
            dni_raw = r["dni"] or ""
            dni_norm = dni_raw.replace("-", "").replace(" ", "").upper().strip()
            if dni_norm:
                by_dni[dni_norm].append(dict(r))

        # Detectar pares
        pairs = []
        for dni_norm, entries in by_dni.items():
            if len(entries) < 2:
                continue
            # Ordenar: conservar el que tiene categoría (importado) o mayor ID
            entries.sort(key=lambda e: (bool(e["categoria"]), e["id"]))
            keep = entries[-1]  # mayor prioridad
            for discard in entries[:-1]:
                pairs.append((discard, keep))

        # También buscar duplicados sin DNI por nombre exacto
        no_dni = [dict(r) for r in rows if not (r["dni"] or "").strip()]
        for nd in no_dni:
            nombre_nd = ((nd["nombre"] or "") + " " + (nd["apellidos"] or "")).strip().lower()
            for dni_norm, entries in by_dni.items():
                for e in entries:
                    nombre_e = ((e["nombre"] or "") + " " + (e["apellidos"] or "")).strip().lower()
                    # Match si el nombre sin-DNI está contenido en el con-DNI o viceversa
                    if nombre_nd and nombre_e and (nombre_nd in nombre_e or nombre_e in nombre_nd):
                        pairs.append((nd, e))

        stats = {
            "pares_encontrados": len(pairs),
            "fusionados": 0,
            "fks_reasignadas": 0,
            "campos_copiados": 0,
            "dni_normalizados": 0,
            "detalle": [],
        }

        if dry_run or not pairs:
            for old, new in pairs:
                nombre_old = ((old["nombre"] or "") + " " + (old["apellidos"] or "")).strip()
                nombre_new = ((new["nombre"] or "") + " " + (new["apellidos"] or "")).strip()
                stats["detalle"].append(f"{old['id']} ({nombre_old}) -> {new['id']} ({nombre_new})")
            if dry_run:
                conn.close()
                return stats

        # Ejecutar en transacción
        conn.execute("BEGIN")
        try:
            for old, new in pairs:
                old_id = old["id"]
                new_id = new["id"]

                # Copiar campos vacíos
                for field in _COPY_FIELDS:
                    old_val = old.get(field)
                    if old_val and old_val.strip():
                        new_val = conn.execute(
                            f"SELECT {field} FROM empleados WHERE id = ?", (new_id,)
                        ).fetchone()[0]
                        if not new_val or not new_val.strip():
                            conn.execute(
                                f"UPDATE empleados SET {field} = ? WHERE id = ?",
                                (old_val, new_id),
                            )
                            stats["campos_copiados"] += 1

                # Reasignar FKs
                for tabla, col, filtro in _FK_TABLES:
                    where = f"{col} = ?"
                    if filtro:
                        where += f" AND {filtro}"
                    cur = conn.execute(
                        f"UPDATE {tabla} SET {col} = ? WHERE {where}",
                        (new_id, old_id),
                    )
                    stats["fks_reasignadas"] += cur.rowcount

                # Eliminar duplicado
                conn.execute("DELETE FROM empleados WHERE id = ?", (old_id,))
                stats["fusionados"] += 1

                nombre_old = ((old["nombre"] or "") + " " + (old["apellidos"] or "")).strip()
                nombre_new = ((new["nombre"] or "") + " " + (new["apellidos"] or "")).strip()
                stats["detalle"].append(f"{old_id} ({nombre_old}) -> {new_id} ({nombre_new})")

            # Normalizar todos los DNI
            cur = conn.execute("""
                UPDATE empleados
                SET dni = UPPER(REPLACE(REPLACE(TRIM(dni), '-', ''), ' ', ''))
                WHERE dni IS NOT NULL AND dni != ''
                  AND (dni LIKE '%-%' OR dni LIKE '% %' OR dni != UPPER(dni))
            """)
            stats["dni_normalizados"] = cur.rowcount

            conn.execute("COMMIT")

        except Exception:
            conn.execute("ROLLBACK")
            raise

        logger.info(
            "Dedup empleados: %d pares, %d fusionados, %d FKs reasignadas, %d DNIs normalizados",
            stats["pares_encontrados"], stats["fusionados"],
            stats["fks_reasignadas"], stats["dni_normalizados"],
        )
        return stats

    finally:
        conn.close()
