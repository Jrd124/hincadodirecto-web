# Operaciones — Hincado ERP (Producción)

## Datos del servidor

| Campo | Valor |
|---|---|
| IP | 46.225.27.219 |
| Usuario SSH | deploy |
| Dominio | erp.hincadodirecto.com |
| Directorio | /opt/hincado-erp |
| Stack | Docker (ERP + Caddy) |

## Arquitectura

```
Internet → Caddy (HTTPS :443) → ERP (Flask :8000)
              ↑                     ↑
         contenedor            contenedor
        "hincado-caddy"       "hincado-erp"
              ↑                     ↑
         red: erp_web          red: erp_web (alias: "erp")
                                    ↑
                              volumen: erp_erp-data → /app/data/
                                (gestion.db, fotos_maquinaria/, backups/)
```

Caddy busca el backend como `http://erp:8000`. Eso funciona porque ambos
contenedores están en la red `erp_web` y el ERP tiene el alias `erp`.

## Deploy normal (actualizar código)

```bash
# Desde tu Mac, después de git push:
./deploy/deploy.sh

# O manualmente:
ssh deploy@46.225.27.219
cd /opt/hincado-erp
git pull origin master
docker compose up -d --build
```

No hace falta tocar Caddy ni la red — el compose se encarga de todo.

## Reiniciar sin cambiar código

```bash
ssh deploy@46.225.27.219 "cd /opt/hincado-erp && docker compose restart erp"
```

## Ver logs

```bash
# Logs del ERP (últimas 50 líneas + seguir):
ssh deploy@46.225.27.219 "cd /opt/hincado-erp && docker compose logs --tail 50 -f erp"

# Logs de Caddy:
ssh deploy@46.225.27.219 "cd /opt/hincado-erp && docker compose logs --tail 50 -f caddy"
```

## Archivos críticos — NO BORRAR

| Archivo/Recurso | Qué contiene | Qué pasa si se pierde |
|---|---|---|
| Volumen `erp_erp-data` | BD (gestion.db), fotos, backups | **Se pierden TODOS los datos** |
| Volumen `erp_caddy-data` | Certificados HTTPS | Caddy los regenera solo (Let's Encrypt) |
| `interfaz_facturas/.env` | Claves API, tokens, credenciales | La app no arranca |

## .env

El `.env` debe estar en `/opt/hincado-erp/interfaz_facturas/.env` en el servidor.
Contiene: SECRET_KEY, credenciales admin, API keys (OpenAI, Telegram, Gmail, etc.)

Respaldo en: `/home/deploy/apps/erp/.env` (parcial, falta Telegram)
y `/home/deploy/apps/erp/interfaz_facturas/.env` (solo Telegram)

Si se pierde, combinar ambos:
```bash
cp /home/deploy/apps/erp/.env /opt/hincado-erp/interfaz_facturas/.env
cat /home/deploy/apps/erp/interfaz_facturas/.env >> /opt/hincado-erp/interfaz_facturas/.env
```

## Errores conocidos y soluciones

### "env file not found"
El `.env` no está donde el compose lo espera. Ver sección anterior.

### "502 Bad Gateway"
Caddy no llega al ERP. Verificar:
```bash
# 1. El ERP está corriendo?
docker ps | grep hincado-erp

# 2. Están en la misma red?
docker network inspect erp_web | grep -A2 hincado

# 3. Caddy puede resolver "erp"?
docker exec hincado-caddy curl -s http://erp:8000/api/health
```

### "container name already in use"
```bash
docker rm -f hincado-erp
docker compose up -d
```
Esto es seguro — los datos están en el volumen, no en el contenedor.

### "UNIQUE constraint failed: usuarios.username"
Inofensivo. La app intenta crear el usuario admin que ya existe en la BD.
El worker se reinicia y arranca bien.

## Lo que NUNCA hay que hacer

1. **`docker volume rm erp_erp-data`** — borra toda la BD y fotos
2. **`docker compose down -v`** — el flag `-v` borra volúmenes
3. Editar `gestion.db` directamente mientras la app corre
4. Borrar archivos del compose sin verificar qué volúmenes usan

## Archivos obsoletos (se pueden borrar)

- `docker-compose.prod.yml` — versión antigua, no se usa
- `docker-compose.dev.yml` — no se usa en producción
- `deploy/deploy.sh` versión antigua con systemctl (ya actualizado)
