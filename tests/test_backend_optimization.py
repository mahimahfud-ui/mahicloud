import os
import unittest
from unittest.mock import patch

from app import app, handle_unexpected_error


class BackendOptimizationTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_static_assets_are_cached_for_a_short_period(self):
        response = self.client.get("/mc-home.css")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Cache-Control"),
            "public, max-age=3600, stale-while-revalidate=86400",
        )

    def test_html_is_revalidated_after_deployments(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Cache-Control"),
            "no-cache, max-age=0, must-revalidate",
        )

    def test_service_worker_script_is_not_cached_stale(self):
        response = self.client.get("/sw.js")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "no-cache")
        self.assertIn(b"mc-shell-v3", response.data)

    def test_lumr_api_alias_is_never_cached(self):
        response = self.client.get("/lumr/api/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "no-store")

    def test_removed_quick_add_endpoints_are_not_registered(self):
        self.assertEqual(self.client.get("/quick-add.js").status_code, 404)
        response = self.client.post("/api/catalog-add/verify", json={"password": "699360"})
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"MAHI_CATALOG_PASSWORD", response.data)

    def test_unhandled_api_errors_return_safe_json(self):
        with app.test_request_context("/api/_optimization-test"):
            try:
                raise RuntimeError("internal-only detail")
            except RuntimeError as error:
                response, status = handle_unexpected_error(error)
        self.assertEqual(status, 500)
        self.assertEqual(
            response.get_json(),
            {"error": "Internal server error. Please try again."},
        )


if __name__ == "__main__":
    unittest.main()
