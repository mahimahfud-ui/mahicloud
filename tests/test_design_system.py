import unittest

from app import app


class CurrentMahiCloudDesignTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def get_text(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, path)
        return response.get_data(as_text=True)

    def test_homepage_keeps_current_brand_and_search_structure(self):
        html = self.get_text("/")
        for fragment in (
            "MahiCloud", "One cloud for everything useful.", 'id="q"',
            'id="files"', 'id="activity"', 'aria-label="Search the library"',
            "/mc-home.css", "/mc-home.js", "/mahi-ai-launcher.js",
        ):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, html)

    def test_homepage_search_and_activity_remain_local_first(self):
        script = self.get_text("/mc-home.js")
        self.assertIn("function debounce(fn,wait)", script)
        self.assertIn("debounce(render,300)", script)
        self.assertIn("debounce(drawSug,300)", script)
        self.assertIn("debounce(cdraw,300)", script)
        self.assertIn("function log(id)", script)
        self.assertIn("sv('mc:log',L.slice(-300))", script)
        self.assertNotIn("/api/activity", script)

    def test_native_mahi_ai_is_same_origin_and_not_iframed(self):
        html = self.get_text("/mahi-ai/")
        self.assertIn('id="newChat"', html)
        self.assertIn('./app.js', html)
        self.assertIn('href="/"', html)
        self.assertNotIn("<iframe", html.lower())
        for path in (
            "/mahi-ai/app.js", "/mahi-ai/styles.css", "/mahi-ai/config.js",
            "/mahi-ai/admin-control.js", "/mahi-ai/code-blocks.js",
            "/mahi-ai/motion.js", "/mahi-ai/motion-b.js",
        ):
            self.assertEqual(self.client.get(path).status_code, 200, path)

    def test_quick_add_is_removed_and_premium_ai_launcher_is_present(self):
        self.assertEqual(self.client.get("/quick-add.js").status_code, 404)
        self.assertEqual(self.client.post("/api/catalog-add", json={}).status_code, 405)
        launcher = self.get_text("/mahi-ai-launcher.js")
        self.assertIn("Open Mahi-AI", launcher)
        self.assertIn('location.href = "/mahi-ai/"', launcher)
        stylesheet = self.get_text("/mc-home.css")
        self.assertNotIn("#mahi-catalog-plus", stylesheet)
        self.assertNotIn(".mc-add-panel", stylesheet)

    def test_admin_shell_does_not_embed_or_hardcode_the_passcode(self):
        html = self.get_text("/admin/")
        script = self.get_text("/admin/admin.js")
        self.assertIn('id="loginForm"', html)
        self.assertIn('name="robots" content="noindex,nofollow"', html)
        self.assertIn("ADMIN_PIN", html)
        self.assertNotIn("699360", html)
        self.assertIn('request("catalog-list")', script)
        self.assertIn('request("mahiflix-list")', script)
        self.assertIn('request("mframe-profile-save"', script)
        self.assertIn('request("mframe-videos-list")', script)
        self.assertNotIn("OPENAI_API_KEY", script)

    def test_admin_edge_function_uses_secret_and_revocable_session_rows(self):
        from pathlib import Path
        source_path = Path(app.root_path) / "supabase" / "functions" / "mahicloud-admin" / "index.ts"
        source = source_path.read_text(encoding="utf-8")
        self.assertIn('secret("ADMIN_PIN")', source)
        self.assertIn('secret("ADMIN_SESSION_SECRET")', source)
        self.assertIn("verifySession(req, db)", source)
        self.assertIn("mahicloud_admin_sessions", source)
        self.assertIn('action === "catalog-save"', source)
        self.assertIn('action === "mahiflix-save"', source)
        self.assertIn('action === "mframe-profile-save"', source)
        self.assertNotIn("699360", source)

    def test_assets_and_styles_respect_reduced_motion(self):
        css = self.get_text("/mc-home.css")
        self.assertIn("prefers-reduced-motion:reduce", css)
        ai_css = self.get_text("/mahi-ai/styles.css")
        self.assertIn("prefers-reduced-motion", ai_css)
        admin_css = self.get_text("/admin/admin.css")
        self.assertIn("@media(max-width:650px)", admin_css)

    def test_supabase_catalog_is_service_only_and_has_order_index(self):
        from pathlib import Path
        path = Path(app.root_path) / "supabase" / "migrations" / "20261028170000_mahicloud_master_admin_catalog.sql"
        source = path.read_text(encoding="utf-8")
        self.assertIn("enable row level security", source.lower())
        self.assertIn("revoke all on public.mahicloud_catalog_items from anon, authenticated", source)
        self.assertIn("mahicloud_catalog_published_order_idx", source)


if __name__ == "__main__":
    unittest.main()
