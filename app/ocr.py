"""OCR pipeline: image bytes -> cleaned ingredient text.

Real skincare labels are glossy, low-contrast and small-font, so raw
image_to_string does poorly. Preprocessing pipeline (Pillow — no OpenCV):

  1. Grayscale conversion
  2. Autocontrast normalisation
  3. Upscaling to ≥ 1600px on the longest edge (Tesseract loves large fonts)
  4. Median blur (radius 1) — removes salt-and-pepper noise from glossy reflections
  5. Sharpening — enhances edges so Tesseract can separate glyphs
  6. Adaptive binarization — tries the simple threshold first; if the result
     is trivially white or black (a glare patch), falls back to a softer
     threshold. This handles the common problem of shiny label reflections.

We also fail *clearly*: if the Tesseract binary isn't installed, the caller
gets an actionable message instead of a generic 500.
"""

import io
import logging
import os
import re
import shutil

from PIL import Image, ImageOps, ImageFilter  # type: ignore[import-untyped]
from app.config import settings

logger = logging.getLogger("skinguard.ocr")


try:
    import pytesseract  # type: ignore[import-untyped]
    from pytesseract import TesseractNotFoundError
except Exception:  # pragma: no cover - import guard
    pytesseract = None

    class TesseractNotFoundError(Exception):  # type: ignore[no-redef]
        pass


def _locate_tesseract() -> None:
    """Point pytesseract at the engine.

    Prefer an explicit TESSERACT_CMD env var, then PATH, then the standard
    Windows install location.
    """
    if pytesseract is None:
        return
    explicit = os.environ.get("TESSERACT_CMD")
    if explicit and os.path.exists(explicit):
        pytesseract.pytesseract.tesseract_cmd = explicit
        return
    if shutil.which("tesseract"):
        return
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    ):
        if os.path.exists(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return


_locate_tesseract()


class OCRUnavailable(Exception):
    """Raised when the Tesseract engine binary is not installed."""


def _binarize_adaptive(img: Image.Image, primary_threshold: int = 150) -> Image.Image:
    """Binarize with a simple threshold; fall back to a softer one if the
    result is trivially all-white or all-black (indicates glare/deep shadow).

    This handles the common case of a shiny label where a single threshold
    turns an entire region to pure white, losing all text detail.
    """
    result = img.point(lambda p: 255 if p > primary_threshold else 0)
    pixels = result.getdata()
    white_frac = sum(1 for p in pixels if p == 255) / len(pixels)

    if white_frac > 0.97 or white_frac < 0.03:
        # Glare or shadow: use a softer mid-point threshold
        result = img.point(lambda p: 255 if p > 128 else 0)

    return result


def preprocess(image: Image.Image) -> Image.Image:
    """Full preprocessing pipeline for ingredient label images."""
    # 1. Grayscale + auto-contrast
    img = ImageOps.grayscale(image)
    img = ImageOps.autocontrast(img)

    # 2. Upscale small images — Tesseract accuracy degrades below ~150 DPI
    w, h = img.size
    if max(w, h) < 1600:
        scale = 1600 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # 3. Median blur (1px radius equivalent via MedianFilter 3×3) — removes
    #    salt-and-pepper noise typical of glossy label photos without blurring edges.
    img = img.filter(ImageFilter.MedianFilter(size=3))

    # 4. Sharpen — recovers edge definition after median blur
    img = img.filter(ImageFilter.SHARPEN)

    # 5. Adaptive binarization — handles glare patches
    img = _binarize_adaptive(img)

    return img


def clean_text(text: str) -> str:
    """Normalise OCR output into a single comma-separated-ish line."""
    text = re.sub(r"(?i)\bingredients?\b\s*[:\-]?", " ", text)
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_text(image_bytes: bytes) -> str:
    # ── Google Cloud Vision OCR ──
    if settings.ocr_provider == "google_cloud":
        try:
            from google.cloud import vision
            
            # Note: client automatically authenticates using GOOGLE_APPLICATION_CREDENTIALS
            # or standard GCP environment checks.
            client = vision.ImageAnnotatorClient()
            image = vision.Image(content=image_bytes)
            response = client.text_detection(image=image)
            
            if response.error.message:
                raise Exception(response.error.message)
                
            texts = response.text_annotations
            if texts:
                return clean_text(texts[0].description)
            else:
                logger.info("Google Cloud Vision returned empty text.")
                return ""
        except Exception as exc:
            logger.warning(
                "Google Cloud Vision OCR failed: %s. Falling back to local Tesseract.",
                exc
            )

    # ── Local Tesseract OCR (Fallback or primary) ──
    if pytesseract is None:
        raise OCRUnavailable(
            "pytesseract is not installed. Run: pip install pytesseract"
        )
    try:
        image = Image.open(io.BytesIO(image_bytes))
        processed = preprocess(image)
        # PSM 6: assume a uniform block of text (typical for ingredient lists)
        raw = pytesseract.image_to_string(processed, config="--psm 6")
    except TesseractNotFoundError as exc:
        raise OCRUnavailable(
            "The Tesseract OCR engine is not installed on this machine. "
            "Install it (Windows: https://github.com/UB-Mannheim/tesseract/wiki) "
            "and ensure 'tesseract' is on your PATH."
        ) from exc
    return clean_text(raw)
