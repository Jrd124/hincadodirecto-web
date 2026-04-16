# CRM v1.5 — Especificación técnica de Fase 2

**Fecha:** 2026-04-11
**Autor:** Principal Product Architect / Staff Engineer / CRM PM (especificación)
**Estado:** Decisiones cerradas. Listo para implementación en el orden aquí descrito.
**Precondición:** Fase 1 completada (documento `CRM_V1_5_DESIGN.md`).
**Código revisado:** `interfaz_facturas/core/crm_db.py`, `interfaz_facturas/routes/crm.py`, `interfaz_facturas/core/gmail_sync.py`, `interfaz_facturas/core/presupuestos_db.py`, `interfaz_facturas/index.html`, `scripts/migration_crm.py`.

---

## 1. Resumen ejecutivo técnico

El salto a v1.5 se implementa con **1 migración aditiva + 1 módulo nuevo de reglas + 4 endpoints nuevos + 3 retoques puntuales en `index.html`**. No se toca ninguna función existente de `crm_db.py`, no se reestructura `routes/crm.py`, no se rehace el kanban.

Decisiones clave cerradas en este documento (justificadas en sus secciones):

- El motor de seguimiento opera **a nivel de oportunidad**, no de empresa. Las empresas sin oportunidad abierta quedan fuera del motor (siguen teniendo la vista actual `empresas_sin_actividad`).
- Los campos derivados se **persisten** en `crm_oportunidades` (solo los que se leen en listas/widgets). Lo que se calcula al vuelo son las métricas agregadas (conversión, tiempo medio).
- El motor se dispara de forma **síncrona** en 3 puntos del ciclo (crear/editar interacción, cambiar estado, crear oportunidad) y, además, recálculo completo en `init_crm_db()` **si el último recálculo fue ayer o antes**. Sin cron.
- `estado_respuesta` es binario (`pendiente` / `recibida`). La inferencia se hace en el momento de ingesta Gmail usando el `From` del último mensaje del hilo — campo que ya se lee pero hoy se descarta.
- `next_action_type` es un enum fijo de 6 valores. Evaluación en orden de precedencia explícito.
- `priority_score` es una fórmula lineal cerrada con 5 términos, sin pesos configurables.
- `crm_etapa_sla` es una tabla seed editable por SQL. No hay UI para ella en Fase 2.
- No hay dirección explícita por interacción (`last_outbound_at` / `last_inbound_at`) como columnas separadas. Un único campo `direccion` en `crm_interacciones` es suficiente: `out` / `in` / `none`. Los campos "last outbound" y "last inbound" se calculan por `MAX(fecha)` cuando hace falta.
- Sí hay flag de override manual de `next_action_date`: se implementa sin columna extra, con una convención sobre los campos ya existentes `crm_interacciones.siguiente_accion` + `fecha_siguiente_accion`. El motor **nunca pisa** el valor del usuario.
- `dias_sin_contacto` y `dias_en_etapa_actual` **no** se persisten: son deltas contra `date('now')` y se calculan con `julianday()` en la misma query de listado. Lo persistido es `ultima_interaccion_fecha` y `fecha_entrada_etapa`.

Resultado: 11 columnas añadidas en 2 tablas, 1 tabla seed, 1 módulo Python (~250 líneas), 4 endpoints nuevos, 3 fragmentos UI. Ningún refactor.

---

## 2. Ambigüedades o contradicciones detectadas en Fase 1

Revisión crítica del documento anterior (`CRM_V1_5_DESIGN.md`):

**2.1. Ambigüedad: "dias_sin_contacto" como columna vs cálculo.** La Fase 1 proponía 9 campos derivados persistidos, incluyendo `dias_sin_contacto` y `dias_en_etapa_actual`. Esto es redundante: son deltas temporales que cambian cada día, obligarían a recálculo nocturno solo para mantenerlos frescos, y se calculan en microsegundos con `CAST(julianday('now') - julianday(ultima_interaccion_fecha) AS INTEGER)`. **Decisión cerrada:** no persistir. Se derivan en cada SELECT sobre los campos persistidos.

**2.2. Contradicción: recálculo batch vs al vuelo.** Fase 1 decía "mitad y mitad" sin cerrar el cuándo. **Decisión cerrada:** no hay batch programado. El motor se ejecuta síncrono en los eventos del CRM y una vez al día como efecto lateral del primer acceso (see §4.7). Coste despreciable (n < 500 oportunidades abiertas).

**2.3. Ambigüedad: motor a nivel de oportunidad o empresa.** Fase 1 mezclaba ambos. La función `empresas_sin_actividad()` ya existe y opera a nivel empresa. Duplicar lógica a nivel oportunidad es necesario porque las métricas buenas (aging, conversión, riesgo) solo tienen sentido por oportunidad. **Decisión cerrada:** el motor v1.5 opera **exclusivamente sobre `crm_oportunidades` con estado abierto**. `empresas_sin_actividad()` sigue existiendo tal cual para el caso "empresas sin oportunidad" (CRM-touch genérico) y no se mueve.

**2.4. Ambigüedad: estado_respuesta.** ¿Cuándo pasa a `recibida`? ¿Cualquier inbound del dominio? ¿Solo del contacto asociado? **Decisión cerrada en §4.3.** Es `recibida` si hay un mensaje del hilo Gmail cuyo `From` contiene el dominio de la empresa **y** su fecha es posterior a la última interacción saliente registrada (manual o Gmail). Si no hay thread Gmail (interacción manual), queda en `pendiente` hasta que el usuario cree la siguiente interacción.

**2.5. Ambigüedad: direccion de las interacciones.** Fase 1 dejó esto abierto. El Gmail sync actual ya lee `from_addr` (línea 190 de `gmail_sync.py`) pero lo concatena en `participants` y pierde la información estructurada. **Decisión cerrada:** añadir una única columna `direccion TEXT` a `crm_interacciones`. Los valores son `out` (saliente), `in` (entrante), `none` (nota interna, reunión, no aplica). El Gmail sync deduce la dirección comparando `from_addr` con el dominio de la empresa. Las interacciones manuales ya existentes se backfillan con `none`.

**2.6. Contradicción: override manual.** Fase 1 decía "si el usuario rellena `siguiente_accion` + `fecha_siguiente_accion` en la última interacción, el motor no pisa". Pero esto asume que la "última interacción" siempre es la fuente de verdad, lo cual falla si el usuario creó la próxima acción en una interacción más antigua y luego metió una nota sin acción definida. **Decisión cerrada en §4.2:** la fuente de verdad para "próxima acción del usuario" es la interacción más reciente con `fecha_siguiente_accion IS NOT NULL` vinculada a la misma oportunidad, **si** esa fecha es `>= hoy - 3 días`. Más allá, se considera caduca y el motor toma control.

**2.7. Ambigüedad: aplazada.** Fase 1 lo trataba como estado operativo y luego como "reactivar automáticamente cuando llega next_action_date". **Decisión cerrada:** `aplazada` es estado abierto pero **no entra en la vista "Hoy"** salvo que `fecha_siguiente_accion` explícita del usuario esté para hoy. La UI debe mostrarlo como una lista aparte "Para reactivar" con `priority_score` propio penalizado.

**2.8. Redundancia: `priority_score` + `riesgo`.** Los dos se pueden inferir el uno del otro si quisiéramos. **Decisión cerrada:** mantener los dos. `riesgo` es ordinal de 3 valores (para badges y filtros). `priority_score` es continuo (para ordenación). No son intercambiables; `riesgo` no ordena bien, `priority_score` no colorea bien.

**2.9. Redundancia: `next_action_type` vs `accion_default` de SLA.** El SLA tiene `accion_default`, y el motor puede terminar eligiendo algo distinto. **Decisión cerrada:** `accion_default` es el fallback terminal. El motor solo lo usa si ninguna de las 5 reglas anteriores aplica. En la mayoría de casos, el `next_action_type` será una de las 5 reglas, no el default.

**2.10. Fase 1 asumía `fecha_estimada_cierre` como señal de negociación.** En la práctica, esa columna está presente pero **muy poco poblada** (requiere que el comercial la rellene a mano). **Decisión cerrada:** se usa como señal si existe, se ignora si es NULL. Nada fuerza a rellenarla.

**2.11. Fase 1 no tocó `presupuestos`.** Pero `presupuestos_db.py` (línea 363-385) **ya** pasa automáticamente la oportunidad a `ganada` cuando un presupuesto se marca `adjudicada`. Eso es perfecto y no lo tocamos. Adicionalmente, presupuestos tiene estados `borrador`, `enviada`, `negociacion`, `adjudicada`, `perdida`, `cancelada`. **Decisión cerrada:** si una oportunidad tiene un presupuesto vinculado en estado `enviada` y hace > SLA días sin contacto, el motor elige `recordar_presupuesto` con prioridad alta (sin duplicar lógica: el estado de la oportunidad normalmente ya será `cotizacion_enviada`, y basta con eso).

---

## 3. Modelo de datos final propuesto

### 3.1. Cambios en `crm_oportunidades` (ALTER TABLE aditivo)

Solo 6 columnas. Todas nullables. Todas calculadas por el motor; ninguna editable por el usuario salvo override manual gestionado por separado.

| # | Columna | Tipo | Persistido | Semántica |
|---|---|---|---|---|
| 1 | `ultima_interaccion_fecha` | TEXT | sí | `MAX(crm_interacciones.fecha)` para esa oportunidad. Cache. |
| 2 | `fecha_entrada_etapa` | TEXT | sí | Fecha del último `crm_oportunidades_historial` donde `estado_nuevo = estado_actual`. |
| 3 | `next_action_date` | TEXT | sí | Fecha recomendada por el motor. Si el usuario override, refleja el valor del usuario. |
| 4 | `next_action_type` | TEXT | sí | Enum: `primer_contacto` / `perseguir_respuesta` / `recordar_presupuesto` / `cerrar` / `reactivar` / `revisar_estancada`. |
| 5 | `priority_score` | INTEGER | sí | 0-150, para ordenar. |
| 6 | `riesgo` | TEXT | sí | Enum: `verde` / `ambar` / `rojo`. |
| 7 | `estado_respuesta` | TEXT | sí | Enum: `pendiente` / `recibida` / `na`. `na` para estados cerrados o leads sin contacto aún. |
| 8 | `next_action_source` | TEXT | sí | `motor` / `usuario`. Flag de override. Tipado aquí por claridad (ver §4.2). |
| 9 | `seguimiento_recalculado_en` | TEXT | sí | Timestamp del último recálculo. Permite el "recálculo diario al primer acceso". |

**Columnas descartadas (respecto a Fase 1):**

- `dias_sin_contacto` → se calcula en query.
- `dias_en_etapa_actual` → se calcula en query.

**Justificación de persistencia del resto:** son 7 columnas leídas en absolutamente todas las listas y widgets. Persistirlas evita joins+subqueries en cada pintada y permite ordenar/filtrar con un índice. El coste de escritura es irrelevante porque solo se actualizan en eventos ya transaccionales.

### 3.2. Cambios en `crm_interacciones`

| # | Columna | Tipo | Semántica |
|---|---|---|---|
| 1 | `direccion` | TEXT | `out` / `in` / `none`. Se rellena al crear. Backfill con `none` para existentes. |

**Justificación:** sin esta columna, el cálculo de `estado_respuesta` obliga a buscar el thread Gmail y reanalizar headers en cada recálculo. Con la columna, es un `MAX(fecha) WHERE direccion='out'` vs `MAX(fecha) WHERE direccion='in'`.

**Backfill:** una única `UPDATE` al final del script de migración:

```sql
UPDATE crm_interacciones SET direccion = 'none' WHERE direccion IS NULL;
```

Para las interacciones Gmail históricas, no intentamos inferir dirección retroactivamente en la migración: el motor funcionará igual y cuando lleguen nuevas interacciones se rellenará correctamente. Inferencia retroactiva queda como tarea de un script opcional **fuera de alcance**.

### 3.3. Nueva tabla `crm_etapa_sla`

```sql
CREATE TABLE IF NOT EXISTS crm_etapa_sla (
    etapa                   TEXT PRIMARY KEY,
    sla_dias_sin_contacto   INTEGER NOT NULL,
    sla_dias_en_etapa       INTEGER NOT NULL,
    accion_default          TEXT    NOT NULL,
    prioridad_base          INTEGER NOT NULL
);
```

**Seed inicial (definitivo):**

| etapa | sla_dias_sin_contacto | sla_dias_en_etapa | accion_default | prioridad_base |
|---|---|---|---|---|
| lead | 5 | 14 | primer_contacto | 40 |
| contacto_inicial | 7 | 21 | perseguir_respuesta | 55 |
| cotizacion_enviada | 5 | 30 | recordar_presupuesto | 75 |
| negociacion | 3 | 20 | cerrar | 90 |
| aplazada | 30 | 120 | reactivar | 20 |
| ganada | 9999 | 9999 | cerrar | 0 |
| perdida | 9999 | 9999 | cerrar | 0 |

`ganada` y `perdida` llevan umbrales altísimos para que el motor los ignore sin necesitar rama especial. Simplifica el código.

### 3.4. Índices

Solo los necesarios para los queries de listado y widgets:

```sql
CREATE INDEX IF NOT EXISTS ix_crm_oport_next_action_date ON crm_oportunidades(next_action_date);
CREATE INDEX IF NOT EXISTS ix_crm_oport_priority_score ON crm_oportunidades(priority_score DESC);
CREATE INDEX IF NOT EXISTS ix_crm_oport_riesgo ON crm_oportunidades(riesgo);
CREATE INDEX IF NOT EXISTS ix_crm_interacciones_direccion ON crm_interacciones(oportunidad_id, direccion, fecha DESC);
```

**Índices descartados:** `estado_respuesta` no va indexado (cardinalidad baja, filtros compuestos con `riesgo` más selectivos). `next_action_type` no va indexado (lo mismo, cardinalidad 6).

### 3.5. Migración

**Fichero:** `scripts/migration_crm_v15.py` (nuevo, independiente de `migration_crm.py`).

Ejecuta:

1. `ALTER TABLE crm_oportunidades ADD COLUMN ...` × 9 (envuelto en try/except para idempotencia estilo `crm_db.py` línea 160-174).
2. `ALTER TABLE crm_interacciones ADD COLUMN direccion TEXT`.
3. `CREATE TABLE IF NOT EXISTS crm_etapa_sla`.
4. Seed de `crm_etapa_sla` con `INSERT OR IGNORE`.
5. `UPDATE crm_interacciones SET direccion='none' WHERE direccion IS NULL`.
6. Crea los 4 índices.
7. Llama a `recalcular_seguimiento_todas()` una vez para poblar los nuevos campos.

El init de `crm_db.init_crm_db()` debe replicar los `ADD COLUMN` con el mismo patrón try/except para que el arranque del backend no exija correr el script (coherente con el patrón actual).

---

## 4. Reglas de negocio cerradas

### 4.1. Ámbito del motor

- Solo se procesan oportunidades con `estado NOT IN ('ganada', 'perdida')`.
- Las oportunidades cerradas conservan sus valores de `next_action_type`, `priority_score`, etc. del último recálculo. No se tocan. Si se reabren (cambio de estado), el motor recalcula.

### 4.2. Override manual (fuente de verdad para próxima acción)

**Regla:** hay override manual cuando existe una interacción con `oportunidad_id = X` **y** `fecha_siguiente_accion IS NOT NULL` **y** `fecha_siguiente_accion >= date('now', '-3 days')`, ordenando por `fecha DESC` y tomando la primera.

- Si hay override:
  - `next_action_date = interaccion.fecha_siguiente_accion`
  - `next_action_type` se mapea desde `interaccion.siguiente_accion` (texto libre) a un enum usando keyword matching simple (§4.2.1). Si no hay match, `accion_default` de la etapa.
  - `next_action_source = 'usuario'`.
- Si no hay override:
  - `next_action_source = 'motor'`.
  - Reglas §4.4 y §4.5 aplican.

**¿Por qué la ventana de 3 días?** Una `fecha_siguiente_accion` de hace más de 3 días significa que el usuario la puso hace tiempo y la tarea ha caducado sin actualización. En ese punto, el motor debe reclamar control para no dejar la oportunidad en limbo. Los 3 días son un margen práctico para que el usuario tenga tiempo de reprogramar.

**Crítico:** el motor nunca escribe sobre `crm_interacciones.fecha_siguiente_accion` ni sobre `siguiente_accion`. Solo lee. El override vive en la tabla de interacciones.

#### 4.2.1. Keyword matching para `siguiente_accion` libre

Implementación en Python, tabla en minúsculas, primer match gana:

```
si contiene 'cerrar' o 'firma'           -> cerrar
si contiene 'presup' o 'oferta' o 'cotiz' -> recordar_presupuesto
si contiene 'reactiv' o 'frio' o 'retom'  -> reactivar
si contiene 'respond' o 'contesta' o 'respuesta' -> perseguir_respuesta
si contiene 'revis' o 'estanc' o 'parad'  -> revisar_estancada
si contiene 'contact' o 'llamar' o 'primer' -> primer_contacto
en otro caso                             -> accion_default de la etapa
```

Si esta tabla evoluciona mucho, se externaliza a un dict en el módulo. En v1.5, queda hardcodeada.

### 4.3. Cálculo de `estado_respuesta`

Sea `O` una oportunidad abierta y `E` su empresa.

- Si no hay ninguna interacción para `O`: `estado_respuesta = 'na'`.
- Sea `t_out = MAX(fecha)` sobre `crm_interacciones WHERE oportunidad_id=O AND direccion='out'`.
- Sea `t_in = MAX(fecha)` sobre `crm_interacciones WHERE empresa_id=E AND direccion='in'` (a nivel empresa porque el inbound Gmail puede no estar vinculado a la oportunidad concreta).
- Si `t_out IS NULL`: `estado_respuesta = 'pendiente'` si hay alguna interacción `out` a nivel empresa, `'na'` en otro caso.
- Si `t_in IS NULL` o `t_in < t_out`: `estado_respuesta = 'pendiente'`.
- Si `t_in >= t_out`: `estado_respuesta = 'recibida'`.

**Nota:** se comparte el inbound a nivel empresa intencionadamente. Si el cliente contesta con un email que Gmail sync vincula a la empresa pero no a la oportunidad concreta, se considera respuesta. Es pragmático y evita que el motor reclame acción cuando ya hay una conversación viva.

### 4.4. Cálculo de `next_action_type` (en orden de precedencia)

Evaluación en este orden, primer match gana. Asume `sla` cargado para la `etapa` de la oportunidad.

```
# Input: oportunidad O con estado, ultima_interaccion_fecha, fecha_entrada_etapa,
#        fecha_estimada_cierre, estado_respuesta, presupuesto_id y su estado (si existe)

hoy = date('now')
dias_sin_contacto = hoy - ultima_interaccion_fecha (None => +inf)
dias_en_etapa = hoy - fecha_entrada_etapa (None => 0)

# 1. Override (§4.2) ya tratado antes. A partir de aquí, motor.

# 2. Lead sin interacciones
si O.estado == 'lead' y dias_sin_contacto == +inf:
    next_action_type = 'primer_contacto'
    next_action_date = fecha_creacion + sla.sla_dias_sin_contacto
    return

# 3. Aplazada: reactivación calendarizada
si O.estado == 'aplazada':
    next_action_type = 'reactivar'
    next_action_date = fecha_entrada_etapa + sla.sla_dias_sin_contacto
    return

# 4. Negociación o fecha estimada cierre cercana/pasada
si O.estado == 'negociacion':
    next_action_type = 'cerrar'
    next_action_date = max(hoy, ultima_interaccion_fecha + sla.sla_dias_sin_contacto)
    return
si O.fecha_estimada_cierre is not null y O.fecha_estimada_cierre <= hoy + 7 dias:
    next_action_type = 'cerrar'
    next_action_date = max(hoy, ultima_interaccion_fecha + min(3, sla.sla_dias_sin_contacto))
    return

# 5. Estancada: días en etapa supera SLA
si dias_en_etapa > sla.sla_dias_en_etapa:
    next_action_type = 'revisar_estancada'
    next_action_date = hoy
    return

# 6. Presupuesto enviado pendiente de recordatorio
si O.estado == 'cotizacion_enviada' y dias_sin_contacto >= sla.sla_dias_sin_contacto:
    next_action_type = 'recordar_presupuesto'
    next_action_date = hoy
    return

# 7. Respuesta pendiente
si O.estado_respuesta == 'pendiente' y dias_sin_contacto >= sla.sla_dias_sin_contacto:
    next_action_type = 'perseguir_respuesta'
    next_action_date = hoy
    return

# 8. Default por etapa: mantenimiento
next_action_type = sla.accion_default
next_action_date = (ultima_interaccion_fecha ?? fecha_creacion) + sla.sla_dias_sin_contacto
if next_action_date < hoy: next_action_date = hoy
```

Nota: las reglas 4/5/6/7 nunca devuelven fechas en el pasado; si el cálculo da pasado, se tope a hoy. Es intencional: una acción vencida sigue siendo "hoy, urgente".

### 4.5. Cálculo de `priority_score`

```
base = sla.prioridad_base

# 1. Importe (cap 30)
peso_importe = min(30, (importe_estimado or 0) / 5000)

# 2. Atraso (cap 30)
dias_atraso = max(0, hoy - next_action_date)
peso_atraso = min(30, dias_atraso)

# 3. Bonus por etapa cercana a cierre
peso_etapa_cierre = 10 si estado in ('negociacion', 'cotizacion_enviada') else 0

# 4. Penalización por estado frío
peso_frio = -15 si estado == 'aplazada' else 0

# 5. Penalización por fecha cierre futura lejana (> 60d) y ninguna urgencia
peso_futuro = -10 si fecha_estimada_cierre is not null y fecha_estimada_cierre > hoy + 60d y peso_atraso == 0 else 0

priority_score = max(0, round(base + peso_importe + peso_atraso + peso_etapa_cierre + peso_frio + peso_futuro))
```

Valor máximo práctico: ~150. Mínimo: 0.

### 4.6. Cálculo de `riesgo`

**Rojo** si alguna de:

- `dias_atraso > 3` (next_action_date vencida hace más de 3 días).
- `dias_en_etapa > sla.sla_dias_en_etapa`.
- `estado_respuesta == 'pendiente' y dias_sin_contacto > 2 × sla.sla_dias_sin_contacto`.
- `fecha_estimada_cierre is not null y fecha_estimada_cierre < hoy - 7d` (el cierre previsto ya pasó).

**Ámbar** si alguna de (y no es rojo):

- `0 < dias_atraso <= 3`.
- `dias_en_etapa > 0.8 × sla.sla_dias_en_etapa`.
- `estado_respuesta == 'pendiente' y dias_sin_contacto >= sla.sla_dias_sin_contacto`.

**Verde** en el resto.

### 4.7. Cuándo recalcula el motor

**Recálculo por oportunidad** (1 fila):

- Al salir de `crear_oportunidad()`.
- Al salir de `actualizar_oportunidad()` (si cambió estado, obliga también a recalcular `fecha_entrada_etapa`).
- Al salir de `cambiar_estado_oportunidad()`.
- Al salir de `crear_interaccion()` si la interacción tiene `oportunidad_id`; si no, recálculo global de las oportunidades abiertas de esa empresa.
- Al salir de `actualizar_interaccion()` y `eliminar_interaccion()` con la misma regla.
- Al salir de `guardar_hilo_como_interaccion()` de Gmail: recálculo global de las oportunidades abiertas de esa empresa.

**Recálculo global** (todas las oportunidades abiertas):

- Cuando `init_crm_db()` detecta que `MAX(seguimiento_recalculado_en)` es de ayer o anterior, lanza `recalcular_seguimiento_todas()` antes de devolver control. Primer acceso del día = recálculo. Sin cron, sin scheduler.
- Endpoint manual `POST /api/crm/seguimiento/recalcular` por si algo queda inconsistente (ver §6).

**Coste estimado:** con n < 500 oportunidades abiertas, el recálculo global tarda decenas de ms. Aceptable para la latencia del primer request del día.

### 4.8. Última interacción válida

"Interacción válida" = cualquier fila de `crm_interacciones` con `oportunidad_id = X`, sin filtro de tipo ni de `direccion`. Una nota interna cuenta como "contacto" a efectos de aging, porque indica que el usuario está mirando la oportunidad. No se discrimina.

**Excepción:** para `estado_respuesta` sí se filtra por `direccion`, como ya se definió en §4.3.

---

## 5. Fuente de verdad y mapeo de interacciones

### 5.1. Unidad de análisis

**Oportunidad.** Una empresa con 3 oportunidades abiertas se analiza 3 veces. Una empresa con 0 oportunidades no pasa por el motor v1.5 (se gestiona con `empresas_sin_actividad()` existente).

### 5.2. Varias oportunidades en la misma empresa

**Regla:** cada oportunidad tiene su propio motor. Comparten la `empresa_id` pero no comparten `next_action_date`. Un inbound de Gmail vinculado a la empresa (no a oportunidad concreta) marca `estado_respuesta = recibida` **en todas** las oportunidades abiertas de esa empresa. Es intencional: si el cliente contestó, ninguna de las oportunidades vivas necesita un "perseguir respuesta". El comercial decide cuál sigue.

### 5.3. Hilo de Gmail ↔ oportunidad

**Regla actual del código:** Gmail sync vincula threads a `empresa_id` **no** a `oportunidad_id`. Se respeta.

**Decisión cerrada:** mantener la interacción a nivel empresa. Para el motor, basta con saber que hubo inbound/outbound en esa empresa tras la última interacción saliente. No se intenta asociar automáticamente un thread a una oportunidad concreta (eso sería clasificación semántica — fuera de alcance).

Si el usuario quiere vincular manualmente un thread a una oportunidad, ya puede hacerlo a través de `actualizar_interaccion()` asignando `oportunidad_id`. No se añade UI para esto en Fase 2.

### 5.4. Interacción sin oportunidad

Dos tipos:

1. **Sin `oportunidad_id` pero con `empresa_id`:** afecta al `estado_respuesta` de las oportunidades abiertas de esa empresa (§4.3) y dispara recálculo global de esas oportunidades. Pero **no** actualiza `ultima_interaccion_fecha` de ninguna oportunidad (porque esa métrica es por oportunidad).
2. **Sin `empresa_id` ni `oportunidad_id`:** no existe en la práctica (ambas columnas permiten NULL pero todas las interacciones reales vienen con al menos una de las dos). Si aparecieran, se ignoran.

### 5.5. Dirección de interacciones creadas manualmente

Las interacciones creadas vía `POST /api/crm/interacciones` actualmente no reciben `direccion`. Decisión cerrada: **no exigir `direccion` al usuario**. El endpoint sigue idéntico, el campo se rellena con reglas:

- `tipo in ('llamada', 'reunion', 'visita')` → `direccion = 'none'` (no se distingue quién llamó a quién — sería una UX adicional no justificada).
- `tipo in ('email', 'whatsapp')` creados manualmente → `direccion = 'out'` (asunción razonable: si el comercial lo apunta, es porque él lo mandó).
- `tipo == 'nota'` → `direccion = 'none'`.
- Creados por `gmail_sync` → `direccion` se deriva del `From` del último mensaje del thread comparándolo con el dominio de la empresa: si el `From` es del dominio del cliente, `in`; si no, `out`.

Esto se implementa en `crear_interaccion()` y en `guardar_hilo_como_interaccion()`. Dos lugares.

---

## 6. Endpoints mínimos necesarios

Todos bajo el blueprint `crm_bp` existente (`interfaz_facturas/routes/crm.py`). Prefijo `/api/crm/`.

### 6.1. `GET /api/crm/seguimiento/hoy`

**Propósito:** vista "Hoy te toca contactar". Lista ordenada de oportunidades con acción pendiente.

**Query params:**

- `limit` (int, default 25, máx 100)
- `incluir_verde` (0/1, default 0) — si 1, incluye también verdes con `next_action_date <= hoy+3d`

**Ordenación:** `priority_score DESC, next_action_date ASC, importe_estimado DESC NULLS LAST`.

**Respuesta:**

```json
{
  "oportunidades": [
    {
      "id": 42,
      "nombre": "Instalación planta Badajoz",
      "empresa_id": 17,
      "nombre_empresa": "Solares del Sur SL",
      "estado": "cotizacion_enviada",
      "importe_estimado": 28500.0,
      "ultima_interaccion_fecha": "2026-04-03",
      "dias_sin_contacto": 8,
      "dias_en_etapa_actual": 12,
      "next_action_date": "2026-04-08",
      "next_action_type": "recordar_presupuesto",
      "next_action_source": "motor",
      "priority_score": 118,
      "riesgo": "rojo",
      "estado_respuesta": "pendiente",
      "fecha_estimada_cierre": "2026-05-01"
    }
  ],
  "total": 14,
  "generado_en": "2026-04-11T08:14:02"
}
```

### 6.2. `GET /api/crm/seguimiento/riesgo`

**Propósito:** oportunidades en `ambar` o `rojo`.

**Query params:**

- `nivel` (`rojo` | `ambar` | `ambar+rojo`, default `ambar+rojo`)
- `limit` (int, default 50, máx 200)

**Ordenación:** `riesgo DESC (rojo antes de ambar), priority_score DESC`.

**Respuesta:** misma forma que §6.1.

### 6.3. `GET /api/crm/analitica/pipeline`

**Propósito:** dashboard agregado. Calculado al vuelo.

**Query params:** ninguno (ventanas por defecto: conversión 180d, aging sobre oportunidades abiertas).

**Respuesta:**

```json
{
  "pipeline_por_etapa": [
    {"etapa": "lead", "count": 8, "importe_total": 12000.0, "edad_media_dias": 6},
    {"etapa": "contacto_inicial", "count": 5, "importe_total": 40000.0, "edad_media_dias": 18},
    {"etapa": "cotizacion_enviada", "count": 11, "importe_total": 185000.0, "edad_media_dias": 14},
    {"etapa": "negociacion", "count": 3, "importe_total": 78000.0, "edad_media_dias": 9},
    {"etapa": "aplazada", "count": 2, "importe_total": 15000.0, "edad_media_dias": 75}
  ],
  "riesgo": {"rojo": 6, "ambar": 9, "verde": 14, "importe_en_rojo": 95000.0},
  "conversion_180d": {
    "lead_a_contacto_inicial": 0.72,
    "contacto_inicial_a_cotizacion_enviada": 0.58,
    "cotizacion_enviada_a_negociacion": 0.41,
    "negociacion_a_ganada": 0.63,
    "global_ganadas_sobre_cerradas": 0.44
  },
  "tiempos_medios_dias": {
    "lead_a_ganada": 62,
    "lead_a_perdida": 48,
    "en_cotizacion_enviada": 19
  },
  "interacciones_por_oportunidad_ganada_media": 5.8,
  "disciplina": {
    "oportunidades_con_next_action_futura_pct": 0.82,
    "acciones_planeadas_semana_pasada": 18,
    "acciones_ejecutadas_semana": 14
  }
}
```

### 6.4. `POST /api/crm/seguimiento/recalcular`

**Propósito:** recálculo global manual. No se expone en la UI — se deja para depurar o forzar consistencia.

**Body:** vacío o `{"oportunidad_id": 42}` para recalcular solo una.

**Respuesta:** `{"ok": true, "procesadas": 47, "duracion_ms": 112}`.

### 6.5. Endpoints existentes que se modifican (internamente, no el contrato)

- `GET /api/crm/oportunidades` (línea 285 de `routes/crm.py`): añadir a la query params `filtro=vencidas|sin_accion|riesgo_rojo|riesgo_ambar|sin_actividad_14d`. Es un único parámetro string que selecciona un `WHERE` distinto. El formato de respuesta **no cambia**. Compatible 100% con frontends existentes.
- Ningún endpoint existente se elimina.

### 6.6. Endpoints que NO se añaden

- No hay endpoint separado para `crm_etapa_sla`. Se edita con SQL/script. Añadir CRUD sería sobre-ingeniería.
- No hay endpoint `GET /api/crm/seguimiento/empresas-frias-v2`. La función actual `empresas_sin_actividad()` queda intacta y su endpoint también.
- No hay endpoint de "siguiente acción sugerida" por empresa. Se deriva de la oportunidad.

---

## 7. Cambios mínimos en UX / UI

Solo se edita `interfaz_facturas/index.html` (una sola decisión: no es ideal pero es donde vive toda la UI hoy). No se añade SPA, no se introduce framework, no se separan ficheros.

### 7.1. Panel "Oportunidades" → añadir barra superior

Justo después del header con los botones "Kanban" / "Lista" (línea 1780-1787 de `index.html`), añadir una fila de badges clicables:

```
[Hoy: 14] [Vencidas: 6] [En riesgo: 9] [Sin próxima acción: 3]
```

Cada badge:

- Llama a `/api/crm/seguimiento/hoy` (o filtros en `/api/crm/oportunidades?filtro=...`) y muestra el resultado en la vista lista.
- Los contadores se refrescan al abrir el panel.

No añade pantalla nueva. Reaprovecha la vista lista existente.

### 7.2. Tarjetas del kanban

Hoy las tarjetas muestran nombre + importe. Añadir, sin agrandar:

- Línea inferior con un bullet de color según `riesgo`: `● verde`, `● amarillo`, `● rojo`.
- Texto pequeño: `next_action_type` traducido (p.ej. "Recordar presupuesto") + "vence 12 abr" o "vence hoy" o "vencida (+3d)".
- Tooltip con `dias_en_etapa_actual` y `dias_sin_contacto`.

Implementación: en la función JS que renderiza una card, leer los nuevos campos del JSON de oportunidad y meterlos en el HTML de la tarjeta. 15-20 líneas de JS. Cero CSS nuevo salvo colores del bullet.

### 7.3. Ficha/modal de oportunidad

En el modal `#modal-crm-oportunidad` (línea 1814), añadir **arriba** (antes del campo nombre) un banner condicional:

- Si `riesgo == 'rojo'`: banner rojo, "Oportunidad en riesgo: {motivo}".
- Si `riesgo == 'ambar'`: banner ámbar, mismo patrón.
- Si `verde`: sin banner.

El "motivo" se deriva en el frontend a partir de los campos que ya vienen en el JSON (sin API extra):

- `dias_atraso > 3` → "Acción vencida hace N días".
- `dias_en_etapa > sla` → "En etapa X desde hace Y días".
- `estado_respuesta == pendiente` → "Sin respuesta desde Z días".

La `sla` no hace falta traerla al front: el backend puede incluir el texto del motivo ya renderizado en el JSON de `/api/crm/seguimiento/hoy` (campo `motivo_riesgo`). Para `/api/crm/oportunidades` también — pequeña adición al payload sin breaking changes.

**Decisión cerrada:** el campo `motivo_riesgo` (string listo para pintar) lo devuelve el backend junto con `riesgo`. Evita lógica duplicada en JS.

### 7.4. Home del CRM

El `panel-crm-resumen` (línea ~1515-1560) ya tiene cards de stats. Se añade:

- Una card nueva "Hoy te toca contactar" con el top 5 del endpoint `/api/crm/seguimiento/hoy` (solo nombre, empresa, motivo, importe). Clic → lleva al panel de oportunidades con filtro "hoy".
- Una card nueva "En riesgo" con los contadores rojo/ámbar.

Ambas son `<div class="card">` con contenido renderizado en JS. No tocan ni layout ni grid.

### 7.5. Lista de oportunidades

Añadir columnas a la tabla existente:

- "Prioridad" (numérica).
- "Próxima acción" (texto).
- "Riesgo" (badge color).

Añadir al dropdown de filtros (línea 1793) un segundo select "Filtro rápido":

```
- (todos)
- Vencidas
- Sin próxima acción
- En riesgo (rojo)
- En riesgo (ámbar+rojo)
- Sin actividad > 14d
```

Conecta al parámetro `filtro` del endpoint extendido (§6.5).

### 7.6. Qué NO se toca en la UI

- Layout general.
- Sidebar.
- Ficha de empresa y contacto.
- Formulario de creación/edición de oportunidad (salvo el banner superior).
- CSS global.
- Nada de Tailwind, shadcn, React. Sigue siendo HTML+vanilla JS como hoy.

---

## 8. Plan de implementación por bloques / tickets

Cada bloque es un PR independiente. Cada uno puede mergearse sin romper nada.

### Bloque 1 — Migración y esquema

**Objetivo:** tener los campos disponibles en BD.

**Cambios:**

- Crear `scripts/migration_crm_v15.py` con los ALTER, CREATE, seed e índices de §3.1–3.4.
- Replicar los `ADD COLUMN` idempotentes dentro de `crm_db.init_crm_db()` (siguiendo el patrón try/except existente líneas 160-188).
- Añadir tabla `crm_etapa_sla` en `init_crm_db()` también.
- Seed inicial de `crm_etapa_sla` con `INSERT OR IGNORE`.

**Dependencias:** ninguna.

**Complejidad:** baja (1 día).

**Riesgo:** bajo. Todo aditivo. Revertir = dejar columnas vacías.

**Criterio de aceptación:**

- Tras `python scripts/migration_crm_v15.py`, las 9 columnas nuevas en `crm_oportunidades` existen, `crm_interacciones.direccion` existe (con backfill `none`), `crm_etapa_sla` tiene 7 filas.
- El backend arranca sin errores con la BD nueva y con una BD "vieja" (sin correr el script), porque `init_crm_db()` hace el mismo trabajo.
- `SELECT * FROM crm_oportunidades` sigue funcionando con los endpoints existentes (todas las columnas nuevas son nullables).

---

### Bloque 2 — Motor de seguimiento (módulo puro)

**Objetivo:** implementar la lógica §4 aislada y testable.

**Cambios:**

- Nuevo fichero `interfaz_facturas/core/crm_seguimiento.py` (~250 líneas).
- Funciones exportadas:
  - `cargar_slas() -> dict[str, dict]`
  - `calcular_seguimiento_oportunidad(oportunidad_row, contexto) -> dict` — **función pura**, sin BD, recibe todo el contexto ya cargado.
  - `recalcular_seguimiento_oportunidad(oportunidad_id: int) -> None` — wrapper que carga de BD, llama a la función pura, y persiste.
  - `recalcular_seguimiento_todas() -> int` — itera sobre oportunidades abiertas y llama a la anterior.
  - `recalcular_seguimiento_por_empresa(empresa_id: int) -> int` — para el hook de Gmail.
- Tests unitarios en `interfaz_facturas/tests/test_crm_seguimiento.py` cubriendo §9.

**Dependencias:** Bloque 1.

**Complejidad:** media (2-3 días).

**Riesgo:** medio. Es el corazón. El aislamiento en función pura mitiga.

**Criterio de aceptación:**

- `pytest interfaz_facturas/tests/test_crm_seguimiento.py` pasa con los 10+ casos de §9.
- `recalcular_seguimiento_todas()` ejecutada contra la BD actual termina en < 500 ms para n ≤ 500.
- No se modifica ninguna función de `crm_db.py`.

---

### Bloque 3 — Integración del motor en eventos CRM

**Objetivo:** que el motor se dispare automáticamente.

**Cambios:** ediciones puntuales en `interfaz_facturas/core/crm_db.py`:

- Al final de `crear_oportunidad()`: llamar `recalcular_seguimiento_oportunidad(new_id)`.
- Al final de `actualizar_oportunidad()`: llamar `recalcular_seguimiento_oportunidad(oportunidad_id)`.
- Al final de `cambiar_estado_oportunidad()`: idem.
- Al final de `crear_interaccion()`: si `oportunidad_id`, recalcula esa; si no, `recalcular_seguimiento_por_empresa(empresa_id)`.
- Al final de `actualizar_interaccion()` y `eliminar_interaccion()`: misma regla.
- Al inicio de `init_crm_db()` (después de las migraciones, antes del final): verificar `seguimiento_recalculado_en` y lanzar `recalcular_seguimiento_todas()` si toca.

Y en `interfaz_facturas/core/gmail_sync.py`:

- En `guardar_hilo_como_interaccion()`, tras el INSERT, deducir `direccion` desde el `From` del último mensaje y rellenar. Luego llamar `recalcular_seguimiento_por_empresa(empresa_id)`.
- Requiere pasar el `from_addr` del último mensaje a esta función (hoy se pierde). Modificación mínima en la firma.

**Dependencias:** Bloques 1 y 2.

**Complejidad:** baja-media (1 día).

**Riesgo:** bajo. Llamadas aditivas al final de funciones que ya funcionan. Ningún cambio de semántica.

**Criterio de aceptación:**

- Crear una oportunidad vía endpoint existente deja sus 9 campos poblados.
- Crear una interacción vía endpoint existente actualiza `ultima_interaccion_fecha` y recalcula campos de la oportunidad vinculada.
- Tests de `test_smoke.py` siguen pasando.
- Un arranque "cold" del backend dispara el recálculo global la primera vez en el día.

---

### Bloque 4 — Endpoints nuevos

**Objetivo:** exponer el motor al frontend.

**Cambios:** añadir al final de `interfaz_facturas/routes/crm.py`:

- `GET /api/crm/seguimiento/hoy`
- `GET /api/crm/seguimiento/riesgo`
- `GET /api/crm/analitica/pipeline`
- `POST /api/crm/seguimiento/recalcular`
- Extender `GET /api/crm/oportunidades` con el parámetro `filtro` (una sola nueva línea en `listar_oportunidades()`).

Cada endpoint es un wrapper de 5-15 líneas que llama a una función nueva en `crm_db.py` (puede vivir también en `crm_seguimiento.py` si prefieres separar).

**Dependencias:** Bloques 2 y 3.

**Complejidad:** baja (1 día).

**Riesgo:** bajo.

**Criterio de aceptación:**

- `curl /api/crm/seguimiento/hoy` devuelve JSON de §6.1 con datos reales.
- El contrato de los endpoints existentes no cambia (verificación manual + tests de smoke).
- Ningún endpoint nuevo hace más de 2 queries a SQLite.

---

### Bloque 5 — UI mínima

**Objetivo:** que el usuario vea y use el valor.

**Cambios en `interfaz_facturas/index.html`** (secciones indicadas en §7):

- Badges arriba del panel oportunidades (§7.1).
- Renderizado de riesgo + next_action en cards del kanban (§7.2).
- Banner de riesgo en modal oportunidad (§7.3).
- Dos cards nuevas en home CRM (§7.4).
- Columnas y filtro rápido en vista lista (§7.5).

Cambios puramente frontend. Unos 150-250 líneas de JS + HTML en total.

**Dependencias:** Bloque 4.

**Complejidad:** media (1-2 días).

**Riesgo:** bajo-medio. El principal riesgo es romper la renderización del kanban existente por un selector equivocado. Mitigable con prueba manual.

**Criterio de aceptación:**

- Abrir el panel de oportunidades muestra los badges con los contadores correctos.
- Las cards del kanban muestran el bullet de color y el texto de próxima acción.
- Los filtros rápidos devuelven el subconjunto esperado.
- La home del CRM muestra "Hoy te toca contactar" con 5 items.

---

### Bloque 6 — Analítica y pulido

**Objetivo:** cerrar el dashboard del §6.3 y métricas agregadas.

**Cambios:**

- Implementar las queries de pipeline, conversión, tiempos medios, disciplina en `crm_db.py` (funciones `analitica_pipeline()`, `analitica_conversion_etapas()`, `analitica_disciplina_comercial()`).
- Cablear al endpoint `/api/crm/analitica/pipeline`.
- Render básico en la home del CRM (tabla simple + barras horizontales en CSS puro).
- Texto del `motivo_riesgo` en los payloads de `/api/crm/seguimiento/hoy` y `/api/crm/seguimiento/riesgo`.
- Traducción de `next_action_type` a texto en una pequeña tabla en JS.

**Dependencias:** Bloques 2-5.

**Complejidad:** media (2 días).

**Riesgo:** bajo.

**Criterio de aceptación:**

- El endpoint `/api/crm/analitica/pipeline` devuelve los 5 bloques del §6.3.
- Las tasas de conversión se calculan correctamente con los datos existentes de `crm_oportunidades_historial`.
- El usuario puede leer sin ayuda "qué está pasando" abriendo la home.

---

### Resumen de esfuerzo

| Bloque | Día-persona | Paralelizable |
|---|---|---|
| 1. Migración | 1 | Debe ir primero |
| 2. Motor (módulo puro) | 2-3 | Después de 1 |
| 3. Integración eventos | 1 | Después de 2 |
| 4. Endpoints | 1 | Después de 2 |
| 5. UI mínima | 1-2 | Después de 4 |
| 6. Analítica y pulido | 2 | Después de 3-5 |

**Total:** 8-10 días-persona. Entregable mínimo funcional (quick win): Bloques 1-4 + badges del 5, ~5 días.

---

## 9. Casos de prueba y criterios de aceptación

Los siguientes son tests funcionales de caja negra sobre `calcular_seguimiento_oportunidad()`. Todos deben implementarse en `test_crm_seguimiento.py`. Los SLAs usados son los del seed §3.3.

**Convenciones:** `hoy = 2026-04-11`. "Oportunidad mínima" = `{estado, fecha_creacion, fecha_entrada_etapa, ultima_interaccion_fecha, ultima_interaccion_direccion, importe_estimado, fecha_estimada_cierre, override}`.

### Caso 1. Lead nuevo sin interacciones

**Input:** `estado=lead, fecha_creacion=2026-04-11, fecha_entrada_etapa=2026-04-11, ultima_interaccion_fecha=None, importe_estimado=None, override=None`.

**Output esperado:**

- `next_action_type = 'primer_contacto'`
- `next_action_date = 2026-04-16`
- `estado_respuesta = 'na'`
- `priority_score = 40` (base lead + 0 + 0 + 0 + 0 + 0)
- `riesgo = 'verde'`

### Caso 2. Lead viejo sin interacciones

**Input:** `estado=lead, fecha_creacion=2026-03-20, fecha_entrada_etapa=2026-03-20, ultima_interaccion_fecha=None, importe_estimado=10000, override=None`.

**Output:**

- `next_action_type = 'primer_contacto'`
- `next_action_date = 2026-04-11` (tope a hoy)
- `dias_en_etapa_actual = 22` > `sla_dias_en_etapa (14)` → **esta regla gana en realidad, ver precedencia**.

Corrección: la precedencia §4.4 pone "lead sin interacciones" antes que "estancada". Resultado final: `primer_contacto`. Pero `riesgo = rojo` porque `dias_en_etapa > sla`. `priority_score = 40 + 2 + 0 + 0 + 0 + 0 = 42` (0 atraso porque `next_action_date = hoy`). Score bajo pero riesgo alto — intencional, el usuario lo ve por el color, no por el orden.

**Lección del caso 2:** `next_action_type` y `riesgo` no son consistentes siempre. Es correcto y no se arregla.

### Caso 3. Cotización enviada con presupuesto vivo

**Input:** `estado=cotizacion_enviada, fecha_entrada_etapa=2026-03-30, ultima_interaccion_fecha=2026-04-01 (out), importe_estimado=25000, estado_respuesta=pendiente (inferido), override=None`.

**Cálculo:** `dias_sin_contacto = 10 > 5 (sla)`, `dias_en_etapa = 12 < 30`, estado_respuesta pendiente.

**Output:**

- `next_action_type = 'recordar_presupuesto'` (regla 6 gana antes que 7).
- `next_action_date = 2026-04-11`.
- `priority_score = 75 + 5 + 0 + 10 + 0 + 0 = 90`.
- `riesgo = 'ambar'` (estado_respuesta pendiente y dias_sin_contacto >= sla, pero no > 2× sla).

### Caso 4. Negociación en importe alto con cierre cercano

**Input:** `estado=negociacion, fecha_entrada_etapa=2026-04-05, ultima_interaccion_fecha=2026-04-09 (out), importe_estimado=80000, fecha_estimada_cierre=2026-04-18, override=None`.

**Cálculo:** `dias_sin_contacto=2 < 3 (sla)`, `dias_en_etapa=6 < 20`.

**Output:**

- `next_action_type = 'cerrar'`
- `next_action_date = max(2026-04-11, 2026-04-09+3) = 2026-04-12`
- `priority_score = 90 + 16 + 0 + 10 + 0 + 0 = 116`
- `riesgo = 'verde'`

### Caso 5. Oportunidad estancada

**Input:** `estado=contacto_inicial, fecha_entrada_etapa=2026-03-10, ultima_interaccion_fecha=2026-04-05 (out), importe_estimado=5000, override=None`.

**Cálculo:** `dias_en_etapa=32 > 21 (sla)`.

**Output:**

- `next_action_type = 'revisar_estancada'`
- `next_action_date = 2026-04-11`
- `priority_score = 55 + 1 + 0 + 0 + 0 + 0 = 56`
- `riesgo = 'rojo'` (regla 2 del rojo)

### Caso 6. Respuesta recibida tras enviar presupuesto

**Input:** `estado=cotizacion_enviada, fecha_entrada_etapa=2026-04-01, ultima_interaccion_fecha=2026-04-07 (in), importe_estimado=15000, override=None`.

**Cálculo:** última interacción es inbound → `estado_respuesta = recibida`.

**Output:**

- Regla 6 NO aplica (estado_respuesta ≠ pendiente).
- Regla 7 NO aplica.
- Cae en regla 8 (default). `next_action_type = 'recordar_presupuesto'` (default de la etapa).
- `next_action_date = 2026-04-07 + 5 = 2026-04-12`.
- `priority_score = 75 + 3 + 0 + 10 + 0 + 0 = 88`.
- `riesgo = 'verde'`.

### Caso 7. Override manual explícito

**Input:** `estado=negociacion, ultima_interaccion_fecha=2026-04-09 (out), importe_estimado=40000, override={fecha_siguiente_accion=2026-04-20, siguiente_accion='Llamar para cerrar contrato'}`.

**Cálculo:** override presente, fecha en ventana válida → el motor no decide.

**Output:**

- `next_action_type = 'cerrar'` (por keyword matching).
- `next_action_date = 2026-04-20`.
- `next_action_source = 'usuario'`.
- `priority_score` usa esa fecha: `90 + 8 + 0 + 10 + 0 + 0 = 108`.
- `riesgo = 'verde'`.

**Criterio de aceptación del override:** después de este test, forzar `recalcular_seguimiento_todas()` 100 veces seguidas y verificar que `next_action_date` sigue siendo `2026-04-20` y `next_action_source = usuario`. El motor nunca pisa.

### Caso 8. Override caducado

**Input:** mismo que Caso 7 pero `override.fecha_siguiente_accion = 2026-04-05` (hace 6 días).

**Cálculo:** ventana es `hoy-3d = 2026-04-08`. La fecha del override es anterior → caducado → el motor toma control.

**Output:** como si no hubiera override. El motor aplica reglas. Como estado=negociacion, resultado ≈ Caso 4 pero con fechas ajustadas.

### Caso 9. Aplazada

**Input:** `estado=aplazada, fecha_entrada_etapa=2026-03-15, ultima_interaccion_fecha=2026-03-14 (out), importe_estimado=20000, override=None`.

**Cálculo:** regla 3 aplica. `next_action_date = 2026-03-15 + 30 = 2026-04-14`.

**Output:**

- `next_action_type = 'reactivar'`.
- `next_action_date = 2026-04-14` (3 días en el futuro).
- `priority_score = 20 + 4 + 0 + 0 - 15 + 0 = 9`.
- `riesgo = 'verde'`.

### Caso 10. Aplazada ya vencida

**Input:** mismo que Caso 9 pero `fecha_entrada_etapa = 2026-02-01`, `ultima_interaccion_fecha = 2026-02-01`.

**Cálculo:** regla 3 aplica. `next_action_date = 2026-02-01 + 30 = 2026-03-03`. Vencida hace 39 días.

**Output:**

- `next_action_type = 'reactivar'`.
- `next_action_date = 2026-03-03`.
- `dias_atraso = 39`, `peso_atraso = 30` (capado).
- `priority_score = 20 + 4 + 30 + 0 - 15 + 0 = 39`.
- `riesgo = 'rojo'` (dias_atraso > 3).

### Caso 11. Inbound Gmail de empresa, oportunidad sin oportunidad_id vinculada

**Input:** empresa tiene 2 oportunidades abiertas. Llega un hilo Gmail nuevo con `From: cliente@solaresdelsur.es`, `empresa_id = 17`, sin `oportunidad_id`.

**Comportamiento esperado:**

- `guardar_hilo_como_interaccion()` crea la interacción con `direccion='in'`, `oportunidad_id=NULL`.
- Dispara `recalcular_seguimiento_por_empresa(17)`.
- Las 2 oportunidades abiertas pasan `estado_respuesta` a `'recibida'`.
- **Pero** `ultima_interaccion_fecha` de las oportunidades **no** se actualiza, porque el inbound no está vinculado a ellas.

### Caso 12. Eliminación de interacción que era la más reciente

**Input:** oportunidad con 3 interacciones. Se elimina la más reciente.

**Comportamiento esperado:**

- Recálculo de la oportunidad.
- `ultima_interaccion_fecha` retrocede al `MAX` de las 2 restantes.
- `estado_respuesta` se recalcula.
- `priority_score`, `next_action_date`, `riesgo` se recalculan.

### Criterios de aceptación globales

- `pytest` completo pasa (incluye tests existentes + nuevos).
- No hay warnings de SQLite.
- Ningún endpoint del contrato actual ha cambiado de forma (solo adiciones).
- `/api/crm/seguimiento/hoy` devuelve en < 100 ms sobre BD de producción.
- Migración corre contra una BD real y la deja consistente.

---

## 10. Riesgos técnicos y decisiones a vigilar

### 10.1. Riesgo: inferencia de dirección Gmail poco precisa

El `From` del último mensaje del hilo puede no representar el último movimiento real del hilo si los headers vienen raros. **Mitigación:** si no se puede parsear el dominio del `From`, se asume `out` y se marca `_debug` en logs. No se bloquea la creación de la interacción. El usuario siempre puede corregir manualmente (futuro; no en v1.5).

### 10.2. Riesgo: drift entre `init_crm_db()` y script de migración

Hay dos lugares que crean schemas: `crm_db.init_crm_db()` y `scripts/migration_crm_v15.py`. Si divergen, problemas. **Decisión:** el script es la fuente de verdad documentada y el `init_crm_db()` ejecuta exactamente los mismos ALTERs con try/except. Añadir un test que compare resultado de ambos enfoques sobre una BD vacía.

### 10.3. Riesgo: recálculo en eventos duplica trabajo

Crear una interacción con oportunidad → recalcular esa oportunidad → recalcular empresa (porque el motor de Gmail también llama al de empresa). **Decisión:** solo se llama `recalcular_seguimiento_por_empresa` cuando la interacción **no** tiene `oportunidad_id`. Si lo tiene, solo se recalcula esa una. Evita N+1.

### 10.4. Riesgo: `crm_oportunidades_historial` puede no ser consistente

Hay dos caminos que escriben historial: `actualizar_oportunidad()` y `cambiar_estado_oportunidad()`. Ambos ya funcionan bien (revisados). Pero el drag del kanban → ¿pasa por alguno? El frontend debe llamar a `PATCH /api/crm/oportunidades/:id/estado` (que ya existe, línea 335). **Verificación manual obligatoria** tras Bloque 5. Si el drag hoy llama a `PUT /api/crm/oportunidades/:id` completo, también escribe historial porque `actualizar_oportunidad()` lo hace.

### 10.5. Riesgo: `keyword matching` en `siguiente_accion` falla con textos reales

El usuario escribe "follow up Enric del tema precio" → ninguna keyword pega → cae en default de etapa. Aceptable: el motor respeta la fecha del usuario (lo crítico) y el tipo es secundario. **Mitigación:** si esto molesta, la siguiente iteración añade un campo estructurado `siguiente_accion_tipo` como enum opcional en `crm_interacciones`. No ahora.

### 10.6. Riesgo: usuarios crean interacciones manuales `tipo=email` que realmente son emails recibidos

La asunción del §5.5 (email manual = out) puede fallar. **Mitigación:** si se detecta molesto, se añade un dropdown "dirección" al formulario manual en una iteración posterior. No en v1.5.

### 10.7. Riesgo: frontend en `index.html` monolítico

El fichero es grande y cualquier edición puede romper otras partes. **Mitigación:** todos los selectores nuevos llevan prefijo `crm-seg-` para no colisionar. Los nuevos event listeners se añaden en un bloque contiguo dentro del script existente, no en mitad de otras funciones.

### 10.8. Riesgo: rendimiento de `/api/crm/analitica/pipeline`

Las queries de conversión escanean `crm_oportunidades_historial`. Con histórico creciente (años), podría ralentizarse. **Mitigación:** ventana temporal fija (180 días) por defecto; el `WHERE` con índice por fecha lo controla. Añadir `CREATE INDEX ix_crm_oph_fecha ON crm_oportunidades_historial(fecha)` si hace falta.

### 10.9. Riesgo: `seguimiento_recalculado_en` como gatillo del recálculo diario

Si el backend se reinicia varias veces al día, el gatillo ya está activado y no vuelve a disparar — lo cual está bien. Pero si nadie accede al CRM durante 3 días, el recálculo no se ejecuta. **Asunción:** si nadie abre el CRM, no hace falta recalcular. Cuando abra, recalculará. Aceptado.

### 10.10. Decisión a vigilar: SLAs iniciales

Los valores del seed pueden no encajar con el negocio de Sergio. **Plan:** tras 2 semanas en uso, revisar con Sergio y ajustar con un simple `UPDATE crm_etapa_sla SET ...`. No hacer UI para esto todavía.

---

## 11. Qué dejo explícitamente fuera de esta fase

**Por bajo ROI o sobrecoste:**

- UI de edición de `crm_etapa_sla`. Queda como SQL.
- Clasificación automática del cuerpo de emails con LLM.
- Vinculación automática Gmail thread → oportunidad (requeriría clasificación semántica).
- Forecasting probabilístico.
- Secuencias automáticas de seguimiento (cadencias).

**Por falta de datos:**

- Scoring predictivo de win rate.
- Segmentación por sector/tamaño/región.
- Análisis de comportamiento del cliente a lo largo del ciclo.

**Por riesgo técnico:**

- Migración a Postgres.
- Extracción del frontend CRM a módulos separados.
- Refactor general de `crm_db.py`.
- Integración con WhatsApp Business oficial.
- Notificaciones push.

**Por prematuros:**

- Multi-usuario con roles/permisos finos y asignación por oportunidad (añadir `owner_id` queda para cuando exista un segundo comercial real).
- Historia completa de cambios por campo (auditoría tipo event sourcing).
- Dashboard personalizable.
- Export avanzado a Excel con formato/gráficos.
- KPIs individuales por comercial.
- Mobile-first.

**Por innecesarios a esta escala:**

- Cache Redis / background jobs.
- Cron programado (Task Scheduler de Windows, systemd timers).
- Event bus interno.
- Tests de integración end-to-end con Selenium/Playwright.

---

## Tabla resumen de cambios

| # | Cambio | Archivo / zona afectada | Impacto | Complejidad | Prioridad |
|---|---|---|---|---|---|
| 1 | Migración aditiva (9 cols en `crm_oportunidades` + `direccion` en `crm_interacciones` + tabla `crm_etapa_sla` + índices) | `scripts/migration_crm_v15.py` (nuevo), `interfaz_facturas/core/crm_db.py` (`init_crm_db`) | Alto — habilita todo | Baja | **P0 — obligatorio** |
| 2 | Módulo nuevo de reglas puras del motor | `interfaz_facturas/core/crm_seguimiento.py` (nuevo) | Alto — es el corazón del valor | Media | **P0 — obligatorio** |
| 3 | Hooks en crear/editar oportunidad e interacción | `interfaz_facturas/core/crm_db.py` (líneas ~765, ~803, ~840, ~1033, ~1067, ~1108) | Medio — dispara el motor | Baja | **P0 — obligatorio** |
| 4 | Hook en Gmail sync + backfill de `direccion` | `interfaz_facturas/core/gmail_sync.py` (líneas ~130-210 y ~246-296) | Medio — alimenta `estado_respuesta` | Baja | **P0 — obligatorio** |
| 5 | Endpoint `GET /api/crm/seguimiento/hoy` | `interfaz_facturas/routes/crm.py` (añadir al final) | Alto — vista diaria | Baja | **P0 — obligatorio** |
| 6 | Endpoint `GET /api/crm/seguimiento/riesgo` | `interfaz_facturas/routes/crm.py` | Alto — detección temprana | Baja | **P0 — obligatorio** |
| 7 | Endpoint `POST /api/crm/seguimiento/recalcular` | `interfaz_facturas/routes/crm.py` | Bajo — soporte/debug | Muy baja | P1 — recomendable |
| 8 | Parámetro `filtro` en `GET /api/crm/oportunidades` | `interfaz_facturas/routes/crm.py` (línea 285), `crm_db.listar_oportunidades` (línea 956) | Medio — filtros rápidos | Baja | **P0 — obligatorio** |
| 9 | Endpoint `GET /api/crm/analitica/pipeline` | `interfaz_facturas/routes/crm.py` + funciones nuevas en `crm_db.py` | Medio — visibilidad estratégica | Media | P1 — recomendable |
| 10 | Badges/contadores en panel oportunidades | `interfaz_facturas/index.html` (~línea 1780) | Medio — UX diaria | Baja | **P0 — obligatorio** |
| 11 | Render de `riesgo` + `next_action` en cards kanban | `interfaz_facturas/index.html` (función JS de render de cards) | Alto — visibilidad en kanban | Baja-media | **P0 — obligatorio** |
| 12 | Banner de riesgo en modal oportunidad | `interfaz_facturas/index.html` (~línea 1814) | Medio — contexto al editar | Baja | P1 — recomendable |
| 13 | Cards "Hoy" + "Riesgo" en home CRM | `interfaz_facturas/index.html` (~línea 1515-1560) | Medio — primer punto de entrada | Baja | P1 — recomendable |
| 14 | Columnas + filtro rápido en vista lista | `interfaz_facturas/index.html` (~línea 1791-1809) | Medio — operativa | Baja | P1 — recomendable |
| 15 | Traducción `next_action_type` a texto + texto `motivo_riesgo` | `interfaz_facturas/core/crm_seguimiento.py` (backend) | Bajo — UX | Muy baja | P1 — recomendable |
| 16 | Tests unitarios del motor (12+ casos de §9) | `interfaz_facturas/tests/test_crm_seguimiento.py` (nuevo) | Alto — seguridad de la lógica | Media | **P0 — obligatorio** |
| 17 | Refactor `crm_db.py` (separar en submódulos) | — | — | Alta | **EVITAR en v1.5** |
| 18 | Extracción del frontend CRM a ficheros propios | — | — | Alta | **EVITAR en v1.5** |
| 19 | UI de edición de `crm_etapa_sla` | — | Bajo | Media | **EVITAR en v1.5** |
| 20 | Clasificación semántica de emails con LLM | — | — | Muy alta | **EVITAR en v1.5** |

### Prioridades (leyenda)

- **P0 — obligatorio:** sin esto no hay v1.5 utilizable.
- **P1 — recomendable:** mejora sustancial; se puede entregar en segundo PR.
- **EVITAR:** explícitamente fuera de fase.

---

## Cierre

Este documento cierra todas las decisiones abiertas de Fase 1. La siguiente fase debe ser exactamente:

1. PR del Bloque 1 (migración).
2. PR del Bloque 2 con tests (motor puro).
3. PR del Bloque 3 (hooks en eventos CRM y Gmail).
4. PR del Bloque 4 (endpoints).
5. PR del Bloque 5 (UI mínima en `index.html`).
6. PR del Bloque 6 (analítica y pulido).

Cada PR es pequeño, aislado, mergeable, y deja el sistema funcionando. Ningún PR requiere tocar funciones existentes más allá de añadir llamadas al final de ellas. Ningún refactor amplio.
