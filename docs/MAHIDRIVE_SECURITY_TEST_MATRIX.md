# MahiDrive Security & Release Test Matrix

**Phase:** 2 — Architecture and Security Boundaries  
**Status:** Acceptance criteria for implementation and release. Tests in this matrix have not yet been executed.  
**Architecture:** docs/MAHIDRIVE_ARCHITECTURE.md  
**Release rule:** Any failed, skipped, or unverified required security test blocks production deployment.

## 1. Test identities and environment

Run only against a dedicated development/staging Supabase project or Supabase branch with test data. Do not use production personal files, live Google Drive refresh tokens, or production owner sessions for negative tests.

Prepare these identities:

| Test identity | Supabase Auth identity | Expected MahiDrive result |
|---|---|---|
| Owner | Permanent, email-verified, configured owner UUID, MahiDrive app_metadata owner claim, MFA enrolled | Allowed after valid session and required MFA assurance |
| Other permanent user | Different UUID, verified account, no MahiDrive owner claim | Denied everywhere |
| Anonymous user | Supabase anonymous sign-in session, is_anonymous=true | Denied everywhere even though its Postgres role is authenticated |
| Expired/revoked owner session | Formerly valid owner access token/session | Denied after expiry/revocation policy takes effect |
| Unconfirmed owner-like account | Different UUID or account with unverified email | Denied |
| Forged client identity | Owner UUID or claim supplied in request JSON/user_metadata | Ignored/rejected; never elevates access |

The owner identity is provisioned out-of-band. No test should create an owner through a public MahiDrive sign-up route.

## 2. Owner authentication and session tests

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| AUTH-001 | Correct owner login | Sign in with configured verified owner identity | Authenticated MahiDrive session | Yes |
| AUTH-002 | Different permanent user | Sign in with second Auth user | Denied; no file, metadata, account or job access | Yes |
| AUTH-003 | Anonymous session | Send anonymous JWT to every MahiDrive route | Denied even if JWT role is authenticated | Yes |
| AUTH-004 | No token | Call every protected endpoint without Authorization | 401; no database/storage action | Yes |
| AUTH-005 | Invalid token | Send malformed, tampered, wrong-project or expired JWT | 401; no privileged operation | Yes |
| AUTH-006 | Owner UUID spoofing | Send owner_user_id of the real owner in request body/header | Caller remains denied; server derives identity from Auth | Yes |
| AUTH-007 | user_metadata spoofing | Add an owner-looking field to user-editable metadata | No authorization change | Yes |
| AUTH-008 | Missing app_metadata owner claim | Correct account UUID but remove/omit owner claim in staging | Denied until server-side claim is restored and token refreshed | Yes |
| AUTH-009 | Unverified email | Attempt owner access before email verification | Denied | Yes |
| AUTH-010 | Signup endpoint | Probe UI, route list, REST wrapper and Edge Functions for sign-up/invite operations | No public registration, invite, or user-provisioning route | Yes |
| AUTH-011 | MFA assurance | Use owner AAL1 session for vault unlock, OAuth change, or permanent delete | Denied; require aal2/step-up | Yes |
| AUTH-012 | Valid MFA step-up | Complete TOTP challenge and retry protected action | Allowed only for the configured owner | Yes |
| AUTH-013 | Logout | Sign out, then replay former access token | Denied according to revocation/expiry policy; sensitive Edge routes revalidate Auth | Yes |
| AUTH-014 | Session expiry | Allow access token to expire and reuse it | Denied; refresh requires valid owner session | Yes |
| AUTH-015 | Brute-force protection | Repeated invalid owner login attempts | Rate-limited; no account enumeration | Yes |
| AUTH-016 | Project guest compatibility | Verify Mahi-AI guest session still works after MahiDrive changes | Existing Mahi-AI behavior unchanged | Yes |

## 3. Database and RLS tests

Execute tests using real JWTs for the identities above, not only SQL Editor/service-role sessions. SQL Editor access bypasses the ordinary browser authorization path and cannot prove that RLS works.

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| DB-001 | RLS inventory | Enumerate every MahiDrive table | RLS enabled on every table; explicit least-privilege grants and policies recorded | Yes |
| DB-002 | Owner read | Owner queries a MahiDrive file/folder row | Only owner rows returned | Yes |
| DB-003 | Other-user read | Second user queries known owner row UUID | No row returned / access denied | Yes |
| DB-004 | Anonymous read | Anonymous JWT queries known owner row | No row returned / access denied | Yes |
| DB-005 | Owner insert | Owner creates a row with owner_user_id equal to Auth UID | Allowed where that table permits client insertion | Yes |
| DB-006 | Forged-owner insert | Owner attempts to insert a row owned by another UUID | Denied by WITH CHECK / server-side validation | Yes |
| DB-007 | Ownership reassignment | Owner attempts UPDATE changing owner_user_id | Denied; WITH CHECK prevents reassignment | Yes |
| DB-008 | Cross-table IDOR | Owner/other user substitutes foreign folder/file/category/job ID | No foreign record is disclosed or modified | Yes |
| DB-009 | RPC bypass | Call exposed functions with anonymous/other-user JWT | Denied; no SECURITY DEFINER privilege escalation | Yes |
| DB-010 | View isolation | Query any exposed view over MahiDrive tables | security_invoker semantics or no client grant; no RLS bypass | Yes |
| DB-011 | Private schema exposure | Attempt REST/GraphQL access to mahidrive_private | No Data API route or role grant | Yes |
| DB-012 | API schema exposure | Inspect Data API exposed schemas and grants | Only deliberately selected MahiDrive schema is exposed; RLS already installed | Yes |
| DB-013 | Privileged Edge route | Use other-user JWT against a server function using service role | Rejected before any privileged query or storage access | Yes |
| DB-014 | Client-supplied path | Submit arbitrary object key, parent folder ID or storage account ID | Rejected or replaced with validated server-derived identifiers | Yes |
| DB-015 | Migration safety | Apply MahiDrive migrations to isolated test project | No changes to existing MahiCloud/Mahi-AI/MahiFlix/MahiFrame/StreamCloud tables, policies or functions | Yes |

## 4. Storage isolation tests

Test the private bucket through the Storage API with actual owner, second-user and anonymous JWTs. Do not rely on the Studio UI or service-role access.

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| STO-001 | Bucket privacy | Inspect bucket metadata | mahi-drive-private exists and public=false | Yes |
| STO-002 | Existing bucket isolation | Inspect existing media and Mahi-AI buckets before/after MahiDrive migration | Names, visibility, policies and contents unchanged | Yes |
| STO-003 | Owner upload | Upload to owner UUID / file UUID / original | Allowed through authenticated resumable flow | Yes |
| STO-004 | Other-user upload | Upload to MahiDrive bucket using second-user JWT | Denied | Yes |
| STO-005 | Anonymous upload | Upload using anonymous JWT | Denied | Yes |
| STO-006 | Owner download | Download known owner object with owner JWT | File bytes returned; no public URL generated | Yes |
| STO-007 | Other-user download | Download known owner object with second-user JWT | Denied | Yes |
| STO-008 | Anonymous download | Download known owner object anonymously | Denied | Yes |
| STO-009 | Cross-prefix read | Owner requests object under a different owner prefix | Denied | Yes |
| STO-010 | Cross-bucket access | Use MahiDrive policy to access existing media/Mahi-AI buckets | Denied; policies remain bucket-specific | Yes |
| STO-011 | Listing leakage | List bucket root or another owner prefix | No foreign object name or metadata disclosed | Yes |
| STO-012 | Overwrite | Attempt upsert/overwrite of existing original object | Denied unless a separately authorized version/replace workflow is being used | Yes |
| STO-013 | Delete | Attempt direct hard deletion from browser | Denied; only soft-delete API may be used | Yes |
| STO-014 | Public URL | Search UI/network/API outputs for getPublicUrl or durable signed URLs | No public file URL is created or returned | Yes |
| STO-015 | Upload interruption | Interrupt a resumable upload and resume | Correct object assembled once; checksum verified | Yes |
| STO-016 | Duplicate completion | Replay upload-complete callback | Idempotent; no duplicate metadata/object mapping | Yes |
| STO-017 | Integrity mismatch | Upload data that fails checksum/size verification | Not marked complete; recovery job created | Yes |
| STO-018 | Oversize and malformed content | Send over-limit or signature-mismatched file | Rejected/quarantined by server policy; no execution | Yes |
| STO-019 | Vault AAL1 denial | Use the correct owner identity with an AAL1 JWT to read/write under the vault prefix | Denied by Storage RLS even though the account is the owner | Yes |
| STO-020 | Vault AAL2 access | Use the same owner identity after TOTP step-up to access the vault prefix | Allowed only while the session retains aal2 | Yes |

## 5. Private Space and lifecycle tests

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| PRI-001 | Private default | Upload a file into Private Space without changing privacy settings | No external AI, face, location, semantic or event processing | Yes |
| PRI-002 | Browser collection isolation | Query Photos/Videos/normal search for Private Space file | No result, count, thumbnail, title, or location leakage | Yes |
| PRI-003 | Face isolation | Run people grouping while Private Space analysis is disabled | No Private Space face records or embeddings produced | Yes |
| PRI-004 | External egress | Monitor outbound requests during private upload/processing | No third-party AI request containing private bytes or derived content | Yes |
| PRI-005 | Vault unlock | Try with no session, other user, anonymous user and owner AAL1 | Denied in all cases except owner aal2 | Yes |
| PRI-013 | Direct Storage bypass | Attempt to access a vault-prefixed object directly with an owner AAL1 JWT, bypassing the UI | Storage RLS denies the request; only owner aal2 can access it | Yes |
| PRI-006 | Lock on sign-out | Unlock vault, sign out or expire session | UI state cleared; subsequent object requests denied | Yes |
| PRI-007 | Soft delete | Delete an ordinary file | Recoverable lifecycle record created; object mapping preserved | Yes |
| PRI-008 | Restore available object | Restore file whose original provider object still exists | Mapping, category and folder restored; checksum verified | Yes |
| PRI-009 | Restore missing object | Restore file after provider reports permanent deletion | Restore denied and file shown unrecoverable | Yes |
| PRI-010 | Permanent delete without step-up | Attempt purge with no fresh MFA | Denied | Yes |
| PRI-011 | Permanent delete confirmation | Complete owner aal2 and explicit two-step confirmation | Only selected owner object permanently deleted; audit event created | Yes |
| PRI-012 | Bulk purge | Mix valid and invalid IDs in a bulk delete request | Per-item authorization and result; no unintended delete | Yes |

## 6. Google Drive OAuth and account-isolation tests

Use a dedicated test Google account and OAuth client configuration. Do not paste real refresh tokens into test fixtures or logs.

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| GDR-001 | OAuth start | Owner initiates connection | Server creates state/PKCE material and redirects only to approved Google endpoint | Yes |
| GDR-002 | OAuth CSRF | Replay callback with missing/incorrect/expired state | Rejected; no account or token stored | Yes |
| GDR-003 | Redirect validation | Attempt unapproved redirect_uri/return path | Rejected | Yes |
| GDR-004 | Scope minimization | Inspect requested scopes and consent screen | Only documented, necessary scopes requested | Yes |
| GDR-005 | Callback authorization | Complete OAuth callback with non-owner MahiDrive session | Rejected | Yes |
| GDR-006 | Token confidentiality | Inspect browser network responses, localStorage, IndexedDB, logs and frontend bundles | No Google client secret, refresh token or access token exposed | Yes |
| GDR-007 | Encrypted token storage | Inspect database/Vault storage and service access | Tokens encrypted or stored as Vault references; no direct client read | Yes |
| GDR-008 | Account independence | Connect two distinct test Google accounts | Separate account IDs, subjects, health, quota and object mappings | Yes |
| GDR-009 | No quota pooling | Inspect dashboard totals and router behavior | Per-account quota shown separately; no policy bypass | Yes |
| GDR-010 | Token refresh | Expire access token and refresh through server adapter | Works without sending refresh token to browser | Yes |
| GDR-011 | Reauthorization required | Revoke OAuth grant at Google and perform operation | Destination marked reauthorization required; existing mapping preserved | Yes |
| GDR-012 | Disconnect | Disconnect one account | Tokens revoked/deleted; other accounts unaffected; remote files not silently deleted | Yes |
| GDR-013 | Rate limit | Simulate 403/429/time-based Google quota failure | Backoff with jitter; no unbounded retry or duplicate upload | Yes |
| GDR-014 | Ambiguous upload result | Drop client response after remote upload completes | Reconcile object ID/checksum before retry; no duplicate file | Yes |
| GDR-015 | Account outage | Make one destination unavailable | Do not switch account unless owner policy explicitly permits and use is compliant | Yes |

## 7. AI, privacy and background-job tests

| ID | Scenario | Action | Expected result | Release blocking |
|---|---|---|---|---|
| AI-001 | Non-file text task | Run a low-sensitivity metadata classification task | Capability-compatible adapter selected; no Mahi-AI chat history side effect | Yes |
| AI-002 | Private Space default | Upload private document/photo/video | No external provider receives it unless exact processing policy is explicitly enabled | Yes |
| AI-003 | Face pipeline | Process an ordinary photo with face recognition enabled | Dedicated CV pipeline; no general LLM used as face matcher | Yes |
| AI-004 | Anonymous face groups | Inspect results | Internal anonymous group IDs only until owner manually names groups | Yes |
| AI-005 | Embedding security | Attempt browser/API read of biometric or internal vector tables | Denied; encrypted/isolated server-only access | Yes |
| AI-006 | Disable AI | Disable a feature while jobs are queued | Future jobs stop; in-flight work checkpoints or cancels safely | Yes |
| AI-007 | Provider failure | Make one eligible provider fail | Compatible fallback only; partial output preserved; original file remains accessible | Yes |
| AI-008 | All providers fail | Disable all eligible test adapters | File remains available; AI job reports failure/retry without invalidating upload | Yes |
| AI-009 | Worker forgery | Submit public arbitrary job payload or invalid internal signature | Rejected | Yes |
| AI-010 | Worker replay | Replay a completed job message | Idempotent; no duplicate tags/embeddings/thumbnails | Yes |
| AI-011 | Job retry | Force transient provider/worker failure | Bounded exponential backoff and durable checkpoint | Yes |
| AI-012 | Poisoned content | Upload prompt-injection text in PDF/metadata | Content treated as untrusted data, not worker/system instructions | Yes |
| AI-013 | Private logging | Inspect application, Edge, worker and provider logs | No raw file content, private URLs, face data, tokens or secrets | Yes |
| AI-014 | Usage accounting | Inspect task metrics | Safe task status/counters only; do not expose internal prompts or chain-of-thought | Yes |

## 8. Application and integration regression tests

Existing products must continue to work unchanged.

- Run the complete existing MahiCloud Python unittest suite.
- Run all existing Mahi-AI Node test suites and Deno Edge Function tests available in its repository.
- Verify MahiCloud homepage, Apps, MahiFlix, Linkora, LUMR, Instagram Cleaner, browser helper, admin pages, and current API route contracts.
- Verify Mahi-AI guest session creation, conversation history, SSE streaming, attachments, memory controls, live-token flow, and existing provider fallback behavior.
- Verify existing Supabase Edge Function slugs, versions, JWT settings, database migrations, Storage buckets, policies, and representative rows remain unchanged.
- Check no MahiDrive migration or function replaces any existing function slug or shared policy.
- Check no new MahiDrive route shadows an existing MahiCloud path.
- Check no new service worker/cache entry breaks existing pages or asset versions.

## 9. Secret, dependency and code hygiene

Required automated checks:
- Secret scanning on the entire diff and built frontend artifacts.
- Search for service-role/secret keys, Google refresh tokens, OAuth client secrets, private URLs, signed URLs, and hard-coded owner credentials.
- Dependency vulnerability scan and lockfile/version review.
- Static checks for missing owner guard, unprotected Edge routes, unsafe SQL construction, path concatenation, open redirects, SSRF, unbounded archive extraction, and unsafe HTML rendering.
- Browser storage inspection to ensure refresh tokens and sensitive private content are not written to localStorage or IndexedDB.
- Log inspection with synthetic secret/token markers to confirm redaction.
- Policy inventory and RLS advisor review after every schema migration.

## 10. Release acceptance criteria

MahiDrive cannot deploy until all conditions below are true:

1. Exactly one owner UUID is provisioned and configured server-side.
2. Owner verified sign-in and required MFA pass on desktop and mobile.
3. Second-user and anonymous negative tests fail closed across every API, database table, RPC, and bucket.
4. Every MahiDrive table has verified RLS/grants or private-schema isolation; every object path is owner-only.
5. No public file URL or persistent signed URL is created or returned.
6. Google OAuth state, scope, token confidentiality, account independence, and recovery tests pass.
7. Private Space egress/AI isolation and Recently Deleted recovery/purge tests pass.
8. Upload/download/integrity/retry tests pass with real test provider operations.
9. Existing MahiCloud and Mahi-AI regression suites pass.
10. Secret scans, dependency scans, database advisors, and diff review show no release-blocking issue.
11. A reviewer can verify that no production migration or deployment ran before acceptance.
12. The final report lists exact test commands, environment, results, failures, and any remaining limits. A test that was skipped or not run is not marked as passed.

**Phase 2 result:** The security acceptance criteria are defined. No test is marked passed because implementation and test execution have not yet occurred.
