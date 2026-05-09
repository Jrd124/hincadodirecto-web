# RUNBOOK — HD | ERP

## Arrancar

```bash
cd /opt/hincado-erp
docker compose up -d --build
```

## Parar

```bash
docker compose down
```

## Ver logs

```bash
# App
docker logs -f hincado-erp --tail 100

# Caddy (proxy)
docker logs -f hincado-caddy --tail 100
```

## Actualizar codigo

Push a `master` dispara el deploy automatico via GitHub Actions
(`.github/workflows/deploy-prod.yml`): SSH al VPS, `git pull`, rebuild
local con `docker compose up -d --build`.

Deploy manual en el VPS:

```bash
cd /opt/hincado-erp
git pull origin master
docker compose up -d --build
```

## Backup manual

```bash
./scripts/backup-db.sh
```

## Restaurar backup

```bash
# Parar la app
docker compose down

# Descomprimir backup
gunzip /home/deploy/backups/erp/gestion_FECHA.db.gz

# Copiar al volumen
docker cp /home/deploy/backups/erp/gestion_FECHA.db hincado-erp:/app/data/gestion.db

# Arrancar
docker compose up -d --build
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
cd /opt/hincado-erp
# Volver a un commit anterior y rebuildar
git checkout SHA_DEL_COMMIT
docker compose up -d --build
```

## GitHub Secrets necesarios

| Secret | Descripcion |
|--------|-------------|
| DEPLOY_SSH_KEY | Clave privada SSH del usuario `deploy@46.225.27.219` |
