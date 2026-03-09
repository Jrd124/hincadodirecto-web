# Recibir por email las actualizaciones del directo de El Mundo (Israel/Irán)

Script que comprueba la página del directo de El Mundo y te envía un correo con cada nueva actualización, para no tener que refrescar la web.

## Requisitos

- Python 3 con `requests` y `beautifulsoup4` (ya están en `requirements.txt`).
- Cuenta de Gmail con **contraseña de aplicación** (no la contraseña normal).

## Configuración

### 1. Contraseña de aplicación de Gmail

1. En tu cuenta de Google: [Seguridad](https://myaccount.google.com/security) → Verificación en 2 pasos (debe estar activada).
2. En "Contraseñas de aplicaciones", genera una para "Correo" / "Otro" y copia la contraseña de 16 caracteres.

### 2. Variables en `.env`

En la raíz del proyecto (`c:\Users\javie\Desktop\cursor_test`), en el archivo `.env`, añade (o usa las que ya tengas para email):

```env
# Para este script (o usa EMAIL_USER / EMAIL_APP_PASSWORD si ya los tienes)
ELMUNDO_EMAIL_USER=tu_correo@gmail.com
ELMUNDO_EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
ELMUNDO_TO_EMAIL=donde_quieres_recibir@email.com
```

- `ELMUNDO_TO_EMAIL`: opcional; si no lo pones, se usa la misma dirección que `ELMUNDO_EMAIL_USER`.
- Si ya tienes `EMAIL_USER` y `EMAIL_APP_PASSWORD` (por ejemplo para otro script), puedes usar esos y solo añadir `ELMUNDO_TO_EMAIL` si quieres otro destinatario.

## Uso

### Primera vez (solo guardar estado, sin enviar email)

Para no recibir un correo enorme con todas las entradas actuales la primera vez:

```bash
python scripts/elmundo_directo_email.py --solo-guardar-estado
```

Así se guarda el estado actual en `data/elmundo_directo_state.json`. A partir de la siguiente ejecución, solo se enviará email cuando haya **nuevas** actualizaciones.

### Ejecución normal

Cada vez que ejecutes el script:

1. Descarga la página del directo.
2. Compara con el estado guardado.
3. Si hay entradas nuevas, te envía **un solo email** con todas las nuevas.

```bash
python scripts/elmundo_directo_email.py
```

### Programar ejecución cada X minutos (Windows)

Para que se ejecute solo cada cierto tiempo:

1. Abre **Programador de tareas** (Task Scheduler).
2. Crear tarea básica → nombre p. ej. "El Mundo directo email".
3. Desencadenador: **Diariamente** (o "Al iniciar sesión" si prefieres).
4. Acción: **Iniciar un programa**.
   - Programa: `python` (o la ruta completa a tu `python.exe`).
   - Argumentos: `scripts/elmundo_directo_email.py`
   - Iniciar en: `c:\Users\javie\Desktop\cursor_test`
5. En "Propiedades" de la tarea, en la pestaña **Desencadenadores**, edita el desencadenador diario y activa **Repetir tarea cada**: por ejemplo **15 minutos**, durante **1 día** (o "Indefinidamente" si tu versión lo permite). Así se ejecutará cada 15 minutos.

Alternativa por línea de comandos (PowerShell, ejecutar como administrador si hace falta):

```powershell
$accion = New-ScheduledTaskAction -Execute "python" -Argument "scripts/elmundo_directo_email.py" -WorkingDirectory "c:\Users\javie\Desktop\cursor_test"
$desencadenador = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 1)
Register-ScheduledTask -TaskName "ElMundoDirectoEmail" -Action $accion -Trigger $desencadenador
```

(Para repetir más de 1 día tendrías que crear varios desencadenadores o ajustar la tarea después.)

## Dónde se guarda el estado

El script guarda en `data/elmundo_directo_state.json` los identificadores de las entradas ya vistas. No edites este archivo salvo que quieras "resetear" y volver a recibir todas como nuevas.

## Notas

- La URL del directo está fija en el script (directo Israel/Irán de la fecha indicada). Si El Mundo cambia la URL del mismo directo o la estructura de la página, podría ser necesario ajustar el script.
- El envío usa Gmail por defecto (smtp.gmail.com, puerto 465). Para otro proveedor tendrías que cambiar `send_email()` en el script.
