import unittest
from app import app

class MahiDriveBackendTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_drive_assets_are_served_without_caching_login_state(self):
        page = self.client.get("/mahidrive/")
        css = self.client.get("/mahidrive/styles.css")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(css.status_code, 200)
        self.assertIn("no-cache", page.headers.get("Cache-Control", ""))
        self.assertEqual("no-store", self.client.get("/api/mahidrive/config").headers.get("Cache-Control"))

    def test_health_is_a_small_json_response(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True, "service": "MahiDrive"})

    def test_old_api_endpoints_are_not_exposed(self):
        for path in ("/api/config", "/api/start", "/api/catalog-add/verify", "/lumr/api/config"):
            with self.subTest(path=path):
                response = self.client.post(path, json={}) if path != "/api/config" and path != "/lumr/api/config" else self.client.get(path)
                self.assertEqual(response.status_code, 404)

if __name__ == "__main__":
    unittest.main()
