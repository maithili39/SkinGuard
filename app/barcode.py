import httpx
from functools import lru_cache
from typing import Dict, Any, Optional

class ProductNotFound(Exception):
    pass

def lookup_barcode(barcode: str) -> Dict[str, Any]:
    """Look up a barcode on the Open Beauty Facts API.
    
    Returns:
        dict: {
            "product_name": str,
            "brands": str,
            "ingredients_text": str,
            "image_url": Optional[str]
        }
    Raises:
        ProductNotFound: if the product does not exist or has no ingredients list.
        Exception: for network/HTTP errors.
    """
    url = f"https://world.openbeautyfacts.org/api/v2/product/{barcode}.json"
    headers = {
        "User-Agent": "SkinGuard - Version 0.3.0 - https://github.com/maithili39/SkinGuard"
    }
    
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers)
            if response.status_code != 200:
                raise ProductNotFound(f"API returned status code {response.status_code}")
            
            data = response.json()
            if data.get("status") != 1 or "product" not in data:
                raise ProductNotFound("Product not found in Open Beauty Facts database.")
                
            product = data["product"]
            ingredients_text = product.get("ingredients_text")
            if not ingredients_text or not ingredients_text.strip():
                ingredients_text = product.get("ingredients_text_en")
            
            if not ingredients_text or not ingredients_text.strip():
                raise ProductNotFound("Product found, but it has no ingredients list.")
                
            image_url = product.get("image_front_url") or product.get("image_url")
            
            return {
                "product_name": product.get("product_name") or "Unknown Product",
                "brands": product.get("brands") or "Unknown Brand",
                "ingredients_text": ingredients_text.strip(),
                "image_url": image_url
            }
    except httpx.HTTPError as exc:
        raise Exception(f"HTTP request to Open Beauty Facts failed: {exc}")

@lru_cache(maxsize=128)
def cached_lookup_barcode(barcode: str) -> Dict[str, Any]:
    return lookup_barcode(barcode)
