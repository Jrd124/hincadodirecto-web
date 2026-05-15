"""Genera/refresca el GMAIL_REFRESH_TOKEN con los scopes necesarios.

Uso:
    cd interfaz_facturas
    ./venv/bin/python scripts/gmail_oauth_setup.py

Requisitos previos:
    - Variables GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en .env, obtenidas en
      Google Cloud Console → APIs & Services → Credentials → OAuth client ID
      tipo "Desktop app". Asegúrate de que la URI de redirección incluye
      http://localhost (sin puerto).
    - Cuenta de Google con Gmail habilitado y permiso para autorizar la app.

Qué hace:
    1. Abre tu navegador con el consentimiento OAuth de Google.
    2. Pide acceso a tu cuenta con los scopes:
         - gmail.readonly  (lectura de hilos para sincronizar al CRM)
         - gmail.compose   (crear/leer/editar/borrar borradores propios)
    3. Recibe el refresh_token y lo imprime.
    4. Tú lo copias a interfaz_facturas/.env como GMAIL_REFRESH_TOKEN=…

Si ya tenías refresh_token con scope solo readonly y quieres añadir compose,
DEBES revocar el access viejo en https://myaccount.google.com/permissions y
volver a correr este script: Google solo emite el refresh_token la primera
vez que se aprueban los scopes; si ya estaba aprobado un subset, el flow no
devuelve refresh_token.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Permitir ejecutar desde la raíz del proyecto o desde scripts/
_THIS = Path(__file__).resolve()
_BASE = _THIS.parents[1]
if str(_BASE) not in sys.path:
    sys.path.insert(0, str(_BASE))

# Carga .env si existe
try:
    from dotenv import load_dotenv
    load_dotenv(_BASE / ".env")
except ImportError:  # pragma: no cover
    pass

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    sys.stderr.write(
        "ERROR: falta google_auth_oauthlib. Instala con:\n"
        "  pip install google-auth-oauthlib\n"
    )
    sys.exit(2)

# Mismos scopes que core/gmail_sync.py — debe mantenerse en sync.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]


def main() -> int:
    client_id = os.getenv("GMAIL_CLIENT_ID", "").strip()
    client_secret = os.getenv("GMAIL_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        sys.stderr.write(
            "ERROR: GMAIL_CLIENT_ID y/o GMAIL_CLIENT_SECRET no están en el .env.\n"
            "Configúralos antes de ejecutar este script.\n"
        )
        return 2

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }

    print("→ Iniciando flow OAuth con scopes:")
    for s in SCOPES:
        print(f"   • {s}")
    print("  (se abrirá tu navegador)\n")

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    # access_type=offline + prompt=consent fuerza a Google a devolver
    # refresh_token incluso si ya habías autorizado la app antes.
    creds = flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
        open_browser=True,
    )

    if not creds.refresh_token:
        sys.stderr.write(
            "\nERROR: Google no devolvió refresh_token.\n"
            "Causa típica: la app ya tenía consentimiento previo. Soluciones:\n"
            "  1. Revoca el acceso en https://myaccount.google.com/permissions\n"
            "  2. Vuelve a ejecutar este script.\n"
        )
        return 3

    granted = list(creds.scopes or [])
    print("\n✅ Autorización completada.")
    print(f"   Cuenta autorizada: (la que has elegido en el navegador)")
    print(f"   Scopes concedidos:")
    for s in granted:
        print(f"     • {s}")
    print("\n--- COPIA ESTA LÍNEA EN TU .env ---")
    print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
    print("------------------------------------\n")
    print("Después reinicia Flask para que cargue el nuevo token.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
