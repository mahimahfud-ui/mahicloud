# MahiDrive Architecture & Security Boundaries

**Phase:** 2 — Architecture and Security Boundaries  
**Status:** Architecture decision record; design only. No database objects, Auth settings, Storage buckets, Edge Functions, or production services were changed.  
**Repository:** `mahimahfud-ui/mahicloud`  
**Branch:** `feature/mahidrive-architecture-security`  
**Baseline:** `bfa62b8cb4e16031c7b31aafba379684edf98a83`  
**Date:** 2026-11-03

## 1. Non-negotiable product invariants

MahiDrive is a private, single-owner application. It is not a multi-tenant SaaS product.

1. Exactly one immutable Supabase Auth user UUID is authorized to use MahiDrive.
2. The application has no public registration, invite, collaboration, guest, or user-to-user sharing features.
3. Anonymous Supabase sessions and every other signed-in identity are denied by MahiDrive.
4. Every MahiDrive database row and every private storage object is owner-scoped and inaccessible to any other identity.
5. MahiDrive owns its own database namespace and private Storage bucket. It must not reuse MahiCloud, Mahi-AI, MahiFlix, MahiFrame, or StreamCloud tables or buckets for files.
6. Google Drive connections are separate destinations, not pooled quota or a mechanism for bypassing provider limits.
7. OAuth tokens, Supabase service-role/secret keys, encryption keys, and persistent private file URLs never enter browser code, repository files, client logs, or user-visible metadata.
8. Private Space is excluded from ordinary browsing, search, external AI processing, face analysis, and location indexing unless the owner explicitly changes its policy.
9. Deletion is reversible first; permanent deletion requires a fresh owner authorization and a confirmed provider operation.
10. A successful upload is not dependent on AI success. Original bytes and their verified storage mapping remain the source of truth.

## 2. Existing-system boundary and compatibility

The selected host repository is an existing public Flask application. Its current app.py serves MahiCloud pages and route aliases, has a 10 MiB Flask request-body limit, and contains unrelated application routes. It is not suitable as a large-file upload proxy.

The connected Primary Supabase project is active and already shared by other products. Its existing schema includes Mahi-AI conversation/history/memory/usage data, MahiFlix and StreamCloud catalogue/admin data, MahiFrame media data, and unrelated profile/media data. The deployed Edge Functions also include existing Mahi-AI and catalogue/admin functions.

The existing Storage inventory includes:
- mahi-ai-attachments — private, Mahi-AI-specific.
- mahi-ai-generated — private, Mahi-AI-specific.
- media — public, used by another existing application.

**Isolation decision:** MahiDrive will use new MahiDrive-only tables, a new private bucket, new function slugs, and new configuration names. No existing table, bucket, function, Auth policy, provider secret, or public route is to be repurposed.

### Why project-wide anonymous sign-ins must remain untouched

The existing Mahi-AI implementation supports guest/anonymous sessions. Supabase anonymous users still receive the authenticated Postgres role, so a policy that checks only for the authenticated role is insufficient.

MahiDrive must reject the JWT is_anonymous claim and require its separate owner authorization claim. Do not disable anonymous sign-ins globally in the shared Supabase project as part of MahiDrive work; doing so could break Mahi-AI. This isolation is implemented at the MahiDrive application, Edge Function, database-policy, and Storage-policy layers.

### Deployment isolation

MahiCloud main is currently unprotected and the repository has an unrelated open pull request. MahiDrive changes therefore remain on a dedicated feature branch and must be reviewed independently. No change in this Phase 2 branch changes a host start command, route, deployment setting, or existing page.

## 3. Trust boundaries

| Component | Trust level | Permitted responsibility | Forbidden responsibility |
|---|---|---|---|
| Browser / MahiDrive UI | Untrusted | Owner sign-in, metadata display, authenticated upload/download requests, explicit privacy controls | Deciding owner identity, setting owner IDs, holding service-role keys, storing Google refresh tokens, publishing private URLs |
| Supabase Auth | Identity authority | Verify a permanent account, session, email verification, MFA assurance | Public MahiDrive registration or anonymous access |
| MahiDrive Edge Functions | Trusted application boundary after owner verification | Check the real Auth user, enforce the single configured owner, perform privileged OAuth, metadata, lifecycle, and job actions | Trusting client-supplied owner IDs or paths; logging tokens, file contents, face vectors, or signed URLs |
| MahiDrive database | Source of truth for metadata and lifecycle | Owner-scoped records, constraints, audit events, idempotency and job state | Storing public file links or plaintext OAuth refresh tokens |
| MahiDrive Storage bucket | Private object data plane | Original bytes, derived previews, encrypted/derived assets, resumable uploads | Public reads, public listing, cross-owner paths, durable signed links |
| Google Drive adapter | External destination adapter | Store and retrieve objects for one explicitly connected Google identity | Pooling quotas, silently moving objects between accounts, returning refresh tokens to the browser |
| Background worker | Privileged service process | Bounded metadata/media processing, retries, thumbnails, indexing, recovery | Accepting arbitrary public jobs or processing Private Space externally by default |
| External AI provider | Untrusted processor | Only explicitly permitted tasks and minimum necessary data | Face matching, Private Space content, or raw file transmission without explicit policy approval |

Infrastructure administrators of the Supabase project, GitHub repository, and hosting account remain privileged infrastructure operators. Application-level owner isolation does not make data inaccessible to an administrator who controls the project or its service-role credentials. If protection from infrastructure operators is a requirement, client-side envelope encryption and a self-hosted processing boundary must be designed before real files are stored.

## 4. Owner authentication and authorization

### 4.1 Provisioning model

- Create the one permanent owner identity out-of-band through the Supabase Dashboard or a tightly controlled administrative provisioning operation.
- Do not ship a sign-up screen, sign-up API route, invitation flow, or user-management screen.
- Do not create MahiDrive users automatically from anonymous sessions, Mahi-AI guest identities, Google Drive OAuth identities, or user-editable profile metadata.
- Bind one fixed UUID to the deployment as the MahiDrive owner. The UUID is configuration, not a password, and must never be accepted from request bodies.
- Mark the account using server-managed Supabase app_metadata, for example a MahiDrive owner-access claim. Only the Supabase Auth administrator/provisioning operation may set this claim.
- Never use user_metadata as an authorization source; a user can edit it.

The owner UUID is not yet configured in this Phase 2 change. No account was provisioned or promoted.

### 4.2 Required checks on every protected request

A shared MahiDrive Edge Function guard must:

1. Require a bearer access token and validate it with Supabase Auth (for example, Auth getUser), not merely decode the JWT.
2. Require the returned Auth user ID to equal the configured MAHIDRIVE_OWNER_USER_ID.
3. Reject missing, anonymous, disabled, unconfirmed, or otherwise invalid identities.
4. Require the server-managed MahiDrive owner claim in app_metadata.
5. Require an appropriate MFA assurance level. The baseline for normal file operations is a permanent verified account; Private Space unlock, OAuth credential changes, account disconnect, and permanent deletion require aal2 / recent step-up authentication.
6. Apply method-specific authorization and validate every file ID, folder ID, object key, job ID, and connected-account ID against owner-owned records.
7. Derive owner_user_id from the verified Auth user. Ignore or reject any owner ID supplied by the browser.

Set verify_jwt=true for new MahiDrive Edge Functions and retain the explicit owner check inside each function. The JWT verification setting is an initial authentication gate, not the complete owner authorization decision.

### 4.3 Browser session rules

Use permanent email/password authentication with verified email and TOTP MFA. Do not call signInAnonymously, signUp, or account-linking flows from MahiDrive. On startup, refresh/validate the session and fail closed if the Auth user is not the configured owner. On sign-out, revoke the MahiDrive session and clear in-memory file, preview, and vault state.

Use the shortest practical access-token lifetime supported by the shared project without breaking other products. Sensitive operations must perform a fresh Auth validation and require step-up MFA. The implementation phase must test logout, token expiry, session revocation, and stale JWT behavior; a client-side route guard alone is never sufficient.

### 4.4 No sharing surface

Do not implement public links, share dialogs, invitations, collaborator roles, shared folders, team memberships, public file IDs, anonymous preview routes, or a share-token table. A file ID is only a locator, never an authorization credential.

## 5. Data architecture

### 5.1 Namespaces

Use two new Postgres schemas:

- **mahidrive** — owner-facing metadata tables with RLS. Expose this schema through the Data API only after its grants and complete RLS policy set are in place and security tests pass. The current Supabase platform behavior no longer automatically exposes newly created tables to the Data API; schema exposure must be deliberate.
- **mahidrive_private** — internal secrets references, biometric data, private processing state, and privileged metadata. Do not expose this schema through the Data or GraphQL APIs. Do not grant anon or authenticated direct access.

All new tables must have UUID primary keys where appropriate, foreign keys, UTC timestamps, constraints, indexes, RLS enabled, and explicit least-privilege grants. No owner ID or path from the client is authoritative.

### 5.2 Proposed tables

| Schema | Table | Purpose / key controls |
|---|---|---|
| mahidrive | files | User-visible file metadata, logical state, MIME/type, size, checksum, category, capture date references; owner_user_id required |
| mahidrive | folders | Folder hierarchy with owner-scoped parent references |
| mahidrive | file_categories | Dynamic category definitions; generated only when files need them |
| mahidrive | recently_deleted | Soft-delete record, original folder/category, deletion time, retention state; no direct permanent purge from the UI |
| mahidrive | photo_metadata | EXIF-derived capture date/time and GPS fields; owner-only and location-indexing preference aware |
| mahidrive | video_metadata | Duration, codec, resolution, frame rate, sampled-frame references |
| mahidrive | storage_accounts | Safe display metadata, provider connection state, masked account identity, quota observations; no OAuth tokens |
| mahidrive | background_jobs | Durable status, attempt count, idempotency key, safe error code, checkpoint, timestamps |
| mahidrive | audit_events | Security-relevant events without file contents, bearer tokens, OAuth tokens, or private URLs |
| mahidrive_private | owner_config | Exactly one owner UUID/configuration record; no client writes |
| mahidrive_private | storage_objects | Provider adapter key, remote object ID, verified size/checksum, connection mapping; never a public URL |
| mahidrive_private | oauth_credentials | Encrypted token material or Vault references; server-only |
| mahidrive_private | face_groups | Anonymous internal group IDs and owner-assigned names |
| mahidrive_private | face_embeddings | Encrypted biometric representations and confidence data; server/worker-only |
| mahidrive_private | photo_faces | Links detected faces to anonymous groups; server/worker-only |
| mahidrive_private | file_embeddings | Vector representations and internal indexing metadata; server-only |
| mahidrive_private | processing_checkpoints | Durable progress markers for long-running media work |

The table list is a design target, not a claim that these tables currently exist. Additional tables may be added only when required by a concrete feature and a reviewed migration.

### 5.3 RLS policy contract

For every owner-facing table:
- Enable RLS before granting table or schema access.
- Allow only the permanent owner identity; require auth.uid() = owner_user_id, a server-managed app_metadata owner claim, and is_anonymous=false.
- INSERT policies use WITH CHECK against the verified UID.
- UPDATE policies use both USING and WITH CHECK so owner_user_id cannot be reassigned.
- DELETE is denied by default for file content and lifecycle records; soft-delete operations use a dedicated owner-authorized endpoint.
- No anon policy exists.
- Do not use auth.role()='authenticated' as the authorization test; Supabase anonymous users also use that database role.
- Do not trust a policy alone to protect privileged Edge Function code that runs with a service-role key. Each privileged route must call the shared owner guard before any privileged database or Storage operation.

Keep private schema tables inaccessible through client APIs. Views, if truly needed, must use security-invoker semantics on the project's supported Postgres version and be covered by separate policy tests.

## 6. Storage architecture

Create one new bucket named mahi-drive-private (private, not public). Do not use the existing media, mahi-ai-attachments, or mahi-ai-generated buckets.

Canonical object key:
- owner UUID / library / file UUID / original
- owner UUID / library / file UUID / derived / thumbnail variant
- owner UUID / vault / file UUID / original
- owner UUID / vault / file UUID / derived / thumbnail variant

Object keys are generated server-side and cannot be overridden by user input. Store object keys, checksums, and provider object identifiers as metadata; do not store public URLs.

### 6.1 Storage access rules

- Bucket public flag must be false.
- Storage.objects RLS policies must match the new bucket, authenticated permanent owner JWT, owner UUID path prefix, and MahiDrive owner app_metadata claim.
- The policies must deny anonymous JWTs, all other users, all other buckets, and paths outside the configured owner prefix.
- The vault path segment is a stronger boundary: every vault object read, insert, update, and delete additionally requires an aal2 JWT. The server-side Private Space API independently enforces aal2/recent step-up. An owner AAL1 JWT must not read a vault object directly from Storage.
- UPDATE/overwrite is disabled by default. Where an exact resumable-upload flow requires it, separately test INSERT, SELECT, and UPDATE semantics.
- Browser downloads use authenticated Storage SDK download responses (Blob/stream) or an authenticated server proxy. Do not call getPublicUrl and do not return durable signed URLs.
- Uploads use an authenticated resumable/TUS workflow with server-issued object IDs and strict object-key policy. The Flask 10 MiB request limit must not be bypassed or used for large file bodies.
- Validate MIME type and file signatures where practical; files remain untrusted data. Never execute an uploaded file.
- Derived thumbnails/previews are separate objects; original file bytes are never rewritten to produce previews.
- Apply size/type limits from an explicit product policy and provider limits, not browser-only checks.

### 6.2 Direct versus proxied access

The preferred browser path is authenticated Storage API access with the owner's access token and restrictive Storage RLS. Where a backend proxy is needed for range requests, integrity checks, or provider adaptation, it must validate the owner session first and stream bytes without returning a permanent provider URL. Any temporary upload authorization is short-lived, object-specific, one-use where supported, and must never be logged.

## 7. Google Drive connection model

Each Google account is an independent storage destination represented by a separate storage_accounts row and a distinct provider subject/account identifier.

- Use official Google OAuth with exact redirect URI allowlists, state validation, PKCE where applicable, and minimal approved Drive scopes.
- Google Drive OAuth is separate from MahiDrive sign-in. Connecting a Drive account never changes the MahiDrive owner identity.
- Keep client secret and refresh/access tokens in server-side secret storage or encrypted Vault material. Only the Edge Function/worker can decrypt or refresh them.
- Return safe connection metadata only: masked account label, status, last successful operation, quota values when actually available, and actionable reauthorization state.
- Keep quota, health, object mapping, and error state per account. Never aggregate quotas into a fictional pooled capacity.
- Respect Google Drive account policies and limits. Do not switch accounts to evade storage quotas, rate limits, upload limits, or restrictions.
- Retry rate limits with truncated exponential backoff and jitter. Retry only idempotent/known-safe operations; use idempotency keys and remote object verification after ambiguous timeouts.
- A fallback destination may be selected only when the owner has explicitly configured it and provider use is permitted. The old and new object mappings must be preserved until the new write is verified.
- Disconnecting an account revokes/clears its credentials and stops new operations; it does not silently delete remote files.
- Never treat a successful OAuth callback as proof that file upload/download/quota operations work. Test each permitted operation against a real owner-authorized connection.

Google's current Drive API documentation describes project/user quotas, file size and upload limits, and exponential backoff guidance. Account routing must comply with those independent limits rather than pool them.

## 8. Private Space, Recently Deleted, recovery

### 8.1 Private Space

Private Space is a separate logical security domain, not just a hidden UI tab:
- All Private Space files use the dedicated vault object-key prefix and a separate visibility/security flag. They are excluded from default Photos, Videos, categories, ordinary search, people grouping, and events.
- Storage RLS requires aal2 for every vault-prefixed object operation; normal library objects use the less privileged owner session policy. The vault API and metadata access independently require aal2/recent step-up.
- Default AI policy is disabled for file content. Owner may choose metadata-only indexing or explicitly enable a specific processing capability.
- No file bytes, extracted text, thumbnails, EXIF GPS, face crops, embeddings, prompts, or derived content are sent to external providers unless the owner has explicitly enabled that exact data flow.
- Vault unlock requires a fresh owner session and aal2. Automatic lock occurs on inactivity, tab close, sign-out, or security-state change.
- Private objects remain within the dedicated private bucket. Do not rely on client-side hiding as a security boundary.

### 8.2 Recently Deleted

Deletion is a soft lifecycle transition:
1. Verify the current owner and file/object mapping.
2. Record the original folder/category, storage destination, object ID, checksum, and deletion timestamp.
3. Move/trash the provider object only through a supported, verified adapter operation.
4. Mark the file as recoverable only when the destination confirms its state.
5. Preserve mapping and retry context until retention expires or permanent deletion is explicitly requested.

Restore must verify the remote object still exists and checksum/mapping are consistent before restoring metadata and reindexing. If the provider has permanently deleted the object, show it as unrecoverable rather than pretending it can be restored.

Permanent deletion requires owner confirmation, aal2/recent reauthentication, a clear summary of affected destinations, and a second confirmation step for bulk operations. Do not delete a remote object if its identity or ownership cannot be verified.

## 9. AI and background processing

### 9.1 Separation of concerns

Use independent modules for:
- Orchestrator and task policy
- Provider capability registry and fallback manager
- File signature/MIME detection
- EXIF and metadata extraction
- Photo tagging and scene descriptions
- Face detection and local/self-hosted matching
- Video metadata and frame sampling
- Document text extraction
- Semantic embedding/indexing
- Duplicate checksums/perceptual hashes
- Event grouping
- Storage health monitoring
- Upload verification and recovery
- Persistent job scheduling

A generic LLM is not a face-recognition engine. Face detection/matching must use a dedicated computer-vision pipeline, ideally local/self-hosted. Group identities remain anonymous until manually named by the owner.

### 9.2 Reuse of existing AI integrations

The shared Mahi-AI gateway contains task-aware provider routing and server-side credentials, but its existing chat endpoint also has its own conversation, memory, usage, and user-session semantics. MahiDrive must not call that chat endpoint as a shortcut for private-file processing.

Reuse is allowed only through a reviewed server-side provider adapter that:
- checks task capability (text, vision, embedding, video-frame support),
- enforces per-feature privacy settings before sending data,
- minimizes and redacts inputs,
- does not write file content into Mahi-AI chat history or long-term memory,
- does not disclose provider names to the normal file UI,
- records safe task outcomes without logging contents or credentials.

Do not modify the deployed mahi-ai-chat function for MahiDrive. Private Space external processing remains disabled by default.

### 9.3 Queue and worker model

Use durable persisted jobs with explicit states: queued, uploading, uploaded, analyzing, indexing, completed, retry_scheduled, failed, and dead_letter.

A Postgres-backed queue (for example Supabase Queues/pgmq) is a candidate, but pgmq was listed as available and not installed in the inspected project. Do not treat it as operational until a migration enables it and a durability test passes. Long-running video/face/document processing belongs in a separately deployed worker, not a time-limited request handler.

Every job needs an idempotency key, bounded retry budget, exponential backoff, lease/visibility timeout, durable checkpoint, attempt count, dead-letter path, and replay-safe processing. A failed analysis never invalidates a verified original upload.

Workers accept only trusted internal jobs. Do not expose a public endpoint that accepts an arbitrary job payload. The worker derives owner identity from trusted server-side job state, not a browser-supplied owner ID.

## 10. Security controls

| Threat | Required control |
|---|---|
| Second user or anonymous session | Fixed owner UUID + app_metadata owner claim + is_anonymous=false in Edge and RLS/Storage policies |
| IDOR / guessed file ID | Owner-scoped metadata lookup on every request; UUID is not authorization |
| Owner ID reassignment | RLS WITH CHECK and immutable owner identity; never accept owner ID from client |
| Service-role leakage | Server-only secrets; secret scanning; no client bundle or log exposure |
| OAuth CSRF / callback injection | State, PKCE, strict redirect allowlist, one-time callback validation |
| Refresh-token theft | Server-side encrypted token storage/Vault, rotation/revocation, masked UI values |
| Private URL leakage | No public bucket, getPublicUrl, permanent signed URLs, or URL logging; use authenticated file API |
| Storage path traversal | Server-generated owner/file object key, prefix checks, canonicalization |
| Malicious upload / archive bomb | File signature checks, bounded size/ratio, archive listing limits, quarantine if scanning exists, never execute |
| SSRF through URL import | Host allowlist, DNS/IP validation, block private/link-local/reserved ranges, redirect revalidation, bounded response size |
| Biometric exposure | Local/self-hosted processing, separate private schema, encrypted embeddings, no public API/LLM access, deletion control |
| Private Space exfiltration | Explicit per-feature opt-in, default AI off, no external provider path by default |
| Log leakage | Structured event codes only; redact file names where sensitive, never log tokens, raw prompts, face data, object URLs, or file contents |
| Background job forgery | Internal authenticated worker channel, immutable job ownership, idempotency, replay controls |
| Accidental destructive deletion | Soft delete first, verified mapping, step-up MFA, two-step purge confirmation |
| Cross-application regression | Additive files/functions only, no shared config changes, existing-app regression suite and diff review |

## 11. API boundary map

All routes require the shared owner guard unless specifically marked as a sign-in endpoint.

- Auth: sign-in, refresh, sign-out, session status, MFA challenge/verify. No sign-up, invite, share, or guest routes.
- Files: list/get metadata, create folder, rename/move, upload intent, upload completion verification, authenticated download stream, soft delete, restore.
- Photos: owner-scoped metadata search, people groups, events, locations. Private Space excluded by default.
- Videos: technical metadata and verified analysis tags; sampling limits set server-side.
- Private Space: unlock/lock, separate listing/search, private upload/download/delete; requires step-up authentication.
- Recently Deleted: list, restore, permanent-delete request/confirm, bulk operations with explicit authorization.
- Storage: list connected destinations, OAuth connect/callback/reconnect/disconnect, health/quota refresh, mapping inspection. No token read endpoint.
- AI: status, task state, explicit feature preferences, reindex requests. No arbitrary provider prompt or raw secret endpoint.
- Worker: internal-only enqueue/claim/ack/retry. Never exposed as a public user API.

The routes are logical contracts. Exact URL paths and HTTP methods are finalized with their implementation and regression tests; this document does not imply they are deployed.

## 12. Performance, integrity, and reliability

- Resumable upload and direct Storage/provider transfers for large files; do not route original bytes through Flask's 10 MiB endpoint.
- Compute a cryptographic checksum before/after transfer where feasible; verify provider object existence and size before setting upload_complete.
- Use idempotency keys for every upload intent, completion callback, restore, copy, and delete operation.
- Treat a network timeout after upload as ambiguous; reconcile against remote object ID/checksum before retrying to avoid duplicate objects.
- Store file metadata and provider object mappings independently. AI labels never replace original content or source metadata.
- Use pagination, incremental indexing, thumbnail caching, worker concurrency limits, and bounded video sampling.
- Use authenticated range/stream support where the backend supports it; never manufacture transfer-progress percentages.
- Keep storage account outage state distinct from file availability and AI task state.

## 13. Secrets and cryptographic material

Expected server-only configuration names (names only; no values in source control):
- MAHIDRIVE_OWNER_USER_ID
- MAHIDRIVE_INTERNAL_WORKER_SECRET (or a rotated signing key for worker messages)
- Google OAuth client ID/secret and callback configuration, held only in the server secret store
- Existing Supabase server URL and service-role/secret key, available only to trusted server-side functions
- Encryption/Vault configuration required by the selected token storage design

Do not copy keys from Mahi-AI into frontend config. Do not enumerate or print current secret values. No new secrets were read or modified in Phase 2.

## 14. Deployment and change-control rules

1. Keep MahiDrive work on feature/mahidrive-architecture-security and later MahiDrive-specific feature branches.
2. Do not work directly on main, force-push, rewrite history, or auto-merge.
3. Do not create or deploy Supabase production migrations/functions until a separate implementation change has been reviewed.
4. Do not change shared anonymous-auth settings, existing RLS policies, provider secrets, buckets, functions, or deployment configuration for MahiDrive.
5. Require an explicit review of migration SQL, Edge Function authorization, Storage policies, and frontend bundles before any production operation.
6. Run unit tests, integration tests with at least two Auth identities, storage-policy tests, static secret scans, dependency scans, and existing MahiCloud/Mahi-AI regression tests.
7. Deploy only after every required security test passes; then verify the exact production owner login, upload/download, restore, Private Space isolation, and account disconnect.

## 15. Phase 2 decisions and outstanding prerequisites

| Item | Decision / status |
|---|---|
| Single owner | Fixed permanent Supabase Auth UUID; not yet provisioned/configured |
| Public signup | Not implemented; absent from product design |
| Anonymous access | Denied by MahiDrive; shared project-wide anonymous sign-ins remain untouched for Mahi-AI |
| RLS | Mandatory on all MahiDrive exposed tables; private schema remains unexposed |
| Storage | New private bucket mahi-drive-private; not created in Phase 2 |
| Metadata APIs | Explicitly expose only the required MahiDrive schema after RLS/grants/tests; other internal schema remains unexposed |
| Google OAuth | Server-only tokens, separate account identities, no credential currently verified |
| Private Space | AI off by default; isolated from normal search/people/events |
| Recently Deleted | Soft delete and verified restore before permanent purge |
| Background queue | Durable queue required; pgmq extension not installed in current project |
| AI gateway | Reuse only through a privacy-aware adapter; do not call/modify the existing chat endpoint for private files |
| Deployment | No production deployment in Phase 2 |
| Supabase changes | None; no schema, migration, Auth setting, Storage bucket, or Edge Function changed |

### Prerequisites before Phase 3 implementation

- Provision the one owner account and record its immutable Auth UUID in server-only configuration.
- Confirm verified email and TOTP MFA enrollment for that owner.
- Confirm the chosen shared Supabase project is acceptable for this private file data, including its infrastructure administrator trust boundary. A dedicated MahiDrive Supabase project would provide stronger blast-radius separation and is the safer option if budget/plan permits.
- Confirm Google OAuth app ownership, consent-screen settings, redirect host, and minimum required Drive scopes.
- Decide whether Private Space requires client-side envelope encryption against infrastructure administrators.
- Confirm the deployment host and worker runtime for long-running media tasks.

## 16. Official references reviewed

- Supabase Anonymous Sign-Ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase JWT Claims: https://supabase.com/docs/guides/auth/jwt-fields
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Storage Schema: https://supabase.com/docs/guides/storage/schema/design
- Supabase Multi-Factor Authentication: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase Queues: https://supabase.com/docs/guides/queues
- Supabase Changelog: https://supabase.com/changelog.md
- Google Drive API Usage Limits: https://developers.google.com/workspace/drive/api/guides/limits
- Google OAuth 2.0 Policies: https://developers.google.com/identity/protocols/oauth2/policies
- Google Restricted Scope Verification / personal-use exception: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy

Supabase documentation reviewed confirms that anonymous Auth users also assume the authenticated Postgres role and carry an is_anonymous claim; RLS must check that distinction. Storage access is controlled by policies on storage.objects, and direct SQL changes to the Storage schema are discouraged. Supabase's 2026 Data API change means new tables are not automatically exposed by default. These behaviors are reflected in the architecture above.
