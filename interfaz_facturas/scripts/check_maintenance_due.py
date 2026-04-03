#!/usr/bin/env python3
"""Job semanal de notificaciones de mantenimiento (viernes 8:00).

Uso:
  # Dry-run (ver qué se enviaría sin enviar nada):
  python scripts/check_maintenance_due.py --dry-run

  # Ejecución real:
  python scripts/check_maintenance_due.py

  # Desde Docker en producción:
  docker exec hincado-erp python scripts/check_maintenance_due.py

Programar en cron (viernes a las 8:00):
  0 8 * * 5 cd /app && python scripts/check_maintenance_due.py >> /app/data/logs/maintenance_notify.log 2>&1
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Asegurar que el directorio padre está en el path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import maquinaria_db
from core import notificaciones_maquinaria as notif


def main():
    parser = argparse.ArgumentParser(description="Ciclo de notificaciones de mantenimiento")
    parser.add_argument("--dry-run", action="store_true",
                        help="Calcular sin enviar notificaciones")
    parser.add_argument("--json", action="store_true",
                        help="Salida en formato JSON")
    parser.add_argument("--machine", type=int, default=None,
                        help="Filtrar por ID de máquina")
    args = parser.parse_args()

    # Inicializar DB
    maquinaria_db.init_maquinaria_db()

    if args.machine:
        # Solo calcular para una máquina
        dues = notif.calcular_tareas_due(maquina_id=args.machine)
        if args.json:
            print(json.dumps(dues, indent=2, ensure_ascii=False))
        else:
            print(f"\n{'='*60}")
            print(f"Tareas due para máquina ID={args.machine}")
            print(f"{'='*60}")
            for d in dues:
                status = "⚠️  YA NOTIFICADA" if d["already_notified_this_week"] else "📋 PENDIENTE"
                print(f"  {status} | {d['task_nombre']} | Due: {d['next_due_hours']:.0f}h | Actual: {d['horometro_actual']:.0f}h")
            print(f"\nTotal: {len(dues)} tareas due")
        return

    # Ejecutar ciclo completo
    resumen = notif.ejecutar_ciclo_notificaciones(dry_run=args.dry_run)

    if args.json:
        print(json.dumps(resumen, indent=2, ensure_ascii=False))
    else:
        print(f"\n{'='*60}")
        print(f"CICLO DE NOTIFICACIONES — Semana {resumen['semana']}")
        print(f"{'='*60}")
        print(f"  Dry run:              {resumen['dry_run']}")
        print(f"  Tareas due total:     {resumen['tareas_due_total']}")
        print(f"  Ya notificadas:       {resumen['ya_notificadas']}")
        print(f"  Sin contacto:         {resumen['sin_contacto']}")
        print(f"  Notificaciones off:   {resumen['notificaciones_off']}")
        print(f"  Enviadas WhatsApp:    {resumen['enviadas_whatsapp']}")
        print(f"  Enviadas SMS:         {resumen['enviadas_sms']}")
        print(f"  Fallidas:             {resumen['fallidas']}")

        if resumen["detalles"]:
            print(f"\n  Detalle:")
            for d in resumen["detalles"]:
                icon = {"enviado": "✅", "fallido": "❌", "ya_notificada_esta_semana": "⏭️",
                         "sin_contacto": "📵", "notificaciones_desactivadas": "🔇",
                         "dry_run": "🔍"}.get(d.get("resultado", ""), "❓")
                print(f"    {icon} {d['maquina']} | {d['tarea']} | {d.get('resultado', '?')}")

        print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
