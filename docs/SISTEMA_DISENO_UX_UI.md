# Sistema de diseño UX/UI – Plataforma de gestión multiempresa

Definición del layout común, patrones de listas y formularios, y puntos de enganche para futuros módulos (proyectos, RRHH), aplicable a facturas, terceros y bancos.

---

## 1. Layout común

### 1.1. Estructura de página (ya existente, consolidar)

- **Cabecera fija (sticky)**:
  - **Menú principal**: módulos de primer nivel (Finanzas, Proyectos, RRHH). El módulo activo determina el submenú visible.
  - **Submenú**: opciones del módulo activo.
    - Finanzas: Proveedores (Únicos, Facturas, CeCos), Clientes (Únicos, Facturas), Control de calidad, Bancos.
    - Proyectos: Cotizados, Vivos, Terminados, Transporte, Onboarding.
    - RRHH: Equipo, Reserva, Alumni, Nóminas, Adelantos.
  - **Selector de empresa**: debe ser visible y único en toda la aplicación. Ubicación acordada: en la cabecera (junto al menú o en una barra superior) o como primer control en cada panel que requiera contexto de empresa. Decisión: mantener un único selector de empresa en cabecera cuando se implemente la unificación; mientras tanto, cada panel puede seguir teniendo su propio `<select>` de empresa que se rellene desde `/api/empresas`.
- **Área de trabajo (container)**:
  - Contenido del panel activo (Facturas, Proveedores, Clientes, Bancos, etc.).
  - Patrón actual: columnas (col-left / col-right) o una sola columna según el panel.

### 1.2. Reglas de layout

- Todos los módulos usan la misma cabecera y la misma navegación; solo cambia el panel visible (`panel-facturas`, `panel-bancos`, etc.).
- El selector de empresa (cuando sea único) debe mostrarse siempre que el panel requiera contexto de empresa (facturas, proveedores, clientes, bancos).
- Los paneles deben tener un título (h1) y un subtítulo opcional (p.subtitle) para contexto.
- Espaciado consistente: padding del container y de las cards según `app.css` actual (cards con padding, gaps entre secciones).

---

## 2. Componentes estándar (inventario y convenciones)

### 2.1. Botones

- **Primario (`.primary`)**: acción principal del formulario o de la pantalla (ej. "Procesar", "Guardar", "Confirmar conciliación"). Un solo botón primario destacado por zona.
- **Secundario (`.secondary`)**: acciones secundarias (ej. "Cargar listado", "Descargar Excel", "Cancelar"). Varios permitidos.
- **Destructivo**: para eliminar o acciones irreversibles. Usar estilo distinto (ej. fondo rojo suave o borde rojo) y confirmación antes de ejecutar. Ya existe patrón en `btn-eliminar-seleccionadas` / `btn-eliminar-seleccionadas:hover`.
- Convención: misma clase en toda la app para cada tipo; no inventar nuevas clases por pantalla.

### 2.2. Inputs y formularios

- **Select de empresa**: clase común `.select-empresa`. Rellenado por JS desde `GET /api/empresas`. Placeholder "Selecciona empresa…".
- **Selects de filtro**: mismo estilo que el de empresa; agrupar en una barra de filtros (`.listado-header` o equivalente) cuando haya varios (año, mes, proveedor, cliente, banco).
- **Input file**: para subida de facturas o de extractos bancarios; indicar `accept` según tipo (pdf/imágenes para facturas; .xlsx, .csv para bancos).
- **Labels**: asociados a cada control (`<label for="...">`); texto corto y claro.
- **Mensajes de estado/error**: zona única por card o por formulario (ej. `#status`, `div.status`) con `aria-live="polite"` para lectores de pantalla.

### 2.3. Tablas (listados)

- **Contenedor**: `.tabla-wrapper` con scroll horizontal si hace falta.
- **Tabla**: `<table>` con `<thead>` y `<tbody>`. Clase común para alineación de números: `.numero` (text-align right, monospace opcional).
- **Columnas de acciones**: última columna con botones "Ver", "Editar", "Eliminar" según caso. Mantener ancho reducido y iconos o texto corto.
- **Checkbox para selección múltiple**: columna con `<input type="checkbox">`; cabecera con "Seleccionar todas" cuando aplique.
- **Sin datos**: mensaje en una fila o bloque (ej. `#sin-datos`) cuando la lista está vacía.
- **Contador**: texto tipo "X facturas" o "X movimientos" junto a los filtros (ej. `.contador`).

### 2.4. Cards

- Bloque `.card` con padding y fondo blanco (o claro) para agrupar formularios, listados o secciones. Un card por bloque lógico (ej. "Procesar facturas", "Facturas cargadas", "Movimientos bancarios").

---

## 3. Patrones por tipo de pantalla

### 3.1. Pantalla de lista con filtros (facturas, movimientos bancarios, terceros)

- **Estructura**:
  1. Título + subtítulo.
  2. Barra de filtros: selector de empresa (obligatorio), filtros específicos (año, mes, proveedor, cliente, banco, fechas), botón "Cargar" o carga automática al cambiar empresa.
  3. Botones de acción: Exportar Excel, Descargar ZIP (si aplica), otros (ej. "Importar extracto" en bancos).
  4. Tabla de datos.
  5. Contador y, si aplica, paginación o "Cargar más".
- **Reutilización**: mismo patrón para "Facturas de proveedores", "Facturas de clientes", "Movimientos bancarios", "Listado de terceros (proveedores/clientes)"; solo cambian columnas y endpoint.

### 3.2. Pantalla de ficha (tercero, factura, movimiento)

- **Estructura**:
  1. Título con identificador (nombre del tercero, número de factura, o concepto del movimiento).
  2. Datos en secciones (Identidad, Contacto, Bancario; o Datos factura, Estado, Archivo).
  3. Botones: Editar, Guardar, Cancelar; si aplica, "Ver PDF", "Conciliar".
- **Reutilización**: ficha de tercero (cliente/proveedor) con mismos bloques lógicos; ficha de factura (solo lectura o edición limitada); detalle de movimiento con opción de conciliar.

### 3.3. Pantalla de conciliación (bancos)

- **Estructura**:
  1. Filtros: empresa, banco, rango de fechas.
  2. Lista de movimientos no conciliados (o todos con indicador de conciliado).
  3. Para cada movimiento (o al seleccionar uno): panel de "Candidatos" (facturas sugeridas por importe/fecha/referencia).
  4. Acción "Conciliar" que vincula movimiento ↔ factura y actualiza estado de pago.
- **Reutilización**: mismo patrón para pagos (facturas proveedores) y cobros (facturas clientes); cambian solo labels y origen de candidatos.

---

## 4. Puntos de enganche para Proyectos y RRHH

- **Proyectos**:
  - En facturas (proveedores): selector opcional "Proyecto / Centro de coste" para imputar la factura a un proyecto. Campo en el modelo de factura (ya existe "centro_coste" en proveedores_maestros; extender a base_maestra si se quiere por factura).
  - En facturas (clientes): ya existe campo "proyecto" en `facturas_clientes.csv`; mantener y mostrar en listado y ficha.
  - En el menú: módulo "Proyectos" con submenús ya definidos (Cotizados, Vivos, Terminados, Transporte, Onboarding); los paneles pueden estar vacíos o con contenido futuro.
- **RRHH**:
  - En movimientos bancarios: posibilidad de etiquetar un movimiento como "Nómina", "Adelanto", etc., y opcionalmente vincular a un empleado (cuando exista entidad Empleado).
  - En el menú: módulo "RRHH" con submenús (Equipo, Reserva, Alumni, Nóminas, Adelantos); paneles para explotar más adelante.
- **Resumen**: no hace falta cambiar el layout actual; los puntos de enganche son (1) campos opcionales en formularios de facturas y movimientos, y (2) estructura de menú ya preparada para Proyectos y RRHH.

---

## 5. Bocetos de pantallas (descripción funcional)

### 5.1. Pantalla de lista de facturas con filtros

- Cabecera: menú Finanzas > Proveedores > Facturas.
- Card "Facturas cargadas": selector empresa, filtros año y mes, botones Cargar listado, Descargar Excel, Descargar facturas, Eliminar seleccionadas, Alertas.
- Tabla: columnas Fecha, Proveedor, CIF/NIF, País, Localidad, Concepto, Nº factura, Base, IVA, Retenciones, Total a pagar, Acciones (Ver, Editar). Checkbox por fila.
- Contador debajo de la barra de filtros.
- (Futuro) Columna opcional "Proyecto" o "CeCo" si se imputa por proyecto.

### 5.2. Pantalla de ficha de tercero (cliente/proveedor)

- Cabecera: menú Finanzas > Proveedores > Únicos (o Clientes > Únicos).
- Título: nombre del tercero.
- Secciones: Identidad (NIF, nombre, país, localidad), Contacto (dirección, email, teléfono), Bancario (IBAN principal, condiciones de pago), Relación con empresas (lista de empresas con las que trabaja y estado activo/inactivo).
- Botones: Editar, Guardar, Cancelar. Opcional: "Ver facturas asociadas" que lleve al listado de facturas filtrado por este tercero.

### 5.3. Pantalla de listado de movimientos bancarios con sugerencias de conciliación

- Cabecera: menú Finanzas > Bancos.
- Filtros: empresa, banco, fecha_desde, fecha_hasta. Botones Cargar, Importar extracto, Exportar Excel.
- Tabla de movimientos: columnas Fecha, Concepto, Importe, Saldo, Banco, Referencias, Empresa, Estado conciliación, Acciones.
- Al hacer clic en "Conciliar" (o en una fila): panel lateral o modal con "Facturas candidatas" (misma empresa, importe similar, fecha próxima) y botón "Conciliar con esta factura". Tras confirmar, se actualiza estado de pago de la factura y se marca el movimiento como conciliado.

---

## 6. Resumen Fase 4 (UX/UI transversal)

- Layout común: cabecera sticky con menú principal y submenús por módulo; selector de empresa visible; container con cards y paneles.
- Componentes estándar: botones primario/secundario/destructivo; selects e inputs con labels; tablas con wrapper, columna numérica y acciones; cards para agrupar.
- Patrones: lista con filtros + tabla + acciones; ficha con secciones y botones Editar/Guardar; pantalla de conciliación con lista de movimientos y candidatos a factura.
- Puntos de enganche: proyecto/CeCo en facturas de proveedores; proyecto ya en facturas de clientes; RRHH en movimientos (nómina, empleado) y menú listo.
- Bocetos: descritos arriba para lista de facturas, ficha de tercero y listado de movimientos con conciliación.

Este documento sirve como referencia para mantener coherencia al añadir o modificar pantallas en facturas, terceros, bancos, y futuros módulos de proyectos y RRHH.
