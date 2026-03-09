# cursor_test

Proyecto para **extraer el PDF del periódico Expansión**, **resumirlo con IA (OpenAI)** y **enviar el resumen por correo** usando Himalaya (Gmail).

## ¿Dónde empieza el flujo?

El flujo lo **inicia siempre el script de Python** `scripts/python/resumir_y_enviar_expansion.py`. Ese script:

1. Extrae el texto del PDF (y lo guarda en `data/expansion_texto.txt`).
2. Resume el texto con OpenAI y guarda el resumen en `data/resumen_expansion.txt`.
3. Llama al script de PowerShell `enviar_resumen_expansion.ps1` **solo para enviar** ese resumen por correo (Himalaya se usa desde PowerShell).

No ejecutes el .ps1 como punto de entrada del flujo: el .ps1 sirve para enviar por correo un resumen que ya exista (bien porque lo generó Python en el paso 3, bien porque quieres reenviar a mano desde `data\resumen_expansion.txt`).

## Estructura

- **`config/`** — Configuración de Himalaya (Gmail, IMAP, SMTP).
- **`docs/`** — Documentación del flujo.
- **`scripts/python/`** — Extracción del PDF y flujo resumen + envío.
- **`scripts/powershell/`** — Scripts para Himalaya (contraseña, envío de resumen).
- **`data/`** — Salidas generadas (`expansion_texto.txt`, `resumen_expansion.txt`). No se versionan.
- **`himalaya/`** — Cliente de correo (ejecutable y completions).

## Requisitos

- Python 3 con dependencias en `requirements.txt`.
- Clave de API de OpenAI (archivo `.env` en la raíz del proyecto).
- [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) instalado si los PDFs son solo imágenes.
- Contraseña de aplicación de Gmail (una vez: `scripts\powershell\guardar_contrasena_gmail.ps1`).

## Uso rápido

Desde la **raíz del proyecto**:

```powershell
cd C:\Users\javie\Desktop\cursor_test
python scripts/python/resumir_y_enviar_expansion.py
```

1. Pon el PDF de Expansión en `C:\Users\javie\iCloudDrive\Periodicos`.
2. El script extrae texto, resume con IA y envía el resumen a tu Gmail.

## Documentación

- [Resumen Expansión: flujo automático](docs/RESUMEN_EXPANSION.md) — Clave OpenAI, uso diario, fallos habituales.

## Configuración inicial

1. Crea un archivo `.env` en la raíz del proyecto con tu clave de OpenAI: `OPENAI_API_KEY=sk-...` (obtén la clave en [platform.openai.com/api-keys](https://platform.openai.com/api-keys)).
2. (Opcional) Ejecuta una vez `scripts\powershell\guardar_contrasena_gmail.ps1` para guardar la contraseña de aplicación de Gmail de forma cifrada.
