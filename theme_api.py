"""Shared, live site theme for MahiCloud.
Wire-up in app.py:
    from theme_api import theme_bp
    app.register_blueprint(theme_bp)
"""
import json
import os
import threading
import time
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request

theme_bp = Blueprint("theme_bp", __name__)

THEMES = {"crimson", "midnight", "emerald", "violet", "amber", "mono"}
# Set THEME_FILE to a mounted persistent/shared volume if theme must survive restarts
# or be shared between multiple service instances.
_FILE = os.environ.get("THEME_FILE", "/tmp/mahicloud_theme.json")
_lock = threading.Lock()
_hits = {}
_RATE_MAX, _RATE_WINDOW = 6, 60


def _load():
    try:
        with open(_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("theme") in THEMES:
            return {"theme": data["theme"], "updated": int(data.get("updated", 0))}
    except (OSError, ValueError, TypeError):
        pass
    return {"theme": "crimson", "updated": 0}


def _no_store(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


_state = _load()


@theme_bp.get("/api/theme")
def get_theme():
    # Refresh from the shared file so multiple Gunicorn workers in one instance
    # observe the same theme instead of keeping stale process-local state.
    global _state
    with _lock:
        disk_state = _load()
        if disk_state.get("updated", 0) >= _state.get("updated", 0):
            _state = disk_state
        result = dict(_state)
    return _no_store(jsonify(result))


@theme_bp.post("/api/theme")
def set_theme():
    origin = request.headers.get("Origin")
    if origin and urlparse(origin).netloc != request.host:
        return _no_store(jsonify(error="forbidden")), 403
    theme = (request.get_json(silent=True) or {}).get("theme")
    if theme not in THEMES:
        return _no_store(jsonify(error="invalid theme")), 400
    now = time.monotonic()
    key = request.remote_addr or "unknown"
    with _lock:
        hits = [t for t in _hits.get(key, []) if now - t < _RATE_WINDOW]
        if len(hits) >= _RATE_MAX:
            return _no_store(jsonify(error="rate limited")), 429
        hits.append(now)
        _hits[key] = hits
        if len(_hits) > 2000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] >= _RATE_WINDOW]:
                _hits.pop(k, None)
        updated = int(time.time())
        _state.update(theme=theme, updated=updated)
        try:
            with open(_FILE, "w", encoding="utf-8") as fh:
                json.dump(_state, fh)
        except OSError:
            # Live theme remains available in this worker until process restart.
            pass
        result = dict(_state)
    return _no_store(jsonify(result))
