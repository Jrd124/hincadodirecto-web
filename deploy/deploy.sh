#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# deploy.sh — Deploy del ERP a producción
#
# Ejecutar desde tu Mac después de hacer git push:
#   ./deploy/deploy.sh
#
# Lo que hace:
#   1. Se conecta al servidor por SSH
#   2. Hace git pull para traer los últimos cambios
#   3. Verifica que el .env existe
#   4. Rebuilda la imagen Docker con el código nuevo
#   5. Reinicia el contenedor (sin perder datos)
#   6. Verifica que el health check responde
#
# REQUISITO: haber hecho git push ANTES de ejecutar esto.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SERVER="deploy@46.225.27.219"
REMOTE_DIR="/opt/hincado-erp"

echo "========================================"
echo " Hincado ERP — Deploy a producción"
echo " Servidor: $SERVER"
echo "========================================"

# ── 1. Git pull en el servidor ───────────────────────────────────────
echo ""
echo "[1/4] Descargando últimos cambios (git pull)..."
ssh "$SERVER" "cd $REMOTE_DIR && git pull origin master"

# ── 2. Verificar que .env existe ─────────────────────────────────────
echo ""
echo "[2/4] Verificando .env..."
ssh "$SERVER" "
  if [ ! -f $REMOTE_DIR/interfaz_facturas/.env ]; then
    echo '  ERROR: No existe interfaz_facturas/.env'
    echo '  Copia el .env de respaldo:'
    echo '    cp /home/deploy/apps/erp/.env $REMOTE_DIR/interfaz_facturas/.env'
    echo '    echo \"\" >> $REMOTE_DIR/interfaz_facturas/.env'
    echo '    cat /home/deploy/apps/erp/interfaz_facturas/.env >> $REMOTE_DIR/interfaz_facturas/.env'
    exit 1
  fi
  echo '  .env OK'
"

# ── 3. Rebuild y reiniciar ───────────────────────────────────────────
echo ""
echo "[3/4] Rebuilding imagen Docker y reiniciando..."
ssh "$SERVER" "cd $REMOTE_DIR && docker compose up -d --build"

# ── 4. Health check ──────────────────────────────────────────────────
echo ""
echo "[4/4] Esperando que el ERP arranque..."
sleep 5
ssh "$SERVER" "docker exec hincado-erp python -c \"import urllib.request; r = urllib.request.urlopen('http://localhost:8000/api/health'); print('  ' + r.read().decode())\"" \
  && echo "  Health check OK" \
  || echo "  AVISO: Health check falló. Revisa logs con: ssh $SERVER 'docker compose -f $REMOTE_DIR/docker-compose.yml logs -f erp'"

echo ""
echo "========================================"
echo " Deploy completado"
echo " URL: https://erp.hincadodirecto.com"
echo "========================================"
echo ""
echo "Comandos útiles:"
echo "  Ver logs:       ssh $SERVER 'cd $REMOTE_DIR && docker compose logs -f erp'"
echo "  Reiniciar:      ssh $SERVER 'cd $REMOTE_DIR && docker compose restart erp'"
echo "  Estado:         ssh $SERVER 'docker ps | grep hincado'"
