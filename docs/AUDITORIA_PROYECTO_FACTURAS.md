# Auditoría del proyecto – Facturas / Interfaz

Objetivo: hacer el proyecto más ágil, rápido y alineado con buenas prácticas **sin perder funcionalidad**.

---

## 1. Configuración y única fuente de verdad

### Problema
- **Empresas duplicadas**: En `backend.py` existe `EMPRESAS_CLIENTE` hardcodeado y en `config/empresas.toml` el listado real. El backend no lee el TOML.
- En el frontend, los `<select>` de empresa repiten las mismas 6 opciones en **más de 8 sitios**. Añadir una empresa nueva obliga a tocar backend + varios bloques HTML.

### Recomendación
- **Backend**: Cargar empresas desde `config/empresas.toml` al arranque (o con `tomllib` en Python 3.11+ o librería `toml`). Exponer un único endpoint `GET /api/empresas` que devuelva `[{ id, nombre }, ...]`.
- **Frontend**: Un solo fragmento/componente que renderice el `<select>` de empresa (o rellenarlo por JS al cargar la página con `/api/empresas`). Así, una sola fuente de verdad y cero duplicación de opciones.

**Impacto**: Menos errores al dar de alta empresas, despliegues más rápidos y configuración clara.

---

## 2. Backend: modularización y reutilización

### Problema
- `backend.py` tiene ~2.500 líneas en un solo archivo: rutas, lógica de negocio, OCR, OpenAI, CSV y helpers mezclados.
- Lógica de **export** y **ZIP** para facturas de proveedores y de clientes es casi idéntica (filtros año/mes/cliente o proveedor, lectura CSV, generación respuesta). Solo cambian campos y nombres de archivo.

### Recomendación
- **Estructura por capas** (sin necesidad de un framework enorme):
  - `routes/` o agrupación por dominio: `facturas_proveedores.py`, `facturas_clientes.py`, `proveedores.py`, `archivo.py`. Cada módulo registra sus rutas en la app Flask.
  - `services/` o `core/`: funciones puras de negocio (extracción, revisión, archivado, lectura/escritura CSV). Así se pueden testear sin Flask.
  - `config.py`: carga de `empresas.toml`, rutas de datos, constantes.
- **Helpers genéricos para export/ZIP**:
  - Una función `_filtrar_filas_csv(ruta_csv, fieldnames, year=None, month=None, filtro_campo=None, filtro_valor=None)` que devuelva filas filtradas.
  - Reutilizarla en `facturas_export`, `facturas_zip`, `facturas_clientes_export` y `facturas_clientes_zip`, pasando campos y nombre de archivo. Reduciría duplicación y bugs al cambiar filtros.

**Impacto**: Código más fácil de leer, testear y extender; menos copia-pega.

---

## 3. Frontend: dividir el monolito

### Problema
- `index.html` supera las 2.800 líneas (HTML + CSS + JS en un solo archivo). Cualquier cambio obliga a buscar en un archivo enorme y hay riesgo de conflictos en equipo.

### Recomendación (gradual, sin romper nada)
- **Fase 1 – Solo organización**:
  - Extraer CSS a `static/css/app.css` (o un par de archivos: layout, componentes, tablas). En el HTML dejar un único `<link rel="stylesheet" href="/static/css/app.css">`. Misma funcionalidad, archivo HTML más corto.
  - Extraer JS a `static/js/app.js` (o `app.js` + `facturas.js`, `clientes.js` si quieres separar por módulo). Cargar con `<script src="/static/js/app.js">`. No hace falta build ni bundler para empezar.
- **Fase 2 – Reutilización**:
  - Un único objeto de configuración de columnas por tipo de tabla (proveedores, clientes, listado por cliente) y una función genérica `renderTablaFacturas(tbody, facturas, columnas, opts)` que reciba si lleva checkbox, si tiene “Ver factura”/“Editar”, y formatee números con `formatearNumeroES`. Las tres tablas de facturas (proveedores, clientes, listado por cliente) pueden usar la misma función con distinta config.
- Opcional a medio plazo: si más adelante quieres compilar (Vite, etc.), la separación ya estará hecha.

**Impacto**: Mantenimiento más ágil, menos duplicación de lógica de render y formato.

---

## 4. Rendimiento

### Backend
- **Procesamiento por lote**: Al subir muchas facturas, el pipeline actual es secuencial (una factura tras otra). Donde sea posible (por ejemplo después de OCR), procesar en pequeños lotes o en paralelo (p. ej. `concurrent.futures.ThreadPoolExecutor`) para llamadas a OpenAI, manteniendo el orden al escribir en CSV. Cuidado con límites de tasa de la API.
- **Nominatim**: `_obtener_pais_desde_localidad` hace una petición HTTP por localidad y espera 1 s. Ya hay caché en memoria; podría persistirse en un pequeño JSON o en un CSV `cache_pais_localidad.csv` para no repetir entre reinicios.
- **Lectura de CSV**: En endpoints que solo filtran por empresa/año/mes, leer el CSV una vez y cachear en memoria por empresa (con invalidación al editar/eliminar) reduciría I/O en listados muy usados. Solo tiene sentido si el tamaño de los CSV crece.

### Frontend
- **Tablas grandes**: Si en el futuro hay cientos de filas, mantener solo las filas visibles en el DOM (virtualización) o paginación en backend (p. ej. `?page=1&per_page=50`) para no renderizar miles de `<tr>`.
- **Event listeners**: Los botones “Ver factura” y “Editar” se crean por fila; está bien. Evitar delegación masiva en el documento si no hace falta; el patrón actual es aceptable.

**Impacto**: Respuesta más rápida en subidas grandes y en pantallas con muchos datos.

---

## 5. Seguridad y robustez

- **`/api/archivo`**: Ya se valida que la ruta resuelta esté bajo `DATOS_DIR`; es correcto. Mantener esta comprobación siempre que se cambie la lógica.
- **Validación de entrada**: Unificar en un solo lugar la validación de `empresa_id` (que exista en la lista de empresas cargada desde config) y de parámetros opcionales (`year`, `month`, `cliente`, `proveedor`). Evita repetir `if not empresa_id` en cada ruta y centraliza respuestas 400.
- **CORS**: Si en algún momento la interfaz se sirve desde otro origen, habrá que configurar CORS en Flask de forma explícita y restrictiva.
- **Secrets**: `OPENAI_API_KEY` desde env o `.env` está bien; asegurar que `.env` esté en `.gitignore` (ya suele estarlo).

**Impacto**: Menos superficie de error y respuestas más consistentes.

---

## 6. Testing (sin perder funcionalidad)

- **Tests unitarios** para lógica pura que hoy está en `backend.py`:
  - Normalización de texto/NIF, extracción de fechas/importes con regex.
  - `_similitud_nombres`, `_normalizar_importe_str`.
  - Reglas de revisión (sin fecha, fecha futura, descuadre).
- **Tests de integración** opcionales: un CSV de prueba en `tests/fixtures/`, cargar con un `empresa_id` de test y comprobar que los endpoints de listado/export devuelven el número esperado de filas.
- El frontend puede seguir probándose manualmente o, más adelante, con unas pocas pruebas E2E (p. ej. Playwright) para el flujo “elegir empresa → cargar listado → export”.

**Impacto**: Refactors más seguros y detección temprana de regresiones.

---

## 7. DevOps y despliegue

- **Dependencias**: `requirements.txt` está bien. Fijar versiones exactas (ej. `Flask==3.0.0`) en producción para builds reproducibles.
- **Variables de entorno**: Además de `OPENAI_API_KEY`, usar `FLASK_ENV=production`, `DATOS_DIR` (opcional) si en algún momento quieres cambiar la ruta de datos sin tocar código.
- **Logging**: Sustituir o complementar `print` por `logging` (nivel INFO en producción, DEBUG en desarrollo). Incluir en logs `request_id` o similar en cada petición para trazar errores.
- **Health check**: Un `GET /api/health` que devuelva 200 si la app y (opcionalmente) el acceso a `DATOS_DIR` están bien. Útil para orquestadores y proxies.

**Impacto**: Despliegues más predecibles y diagnóstico más rápido en producción.

---

## 8. Resumen de prioridades

| Prioridad | Cambio | Esfuerzo | Beneficio |
|-----------|--------|----------|-----------|
| Alta | Una sola fuente de empresas (TOML + `/api/empresas` + rellenar selects por JS) | Bajo | Elimina duplicación y errores al dar de alta empresas |
| Alta | Extraer CSS y JS a archivos estáticos | Bajo | Mantenimiento y navegación mucho más ágiles |
| Media | Helpers genéricos para export/ZIP y filtrado CSV | Medio | Menos duplicación y bugs en exportaciones |
| Media | Modularizar backend (routes + services + config) | Medio | Código más testeable y escalable |
| Media | Función genérica de render de tablas de facturas en frontend | Medio | Misma UX, menos código y un solo lugar para formato |
| Baja | Cache persistente para Nominatim | Bajo | Menos latencia en procesamiento de facturas |
| Baja | Tests unitarios para normalización y revisión | Medio | Refactors más seguros |
| Baja | Health check y logging estructurado | Bajo | Mejor operación en producción |

Puedes aplicar primero las de **prioridad alta** sin tocar la funcionalidad actual; el resto se puede ir introduciendo de forma incremental.
