import unittest

from app import app


class MahiDriveOnlyRouteTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_root_opens_the_private_cloud_workspace(self):
        response = self.client.get("/", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers.get("Location"), "/mahidrive/")

    def test_mahidrive_login_and_assets_are_served(self):
        page = self.client.get("/mahidrive/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'id="loginForm"', page.data)
        self.assertIn(b"MahiDrive", page.data)
        self.assertNotIn(b"MahiCloud", page.data)
        self.assertEqual(self.client.get("/mahidrive/styles.css").status_code, 200)
        self.assertEqual(self.client.get("/mahidrive/app.js").status_code, 200)

    def test_legacy_maicloud_products_and_admin_pages_are_not_exposed(self):
        paths = (
            "/mahiflix/",
            "/linkora/",
            "/apps/",
            "/unfollowers/",
            "/lumr/",
            "/instagram-cleaner.html",
            "/mahi-ai/",
            "/admin/",
            "/browser-helper-guide.html",
            "/download/browser-helper.zip",
        )
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_legacy_service_apis_are_not_registered(self):
        paths = ("/api/config", "/api/start", "/api/status/test", "/api/catalog-add/verify")
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(path) if path.endswith("config") else self.client.post(path, json={})
                self.assertEqual(response.status_code, 404)

    def test_health_endpoint_identifies_mahidrive(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True, "service": "MahiDrive"})

    def test_security_headers_are_present(self):
        response = self.client.get("/mahidrive/", headers={"X-Forwarded-Proto": "https"})
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
        self.assertEqual(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
        self.assertEqual(response.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains")
        policy = response.headers.get("Content-Security-Policy", "")
        self.assertIn("object-src 'none'", policy)
        self.assertIn("frame-ancestors 'self'", policy)
        self.assertIn("cdn.jsdelivr.net", policy)


if __name__ == "__main__":
    unittest.main()
