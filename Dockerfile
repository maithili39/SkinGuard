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
RUN pip install --no-cache-dir -r requirements.txt

# Application code. `data/` is bind-mounted via compose (holds the gitignored
# CosIng CSV), so it is intentionally NOT copied into the image.
COPY app ./app
COPY scripts ./scripts
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 8000

# Entrypoint waits for the DB, seeds it on first run, then starts the API.
ENTRYPOINT ["./docker/entrypoint.sh"]
