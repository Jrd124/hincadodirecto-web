#!/usr/bin/env python3
"""Test del recordatorio semanal de maquinaria — envía a un chat_id de prueba.

Uso:
    cd interfaz_facturas
    python scripts/test_recordatorio_viernes.py

Envía el mensaje que recibiría un operario con máquinas asignadas.
Si el chat_id de test no tiene máquinas, genera un mensaje de ejemplo con datos reales.
"""
import os
import sys
import asyncio

# Asegurar que estamos en el directorio correcto
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# ─── Config ───
TEST_CHAT_ID = 1685146479  # Sergio @s_cask
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

if not BOT_TOKEN:
    print("ERROR: TELEGRAM_BOT_TOKEN no está configurado en .env")
    sys.exit(1)


async def main():
    from telegram import Bot
    from core.maquinaria_db import (
        listar_maquinas, listar_incidencias,
        _calcular_revisiones_pendientes, get_telegram_id_para_maquina,
        init_maquinaria_db,
    )
    from core.db import conectar as _conectar

    init_maquinaria_db()
    bot = Bot(token=BOT_TOKEN)

    maquinas = [m for m in listar_maquinas() if m.get("activa")]
    if not maquinas:
        print("No hay máquinas activas en la BD.")
        return

    # En local no existe bot_telegram_usuarios, así que usamos las primeras
    # máquinas activas directamente como ejemplo.
    mis_maquinas = []
    try:
        for m in maquinas:
            tid = get_telegram_id_para_maquina(m["id"])
            if tid == TEST_CHAT_ID:
                mis_maquinas.append(m)
    except Exception:
        pass  # tabla no existe en local — OK

    if not mis_maquinas:
        print(f"Usando las primeras 3 máquinas activas como ejemplo.\n")
        mis_maquinas = maquinas[:3]

    # Construir mensaje en HTML (más robusto que Markdown para Telegram)
    from html import escape as _h

    texto = "🔧 <b>Recordatorio semanal de maquinaria</b>\n\n"
    texto += (
        "Es viernes — recuerda completar el chequeo semanal "
        "de tus máquinas antes de terminar la jornada.\n"
    )

    with _conectar() as conn:
        for m in mis_maquinas:
            nombre = _h(m.get("nombre") or m.get("identificador_interno") or "?")
            horo = m.get("horometro_actual") or 0
            texto += f"\n━━━ <b>{nombre}</b> ({horo:,.0f}h) ━━━\n"

            # Incidencias abiertas
            try:
                incs = listar_incidencias(maquina_id=m["id"])
                abiertas = [i for i in incs if i.get("estado") not in ("cerrada", "rechazada")]
            except Exception:
                abiertas = []

            if abiertas:
                texto += f"⚠️ {len(abiertas)} incidencia(s) abierta(s):\n"
                for inc in abiertas[:5]:
                    sev = _h(inc.get("severidad", "?"))
                    desc = _h((inc.get("descripcion") or "")[:60])
                    estado = _h(inc.get("estado", "?"))
                    texto += f"  • [{sev}] {desc} <i>({estado})</i>\n"
                if len(abiertas) > 5:
                    texto += f"  ... y {len(abiertas) - 5} más\n"
            else:
                texto += "✅ Sin incidencias abiertas\n"

            # Próxima revisión
            try:
                revs = _calcular_revisiones_pendientes(conn, m["id"], horo)
            except Exception:
                revs = []

            if revs:
                rev = revs[0]
                hito = rev.get("proximo_hito", 0)
                tipo = _h(rev.get("tipo", "?"))
                faltan = hito - horo
                if faltan <= 0:
                    texto += f"🔴 Revisión <b>{tipo}</b> VENCIDA (debía a {hito:,.0f}h)\n"
                else:
                    texto += f"🔜 Próxima revisión: <b>{tipo}</b> a {hito:,.0f}h (faltan {faltan:,.0f}h)\n"
                if len(revs) > 1:
                    texto += f"   <i>{len(revs)} revisiones pendientes en total</i>\n"
            else:
                texto += "✅ Revisiones al día\n"

    # Mostrar en consola
    print("=" * 60)
    print("MENSAJE QUE SE ENVIARÁ:")
    print("=" * 60)
    print(texto)
    print("=" * 60)

    # Enviar
    try:
        await bot.send_message(
            chat_id=TEST_CHAT_ID,
            text=texto,
            parse_mode="HTML",
        )
        print(f"\n✅ Mensaje enviado a {TEST_CHAT_ID}")
    except Exception as e:
        print(f"\n❌ Error enviando: {e}")


if __name__ == "__main__":
    asyncio.run(main())
