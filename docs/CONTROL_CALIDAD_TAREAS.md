# Control de calidad – Desglose de tareas

Objetivo: menú **Control de calidad** en la interfaz con botón **Analizar bases de datos** que ejecuta análisis sobre las facturas (y opcionalmente los tests unitarios), lista errores por factura con detalle, y permite corrección manual o mediante **sugerencias de un agente** (aceptar / rechazar / editar a mano).

---

## Fase 1: Análisis de calidad sobre la base de facturas

### 1.1 Backend – Lógica de análisis por fila

- **Tarea:** Crear función(es) que, dado un CSV de facturas (proveedores o clientes), recorran cada fila y apliquen las **mismas reglas** que ya usa el revisor:
  - **Proveedores:** sin fecha, fecha futura, descuadre (base + iva − retenciones ≠ total_a_pagar), y los mismos `setdefault`/flags que `_revisor_basico`.
  - **Clientes:** sin fecha, fecha futura, descuadre (pricing_servicio + pricing_transporte + iva ≠ total_a_pagar).
- **Salida:** Por cada fila, lista de “errores” (strings descriptivos, ej. `"Sin fecha de factura"`, `"Descuadre: base(100) + iva(21) − ret(0) ≠ total(999)"`).
- **Ubicación sugerida:** `interfaz_facturas/backend.py` o módulo en `core/` (ej. `core/control_calidad.py`) reutilizando `_normalizar_importe_str` y la lógica del revisor sin escribir en CSV.
- **Criterio de done:** Dada una lista de filas (dicts), la función devuelve `list[dict]` con `{ "indice" | "ruta_archivo", "errores": list[str], "fila": dict }`.

### 1.2 Backend – Endpoint “Analizar”

- **Tarea:** Nuevo endpoint, por ejemplo `POST /api/control-calidad/analizar` (o `GET` con query params).
  - **Parámetros:** `empresa_id` (obligatorio), `tipo` opcional: `proveedores` | `clientes` | `ambos`.
  - **Comportamiento:**
    1. Cargar facturas de proveedores y/o clientes (usando cache de listado si existe).
    2. Para cada conjunto, ejecutar la lógica de análisis de la tarea 1.1.
    3. (Opcional) Ejecutar los tests unitarios (`tests.test_logica_pura`) y capturar resultado (ok/failures).
  - **Respuesta:** JSON con estructura tipo:
    - `unit_tests`: `{ "ok": bool, "total": int, "fallos": [ { "test": str, "error": str } ] }` (si se incluyen tests).
    - `facturas_proveedores`: `[ { "indice" o "ruta_archivo", "errores": [...], "fila": {...} }, ... ]`.
    - `facturas_clientes`: igual.
- **Criterio de done:** Llamada al endpoint devuelve la estructura anterior y los errores coinciden con lo que marcaría el revisor.

### 1.3 Frontend – Menú y pantalla “Control de calidad”

- **Tarea:** Añadir en la interfaz:
  - Entrada en el **menú principal** (nav): “Control de calidad”.
  - **Panel** exclusivo para Control de calidad (igual que Proveedores, Clientes, etc.) con:
    - Selector de **empresa** (mismo `<select class="select-empresa">`).
    - Selector de **tipo**: “Facturas proveedores” / “Facturas clientes” / “Ambos”.
    - Botón **“Analizar bases de datos”**.
- **Criterio de done:** Al hacer clic en “Control de calidad” se muestra el panel; el botón está presente y vinculado (aún puede no hacer la petición si no está el endpoint).

### 1.4 Frontend – Llamada al análisis y listado de errores

- **Tarea:** Al pulsar “Analizar bases de datos”:
  - Llamar a `POST /api/control-calidad/analizar` con `empresa_id` y `tipo`.
  - Mostrar estado “Analizando…” y luego:
    - Si se incluyeron tests unitarios: resumen “Tests: OK” o “Tests: N fallos” con detalle colapsable.
    - Bloque **“Facturas con problemas”**: lista de filas (proveedores y/o clientes) con al menos un error.
  - Por cada factura: identificar (proveedor/cliente, número factura, fecha, ruta…) y listar debajo los **errores** (texto completo para entender por qué ha fallado).
- **Criterio de done:** Tras analizar, se ve en pantalla la lista de facturas con problemas y el detalle de cada error.

---

## Fase 2: Sugerencias del agente

### 2.1 Backend – Endpoint “Sugerir”

- **Tarea:** Nuevo endpoint `POST /api/control-calidad/sugerir`.
  - **Parámetros:** `empresa_id`, `tipo` (proveedores | clientes), identificador de la fila (`ruta_archivo` o `indice` + contexto), y `errores` (lista de strings tal como los devuelve el análisis).
  - **Comportamiento:** “Agente” (primero versión con **reglas heurísticas** a partir del texto del error y de la fila):
    - Para “Descuadre: base+iva−ret ≠ total” → sugerir `total_a_pagar` = base+iva−ret.
    - Para “Sin fecha” → no sugerir valor (o marcar “requiere revisión manual”).
    - Para “Fecha futura” → sugerir vacío o mensaje “Revisar fecha”.
    - (Opcional más adelante: llamada a LLM con fila + errores para sugerencias más ricas.)
  - **Respuesta:** JSON con algo como:
    - `sugerencias`: `[ { "campo": str, "valor_actual": str, "valor_sugerido": str, "motivo": str } ]`.
- **Criterio de done:** Dado un error de descuadre típico, el endpoint devuelve al menos una sugerencia coherente (ej. corregir `total_a_pagar`).

### 2.2 Frontend – Botón “Analizar con agente” y bloque sugerencia

- **Tarea:** Para cada factura con errores (o para cada error, según diseño):
  - Añadir botón **“Obtener sugerencia”** / “Analizar con agente”.
  - Al pulsar: llamar a `POST /api/control-calidad/sugerir` con esa factura y sus errores.
  - Mostrar junto al error:
    - **Sugerencia:** texto corto (campo, valor actual → valor sugerido, motivo).
    - Tres acciones: **Aceptar sugerencia**, **Rechazar**, **Editar a mano**.
- **Criterio de done:** Se ve el error, la sugerencia (cuando exista) y los tres botones con comportamiento definido (Aceptar aún puede no aplicar hasta 2.3).

### 2.3 Backend + Frontend – Aplicar sugerencia

- **Tarea:** Al pulsar **Aceptar sugerencia**:
  - Backend: reutilizar endpoint existente de actualización (PUT factura o factura_cliente) con los campos sugeridos aplicados sobre la fila actual.
  - Frontend: enviar la petición, refrescar el listado de esa factura en Control de calidad (o volver a analizar) para que el error desaparezca si quedó resuelto.
- **Criterio de done:** Aceptar una sugerencia de “total_a_pagar” actualiza la factura y, al re-analizar, ese error ya no aparece.

### 2.4 Frontend – Rechazar y Editar a mano

- **Tarea:**
  - **Rechazar:** quitar la sugerencia de la vista para esa fila/error; no modificar datos.
  - **Editar a mano:** abrir el mismo modal de edición de factura que ya existe en Proveedores/Clientes (misma ruta/índice) para que el usuario corrija manualmente.
- **Criterio de done:** Rechazar no hace cambios; Editar a mano abre el modal correcto con la factura cargada.

---

## Fase 3 (opcional): Refinar agente y UX

### 3.1 Agente con LLM (opcional)

- **Tarea:** Si se desea, en el endpoint de sugerencias: además de reglas heurísticas, enviar a un LLM (OpenAI) la **fila + errores** para que el modelo visualice la factura y los errores y sugiera correcciones (JSON: campo, valor_sugerido, motivo). Se combina con heurísticas (prioridad a estas en descuadres numéricos). Parámetro `usar_llm: true` en el body y checkbox en UI "Incluir asistente (LLM)".
- **Criterio de done:** Casos ambiguos pueden recibir una sugerencia razonable generada por el modelo.

### 3.2 Mejoras UX (opcional)

- **Tarea:** Contador de “X facturas con problemas” y “Y errores”; filtros o agrupación por tipo de error; exportar informe de calidad (CSV/PDF).
- **Criterio de done:** Definido según prioridad.

---

## Orden sugerido para implementar

1. **1.1** → **1.2** (backend análisis).
2. **1.3** → **1.4** (frontend menú + listado de errores).
3. **2.1** → **2.2** (sugerencias + botón y bloque en UI).
4. **2.3** → **2.4** (aplicar sugerencia, rechazar, editar a mano).
5. **3.x** cuando se decida.

---

## Resumen en checklist

- [x] **1.1** Lógica de análisis por fila (proveedores + clientes)
- [x] **1.2** Endpoint `POST /api/control-calidad/analizar`
- [x] **1.3** Menú y panel “Control de calidad”
- [x] **1.4** Llamada al análisis y listado de errores en pantalla
- [x] **2.1** Endpoint `POST /api/control-calidad/sugerir` (heurísticas)
- [x] **2.2** Botón “Obtener sugerencia” y bloque error + sugerencia + 3 acciones
- [x] **2.3** Aplicar sugerencia (PUT factura) y refresco
- [x] **2.4** Rechazar (solo UI) y Editar a mano (modal existente)
- [x] **3.1** (Opcional) Agente con LLM
- [x] **3.2** (Opcional) Mejoras UX (contadores, filtros, exportar)

Cuando quieras, podemos revisar este desglose (quitar, unir o desdoblar tareas) y después ir implementando por fases.
