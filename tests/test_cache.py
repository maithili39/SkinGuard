import pytest
from unittest.mock import patch, MagicMock
import json

from app.cache import (
    make_key,
    hash_text,
    hash_bytes,
    get_cached,
    set_cached,
    delete_cached,
    flush_namespace,
    cache_info,
    _get_client,
)
import app.cache as cache_module

def test_make_key():
    assert make_key("analyze", "hash123") == "sg:analyze:hash123"
    assert make_key("users", "email", "history") == "sg:users:email:history"

def test_hash_text_and_bytes():
    txt_hash = hash_text("niacinamide")
    assert len(txt_hash) == 16
    
    bytes_hash = hash_bytes(b"niacinamide")
    assert bytes_hash == txt_hash

@patch("app.cache._get_client")
def test_cache_disabled(mock_get_client):
    mock_get_client.return_value = None
    
    assert get_cached("sg:test:key") is None
    assert set_cached("sg:test:key", {"val": 1}) is False
    assert delete_cached("sg:test:key") is False
    assert flush_namespace("test") == 0
    assert cache_info() == {"available": False}

@patch("app.cache._get_client")
def test_cache_enabled_success(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    # 1. get_cached hit
    mock_client.get.return_value = json.dumps({"a": 1})
    assert get_cached("key1") == {"a": 1}
    mock_client.get.assert_called_with("key1")
    
    # 2. get_cached miss
    mock_client.get.return_value = None
    assert get_cached("key2") is None
    
    # 3. set_cached
    mock_client.setex.return_value = True
    assert set_cached("key3", {"b": 2}, ttl=60) is True
    mock_client.setex.assert_called_with("key3", 60, json.dumps({"b": 2}))
    
    # 4. delete_cached
    mock_client.delete.return_value = True
    assert delete_cached("key4") is True
    mock_client.delete.assert_called_with("key4")
    
    # 5. flush_namespace
    mock_client.scan_iter.return_value = ["sg:test:1", "sg:test:2"]
    assert flush_namespace("test") == 2
    mock_client.delete.assert_any_call("sg:test:1")
    mock_client.delete.assert_any_call("sg:test:2")
    
    # 6. cache_info
    mock_client.info.return_value = {"redis_version": "7.0.0"}
    assert cache_info() == {"available": True, "redis_version": "7.0.0"}

@patch("app.cache._get_client")
def test_cache_exceptions(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    mock_client.get.side_effect = Exception("error")
    assert get_cached("key") is None
    
    mock_client.setex.side_effect = Exception("error")
    assert set_cached("key", "val") is False
    
    mock_client.delete.side_effect = Exception("error")
    assert delete_cached("key") is False
    
    mock_client.scan_iter.side_effect = Exception("error")
    assert flush_namespace("namespace") == 0
    
    mock_client.info.side_effect = Exception("error")
    assert cache_info() == {"available": False}

def test_get_client_connect_failure():
    pytest.importorskip("redis")
    # Force _client_tried to False so it attempts connection
    with patch("app.cache._client_tried", False), \
         patch("redis.Redis.from_url") as mock_from_url:
        
        mock_r = MagicMock()
        mock_from_url.return_value = mock_r
        mock_r.ping.side_effect = Exception("Redis unreachable")
        
        client = _get_client()
        assert client is None
