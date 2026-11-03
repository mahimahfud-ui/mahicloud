import unittest
from pathlib import Path
from app import app

class MahiDriveResponsiveLayoutTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        self.root = Path(app.root_path)

    def test_login_page_has_mobile_viewport_and_navigation(self):
        response = self.client.get("/mahidrive/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn('name="viewport"', html)
        self.assertIn("viewport-fit=cover", html)
        self.assertIn('id="mobileMenuButton"', html)
        self.assertIn('id="mobileScrim"', html)

    def test_file_manager_styles_support_small_screens_and_reduced_motion(self):
        css = (self.root / "web/mahidrive/styles.css").read_text(encoding="utf-8")
        for fragment in ("100svh", "@media(max-width:800px)", "@media(max-width:560px)", "prefers-reduced-motion:reduce", ".mobile-scrim"):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, css)

if __name__ == "__main__":
    unittest.main()
