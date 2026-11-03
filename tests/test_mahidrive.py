import json
import os
import unittest
from unittest.mock import patch
from pathlib import Path

from app import app
from mahidrive_service import _rate_events, _token_claims


OWNER_ID = "9c1d1a87-4496-4f53-87e8-fc85e60d8177"
OTHER_ID = "e8a80b9f-8baf-4f5d-9c75-7a3f1392b9f2"
CONFIG = {
    "MAHIDRIVE_SUPABASE_URL": "https://mahidrive-test.supabase.co",
    "MAHIDRIVE_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test_only",
    "MAHIDRIVE_OWNER_USER_ID": OWNER_ID,
    "MAHIDRIVE_MAX_FILE_BYTES": "52428800",
}


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.content = b"{}"

    def json(self):
        return self._payload


def owner_user(**overrides):
    payload = {
        "id": OWNER_ID,
        "is_anonymous": False,
        "email": "owner@example.test",
        "email_confirmed_at": "2026-10-01T00:00:00Z",
        "app_metadata": {"mahidrive_owner": True},
    }
    payload.update(overrides)
    return payload


class MahiDriveAuthTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, CONFIG, clear=True)
        self.env.start()
        _rate_events.clear()
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def tearDown(self):
        _rate_events.clear()
        self.env.stop()

    def _same_origin_headers(self):
        return {
            "Origin": "https://example.test",
            "X-MahiDrive-Intent": "1",
            "Content-Type": "application/json",
        }

    def test_public_config_returns_only_publishable_connection_details(self):
        response = self.client.get("/api/mahidrive/config")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ready"])
        self.assertEqual(payload["supabaseUrl"], CONFIG["MAHIDRIVE_SUPABASE_URL"])
        self.assertEqual(payload["publishableKey"], CONFIG["MAHIDRIVE_SUPABASE_PUBLISHABLE_KEY"])
        self.assertEqual(payload["bucket"], "mahi-drive-private")
        self.assertNotIn(OWNER_ID, response.get_data(as_text=True))
        self.assertNotIn("service_role", response.get_data(as_text=True))
        self.assertNotIn("secret", response.get_data(as_text=True))

    def test_missing_dedicated_project_fails_closed_without_shared_project_fallback(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "https://shared.supabase.co", "SUPABASE_ANON_KEY": "shared-key"}, clear=True):
            response = self.client.get("/api/mahidrive/config")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"ready": False})

    def test_invalid_upload_limit_environment_does_not_break_public_config(self):
        with patch.dict(os.environ, {"MAHIDRIVE_MAX_FILE_BYTES": "not-a-number"}):
            response = self.client.get("/api/mahidrive/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["maxFileBytes"], 52428800)

    def test_session_endpoint_requires_a_bearer_token(self):
        response = self.client.get("/api/mahidrive/session")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["authenticated"], False)

    @patch("mahidrive_service._token_claims", return_value={"sub": OWNER_ID, "role": "authenticated", "aal": "aal2"})
    @patch("mahidrive_service.requests.get")
    def test_only_verified_configured_owner_with_server_managed_claim_is_accepted(self, get, claims):
        get.return_value = FakeResponse(200, owner_user())
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer owner-access-token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"authenticated": True})
        get.assert_called_once()
        self.assertEqual(
            get.call_args.kwargs["headers"]["Authorization"],
            "Bearer owner-access-token",
        )

    @patch("mahidrive_service._token_claims", return_value={"sub": OWNER_ID, "role": "authenticated", "aal": "aal1"})
    @patch("mahidrive_service.requests.get")
    def test_owner_first_factor_session_requires_totp_step_up(self, get, claims):
        get.return_value = FakeResponse(200, owner_user())
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer owner-aal1-token"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["mfa_required"], True)

    @patch("mahidrive_service.requests.get")
    def test_wrong_owner_is_forbidden(self, get):
        get.return_value = FakeResponse(200, owner_user(id=OTHER_ID))
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer other-access-token"},
        )
        self.assertEqual(response.status_code, 403)

    @patch("mahidrive_service.requests.get")
    def test_anonymous_auth_user_is_forbidden_even_with_authenticated_role(self, get):
        get.return_value = FakeResponse(200, owner_user(is_anonymous=True))
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer anonymous-access-token"},
        )
        self.assertEqual(response.status_code, 403)

    @patch("mahidrive_service.requests.get")
    def test_unverified_owner_is_forbidden(self, get):
        get.return_value = FakeResponse(200, owner_user(email_confirmed_at=None, confirmed_at=None))
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer unverified-access-token"},
        )
        self.assertEqual(response.status_code, 403)

    @patch("mahidrive_service.requests.get")
    def test_user_metadata_cannot_grant_owner_access(self, get):
        get.return_value = FakeResponse(200, owner_user(
            app_metadata={},
            user_metadata={"mahidrive_owner": True},
        ))
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer forged-metadata-token"},
        )
        self.assertEqual(response.status_code, 403)

    @patch("mahidrive_service.requests.get")
    def test_expired_or_invalid_auth_token_is_unauthorized(self, get):
        get.return_value = FakeResponse(401, {"message": "invalid token"})
        response = self.client.get(
            "/api/mahidrive/session",
            headers={"Authorization": "Bearer expired-token"},
        )
        self.assertEqual(response.status_code, 401)

    def test_login_requires_same_origin_and_custom_intent_header(self):
        response = self.client.post("/api/mahidrive/login", json={
            "email": "owner@example.test",
            "password": "not-a-real-password",
        })
        self.assertEqual(response.status_code, 403)

    @patch("mahidrive_service.requests.get")
    @patch("mahidrive_service.requests.post")
    def test_login_returns_a_supabase_session_only_for_the_verified_owner(self, post, get):
        post.return_value = FakeResponse(200, {
            "access_token": "owner-access-token",
            "refresh_token": "owner-refresh-token",
            "expires_in": 3600,
            "token_type": "bearer",
        })
        get.return_value = FakeResponse(200, owner_user())
        response = self.client.post(
            "/api/mahidrive/login",
            headers=self._same_origin_headers(),
            json={"email": "owner@example.test", "password": "private-test-password"},
            base_url="https://example.test",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["access_token"], "owner-access-token")
        self.assertEqual(payload["refresh_token"], "owner-refresh-token")
        self.assertNotIn(OWNER_ID, response.get_data(as_text=True))
        self.assertNotIn("service_role", response.get_data(as_text=True))
        self.assertNotIn("private-test-password", response.get_data(as_text=True))
        self.assertEqual(post.call_count, 1)
        self.assertEqual(get.call_count, 1)

    @patch("mahidrive_service.requests.get")
    @patch("mahidrive_service.requests.post")
    def test_login_rejects_other_accounts_and_revokes_their_new_session(self, post, get):
        post.side_effect = [
            FakeResponse(200, {
                "access_token": "other-access-token",
                "refresh_token": "other-refresh-token",
                "expires_in": 3600,
                "token_type": "bearer",
            }),
            FakeResponse(204, {}),
        ]
        get.return_value = FakeResponse(200, owner_user(id=OTHER_ID))
        response = self.client.post(
            "/api/mahidrive/login",
            headers=self._same_origin_headers(),
            json={"email": "other@example.test", "password": "private-test-password"},
            base_url="https://example.test",
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("other-access-token", response.get_data(as_text=True))
        self.assertEqual(post.call_count, 2)
        self.assertTrue(post.call_args_list[1].args[0].endswith("/auth/v1/logout"))

    @patch("mahidrive_service.requests.post")
    def test_invalid_password_uses_generic_non_enumerating_error(self, post):
        post.return_value = FakeResponse(400, {"message": "specific account or password detail"})
        response = self.client.post(
            "/api/mahidrive/login",
            headers=self._same_origin_headers(),
            json={"email": "owner@example.test", "password": "wrong"},
            base_url="https://example.test",
        )
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("specific account", response.get_data(as_text=True))

    @patch("mahidrive_service.requests.post")
    def test_login_rate_limit_blocks_the_sixth_attempt(self, post):
        post.return_value = FakeResponse(400, {"message": "invalid"})
        for _ in range(5):
            response = self.client.post(
                "/api/mahidrive/login",
                headers=self._same_origin_headers(),
                json={"email": "owner@example.test", "password": "wrong"},
                base_url="https://example.test",
            )
            self.assertEqual(response.status_code, 401)
        blocked = self.client.post(
            "/api/mahidrive/login",
            headers=self._same_origin_headers(),
            json={"email": "owner@example.test", "password": "wrong"},
            base_url="https://example.test",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertTrue(blocked.headers.get("Retry-After"))
        self.assertEqual(post.call_count, 5)

    def test_public_signup_and_user_creation_routes_do_not_exist(self):
        response = self.client.post("/api/mahidrive/signup", json={"email": "anyone@example.test"})
        self.assertEqual(response.status_code, 404)
        response = self.client.post("/api/mahidrive/register", json={"email": "anyone@example.test"})
        self.assertEqual(response.status_code, 404)

    def test_login_page_is_served_without_maicloud_ai_launcher_injection(self):
        page = self.client.get("/mahidrive/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'id="loginForm"', page.data)
        self.assertIn(b"/mahidrive/app.js", page.data)
        self.assertNotIn(b"mahi-ai-launcher.js", page.data)
        self.assertIn("no-store", self.client.get("/api/mahidrive/config").headers.get("Cache-Control", ""))

    def test_mahidrive_security_headers_apply_only_to_its_routes(self):
        response = self.client.get("/mahidrive/")
        policy = response.headers.get("Content-Security-Policy", "")
        self.assertIn("object-src 'none'", policy)
        self.assertIn("frame-ancestors 'self'", policy)
        self.assertIn("cdn.jsdelivr.net", policy)
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")


class MahiDriveStaticSecurityContractTests(unittest.TestCase):
    ROOT = Path(__file__).resolve().parents[1]

    def read(self, relative):
        return (self.ROOT / relative).read_text(encoding="utf-8")

    def test_schema_enables_rls_and_requires_owner_claim_on_every_client_table(self):
        sql = self.read("supabase/mahidrive/schema.sql")
        for table in ("folders", "files", "file_versions"):
            self.assertIn(f"alter table mahidrive.{table} enable row level security", sql)
            self.assertIn(f"mahidrive_{table}_owner_select", sql)
            self.assertIn(f"mahidrive_{table}_owner_insert", sql)
        self.assertIn("auth.uid()", sql)
        self.assertIn("default auth.uid()", sql)
        self.assertIn("grant insert (folder_id, name, mime_type, size_bytes)", sql)
        self.assertIn("grant update (name, folder_id, updated_at)", sql)
        self.assertNotIn("grant update (name, folder_id, deleted_at", sql)
        self.assertIn("set_file_lifecycle_status", sql)
        self.assertIn("mahidrive_private.owner_config", sql)
        self.assertIn("mahidrive_private.is_owner()", sql)
        self.assertIn("aal2", sql)
        self.assertIn("[[:cntrl:]]", sql)
        self.assertIn("name = btrim(name)", sql)
        self.assertIn("mahidrive.provision_owner", sql)
        self.assertIn("grant execute on function mahidrive.provision_owner(uuid) to service_role", sql)
        self.assertIn("grant select, insert, update, delete on mahidrive.folders, mahidrive.files, mahidrive.file_versions to service_role", sql)
        self.assertIn("revoke all on table mahidrive_private.owner_config from public, anon, authenticated", sql)
        self.assertIn("is_anonymous", sql)
        self.assertIn("mahidrive_owner", sql)
        self.assertNotIn("grant all on all tables", sql.lower())

    def test_storage_select_policy_hides_soft_deleted_and_unverified_files(self):
        sql = self.read("supabase/mahidrive/schema.sql")
        self.assertIn("f.upload_status = 'ready'", sql)
        self.assertIn("f.deleted_at is null", sql)
        self.assertIn("storage_key text generated always as", sql)
        self.assertIn("name = f.storage_key", sql)
        self.assertIn("f.upload_status = 'uploading'", sql)
        self.assertIn("create policy mahidrive_storage_owner_select", sql)
        self.assertIn("create policy mahidrive_storage_owner_insert", sql)
        self.assertNotIn("create policy mahidrive_storage_owner_delete", sql)

    def test_frontend_has_no_signup_guest_auth_public_urls_or_owner_uuid(self):
        source = self.read("web/mahidrive/app.js")
        self.assertNotIn("signUp(", source)
        self.assertNotIn("signInAnonymously(", source)
        self.assertNotIn("getPublicUrl(", source)
        self.assertNotIn(OWNER_ID, source)
        self.assertNotIn("owner_user_id:", source)
        self.assertIn("storage: window.sessionStorage", source)
        self.assertIn("storage_key", source)
        self.assertIn('functions.invoke("mahidrive-verify-upload"', source)
        self.assertIn("retryUploadVerification(file)", source)
        self.assertIn('verifyUpload(file.id, "delete")', source)
        self.assertIn('verifyUpload(file.id, "restore")', source)
        self.assertIn('action === "delete" ? data?.deleted === true', source)
        self.assertIn('action === "restore" ? data?.restored === true', source)
        self.assertNotIn('upload_status: "uploading"', source)
        self.assertNotIn("deleted_at:", source)
        self.assertIn("auth.mfa.challenge", source)
        self.assertIn("auth.mfa.verify", source)
        self.assertIn("currentLevel !== \"aal2\"", source)

    def test_upload_uses_private_tus_endpoint_and_non_overwrite_semantics(self):
        source = self.read("web/mahidrive/app.js")
        self.assertIn("/storage/v1/upload/resumable", source)
        self.assertIn('"x-upsert": "false"', source)
        self.assertIn("retryDelays", source)
        self.assertIn("onProgress", source)
        self.assertIn("upload.abort()", source)
        self.assertIn("verifyUpload(record.id)", source)

    def test_private_preview_excludes_svg_and_uses_blob_downloads(self):
        source = self.read("web/mahidrive/app.js")
        self.assertIn('type !== "image/svg+xml"', source)
        self.assertIn(".storage.from(BUCKET).download(", source)
        self.assertIn("URL.revokeObjectURL", source)

    def test_verification_function_checks_owner_file_size_and_file_signature(self):
        provision = self.read("scripts/provision_mahidrive_owner.py")
        self.assertIn("/rest/v1/rpc/provision_owner", provision)
        source = self.read("supabase/mahidrive/supabase/functions/mahidrive-verify-upload/index.ts")
        for fragment in (
            "/auth/v1/user",
            "MAHIDRIVE_OWNER_USER_ID",
            "mahidrive_owner",
            "is_anonymous",
            "aal2",
            "size_bytes",
            "upload_status",
            "sniffMime",
            "Accept-Profile",
            "Content-Profile",
            "patchFileLifecycle",
            "findStoredObject",
            "cancel",
            "restore",
            "delete",
            "uploading",
            "ready",
        ):
            self.assertIn(fragment, source)

    def test_isolated_supabase_workspace_migration_matches_reviewed_schema(self):
        config = self.read("supabase/mahidrive/supabase/config.toml")
        schema = self.read("supabase/mahidrive/schema.sql")
        migration = self.read("supabase/mahidrive/supabase/migrations/20261103160000_mahidrive_core.sql")
        self.assertIn('project_id = "mahidrive"', config)
        self.assertIn("verify_jwt = true", config)
        self.assertEqual(schema, migration)

    def test_delete_and_restore_are_server_authorized_lifecycle_actions(self):
        source = self.read("web/mahidrive/app.js")
        edge = self.read("supabase/mahidrive/supabase/functions/mahidrive-verify-upload/index.ts")
        sql = self.read("supabase/mahidrive/schema.sql")
        self.assertIn('verifyUpload(file.id, "delete")', source)
        self.assertIn('verifyUpload(file.id, "restore")', source)
        self.assertIn("action === \"delete\"", edge)
        self.assertIn("action === \"restore\"", edge)
        self.assertIn("findStoredObject", edge)
        self.assertNotIn("grant update (name, folder_id, deleted_at", sql)

    def test_login_page_is_mobile_and_search_engine_safe(self):
        source = self.read("web/mahidrive/index.html")
        self.assertIn('name="viewport"', source)
        self.assertIn('content="noindex,nofollow,noarchive"', source)
        self.assertIn('id="fileSearch"', source)
        self.assertIn('id="mobileMenuButton"', source)


if __name__ == "__main__":
    unittest.main()
