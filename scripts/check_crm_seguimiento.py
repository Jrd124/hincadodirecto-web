#!/usr/bin/env python3
"""check_crm_seguimiento.py — Job diario de seguimiento CRM.

Detecta empresas sin actividad reciente y notifica por Telegram.

Uso:
  # Ver qué empresas necesitan seguimiento (sin enviar nada):
  python scripts/check_crm_seguimiento.py --dry-run

  # Ejecución real (envía Telegram):
  python scripts/check_crm_seguimiento.py

  # Cambiar umbral de días (default 30):
  python scripts/check_crm_seguimiento.py --dias 45

  # Solo clientes y leads (excluir proveedores):
  python scripts/check_crm_seguimiento.py --tipos cliente lead

  # Limitar el número de empresas en el mensaje:
  python scripts/check_crm_seguimiento.py --max 10

Programar en cron (lunes y jueves a las 8:30):
  30 8 * * 1,4  cd /Users/sergiog/Applications/hincado-erp/interfaz_facturas && \
    source venv/bin/activate && \
    python ../scripts/check_crm_seguimiento.py >> ../data/logs/crm_seguimiento.log 2>&1
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Asegurar que interfaz_facturas/ está en el path para importar core.*
_SCRIPTS_DIR = Path(__file__).resolve().parent
_APP_DIR = _SCRIPTS_DIR.parent / "interfaz_facturas"
sys.path.insert(0, str(_APP_DIR))

from dotenv import load_dotenv
load_dotenv(_APP_DIR / ".env")

from core import crm_db


# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPERADMIN_IDS_RAW = os.getenv("TELEGRAM_SUPERADMIN_IDS", "")
SUPERADMIN_IDS = [int(x.strip()) for x in SUPERADMIN_IDS_RAW.split(",") if x.strip().isdigit()]


# ── Helpers ───────────────────────────────────────────────────────────────────
def _icono_tipo(tipo: str) -> str:
    return {"cliente": "🏢", "lead": "🎯", "proveedor": "🔧",
            "colaborador": "🤝", "otro": "📌"}.get(tipo, "📌")


def _icono_interaccion(tipo: str | None) -> str:
    if not tipo:
        return "❓"
    return {"llamada": "📞", "email": "✉️", "reunion": "🤝", "nota": "📝",
            "whatsapp": "💬", "visita": "🏢", "gmail": "📧"}.get(tipo, "📌")


def _formato_dias(dias: int) -> str:
    if dias < 0:
        return "nunca"
    if dias == 0:
        return "hoy"
    if dias == 1:
        return "ayer"
    if dias < 30:
        return f"{dias}d"
    if dias < 365:
        meses = dias // 30
        return f"{meses}m"
    años = dias // 365
    return f"{años}a"


def construir_mensaje(empresas: list[dict], dias: int, max_empresas: int) -> str:
    total = len(empresas)
    mostradas = empresas[:max_empresas]

    lineas = [
        f"📋 *Seguimiento CRM — Empresas sin actividad +{dias} días*",
        f"_{total} empresa{'s' if total != 1 else ''} detectada{'s' if total != 1 else ''}_\n",
    ]

    for e in mostradas:
        icono = _icono_tipo(e.get("tipo", ""))
        dias_str = _formato_dias(e.get("dias_sin_actividad") or -1)
        ult_tipo = _icono_interaccion(e.get("ultima_interaccion_tipo"))
        nombre = e.get("nombre", "—")
        lineas.append(f"{icono} *{nombre}* — {dias_str} sin actividad {ult_tipo}")

    if total > max_empresas:
        lineas.append(f"\n_…y {total - max_empresas} más. Abre el CRM para ver todas._")

    lineas.append("\n🔗 Accede al CRM para registrar la siguiente acción.")
    return "\n".join(lineas)


async def _enviar_telegram(mensaje: str) -> dict:
    """Envía el mensaje a todos los superadmins configurados."""
    if not BOT_TOKEN:
        return {"enviados": 0, "error": "TELEGRAM_BOT_TOKEN no configurado"}
    if not SUPERADMIN_IDS:
        return {"enviados": 0, "error": "TELEGRAM_SUPERADMIN_IDS no configurado"}

    try:
        from telegram import Bot
        from telegram.constants import ParseMode
    except ImportError:
        return {"enviados": 0, "error": "python-telegram-bot no instalado"}

    bot = Bot(token=BOT_TOKEN)
    enviados = 0
    errores = []
    async with bot:
        for chat_id in SUPERADMIN_IDS:
            try:
                await bot.send_message(
                    chat_id=chat_id,
                    text=mensaje,
                    parse_mode=ParseMode.MARKDOWN,
                )
                enviados += 1
            except Exception as exc:
                errores.append(f"{chat_id}: {exc}")

    return {"enviados": enviados, "errores": errores}


def main() -> None:
    parser = argparse.ArgumentParser(description="Job de seguimiento CRM")
    parser.add_argument("--dry-run", action="store_true",
                        help="Mostrar resultados sin enviar Telegram")
    parser.add_argument("--dias", type=int, default=30,
                        help="Días de inactividad umbral (default: 30)")
    parser.add_argument("--tipos", nargs="*", default=None,
                        help="Tipos de empresa a incluir, p.ej. --tipos cliente lead")
    parser.add_argument("--excluir", nargs="*", default=None,
                        help="Tipos de empresa a excluir, p.ej. --excluir proveedor")
    parser.add_argument("--max", type=int, default=15, dest="max_empresas",
                        help="Máximo de empresas en el mensaje Telegram (default: 15)")
    parser.add_argument("--json", action="store_true",
                        help="Salida en formato JSON")
    args = parser.parse_args()

    # Inicializar DB
    crm_db.init_crm_db()

    # Consultar empresas sin actividad
    empresas = crm_db.empresas_sin_actividad(
        dias=args.dias,
        tipos=args.tipos,
        excluir_estados=args.excluir,
    )

    sep = "=" * 60
    if args.json:
        import json
        print(json.dumps({
            "total": len(empresas),
            "dias_umbral": args.dias,
            "empresas": empresas,
        }, ensure_ascii=False, indent=2))
        return

    print(f"\n{sep}")
    print(f"SEGUIMIENTO CRM — empresas sin actividad > {args.dias} días")
    print(sep)
    print(f"  Total encontradas: {len(empresas)}")
    print(f"  Dry run:           {args.dry_run}\n")

    if not empresas:
        print("  ✅ Todas las empresas tienen actividad reciente. Nada que notificar.")
        print(f"{sep}\n")
        return

    for e in empresas[:args.max_empresas]:
        dias_num = e.get("dias_sin_actividad") or -1
        ult = e.get("ultima_interaccion_fecha") or "nunca"
        print(f"  {_icono_tipo(e.get('tipo',''))} {e['nombre']:<40} "
              f"{_formato_dias(dias_num):>5}  última: {ult[:10] if ult != 'nunca' else 'nunca'}")

    if len(empresas) > args.max_empresas:
        print(f"\n  … y {len(empresas) - args.max_empresas} más")

    if args.dry_run:
        print(f"\n  [DRY RUN] No se envía Telegram.")
        print(f"{sep}\n")
        return

    # Construir y enviar mensaje
    mensaje = construir_mensaje(empresas, args.dias, args.max_empresas)
    resultado = asyncio.run(_enviar_telegram(mensaje))

    print(f"\n  Telegram enviado a: {resultado['enviados']} admin(s)")
    if resultado.get("errores"):
        for err in resultado["errores"]:
            print(f"  ⚠️  Error: {err}")

    print(f"{sep}\n")


if __name__ == "__main__":
    main()
