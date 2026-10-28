import unittest

from app import app


class MahiCloudRouteTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_shared_mobile_polish_assets_and_page_metadata(self):
        pages = (
            ("/", ("/mc-home.css", "/mc-home.js", "/mahi-ai-launcher.js")),
            ("/mahi-ai/", ("./styles.css", "./app.js", "./config.js")),
            ("/admin/", ("/admin/admin.css", "/admin/admin.js")),
        )
        for path, assets in pages:
            with self.subTest(page=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                html = response.get_data(as_text=True)
                self.assertIn("<title>", html)
                self.assertIn('name="viewport"', html)
                for asset in assets:
                    self.assertIn(asset, html)

    def test_old_ai_chat_is_replaced_with_native_workspace_and_mahi_launcher(self):
        home = self.client.get("/")
        workspace = self.client.get("/mahi-ai/")
        launcher = self.client.get("/mahi-ai-launcher.js")
        self.assertEqual(home.status_code, 200)
        self.assertIn(b"/mahi-ai-launcher.js", home.data)
        self.assertEqual(launcher.status_code, 200)
        self.assertIn(b"Open Mahi-AI", launcher.data)
        self.assertEqual(workspace.status_code, 200)
        self.assertIn(b'id="newChat"', workspace.data)
        self.assertIn(b'./app.js', workspace.data)
        self.assertNotIn(b'<iframe', workspace.data.lower())
        self.assertEqual(self.client.get("/quick-add.js").status_code, 404)
        self.assertEqual(self.client.post("/api/catalog-add/verify", json={}).status_code, 404)

    def test_current_pages_preserve_mobile_accessibility_and_reduced_motion(self):
        pages = {
            "/": (b'aria-label="Search the library"', b'aria-label="Open command palette"'),
            "/mahi-ai/": (b'name="viewport"', b'id="newChat"'),
            "/admin/": (b'name="robots" content="noindex,nofollow"', b'id="loginForm"'),
        }
        for path, fragments in pages.items():
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            for fragment in fragments:
                with self.subTest(path=path, fragment=fragment):
                    self.assertIn(fragment, response.data)
        reduced_motion = self.client.get("/mc-home.css").get_data(as_text=True)
        self.assertIn("prefers-reduced-motion:reduce", reduced_motion)

    def test_custom_404_page_is_branded_and_returns_404(self):
        response = self.client.get("/this-page-should-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn(b"Page not found", response.data)
        self.assertIn(b"/site-polish.css", response.data)
        self.assertIn(b"Return to MahiCloud", response.data)

    def test_homepage_is_still_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"MahiCloud", response.data)

    def test_existing_project_routes(self):
        routes = [
            "/mahiflix/",
            "/linkora/",
            "/apps/",
            "/unfollowers/",
            "/lumr/",
            "/instagram-cleaner.html",
        ]
        for route in routes:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)

    def test_public_pages_hide_own_source_signposts(self):
        for path in ("/", "/apps/", "/mahiflix/", "/linkora/", "/instagram-cleaner.html", "/privacy", "/terms"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                body = response.get_data(as_text=True).lower()
                self.assertNotIn("github.com/mahimahfud-ui", body)
                self.assertNotIn("source code", body)
                self.assertNotIn("ai-generated", body)
                self.assertNotIn("browser-helper folder", body)

    def test_native_mahi_ai_launcher_replaces_quick_add(self):
        response = self.client.get("/mahi-ai-launcher.js")
        self.assertEqual(response.status_code, 200)
        script = response.get_data(as_text=True)
        self.assertIn("/mahi-ai/", script)
        self.assertIn("Open Mahi-AI", script)
        self.assertEqual(self.client.get("/quick-add.js").status_code, 404)

    def test_native_mahi_ai_workspace_and_admin_routes(self):
        page = self.client.get("/mahi-ai/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'id="newChat"', page.data)
        self.assertIn(b'./app.js', page.data)
        self.assertIn(b'href="/"', page.data)
        self.assertEqual(self.client.get("/mahi-ai/app.js").status_code, 200)
        admin = self.client.get("/admin/")
        self.assertEqual(admin.status_code, 200)
        self.assertIn(b'id="loginForm"', admin.data)
        admin_script = self.client.get("/admin/admin.js").data
        for action in (b"catalog-list", b"mahiflix-list", b"mframe-profile-save", b"mframe-videos-list"):
            with self.subTest(action=action):
                self.assertIn(action, admin_script)

    def test_browser_helper_guide_and_download_are_available_without_external_source_links(self):
        import io
        import zipfile

        guide = self.client.get("/browser-helper-guide.html")
        self.assertEqual(guide.status_code, 200)
        self.assertIn(b"/download/browser-helper.zip", guide.data)
        self.assertNotIn(b"github.com/mahimahfud-ui/mahicloud", guide.data)

        bundle = self.client.get("/download/browser-helper.zip")
        self.assertEqual(bundle.status_code, 200)
        self.assertIn("application/zip", bundle.headers.get("Content-Type", ""))
        with zipfile.ZipFile(io.BytesIO(bundle.data)) as archive:
            names = set(archive.namelist())
            for name in ("manifest.json", "background.js", "content.js", "dashboard-bridge.js", "popup.html", "popup.js"):
                self.assertIn(name, names)
            self.assertNotIn("README.md", names)

    def test_friendly_aliases_redirect_to_canonical_routes(self):
        cases = {
            "/windows-tools": "/linkora/",
            "/windows-tools/": "/linkora/",
            "/gallery": "/lumr/",
            "/gallery/": "/lumr/",
            "/social-tools": "/instagram-cleaner.html",
            "/social-tools/": "/instagram-cleaner.html",
            "/social-tools/instagram-cleaner": "/instagram-cleaner.html",
        }
        for route, destination in cases.items():
            with self.subTest(route=route):
                response = self.client.get(route, follow_redirects=False)
                self.assertIn(response.status_code, (301, 302, 307, 308))
                self.assertEqual(response.headers.get("Location"), destination)

    def test_integrated_assets_are_served(self):
        assets = [
            "/mahiflix/m-logo-v2.svg",
            "/mahiflix/cinema/cinema.css",
            "/mahiflix/cinema/scene.js",
            "/mahiflix/vendor/three.module.min.js",
            "/mahiflix/assets/logos/7reel.svg",
            "/lumr/cinematic.js",
            "/linkora/downloads/private-folder-hotkey.bat",
        ]
        for path in assets:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)

    def test_security_headers_and_api_cache_control(self):
        response = self.client.get("/api/config", headers={"X-Forwarded-Proto": "https"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
        self.assertEqual(response.headers.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()")
        self.assertEqual(response.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains")
        self.assertEqual(response.headers.get("Cache-Control"), "no-store")

    def test_start_endpoint_has_a_rate_limit(self):
        from app import _rate_events, _rate_lock

        key = ("start", self.client.get("/health").request.environ.get("REMOTE_ADDR") or "unknown")
        with _rate_lock:
            _rate_events.pop(key, None)

        for _ in range(5):
            response = self.client.post("/api/start", data={})
            self.assertEqual(response.status_code, 410)
        response = self.client.post("/api/start", data={})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)

    def test_lumr_config_api_is_available_at_both_paths(self):
        for path in ("/api/config", "/lumr/api/config"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                payload = response.get_json()
                self.assertIn("supabaseUrl", payload)
                self.assertIn("publishableKey", payload)
                self.assertIn("youtubeUrl", payload)

    def test_railway_deployment_configuration(self):
        import json
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        railway = json.loads((root / "railway.json").read_text(encoding="utf-8"))
        self.assertEqual(railway["deploy"]["healthcheckPath"], "/")
        self.assertIn("app:app", railway["deploy"]["startCommand"])
        self.assertTrue((root / "Procfile").is_file())


    def test_apps_category_switch_has_spacing_and_three_states(self):
        response = self.client.get("/apps/")
        self.assertEqual(response.status_code, 200)
        source = response.get_data(as_text=True)
        self.assertIn("grid-template-columns:repeat(3,minmax(0,1fr))", source)
        self.assertIn('body[data-category="apps"] .switch:before', source)
        self.assertIn("@media(max-width:520px)", source)

    def test_hidden_metadata_helper_detects_page_logo_images(self):
        from mahi_ai import _MetadataParser

        parser = _MetadataParser()
        parser.feed(
            '<html><head><title>Example Music</title>'
            '<link rel="icon" href="/favicon.ico">'
            '<link rel="apple-touch-icon" sizes="180x180" href="/touch-icon.png">'
            '</head><body>'
            '<img class="navbar-brand" alt="Example Music logo" width="180" height="48" src="/assets/example-logo.svg">'
            '<img src="/content/unrelated-photo.jpg" alt="Album cover">'
            '</body></html>'
        )
        self.assertEqual("Example Music", " ".join(parser.title_parts))
        self.assertTrue(parser.icons)
        self.assertIn("/assets/example-logo.svg", parser.logo_images)
        self.assertNotIn("/content/unrelated-photo.jpg", parser.logo_images)
        self.assertEqual("/touch-icon.png", parser.icons[0])


    def test_github_token_errors_distinguish_bad_credentials_permissions_and_rate_limit(self):
        import os
        from unittest.mock import Mock, patch
        from mahi_ai import MahiAIError, _github

        cases = [
            (401, "Bad credentials", "HTTP 401 (Bad credentials)"),
            (403, "Resource not accessible by personal access token", "Contents permission to Read and write"),
            (403, "API rate limit exceeded for 127.0.0.1", "API rate limit was exceeded"),
        ]
        for status_code, github_message, expected_message in cases:
            with self.subTest(status_code=status_code, github_message=github_message):
                response = Mock()
                response.status_code = status_code
                response.content = b'{"message":"test"}'
                response.json.return_value = {"message": github_message}
                with patch.dict(os.environ, {"MAHI_AI_GITHUB_TOKEN": "test-token"}):
                    with patch("mahi_ai.requests.request", return_value=response):
                        with self.assertRaises(MahiAIError) as captured:
                            _github("GET", "/user")
                self.assertIn(expected_message, captured.exception.message)
                self.assertNotIn("test-token", captured.exception.message)

    def test_publish_403_message_includes_exact_endpoint(self):
        import os
        from unittest.mock import Mock, patch
        from mahi_ai import MahiAIError, _github

        response = Mock()
        response.status_code = 403
        response.content = b'{"message":"Resource not accessible by personal access token"}'
        response.json.return_value = {"message": "Resource not accessible by personal access token"}
        response.headers = {"X-Accepted-GitHub-Permissions": "contents=write"}
        with patch.dict(os.environ, {"MAHI_AI_GITHUB_TOKEN": "secret-not-for-response"}):
            with patch("mahi_ai.requests.request", return_value=response):
                with self.assertRaises(MahiAIError) as captured:
                    _github("POST", "/repos/mahimahfud-ui/mahicloud/git/blobs", payload={"content": "probe"})
        self.assertIn("POST /repos/mahimahfud-ui/mahicloud/git/blobs", captured.exception.message)
        self.assertIn("contents=write", captured.exception.message)
        self.assertNotIn("secret-not-for-response", captured.exception.message)

if __name__ == "__main__":
    unittest.main()
