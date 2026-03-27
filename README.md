# Sistema de gestión integral (ERP/CRM)

Aplicación web interna para gestionar **finanzas** (facturas recibidas y emitidas, bancos, tarjetas), **proyectos** (transporte con geocoding), **RRHH** y **proveedores/clientes**.

Construido con **Flask** (Python) + **HTML/CSS/JS** vanilla. Extracción inteligente de facturas mediante **OpenAI** (GPT-4.1-mini para texto, GPT-4o-mini para imágenes).

## Estructura del proyecto

```
cursor_test/
├── interfaz_facturas/         # Aplicación principal
│   ├── backend.py             # Servidor Flask (~4000 líneas)
│   ├── config.py              # Configuración centralizada
│   ├── login.html             # Página de login
│   ├── index.html             # Interfaz principal (SPA)
│   ├── static/
│   │   ├── css/app.css        # Estilos
│   │   └── js/app.js          # Lógica del frontend
│   └── core/                  # Módulos del backend
│       ├── db.py              # Conexión SQLite (context manager)
│       ├── facturas_db.py     # CRUD facturas recibidas
│       ├── facturas_cliente_db.py  # CRUD facturas emitidas
│       ├── tarjetas_db.py     # CRUD tarjetas
│       ├── terceros_db.py     # CRUD terceros (proveedores/clientes)
│       ├── llm.py             # Integración OpenAI (extracción IA)
│       ├── revisor.py         # Validación de facturas
│       ├── proveedores.py     # Gestión de proveedores maestros
│       ├── archivador.py      # Organización de archivos en disco
│       ├── geocoding.py       # Geocoding con OpenRouteService
│       ├── ocr.py             # OCR con Tesseract
│       ├── parser.py          # Parseo de importes, fechas, etc.
│       ├── facturas_servicios.py      # Lógica de negocio facturas
│       └── transporte_servicios.py    # Lógica de transporte
├── config/
│   └── empresas.toml          # Definición de empresas cliente
├── data/                      # Datos de producción (no versionados)
│   ├── gestion.db             # Base de datos principal (terceros)
│   ├── empresas/              # Datos por empresa
│   ├── Facturas Recibidas/    # PDFs y CSVs de facturas recibidas
│   ├── Facturas Emitidas/     # Facturas de cliente
│   └── bancos/                # Movimientos bancarios y conciliación
├── tests/
│   └── test_logica_pura.py    # 43 tests unitarios
├── requirements.txt           # Dependencias Python
├── .env                       # Variables de entorno (no versionado)
├── start_interfaz_facturas.bat    # Arranque rápido (Windows)
└── start_interfaz_facturas_hidden.vbs  # Arranque sin ventana
```

## Módulos funcionales

| Módulo | Descripción |
|--------|-------------|
| **Finanzas — Facturas recibidas** | Subida de PDFs, extracción con OCR/IA, revisión, archivo automático |
| **Finanzas — Facturas emitidas** | Gestión de facturas de cliente con validación |
| **Finanzas — Bancos** | Importación de movimientos bancarios, conciliación con facturas |
| **Finanzas — Tarjetas** | Gestión de gastos con tarjeta |
| **Proveedores/Clientes** | Maestro de terceros con NIF, homogeneización de nombres |
| **Proyectos — Transporte** | Rutas, geocoding, cálculo de distancias |

## Requisitos

- **Python 3.11+**
- **Tesseract OCR** instalado ([descargar](https://github.com/UB-Mannheim/tesseract/wiki))
- **API key de OpenAI** (para extracción inteligente de facturas)
- (Opcional) **API key de OpenRouteService** (para módulo de transporte)

## Instalación

```powershell
cd C:\Users\javie\Desktop\cursor_test

# Crear entorno virtual
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Instalar dependencias
pip install -r requirements.txt
```

## Configuración

Crea un archivo `.env` en la raíz del proyecto:

```env
OPENAI_API_KEY=sk-...
OPENROUTESERVICE_API_KEY=...       # opcional

# Autenticación
ADMIN_USER=admin
ADMIN_PASSWORD=tu-contraseña
SECRET_KEY=una-clave-secreta-larga
```

## Uso rápido

```powershell
cd C:\Users\javie\Desktop\cursor_test\interfaz_facturas
python backend.py
```

Abrir en el navegador: `http://localhost:8000`

Credenciales: las definidas en `.env` (`ADMIN_USER` / `ADMIN_PASSWORD`).

## Arranque automático (Windows)

Hay dos opciones:

1. **Doble clic** en `start_interfaz_facturas.bat` (abre ventana de consola)
2. **Sin ventana** ejecutando `start_interfaz_facturas_hidden.vbs`
3. **Programador de tareas** — ver `servicio_interfaz_facturas.md` para configuración detallada

## Tests

```powershell
cd C:\Users\javie\Desktop\cursor_test
python -m pytest interfaz_facturas/tests/test_logica_pura.py -v
```

## Documentación adicional

- `docs/CHECKLIST_SECUENCIAL_ERP_Y_MANTENIMIENTO.md` — **Checklist secuencial** (GitHub en equipo, plataforma, multi-usuario, módulo mantenimiento máquinas)
- `servicio_interfaz_facturas.md` — Cómo configurar el arranque automático con el Programador de tareas
- `docs/PLAN_MAESTRO_Y_ACCION.md` — Plan maestro del proyecto
- `data/README_DATOS_FACTURAS.md` — Estructura de los datos de facturas
