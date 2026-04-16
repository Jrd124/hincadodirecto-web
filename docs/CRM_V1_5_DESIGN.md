# CRM v1.5 — Diseño y evaluación

**Autor:** Principal Product Architect / PM / Lead Engineer (análisis)
**Fecha:** 2026-04-11
**Ámbito:** Hincado ERP · módulo CRM
**Estado:** Documento de diseño. No hay implementación asociada todavía.
**Criterio rector:** máximo impacto comercial con mínimo cambio técnico.

---

## 1. Resumen ejecutivo

El CRM actual ya tiene la base correcta: empresas, contactos, oportunidades con kanban, interacciones con `siguiente_accion` y `fecha_siguiente_accion`, historial de cambios de estado, sincronización con Gmail y estadísticas básicas. Es un CRM v1 funcional como **registro**.

El problema no es que falte módulo, sino que falta **capa de seguimiento activo**: no hay una señal única y accionable de "a quién tengo que contactar hoy", no hay aging por etapa, no hay detección de enfriamiento automática, y las métricas existentes son demasiado agregadas para disciplinar el pipeline.

La buena noticia: **el 80% del salto de calidad se consigue sin tocar el modelo de datos de fondo**. Basta con:

1. Añadir 3-4 campos derivados en `crm_oportunidades` (calculados, no editables por el usuario).
2. Una tabla de parámetros de SLA por etapa (configurable, pequeñita).
3. Un cálculo batch nocturno (o al vuelo) que produzca un `next_action_date`, `next_action_type`, `priority_score` y `riesgo` por oportunidad.
4. Una vista "Hoy" (lista ordenada por prioridad) y 4-5 widgets analíticos nuevos, todos alimentados por SQL puro sobre lo que ya hay.
5. Pequeños retoques en la UI del kanban (badges de aging/riesgo, próxima acción visible en tarjeta).

**Nada de esto requiere IA, ni rediseño del kanban, ni nuevas entidades pesadas.** Con reglas claras sobre el histórico de interacciones y el histórico de cambios de estado se resuelve el caso real del negocio B2B.

Roadmap sugerido: un quick win de 2-3 días (vista "Hoy" + filtros de riesgo), una Fase 1 de ~1-2 semanas (motor de seguimiento con reglas + dashboard de disciplina comercial), y una Fase 2 opcional (conversión por etapa y aging detallado). Todo lo demás es prematuro.

---

## 2. Diagnóstico del CRM actual

### 2.1 Qué ya existe (y funciona)

Esquema y código revisados en `interfaz_facturas/core/crm_db.py`, `scripts/migration_crm.py`, `interfaz_facturas/routes/crm.py` y `interfaz_facturas/core/gmail_sync.py`.

Entidades presentes:

- `crm_empresas` con `tipo` (lead/cliente/proveedor/ambos), `dominio`, `cae_*`, `activo`, vinculación opcional a `terceros`.
- `crm_contactos` con `cargo`, vinculado a empresa y con `tipo_relacion`.
- `crm_oportunidades` con `estado` en `{lead, contacto_inicial, cotizacion_enviada, negociacion, ganada, perdida, aplazada}`, `importe_estimado`, `probabilidad`, `fecha_estimada_cierre`, `fuente`, vínculo a `proyecto_id` y `presupuesto_id`.
- `crm_oportunidades_historial` con `estado_anterior`, `estado_nuevo`, `fecha`, `motivo`. **Este es el activo más valioso y actualmente infrautilizado**: permite calcular aging por etapa, tiempo medio a ganada/perdida y conversión entre etapas sin ningún dato nuevo.
- `crm_interacciones` con `tipo` (llamada/email/reunion/nota/whatsapp/visita), `siguiente_accion` (texto libre), `fecha_siguiente_accion`, `source` (manual/gmail), `gmail_thread_id`, `gmail_snippet`. Ya hay ingesta automática desde Gmail.
- Funciones ya listas: `pipeline_oportunidades()` (conteo e importe por etapa), `estadisticas_crm()` (totales + tasa de conversión global), `empresas_sin_actividad(dias)` (aging por empresa), `interacciones_pendientes()` (siguiente acción en ventana de 7 días).

### 2.2 Qué falta

**A. Carencias funcionales (no de datos):**

- No hay una "vista de hoy" priorizada. `interacciones_pendientes()` solo lista por fecha; no ordena por valor ni distingue urgencia.
- No hay concepto de "oportunidad enfriándose". `empresas_sin_actividad()` se queda a nivel empresa y usa un único umbral global de 30 días.
- No se aprovecha el historial para calcular `dias_en_etapa_actual`, que es la señal más útil para detectar parón.
- No hay tasa de conversión por etapa, solo global ganadas/cerradas.
- No hay tiempo medio a cierre (win) ni a pérdida por etapa.
- No hay "siguiente acción" a nivel oportunidad; está a nivel interacción y puede haber varias en paralelo. Esto crea ambigüedad sobre cuál es la acción "vigente".

**B. Carencias de datos (mínimas):**

- Falta un campo de último contacto a nivel oportunidad. Hoy hay que calcularlo con un `MAX(fecha)` sobre `crm_interacciones`. Es barato pero se repite en cada pantalla.
- Falta marcar si hubo respuesta al último envío (por ejemplo, tras `cotizacion_enviada`). Se puede inferir: si después de un email saliente no hay ninguna interacción entrante, está pendiente de respuesta.
- No hay SLA por etapa configurable. Hoy no existe la noción "un lead en cotización enviada debe seguirse en X días".

**C. Carencias de UX:**

- La tarjeta del kanban no muestra la "próxima acción" ni el aging, así que visualmente no hay forma de detectar qué se está enfriando.
- No hay filtro rápido del tipo "vencidas", "en riesgo", "sin próxima acción definida".
- No hay indicador de disciplina comercial diaria (cuántas acciones planeadas vs cerradas).

**D. Carencias de lógica:**

- Nada decide por defecto "próxima fecha recomendada" si el usuario no la puso. Si el usuario olvida rellenar `fecha_siguiente_accion`, el sistema pierde el hilo.
- No hay priorización. Dos oportunidades vencidas el mismo día son iguales para el sistema, aunque una valga 100k y la otra 2k.

### 2.3 Qué no es un problema (aunque pueda parecerlo)

- El modelo de etapas es suficiente. No hace falta añadir etapas intermedias.
- El histórico de estados ya existe y es rico. No hay que inventar una tabla nueva.
- La ingesta Gmail ya alimenta interacciones automáticamente. Esto es oro.
- Duplicados, vinculación a terceros y CAE quedan fuera de alcance de esta fase.

---

## 3. Qué cambiaría y qué NO cambiaría

**Sí cambiaría (y es lo único que cambiaría):**

- Añadir campos derivados en `crm_oportunidades` que resuelvan las preguntas diarias en una sola query: `ultima_interaccion_fecha`, `dias_sin_contacto`, `dias_en_etapa_actual`, `next_action_date`, `next_action_type`, `priority_score`, `riesgo` (verde/ámbar/rojo), `estado_respuesta` (pendiente/recibida/na).
- Crear una tabla pequeña `crm_etapa_sla` con los umbrales por etapa (editable manualmente, no UI crítica).
- Añadir tres endpoints: `GET /crm/hoy`, `GET /crm/riesgo`, `GET /crm/analitica/pipeline`.
- Añadir 4-5 widgets en la home del CRM.
- Pequeños retoques en la tarjeta del kanban (badge + próxima acción visible).

**No cambiaría:**

- El modelo de etapas (son las correctas para un B2B de obra/hincado).
- La estructura de `crm_interacciones`. Se sigue usando tal cual, sumando `direccion` (in/out) solo si es imprescindible — y se puede inferir de `source`+`gmail_thread_id` en la mayoría de casos.
- La vista kanban. Se mantiene movible; solo se enriquece la tarjeta.
- La integración con Gmail, presupuestos y proyectos.
- Nada del modelo de terceros, facturación, CAE, maquinaria.
- Cero IA. Ni embeddings, ni clasificación de emails, ni scoring probabilístico.

**Mensaje clave:** no es una refundación, es una **capa de seguimiento** encima de lo que ya existe.

---

## 4. Diseño funcional mínimo viable

El objetivo es que cada mañana el usuario abra el CRM y vea, en una sola pantalla:

1. "Hoy te toca contactar" — lista ordenada por prioridad con la próxima acción explícita.
2. "Oportunidades en riesgo" — las que se están enfriando antes de que se enfríen del todo.
3. "Tu pipeline" — importe por etapa y salud general.
4. "Disciplina comercial" — acciones planeadas vs realizadas esta semana.

Para llegar ahí, el mínimo funcional es:

### 4.1 Campos nuevos (derivados, calculados)

En `crm_oportunidades`, todos nullables y recalculables:

| Campo | Tipo | Significado |
|---|---|---|
| `ultima_interaccion_fecha` | TEXT | `MAX(crm_interacciones.fecha)` para esa oportunidad o empresa. Cache para no recalcular. |
| `dias_sin_contacto` | INTEGER | Días desde `ultima_interaccion_fecha` al hoy. |
| `fecha_entrada_etapa` | TEXT | Última entrada a la etapa actual. Se deriva de `crm_oportunidades_historial`. |
| `dias_en_etapa_actual` | INTEGER | Días desde `fecha_entrada_etapa`. |
| `next_action_date` | TEXT | Fecha recomendada de próxima acción. Calculada por reglas (ver §5). |
| `next_action_type` | TEXT | Uno de `{cerrar, recordar_presupuesto, reactivar, perseguir_respuesta, revisar_estancada, primer_contacto}`. |
| `priority_score` | INTEGER | 0–100, para ordenar la lista "Hoy". |
| `riesgo` | TEXT | `verde` / `ambar` / `rojo`. |
| `estado_respuesta` | TEXT | `pendiente` / `recibida` / `na`. |

Estos campos **no se editan a mano** salvo `next_action_date` si el usuario lo override manualmente. Se recalculan en un batch nocturno o en cada lectura del endpoint `/crm/hoy` (según se prefiera; el batch es más simple y suficiente).

### 4.2 Nueva tabla `crm_etapa_sla`

Una fila por etapa. El usuario solo la edita una vez y olvida. Ejemplo:

| etapa | sla_dias_sin_contacto | sla_dias_en_etapa | accion_default | prioridad_base |
|---|---|---|---|---|
| lead | 5 | 14 | primer_contacto | 40 |
| contacto_inicial | 7 | 21 | perseguir_respuesta | 50 |
| cotizacion_enviada | 5 | 30 | recordar_presupuesto | 70 |
| negociacion | 3 | 20 | cerrar | 90 |
| aplazada | 30 | 90 | reactivar | 25 |

Esta tabla es la **única configuración comercial** del sistema. Menos de 10 filas.

### 4.3 Etiquetas/estados nuevos — NO

No hace falta añadir nuevas etapas. `aplazada` ya cubre el caso frío-reactivable. No añadir campos redundantes como "hot"/"cold"; todo eso se deriva de las reglas.

### 4.4 Nuevos tipos de acción (controlados, no texto libre)

El campo `next_action_type` tiene que ser enumerado para que la UI pueda colorearlo y filtrar por él:

- `primer_contacto` — lead sin interacción registrada.
- `perseguir_respuesta` — email/llamada saliente sin respuesta en X días.
- `recordar_presupuesto` — en `cotizacion_enviada` > sla.
- `cerrar` — en `negociacion` y cerca de `fecha_estimada_cierre` o con alto importe.
- `reactivar` — `aplazada` o lead frío.
- `revisar_estancada` — lleva más de `sla_dias_en_etapa` sin moverse.

Estos 6 tipos cubren el 95% de la realidad comercial B2B.

### 4.5 Señales de enfriamiento

Una oportunidad está en `riesgo = rojo` si **cualquiera** de:

- `dias_sin_contacto > sla_dias_sin_contacto` **Y** `estado_respuesta = pendiente`.
- `dias_en_etapa_actual > sla_dias_en_etapa`.
- `fecha_estimada_cierre` ya ha pasado y la oportunidad sigue abierta.
- `next_action_date` venció hace > 3 días.

Está en `ambar` si alguna de esas condiciones está a ≤ 3 días de cumplirse. `verde` en cualquier otro caso.

### 4.6 Métricas mínimas

Las que dan señal accionable (detalle en §6):

- Nº de acciones pendientes hoy / esta semana.
- Nº de oportunidades en rojo y en ámbar.
- Pipeline por etapa (conteo + importe) — ya existe.
- Conversión etapa→etapa sobre los últimos 90/180 días — nueva.
- Tiempo medio en etapa — nueva.
- Tiempo medio a ganada / tiempo medio a perdida — nueva.
- Nº medio de interacciones antes de ganar — nueva.
- % de oportunidades con `next_action_date` definida — disciplina comercial.
- Aging top 10 (las 10 más antiguas sin movimiento).

---

## 5. Lógica propuesta para seguimiento y próxima acción

Reglas, no modelo. Claras, auditables, en una sola función SQL+Python. Deben correr en unos pocos ms sobre todo el pipeline.

### 5.1 Entradas

Para cada oportunidad abierta (estado no en `{ganada, perdida}`):

- `estado`, `importe_estimado`, `fecha_estimada_cierre`, `fecha_creacion`
- `fecha_entrada_etapa` (última `crm_oportunidades_historial.fecha` con `estado_nuevo = estado`)
- `ultima_interaccion_fecha` y `ultima_interaccion_tipo` (max sobre `crm_interacciones`)
- `ultima_interaccion_direccion`: si `source = 'gmail'` y el thread tiene respuesta posterior, se infiere como "recibida"; si no, se asume "saliente/pendiente"
- `sla` por etapa desde `crm_etapa_sla`

### 5.2 Cálculo de `next_action_type` (en orden de precedencia)

```
si no hay interacciones y estado = 'lead':
    -> primer_contacto

si fecha_estimada_cierre ya pasó o estado = 'negociacion':
    -> cerrar

si estado = 'aplazada':
    -> reactivar

si dias_en_etapa_actual > sla_dias_en_etapa:
    -> revisar_estancada

si estado = 'cotizacion_enviada' y dias_sin_contacto >= sla_dias_sin_contacto:
    -> recordar_presupuesto

si estado_respuesta = 'pendiente' y dias_sin_contacto >= sla_dias_sin_contacto:
    -> perseguir_respuesta

en otro caso:
    -> usar accion_default de la etapa (contacto de mantenimiento)
```

### 5.3 Cálculo de `next_action_date`

- Si el usuario rellenó `siguiente_accion` + `fecha_siguiente_accion` en la última interacción: **se respeta**. El sistema nunca pisa la intención explícita del usuario.
- Si no, `next_action_date = ultima_interaccion_fecha + sla_dias_sin_contacto` (topado para no ir al pasado: como mínimo, hoy).
- Si no hay interacciones, `next_action_date = fecha_creacion + sla_dias_sin_contacto`.

Esto ya garantiza que **ninguna oportunidad se queda sin próxima fecha**.

### 5.4 Cálculo de `priority_score`

Combinación lineal simple, sin pesos mágicos:

```
base       = sla.prioridad_base               # 25..90
peso_import = min(30, importe_estimado / 5000)   # capa de importe, máx 30
peso_atraso = min(30, max(0, dias_desde_next_action))  # atraso en días
peso_etapa_cierre = 10 si estado in {'negociacion','cotizacion_enviada'} else 0
penalizacion_frio = -15 si estado = 'aplazada'

priority_score = base + peso_import + peso_atraso + peso_etapa_cierre + penalizacion_frio
```

Esto prioriza:

1. Oportunidades vencidas con importe alto cerca del cierre.
2. Por encima de leads fríos aunque lleven muchos días.
3. Por encima de oportunidades recién abiertas.

Ajustable en una sola función. No se necesita ML.

### 5.5 Detección de seguimiento vencido

`next_action_date < hoy` → vencido. Entra directo en la vista "Hoy" con prioridad elevada por `peso_atraso`.

### 5.6 Detección de oportunidad estancada

`dias_en_etapa_actual > sla_dias_en_etapa` → estancada. Se marca `riesgo = rojo` y `next_action_type = revisar_estancada` (salvo si ya aplica algo más urgente como `cerrar`).

### 5.7 Detección de lead frío / reactivable

- `estado = lead` y `dias_sin_contacto > 2 × sla` → lead frío → `next_action_type = reactivar`.
- `estado = aplazada` → siempre reactivable, aparece cuando `next_action_date` llega.

### 5.8 Dónde vive esta lógica

Una sola función en `interfaz_facturas/core/crm_db.py`:

```
def recalcular_seguimiento_oportunidades() -> int
```

Se ejecuta:

- Al arrancar el backend (una vez).
- Al crear/actualizar una oportunidad o interacción (recalcular solo esa oportunidad).
- Cron nocturno ligero (uno cada madrugada) para recalcular aging y riesgo de todas.

Coste estimado: O(n) sobre oportunidades abiertas, con n probablemente < 500. Irrelevante.

---

## 6. Analítica y dashboards recomendados

Todo lo que sigue se calcula con SQL puro sobre las tablas existentes + los nuevos campos derivados. Nada obliga a una capa analítica.

### 6.1 Widgets para la home del CRM (primera fila, visibles al abrir)

1. **Hoy te toca contactar** — lista top 15 ordenada por `priority_score DESC`, con nombre oportunidad, empresa, importe, `next_action_type` como etiqueta de color, días de atraso. Un clic y ves la ficha.
2. **En riesgo** — contador grande: "X oportunidades en rojo · Y en ámbar". Clic lleva a la lista filtrada.
3. **Pipeline** — barra horizontal con importe por etapa (ya existe la query; solo falta el widget).
4. **Disciplina comercial esta semana** — % de acciones planeadas que se han cerrado (creadas interacciones efectivas). Esto se calcula comparando `fecha_siguiente_accion` de la semana pasada con interacciones reales de esta semana sobre las mismas oportunidades.

### 6.2 Métricas diarias

- Acciones vencidas hoy (rojo).
- Acciones que vencen hoy (ámbar).
- Nuevas interacciones registradas hoy.
- Oportunidades movidas de etapa hoy.

### 6.3 Métricas semanales

- Nº de interacciones nuevas por tipo (llamada/email/reunión).
- Nº de oportunidades creadas esta semana.
- Nº de oportunidades cerradas esta semana (ganadas + perdidas).
- Importe ganado / perdido esta semana.

### 6.4 Métricas de pipeline

- Importe y conteo por etapa (ya existe).
- Evolución del pipeline abierto (semana a semana, últimos 12).
- Top 10 oportunidades por importe en riesgo.
- Edad media del pipeline abierto.

### 6.5 Métricas de conversión

- Conversión etapa→etapa (ventanas 90 y 180 días). Ejemplo: de todas las oportunidades que entraron a `cotizacion_enviada`, cuántas llegaron a `negociacion`, cuántas a `ganada`. Se calcula mirando `crm_oportunidades_historial`.
- Tasa de conversión global (ya existe).
- Nº medio de interacciones antes de ganar.

### 6.6 Métricas de disciplina comercial

- % de oportunidades abiertas con `next_action_date` futura (cuanto más alto, mejor).
- % de acciones planeadas la semana pasada que se ejecutaron en la semana.
- Nº de oportunidades sin ninguna interacción en los últimos 14 días.

### 6.7 Métricas de riesgo

- Conteo de `riesgo = rojo / ambar / verde`.
- Importe total en rojo (muy importante: "tengo X k€ enfriándose").
- Top 5 oportunidades estancadas por días en etapa.
- Oportunidades con `fecha_estimada_cierre` pasada que siguen abiertas.

### 6.8 Qué NO incluir (vanity)

- Leaderboards individuales cuando no hay equipo.
- Gráficas de "satisfacción del cliente" sin datos.
- Forecasting probabilístico. El `importe_estimado * probabilidad / 100` es suficiente.
- Heatmaps por hora del día.
- Cualquier métrica por sector/fuente cuando el volumen no da significancia.

---

## 7. Cambios mínimos en datos / backend

### 7.1 Cambios de esquema (migración aditiva, retrocompatible)

Un solo script `scripts/migration_crm_v15.py` con `ALTER TABLE` y `CREATE TABLE IF NOT EXISTS`. Ninguna columna existente se modifica.

```sql
ALTER TABLE crm_oportunidades ADD COLUMN ultima_interaccion_fecha TEXT;
ALTER TABLE crm_oportunidades ADD COLUMN dias_sin_contacto INTEGER;
ALTER TABLE crm_oportunidades ADD COLUMN fecha_entrada_etapa TEXT;
ALTER TABLE crm_oportunidades ADD COLUMN dias_en_etapa_actual INTEGER;
ALTER TABLE crm_oportunidades ADD COLUMN next_action_date TEXT;
ALTER TABLE crm_oportunidades ADD COLUMN next_action_type TEXT;
ALTER TABLE crm_oportunidades ADD COLUMN priority_score INTEGER;
ALTER TABLE crm_oportunidades ADD COLUMN riesgo TEXT;
ALTER TABLE crm_oportunidades ADD COLUMN estado_respuesta TEXT;

CREATE TABLE IF NOT EXISTS crm_etapa_sla (
    etapa TEXT PRIMARY KEY,
    sla_dias_sin_contacto INTEGER NOT NULL,
    sla_dias_en_etapa INTEGER NOT NULL,
    accion_default TEXT NOT NULL,
    prioridad_base INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_crm_oport_next_action ON crm_oportunidades(next_action_date);
CREATE INDEX IF NOT EXISTS ix_crm_oport_priority ON crm_oportunidades(priority_score DESC);
CREATE INDEX IF NOT EXISTS ix_crm_oport_riesgo ON crm_oportunidades(riesgo);
```

Seed inicial de `crm_etapa_sla` con los valores del §4.2.

### 7.2 Cambios en el código

Ficheros tocados:

- `interfaz_facturas/core/crm_db.py` — añadir funciones `recalcular_seguimiento_oportunidad(id)`, `recalcular_seguimiento_oportunidades()`, `oportunidades_hoy(limit)`, `oportunidades_en_riesgo()`, `analitica_conversion()`, `analitica_aging_etapas()`, `disciplina_comercial()`. Ningún cambio en funciones existentes. Nada se rompe.
- `interfaz_facturas/routes/crm.py` — tres endpoints nuevos: `GET /crm/hoy`, `GET /crm/riesgo`, `GET /crm/analitica`. Los endpoints existentes no se tocan.
- Hook: en `crear_interaccion` y `actualizar_oportunidad` llamar a `recalcular_seguimiento_oportunidad(id)`. Dos líneas.
- Cron opcional: una llamada desde `backend.py` al arrancar que lance un recálculo diario con `schedule` si ya hay cron, o simplemente "al primer acceso del día".

### 7.3 Cálculos: batch vs al vuelo

**Recomendación: mitad y mitad.**

- `dias_sin_contacto`, `dias_en_etapa_actual`, `next_action_date`, `riesgo`, `priority_score` → se recalculan y **persisten** en la tabla. El cómputo es barato y así los widgets son solo `SELECT ... ORDER BY priority_score`. Mucho más simple que recalcular en cada pintada.
- Las métricas de dashboard (conversión, aging medio, disciplina) → se calculan **al vuelo** con SQL. Son queries agregadas de segundos, no merece la pena cachearlas.

### 7.4 Eventos a registrar

Ya están casi todos. Solo añadir:

- Al pasar una oportunidad de etapa, verificar que `crm_oportunidades_historial` reciba el registro (ya lo hace `cambiar_estado_oportunidad` y `actualizar_oportunidad`; asegurar que el drag del kanban pasa por ahí).
- Opcional: cuando Gmail sync detecte un inbound de la empresa, marcar `estado_respuesta = recibida` en las oportunidades abiertas de esa empresa. Una sola función.

### 7.5 Foco

- Simplicidad: una migración + 6 funciones nuevas + 3 endpoints + 4 widgets.
- Coste: días, no semanas.
- Mantenibilidad: toda la lógica en una función auditable. Sin servicios externos, sin dependencias nuevas.
- Consumo: despreciable. SQLite puede con esto sin enterarse.

---

## 8. Cambios mínimos en UX / UI

Principio: **añadir señal, no rediseñar**.

### 8.1 En la tarjeta del kanban

Mostrar en cada tarjeta, sin agrandarla:

- Importe estimado (si no se muestra ya).
- Badge de días en etapa: `12d` en ámbar si supera SLA, en rojo si supera 1.5× SLA.
- Icono de próxima acción: un pictograma según `next_action_type` (teléfono = cerrar, sobre = recordar presupuesto, reloj = revisar estancada, etc.).
- Fecha de `next_action_date` en pequeño. En rojo si vencida.

### 8.2 En la ficha de oportunidad

- Banner superior con `riesgo` y razón ("En negociación desde hace 42 días, SLA 20").
- Botón rápido "Registrar interacción" (ya existe).
- Campo "próxima acción" editable manualmente con calendario; si el usuario lo toca, se marca como override y el motor no lo pisa.

### 8.3 Home del CRM (vista nueva, mínima)

Una página `/crm/hoy` con:

1. Tabla "Hoy te toca contactar" (top 15 por `priority_score`).
2. Contadores de riesgo (rojo/ámbar) con enlace a la lista filtrada.
3. Mini pipeline (ya existe).
4. "Disciplina esta semana" — una línea.

Esta pantalla debería ser la home por defecto del CRM al abrirlo. Si hoy es la lista de empresas, cambiarlo por esta. Un solo cambio de ruta por defecto.

### 8.4 Filtros rápidos en la lista de oportunidades

Añadir en el mismo sitio donde hoy hay filtros:

- "Sin próxima acción"
- "Vencidas"
- "En riesgo (rojo)"
- "En riesgo (ámbar+rojo)"
- "Sin actividad > 14d"

Son solo `WHERE` sobre los nuevos campos. Coste trivial.

### 8.5 Qué NO tocar

- El kanban como metáfora.
- La ficha de empresa y contacto (salvo sumar un enlace a oportunidades).
- Los formularios de creación/edición. Nada nuevo que rellenar a mano.
- El menú general del ERP.

---

## 9. Roadmap priorizado por impacto / esfuerzo

### 9.1 Quick wins (2-3 días, impacto inmediato)

- Migración aditiva con los 9 campos derivados y `crm_etapa_sla` + seed.
- Función `recalcular_seguimiento_oportunidades()` con las reglas del §5.
- Endpoint `GET /crm/hoy` devolviendo top 15 por `priority_score`.
- Badge de "vencida" / "en riesgo" en la tarjeta del kanban.
- Filtros "vencidas" y "sin próxima acción" en la lista de oportunidades.

Con esto ya tienes cada mañana una lista priorizada de a quién llamar, sin haber tocado nada estructural.

### 9.2 Fase 1 imprescindible (1-2 semanas)

- Home del CRM `/crm/hoy` con widgets "Hoy", "En riesgo", "Pipeline", "Disciplina comercial".
- Inferencia de `estado_respuesta` a partir de Gmail threads (aprovechar `gmail_thread_id` y `source`).
- Recálculo automático al crear/editar interacciones y al mover tarjeta en kanban.
- Cron diario de recálculo (un solo punto de entrada).
- Ficha de oportunidad con banner de riesgo y motivo.
- Métricas semanales básicas (interacciones nuevas, oportunidades creadas, cerradas).

### 9.3 Fase 2 recomendable pero no obligatoria (1-2 semanas extra, cuando haya hueco)

- Embudo de conversión etapa→etapa con ventana configurable (90/180 días).
- Tiempo medio en etapa y tiempo medio a cierre / pérdida.
- Nº medio de interacciones antes de ganar.
- Top 10 de aging por etapa.
- Export CSV de cualquier dashboard (una línea con pandas).
- Override manual persistente de `next_action_date` desde la ficha.

### 9.4 Cosas que NO haría ahora

- Clasificación automática de intent de los emails (requiere LLM en caliente, alto coste operativo, bajo ROI frente a reglas).
- Scoring predictivo de probabilidad de ganar (no hay suficiente histórico etiquetado).
- Multi-usuario, roles, asignaciones comerciales con permisos finos. Si solo hay un comercial real, es sobre-ingeniería.
- Notificaciones push / email automáticas a clientes. Riesgo alto, aporta poco en v1.5.
- Integración con WhatsApp Business oficial. Caro y frágil.
- Módulo de ofertas con versionado nuevo (el actual con `presupuestos` es suficiente).
- Rediseño visual del kanban.
- Exportador de pipeline a Excel "fancy" con gráficos vinculados.
- Campañas / secuencias automatizadas.
- Cualquier dashboard con forecasting.
- Mover a Postgres.

---

## 10. Riesgos y recomendaciones críticas

### 10.1 Errores que serían un tiro en el pie

- **Sobre-parametrizar el motor.** Si empiezas con 15 pesos configurables y 5 umbrales por etapa, acabas con un sistema que nadie entiende y que nunca se ajusta bien. Empezar con 4 números por etapa y una fórmula lineal simple. Ajustar solo tras 2-3 meses con datos.
- **Mezclar `siguiente_accion` a nivel interacción con `next_action_date` a nivel oportunidad sin una regla clara de precedencia.** Solución aquí: el valor del usuario gana, el motor solo rellena cuando está vacío. Documentarlo en el código y en la UI.
- **Calcular aging al vuelo en cada petición.** Con pocas oportunidades da igual, pero en cuanto metes el widget en 4 sitios te multiplicas. Persiste los campos derivados.
- **Ocultar el kanban detrás de una vista "Hoy".** El usuario todavía quiere mover tarjetas. No sustituir, sumar.
- **Inferir "respuesta recibida" de forma agresiva desde Gmail.** Puede haber falsos positivos (un "fuera de la oficina", un "gracias, lo miro la semana que viene"). Marcar como `recibida` basta para parar el `perseguir_respuesta`, pero no debe cerrar la oportunidad.
- **Poner IA donde unas reglas funcionan.** Ninguna de las decisiones de §5 requiere un modelo. La regla es auditable, el modelo no.
- **Refactorizar `crm_db.py` antes de meter funcionalidad.** El archivo es largo pero funcional. Primero añade valor, luego limpias.

### 10.2 Dónde es fácil complicarlo de más

- "Queremos que la próxima acción sugiera también el canal óptimo". No. Una etiqueta y un texto.
- "Queremos detectar automáticamente el sentimiento del email". No. Regla binaria: ¿hubo respuesta posterior del dominio? Sí/No.
- "Queremos SLA por sector o por importe". No en v1.5. SLA por etapa es suficiente.
- "Queremos que el score aprenda con el histórico". No hay histórico útil suficiente y se pierde trazabilidad.

### 10.3 Qué datos faltan para hacerlo perfecto (y que conviene saber)

- **Dirección de la interacción (`in` / `out`).** Hoy se puede inferir del `source` y del Gmail thread, pero con imperfección. Solución pragmática: añadir un `direccion` opcional en `crm_interacciones` y rellenarlo solo cuando Gmail lo sepa. Sin bloquear el resto.
- **¿Hubo envío formal del presupuesto?** Se puede saber si la oportunidad tiene `presupuesto_id` NOT NULL y si ese presupuesto pasa a estado "enviado". Verificar si la tabla `presupuestos` tiene esa marca.
- **Cierre esperado real.** `fecha_estimada_cierre` está hoy pero se usa poco. Recomendar rellenarlo siempre que se pase a `cotizacion_enviada`.
- **Responsable comercial.** Hay `creado_por` pero no un "owner" explícito. Para un solo comercial es irrelevante; para varios, añadir `owner_id` en una fase posterior.

### 10.4 Qué parte conviene dejar manual por ahora

- El tipo de próxima acción puede sobreescribirse a mano por el usuario desde la ficha. El motor pone el default, el humano manda.
- El paso de "aplazada" a "lead" o "contacto_inicial" (reactivación). El motor avisa, el comercial decide.
- La definición del SLA por etapa. Editable desde config, no desde una UI cuidada. Cambia 2 veces al año.

### 10.5 Qué lógica puede ser suficiente sin IA

- La lógica de `next_action_type` con los 6 estados enumerados cubre el 95% del flujo real.
- La priorización lineal con 5 términos cubre el orden de la lista diaria.
- La detección de enfriamiento con 2-3 umbrales cubre el riesgo.

En conjunto: **una función de ~150 líneas de Python + SQL sustituye a un modelo**.

---

## 11. Dudas y datos faltantes que conviene validar antes de implementar

Preguntas para el usuario (Sergio) antes de abrir un solo PR:

1. **Volumen real.** ¿Cuántas oportunidades abiertas hay normalmente? ¿Cuántas interacciones al mes? Esto confirma que SQLite + recálculo batch es suficiente (espero que sí).
2. **Usuarios concurrentes.** ¿Un solo comercial o varios? Afecta a si añadimos `owner_id` ya o no.
3. **SLAs de negocio.** Los valores de §4.2 son estimaciones razonables para B2B de hincado/obra. ¿Cuáles son los plazos reales del negocio? Ejemplo clave: ¿cuántos días suele pasar entre enviar un presupuesto y el primer recordatorio?
4. **Qué es "respuesta recibida".** ¿Basta con que Gmail vea un inbound del dominio del cliente? ¿O se requiere también que el contacto asociado haya contestado? La primera es más barata y casi siempre correcta.
5. **Presupuestos.** ¿La tabla `presupuestos` tiene un campo de estado (borrador/enviado/aceptado)? Si lo tiene, podemos usarlo para el disparador de `recordar_presupuesto` con más precisión.
6. **Fuente preferida de "última interacción".** ¿Solo `crm_interacciones`, o también contamos como interacción el envío de un presupuesto desde el módulo de presupuestos? Sugerencia pragmática: solo `crm_interacciones`, y que al enviar presupuesto se registre automáticamente una interacción de tipo `email`.
7. **Configuración del SLA.** ¿Cómo quieres editarlo? ¿En una pantalla simple dentro del CRM o directamente con un script/toml? Script/toml es más barato y suficiente.
8. **Recálculo.** ¿Preferencia por recálculo nocturno programado o "al primer acceso del día"? El segundo ahorra cron, es suficiente para un solo usuario.
9. **Home del CRM.** ¿Mantenemos la home actual o la sustituimos por `/crm/hoy`? Recomendación: sustituir por defecto, dejando botón a "ver empresas/contactos" en el menú lateral.
10. **Uso real del campo `aplazada`.** ¿Se está usando hoy? Si no, vale la pena activarlo como estado operativo para leads a revisitar en vez de "perdida".

---

## Nota final

Este es el salto de v1 a "v1.5 muy bueno": mismo CRM, las mismas tablas, el mismo kanban, la misma filosofía; pero encima, una capa fina que convierte el registro en una herramienta de disciplina comercial. No necesitas Salesforce ni necesitas IA. Necesitas 9 columnas derivadas, 1 tabla de SLAs, 1 función de reglas, 3 endpoints y 4 widgets bien elegidos.

Con eso tienes cada mañana una lista priorizada, cada viernes un dashboard de disciplina, y cada trimestre métricas de conversión y ciclo de venta reales. Todo calculado sobre datos que **ya estás registrando**.

El siguiente paso natural, cuando valides este documento y contestes las preguntas del §11, es una fase de implementación en dos sprints cortos según el roadmap del §9.
