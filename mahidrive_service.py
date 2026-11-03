"""MahiDrive's isolated, fail-closed Flask integration boundary.

Auth and file data remain in the dedicated Supabase project. This module only
publishes non-secret client configuration, rate-limits sign-in, and validates
a bearer token against Supabase Auth and the one configured owner identity.
"""

from __future__ import annotations

import base64
import json
import os
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

import requests
from flask import Blueprint, jsonify, make_response, redirect, request, send_from_directory

mahidrive_bp = Blueprint("mahidrive", __name__)

_AUTH_TIMEOUT = (4, 8)
_LOGIN_LIMIT = 5
_LOGIN_WINDOW_SECONDS = 15 * 60
_SESSION_LIMIT = 120
_SESSION_WINDOW_SECONDS = 60
_rate_events: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def _configuration() -> dict:
    """Read only MahiDrive-specific settings; never fall back to shared MahiCloud keys."""
    url = os.environ.get("MAHIDRIVE_SUPABASE_URL", "").strip().rstrip("/")
    publishable_key = os.environ.get("MAHIDRIVE_SUPABASE_PUBLISHABLE_KEY", "").strip()
    owner_id = os.environ.get("MAHIDRIVE_OWNER_USER_ID", "").strip().lower()

    if not url or not publishable_key or not owner_id:
        return {"ready": False}

    try:
        import uuid
        owner_id = str(uuid.UUID(owner_id))
    except (ValueError, AttributeError):
        return {"ready": False}

    parsed = urlparse(url)
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        return {"ready": False}
    if not parsed.hostname:
        return {"ready": False}

    return {
        "ready": True,
        "url": url,
        "publishable_key": publishable_key,
        "owner_id": owner_id,
    }


def _maximum_file_bytes() -> int:
    raw = os.environ.get("MAHIDRIVE_MAX_FILE_BYTES", str(50 * 1024 * 1024)).strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 50 * 1024 * 1024
    return max(1, min(value, 50 * 1024 * 1024))


def _api_headers(config: dict, access_token: str | None = None) -> dict:
    headers = {
        "apikey": config["publishable_key"],
        "Accept": "application/json",
    }
    if access_token:
        headers["Authorization"] = "Bearer " + access_token
    return headers


def _safe_json(response: requests.Response) -> dict:
    try:
        value = response.json()
    except (ValueError, requests.exceptions.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _rate_limit(bucket: str, limit: int, window: int) -> tuple[bool, int]:
    now = time.monotonic()
    key = (bucket, request.remote_addr or "unknown")
    events = _rate_events[key]
    while events and now - events[0] >= window:
        events.popleft()
    if len(events) >= limit:
        return True, max(1, int(window - (now - events[0])))
    events.append(now)

    # Keep the in-process limiter bounded if clients rotate source addresses.
    if len(_rate_events) > 5000:
        for stale_key in list(_rate_events)[:1000]:
            stale_events = _rate_events[stale_key]
            while stale_events and now - stale_events[0] >= 3600:
                stale_events.popleft()
            if not stale_events:
                _rate_events.pop(stale_key, None)
    return False, 0


def _same_origin_json_request() -> bool:
    """Require a browser-origin POST and a non-simple request header (CSRF defense)."""
    if request.headers.get("X-MahiDrive-Intent") != "1":
        return False
    origin = request.headers.get("Origin", "")
    if not origin:
        return False

    forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower()
    scheme = forwarded_proto if forwarded_proto in {"http", "https"} else ("https" if request.is_secure else "http")
    expected = f"{scheme}://{request.host}".rstrip("/")
    try:
        return urlparse(origin).scheme in {"http", "https"} and origin.rstrip("/") == expected
    except ValueError:
        return False


def _token_claims(access_token: str) -> dict:
    """Decode claims only after Supabase Auth has validated this exact token."""
    parts = access_token.split(".")
    if len(parts) != 3 or not parts[1]:
        return {}
    try:
        payload = parts[1].encode("ascii")
        payload += b"=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        value = json.loads(decoded.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except (ValueError, UnicodeError, json.JSONDecodeError):
        return {}


def _verify_owner(config: dict, access_token: str) -> tuple[dict | None, int | None]:
    """Ask Supabase Auth to validate the token, then enforce the configured owner."""
    try:
        response = requests.get(
            config["url"] + "/auth/v1/user",
            headers=_api_headers(config, access_token),
            timeout=_AUTH_TIMEOUT,
        )
    except requests.RequestException:
        return None, 502

    if response.status_code == 401:
        return None, 401
    if response.status_code != 200:
        return None, 502

    user = _safe_json(response)
    if not user:
        return None, 502

    if (
        str(user.get("id", "")).lower() != config["owner_id"]
        or user.get("is_anonymous") is True
        or not (user.get("email_confirmed_at") or user.get("confirmed_at"))
        or not isinstance(user.get("app_metadata"), dict)
        or user["app_metadata"].get("mahidrive_owner") is not True
    ):
        return None, 403

    return user, None


@mahidrive_bp.get("/mahidrive")
def mahidrive_redirect():
    return redirect("/mahidrive/", code=308)


@mahidrive_bp.get("/mahidrive/")
def mahidrive_index():
    return send_from_directory(
        os.path.join(os.path.dirname(__file__), "web", "mahidrive"),
        "index.html",
        max_age=0,
    )


@mahidrive_bp.get("/api/mahidrive/config")
def mahidrive_public_config():
    config = _configuration()
    # The URL and publishable key are designed for browser use. No owner ID,
    # service-role key, secret key, OAuth credential, or session token is returned.
    if not config["ready"]:
        return jsonify({"ready": False}), 503
    return jsonify({
        "ready": True,
        "supabaseUrl": config["url"],
        "publishableKey": config["publishable_key"],
        "bucket": "mahi-drive-private",
        "schema": "mahidrive",
        "maxFileBytes": _maximum_file_bytes(),
    })


@mahidrive_bp.post("/api/mahidrive/login")
def mahidrive_login():
    config = _configuration()
    if not config["ready"]:
        return jsonify({"error": "MahiDrive authentication is not configured."}), 503
    if not _same_origin_json_request():
        return jsonify({"error": "Request rejected."}), 403

    limited, retry_after = _rate_limit("login", _LOGIN_LIMIT, _LOGIN_WINDOW_SECONDS)
    if limited:
        response = make_response(jsonify({"error": "Too many sign-in attempts. Try again later."}), 429)
        response.headers["Retry-After"] = str(retry_after)
        return response

    if not request.is_json or request.content_length is not None and request.content_length > 16_384:
        return jsonify({"error": "Invalid sign-in request."}), 400

    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")
    if (
        not isinstance(email, str) or not email.strip() or len(email) > 320
        or not isinstance(password, str) or not password or len(password) > 1024
    ):
        return jsonify({"error": "Email and password are required."}), 400

    try:
        response = requests.post(
            config["url"] + "/auth/v1/token",
            params={"grant_type": "password"},
            headers={**_api_headers(config), "Content-Type": "application/json"},
            json={"email": email.strip(), "password": password},
            timeout=_AUTH_TIMEOUT,
        )
    except requests.RequestException:
        return jsonify({"error": "Authentication service is temporarily unavailable."}), 502

    if response.status_code != 200:
        # Never return upstream error details that might enumerate accounts.
        return jsonify({"error": "Sign-in failed or this account is not authorized for MahiDrive."}), 401

    auth_data = _safe_json(response)
    access_token = auth_data.get("access_token")
    refresh_token = auth_data.get("refresh_token")
    if not isinstance(access_token, str) or not isinstance(refresh_token, str):
        return jsonify({"error": "Authentication service returned an invalid session."}), 502

    user, failure_status = _verify_owner(config, access_token)
    if failure_status is not None:
        # Revoke the session created for a valid but unauthorized account.
        try:
            requests.post(
                config["url"] + "/auth/v1/logout",
                headers=_api_headers(config, access_token),
                timeout=_AUTH_TIMEOUT,
            )
        except requests.RequestException:
            pass
        if failure_status == 403:
            return jsonify({"error": "This account is not authorized for MahiDrive."}), 403
        return jsonify({"error": "The owner session could not be verified."}), failure_status

    # Only normal Supabase owner-session tokens are returned. Publishable API
    # keys are public; service-role/secret keys are never loaded by this module.
    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": int(auth_data.get("expires_in") or 3600),
        "token_type": auth_data.get("token_type") or "bearer",
    })


@mahidrive_bp.get("/api/mahidrive/session")
def mahidrive_validate_session():
    config = _configuration()
    if not config["ready"]:
        return jsonify({"error": "MahiDrive authentication is not configured."}), 503

    limited, retry_after = _rate_limit("session", _SESSION_LIMIT, _SESSION_WINDOW_SECONDS)
    if limited:
        response = make_response(jsonify({"error": "Too many requests."}), 429)
        response.headers["Retry-After"] = str(retry_after)
        return response

    authorization = request.headers.get("Authorization", "")
    scheme, separator, access_token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not access_token.strip() or len(access_token) > 8192:
        return jsonify({"authenticated": False}), 401

    user, failure_status = _verify_owner(config, access_token.strip())
    if failure_status is not None:
        if failure_status == 502:
            return jsonify({"error": "Authentication service is temporarily unavailable."}), 502
        if failure_status == 403:
            return jsonify({"authenticated": False, "error": "Owner access is not authorized."}), 403
        return jsonify({"authenticated": False}), 401

    # Supabase Auth /user validates the signature, expiry and project issuer.
    # Inspect assurance claims from that same validated token.
    claims = _token_claims(access_token.strip())
    if claims.get("sub") != user.get("id") or claims.get("role") != "authenticated":
        return jsonify({"authenticated": False}), 401
    if claims.get("aal") != "aal2":
        return jsonify({"authenticated": False, "mfa_required": True}), 403

    return jsonify({"authenticated": True})
