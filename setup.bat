@echo off
echo === Instalacion del Sistema de Gestion Integral ===
echo.

cd /d "%~dp0"

REM Crear entorno virtual si no existe
if not exist ".venv" (
    echo Creando entorno virtual...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: No se pudo crear el entorno virtual. Asegurate de tener Python 3.11+ instalado.
        pause
        exit /b 1
    )
)

REM Activar entorno virtual
call ".venv\Scripts\activate.bat"

REM Instalar dependencias
echo Instalando dependencias...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Fallo al instalar dependencias.
    pause
    exit /b 1
)

echo.
echo === Instalacion completada ===
echo.
echo Pasos siguientes:
echo   1. Crea un archivo .env con tus claves (ver README.md)
echo   2. Ejecuta start_interfaz_facturas.bat para arrancar
echo.
pause
