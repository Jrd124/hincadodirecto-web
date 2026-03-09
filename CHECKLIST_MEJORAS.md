# Checklist de mejoras – Proyecto Facturas

Seguimiento del progreso de las acciones recomendadas en la auditoría. Marca con `[x]` al completar cada ítem.

---

## Prioridad alta

- [x] 1. Cargar empresas desde `config/empresas.toml` en el backend y eliminar el diccionario `EMPRESAS_CLIENTE` hardcodeado.
- [x] 2. Exponer endpoint `GET /api/empresas` que devuelva `[{ id, nombre }, ...]`.
- [x] 3. Rellenar todos los `<select>` de empresa por JS desde `/api/empresas` (quitar la repetición de opciones en el HTML).
- [x] 4. Extraer el CSS a archivo estático (p. ej. `interfaz_facturas/static/css/app.css`) y un único `<link>` en el HTML.
- [x] 5. Extraer el JavaScript a archivo(s) estático(s) (p. ej. `static/js/app.js`) y cargarlos con `<script src="...">`.

---

## Prioridad media

- [x] 6. Crear helper genérico de filtrado CSV (`_filtrar_filas_csv(...)`) reutilizable en todos los exports.
- [x] 7. Unificar lógica de export y ZIP usando ese helper en los cuatro endpoints (facturas proveedores + clientes).
- [x] 8. Modularizar el backend por dominio (p. ej. `routes/` con facturas_proveedores, facturas_clientes, proveedores, archivo).
- [x] 9. Extraer lógica de negocio a capa de servicios (`services/` o `core/`) como funciones puras testables.
- [x] 10. Centralizar configuración en `config.py` (carga de empresas.toml, rutas, constantes).
- [x] 11. Crear función genérica de render de tablas de facturas en frontend (`renderTablaFacturas(...)`) para las tres tablas.
- [x] 12. Validación de entrada centralizada para `empresa_id` y parámetros opcionales (respuestas 400 consistentes).

---

## Prioridad baja

- [x] 13. Cache persistente para Nominatim (JSON o CSV) para no repetir peticiones entre reinicios.
- [x] 14. Procesamiento en lote o paralelo del pipeline de facturas (p. ej. ThreadPoolExecutor para llamadas OpenAI).
- [x] 15. Cache en memoria de CSVs por empresa en endpoints de listado (con invalidación al editar/eliminar).
- [x] 16. Paginación en backend o virtualización en frontend para tablas con muchas filas.
- [x] 17. Tests unitarios para lógica pura (normalización, NIF, importes, similitud nombres, reglas de revisión).
- [ ] 18. Tests de integración opcionales (CSV de prueba, comprobar listado/export).
- [ ] 19. Endpoint `GET /api/health` para comprobar app y acceso a datos.
- [ ] 20. Sustituir/complementar `print` por `logging` con request_id u otro identificador por petición.
- [ ] 21. Fijar versiones exactas en `requirements.txt` (o requirements-prod.txt) para producción.
- [ ] 22. Usar variables de entorno `FLASK_ENV`, `DATOS_DIR` (opcional) para configuración de ejecución.
- [ ] 23. Configurar CORS en Flask de forma restrictiva si la interfaz se sirve desde otro origen.
- [ ] 24. Pruebas E2E opcionales (p. ej. Playwright) para flujo elegir empresa → cargar listado → export.

---

## Resumen

| Prioridad | Total | Completadas |
|-----------|-------|-------------|
| Alta      | 5     | 5           |
| Media     | 7     | 7           |
| Baja      | 12    | 5           |
| **Total** | **24**| **17**      |

*(Actualiza los contadores al marcar ítems.)*
