"""
gmail_oauth_setup.py — Setup ONE-TIME del OAuth2 para Gmail CRM.

Ejecutar UNA VEZ desde el Mac donde está el ERP:
  cd hincado-erp
  python3 scripts/gmail_oauth_setup.py

El script:
  1. Abre el navegador con la pantalla de consentimiento de Google.
  2. Tú inicias sesión con direccion@hincadodirecto.com.
  3. Google redirige a localhost con el código de autorización.
  4. El script intercambia el código por access_token + refresh_token.
  5. Guarda GMAIL_REFRESH_TOKEN en tu archivo .env automáticamente.

Requisitos previos:
  - pip install google-auth-oauthlib google-auth google-api-python-client
  - GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET ya deben estar en .env
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BASE_DIR / ".env"

# Cargar .env para leer CLIENT_ID y CLIENT_SECRET
try:
    from dotenv import load_dotenv, set_key
    load_dotenv(ENV_FILE)
except ImportError:
    sys.exit("ERROR: Instala python-dotenv → pip install python-dotenv")

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    sys.exit(
        "ERROR: Instala las librerías Google:\n"
        "  pip install google-auth-oauthlib google-auth google-api-python-client"
    )

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    sys.exit(
        "ERROR: GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET deben estar en .env\n"
        "Añádelos antes de ejecutar este script."
    )

print("\n─── Gmail OAuth Setup — Hincado ERP CRM ───────────────────────────────")
print(f"CLIENT_ID:  {CLIENT_ID[:20]}...")
print(f"Cuenta:     {os.getenv('GMAIL_ACCOUNT', 'direccion@hincadodirecto.com')}")
print("\nSe abrirá el navegador. Inicia sesión con la cuenta de Gmail de Hincado.")
print("Si aparece aviso de 'App no verificada', haz clic en 'Avanzado → Continuar'.")
print("(Es normal porque la app es interna / en desarrollo.)\n")

input("Pulsa ENTER para abrir el navegador...")

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)

# run_local_server abre el navegador y maneja el callback automáticamente
try:
    creds = flow.run_local_server(
        port=0,
        prompt="consent",
        authorization_prompt_message="",
    )
except Exception as exc:
    # Fallback: flujo manual si el servidor local falla
    print(f"\nFlujo local falló ({exc}), usando flujo manual.")
    auth_url, _ = flow.authorization_url(prompt="consent")
    print(f"\nAbre esta URL en el navegador:\n  {auth_url}")
    code = input("\nPega el código de autorización aquí: ").strip()
    flow.fetch_token(code=code)
    creds = flow.credentials

refresh_token = creds.refresh_token
if not refresh_token:
    sys.exit("ERROR: No se obtuvo refresh_token. Asegúrate de usar prompt='consent'.")

# Guardar en .env
try:
    set_key(str(ENV_FILE), "GMAIL_REFRESH_TOKEN", refresh_token)
    print(f"\n✓ GMAIL_REFRESH_TOKEN guardado en {ENV_FILE}")
except Exception as exc:
    print(f"\nNo se pudo escribir en .env: {exc}")
    print(f"Añade manualmente esta línea a .env:")
    print(f"  GMAIL_REFRESH_TOKEN={refresh_token}")

print("\n✓ Setup completado. Reinicia el ERP para que los cambios tengan efecto.")
print("  Luego verás el botón 'Sync Gmail' en la ficha de cada empresa del CRM.\n")
