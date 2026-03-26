# RUNBOOK — HD | ERP

## Arrancar

```bash
cd /home/deploy/apps/erp
docker compose -f docker-compose.prod.yml up -d
```

## Parar

```bash
docker compose -f docker-compose.prod.yml down
```

## Ver logs

```bash
# App
docker logs -f hincado-erp --tail 100

# Caddy (proxy)
docker logs -f hincado-caddy --tail 100
```

## Actualizar codigo

Push a `master` dispara el deploy automatico via GitHub Actions.

Deploy manual en el VPS:

```bash
cd /home/deploy/apps/erp
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Backup manual

```bash
./scripts/backup-db.sh
```

## Restaurar backup

```bash
# Parar la app
docker compose -f docker-compose.prod.yml down

# Descomprimir backup
gunzip /home/deploy/backups/erp/gestion_FECHA.db.gz

# Copiar al volumen
docker cp /home/deploy/backups/erp/gestion_FECHA.db hincado-erp:/app/data/gestion.db

# Arrancar
docker compose -f docker-compose.prod.yml up -d
```

## Verificar estado

```bash
# Contenedores corriendo
docker ps

# Health check
curl -s http://localhost:8000/api/health | python3 -m json.tool

# Espacio en disco
df -h
```

## Rollback

```bash
cd /home/deploy/apps/erp
# Usar imagen de un commit anterior
export IMAGE=ghcr.io/jrd124/hincado-erp:SHA_DEL_COMMIT
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## GitHub Secrets necesarios

| Secret | Descripcion |
|--------|-------------|
| PROD_HOST | IP del VPS |
| PROD_SSH_USER | Usuario SSH (deploy) |
| PROD_SSH_KEY | Clave privada SSH |
| PROD_APP_DIR | Ruta en el VPS (/home/deploy/apps/erp) |
