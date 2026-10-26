import unittest

from app import app


class FullscreenViewerTests(unittest.TestCase):
    """Ensure the embedded project viewer follows the visible device viewport."""

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def get_text(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, path)
        body = response.get_data(as_text=True)
        response.close()
        return body

    def test_homepage_keeps_viewport_fitting_and_fullscreen_frame_support(self):
        html = self.get_text("/")
        self.assertIn('name="viewport"', html)
        self.assertIn("viewport-fit=cover", html)
        self.assertIn('id="sheetFrame"', html)
        self.assertIn("fullscreen", html)
        self.assertIn('/mc-home.css', html)
        self.assertIn('/mc-home.js', html)

    def test_viewer_uses_dynamic_viewport_and_safe_area(self):
        css = self.get_text("/mc-home.css")
        for snippet in (
            "#sheet {",
            "--mc-viewport-height",
            "max-height: var(--mc-viewport-height, 100vh)",
            "safe-area-inset-bottom",
            "@supports (height: 100dvh)",
            "#sheet iframe",
            "flex: 1 1 auto",
            "min-height: 0",
            "@media (max-width: 700px)",
        ):
            with self.subTest(snippet=snippet):
                self.assertIn(snippet, css)

    def test_viewport_is_resynced_on_resize_rotation_and_mobile_viewport_changes(self):
        script = self.get_text("/mc-home.js")
        for snippet in (
            "window.visualViewport",
            "window.addEventListener('resize',scheduleViewportSync",
            "window.addEventListener('orientationchange',scheduleViewportSync",
            "window.visualViewport.addEventListener('resize',scheduleViewportSync",
            "window.visualViewport.addEventListener('scroll',scheduleViewportSync",
            "scheduleViewportSync();$('#sheetClose').focus()",
        ):
            with self.subTest(snippet=snippet):
                self.assertIn(snippet, script)


if __name__ == "__main__":
    unittest.main()
