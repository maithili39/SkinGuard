"""Barcode lookup for SkinGuard.

Strategy (three-tier fallback):
1. Open Beauty Facts (world.openbeautyfacts.org) — primary; cosmetic-specific data.
2. Open Food Facts  (world.openfoodfacts.org)  — broader barcode coverage.
3. UPC Item DB (api.upcitemdb.com) — global UPC/EAN database, last resort.
"""

import httpx
from functools import lru_cache
from typing import Dict, Any
from pathlib import Path

try:
    _VERSION = Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()
except Exception:
    _VERSION = "0.4.0"

_USER_AGENT = f"SkinGuard/{_VERSION} (+https://github.com/maithili39/SkinGuard)"
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

def _lookup_upcitemdb(barcode: str) -> Dict[str, Any]:
    """Last-resort lookup via UPC Item DB (free tier, no API key required for low volume)."""
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
    with httpx.Client(timeout=_TIMEOUT) as client:
        response = client.get(url, headers={"User-Agent": _USER_AGENT})

    if response.status_code in (404, 429):
        raise ProductNotFound(f"Product {barcode} not found in UPC Item DB.")
    response.raise_for_status()

    data = response.json()
    items = data.get("items", [])
    if not items:
        raise ProductNotFound(f"Product {barcode} not found in UPC Item DB.")

    item = items[0]
    # UPC Item DB doesn't have ingredient lists — return name/brand only so
    # the caller can display product info even without ingredients.
    product_name = item.get("title") or "Unknown Product"
    brand = item.get("brand") or "Unknown Brand"
    image_url = (item.get("images") or [None])[0]

    raise ProductNotFound(
        f"Found '{product_name}' by {brand} in UPC Item DB, but no ingredient list is available. "
        f"Try searching for this product manually."
    )


def lookup_barcode(barcode: str) -> Dict[str, Any]:
    """Look up a barcode across three databases (OBF → OFF → UPC Item DB).

    Returns:
        dict with keys: product_name, brands, ingredients_text, image_url, source.

    Raises:
        ProductNotFound: if no database has the product with an ingredient list.
        Exception: for unrecoverable network errors.
    """
    last_exc: Exception = ProductNotFound(f"Product {barcode} not found in any database.")

    # Tier 1 + 2: Open*Facts (identical JSON schema)
    for base_url in ("https://world.openbeautyfacts.org", "https://world.openfoodfacts.org"):
        try:
            return _lookup_from(base_url, barcode)
        except ProductNotFound as exc:
            last_exc = exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                last_exc = ProductNotFound(str(exc))
            else:
                raise Exception(f"HTTP error from {base_url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise Exception(f"Network error reaching {base_url}: {exc}") from exc

    # Tier 3: UPC Item DB — better global UPC coverage, no ingredient lists
    try:
        _lookup_upcitemdb(barcode)
    except ProductNotFound as exc:
        last_exc = exc
    except Exception:
        pass  # UPC Item DB failure is non-fatal — surface the original not-found

    raise last_exc


@lru_cache(maxsize=128)
def cached_lookup_barcode(barcode: str) -> Dict[str, Any]:
    """In-process LRU cache — Redis caching is handled at the API layer."""
    return lookup_barcode(barcode)
