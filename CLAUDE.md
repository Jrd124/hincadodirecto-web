# CLAUDE.md — Hincado Directo ERP

## Proyecto

ERP interno de Hincado Directo S.L. (hincado de pilotes para parques solares). Stack: Python/Flask + SQLite + vanilla HTML/CSS/JS. Bot Telegram integrado. Docker + Caddy en producción.

## Comandos

```bash
# Deploy (automático via GitHub Actions, pero manual si es necesario):
ssh deploy@46.225.27.219 "cd /opt/hincado-erp && git pull origin master && docker compose up -d --build"

# Verificar que el backend arranca sin errores:
cd interfaz_facturas && python3 -c "from backend import app; print('OK')"

# Ver logs del bot:
ssh deploy@46.225.27.219 "docker logs hincado-erp 2>&1 | grep -iE 'telegram|bot|error' | tail -20"

# Verificar un cambio frontend llegó al contenedor:
ssh deploy@46.225.27.219 "docker exec hincado-erp grep -c 'TEXTO_NUEVO' /app/static/js/modules/MODULO.js"
```

## Base de datos

- SQLite en `/app/data/gestion.db` (volumen Docker `erp_erp-data`)
- La BD de desarrollo local tiene datos distintos a producción. Los datos reales solo están en el servidor
- La tabla de máquinas se llama `maquinas` (8 filas). **NO `maquinaria`**. Las tablas `maquinaria_*` son auxiliares (checks, incidencias, etc.)

## Errores frecuentes — QUÉ HACER

### SQL

- COALESCE con campos que pueden ser 0: usar `COALESCE(NULLIF(campo, 0), alternativa, 0)` en vez de `COALESCE(campo, alternativa, 0)`. NULLIF convierte 0 en NULL para que COALESCE lo salte
- Números españoles: usar `_parse_importe_es()` para parsear importes. Sin esto, "1.300,50" se interpreta como 1300.50 o como 1.30050 según el parser

### Frontend — Paneles y navegación

- Al ocultar paneles: siempre `style.display = 'none'` INLINE además de `classList.remove('visible')`. Solo CSS no basta porque algunos paneles no tienen la clase `content-panel`
- Al mostrar un panel: `style.display = ''` (limpiar inline) + `classList.add('visible')`
- Los IDs de panel siguen el patrón `panel-{modulo}` o `panel-operaciones-{submodulo}`
- Gasoil y Alojamiento son sub-paneles de Operaciones (no módulos independientes). Usan `activarSubpanel('operaciones', 'gasoil')`

### Frontend — Cache

- **SIEMPRE bumpar `?v=N`** en index.html tras cambios en cualquier JS. Sin esto el navegador sirve la versión cacheada y el usuario no ve los cambios
- Buscar la línea del script en index.html: `<script src="static/js/modules/gasoil.js?v=11">` → cambiar a `?v=12`

### Bot Telegram

- Solo puede haber UNA instancia del bot corriendo (polling). Si testeas en local, el bot de producción se cae por conflicto
- El bot arranca en background en `start.sh`: `python bot_telegram.py &`
- Si el bot no responde: verificar `docker logs hincado-erp 2>&1 | grep -i error | tail -20` y probar `docker exec hincado-erp python3 -c "import bot_telegram"` para ver errores de import

## Convenciones de código

### Python

- Rutas en `interfaz_facturas/routes/`. Core lógica en `interfaz_facturas/core/`
- Blueprints registrados en `backend.py`. 28 blueprints activos
- Conexión BD: usar `get_conn()` del módulo correspondiente. No hardcodear paths a la BD
- Proyectos activos: `estado IN ('vivo', 'adjudicado')`. Para incluir terminados históricos: añadir `OR (estado = 'terminado' AND fecha_inicio_real <= ? AND fecha_fin_real >= ?)`

### JavaScript

- SPA vanilla: un solo `index.html` con paneles que se muestran/ocultan
- Módulos en `interfaz_facturas/static/js/modules/`. Un fichero por módulo
- `app.js` gestiona sidebar, navegación, `activarModulo()` y `activarSubpanel()`
- Funciones de módulo con prefijo: `_gasoilCargarTransacciones()`, `_proyAbrirModal()`, etc.
- Filtros: card blanco, labels uppercase 10px #888780, dropdowns uniformes con chevron SVG, botones Aplicar/Limpiar a la derecha con `margin-left: auto`
- Números: formato español (punto miles, paréntesis negativos)
- Toast para confirmaciones: `_toast('Mensaje')`

### CSS

- Variables de color en `:root` de `app.css`
- Colores marca: Amarillo `#E8B931`, Gris Oscuro `#2C2C2A`, Verde Acento `#1D9E75`
- Pills de estado: `padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 500`

## Combustible (Moeve/Solred)

- Parser Moeve: detecta automáticamente header en fila 0, 1 o 2
- Excel web de Moeve: cada transacción aparece DUPLICADA (Bill='-' pre-factura + Bill=BA... facturada con concepto renombrado). El parser filtra solo Bill='-'
- Dedup: UNIQUE(proveedor, numero_operacion, fecha_operacion, concepto_raw) + dedup cruzada por fecha+matrícula+litros+importe para detectar duplicados entre Excel web y Excel factura
- Moeve renombra conceptos al facturar: SIN PLOMO→GASOLINA 95, ACEITES/LUBES→LUBES, DIESEL OPTIMA→DIESEL OPTIM, OTRAS COMPRAS→TIENDA

## SS y contabilidad

- Los ficheros SS son CUMULATIVOS: periodo mensual = SS(M) − SS(M−1). Tratarlos como movimientos del periodo es un error grave
- Balance interim: el resultado del periodo debe inyectarse en Patrimonio Neto (grupos 6-7 no aparecen en grupo 1)

## Verificación obligatoria antes de decir "hecho"

1. Ejecutar grep en el fichero modificado para confirmar que el código nuevo está presente. Reportar el count real
2. Si el grep da menos ocurrencias de las esperadas, la tarea NO está hecha. Rehacer antes de commit
3. Commit separado por tarea cuando hay múltiples tareas en un prompt
4. Bumpar `?v=N` de los JS modificados en index.html
5. Verificar que `python3 -c "from backend import app"` no da errores de import

## Documentación

- Biblia del ERP en Notion: `351557b8-61b7-81fb-9693-c478f807eb4f` (dentro de "Mejoras ERP y BOT")
- Deploy docs: `deploy/OPERACIONES.md`
- Runbook: `interfaz_facturas/docs/RUNBOOK.md`

## Lo que NO hacer

- No usar `/home/deploy/apps/erp/` (borrado)
- No usar `docker-compose.prod.yml` (borrado)
- No referenciar `ghcr.io` (ya no se usa)
- No correr el bot en local mientras está en producción
- No hacer `docker volume rm erp_erp-data` (borra TODA la BD)
- No hacer `docker compose down -v` (el flag -v borra volúmenes)
