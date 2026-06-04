"""
app/cache.py — Resilient Redis caching layer for SkinGuard.

Design principles:
  • Zero-dependency on Redis being available: every operation has a try/except
    that silently degrades to a cache miss so the app works identically with or
    without Redis.
  • Lazy connection — the client is created once on first use, not at import
    time, so unit tests that don't need Redis are not impacted.
  • JSON serialisation so cached values are human-readable in redis-cli.
  • TTL defaults are conservative; hot paths (analyze) get a longer TTL than
    write-heavy paths.

Usage example
─────────────
    from app.cache import get_cached, set_cached, make_key
    import hashlib, json

    key = make_key("analyze", hashlib.sha256(text.encode()).hexdigest())
    cached = get_cached(key)
    if cached is not None:
        return cached                    # instant response

    result = expensive_operation(text)
    set_cached(key, result, ttl=300)
    return result
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger("skinguard.cache")

# ── Lazy singleton ────────────────────────────────────────────────────────────
_client = None          # redis.Redis instance or None when unavailable
_client_tried = False   # avoid repeated connection attempts per process


def _get_client():
    """Return a connected Redis client, or None if Redis is unavailable."""
    global _client, _client_tried
    if _client_tried:
        return _client

    _client_tried = True
    try:
        import redis  # type: ignore
        from app.config import settings
        r = redis.Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=1,   # fail fast during startup health-check
            socket_timeout=1,
            decode_responses=True,
        )
        # Confirm the connection is live.
        r.ping()
        _client = r
        logger.info("Redis cache connected: %s", settings.redis_url)
    except Exception as exc:
        logger.warning(
            "Redis unavailable (%s). Caching is disabled — "
            "the application will run without a cache layer.",
            exc,
        )
        _client = None

    return _client


# ── Public helpers ────────────────────────────────────────────────────────────

def make_key(namespace: str, *parts: str) -> str:
    """Build a namespaced cache key.

    Example:
        make_key("analyze", "sha256hash")  →  "sg:analyze:sha256hash"
    """
    return "sg:" + namespace + ":" + ":".join(parts)


def hash_text(text: str) -> str:
    """Return the first 16 hex chars of SHA-256 of *text* (sufficient for cache keys)."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def hash_bytes(data: bytes) -> str:
    """Return the first 16 hex chars of SHA-256 of *data*."""
    return hashlib.sha256(data).hexdigest()[:16]


def get_cached(key: str) -> Any | None:
    """Return the deserialized cached value for *key*, or None on any error / cache miss."""
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.debug("Cache GET error for key %r: %s", key, exc)
        return None


def set_cached(key: str, value: Any, ttl: int = 300) -> bool:
    """Serialise *value* to JSON and store it in Redis with the given TTL (seconds).

    Returns True on success, False on any error (including Redis being down).
    """
    client = _get_client()
    if client is None:
        return False
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as exc:
        logger.debug("Cache SET error for key %r: %s", key, exc)
        return False


def delete_cached(key: str) -> bool:
    """Delete a single key from the cache. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.delete(key)
        return True
    except Exception as exc:
        logger.debug("Cache DELETE error for key %r: %s", key, exc)
        return False


def flush_namespace(namespace: str) -> int:
    """Delete all keys that start with 'sg:<namespace>:'.

    Uses SCAN to avoid blocking the Redis server. Returns the count deleted.
    """
    client = _get_client()
    if client is None:
        return 0
    deleted = 0
    try:
        pattern = f"sg:{namespace}:*"
        for key in client.scan_iter(pattern, count=100):
            client.delete(key)
            deleted += 1
    except Exception as exc:
        logger.debug("Cache FLUSH error for namespace %r: %s", namespace, exc)
    return deleted


def cache_info() -> dict:
    """Return cache connectivity status for the /health endpoint."""
    client = _get_client()
    if client is None:
        return {"available": False}
    try:
        info = client.info("server")
        return {
            "available": True,
            "redis_version": info.get("redis_version"),
        }
    except Exception:
        return {"available": False}
