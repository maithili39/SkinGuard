"""Barcode lookup for SkinGuard.

Strategy (two-tier fallback):
1. Open Beauty Facts (world.openbeautyfacts.org) — primary; has cosmetic-specific data.
2. Open Food Facts  (world.openfoodfacts.org)  — fallback; broader barcode coverage,
   useful for dual-use products (e.g. coconut oil, shea butter, aloe vera gel).

Both APIs share the same JSON schema so the parsing code is identical.
"""

import httpx
from functools import lru_cache
from typing import Dict, Any

_USER_AGENT = "SkinGuard/0.4.0 (+https://github.com/maithili39/SkinGuard)"
_TIMEOUT = 10.0


class ProductNotFound(Exception):
    pass


# ── Per-source lookup ──────────────────────────────────────────────────────────

def _lookup_from(base_url: str, barcode: str) -> Dict[str, Any]:
    """Attempt a lookup on any Open*Facts API endpoint.

    Raises:
        ProductNotFound: product absent or has no ingredient list.
        httpx.HTTPError: network / HTTP-level failure (let caller decide).
    """
    url = f"{base_url}/api/v2/product/{barcode}.json"
    with httpx.Client(timeout=_TIMEOUT) as client:
        response = client.get(url, headers={"User-Agent": _USER_AGENT})

    if response.status_code == 404:
        raise ProductNotFound(f"Product {barcode} not found (HTTP 404).")
    response.raise_for_status()

    data = response.json()
    if data.get("status") != 1 or "product" not in data:
        raise ProductNotFound(f"Product {barcode} not found in database.")

    product = data["product"]

    # Prefer the localised English ingredient list, fall back to generic.
    ingredients_text = (
        product.get("ingredients_text_en")
        or product.get("ingredients_text")
        or ""
    ).strip()
    if not ingredients_text:
        raise ProductNotFound(f"Product {barcode} found but has no ingredients list.")

    image_url = product.get("image_front_url") or product.get("image_url")

    return {
        "product_name": product.get("product_name") or "Unknown Product",
        "brands": product.get("brands") or "Unknown Brand",
        "ingredients_text": ingredients_text,
        "image_url": image_url,
        "source": base_url.split("//")[1].split(".org")[0],  # e.g. "world.openbeautyfacts"
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def lookup_barcode(barcode: str) -> Dict[str, Any]:
    """Look up a barcode, trying Open Beauty Facts then Open Food Facts.

    Returns:
        dict with keys: product_name, brands, ingredients_text, image_url, source.

    Raises:
        ProductNotFound: if neither database has the product/ingredients.
        Exception: for unrecoverable network errors.
    """
    sources = [
        "https://world.openbeautyfacts.org",
        "https://world.openfoodfacts.org",
    ]
    last_exc: Exception = ProductNotFound(f"Product {barcode} not found in any database.")

    for base_url in sources:
        try:
            return _lookup_from(base_url, barcode)
        except ProductNotFound as exc:
            last_exc = exc
            continue  # try next source
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                last_exc = ProductNotFound(str(exc))
                continue
            # Non-404 HTTP error — propagate immediately
            raise Exception(f"HTTP error from {base_url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise Exception(f"Network error reaching {base_url}: {exc}") from exc

    raise last_exc


@lru_cache(maxsize=128)
def cached_lookup_barcode(barcode: str) -> Dict[str, Any]:
    """In-process LRU cache — Redis caching is handled at the API layer."""
    return lookup_barcode(barcode)
