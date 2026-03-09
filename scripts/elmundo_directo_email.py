#!/usr/bin/env python3
"""
Monitor de actualizaciones del directo de El Mundo (Israel/Irán).
Comprueba la página cada vez que se ejecuta y envía un email con las
actualizaciones nuevas desde la última ejecución.
"""

import os
import re
import json
import hashlib
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# Configuración
URL_DIRECTO = "https://www.elmundo.es/internacional/2026/03/01/69a3db15fb7b94bd83e2bc65-directo.html"
STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "elmundo_directo_state.json"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def load_dotenv():
    """Carga variables desde .env si existe."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def fetch_page(url: str) -> str:
    """Descarga el HTML de la página."""
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


def parse_updates(html: str) -> list:
    """
    Extrae las entradas del directo (hora, título, cuerpo).
    En el HTML la hora aparece como "19:43" pegado al título, sin salto de línea.
    """
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    # Normalizar: a veces "19:43Título" sin espacio
    text = re.sub(r"(\d{1,2}:\d{2})([A-Za-zÀ-ÿ])", r"\1 \2", text)

    # Encontrar el bloque del directo (después de "Actualizar narración" o similar)
    time_pattern = re.compile(r"(\d{1,2}:\d{2})\s*(.+?)(?=\s*\d{1,2}:\d{2}\s*|\s*Compartir en X|$)", re.DOTALL)
    blocks = list(time_pattern.finditer(text))

    # Si no hay coincidencias, puede que el contenido esté en líneas separadas
    if not blocks:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        time_re = re.compile(r"^\d{1,2}:\d{2}$")
        updates = []
        i = 0
        while i < len(lines):
            if time_re.match(lines[i]):
                time_str = lines[i]
                i += 1
                if i >= len(lines):
                    break
                title = lines[i]
                if "compartir" in title.lower():
                    i += 1
                    continue
                i += 1
                body_parts = []
                while i < len(lines) and not time_re.match(lines[i]) and "compartir" not in lines[i].lower():
                    body_parts.append(lines[i])
                    i += 1
                body = "\n".join(body_parts).strip()
                if title or body:
                    raw = f"{time_str}\n{title}\n{body}"
                    uid = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
                    updates.append({"time": time_str, "title": title, "body": body, "id": uid})
                continue
            i += 1
        return updates

    updates = []
    for m in blocks:
        time_str = m.group(1)
        rest = m.group(2).strip()
        # Primera línea o primera frase = título; el resto = cuerpo
        rest_lines = [l.strip() for l in rest.splitlines() if l.strip()]
        if not rest_lines:
            continue
        # Quitar "Compartir en X" si está al final
        if rest_lines and "compartir" in rest_lines[-1].lower():
            rest_lines = rest_lines[:-1]
        if not rest_lines:
            continue
        title = rest_lines[0]
        body = "\n".join(rest_lines[1:]).strip()
        # Evitar entradas que sean solo navegación o publicidad
        if len(title) < 10 and not body:
            continue
        raw = f"{time_str}\n{title}\n{body}"
        uid = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        updates.append({"time": time_str, "title": title, "body": body, "id": uid})

    return updates


def load_state() -> set:
    """Carga los IDs de actualizaciones ya vistas."""
    if not STATE_FILE.exists():
        return set()
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return set(data.get("seen_ids", []))
    except (json.JSONDecodeError, OSError):
        return set()


def save_state(seen_ids: set) -> None:
    """Guarda el estado para la próxima ejecución."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps({"seen_ids": list(seen_ids)}, indent=2),
        encoding="utf-8",
    )


def get_email_config():
    """Obtiene configuración de email desde variables de entorno o .env."""
    load_dotenv()
    user = os.environ.get("EMAIL_USER") or os.environ.get("ELMUNDO_EMAIL_USER")
    password = os.environ.get("EMAIL_APP_PASSWORD") or os.environ.get("EMAIL_PASSWORD") or os.environ.get("ELMUNDO_EMAIL_APP_PASSWORD")
    to_email = os.environ.get("ELMUNDO_TO_EMAIL") or os.environ.get("EMAIL_TO") or user
    return user, password, to_email


def send_email(new_updates: list, to_email: str) -> None:
    """Envía un correo con las nuevas actualizaciones."""
    user, password, dest = get_email_config()
    dest = dest or to_email
    if not user or not password:
        print("ERROR: Configura EMAIL_USER y EMAIL_APP_PASSWORD (o ELMUNDO_*) en .env")
        return

    subject = f"[El Mundo directo] {len(new_updates)} nueva(s) actualización(es) - Israel/Irán"
    parts = []
    for u in new_updates:
        parts.append(f"--- {u['time']} ---\n{u['title']}\n\n{u['body']}\n")
    body_text = "\n".join(parts)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = dest
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(user, password)
            server.sendmail(user, dest, msg.as_string())
        print(f"Email enviado a {dest} con {len(new_updates)} actualización(es).")
    except smtplib.SMTPAuthenticationError:
        print("ERROR: Fallo de autenticación. Usa una contraseña de aplicación de Gmail.")
    except Exception as e:
        print(f"ERROR al enviar email: {e}")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Monitor directo El Mundo (Israel/Irán) y envía nuevas actualizaciones por email.")
    parser.add_argument("--solo-guardar-estado", action="store_true", help="Solo descarga y guarda el estado actual sin enviar email (útil la primera vez).")
    args = parser.parse_args()

    load_dotenv()
    to_email = os.environ.get("ELMUNDO_TO_EMAIL") or os.environ.get("EMAIL_TO") or os.environ.get("EMAIL_USER")

    print("Descargando página...")
    try:
        html = fetch_page(URL_DIRECTO)
    except requests.RequestException as e:
        print(f"ERROR al descargar: {e}")
        return

    updates = parse_updates(html)
    if not updates:
        print("No se encontraron actualizaciones en la página (puede que haya cambiado la estructura).")
        return

    seen = load_state()
    new_ones = [u for u in updates if u["id"] not in seen]
    new_ids = {u["id"] for u in new_ones}

    if args.solo_guardar_estado:
        seen.update({u["id"] for u in updates})
        save_state(seen)
        print(f"Estado guardado. {len(updates)} entradas registradas. En la próxima ejecución solo se enviarán las nuevas.")
        return

    if not new_ones:
        print("No hay actualizaciones nuevas.")
        seen.update({u["id"] for u in updates})
        save_state(seen)
        return

    print(f"Hay {len(new_ones)} actualización(es) nueva(s). Enviando email...")
    send_email(new_ones, to_email or "")
    save_state(seen | new_ids)


if __name__ == "__main__":
    main()
