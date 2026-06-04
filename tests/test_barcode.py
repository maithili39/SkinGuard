import pytest
from unittest.mock import patch, MagicMock
import httpx

from app.barcode import (
    ProductNotFound,
    _lookup_from,
    _lookup_upcitemdb,
    lookup_barcode,
    cached_lookup_barcode,
)

def test_lookup_from_not_found():
    with patch("httpx.Client.get") as mock_get:
        # Mock 404 response
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        with pytest.raises(ProductNotFound) as exc:
            _lookup_from("https://world.openbeautyfacts.org", "123456789")
        assert "not found (HTTP 404)" in str(exc.value)

def test_lookup_from_no_ingredients():
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": 1,
            "product": {
                "product_name": "Test Cream",
                "brands": "Nice Brand",
                "ingredients_text": "",
            }
        }
        mock_get.return_value = mock_response
        
        with pytest.raises(ProductNotFound) as exc:
            _lookup_from("https://world.openbeautyfacts.org", "123456789")
        assert "has no ingredients list" in str(exc.value)

def test_lookup_from_success():
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": 1,
            "product": {
                "product_name": "Test Cream",
                "brands": "Nice Brand",
                "ingredients_text_en": "Aqua, Glycerin",
                "image_front_url": "https://img.com/test.jpg"
            }
        }
        mock_get.return_value = mock_response
        
        res = _lookup_from("https://world.openbeautyfacts.org", "123456789")
        assert res["product_name"] == "Test Cream"
        assert res["brands"] == "Nice Brand"
        assert res["ingredients_text"] == "Aqua, Glycerin"
        assert res["image_url"] == "https://img.com/test.jpg"
        assert res["source"] == "world.openbeautyfacts"

def test_lookup_upcitemdb_not_found():
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"items": []}
        mock_get.return_value = mock_response
        
        with pytest.raises(ProductNotFound) as exc:
            _lookup_upcitemdb("123456789")
        assert "not found in UPC Item DB" in str(exc.value)

def test_lookup_upcitemdb_raises_product_not_found():
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "items": [
                {
                    "title": "Nice Cream",
                    "brand": "Sleek Brand",
                    "images": ["https://img.com/cream.jpg"]
                }
            ]
        }
        mock_get.return_value = mock_response
        
        with pytest.raises(ProductNotFound) as exc:
            _lookup_upcitemdb("123456789")
        assert "but no ingredient list is available" in str(exc.value)

@patch("app.barcode._lookup_from")
@patch("app.barcode._lookup_upcitemdb")
def test_lookup_barcode_all_tiers(mock_upc, mock_lookup_from):
    # Tier 1 & 2 fail, Tier 3 raises ProductNotFound with product details
    mock_lookup_from.side_effect = ProductNotFound("Not found")
    mock_upc.side_effect = ProductNotFound("Found in UPC but no ingredients")
    
    with pytest.raises(ProductNotFound) as exc:
        lookup_barcode("123456789")
    assert "Found in UPC but no ingredients" in str(exc.value)
    
    # Tier 1 fails, Tier 2 succeeds
    mock_lookup_from.side_effect = [ProductNotFound("Not found"), {"product_name": "Food Item", "ingredients_text": "Aqua"}]
    res = lookup_barcode("123456789")
    assert res["product_name"] == "Food Item"

def test_cached_lookup():
    with patch("app.barcode.lookup_barcode") as mock_lookup:
        mock_lookup.return_value = {"product_name": "Cached Cream"}
        # Clear cache before testing to ensure call goes through
        cached_lookup_barcode.cache_clear()
        
        res1 = cached_lookup_barcode("999")
        res2 = cached_lookup_barcode("999")
        
        assert res1 == {"product_name": "Cached Cream"}
        assert res2 == {"product_name": "Cached Cream"}
        mock_lookup.assert_called_once_with("999")
