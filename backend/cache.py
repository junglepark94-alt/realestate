"""Unified cache layer.

Stores JSON blobs in Redis when REDIS_URL is set (survives Railway redeploys),
otherwise falls back to local files under .cache/ so local dev needs no Redis.

The daily scheduler overwrites these keys with fresh data; on redeploy the new
container reads the still-present Redis values and serves them immediately while
the background refresh runs.
"""

import os
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)

_KEY_PREFIX = "realestate:cache:"

_redis = None
_redis_init = False


def _get_redis():
    """Lazily connect to Redis. Returns the client, or None to use files."""
    global _redis, _redis_init
    if _redis_init:
        return _redis
    _redis_init = True

    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        logger.info("[cache] REDIS_URL not set — using file cache")
        return None
    try:
        import redis  # imported lazily so file-only deployments don't need it
        client = redis.from_url(url, decode_responses=True, socket_timeout=5)
        client.ping()
        _redis = client
        logger.info("[cache] Connected to Redis")
    except Exception as e:
        logger.warning(f"[cache] Redis unavailable ({e}) — falling back to file cache")
        _redis = None
    return _redis


def read_json(key: str) -> dict | None:
    """Read a JSON value by logical key. Returns None if absent/unparseable."""
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(_KEY_PREFIX + key)
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.warning(f"[cache] Redis read failed for {key}: {e} — trying file")

    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(key: str, data: dict) -> None:
    """Write a JSON value by logical key. Writes to Redis or file as available."""
    r = _get_redis()
    if r is not None:
        try:
            r.set(_KEY_PREFIX + key, json.dumps(data, ensure_ascii=False))
            return
        except Exception as e:
            logger.warning(f"[cache] Redis write failed for {key}: {e} — writing file")

    path = CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def acquire_lock(name: str, ttl_seconds: int = 3600) -> bool:
    """Best-effort distributed lock (Redis SET NX EX).

    Returns True if the lock was acquired. With Redis this is cross-process, so
    only one gunicorn worker runs a guarded section (e.g. the daily refresh).
    Without Redis (local file cache) there is nothing to coordinate across
    processes, so it always returns True and the caller's in-process lock applies.
    The TTL auto-releases the lock if the holder dies mid-task.
    """
    r = _get_redis()
    if r is None:
        return True
    try:
        return bool(r.set(_KEY_PREFIX + "lock:" + name, "1", nx=True, ex=ttl_seconds))
    except Exception as e:
        logger.warning(f"[cache] acquire_lock({name}) failed: {e} — proceeding without lock")
        return True


def release_lock(name: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.delete(_KEY_PREFIX + "lock:" + name)
    except Exception as e:
        logger.warning(f"[cache] release_lock({name}) failed: {e}")
