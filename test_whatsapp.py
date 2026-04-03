#!/usr/bin/env python3
"""
Test de WhatsApp — Hincado Directo ERP
Envía un mensaje de prueba a tu número vía Twilio Sandbox.

Ejecutar desde la raíz del proyecto:
    python test_whatsapp.py
"""
import os, sys, urllib.request, urllib.parse, urllib.error, base64, json
from pathlib import Path

# Cargar .env manualmente si existe
env_path = Path(__file__).parent / "interfaz_facturas" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "")
FROM        = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TO          = "whatsapp:+34641438126"   # número de Sergio

if not ACCOUNT_SID or not AUTH_TOKEN:
    sys.exit("❌ TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no configurados en .env")

print(f"Enviando WhatsApp de prueba a {TO} ...")

msg = (
    "🔧 *Mantenimiento pendiente - TEST*\n\n"
    "*Máquina:* Antonella (HD1000-02)\n"
    "*Tarea:* Revisión combinada 500h + 1000h + 2000h\n"
    "*Horómetro actual:* 4791h (toca a las 4000h)\n\n"
    "✅ Sistema de notificaciones Hincado Directo activo y funcionando.\n"
    "Si ves este mensaje, el canal WhatsApp está operativo."
)

url  = f"https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json"
data = urllib.parse.urlencode({"From": FROM, "To": TO, "Body": msg}).encode()
creds = base64.b64encode(f"{ACCOUNT_SID}:{AUTH_TOKEN}".encode()).decode()

req = urllib.request.Request(url, data=data, method="POST")
req.add_header("Authorization", f"Basic {creds}")
req.add_header("Content-Type", "application/x-www-form-urlencoded")

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    print(f"✅  ENVIADO — SID: {result.get('sid')}  Status: {result.get('status')}")
    print(f"    Revisa WhatsApp en tu móvil.")
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    code = body.get("code", "")
    detail = body.get("message", "")
    print(f"❌  Error HTTP {e.code} (Twilio code {code}): {detail}")
    if code == 63007:
        print("    → El número de destino no está en el Sandbox.")
        print("      Envía 'join blue-spent' al +1 415 523 8886 desde WhatsApp.")
    elif code == 20003:
        print("    → Credenciales inválidas. Revisa ACCOUNT_SID y AUTH_TOKEN en .env")
