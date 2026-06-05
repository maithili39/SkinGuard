# SkinGuard backend: FastAPI + Tesseract OCR
FROM python:3.12-slim

# System deps: Tesseract OCR engine (pytesseract is just a wrapper) + libs Pillow
# may need for certain image formats. Kept minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt


# Application code.
COPY VERSION ./VERSION
COPY data ./data
COPY app ./app
COPY scripts ./scripts
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Entrypoint waits for the DB, seeds it on first run, then starts the API.
ENTRYPOINT ["./docker/entrypoint.sh"]
