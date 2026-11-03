# MahiDrive dedicated Supabase setup

MahiDrive uses its own Supabase project. Never use the shared MahiCloud/Mahi-AI Supabase project for these steps.

## Required MahiCloud hosting variables

Set only in the MahiCloud hosting service's server-side environment:

- `MAHIDRIVE_SUPABASE_URL` — dedicated project URL.
- `MAHIDRIVE_SUPABASE_PUBLISHABLE_KEY` — dedicated project's publishable key. This browser-safe key is returned by the MahiDrive config route; it is not a service credential.
- `MAHIDRIVE_OWNER_USER_ID` — UUID of the one pre-provisioned owner Auth identity. Never place it in browser configuration.
- `MAHIDRIVE_MAX_FILE_BYTES` — maximum file size in bytes, not exceeding the SQL and bucket limit (default `52428800`, or 50 MiB).

The MahiCloud web process does not need a Supabase service-role/secret key. Use `MAHIDRIVE_SUPABASE_SERVICE_ROLE_KEY` only in a short-lived local operator shell for the one-time scripts. Never add it to the MahiCloud web-service environment, browser code, or repository.

## Dedicated project and owner provisioning

1. Create a new Supabase project in the organization explicitly selected by the owner. Do not reuse or modify the shared MahiCloud/Mahi-AI project.
2. Keep project membership restricted to the infrastructure operator. Choose an available region based on owner latency and project availability.
3. In Authentication settings, disable public sign-ups and anonymous sign-ins. Do not configure invites, social sign-up, account linking, or public account creation for MahiDrive.
4. Create exactly one permanent owner account through the Supabase Dashboard or another approved administrative process. Verify the email and enroll a TOTP authenticator factor before enabling MahiDrive access. MahiDrive requires a fresh `aal2` session for all file-manager database and Storage operations; the login screen challenges for TOTP before opening the library.
5. Configure the dedicated project's access-token lifetime to a short duration appropriate for a private file manager. Record the real owner Auth UUID; do not invent one.
6. Set `MAHIDRIVE_OWNER_USER_ID` in the MahiCloud server environment and in the dedicated project's Edge Function secrets.
7. Review the isolated migration at `supabase/mahidrive/supabase/migrations/20261103160000_mahidrive_core.sql` alongside its readable source `supabase/mahidrive/schema.sql`. The two files must remain identical. Link the dedicated CLI workspace using `supabase --workdir supabase/mahidrive link --project-ref <dedicated-project-ref>`; confirm the link points to the new MahiDrive project, then apply only its migration using `supabase --workdir supabase/mahidrive db push --linked`. Do not run root-level Supabase CLI commands for this project.
8. In Project Settings → API → Exposed schemas, expose `mahidrive` only. Do not expose `mahidrive_private`. Confirm the authenticated role has only the explicit table/column privileges in the migration.
9. Run `python scripts/provision_mahidrive_owner.py` from an operator shell with the dedicated project's URL, owner UUID, and service-role key. It verifies the existing user's ID, permanent status, and confirmed email; checks that no different Auth identity already has the MahiDrive owner claim; sets `app_metadata.mahidrive_owner=true`; and seeds the single immutable UUID in private owner configuration. It never creates an Auth user or replaces a different configured owner.
10. Run `python scripts/ensure_mahidrive_bucket.py` with the dedicated project's URL and service-role key in the operator shell. It creates `mahi-drive-private` with `public=false`; if that bucket already exists and is public, the script refuses to reuse it.
11. Deploy the upload-verification function from the isolated CLI workspace with `supabase --workdir supabase/mahidrive functions deploy mahidrive-verify-upload --project-ref <dedicated-project-ref>`. The project config at `supabase/mahidrive/supabase/config.toml` sets `verify_jwt = true`. Configure Edge Function secrets `MAHIDRIVE_OWNER_USER_ID`, `MAHIDRIVE_ALLOWED_ORIGINS` (the exact MahiCloud origin, including scheme), and `MAHIDRIVE_MAX_FILE_BYTES`. The platform-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must belong to the dedicated project.
12. Set the four MahiDrive hosting variables above in MahiCloud. Do not set any MahiDrive variable to a value from the shared project.
13. Inspect the private bucket and RLS policies and run the owner, anonymous-user, and other-user tests with real sessions before uploading real files.

## Storage and privacy notes

- The bucket is private. Uploads use the owner's Supabase session and the TUS resumable protocol directly to Storage.
- PostgreSQL generates an immutable `storage_key` from the random file UUID: `library/<file-uuid>/original`. Neither the owner UUID nor the original filename is embedded in object paths.
- Storage RLS checks the dedicated bucket, Storage `owner_id`, permanent Auth identity, server-managed owner claim, private owner registry, exact generated object key, and corresponding file lifecycle state.
- Storage reads require an `aal2` owner session and a ready, non-deleted file row. Upload creation requires an uploading file row. The browser cannot set `upload_status`; a JWT-verified Edge Function checks the completed object, size, MIME metadata, and supported file signatures before marking it ready.
- Delete and restore lifecycle changes are server-authorized. Delete is a metadata soft-delete that immediately blocks Storage reads. Restore verifies that the original private object still exists and matches the stored size/MIME information before restoring read access. Phase 3 does not physically purge objects.
- Direct object UPDATE and DELETE policies are not created. Permanent purge is a later, separately authorized lifecycle feature.
- Private Space is not implemented in Phase 3. No vault object prefix or vault policy is created here.
- Supabase JS and TUS CDN modules in the MahiDrive page are pinned to exact versions; do not replace them with floating `@latest` URLs.

## Operational blocker before real use

The connected Supabase account currently exposes the shared MahiCloud project and one organization, but no dedicated MahiDrive project or owner identity is provisioned. MahiDrive deliberately returns a configuration-required response until the dedicated project URL, publishable key, and verified owner UUID are set. Do not point it at the shared project.
