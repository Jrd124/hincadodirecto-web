## Servicio Windows para `backend.py` (Interfaz facturas)

Guía paso a paso para dejar el backend corriendo como **servicio de Windows** usando **NSSM**, con arranque automático y reinicio si se cae.

Ruta del proyecto (asumida en esta guía):

- `C:\Users\javie\Desktop\cursor_test\interfaz_facturas`

Si tu ruta es distinta, adapta los comandos.

---

### 1. Confirmar ruta del proyecto y de Python

1. Abrir **PowerShell**.
2. Ejecutar:

   ```powershell
   cd "C:\Users\javie\Desktop\cursor_test\interfaz_facturas"
   pwd
   ```

   - Debe mostrar `C:\Users\javie\Desktop\cursor_test\interfaz_facturas`.

3. En la misma consola, localizar Python:

   ```powershell
   Get-Command python | Select-Object -ExpandProperty Source
   ```

   - Apuntar la ruta que se vaya a usar, por ejemplo:
     - `C:\Users\javie\AppData\Local\Microsoft\WindowsApps\python.exe`

   Esa será la ruta de **Python** que usaremos en la tarea programada.

---

## Opción recomendada: Programador de tareas (sin instalar nada extra)

En lugar de usar NSSM, esta opción usa solo herramientas de Windows para dejar `backend.py` ejecutándose automáticamente y con reintentos.

### 2. Crear la tarea básica en el Programador de tareas

1. Abrir el **Programador de tareas**:
   - `Win + R` → escribir `taskschd.msc` → Enter.
2. En el panel derecho, escoger **“Crear tarea básica…”**.
3. Rellenar:
   - **Nombre**: `InterfazFacturas`  
   - **Descripción** (opcional): `Arranca backend.py de la interfaz de facturas (puerto 8000)`.
4. En **Desencadenador** (Trigger):
   - Elegir **“Al iniciar sesión”** (para empezar cuando entres con tu usuario).  
     Más adelante se puede cambiar a “Al iniciar el equipo” si se quiere más modo servidor.
5. En **Acción**:
   - Elegir **“Iniciar un programa”**.
   - En **Programa o script**:
     - Poner la ruta de `python.exe` que se obtuvo en el paso 1, por ejemplo:  
       `C:\Users\javie\AppData\Local\Microsoft\WindowsApps\python.exe`
   - En **Agregar argumentos (opcional)**:

     ```text
     backend.py
     ```

   - En **Iniciar en (opcional)**:

     ```text
     C:\Users\javie\Desktop\cursor_test\interfaz_facturas
     ```

6. Finalizar el asistente (**Siguiente → Finalizar**).

En este punto la tarea básica ya existe, pero aún hay que afinar algunas opciones.

---

### 3. Ajustar opciones avanzadas de la tarea

1. En el **Programador de tareas**, localizar la tarea `InterfazFacturas`:
   - Normalmente en **Biblioteca del Programador de tareas** (raíz) o en `Biblioteca →` alguna subcarpeta si la creaste allí.
2. Doble clic en `InterfazFacturas` para abrir sus **Propiedades**.
3. Pestaña **General**:
   - Marcar **“Ejecutar con los privilegios más altos”** (para evitar problemas de permisos de lectura/escritura).
   - Comprobar que “Configurar para” está en tu versión actual de Windows.
4. Pestaña **Desencadenadores**:
   - Confirmar que existe el desencadenador **“Al iniciar sesión”** y que está habilitado.
5. Pestaña **Acciones**:
   - Verificar que:
     - **Programa o script**: ruta de `python.exe`.
     - **Agregar argumentos**: `backend.py`.
     - **Iniciar en**: `C:\Users\javie\Desktop\cursor_test\interfaz_facturas`.
6. Pestaña **Condiciones** (opcional, pero recomendado ajustar):
   - Desmarcar **“Iniciar la tarea solo si el equipo está usando corriente alterna”** (si quieres que funcione también con batería).
   - Desmarcar **“Detener si el equipo cambia a batería”**, si está marcada.
7. Pestaña **Configuración**:
   - Marcar **“Permitir que la tarea se ejecute a petición”**.
   - Marcar **“Si la tarea ya está en ejecución, iniciar una nueva instancia”** como **No iniciar una nueva instancia** (para evitar duplicados).
   - (Opcional) Marcar **“Reiniciar la tarea si se detiene inesperadamente”** o usar las opciones de reintento disponibles según tu versión de Windows (por ejemplo, “Si falla, volver a intentar cada 1 minuto durante 3 intentos”).

Aplicar y aceptar.

---

### 4. Probar la tarea manualmente

1. Con la tarea `InterfazFacturas` seleccionada en el Programador de tareas, pulsar **“Ejecutar”** en el panel derecho.
2. Esperar unos segundos.
3. Abrir el navegador y escribir:

   - `http://localhost:8000`

4. Comprobar que la interfaz carga correctamente.
5. Si no carga:
   - Ir a la pestaña **Historial** de la tarea (si está activado) y revisar si hay errores.
   - Abrir **Administrador de tareas** y comprobar si aparece un proceso de `python` relacionado.
   - En caso de fallo, probar a ejecutar en una ventana de PowerShell manualmente lo mismo que hace la tarea:

     ```powershell
     cd "C:\Users\javie\Desktop\cursor_test\interfaz_facturas"
     python backend.py
     ```

     y revisar la traza si hay error.

---

### 5. Hacer que se ejecute siempre al iniciar sesión

Con la configuración anterior, si el desencadenador es **“Al iniciar sesión”**, cada vez que entres con tu usuario se lanzará el backend.

Para comprobarlo:

1. Cerrar el navegador.
2. Cerrar sesión de Windows y volver a iniciarla.
3. Abrir `http://localhost:8000` y verificar que la interfaz funciona sin lanzar nada manualmente.

Si quieres que funcione **aunque no abras sesión**, se puede cambiar el desencadenador a “Al iniciar el equipo” y configurar credenciales; eso es más avanzado y se puede documentar aparte si lo necesitas.

---

### 6. Limpiar el arranque antiguo (acceso directo en `shell:startup`)

Si la tarea `InterfazFacturas` funciona bien y arranca el backend automáticamente:

1. Abrir `Win + R` → escribir `shell:startup` → Enter.
2. Eliminar el acceso directo que lance `start_interfaz_facturas.bat` (para no duplicar ejecuciones).

El `.bat` se puede conservar en el escritorio o en el proyecto por si se quiere arrancar el backend manualmente para depurar (por ejemplo, para ver trazas en una ventana visible).

