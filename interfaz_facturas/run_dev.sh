#!/usr/bin/env bash
# ── Hincado ERP – Arranque local de desarrollo ──
# Uso:  ./run_dev.sh
#
# Crea un virtualenv si no existe, instala dependencias y arranca Flask
# en modo debug con recarga automática.

set -euo pipefail
cd "$(dirname "$0")"

VENV_DIR="venv"
PYTHON="${VENV_DIR}/bin/python"
PIP="${VENV_DIR}/bin/pip"

# 1. Crear virtualenv si no existe
if [ ! -d "$VENV_DIR" ]; then
  echo "📦 Creando virtualenv..."
  python3 -m venv "$VENV_DIR"
fi

# 2. Instalar / actualizar dependencias
echo "📥 Instalando dependencias..."
"$PIP" install -q -r requirements.txt

# 3. Copiar .env si no existe
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "📋 Creado .env desde .env.example (edítalo con tus valores)"
  fi
fi

# 4. Crear directorios de datos
mkdir -p data/logs data/backups data/subidas

# 5. Arrancar Flask en modo debug
echo ""
echo "🚀 Arrancando en http://localhost:8000"
echo "   Ctrl+C para parar"
echo ""
"$PYTHON" backend.py
