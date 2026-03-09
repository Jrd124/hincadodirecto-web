@echo off
cd /d "c:\Users\javie\Desktop\cursor_test"

REM Activar virtualenv si existe
if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

cd interfaz_facturas
python backend.py
