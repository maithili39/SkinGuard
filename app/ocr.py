"""OCR pipeline: image bytes -> cleaned ingredient text.

Real skincare labels are glossy, low-contrast and small-font, so raw
image_to_string does poorly. We preprocess with Pillow (no OpenCV dependency):
grayscale -> autocontrast -> upscale -> binarize. This is the single biggest
lever on real-world accuracy.

We also fail *clearly*: if the Tesseract binary isn't installed, the caller gets
an actionable message instead of a generic 500.
"""

import io
import os
import re
import shutil

from PIL import Image, ImageOps, ImageFilter  # type: ignore[import-untyped]

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
    Windows install location. This means the app works right after a `winget`
    install without the user having to edit their PATH.
    """
    if pytesseract is None:
        return
    explicit = os.environ.get("TESSERACT_CMD")
    if explicit and os.path.exists(explicit):
        pytesseract.pytesseract.tesseract_cmd = explicit
        return
    if shutil.which("tesseract"):
        return  # already on PATH
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


def preprocess(image: Image.Image) -> Image.Image:
    # Convert to grayscale and normalise contrast.
    img = ImageOps.grayscale(image)
    img = ImageOps.autocontrast(img)

    # Upscale small images so small label fonts become legible to Tesseract.
    w, h = img.size
    if max(w, h) < 1600:
        scale = 1600 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Light sharpen then binarize (Otsu-like simple threshold).
    img = img.filter(ImageFilter.SHARPEN)
    img = img.point(lambda p: 255 if p > 150 else 0)
    return img


def clean_text(text: str) -> str:
    """Normalise OCR output into a single comma-separated-ish line.

    Many labels read 'Ingredients: a, b, c'. We strip that prefix and collapse
    whitespace; ingredient splitting itself happens later in the matcher.
    """
    text = re.sub(r"(?i)\bingredients?\b\s*[:\-]?", " ", text)
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_text(image_bytes: bytes) -> str:
    if pytesseract is None:
        raise OCRUnavailable(
            "pytesseract is not installed. Run: pip install pytesseract"
        )
    try:
        image = Image.open(io.BytesIO(image_bytes))
        processed = preprocess(image)
        raw = pytesseract.image_to_string(processed)
    except TesseractNotFoundError as exc:
        raise OCRUnavailable(
            "The Tesseract OCR engine is not installed on this machine. "
            "Install it (Windows: https://github.com/UB-Mannheim/tesseract/wiki) "
            "and ensure 'tesseract' is on your PATH."
        ) from exc
    return clean_text(raw)
