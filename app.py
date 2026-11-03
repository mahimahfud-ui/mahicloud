"""MahiDrive-only Flask entry point.

The former MahiCloud catalogue, AI, admin, social, and utility routes are
intentionally no longer registered. MahiDrive is the sole application served
from this deployment; its data and authentication remain in its dedicated
Supabase project.
"""
import os
from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, request, send_from_directory

from mahidrive_service import mahidrive_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DRIVE_DIR = os.path.join(BASE_DIR, "web", "mahidrive")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
app.register_blueprint(mahidrive_bp)


@app.get("/")
def home():
    return redirect("/mahidrive/", code=302)


@app.get("/mahidrive/<path:asset>")
def mahidrive_assets(asset):
    # Only the dedicated MahiDrive frontend assets are publicly served.
    return send_from_directory(DRIVE_DIR, asset, max_age=3600)


@app.get("/sw.js")
def retire_legacy_service_worker():
    return send_from_directory(DRIVE_DIR, "sw-reset.js", mimetype="application/javascript", max_age=0)


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "MahiDrive"})


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers["Cache-Control"] = "no-store" if response.content_type.startswith("application/json") else "no-cache"

    if request_path_is_drive(response):
        drive_url = os.environ.get("MAHIDRIVE_SUPABASE_URL", "").strip().rstrip("/")
        host = urlparse(drive_url).hostname if drive_url else None
        connect = ""
        if host and host.endswith(".supabase.co"):
            connect = f" {drive_url} https://{host.replace('.supabase.co', '.storage.supabase.co')}"
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
            "media-src 'self' blob:; frame-src 'self' blob:; "
            "connect-src 'self' https://cdn.jsdelivr.net" + connect + "; "
            "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
            "form-action 'self'; frame-ancestors 'self'"
        )

    forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower()
    if request.is_secure or forwarded_proto == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


def request_path_is_drive(response):
    return request.path == "/" or request.path.startswith("/mahidrive") or request.path.startswith("/api/mahidrive")


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "Request is too large."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
