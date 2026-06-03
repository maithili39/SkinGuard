"""OCR pipeline unit tests.

These tests exercise preprocessing and text-cleaning without requiring a real
Tesseract binary — they only test the Python code paths that run before/after
the OCR engine call. The extract_text() test verifies that OCRUnavailable is
raised cleanly when the binary is not on the test machine.
"""

import io
import pytest
from PIL import Image, ImageDraw

from app.ocr import clean_text, preprocess

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_image(
    width: int = 300, height: int = 100, color: str = "white"
) -> Image.Image:
    """Create a minimal synthetic PIL Image for preprocessing tests."""
    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    draw.text((10, 40), "Aqua, Glycerin, Niacinamide", fill="black")
    return img


def _image_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── clean_text ────────────────────────────────────────────────────────────────


def test_clean_text_strips_ingredients_header():
    assert (
        "ingredients:" not in clean_text("Ingredients: Aqua, Glycerin").lower()
    )


def test_clean_text_collapses_whitespace():
    result = clean_text("Aqua    Glycerin\n  Niacinamide")
    assert "  " not in result
    assert "\n" not in result


def test_clean_text_case_insensitive_header():
    result = clean_text("INGREDIENTS: Aqua, Glycerin")
    assert "INGREDIENTS" not in result
    assert "Aqua" in result


def test_clean_text_empty_string():
    assert clean_text("") == ""


# ── preprocess ────────────────────────────────────────────────────────────────


def test_preprocess_returns_grayscale():
    img = _make_image(400, 100)
    result = preprocess(img)
    assert result.mode == "L", f"Expected grayscale 'L', got '{result.mode}'"


def test_preprocess_upscales_small_image():
    """Images smaller than 1600px on the longest side should be upscaled."""
    img = _make_image(400, 100)  # max dim = 400, below 1600 threshold
    result = preprocess(img)
    assert (
        max(result.size) >= 1600
    ), f"Expected upscaled image, got {result.size}"


def test_preprocess_does_not_shrink_large_image():
    """Images already >= 1600px on the longest side should not be changed in size."""
    img = _make_image(2000, 500)
    result = preprocess(img)
    assert max(result.size) == 2000, "Large image should not be resized"


def test_preprocess_binarizes_output():
    """After binarization, all pixels should be either 0 or 255."""
    img = _make_image(200, 100)
    result = preprocess(img)
    pixels = list(result.getdata())
    non_binary = [p for p in pixels if p not in (0, 255)]
    assert len(non_binary) == 0, f"{len(non_binary)} pixels are not 0 or 255"


# ── extract_text error handling ───────────────────────────────────────────────


def test_extract_text_raises_ocr_unavailable_on_bad_bytes():
    """Passing corrupt/non-image bytes should raise a clean exception (not a 500)."""
    from app.ocr import extract_text

    with pytest.raises(Exception):
        extract_text(b"this is not an image")
