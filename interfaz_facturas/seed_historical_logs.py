"""
Seed de histórico de revisiones de mantenimiento.

Lee los certificados PDF reales de cada máquina y los inserta en
maquinaria_maintenance_logs como revisiones completadas.

Lógica de cierre de intervalos:
  - Una revisión a X horas cierra, para cada intervalo, el hito
    floor(X / intervalo) * intervalo.
  - Ejemplo: revisión a 750h cierra 100h→700, 250h→750, 500h→500.

Uso:
  python seed_historical_logs.py          # inserta en la BD
  python seed_historical_logs.py --dry    # solo muestra lo que haría
"""
from __future__ import annotations

import argparse
import sys
import os

# Añadir el path del proyecto al sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.db import conectar as _conectar

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

INTERVALOS = [100, 250, 500, 1000, 2000]

TASK_CODES_BY_INTERVAL = {
    100: [
        "REDUCTORES_ORUGAS_100H",
        "CADENA_ELEVACION_100H",
        "PATIN_LUBRICACION_100H",
        "INTERIOR_COLUMNA_100H",
        "BARRENA_ACEITE_100H",
        "SACAMUESTRAS_ENGRASAR_100H",
        "PERFORADOR_RP500_100H",
    ],
    250: [
        "ORUGAS_TENSION_250H",
        "MEMBRANA_ACUMULADOR_250H",
        "TIRANTES_PERNOS_250H",
    ],
    500: [
        "HIDRAULICO_NIVEL_500H",
        "PINZA_EXTRACCION_500H",
        "LEVANTADOR_GUARDARRAILES_500H",
    ],
    1000: [
        "REDUCTOR_ORUGAS_ACEITE_1000H",
        "FILTRO_HIDRAULICO_ENVIO_1000H",
        "FILTRO_HIDRAULICO_DESCARGA_1000H",
        "BARRENA_ACEITE_REDUCTOR_1000H",
        "PERFORADOR_ACEITE_REDUCTOR_1000H",
        "CADENA_ELEVACION_1000H",
    ],
    2000: [
        "DEPOSITO_HIDRAULICO_2000H",
    ],
}

# ═══════════════════════════════════════════════════════════════════════════
# DATOS HISTÓRICOS (extraídos de los PDFs de certificados)
# ═══════════════════════════════════════════════════════════════════════════
# Formato: (horómetro_revisión, "YYYY-MM-DD")

HISTORICO = {
    "Antonella": [
        (500, "2022-06-01"),
        (750, "2022-08-16"),
        (1000, "2021-07-15"),
        (1150, "2022-11-15"),
        (1500, "2023-02-24"),
        (2650, "2024-02-01"),
        (3750, "2024-12-15"),
        (4000, "2025-03-10"),
    ],
    "Nicoletta": [
        (250, "2019-06-10"),
        (1000, "2020-04-15"),
        (1250, "2020-07-25"),
        (1500, "2020-11-26"),
        (1750, "2021-02-10"),
        (2250, "2021-06-15"),
        (2750, "2022-04-01"),
        (3200, "2022-09-20"),
        (3500, "2022-12-22"),
        (4250, "2023-11-13"),
        (5600, "2024-10-08"),
        (6000, "2025-03-04"),
    ],
    "Enmanuela": [
        (250, "2019-06-10"),
        (500, "2020-04-15"),
        (1250, "2020-10-20"),
        (1750, "2021-02-10"),
        (2000, "2021-06-15"),
        (2250, "2022-02-05"),
        (2500, "2022-03-30"),
        (2750, "2022-09-19"),
        (3000, "2022-11-15"),
        (3300, "2023-02-24"),
        (4250, "2023-11-13"),
        (4800, "2024-10-10"),
        (5000, "2025-03-10"),
    ],
    "Lauretta": [
        (500, "2021-03-20"),
        (750, "2021-07-15"),
        (1000, "2021-09-13"),
        (1250, "2022-01-13"),
        (1750, "2022-09-01"),
        (2000, "2022-11-10"),
        (2300, "2023-02-13"),
        (2800, "2023-09-06"),
        (3450, "2024-04-01"),
        (4000, "2024-11-21"),
        (4250, "2025-03-10"),
        (5000, "2025-12-01"),
    ],
    "Marietta": [
        (500, "2021-03-20"),
        (750, "2021-07-15"),
        (1000, "2021-09-13"),
        (1250, "2022-01-15"),
        (1500, "2022-04-16"),
        (1600, "2022-09-01"),
        (1850, "2022-11-10"),
        (2200, "2023-02-13"),
        (2800, "2023-09-06"),
        (3200, "2024-01-09"),
        (3450, "2024-04-01"),
        (4000, "2024-10-21"),
        (4250, "2025-03-03"),
        (5000, "2025-12-01"),
    ],
    "Carmela": [
        (250, "2024-06-20"),
        (500, "2024-09-07"),
        (750, "2024-10-25"),
        (1000, "2024-12-20"),
        (1250, "2025-02-07"),
        (1900, "2025-09-20"),
    ],
    "Nieves": [
        (250, "2025-03-04"),
        (750, "2025-08-20"),
    ],
    "Olivia": [
        # rev 0 — no ha llegado a horas para primera revisión (39h, serie W239)
    ],
}


# ═══════════════════════════════════════════════════════════════════════════
# LÓGICA
# ═══════════════════════════════════════════════════════════════════════════

def map_revision_to_task_entries(rev_hours: int, rev_date: str):
    """Para una revisión a rev_hours, devuelve lista de (task_code, due_hours).

    due_hours = floor(rev_hours / intervalo) * intervalo
    Solo se genera entrada si due_hours > 0.
    """
    entries = []
    for iv in INTERVALOS:
        due = (rev_hours // iv) * iv
        if due > 0:
            for tc in TASK_CODES_BY_INTERVAL[iv]:
                entries.append((tc, due))
    return entries


def get_maquina_id(conn, nombre: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM maquinas WHERE nombre = ?", [nombre]
    ).fetchone()
    return row[0] if row else None


def insert_historical_logs(dry_run: bool = False):
    """Inserta los logs históricos en maquinaria_maintenance_logs."""
    from core.maquinaria_db import init_maquinaria_db
    init_maquinaria_db()

    with _conectar() as conn:
        # Verificar que las tareas existan
        task_count = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_maintenance_tasks"
        ).fetchone()[0]
        if task_count == 0:
            print("ERROR: No hay tareas de mantenimiento en la BD. Ejecuta init primero.")
            return

        # Verificar tareas disponibles
        db_tasks = {
            row[0] for row in
            conn.execute("SELECT code FROM maquinaria_maintenance_tasks").fetchall()
        }

        total_inserted = 0
        total_skipped = 0

        for nombre, revisiones in HISTORICO.items():
            maquina_id = get_maquina_id(conn, nombre)
            if maquina_id is None:
                # Intentar variantes de nombre
                for variante in [nombre, nombre.replace("Enmanuela", "Enmanuella")]:
                    maquina_id = get_maquina_id(conn, variante)
                    if maquina_id:
                        break
            if maquina_id is None:
                print(f"  WARN: Máquina '{nombre}' no encontrada en BD. Saltando.")
                continue

            print(f"\n{'='*60}")
            print(f"  {nombre} (id={maquina_id}) — {len(revisiones)} revisiones")
            print(f"{'='*60}")

            for rev_h, rev_date in sorted(revisiones, key=lambda x: x[0]):
                entries = map_revision_to_task_entries(rev_h, rev_date)
                print(f"\n  Revisión {rev_h}h ({rev_date}): {len(entries)} tareas")

                for task_code, due_hours in entries:
                    if task_code not in db_tasks:
                        print(f"    SKIP {task_code} — no existe en BD")
                        total_skipped += 1
                        continue

                    # Comprobar duplicado
                    existing = conn.execute(
                        "SELECT id FROM maquinaria_maintenance_logs "
                        "WHERE maquina_id = ? AND task_code = ? AND due_hours = ?",
                        [maquina_id, task_code, due_hours]
                    ).fetchone()

                    if existing:
                        total_skipped += 1
                        continue

                    if dry_run:
                        print(f"    [DRY] {task_code} due={due_hours}h")
                    else:
                        conn.execute(
                            "INSERT INTO maquinaria_maintenance_logs "
                            "(maquina_id, task_code, horometro_at, due_hours, "
                            " operario_nombre, observaciones, completed_at, created_at) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                maquina_id,
                                task_code,
                                rev_h,            # horómetro real de la revisión
                                due_hours,        # hito estándar que cierra
                                "Histórico (PDF)",
                                f"Importado de certificado PDF. Revisión a {rev_h}h.",
                                f"{rev_date}T00:00:00",
                                f"{rev_date}T00:00:00",
                            ],
                        )
                    total_inserted += 1

        print(f"\n{'='*60}")
        action = "Se insertarían" if dry_run else "Insertados"
        print(f"  {action}: {total_inserted} registros")
        print(f"  Saltados (duplicados o inexistentes): {total_skipped}")
        print(f"{'='*60}")


def show_next_revisions():
    """Muestra las próximas revisiones por máquina e intervalo."""
    from core.maquinaria_db import init_maquinaria_db
    init_maquinaria_db()

    with _conectar() as conn:
        maquinas = conn.execute(
            "SELECT id, nombre, horometro_actual FROM maquinas WHERE activa = 1 ORDER BY nombre"
        ).fetchall()

        print(f"\n{'='*80}")
        print("  PRÓXIMAS REVISIONES POR MÁQUINA")
        print(f"{'='*80}")

        for maq_id, nombre, horometro in maquinas:
            # Obtener horómetro real (max entre seed y última revisión)
            max_rev = conn.execute(
                "SELECT MAX(horometro_at) FROM maquinaria_maintenance_logs WHERE maquina_id = ?",
                [maq_id]
            ).fetchone()[0] or 0
            real_h = max(horometro, max_rev)

            print(f"\n  {nombre} — Horómetro: {horometro} (real*: {real_h})")
            print(f"  {'Intervalo':<10} {'Último hito':<14} {'Próxima':<10} {'Delta':<8} {'Estado'}")
            print(f"  {'-'*55}")

            for iv in INTERVALOS:
                # Último hito cerrado para este intervalo
                row = conn.execute(
                    "SELECT MAX(due_hours) FROM maquinaria_maintenance_logs "
                    "WHERE maquina_id = ? AND task_code IN ({}) ".format(
                        ",".join("?" for _ in TASK_CODES_BY_INTERVAL[iv])
                    ),
                    [maq_id] + TASK_CODES_BY_INTERVAL[iv]
                ).fetchone()
                last_done = row[0] if row and row[0] else 0

                next_due = last_done + iv
                while next_due < real_h - 50:
                    next_due += iv
                delta = next_due - real_h
                status = "PENDIENTE" if delta <= 50 else "OK"

                print(f"  {iv:<10} {last_done:<14} {next_due:<10} {delta:<8} {status}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed histórico de revisiones")
    parser.add_argument("--dry", action="store_true", help="Solo mostrar, no insertar")
    parser.add_argument("--next", action="store_true", help="Mostrar próximas revisiones")
    args = parser.parse_args()

    if args.next:
        show_next_revisions()
    else:
        insert_historical_logs(dry_run=args.dry)
        if not args.dry:
            show_next_revisions()
