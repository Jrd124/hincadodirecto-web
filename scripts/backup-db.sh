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
