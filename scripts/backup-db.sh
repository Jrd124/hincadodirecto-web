#!/bin/bash
# Backup de la base de datos del ERP
# Ejecutar via cron: 0 3 * * * /home/deploy/apps/erp/scripts/backup-db.sh

BACKUP_DIR="/home/deploy/backups/erp"
CONTAINER="hincado-erp"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

# Copiar BD desde el contenedor
docker cp "$CONTAINER:/app/data/gestion.db" "$BACKUP_DIR/gestion_${DATE}.db"

# Comprimir
gzip "$BACKUP_DIR/gestion_${DATE}.db"

# Rotar backups antiguos
find "$BACKUP_DIR" -name "gestion_*.db.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup completado: gestion_${DATE}.db.gz"

# Subir a OneDrive/SharePoint
if [ -f "$BACKUP_DIR/gestion_${DATE}.db.gz" ]; then
    # Cargar variables de entorno
    if [ -f "/home/deploy/apps/erp/.env" ]; then
        set -a
        . /home/deploy/apps/erp/.env
        set +a
    fi

    # Copiar backup al contenedor
    docker cp "$BACKUP_DIR/gestion_${DATE}.db.gz" hincado-erp:/tmp/backup_latest.gz 2>/dev/null

    # Ejecutar subida inline dentro del contenedor
    docker exec hincado-erp python3 -c "
import sys, os, requests
filepath = '/tmp/backup_latest.gz'
filename = 'gestion_${DATE}.db.gz'
client_id = os.environ.get('MICROSOFT_CLIENT_ID', '')
tenant_id = os.environ.get('MICROSOFT_TENANT_ID', '')
client_secret = os.environ.get('MICROSOFT_CLIENT_SECRET', '')
site_path = os.environ.get('SHAREPOINT_SITE', '')
if not client_id:
    print('OneDrive no configurado, skip'); sys.exit(0)
try:
    tr = requests.post(f'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token', data={'grant_type':'client_credentials','client_id':client_id,'client_secret':client_secret,'scope':'https://graph.microsoft.com/.default'})
    token = tr.json()['access_token']
    h = {'Authorization': f'Bearer {token}'}
    sr = requests.get(f'https://graph.microsoft.com/v1.0/sites/{site_path}', headers=h)
    site_id = sr.json()['id']
    dr = requests.get(f'https://graph.microsoft.com/v1.0/sites/{site_id}/drives', headers=h)
    drive_id = dr.json()['value'][0]['id']
    root = os.environ.get('SHAREPOINT_ROOT_FOLDER', 'ERP Hincado Directo')
    with open(filepath, 'rb') as f: content = f.read()
    h['Content-Type'] = 'application/octet-stream'
    r = requests.put(f'https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{root}/Backups/{filename}:/content', headers=h, data=content)
    print(f'Backup subido a OneDrive: {r.status_code}' if r.status_code in (200,201) else f'Error OneDrive: {r.status_code} {r.text[:200]}')
except Exception as e:
    print(f'Error subiendo a OneDrive: {e}')
" 2>&1

    # Limpiar temporal
    docker exec hincado-erp rm -f /tmp/backup_latest.gz 2>/dev/null
fi
