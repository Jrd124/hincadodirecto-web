FROM python:3.11-slim

# Dependencias del sistema para ReportLab, Pillow, OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    libffi-dev \
    tesseract-ocr \
    tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# Copiar codigo
COPY . .

# Base dir para config.py (evita que parents[1] resuelva a "/" en el contenedor)
ENV APP_BASE_DIR=/app

# Crear directorios de datos si no existen
RUN mkdir -p /app/data /app/data/logs /app/data/backups

# Puerto
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Script de arranque: bot Telegram en background + Gunicorn
COPY start.sh .
RUN chmod +x start.sh
CMD ["./start.sh"]
