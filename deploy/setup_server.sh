#!/bin/bash
# setup_server.sh — Configuración INICIAL del VPS (ejecutar UNA SOLA VEZ como root)
#
# Uso:
#   ssh root@46.225.27.219 'bash -s' < deploy/setup_server.sh
#
set -euo pipefail

DOMAIN="erp.hincadodirecto.com"
APP_DIR="/opt/hincado-erp"
APP_USER="hincado"

echo "========================================"
echo " Hincado ERP — Setup inicial del servidor"
echo "========================================"

# ── 1. Actualizar sistema ─────────────────────────────────────────────────────
echo "[1/9] Actualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Instalar dependencias del sistema ──────────────────────────────────────
echo "[2/9] Instalando paquetes..."
apt-get install -y -qq \
    python3 python3-pip python3-venv \
    nginx certbot python3-certbot-nginx \
    git curl wget sqlite3 \
    tesseract-ocr tesseract-ocr-spa \
    libgl1 libglib2.0-0

# ── 3. Crear usuario de la aplicación ─────────────────────────────────────────
echo "[3/9] Creando usuario '$APP_USER'..."
id "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash "$APP_USER"

# ── 4. Crear directorio de la aplicación ─────────────────────────────────────
echo "[4/9] Creando directorios..."
mkdir -p "$APP_DIR"
mkdir -p /var/log/hincado-erp
chown "$APP_USER:$APP_USER" "$APP_DIR"
chown "$APP_USER:$APP_USER" /var/log/hincado-erp

# ── 5. Instalar servicio systemd ──────────────────────────────────────────────
echo "[5/9] Instalando servicio systemd..."
cp /tmp/hincado-erp.service /etc/systemd/system/hincado-erp.service
systemctl daemon-reload
systemctl enable hincado-erp

# ── 6. Configurar nginx ───────────────────────────────────────────────────────
echo "[6/9] Configurando nginx..."
cp /tmp/nginx-hincado.conf /etc/nginx/sites-available/hincado-erp
ln -sf /etc/nginx/sites-available/hincado-erp /etc/nginx/sites-enabled/hincado-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 7. SSL con Let's Encrypt ──────────────────────────────────────────────────
echo "[7/9] Obteniendo certificado SSL para $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --email sergio.garcia@nutriacapital.com --redirect || \
    echo "  ⚠️  SSL falló — asegúrate de que el DNS apunta a este servidor y reintenta con:"
    echo "  certbot --nginx -d $DOMAIN"

# ── 8. Firewall ───────────────────────────────────────────────────────────────
echo "[8/9] Configurando firewall (ufw)..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'

# ── 9. Renovación automática SSL ─────────────────────────────────────────────
echo "[9/9] Configurando renovación SSL automática..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "========================================"
echo " ✅ Setup completado"
echo " Siguiente paso: ejecutar deploy.sh desde tu Mac"
echo "========================================"
