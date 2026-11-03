import unittest
from pathlib import Path
from app import app

class MahiDriveDesignTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        self.root = Path(app.root_path)

    def test_login_shell_preserves_private_cloud_brand_and_core_layout(self):
        response = self.client.get("/mahidrive/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        for fragment in ("MahiDrive", 'id="loginForm"', 'id="appShell"', 'id="sidebar"', 'id="fileSearch"', 'id="uploadButton"'):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, html)

    def test_existing_dark_visual_system_and_responsive_layout_remain(self):
        css = (self.root / "web/mahidrive/styles.css").read_text(encoding="utf-8")
        for fragment in ("--bg:#0b0d12", "--red:#e50914", ".topbar", ".sidebar", ".folder-grid", ".file-table-wrap", "@media(max-width:800px)", "prefers-reduced-motion:reduce"):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, css)

    def test_drive_frontend_uses_owner_only_auth_and_private_storage(self):
        js = (self.root / "web/mahidrive/app.js").read_text(encoding="utf-8")
        for fragment in ("auth.mfa.challenge", "auth.mfa.verify", "currentLevel !== \"aal2\"", ".storage.from(BUCKET).download(", "retryDelays", "upload.abort()"):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, js)
        self.assertNotIn("signUp(", js)
        self.assertNotIn("signInAnonymously(", js)

    def test_non_drive_static_assets_are_not_served(self):
        for path in ("/mc-home.css", "/mahi-ai/app.js", "/admin/admin.js", "/mahiflix/cinema/scene.js"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

if __name__ == "__main__":
    unittest.main()
