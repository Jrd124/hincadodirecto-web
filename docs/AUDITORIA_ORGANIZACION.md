# Auditoría: organización de la carpeta cursor_test

## Estado actual

### Contenido en la raíz (todo mezclado)

| Tipo | Archivos |
|------|----------|
| **Python** | `resumir_y_enviar_expansion.py` (extracción + resumen + envío), `requirements.txt` |
| **PowerShell** | `enviar_resumen_expansion.ps1`, `guardar_contrasena_gmail.ps1`, `get_gmail_pass.ps1` |
| **Config** | `config.toml`, `.env` |
| **Documentación** | `AGENTS.md`, `RESUMEN_EXPANSION_README.md`, `PASO2_COMO_ENVIAR_CORREO.md` |
| **Datos generados** | `resumen_expansion.txt`, `expansion_texto.txt` (salida de los scripts) |
| **Herramienta externa** | Carpeta `himalaya/` (ejecutable + completions) |

### Problemas detectados

1. **Todo en la raíz**  
   Scripts, config, documentación y ficheros de salida comparten el mismo nivel. Cuanto más crezca el proyecto, más difícil será localizar cosas.

2. **Rutas absolutas en configuración**  
   `config.toml` referencia:
   - `c:/Users/javie/Desktop/cursor_test/get_gmail_pass.ps1`  
   Si mueves el proyecto o otro usuario clona el repo, esas rutas fallan.

3. **Datos generados junto al código**  
   `resumen_expansion.txt` y `expansion_texto.txt` son salidas de ejecución. Mezclarlos con el código complica ver qué es fuente y qué es resultado, y en Git ensucian el historial si se versionan.

4. **Documentación repartida**  
   Hay un README del flujo "Resumen Expansión" y otro de "cómo enviar correo". No hay un único punto de entrada (por ejemplo `README.md` en la raíz) que explique el proyecto y enlace al resto.

5. **Falta de .gitignore**  
   Si usas Git, conviene ignorar al menos:
   - `.env` (claves)
   - `resumen_expansion.txt`, `expansion_texto.txt` (o la carpeta donde los pongas)
   - `__pycache__/`, `*.pyc`

6. **Rutas hardcodeadas en Python**  
   El script Python define por ejemplo `CARPETA_PERIODICOS` y `TESSERACT_CMD_WIN` dentro del código. Está bien para un solo usuario; para reutilizar o compartir sería mejor leerlas de config o variables de entorno.

---

## Propuesta de organización (aplicada)

La estructura sugerida en esta auditoría ha sido aplicada. Ver `README.md` en la raíz del proyecto.
