## Plan para aislar proyectos en `cursor_test`

Guía paso a paso para:

- Separar claramente **cada proyecto independiente** dentro de `cursor_test`.
- Preparar estructuras que se puedan **migrar a otro equipo/PC o repo** con cambios mínimos.

Actualmente se contemplan dos proyectos principales:

1. **Proyecto A – Resumen de Expansión + envío por correo**.
2. **Proyecto B – Interfaz de facturas**.

Primero aislaremos el Proyecto A (más pequeño) y después el Proyecto B.

---

### A. Aislar el proyecto de resumen de Expansión

#### A.1. Delimitar qué forma parte del proyecto de Expansión

- [x] **A.1.1. Identificar código núcleo del flujo Expansión**
  - [x] Confirmar que el flujo principal está en:
    - [x] `scripts/python/resumir_y_enviar_expansion.py` (punto de entrada).
  - [x] Identificar cualquier módulo Python adicional que use este script (si los hubiera).
- [x] **A.1.2. Identificar scripts de PowerShell asociados**
  - [x] Confirmar que pertenecen al flujo de Expansión/correo:
    - [x] `scripts/powershell/enviar_resumen_expansion.ps1`
    - [x] `scripts/powershell/guardar_contrasena_gmail.ps1`
    - [x] `scripts/powershell/get_gmail_pass.ps1`
- [x] **A.1.3. Identificar configuración y secretos usados por el flujo**
  - [x] Confirmar que este proyecto usa:
    - [x] `config/config.toml` (configuración de Himalaya / Gmail).
    - [x] `.env` (al menos `OPENAI_API_KEY`, comprobar si se usa algo más en `resumir_y_enviar_expansion.py`).
- [x] **A.1.4. Identificar datos y salidas específicas de Expansión**
  - [x] Confirmar que las salidas principales son:
    - [x] `data/expansion_texto.txt`
    - [x] `data/resumen_expansion.txt`
- [x] **A.1.5. Identificar documentación relacionada**
  - [x] Revisar que estos archivos describen el flujo de Expansión:
    - [x] `README.md` (sección que explica el flujo de Expansión).
    - [x] `docs/RESUMEN_EXPANSION.md`
    - [x] `docs/AUDITORIA_TIEMPO_RESUMEN_EXPANSION.md`
    - [x] `docs/LEEME_PROGRAMAR_RESUMEN.md`

---

#### A.2. Crear carpeta de proyecto aislado para Expansión

- [x] **A.2.1. Crear carpeta raíz de prueba para Expansión**
  - [x] Crear la carpeta (Explorador de archivos o PowerShell):
    - [x] `C:\Users\javie\Desktop\Proyectos IT\expansion_resumen_prueba\`
- [x] **A.2.2. Definir estructura mínima dentro de la nueva carpeta**
  - [x] Dentro de `expansion_resumen_prueba\`, crear estas carpetas (ya deberían existir si hemos seguido el paso anterior y el movimiento a `Proyectos IT`):
    - [x] `scripts\python\`
    - [x] `scripts\powershell\`
    - [x] `config\`
    - [x] `data\`
    - [x] `docs\`
  - [x] (Opcional) añadir:
    - [x] `.venv\` (para entorno virtual, si decides usarlo).
- [x] **A.2.3. Copiar código y scripts del proyecto de Expansión**
  - [x] Copiar estos archivos desde `cursor_test\` a `expansion_resumen_prueba\` respetando la misma estructura:
    - [x] `scripts/python/resumir_y_enviar_expansion.py` → `expansion_resumen_prueba/scripts/python/resumir_y_enviar_expansion.py`
    - [x] `scripts/powershell/enviar_resumen_expansion.ps1` → `expansion_resumen_prueba/scripts/powershell/enviar_resumen_expansion.ps1`
    - [x] `scripts/powershell/guardar_contrasena_gmail.ps1` → `expansion_resumen_prueba/scripts/powershell/guardar_contrasena_gmail.ps1`
    - [x] `scripts/powershell/get_gmail_pass.ps1` → `expansion_resumen_prueba/scripts/powershell/get_gmail_pass.ps1`
- [x] **A.2.4. Copiar configuración y datos específicos**
  - [x] Copiar la configuración de Himalaya/Gmail:
    - [x] `config/config.toml` → `expansion_resumen_prueba/config/config.toml`
  - [x] Copiar los archivos de datos (o crear placeholders vacíos):
    - [x] `data/expansion_texto.txt` → `expansion_resumen_prueba/data/expansion_texto.txt`
    - [x] `data/resumen_expansion.txt` → `expansion_resumen_prueba/data/resumen_expansion.txt`
- [x] **A.2.5. Copiar documentación relacionada con Expansión**
  - [x] Copiar a `expansion_resumen_prueba/docs/`:
    - [x] `docs/RESUMEN_EXPANSION.md`
    - [x] `docs/AUDITORIA_TIEMPO_RESUMEN_EXPANSION.md`
    - [x] `docs/LEEME_PROGRAMAR_RESUMEN.md`
  - [x] Opcional: copiar `README.md` actual y simplificarlo allí para que solo hable del proyecto de Expansión.

---

#### A.3. Preparar el proyecto de Expansión para funcionar en solitario

- [x] **A.3.1. Crear `requirements.txt` específico para Expansión**
  - [x] En `C:\Users\javie\Desktop\Proyectos IT\expansion_resumen_prueba\`, crear un `requirements.txt` con las dependencias que use `resumir_y_enviar_expansion.py` (por ejemplo):
    - [x] `openai`
    - [x] `PyMuPDF`
    - [x] `pytesseract`
    - [x] `Pillow`
- [x] **A.3.2. Crear `.env.example` y `.env` para Expansión**
  - [x] Crear un `.env.example` en `expansion_resumen_prueba\` con:
    - [x] `OPENAI_API_KEY=...`
    - [x] Otras variables de entorno si el script las usa (por ahora solo esta).
  - [x] Crear un `.env` local (no subir a repos, si lo creas después) con la clave real.
- [x] **A.3.3. Comprobar rutas y referencias internas**
  - [x] Abrir `resumir_y_enviar_expansion.py` y verificar que:
    - [x] Las rutas a `data/expansion_texto.txt` y `data/resumen_expansion.txt` funcionan cuando la raíz es `expansion_resumen_prueba` (usan `PROJECT_ROOT / "data"`).
    - [x] No hay rutas absolutas a `cursor_test` en el script principal.
  - [x] Abrir `config/config.toml` y comprobar que:
    - [x] Las rutas a scripts de PowerShell (`get_gmail_pass.ps1`) apuntan correctamente a la nueva estructura en `expansion_resumen_prueba/scripts/powershell/`.

---

#### A.4. Probar el flujo de Expansión desde la carpeta aislada

- [x] **A.4.1. Instalar dependencias**
  - [x] Abrir PowerShell y ejecutar:
    - [x] `cd "C:\Users\javie\Desktop\Proyectos IT\expansion_resumen_prueba"`
    - [x] (Opcional) crear entorno virtual:
      - [x] `python -m venv .venv`
      - [x] `.\.venv\Scripts\Activate.ps1`
    - [x] `pip install -r requirements.txt`
- [x] **A.4.2. Ejecutar el flujo completo**
  - [x] Asegurarte de que existe un PDF de Expansión en la ruta que el script espera (o adaptar la ruta en el script si quieres).
  - [x] Ejecutar desde la raíz del nuevo proyecto:
    - [x] `python scripts/python/resumir_y_enviar_expansion.py`
  - [x] Verificar que:
    - [x] Se genera `data/expansion_texto.txt` en la nueva carpeta.
    - [x] Se genera `data/resumen_expansion.txt` en la nueva carpeta (con bloque de diagnóstico).
    - [x] El script de PowerShell se lanza correctamente y el correo se envía.
- [x] **A.4.3. Documentar cualquier ajuste necesario**
  - [x] Ajuste aplicado: la carga de `.env` ahora **sobrescribe siempre** `OPENAI_API_KEY` en `os.environ` (evita que un valor vacío previo bloquee la clave real).
  - [x] Nota operativa: tras cada ejecución, el PDF procesado se mueve a `C:\Users\javie\iCloudDrive\Periodicos\procesados`, así que para volver a probar hace falta un PDF nuevo de Expansión en la carpeta raíz de `Periodicos`.

---

#### A.5. Documentar y preparar para compartir con el equipo

- [x] **A.5.1. Crear `README.md` específico en `expansion_resumen_prueba`**
  - [x] Explicar:
    - [x] Qué hace el proyecto (extraer PDF de Expansión, resumir, enviar por correo).
    - [x] Cómo configurar `.env`.
    - [x] Cómo configurar `config/config.toml` y las credenciales de Gmail.
    - [x] Cómo ejecutar el flujo de forma diaria.
- [ ] **A.5.2. Preparar para Git (opcional pero muy recomendable)**
  - [ ] Inicializar Git en `expansion_resumen_prueba` cuando funcione bien:
    - [ ] `git init`
    - [ ] Crear `.gitignore` (incluyendo `data/`, `.env`, cualquier archivo sensible).
  - [ ] Hacer un primer commit con el estado estable del proyecto.

---

## Plan para aislar la interfaz de facturas

Guía paso a paso para:

- Separar claramente **todo lo que pertenece a la interfaz de facturas**.
- Preparar una estructura que se pueda **migrar a otro equipo/PC o repo** con cambios mínimos.

Marca cada casilla (`[ ]` → `[x]`) según vayas completando.

---

### 1. Delimitar qué forma parte del proyecto de facturas

- [ ] **1.1. Identificar carpetas de código núcleo de la interfaz**
  - [ ] Confirmar que `interfaz_facturas/` contiene:
    - [ ] `backend.py`
    - [ ] `config.py`
    - [ ] `core/`
    - [ ] `static/css/app.css`
    - [ ] `static/js/app.js`
    - [ ] `index.html`
    - [ ] `tests/`
- [ ] **1.2. Identificar configuración específica de facturas**
  - [ ] Confirmar que `config/empresas.toml` es la única fuente de verdad de empresas cliente.
- [ ] **1.3. Identificar datos usados por la interfaz**
  - [ ] Confirmar que la interfaz usa:
    - [ ] `data/empresas/…`
    - [ ] `data/Facturas Recibidas/…`
    - [ ] (Opcional) `data/Facturas Emitidas/…` si ya la estás usando.
    - [ ] (Opcional) `data/bancos/…` y `data/movimientos.db` si se usan desde la interfaz.
- [ ] **1.4. Identificar documentación y agentes relacionados con facturas**
  - [ ] Revisar que estos archivos están actualizados y pertenecen al ecosistema de facturas:
    - [ ] `docs/AUDITORIA_PROYECTO_FACTURAS.md`
    - [ ] `docs/AUDITORIA_ORGANIZACION.md`
    - [ ] `docs/CONTROL_CALIDAD_TAREAS.md`
    - [ ] `data/README_DATOS_FACTURAS.md`
    - [ ] `agent-team/skills/recolector-facturas.md`
    - [ ] `agent-team/skills/extractor-facturas.md`
    - [ ] `agent-team/skills/revisor-facturas.md`
    - [ ] `agent-team/skills/archivador-facturas.md`
    - [ ] `agent-team/skills/base-datos-maestra.md`
- [ ] **1.5. Identificar scripts/infraestructura de arranque de la interfaz**
  - [ ] Verificar que están pensados para arrancar SOLO la interfaz de facturas:
    - [ ] `servicio_interfaz_facturas.md`
    - [ ] `start_interfaz_facturas.bat`
    - [ ] `start_interfaz_facturas_hidden.vbs`

---

### 2. Detectar código “fuera de sitio” mezclado con datos

- [ ] **2.1. Revisar la copia de código dentro de `data/`**
  - [ ] Abrir la carpeta `data/Facturas Recibidas/empresa1/Sin_fecha/Sin fecha/`.
  - [ ] Confirmar que contiene:
    - [ ] `backend.py`
    - [ ] `config.py`
    - [ ] `index.html`
    - [ ] `test_backend_status.py`
- [ ] **2.2. Decidir el destino de esos archivos (no hacer nada todavía)**
  - [ ] Valorar si:
    - [ ] Son una **copia antigua** / experimento que ya no se usa.
    - [ ] O contienen lógica que no exista en el `backend.py` actual.
  - [ ] Si son copia antigua y no se usan:
    - [ ] Anotar: “Candidatos a borrar o archivar fuera de `data/` cuando terminemos el plan”.
  - [ ] Si hay algo útil:
    - [ ] Anotar qué funciones o partes interesan para copiarlas (si no están ya en la versión actual).

*(NOTA: el borrado o movimiento de estos archivos se hará más adelante y solo si estás seguro; aquí solo los identificamos.)*

---

### 3. Simular el proyecto aislado en una nueva carpeta

Esta fase crea una **“copia de ensayo”** del proyecto de facturas en una carpeta aparte, sin tocar nada de lo actual.

- [ ] **3.1. Crear carpeta raíz de prueba**
  - [ ] Crear la carpeta (puede ser desde el Explorador de archivos):
    - [ ] `C:\Users\javie\Desktop\facturas_interfaz_prueba\`
- [ ] **3.2. Replicar la estructura mínima del proyecto de facturas**
  - [ ] Dentro de `facturas_interfaz_prueba\`, crear estas carpetas:
    - [ ] `interfaz_facturas\`
    - [ ] `data\`
    - [ ] `config\`
    - [ ] `docs\` (opcional pero recomendable)
    - [ ] `agent-team\skills\` (opcional si quieres llevarte también los agentes)
    - [ ] `infra\` (para scripts como el `.bat` y documentación del servicio)
- [ ] **3.3. Copiar código de la interfaz a la nueva raíz**
  - [ ] Copiar la carpeta `interfaz_facturas\` completa desde `cursor_test\` a:
    - [ ] `C:\Users\javie\Desktop\facturas_interfaz_prueba\interfaz_facturas\`
- [ ] **3.4. Copiar configuración de empresas**
  - [ ] Copiar `config/empresas.toml` desde `cursor_test\` a:
    - [ ] `C:\Users\javie\Desktop\facturas_interfaz_prueba\config\empresas.toml`
- [ ] **3.5. Copiar datos mínimos necesarios**
  - [ ] Copiar las carpetas de datos de facturas:
    - [ ] `data/empresas/` → `facturas_interfaz_prueba/data/empresas/`
    - [ ] `data/Facturas Recibidas/` → `facturas_interfaz_prueba/data/Facturas Recibidas/`
    - [ ] (Opcional) `data/Facturas Emitidas/` → `facturas_interfaz_prueba/data/Facturas Emitidas/`
    - [ ] (Opcional) `data/bancos/` → `facturas_interfaz_prueba/data/bancos/`
- [ ] **3.6. Copiar documentación y skills que quieras asociar al proyecto**
  - [ ] Copiar a `facturas_interfaz_prueba/docs/`:
    - [ ] `docs/AUDITORIA_PROYECTO_FACTURAS.md`
    - [ ] `docs/AUDITORIA_ORGANIZACION.md`
    - [ ] `docs/CONTROL_CALIDAD_TAREAS.md`
    - [ ] `data/README_DATOS_FACTURAS.md` (puede ir aquí o quedarse en `data/`).
  - [ ] Copiar a `facturas_interfaz_prueba/agent-team/skills/` (si quieres):
    - [ ] `agent-team/skills/recolector-facturas.md`
    - [ ] `agent-team/skills/extractor-facturas.md`
    - [ ] `agent-team/skills/revisor-facturas.md`
    - [ ] `agent-team/skills/archivador-facturas.md`
    - [ ] `agent-team/skills/base-datos-maestra.md`
- [ ] **3.7. Copiar scripts/infra del servicio de la interfaz**
  - [ ] Copiar a `facturas_interfaz_prueba/infra/`:
    - [ ] `servicio_interfaz_facturas.md`
    - [ ] `start_interfaz_facturas.bat`
    - [ ] `start_interfaz_facturas_hidden.vbs`

---

### 4. Preparar el nuevo proyecto para funcionar en solitario

- [ ] **4.1. Crear `requirements.txt` específico del proyecto de facturas**
  - [ ] En `facturas_interfaz_prueba\`, crear un `requirements.txt` con al menos:
    - [ ] `Flask` (o el framework que uses en `backend.py`).
    - [ ] `openai`.
    - [ ] Cualquier otra librería que veas importada solo para la interfaz de facturas.
- [ ] **4.2. Crear `.env.example` y `.env`**
  - [ ] Crear un `.env.example` con claves y variables necesarias (sin valores reales):
    - [ ] `OPENAI_API_KEY=...`
    - [ ] (Opcional) `DATOS_DIR=...` si decides poder cambiar la ruta de datos vía entorno.
  - [ ] Crear un `.env` local (no se sube a repositorio si luego creas uno) con:
    - [ ] `OPENAI_API_KEY=` tu clave real.
- [ ] **4.3. Revisar que las rutas de `config.py` siguen siendo válidas**
  - [ ] Verificar que en `interfaz_facturas/config.py`:
    - [ ] `BASE_DIR = Path(__file__).resolve().parents[1]` apunta a la carpeta raíz de `facturas_interfaz_prueba`.
    - [ ] `DATOS_DIR = BASE_DIR / "data"` coincide con la nueva ubicación de `data/`.
    - [ ] La ruta de `empresas.toml` (`BASE_DIR / "config" / "empresas.toml"`) es correcta en el nuevo layout.
  - [ ] Si algo no cuadra, anotar qué habría que cambiar (antes de tocar código).

---

### 5. Probar la interfaz desde la carpeta aislada

- [ ] **5.1. Instalar dependencias en un entorno de prueba**
  - [ ] Abrir PowerShell y ejecutar:
    - [ ] `cd "C:\Users\javie\Desktop\facturas_interfaz_prueba"`
    - [ ] (Opcional pero recomendado) crear un entorno virtual:
      - [ ] `python -m venv .venv`
      - [ ] `.\.venv\Scripts\Activate.ps1`
    - [ ] `pip install -r requirements.txt`
- [ ] **5.2. Arrancar el backend desde la nueva raíz**
  - [ ] En la misma consola de `facturas_interfaz_prueba`:
    - [ ] `python interfaz_facturas\backend.py`
  - [ ] Abrir en el navegador:
    - [ ] `http://localhost:8000`
- [ ] **5.3. Probar los flujos principales**
  - [ ] Seleccionar una empresa y cargar listados de facturas.
  - [ ] Subir una factura y comprobar que se guarda en la ruta esperada dentro de `facturas_interfaz_prueba\data\…`.
  - [ ] Usar alguna funcionalidad de export/ZIP y verificar que no hay errores de ruta.
  - [ ] Si algo falla, anotar:
    - [ ] Qué acción hacías.
    - [ ] Mensaje de error que sale.
    - [ ] Ruta que parece estar mal.

---

### 6. Ajustar detalles para una migración futura al equipo

- [ ] **6.1. Documentar en un `README.md` dentro de `facturas_interfaz_prueba`**
  - [ ] Crear un `README.md` que explique:
    - [ ] Qué hace la interfaz de facturas.
    - [ ] Cómo instalar dependencias (`pip install -r requirements.txt`).
    - [ ] Cómo configurar `.env`.
    - [ ] Cómo arrancar (`python interfaz_facturas/backend.py` o mediante Programador de tareas).
    - [ ] Qué estructura de `data/` se espera (empresas, Facturas Recibidas, etc.).
- [ ] **6.2. Pensar en el tipo de despliegue para el equipo**
  - [ ] Decidir si:
    - [ ] Cada persona tendrá su propia copia local con sus datos.
    - [ ] O habrá un servidor centralizado (un solo `data/` compartido).
  - [ ] Anotar esta decisión en el `README.md`.
- [ ] **6.3. Preparar el proyecto para Git (opcional pero recomendable)**
  - [ ] Inicializar Git en `facturas_interfaz_prueba` cuando estés satisfecho:
    - [ ] `git init`
    - [ ] Crear `.gitignore` (incluyendo `data/` si no quieres versionar datos reales y `.env`).
  - [ ] Hacer un primer commit con el estado funcional de la interfaz.

---

### 7. (Más adelante) Limpiar el proyecto original `cursor_test`

> **NO realizar hasta que la copia aislada funcione bien.**

- [ ] **7.1. Decidir si el proyecto original se parte en dos repos o se mantiene junto**
  - [ ] Valorar:
    - [ ] Dejar `cursor_test` solo para Expansión + correo + Himalaya.
    - [ ] Mover todo lo de facturas a un repo separado (el que has simulado en `facturas_interfaz_prueba`).
- [ ] **7.2. Tratar la copia de código dentro de `data/`**
  - [ ] Si confirmas que no se usa:
    - [ ] Mover `data/Facturas Recibidas/empresa1/Sin_fecha/Sin fecha/backend.py` y resto a una carpeta de “archivos antiguos”, fuera de `data/`.
    - [ ] O borrar esos archivos **solo si estás 100 % seguro** (previa copia de seguridad).
- [ ] **7.3. Actualizar documentación para reflejar la nueva organización**
  - [ ] Revisar y actualizar:
    - [ ] `docs/AUDITORIA_ORGANIZACION.md`
    - [ ] Cualquier otra guía que mencione rutas antiguas.

---

Con este checklist, el objetivo es que puedas ir **paso a paso**, siempre manteniendo una copia funcional antes de tomar decisiones irreversibles (como borrar código en `data/`). Cuando quieras, podemos ir marcando y ajustando punto por punto en la nueva carpeta de prueba.

