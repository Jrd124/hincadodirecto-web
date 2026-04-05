# CRM Roadmap — Hincado Directo ERP

> Actualizado: 2026-04-05
> Autor: Claude (PM + Full-Stack + DevOps)
> Estado: **Fase 1 en implementación**

---

## Arquitectura del módulo

### Modelo de datos central

```
crm_empresas  ←── tercero_id ──→  terceros (tabla base ERP)
     │
     ├── crm_contactos       (personas físicas)
     ├── crm_interacciones   (actividades manuales — Fase 1/2)
     ├── crm_oportunidades   (pipeline comercial)
     │       ├── presupuesto_id → presupuestos
     │       └── proyecto_id   → proyectos
     └── crm_empresa_etiquetas
```

El link entre CRM y Presupuestos/Proyectos es doble:
- **Directo vía oportunidad**: `crm_oportunidades.presupuesto_id` / `crm_oportunidades.proyecto_id`
- **Indirecto vía tercero**: `presupuestos.tercero_id = crm_empresas.tercero_id` (para el panel de ficha empresa)

### Stack
- **Backend**: Flask (Python), SQLite (`gestion.db`)
- **Frontend**: SPA vanilla JS + HTML (sin framework)
- **Auth Gmail (Fase 3)**: OAuth2 Google Workspace, scopes `gmail.readonly`

---

## FASE 1 — MVP CRM completado ✅

**Objetivo**: CRM plenamente usable con navegación robusta y enlaces a Presupuestos/Proyectos.

### Lo que YA existía antes de Fase 1

| Componente | Estado |
|---|---|
| CRUD empresas (backend + frontend) | ✅ |
| CRUD contactos (backend + frontend) | ✅ |
| CRUD interacciones y oportunidades | ✅ |
| Ficha empresa con secciones Presupuestos + Proyectos | ✅ |
| Sync desde tabla `terceros` | ✅ |
| Script seed inicial desde `terceros` | ✅ |

### Cambios añadidos en Fase 1

#### 1. Campo `dominio` en `crm_empresas`
- **Migration**: `ALTER TABLE crm_empresas ADD COLUMN dominio TEXT`
- Se extrae automáticamente del email si no se provee
- Necesario para Fase 3 (búsqueda Gmail por dominio)

#### 2. Función `resumen_empresa()` en `crm_db.py`
- Devuelve: última interacción (fecha, tipo, asunto), contadores rápidos
- Endpoint: `GET /api/crm/empresas/<id>/resumen`

#### 3. Card "Última interacción" en ficha empresa
- Visible en cabecera de la ficha, antes de las secciones
- Muestra: tipo, fecha, asunto/descripción breve

#### 4. Navegación Presupuesto → Empresa CRM
- En el panel de presupuestos: badge/link "Ver empresa CRM" si existe `tercero_id`
- Navega al panel CRM con la empresa ya seleccionada

#### 5. Import desde Excel (`scripts/import_crm_excel.py`)
- Lee las hojas `Clientes` y `Contactos` del Excel mini-CRM
- Upsert idempotente: match por `nombre` (normalizado) para empresas, por `email` o `nombre+empresa` para contactos
- Importa también la "última interacción" de Clientes como `crm_interaccion` tipo `nota`
- Parámetros: `--dry-run`, `--only-empresas`, `--only-contactos`

### Archivos modificados en Fase 1

| Archivo | Tipo | Cambio |
|---|---|---|
| `core/crm_db.py` | MODIFICADO | Migration `dominio` + `resumen_empresa()` |
| `routes/crm.py` | MODIFICADO | `GET /api/crm/empresas/<id>/resumen` |
| `static/js/modules/crm.js` | MODIFICADO | Card resumen + campo dominio |
| `index.html` | MODIFICADO | HTML card resumen + input dominio |
| `static/js/modules/presupuestos.js` | MODIFICADO | Link "Ver en CRM" |
| `scripts/import_crm_excel.py` | CREADO | Import idempotente desde Excel |
| `docs/CRM_ROADMAP.md` | CREADO | Este documento |

### Criterios de aceptación Fase 1

- [ ] Campo `dominio` guardado en empresa (editable en modal)
- [ ] Card "Última interacción" visible en cabecera ficha empresa
- [ ] Desde lista/detalle de presupuesto existe link que navega al panel CRM
- [ ] `python scripts/import_crm_excel.py <path>` importa empresas y contactos sin duplicados
- [ ] `--dry-run` imprime lo que haría sin tocar la base de datos

---

## FASE 2 — Activity timeline real

**Objetivo**: Timeline de actividades unificado + base para Gmail.

### Cambios planificados

1. **Tabla `crm_actividades`** (extensión de interacciones con más campos):
   - `gmail_thread_id TEXT` (stub nullable)
   - `gmail_snippet TEXT` (stub nullable)
   - `source TEXT CHECK(source IN ('manual','gmail','whatsapp'))` default `'manual'`

2. **UI Timeline mejorada**:
   - Iconos por tipo de actividad
   - Filtros por tipo/fecha
   - Card "Última actividad" en cabecera empresa (se alimenta de esta tabla)

3. **API**:
   - `GET /api/crm/empresas/<id>/actividades` (paginado)
   - `POST /api/crm/actividades` (crear actividad manual)

### Archivos estimados Fase 2

| Archivo | Cambio |
|---|---|
| `core/crm_db.py` | Nueva tabla `crm_actividades` + migration |
| `routes/crm.py` | Endpoints actividades |
| `static/js/modules/crm.js` | Timeline UI mejorado |
| `index.html` | HTML timeline |

---

## FASE 3 — Gmail sync on-demand

**Objetivo**: Valor real de integración Gmail sin sobrecargar el sistema.

### Diseño técnico

#### Flujo "Sync Gmail" por empresa (manual, botón en ficha)
1. Lee `crm_empresas.dominio` y emails de `crm_contactos`
2. Llama Gmail API: `from:(emails contactos) OR to:(emails contactos)` + `domain:(dominio empresa)`
3. Recupera últimos N=10 hilos (solo metadata: threadId, subject, lastMessageDate, participants, snippet)
4. Para el hilo más reciente: genera resumen ≤5 líneas via LLM (`core/llm.py` ya existe)
5. Guarda en `crm_actividades` con `source='gmail'`, `gmail_thread_id`, `gmail_snippet`

#### Job manual global "Sync 24h/7d"
- Botón en panel admin CRM
- Procesa máx 20 empresas/run (configurable via env `CRM_GMAIL_BATCH_SIZE`)
- Solo procesa si `gmail_last_sync` > umbral configurable
- Frecuencia recomendada MVP: **1 vez al día** (cron o manual)

#### Seguridad
- OAuth2 con scope `https://www.googleapis.com/auth/gmail.readonly`
- `access_token` y `refresh_token` en variables de entorno (`GMAIL_ACCESS_TOKEN`, `GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`)
- **No se guarda contenido completo del email**, solo snippet (≤200 chars) + metadata
- Los tokens nunca se almacenan en la BD

#### Nuevos archivos Fase 3

| Archivo | Descripción |
|---|---|
| `core/gmail_sync.py` | Cliente Gmail API + lógica de sync |
| `routes/gmail.py` | Blueprint `/api/gmail/*` |
| `scripts/gmail_oauth_setup.py` | Helper one-time OAuth flow |
| `.env.example` | Vars de entorno necesarias |

---

## FASE 4 — Automatización robusta (propuesta)

**No implementar hasta validar Fase 3.**

### Opciones a evaluar

**Gmail Push (Pub/Sub)**
- Google Cloud Pub/Sub → webhook Flask → crea actividad automática
- Coste: requiere Google Cloud project + topic + subscription
- Beneficio: notificaciones en tiempo real sin polling
- Recomendación: implementar solo si el volumen de empresas > 100 activas con Gmail sync

**Reglas de seguimiento**
- Si `última_actividad` > 30 días → alerta en dashboard CRM (badge rojo)
- Si oportunidad en estado `negociacion` > 15 días sin actividad → recordatorio

**Pipeline Kanban**
- La API de oportunidades ya soporta todos los estados del pipeline
- Falta: UI Kanban drag-and-drop (columnas por estado)
- Estimación: 2-3 días de trabajo frontend

---

## Decisiones de arquitectura

| Decisión | Elección | Alternativa descartada | Razón |
|---|---|---|---|
| DB | SQLite | PostgreSQL | Consistencia con ERP existente |
| Import masivo | Script Python CLI | UI upload | Más rápido, auditable, sin riesgo de UI |
| Link presupuesto↔CRM | Via `tercero_id` (indirecto) | Añadir `crm_empresa_id` a presupuestos | Evita migración invasiva; el link ya existe |
| Gmail sync MVP | On-demand manual | Cron automático | Menor complejidad operativa; suficiente para MVP |
| Tokens Gmail | Variables de entorno | Tabla en BD | Mejor seguridad; sin riesgo de leak en backups DB |

---

## Comandos útiles

```bash
# Importar Excel CRM (empresas + contactos)
python scripts/import_crm_excel.py "/path/to/00. HincadoDirecto_MiniCRM.xlsx"

# Solo dry-run (no toca la BD)
python scripts/import_crm_excel.py "/path/..." --dry-run

# Solo empresas
python scripts/import_crm_excel.py "/path/..." --only-empresas

# Solo contactos
python scripts/import_crm_excel.py "/path/..." --only-contactos
```
