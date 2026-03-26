# Prueba de humo — HD | ERP

Tiempo estimado: 15 minutos. Ejecutar tras cambios grandes.

## 1. Login (1 min)
- [ ] Abrir la URL del ERP en el navegador
- [ ] Introducir credenciales → debe redirigir a la app principal
- [ ] Verificar que el titulo "HD | ERP" aparece en la pestana
- [ ] Credenciales incorrectas → no debe entrar (mensaje de error o rechazo)

## 2. Finanzas — Dashboard (1 min)
- [ ] Click en Finanzas en el sidebar
- [ ] Verificar que aparecen los 5 KPIs (facturacion clientes, cobros pendientes, proveedores, pagos pendientes, margen)
- [ ] Verificar que la tabla de rentabilidad muestra proyectos
- [ ] Verificar que el pipeline comercial muestra presupuestos en negociacion (si hay)
- [ ] Click en una card de navegacion (Proveedores, Clientes, Bancos) → navega al submodulo

## 3. Finanzas — Facturas proveedor (2 min)
- [ ] Click en card "Proveedores"
- [ ] Seleccionar empresa → cargan facturas en la tabla
- [ ] Abrir una factura (click en Editar) → modal de 4 secciones (Proveedor, Datos, Importes, Pago)
- [ ] Verificar que el indicador de vinculacion con tercero aparece (verde o naranja)
- [ ] Cerrar sin guardar
- [ ] Si hay facturas con descuadre, verificar que aparece el icono de advertencia

## 4. Finanzas — Facturas cliente (2 min)
- [ ] Click en card "Clientes" (o navegar al subpanel de clientes)
- [ ] Seleccionar empresa → cargan facturas
- [ ] Abrir una factura → modal de 4 secciones (Cliente, Datos, Importes, Cobros)
- [ ] Verificar campo "Vincular a proyecto" con dropdown de proyectos
- [ ] Verificar campos Retenciones y Anticipos
- [ ] Verificar indicador de descuadre (verde si cuadra, rojo si no)
- [ ] Cerrar sin guardar

## 5. CRM (2 min)
- [ ] Click en CRM en el sidebar
- [ ] Empresas: seleccionar una empresa → ficha con secciones Presupuestos y Proyectos
- [ ] Oportunidades Kanban: verificar que las cards se ven con badges de presupuesto/proyecto
- [ ] Interacciones: crear una interaccion de prueba (llamada) → verificar que aparece en la lista
- [ ] Borrar la interaccion de prueba

## 6. Presupuestos (2 min)
- [ ] Click en Presupuestos en el sidebar → listado con metric cards
- [ ] Click en "+ Nuevo presupuesto" → formulario con 4 secciones
- [ ] Verificar que el selector de clientes despliega opciones
- [ ] Anadir una partida desde catalogo → verificar layout 2 columnas (descripcion izq, numeros der)
- [ ] Verificar indicadores de completitud (puntos rojos/verdes)
- [ ] Cancelar sin guardar
- [ ] Si hay presupuesto existente: abrirlo → verificar que carga datos, plantilla T&C, badge de proyecto

## 7. Proyectos — Dashboard (3 min)
- [ ] Click en Proyectos en el sidebar
- [ ] Proyectos Vivos: click en un proyecto → se abre el dashboard completo
- [ ] Verificar KPIs agrupados (Avance, Financiero, Operativo)
- [ ] Tab Operativo: verificar Recursos (3 columnas: Personas, Maquinas, Vehiculos), Partes, Certificaciones, Facturacion, Costes
- [ ] Tab Gestion: verificar Presupuestos, Interacciones CRM, Documentos, Historial
- [ ] Certificaciones: click en "+ Nueva certificacion" → modal con periodo y precios → Generar
- [ ] Certificaciones: click en una certificacion → modal con detalle diario y resumen economico
- [ ] Certificaciones: click en "Descargar PDF" → se abre PDF landscape con logo, tabla y totales
- [ ] Verificar navegacion cruzada: click en badge de presupuesto → navega al presupuesto
- [ ] Desde el presupuesto: click en badge de proyecto → vuelve al dashboard
- [ ] Boton "← " vuelve al listado de proyectos
- [ ] Proyectos Cotizados: verificar tabla con columna presupuesto

## 8. Transporte (1 min)
- [ ] Click en Transporte en el sidebar
- [ ] Verificar que el mapa Leaflet carga
- [ ] Verificar listado de transportistas

## 9. Consola y errores (1 min)
- [ ] Abrir F12 → Console durante todo el recorrido
- [ ] No debe haber errores JS rojos (warnings amarillos son aceptables)
- [ ] La terminal del servidor no debe mostrar tracebacks en flujo normal

---

## Registro de ejecuciones

| Fecha | Persona | Resultado | Notas |
|-------|---------|-----------|-------|
|       |         |           |       |
