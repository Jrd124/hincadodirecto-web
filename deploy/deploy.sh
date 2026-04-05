#!/bin/bash
# deploy.sh — Sube el código al servidor y reinicia el ERP
# Ejecutar desde tu Mac cada vez que quieras publicar cambios.
#
# Uso:
#   chmod +x deploy/deploy.sh
#   ./deploy/deploy.sh
#
# Primera vez (con datos):
#   ./deploy/deploy.sh --con-datos
#
set -euo pipefail

SERVER="root@46.225.27.219"
REMOTE_DIR="/opt/hincado-erp"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CON_DATOS=false

for arg in "$@"; do
  [[ "$arg" == "--con-datos" ]] && CON_DATOS=true
done

echo "========================================"
echo " Hincado ERP — Deploy a producción"
echo " Servidor: $SERVER"
echo "========================================"

# ── 1. Subir código con rsync ─────────────────────────────────────────────────
echo "[1/5] Sincronizando código..."
rsync -avz --delete \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='data/' \
    --exclude='*.log' \
    --exclude='.env' \
    "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

# ── 2. Subir .env de producción ───────────────────────────────────────────────
echo "[2/5] Subiendo .env..."
if [ -f "$LOCAL_DIR/interfaz_facturas/.env.production" ]; then
    scp "$LOCAL_DIR/interfaz_facturas/.env.production" \
        "$SERVER:$REMOTE_DIR/interfaz_facturas/.env"
else
    echo "  ⚠️  No existe .env.production — asegúrate de crear uno (ver instrucciones abajo)"
    echo "  Por ahora se mantiene el .env existente en el servidor"
fi

# ── 3. Subir base de datos (solo primera vez o --con-datos) ───────────────────
if [ "$CON_DATOS" = true ]; then
    echo "[3/5] Subiendo base de datos con datos importados..."
    scp "$LOCAL_DIR/data/gestion.db" "$SERVER:$REMOTE_DIR/data/gestion.db"
    ssh "$SERVER" "chown hincado:hincado $REMOTE_DIR/data/gestion.db"
    echo "  ✅ Base de datos subida (226 empresas, 76 contactos)"
else
    echo "[3/5] Saltando base de datos (usa --con-datos para incluirla)"
fi

# ── 4. Instalar/actualizar dependencias en el servidor ────────────────────────
echo "[4/5] Actualizando dependencias Python..."
ssh "$SERVER" "
    cd $REMOTE_DIR/interfaz_facturas
    python3 -m venv .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt
    chown -R hincado:hincado $REMOTE_DIR
"

# ── 5. Reiniciar servicio ─────────────────────────────────────────────────────
echo "[5/5] Reiniciando ERP..."
ssh "$SERVER" "systemctl restart hincado-erp && systemctl status hincado-erp --no-pager -l"

echo ""
echo "========================================"
echo " ✅ Deploy completado"
echo " URL: https://erp.hincadodirecto.com"
echo "========================================"
echo ""
echo "Comandos útiles en el servidor:"
echo "  Ver logs en tiempo real:  ssh $SERVER 'journalctl -u hincado-erp -f'"
echo "  Estado del servicio:      ssh $SERVER 'systemctl status hincado-erp'"
echo "  Reiniciar manualmente:    ssh $SERVER 'systemctl restart hincado-erp'"
