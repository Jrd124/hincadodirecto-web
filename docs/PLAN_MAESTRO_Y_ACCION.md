# Plan maestro y puntos de acción – Plataforma multiempresa

**Documento único de control del proyecto.** Contiene el plan maestro, los puntos de acción 1 y 2, el checklist de ejecución paso a paso, el inventario actual, el modelo de terceros, la definición de flujos, el diseño de bancos y conciliación, los checklists de QA y el resumen del módulo Transporte. Todo en un solo archivo para evitar referencias externas y facilitar el control.

**Resumen ejecutivo.** Objetivo: evolucionar la interfaz de facturas a plataforma multiempresa (terceros, empresa siempre visible, bases para bancos). **Estado:** Punto 1 y Punto 2 completados; Parte G (bancos y conciliación, G.1–G.9) completada; Parte J (migración facturas de clientes a SQLite) completada. **Próximos pasos:** Bloque 10 – QA y validación; **mejoras de UX en bancos y tarjetas** (Parte G §9); **ampliación de conciliación** (Parte G §10: diferencias de céntimos, cobro de facturas de cliente); automatización de pruebas (Parte H).

---

## Índice

1. [Parte A – Plan maestro (resumen)](#parte-a--plan-maestro-resumen)
2. [Parte B – Puntos de acción 1 y 2](#parte-b--puntos-de-accion-1-y-2)
3. [Parte D – Inventario actual (facturas, clientes, bancos)](#parte-d--inventario-actual-facturas-clientes-bancos)
4. [Parte E – Modelo de terceros](#parte-e--modelo-de-terceros)
5. [Parte F – Flujos Fase 2 (definición por flujo)](#parte-f--flujos-fase-2-definicion-por-flujo)
6. [Parte C – Checklist de ejecución paso a paso](#parte-c--checklist-de-ejecucion-paso-a-paso)
7. [Parte G – Diseño bancos y conciliación](#parte-g--diseño-bancos-y-conciliacion)
8. [Parte H – QA y checklists de pruebas funcionales](#parte-h--qa-y-checklists-de-pruebas-funcionales)
9. [Parte I – Proyectos > Transporte (anexo)](#parte-i--proyectos--transporte)
10. [Parte J – Migración facturas de clientes a SQLite](#parte-j--migración-facturas-de-clientes-a-sqlite)
11. [Resumen de estado](#resumen-de-estado)

---

## Parte A. Plan maestro (resumen)

### 1. Objetivos y alcance

- **Objetivo principal**: Evolucionar el módulo actual de facturas de proveedores hacia una plataforma interna de gestión **multiempresa**, priorizando **clientes y proveedores (terceros)** y dejando bases para bancos, proyectos y RRHH.
- **Horizonte**: Fases 0 (inventario) → 1 (modelo terceros) → 2 (flujos) → 3 (bancos/conciliación) → 4 (UX/UI transversal). La ejecución en código se concentra primero en **Punto 1** (empresa) y **Punto 2** (modelo de terceros en la interfaz).

### 2. Arquitectura funcional por módulos

| Módulo | Descripción breve |
|--------|-------------------|
| **Facturas** | Alta y gestión de facturas de proveedores; archivado en carpetas; **empresa** en todas las facturas; referencia a **tercero** (proveedor) y futuro proyecto. |
| **Terceros** | Unificar clientes y proveedores: ficha con identidad (nombre, CIF/NIF, tipo), contacto, IBAN, condiciones de pago; integración con facturas (cada factura referencia un tercero). |
| **Empresas** | Entidad que agrupa facturas, terceros, bancos, proyectos, RRHH. Fuente de verdad: `config/empresas.toml` y API `/api/empresas`. Toda entidad principal asociada a una empresa. |
| **Bancos** | Movimientos bancarios asociados a empresa; diseño de conciliación con facturas y terceros (incl. pagos agrupados con tarjeta). |
| **Proyectos / RRHH** | Preparados a nivel de diseño; ya existe submódulo Transporte (ver Parte I). |

### 3. Modelo conceptual (resumen)

- **Empresa** → agrupa Factura, Tercero, MovimientoBancario, Proyecto, Empleado.
- **Factura** → pertenece a Empresa; referencia a **Tercero** (proveedor/cliente) y opcionalmente Proyecto.
- **MovimientoBancario** → pertenece a Empresa; vinculable a Factura y Tercero (conciliación).

### 4. Fases del plan (estado de diseño)

| Fase | Objetivo | Dónde está el detalle |
|------|----------|------------------------|
| **Fase 0** | Inventario y foto real de facturas, clientes, bancos y relaciones. | Parte D |
| **Fase 1** | Modelo unificado de terceros y multiempresa (Tercero, EmpresaTercero). | Parte E |
| **Fase 2** | Reordenar flujos críticos: empresa siempre visible; selector de tercero en facturas. | Parte F |
| **Fase 3** | Bancos y conciliación (entidades, casos de uso, formato extractos). | Parte G |
| **Fase 4** | UX/UI transversal (layout común, patrones listas/formularios). | Documento aparte `SISTEMA_DISENO_UX_UI.md` si existe. |

### 5. Gobernanza

- **Antes de escribir código**: Verificar que la funcionalidad encaja en los módulos definidos, que el modelo conceptual está actualizado si hay nuevas relaciones y que hay checklist de pruebas mínimas (Parte H).
- **Criterio de éxito inicial**: Facturas estables en multiempresa; módulo de terceros operativo; relaciones factura–empresa–tercero claras y navegables; diseño de bancos listo para implementación posterior.

---

## Parte B. Puntos de acción (ejecución prioritaria)

### Punto 1 – Reforzar visibilidad de empresa y validaciones en paneles Finanzas

**Objetivo:** Que en todos los paneles de Finanzas (Facturas, Proveedores, Clientes, Bancos) quede siempre claro para qué empresa se trabaja y que no se permitan acciones críticas sin empresa seleccionada.

**Alcance realizado:**
- **Bancos**: Empresa obligatoria al importar extracto (mensaje en `bancos-status` si falta); obligatoria para cargar listado de movimientos (mensaje en tabla y contador); obligatoria para exportar Excel (alert si falta). Select del listado con opción por defecto "Selecciona empresa…" (ya no "Todas las empresas").
- **Refuerzo visual**: En cada panel (Facturas, Proveedores, Centros de coste, Clientes, Bancos) un texto **"Empresa: [nombre]"** visible cuando hay empresa seleccionada (spans actualizados al cambiar el select).
- **Fuente de empresas**: Ya existente: `config/empresas.toml` y `GET /api/empresas`; todos los `.select-empresa` se rellenan desde esa API.

**Estado:** ✅ Completado.

---

### Punto 2 – Modelo de terceros en la interfaz

**Objetivo:** Llevar el modelo definido en la Parte E a la interfaz y a los flujos existentes, sin romper lo que ya funciona. Incluye: datos (Tercero, EmpresaTercero), APIs, pantallas de listado/alta/edición de terceros, y selector de tercero en facturas (con opción de alta rápida cuando corresponda).

**Alcance (según priorización en Parte F):**
1. Listado de proveedores únicos alineado con `proveedores_maestros.csv` y, si se añade capa de datos, escritura de terceros.
2. Selector de proveedor en edición (y alta) de factura (desplegable desde maestros; opción "Crear nuevo").
3. Listado de clientes únicos (derivado de `facturas_clientes.csv` o futuro maestro) y selector de cliente en facturas de clientes.
4. Alta rápida de tercero desde factura (modal o pantalla pre-rellenada con datos de la factura).
5. Backend: modelo de datos/API para Tercero y EmpresaTercero (o adaptación de CSV/BD existente según decisión técnica); migración o lectura unificada desde los CSV actuales.

**Estado:** ✅ Completado (Bloques 5–9 ejecutados; ver Parte C).

---

## Parte D. Inventario actual (facturas, clientes, bancos)

### 1. Resumen general

- **Ámbito**: interfaz de facturas actual (`interfaz_facturas`) y datos asociados en `data/` y `config/`.
- **Módulos cubiertos**: Facturas de proveedores y base maestra de facturas; facturas de clientes (emitidas) ligadas a proyectos de transporte; primer módulo de bancos y movimientos de caja.
- **Objetivo**: documentar qué hace hoy cada módulo, qué datos maneja y cómo se relacionan, sin cambiar código.

### 2. Facturas de proveedores

- **Código principal**: Backend Flask en `interfaz_facturas/backend.py`; lógica reutilizable en `interfaz_facturas/core/facturas_servicios.py`.
- **Fuentes de datos**:
  - Base maestra: `data/empresas/{empresa_id}/base_maestra_facturas.csv`
  - Archivado físico: `data/Facturas Recibidas/{empresa_id}/{Año}/{MM. Mes}/...pdf`
  - Config: `config/empresas.toml`
- **Columnas principales de base_maestra_facturas.csv**: empresa_id, fecha_factura, proveedor, nif_proveedor, pais_proveedor, localidad_proveedor, resumen_concepto, numero_factura, base_imponible, iva, retenciones_total, total_factura, total_a_pagar, categoria, ruta_archivo, ruta_destino, flag_error, motivo_error, comentarios_revision, extraccion_vision.
- **Flujo típico**: Recepción → Procesamiento/extracción (OCR + OpenAI) → Archivo PDF → Consulta/export desde interfaz. Relación con empresas vía `empresa_id`.

### 3. Facturas de clientes (emitidas) y clientes

- **Datos**: CSV `data/empresas/{empresa_id}/facturas_clientes.csv` con empresa_id, fecha_factura, cliente, cif_nif, pais, localidad, proyecto, tipologia, num_hincadoras, num_ayudantes, pricing_servicio, pricing_transporte, iva, total_a_pagar, numero_factura, ruta_archivo. PDFs en `data/Facturas Emitidas/{empresa_id}/{Año}/{MM. Mes}/`. **Tras ejecutar la Parte J (Bloque 11)**, la fuente de verdad pasará a ser la tabla `facturas_cliente` en `gestion.db`; los CSV quedarán como respaldo histórico.
- **Clientes**: Hoy identificados por cliente + cif_nif en el CSV; no hay tabla maestra de clientes separada; los datos pueden reconstruirse desde las columnas del CSV. La interfaz ofrece listados por cliente/proyecto y filtros por empresa y fechas.

### 4. Bancos y movimientos de caja

- **Código**: Blueprint `bancos_bp` en `backend.py`; funciones `_get_bancos_db()`, `_init_movimientos_db()`, `_insertar_movimientos_lista(...)`. Directorio `BANCOS_DIR` (config en `config.py`); SQLite en `MOVIMIENTOS_DB`.
- **Tabla movimientos**: id, fecha_operacion, fecha_valor, concepto, importe, saldo, banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id, hash_dedup, created_at. Índices por banco, fecha_operacion, empresa_id y único por hash_dedup.
- **Endpoints**: GET /api/bancos/movimientos (filtros, saldo acumulado), GET /api/bancos/movimientos_export, DELETE /api/bancos/movimientos/solo-fecha. Importación vía POST /api/bancos/importar/santander y /bbva.
- **Flujo**: Importación Excel/CSV → normalización → inserción con deduplicación por hash_dedup → consulta y exportación desde la interfaz.

### 5. Relaciones actuales entre módulos

- Facturas proveedores ↔ Empresas: empresa_id en base_maestra_facturas.
- Facturas clientes ↔ Empresas: empresa_id en facturas_clientes.csv.
- Facturas clientes ↔ Clientes: cliente + cif_nif en CSV; sin tabla maestra de clientes.
- Bancos ↔ Empresas: empresa_id en tabla movimientos.
- Bancos ↔ Terceros/Facturas: sin vínculo persistente; conciliación manual o visual.

### 6. Incoherencias y puntos de mejora

- Empresas: convivencia de lista en backend con config/empresas.toml; frontend duplicaba selects (ya mitigado con /api/empresas).
- Clientes/proveedores no unificados: sin modelo común de Tercero ni tablas maestras únicas.
- Relación bancos–facturas ausente: movimientos sin factura_id ni tercero_id; sin reglas de conciliación formales.
- Código y datos mezclados en algunas rutas (p. ej. bajo data/Facturas Recibidas/.../Sin fecha/): limpieza recomendada.

### 7. Resumen Fase 0

- Ecosistema coherente pero acoplado; empresa_id como eje común; empresas en config/empresas.toml; bancos con SQLite y endpoints operativos. Faltan: modelo unificado de terceros, relaciones persistentes movimientos–facturas/terceros, y limpieza de código en carpetas de datos.

---

## Parte E. Modelo de terceros

### 1. Objetivo del modelo

- Unificar clientes y proveedores en un solo diseño, hoy repartidos en `data/empresas/*/proveedores_maestros.csv`, columnas de proveedor en `base_maestra_facturas.csv` y columnas de cliente en `facturas_clientes.csv`. Modelo multiempresa alineado con `config/empresas.toml`.

### 2. Entidades principales

**Empresa**  
- Fuente de verdad: `config/empresas.toml`. Atributos: id, nombre.

**Tercero**  
- Representa cliente y/o proveedor. Atributos: tercero_id, nif, nombre_canonico, pais, localidad, direccion, email, telefono, es_cliente, es_proveedor, centro_coste.

**EmpresaTercero**  
- Relación empresa–tercero: empresa_id, tercero_id, alias_local, condiciones_pago, iban_principal, activo. Permite que un mismo tercero trabaje con varias empresas del grupo con condiciones distintas.

### 3. Mapeo desde ficheros actuales

**Proveedores**: Desde `proveedores_maestros.csv` (nombre_canonico, nif, direccion, localidad, pais, email, telefono, centro_coste) crear/encontrar Tercero por (nif, nombre_canonico) y EmpresaTercero por empresa_id. Desde base_maestra_facturas usar nif_proveedor y proveedor para enlazar con Tercero; proveedores no en maestros = candidatos a alta.

**Clientes**: Desde facturas_clientes.csv crear/encontrar Tercero por (cif_nif, cliente) y EmpresaTercero con es_cliente=True. A futuro, tabla maestra de clientes a partir del agregado de facturas_clientes.

### 4. Multiempresa: decisiones de diseño

- Identidad global del tercero: par (nif, nombre_canonico). Un tercero puede tener varias EmpresaTercero.
- Datos por empresa (centro_coste, condiciones_pago, iban) en EmpresaTercero, no en Tercero.
- Alta desde factura: si NIF no existe como Tercero, crear Tercero y EmpresaTercero con datos de la factura.

### 5. Flujos de uso previstos

- Alta manual: usuario elige empresa y rol(es), introduce datos → se crea Tercero y EmpresaTercero.
- Edición: cambios de identidad en Tercero; condiciones por empresa en EmpresaTercero.
- Alta rápida desde factura proveedor/cliente: si no existe tercero, proponer crear con datos de la factura; si existe, enlazar.

### 6. Historias de usuario clave

- Crear proveedor/cliente con datos fiscales y bancarios; buscar por nombre o CIF; ver facturas asociadas a un tercero.
- Ver con qué empresas trabaja un tercero; desactivar relación empresa–tercero sin borrar histórico.
- (A futuro) Vincular movimiento bancario a tercero y ver facturas relacionadas.

### 7. Resumen Fase 1

- Modelo lógico Empresa, Tercero, EmpresaTercero; camino de migración desde CSV actuales; flujos de alta/edición y alta desde factura; preparado para tabla maestra de clientes e integración con bancos.

---

## Parte F. Flujos Fase 2 (definición por flujo)

Para cada flujo existente: punto de entrada, datos mínimos, entidades afectadas; cambios mínimos UX/UI; priorización de ejecución.

### 1. Flujos existentes – Definición por flujo

| Flujo | Punto de entrada | Entidades afectadas |
|-------|------------------|---------------------|
| **Procesar facturas proveedores** | Finanzas > Proveedores > Facturas, formulario empresa + archivos. | Empresa, Factura (base_maestra_facturas); Tercero no persistente aún. |
| **Listado/export facturas proveedores** | Misma pantalla, sección "Facturas cargadas". Empresa obligatoria. | Empresa (filtro), Factura (lectura). Tercero implícito (columna proveedor/NIF). |
| **Edición factura proveedor** | Botón Editar en tabla. | Factura (CSV). En evolución: selector Tercero. |
| **Listado proveedores únicos** | Finanzas > Proveedores > Únicos. | Empresa, Tercero (proveedores_maestros.csv). |
| **Facturas clientes (listado)** | Finanzas > Clientes > Facturas. | Empresa, Factura (facturas_clientes.csv), Tercero implícito. |
| **Listado clientes únicos** | Finanzas > Clientes > Únicos. | Empresa, Tercero (cliente); sin maestro hoy. |
| **Bancos – Importar** | Finanzas > Bancos, formulario empresa + banco + Excel. | Empresa, Movimiento bancario. |
| **Bancos – Listado/export** | Misma pantalla, filtros empresa/banco/fechas. | Empresa, Movimiento bancario; en evolución conciliación con Factura/Tercero. |

### 2. Cambios mínimos UX/UI

- **Empresa**: Selector visible en cada panel; refuerzo "Empresa: [Nombre]"; validación antes de Procesar/Cargar/Importar (ya aplicado en Punto 1).
- **Tercero en facturas**: Selector de proveedor en facturas proveedores (desplegable/búsqueda + "Crear nuevo"); selector de cliente en facturas clientes; alta rápida desde factura (modal o pantalla pre-rellenada).

### 3. Priorización para ejecución

1. Reforzar visibilidad de empresa (hecho).  
2. Listado proveedores únicos + escritura si se añade.  
3. Selector de proveedor en edición de factura + "Crear nuevo".  
4. Listado clientes únicos + selector de cliente en facturas clientes.  
5. Alta rápida de tercero desde factura.  
6. Bancos: mantener flujos actuales; más adelante conciliación (Parte G).

---

## Parte C. Checklist de ejecución paso a paso

Lista única de tareas concretas para llevar a cabo el plan hasta completar el Punto 2. Marcar con `[x]` al completar cada ítem.

### Bloque 1 – Fase 0 (inventario y documentación)

- [x] **0.1** Documentar pantallas y campos actuales de Facturas/Proveedores.
- [x] **0.2** Documentar pantallas y campos de Clientes.
- [x] **0.3** Documentar funcionalidades y campos de Bancos.
- [x] **0.4** Mapa de relaciones actuales entre módulos e incoherencias (Parte D).

### Bloque 2 – Fase 1 (diseño modelo de terceros)

- [x] **1.1** Documento con modelo lógico Tercero + EmpresaTercero y relación con Empresa.
- [x] **1.2** Mapeo desde `proveedores_maestros.csv` y `base_maestra_facturas.csv` al modelo.
- [x] **1.3** Mapeo desde `facturas_clientes.csv` al modelo.
- [x] **1.4** Historias de usuario y flujos de uso (alta manual, alta desde factura) documentados.

### Bloque 3 – Fase 2 (definición de flujos)

- [x] **2.1** Definir punto de entrada, datos mínimos y entidades afectadas por cada flujo (facturas proveedores, proveedores únicos, facturas clientes, clientes únicos, bancos import/listado).
- [x] **2.2** Identificar cambios mínimos UX/UI: empresa siempre visible; selector de tercero en facturas.
- [x] **2.3** Priorización de ejecución: refuerzo empresa → proveedores → selector en facturas → clientes → alta rápida → bancos.

### Bloque 4 – Punto 1: Reforzar empresa y validaciones

- [x] **4.1** Bancos – Exigir empresa al importar: mensaje en `bancos-status` y no enviar formulario si falta.
- [x] **4.2** Bancos – Exigir empresa para cargar movimientos: no hacer fetch sin empresa; mensaje en tabla y contador.
- [x] **4.3** Bancos – Exigir empresa para exportar Excel: alert y no abrir descarga si falta.
- [x] **4.4** Añadir en cada panel de Finanzas un indicador "Empresa: [nombre]" que se actualice al cambiar el select.
- [x] **4.5** Ajustar labels/placeholders de selects de empresa en Bancos (obligatorio; "Selecciona empresa…").

### Bloque 5 – Punto 2: Modelo de terceros – Backend y datos

- [x] **5.1** Decidir soporte de datos para Tercero/EmpresaTercero: ampliar CSV existentes, nueva tabla SQLite, o híbrido (documentar en código o en `docs/`). **Decisión: SQLite.** Tablas `terceros` y `empresa_tercero`; migración desde CSV maestros existentes; resto del crecimiento (contabilidad, conciliación, proyectos, nóminas, etc.) se apoyará en el mismo modelo relacional.
- [x] **5.2** Implementar esquema SQLite: crear tablas `terceros` y `empresa_tercero` (o equivalente), script de migración desde `proveedores_maestros.csv` por empresa, y función/servicio que lea proveedores por `empresa_id` desde la BD para la API e interfaz.
- [x] **5.3** Si se añade escritura de maestros: implementar alta/edición de filas en `proveedores_maestros.csv` (o equivalente en el modelo elegido) con validación de NIF/nombre. **HECHO:** POST/PUT /api/proveedores con validación; guardado en SQLite (terceros_db).
- [x] **5.4** Implementar lectura de clientes únicos: a partir de `facturas_clientes.csv` por empresa (agrupar por cliente/CIF). **HECHO:** `_get_clientes_unicos_empresa(empresa_id)` agrupa por (cliente, cif_nif) y devuelve lista con cliente, cif_nif, pais, localidad, proyecto.
- [x] **5.5** Exponer API(s) para terceros: `GET /api/empresas/<empresa_id>/proveedores` y `GET /api/empresas/<empresa_id>/clientes`.
- [x] **5.6** (Opcional) Endpoint unificado `GET /api/empresas/{id}/terceros?rol=proveedor|cliente|ambos` si se unifica modelo en backend. **HECHO:** GET /api/empresas/<empresa_id>/terceros?rol=proveedor|cliente|ambos; devuelve { terceros, empresa_id, rol }; cada ítem con rol, nif, nombre_canonico, direccion, localidad, pais, email, telefono; proveedores con centro_coste; clientes con proyecto.

### Bloque 6 – Punto 2: Modelo de terceros – Interfaz (proveedores)

- [x] **6.1** Panel Proveedores > Únicos: asegurar que el listado usa la API o lectura unificada de proveedores por empresa (no duplicar lógica). **HECHO:** ya usa GET /api/proveedores?empresa_id=.
- [x] **6.2** Formulario de alta de proveedor: campos alineados con Parte E (nombre canónico, NIF, dirección, localidad, país, email, teléfono, centro de coste); guardar en maestro (SQLite o CSV). **HECHO:** modal con todos los campos; POST /api/proveedores.
- [x] **6.3** Formulario de edición de proveedor: cargar datos existentes y permitir guardar cambios. **HECHO:** botón Editar por proveedor; PUT /api/proveedores con old_nombre_canonico y old_nif.
- [x] **6.4** Validación en frontend: empresa obligatoria; NIF y nombre como mínimos para alta. **HECHO:** validación en submit del formulario.

### Bloque 7 – Punto 2: Modelo de terceros – Interfaz (selector en facturas proveedores)

- [x] **7.1** En el listado o edición de facturas de proveedores: añadir selector (desplegable o búsqueda) de proveedor que consuma la lista de proveedores de la empresa seleccionada. **HECHO:** desplegable en modal editar factura; se rellena con GET /api/proveedores?empresa_id=.
- [x] **7.2** Al elegir un proveedor del selector: rellenar automáticamente en la factura los campos proveedor/NIF (y los que correspondan) desde el maestro. **HECHO:** al elegir se rellenan proveedor, NIF, país, localidad.
- [x] **7.3** Opción "Crear nuevo proveedor": abrir modal o ir a pantalla de alta de proveedor (con posibilidad de pre-rellenar nombre/NIF desde la factura actual); al guardar, volver a la factura con ese proveedor ya seleccionado. **HECHO:** botón "Crear nuevo proveedor" y opción en el desplegable; modal de proveedor con nombre/NIF pre-rellenados; al guardar se cierra el modal de proveedor y se actualiza el selector y los campos de la factura.
- [x] **7.4** Si la base de facturas aún no tiene `tercero_id`: seguir guardando proveedor/NIF como hasta ahora; dejar preparado el campo para cuando exista identificador de tercero en el modelo de datos. **HECHO:** el PUT /api/factura sigue enviando proveedor y nif_proveedor; no se añade tercero_id por ahora.

### Bloque 8 – Punto 2: Modelo de terceros – Interfaz (clientes)

- [x] **8.1** Panel Clientes > Únicos: listado de clientes únicos por empresa (desde agregado de `facturas_clientes.csv` o desde maestro si existe). **HECHO:** el panel usa GET /api/empresas/<empresa_id>/clientes; se muestra cliente (CIF/NIF); título y selector de empresa en la misma fila como en Proveedores.
- [x] **8.2** Si se implementa maestro de clientes: formulario de alta/edición de cliente (campos análogos a proveedores; rol cliente). **HECHO:** maestro en SQLite (terceros + empresa_tercero con es_cliente=1); GET /api/empresas/<id>/clientes fusiona maestro + agregado y devuelve en_maestro; POST /api/clientes y PUT /api/clientes; panel Clientes Únicos con botón "Nuevo cliente", modal con cliente, CIF/NIF, dirección, localidad, país, proyecto, email, teléfono; botón "Editar" en clientes que están en el maestro.
- [x] **8.3** En facturas de clientes (listado/edición): añadir selector de cliente con opción "Crear nuevo cliente" y pre-rellenado desde datos de la factura cuando aplique. **HECHO:** en el modal editar factura de cliente: desplegable con clientes únicos (GET /api/empresas/<id>/clientes); al elegir se rellenan cliente, CIF, país, localidad, proyecto; opción "➕ Crear nuevo cliente" y botón para dejar selector en blanco y poder escribir un cliente nuevo (al guardar la factura el cliente aparecerá en el listado).

### Bloque 9 – Punto 2: Alta rápida y coherencia

- [x] **9.1** Flujo "Crear nuevo proveedor" desde factura: pantalla o modal con campos pre-rellenados (nombre, NIF, etc. de la factura); al guardar, asociar a la empresa de la factura y volver con el tercero seleccionado. **HECHO:** implementado en 7.3 (modal de proveedor desde factura + callback).
- [x] **9.2** Flujo "Crear nuevo cliente" desde factura de cliente: análogo al de proveedor. **HECHO:** implementado al actualizar 8.3 (modal de cliente desde factura + callback).
- [x] **9.3** Evitar duplicados: al buscar/crear tercero por NIF (y nombre), comprobar si ya existe antes de dar de alta. **HECHO:** POST /api/proveedores y POST /api/clientes devuelven 409 si ya existe el mismo nombre+NIF en la empresa.

### Bloque 10 – QA y validación (checklist para más tarde)

- [ ] **10.1** Regresión: se puede seguir registrando y consultando facturas, clientes y bancos como hasta ahora.
- [ ] **10.2** Arranque del backend de facturas correcto tras los cambios.
- [ ] **10.3** En todos los paneles de Finanzas, siempre se trabaja en contexto de empresa clara (selector + indicador "Empresa: [nombre]").
- [ ] **10.4** Crear un proveedor desde el panel Proveedores y comprobar que aparece en el selector al editar/registrar una factura de esa empresa.
- [ ] **10.5** Crear un proveedor desde "Crear nuevo" en una factura y comprobar que se guarda en maestros y queda seleccionado en la factura.
- [ ] **10.6** (Si aplica clientes) Crear un cliente y usarlo en factura de cliente; comprobar listado de clientes únicos.
- [ ] **10.7** (Tras Bloque 11) Regresión facturas de clientes: listado, alta, edición, borrado y export Excel/ZIP funcionan correctamente leyendo y escribiendo en SQLite (sin depender del CSV).

### Bloque 11 – Migración facturas de clientes a SQLite (Parte J)

Ejecutar los ítems de la [Parte J](#parte-j--migración-facturas-de-clientes-a-sqlite); marcar aquí cuando el bloque esté completado.

- [x] **11.1** Completar J.1–J.6 de la Parte J (tabla facturas_cliente, migración desde CSV, sustituir lectura/escritura por BD, endpoint de migración única).

---

## Parte G. Diseño bancos y conciliación

### 1. Inventario actual de bancos y limitaciones

- **Existente**: Blueprint bancos_bp, SQLite tabla movimientos (id, fecha_operacion, fecha_valor, concepto, importe, saldo, banco, codigo, numero_documento, referencia_1, referencia_2, empresa_id, hash_dedup, created_at, factura_proveedor_id, factura_cliente_id, conciliado_at, tarjeta_id, liquidacion_periodo). Endpoints: GET movimientos (filtros por banco, fechas, empresa, concepto; saldo acumulado; tarjeta_alias cuando vinculado), GET movimientos_export (mismos filtros), POST movimientos, POST importar/santander y /bbva, DELETE movimientos/solo-fecha y por IDs; conciliación: sugerencias, confirmar, desvincular; tarjetas: GET/POST/PUT tarjetas, liquidaciones-resumen, conciliar-movimiento, desvincular-movimiento. Deduplicación por hash_dedup.
- **Limitaciones aún abiertas**: Sin tercero_id en movimientos; formato importación solo Santander/BBVA; cobro de facturas de cliente (ingreso ↔ factura) pendiente; historial detallado de conciliaciones (tabla aparte) aparcado.

### 2. Diagrama de entidades y ampliación propuesta

- Mantener tabla movimientos; añadir (en migración futura): tercero_id, factura_proveedor_id / factura_cliente_id, conciliado_at, conciliado_por. Facturas: añadir estado_pago (pendiente | pagada | parcial) y opcionalmente movimiento_id o conciliacion_id.

### 3. Casos de uso de conciliación (prioridad)

1. Marcar factura de proveedor como pagada al conciliar (match por importe ± umbral y fecha; confirmar → vínculo movimiento–factura y estado_pago = pagada).  
2. Tratar diferencias de céntimos (umbral p. ej. 0,50 €; registrar como ajuste o nota).  
3. Cobro de factura de cliente (ingreso ↔ factura(s); estado_cobro).  
4. **Pagos agrupados con tarjeta**: facturas ↔ liquidación tarjeta (nivel 1); liquidación ↔ cargo bancario mensual (nivel 2). Movimiento bancario puede tener tipo/origen "tarjeta" y tarjeta_id/liquidacion_id.

### 4. Formato mínimo de extracto bancario

- Excel o CSV con al menos: fecha, importe, concepto. Opcionales: saldo, referencia, segunda referencia. Parámetros: empresa_id obligatorio, banco, mapeo de columnas a campos internos.

### 5. Estado de pago de la factura

- Recomendación primera versión: campo en la factura (estado_pago / estado_cobro) y opcionalmente movimiento_id. Al confirmar conciliación: actualizar fila de factura con estado_pago = pagada y referencia al movimiento.

### 6. Priorización

- Aprovechar tal cual: tabla movimientos, GET/POST/export/delete, import Santander/BBVA, saldo acumulado. Adaptar: nuevos parsers por banco. Implementar: sugerencias de conciliación, UI de confirmación, campo estado_pago en facturas. Aparcar: tabla separada de conciliaciones (histórico detallado).

### 7. Checklist Parte G (ejecución)

- [x] **G.1** Campo estado_pago en facturas de proveedores: añadir a base maestra (CSV) y API. Valores: `pendiente` | `pagada` | `parcial`; por defecto `pendiente` en lectura (filas sin campo o valor no válido) y al escribir filas nuevas o al reescribir CSV (PUT/DELETE). **HECHO:** CAMPOS_CSV_LISTA y campos en _base_maestra_csv incluyen estado_pago; _leer_facturas_proveedores_desde_csv normaliza a "pendiente"; PUT /api/factura acepta y persiste estado_pago; GET /api/facturas devuelve estado_pago en cada factura.
- [x] **G.2** Mostrar estado_pago en la interfaz (listado y/o modal edición de factura de proveedor) y permitir cambiarlo. **HECHO:** columna "Estado pago" en la tabla de facturas (listado principal y por proveedor); en el modal editar factura, select "Estado de pago" con opciones Pendiente, Pagada, Parcial; al guardar se envía estado_pago en el PUT.
- [x] **G.3** (Opcional) Migración en tabla movimientos: factura_proveedor_id, factura_cliente_id, conciliado_at; lógica de sugerencias de conciliación y UI de confirmación.
- [x] **G.4** Migrar base maestra de facturas de proveedores (CSV) a SQLite: tabla facturas_proveedor en gestion.db, migración de datos, sustituir lectura/escritura CSV por BD.
- [x] **G.5** Conciliación pagos con tarjeta (caso de uso 4): **Nivel 1**: agrupar facturas pagadas con tarjeta en una "liquidación" (entidad o agrupación); **Nivel 2**: vincular esa liquidación al movimiento bancario (cargo mensual de la tarjeta). **HECHO:** liquidaciones calculadas por tarjeta_id + periodo (YYYY-MM) desde facturas_proveedor; movimientos con tarjeta_id y liquidacion_periodo; tabla "Extractos por tarjeta y periodo" con total facturas, importe movimiento y pendiente; UI para vincular/desvincular movimiento a extracto (G.9); opción "Extracto mes siguiente" en factura (liquidacion_periodo).

### 8. Tarjetas bancos: diseño de módulo (banco ↔ tarjeta ↔ persona)

Objetivo: control centralizado de tarjetas de empresa (banco, titular, extractos) y asignación desde facturas para conciliar de forma eficiente.

**Estructura propuesta**

- **Submenú "Tarjetas bancos"** (dentro de Finanzas o Bancos): listado de tarjetas con filtro por empresa.
- **Por tarjeta**: banco, persona (titular de la tarjeta), identificador opcional (últimos 4 dígitos, nombre en la tarjeta). Histórico de extractos/liquidaciones por periodo (mes/año).
- **Por extracto**: total del periodo, facturas asociadas (las que tienen esa tarjeta asignada y periodo coherente), % del total asociado a facturas (100% = cerrado y conciliable), estado: *pendiente* (aún no ha llegado el cargo al banco), *cargo recibido* (hay movimiento bancario), *conciliado* (movimiento vinculado al extracto), *pagado* (opcional: dado de baja en banco).
- **Desde facturas (proveedores)**: en el listado o en el modal de edición, campo opcional **"Pagado con tarjeta"** (selector: tarjeta X – Banco / Persona). Si se asigna, la factura cuenta para el extracto de esa tarjeta en el mes de la factura (o periodo configurable) y la conciliación posterior (liquidación ↔ cargo bancario) es más directa.

**Entidades sugeridas (a implementar)**

| Entidad | Descripción |
|--------|-------------|
| **tarjetas** (o en misma BD gestión) | id, empresa_id, banco (texto o ref), persona_titular (nombre o ref), ultimos_4 (opcional), activa, created_at. |
| **liquidaciones_tarjeta** | id, tarjeta_id, periodo (ej. "2025-02" o fecha_inicio/fin), total, estado (borrador|cerrado|conciliado|pagado), movimiento_id (FK al cargo en banco, cuando se concilie). |
| **factura_tarjeta** | factura_proveedor_id (o factura_id + empresa), tarjeta_id, liquidacion_id (opcional: se puede inferir por tarjeta + periodo). |
| **movimientos** | Ya se añadirá tipo "tarjeta" y liquidacion_id (o factura_proveedor_id para pago simple). |

**Flujo resumido**

1. Alta de tarjetas: banco + persona; se listan en "Tarjetas bancos".
2. En facturas: al editar/registrar, opción "Pagado con tarjeta" → selector tarjeta. La factura queda vinculada a esa tarjeta (y al periodo según fecha).
3. En Tarjetas bancos: por cada tarjeta se ven los extractos (por mes): total facturas asignadas, si hay cargo en banco, si está conciliado. Indicador "100% asociado a facturas" y "Pendiente / Conciliado / Pagado".
4. Conciliación: desde Bancos (o desde Tarjetas bancos) vincular el movimiento "cargo tarjeta" al extracto/liquidación correspondiente; a partir de ahí las facturas de ese extracto pueden considerarse pagadas vía tarjeta.

**Otras ideas útiles**

- **Alertas**: extractos con facturas pero sin movimiento bancario conciliado (cargo esperado); facturas con tarjeta asignada pero no incluidas en ningún extracto cerrado.
- **Persona titular**: por ahora puede ser texto libre (nombre); más adelante vincular a empleados/terceros si existe ese módulo.
- **Cierre de extracto**: botón "Cerrar periodo" que fija el total y la lista de facturas de ese mes para esa tarjeta y permite solo entonces conciliar con el movimiento de banco.
- **Export**: listado de extractos por tarjeta (Excel/PDF) para archivo o auditoría.

**Checklist de ejecución (ampliación Parte G)**

- [x] **G.6** Maestro de tarjetas: tabla tarjetas (empresa_id, banco, persona_titular, opcional ultimos_4), CRUD y submenú "Tarjetas bancos" con listado (banco, persona, estado resumido). **HECHO:** tabla tarjetas en gestion.db; GET/POST/PUT /api/tarjetas y GET /api/empresas/<id>/tarjetas; pestaña "Tarjetas bancos" en Bancos con listado por empresa, alta de tarjeta (modal) y activar/desactivar.
- [x] **G.7** En facturas de proveedores: campo/selector "Pagado con tarjeta" (opcional); persistir tarjeta_id en factura (ampliar facturas_proveedor o tabla de relación factura–tarjeta). **HECHO:** columna tarjeta_id en facturas_proveedor (SQLite) con migración suave; PUT /api/factura acepta y guarda tarjeta_id; modal de edición de factura incluye selector "Pagado con tarjeta" poblado con tarjetas activas de la empresa (GET /api/empresas/{id}/tarjetas?solo_activas=true).
- [x] **G.8** Extractos/liquidaciones por tarjeta y periodo: modelo lógico de liquidación calculado a partir de las facturas con `tarjeta_id` (agrupación por tarjeta_id + periodo YYYY-MM en `facturas_proveedor`), cálculo de total desde facturas asignadas a esa tarjeta en el periodo y resumen en pantalla Tarjetas bancos. **HECHO:** endpoint GET `/api/empresas/{id}/tarjetas/liquidaciones-resumen` que agrega facturas_proveedor por tarjeta y mes (num_facturas, total_facturas, total_movimiento, pendiente_facturas); tabla "Extractos por tarjeta y periodo" con columnas Tarjeta, Periodo, Nº facturas, Total facturas, Importe mov., Pendiente, Estado, % asociado; soporte de liquidacion_periodo en factura (extracto mes siguiente).
- [x] **G.9** Conciliación extracto ↔ movimiento: vincular movimiento bancario (cargo) a liquidación; marcar extracto como conciliado; opcionalmente marcar facturas del extracto como pagadas. **HECHO:** columnas tarjeta_id y liquidacion_periodo en movimientos; POST /api/bancos/tarjetas/conciliar-movimiento y POST /api/bancos/tarjetas/desvincular-movimiento; en tabla Movimientos columna "Agrupación" con botón "Vincular a extracto" / texto "Tarjeta – YYYY-MM" y "Desvincular"; modal para elegir tarjeta y periodo (YYYY-MM) y confirmar; filtro de movimientos por concepto; GET movimientos devuelve tarjeta_id, liquidacion_periodo y tarjeta_alias.

### 9. Mejoras de UX en Bancos y Tarjetas (plan de trabajo)

Objetivo: mejorar la usabilidad y claridad del módulo Bancos y de la pestaña Tarjetas bancos, sin cambiar la lógica de negocio ya implementada.

**Checklist de mejora UX (pendiente)**

- [ ] **UX-B.1** Bancos – Listado de movimientos: mejorar legibilidad (agrupación por mes, resumen de saldo visible, filtros rápidos por tipo o concepto).
- [ ] **UX-B.2** Bancos – Importación: mensajes de éxito/error más claros; indicar número de movimientos importados y duplicados omitidos.
- [ ] **UX-B.3** Tarjetas bancos – Extractos por tarjeta y periodo: vista más clara del estado (pendiente / cargo recibido / conciliado); indicador visual cuando un extracto está al 100% asociado a facturas.
- [ ] **UX-B.4** Tarjetas bancos – Flujo “Vincular a extracto”: guiar al usuario (texto de ayuda o tooltip); confirmación explícita antes de vincular.
- [ ] **UX-B.5** (Opcional) Alertas o avisos: extractos con facturas pero sin movimiento bancario conciliado; facturas con tarjeta asignada y periodo sin cerrar.
- [ ] **UX-B.6** (Opcional) Export de extractos por tarjeta (Excel/PDF) para archivo o auditoría.

### 10. Ampliación de conciliación (pendiente)

Objetivo: cubrir los casos de uso 2 y 3 de conciliación definidos en el apartado 3 de esta Parte G (diferencias de céntimos y cobro de facturas de cliente). El historial detallado de conciliaciones (tabla aparte) sigue aparcado.

**Checklist de ampliación conciliación (pendiente)**

- [ ] **G.10** Diferencias de céntimos: definir umbral (p. ej. 0,50 €) para considerar un movimiento y una factura como coincidentes aunque difieran en céntimos; permitir registrar la conciliación con una nota o ajuste (campo opcional en movimientos o en lógica de sugerencias). UI: en la confirmación de conciliación, si la diferencia está dentro del umbral, mostrar aviso y campo opcional “Nota de ajuste”.
- [ ] **G.11** Cobro de facturas de cliente: vincular un ingreso bancario (movimiento con importe positivo) a una o varias facturas de cliente (emitidas). Añadir en facturas de cliente campo `estado_cobro` (pendiente | cobrada | parcial) y opcionalmente referencia al movimiento; endpoint o flujo para “conciliar cobro” (elegir movimiento de ingreso y factura(s) de cliente); actualizar estado_cobro y vínculo movimiento–factura. Incluir en listado de facturas de cliente la columna estado de cobro y, si aplica, filtro por pendiente de cobro.

---

## Parte H. QA y checklists de pruebas funcionales

Documento vivo de casos de prueba para la plataforma multiempresa.

### 1. Checklist Fase 0 (inventario actual)

- [ ] Registro y consulta de facturas de proveedores (empresa, listado, filtros, export Excel).
- [ ] Subida y procesamiento de facturas (empresa, PDFs, Procesar; mensaje estado y archivado).
- [ ] Clientes y facturas de clientes (navegar, empresa, listado sin 404/500).
- [ ] Bancos (empresa, cargar movimientos, export Excel).
- [ ] Arranque del backend (reiniciar, abrir URL, página y menús responden).

### 2. Checklist Fase 1 (modelo de terceros)

- [ ] Crear nuevo tercero (cliente o proveedor) en pantalla de alta; ver en listado o mensaje éxito.
- [ ] Pantallas actuales de clientes y proveedores cargan sin error tras cambios de modelo.
- [ ] Interfaz de facturas no rota (listado, export, detalle).

### 3. Checklist Fase 2 (flujos reordenados)

- [ ] Alta/edición de facturas, clientes y proveedores con empresa y tercero; datos coherentes en listados y exportaciones.
- [ ] Contexto de empresa siempre visible en cada pantalla que dependa de ella.

### 4. Checklist Fase 3 (bancos y conciliación)

- [ ] Importación de extractos (fichero prueba; movimientos con empresa; sin duplicados por hash).
- [ ] Conciliación simple: movimiento + factura pendiente → confirmar → factura pagada, movimiento conciliado; repetir 2–3 casos.
- [ ] Conciliación pagos tarjeta: facturas ↔ liquidación tarjeta; liquidación ↔ cargo bancario; estados correctos.

### 5. Plan de QA general

- Mantener este documento (Parte H) como referencia; al añadir funcionalidad, añadir caso de prueba; al corregir bug, añadir caso que lo reproduzca.
- **Automatizar (prioridad alta)**: GET /api/empresas, GET listados facturas y movimientos (200, estructura JSON); POST importar con fichero fijo y comprobar insertados.
- **Prioridad media**: tests unitarios lógica pura (NIF, hash dedup, filtrado CSV).
- **Prioridad baja**: E2E con navegador (Playwright) para flujo empresa → listado → export.
- **Cierre de fase**: todos los ítems del checklist de la fase pasados; sin regresiones en fases anteriores; incidencias documentadas con pasos para reproducir.

---

## Parte I. Proyectos > Transporte

Módulo para buscar **proveedores de transporte de maquinaria** situados **cerca de la ruta** entre origen y destino (OpenRouteService + geocodificación).

**Funcionamiento:** En Proyectos → Transporte se introducen origen y destino; el sistema calcula la ruta por carretera; se buscan proveedores a menos de 50 km de la ruta en `data/proveedores_transporte.csv`; se muestra distancia/duración de la ruta y lista de proveedores ordenada por cercanía con datos de contacto.

**Configuración:** Variable `OPENROUTESERVICE_API_KEY` en `.env`. CSV `data/proveedores_transporte.csv` con columnas: nombre (obligatorio), telefono, email, localidad (recomendado), lat, lon (opcionales; si no hay lat/lon se geocodifica por localidad).

**Estado:** Mapa operativo con ruta y marcadores de proveedores; listado de proveedores en la interfaz pendiente de incorporar. Código: `interfaz_facturas/core/transporte_servicios.py`.

---

## Parte J. Migración facturas de clientes a SQLite

Objetivo: dejar de usar `data/empresas/{empresa_id}/facturas_clientes.csv` como fuente de verdad y usar una tabla SQLite en `gestion.db`, con el mismo patrón que la migración de facturas de proveedores (Parte G, ítem G.4). Así se unifica el almacenamiento, se reduce el riesgo de corrupción por edición manual de CSV y se simplifican copias de seguridad (solo BD + config).

### 1. Estado actual

- **Fuente actual**: CSV `facturas_clientes.csv` por empresa; lectura y escritura en `backend.py` vía `_leer_facturas_clientes_desde_csv`, `_ruta_csv_clientes`, y escritura con `csv.DictWriter` en POST/PUT/DELETE factura_cliente y en export/eliminar.
- **Columnas** (CAMPOS_FACTURAS_CLIENTES): empresa_id, fecha_factura, cliente, cif_nif, pais, localidad, proyecto, tipologia, num_hincadoras, num_ayudantes, pricing_servicio, pricing_transporte, iva, total_a_pagar, numero_factura, ruta_archivo, hash_archivo.

### 2. Destino: tabla `facturas_cliente` en gestion.db

- **Base de datos**: misma que facturas proveedores y terceros (`gestion.db`).
- **Tabla**: `facturas_cliente` con columnas equivalentes al CSV (más `id` autoincremental). Incluir las mismas columnas que CAMPOS_FACTURAS_CLIENTES para no perder datos.
- **Migración única**: leer todos los `facturas_clientes.csv` existentes por empresa e insertar en la tabla; ejecutar una vez (endpoint tipo POST `/api/facturas_clientes/migrar-desde-csv` o similar).

### 3. Checklist de ejecución (Parte J)

- [x] **J.1** Crear módulo o ampliar `interfaz_facturas/core/` con lógica de BD para facturas de clientes: tabla `facturas_cliente` en `gestion.db` (esquema alineado con CAMPOS_FACTURAS_CLIENTES), función `init_facturas_cliente_db()` llamada en arranque del backend. **HECHO:** módulo `core/facturas_cliente_db.py` con tabla `facturas_cliente`, índices por empresa_id y (empresa_id, ruta_archivo); `ensure_dirs()` en backend llama a `facturas_cliente_db.init_facturas_cliente_db()`.
- [x] **J.2** Implementar lectura desde BD: `get_facturas_cliente_empresa(empresa_id)` que devuelva lista de dicts con los mismos campos que hoy devuelve el CSV. Implementar migración `migrar_desde_csv_clientes()` que lea cada `data/empresas/{empresa_id}/facturas_clientes.csv` e inserte en `facturas_cliente` (idempotente por empresa: reemplazar filas de esa empresa o evitar duplicados). **HECHO:** en `core/facturas_cliente_db.py`: `get_facturas_cliente_empresa(empresa_id)` devuelve lista de dicts con claves CAMPOS_FACTURAS_CLIENTE (+ id); `migrar_desde_csv_clientes()` recorre empresas (config o directorios con CSV), lee cada CSV, DELETE por empresa e INSERT; retorna empresas_procesadas, filas_migradas, errores.
- [x] **J.3** Sustituir en el backend todas las lecturas de facturas de clientes: que `_leer_facturas_clientes_desde_csv` (o función equivalente) llame a la BD en lugar de abrir el CSV. Mantener el mismo contrato (lista de dicts) para no romper listados, export, clientes únicos ni cache. **HECHO:** `_leer_facturas_clientes_desde_csv` ahora devuelve `facturas_cliente_db.get_facturas_cliente_empresa(empresa_id)`; todos los flujos que la usan (listado, export, clientes únicos, cache) siguen funcionando sin cambios.
- [x] **J.4** Sustituir todas las escrituras: POST /api/factura_cliente, PUT /api/factura_cliente y DELETE/eliminar facturas deben escribir en la tabla `facturas_cliente` (insert/update/delete por id o por clave natural), no en CSV. Export Excel/ZIP puede seguir leyendo desde BD. **HECHO:** en `facturas_cliente_db`: `insert_factura_cliente`, `insert_facturas_clientes`, `update_factura_cliente` (por numero_factura+fecha_factura+cliente), `delete_facturas_cliente_por_indices`, `get_hashes_empresa_cliente`. Backend: crear/actualizar/eliminar factura cliente y _base_maestra_csv_clientes/_get_hashes_csv_clientes usan BD; export Excel y ZIP leen desde BD.
- [x] **J.5** Añadir endpoint de migración única (ej. POST `/api/facturas_clientes/migrar-desde-csv`) que invoque `migrar_desde_csv_clientes()` y devuelva resumen (empresas procesadas, filas migradas, errores). Documentar en código o en `docs/` que tras ejecutarlo la fuente de verdad es la BD y los CSV pueden conservarse como respaldo histórico. **HECHO:** POST `/api/facturas_clientes/migrar-desde-csv` en el blueprint facturas_clientes; devuelve ok, mensaje, empresas_procesadas, filas_migradas, errores. Docstring del endpoint y de `migrar_desde_csv_clientes()` indican que la fuente de verdad es la BD tras la migración.
- [x] **J.6** Actualizar listado de clientes únicos (`GET /api/empresas/<id>/clientes`): si hoy se agrega desde facturas leídas por CSV, pasar a agregar desde facturas leídas por BD; compatibilidad con maestro (terceros) ya existente. **HECHO:** el agregado ya venía de `_get_clientes_unicos_empresa` → `_leer_facturas_clientes_desde_csv` (desde J.3 lee de BD). Actualizado docstring de `_get_clientes_unicos_empresa` y del endpoint a "agregado desde facturas de clientes (BD, tabla facturas_cliente)"; variable `desde_csv` renombrada a `agregado_facturas` en el handler.

### 4. Criterios de éxito

- Tras la migración, ningún flujo de facturas de clientes (listado, alta, edición, borrado, export, clientes únicos) lee ni escribe el CSV; todo usa `facturas_cliente` en SQLite.
- Ejecutar una vez el endpoint de migración con datos existentes y comprobar que los listados y export muestran los mismos datos.
- Opcional: añadir ítem en Bloque 10 (QA) para regresión de facturas de clientes tras migración.

---

## Resumen de estado

| Bloque | Descripción | Estado |
|--------|-------------|--------|
| 1–3 | Fase 0, 1 y 2 (diseño y documentación) | ✅ Completado |
| 4 | Punto 1 – Empresa y validaciones | ✅ Completado |
| 5–9 | Punto 2 – Modelo de terceros en backend e interfaz | ✅ Completado |
| 10 | QA y validación | Pendiente |
| 11 | Migración facturas de clientes a SQLite (Parte J) | Pendiente |
| G.1–G.9 | Bancos y conciliación (estado_pago, migración SQLite, tarjetas, extractos, vincular movimiento a extracto) | ✅ Completado |
| Parte G §9 | Mejoras UX en Bancos y Tarjetas (UX-B.1–UX-B.6) | Pendiente |
| Parte G §10 | Ampliación conciliación (G.10 diferencias céntimos, G.11 cobro facturas cliente) | Pendiente |

Al terminar el **Bloque 10** (QA) se considerará cerrada la validación del Punto 2 y de la Parte G implementada. El **Bloque 11** (Parte J) unifica el almacenamiento de facturas de clientes en SQLite. **Próximos pasos posibles:** Bloque 10 (QA), automatización de pruebas (Parte H), **mejoras de UX en bancos y tarjetas** (Parte G §9, ítems UX-B.1–UX-B.6), **ampliación de conciliación** (Parte G §10: G.10 diferencias de céntimos y nota de ajuste, G.11 cobro de facturas de cliente con estado_cobro e ingreso ↔ factura). Historial detallado de conciliaciones (tabla aparte) sigue aparcado.
