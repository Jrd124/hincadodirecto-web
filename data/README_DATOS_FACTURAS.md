Este directorio agrupa los datos usados por el equipo financiero de facturas.

Estructura recomendada:

- `facturas_entrada/`: carpeta de entrada donde depositas manualmente facturas y tickets para procesar.
- `Facturas Recibidas/`: raíz donde el Archivador moverá las facturas, con estructura:
  - `Facturas Recibidas/{Empresa}/Año/Mes/`
  - Ejemplo: `Facturas Recibidas/EmpresaA/2026/02. Febrero/`
- `empresas/{empresa_id}/`: opcionalmente, una carpeta por empresa si quieres guardar ahí el Excel de base maestra.
- `subidas/`: carpeta de *staging* para la interfaz web; el backend guardará aquí los archivos subidos antes de lanzar el Orquestador.

Estas carpetas se crean automáticamente cuando el sistema las necesite, pero puedes crearlas tú mismo si lo prefieres.

