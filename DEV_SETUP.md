# Entorno de desarrollo local – Hincado ERP

## Opción A: Flask directo (recomendado para desarrollo diario)

```bash
cd interfaz_facturas
./run_dev.sh
```

Esto crea un virtualenv, instala dependencias y arranca Flask en modo debug
con recarga automática. La app queda en **http://localhost:8000**.

Si prefieres hacerlo paso a paso:

```bash
cd interfaz_facturas
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edita con tus valores
mkdir -p data/logs data/backups data/subidas
python backend.py
```

## Opcion B: Docker local (para probar que el contenedor funciona)

```bash
# Desde la raiz del repo
docker compose -f docker-compose.dev.yml up --build
```

Construye la imagen desde tu codigo local (no tira de GHCR) y monta
los archivos para que los cambios se reflejen sin rebuild.

## Base de datos

SQLite se crea automaticamente al arrancar (`data/gestion.db`).
Cada modulo ejecuta `CREATE TABLE IF NOT EXISTS` al inicio, asi que
no necesitas migraciones manuales.

Para empezar con datos limpios, borra `data/gestion.db` y reinicia.

## Flujo de trabajo

```
1. Desarrollar en rama feature/*
   git checkout -b feature/mi-cambio

2. Probar en local
   ./run_dev.sh  (o docker compose dev)

3. Commit + push
   git add ...
   git commit -m "descripcion"
   git push origin feature/mi-cambio

4. Pull request a master
   (revision de Javier o merge directo)

5. Deploy automatico
   Push a master → GitHub Actions → build imagen → deploy a VPS
```

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

| Variable | Obligatoria | Descripcion |
|----------|:-----------:|-------------|
| ADMIN_USER | No | Usuario login (default: admin) |
| ADMIN_PASSWORD | No | Password login (default: admin) |
| SECRET_KEY | Si (prod) | Clave secreta Flask |
| OPENAI_API_KEY | No | Para clasificador de docs CAE |
| OPENROUTESERVICE_API_KEY | No | Para rutas en Transporte |
| MS_TENANT_ID | No | Azure AD para OneDrive sync |
| MS_CLIENT_ID | No | Azure AD app registration |
| MS_CLIENT_SECRET | No | Azure AD secret |

## Notas

- El `.gitignore` ya excluye `.env`, `venv/`, `*.db` y `data/`
- En local Flask corre en modo debug (auto-reload). En prod usa Gunicorn
- La base de datos local es independiente de produccion
