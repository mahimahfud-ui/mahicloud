# MahiDrive Phase 2 Security Matrix — Phase 3 Status

**Implementation branch:** `feature/mahidrive-architecture-security`  
**Pull request:** [#53](https://github.com/mahimahfud-ui/mahicloud/pull/53)  
**Phase:** 3 — Core Application & Owner Authentication  
**Evaluation date:** 2026-11-03

## Result summary

| Status | Count | Meaning |
|---|---:|---|
| Passed | 0 | The exact acceptance test was executed against its required environment and passed |
| Failed | 0 | An executed acceptance test failed |
| Blocked | 53 | Requires a dedicated Supabase project, real owner/negative-test identities, or a private bucket that has not yet been provisioned |
| Not applicable | 40 | Explicitly belongs to a later phase and is not part of the Phase 3 feature set |
| **Total** | **93** | Every test from the Phase 2 matrix is accounted for |

No live Supabase Auth, database, Storage, Google OAuth, Private Space, or AI-processing acceptance test is marked passed. Phase 3's Flask contract tests use mocked upstream Auth responses and static source checks; they are useful unit tests but are not a substitute for tests using real JWTs and a real private bucket.

## Test-by-test status

| ID | Test | Status | Reason |
| AUTH-001 | Correct owner login | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-002 | Different permanent user | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-003 | Anonymous session | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-004 | No token | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-005 | Invalid token | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-006 | Owner UUID spoofing | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-007 | user_metadata spoofing | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-008 | Missing app_metadata owner claim | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-009 | Unverified email | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-010 | Signup endpoint | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-011 | MFA assurance | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-012 | Valid MFA step-up | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-013 | Logout | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-014 | Session expiry | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-015 | Brute-force protection | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| AUTH-016 | Project guest compatibility | **Blocked** | Requires a dedicated Supabase project and real owner/secondary/anonymous Auth sessions; the 26-test local contract suite is not a live multi-identity integration test. |
| DB-001 | RLS inventory | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-002 | Owner read | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-003 | Other-user read | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-004 | Anonymous read | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-005 | Owner insert | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-006 | Forged-owner insert | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-007 | Ownership reassignment | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-008 | Cross-table IDOR | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-009 | RPC bypass | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-010 | View isolation | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-011 | Private schema exposure | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-012 | API schema exposure | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-013 | Privileged Edge route | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-014 | Client-supplied path | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| DB-015 | Migration safety | **Blocked** | The dedicated project is not provisioned, so MahiDrive migrations, exposed-schema grants and real RLS/IDOR tests have not been applied or executed. |
| STO-001 | Bucket privacy | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-002 | Existing bucket isolation | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-003 | Owner upload | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-004 | Other-user upload | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-005 | Anonymous upload | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-006 | Owner download | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-007 | Other-user download | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-008 | Anonymous download | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-009 | Cross-prefix read | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-010 | Cross-bucket access | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-011 | Listing leakage | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-012 | Overwrite | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-013 | Delete | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-014 | Public URL | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-015 | Upload interruption | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-016 | Duplicate completion | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-017 | Integrity mismatch | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-018 | Oversize and malformed content | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-019 | Vault AAL1 denial | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| STO-020 | Vault AAL2 access | **Blocked** | The private bucket has not been created; upload/download/resume, object ownership and Storage RLS tests cannot run yet. |
| PRI-001 | Private default | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-002 | Browser collection isolation | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-003 | Face isolation | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-004 | External egress | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-005 | Vault unlock | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-013 | Direct Storage bypass | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-006 | Lock on sign-out | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-007 | Soft delete | **Blocked** | Phase 3 implements metadata soft-delete/restore, but live Storage object preservation and restoration cannot be verified until the dedicated project and bucket exist. |
| PRI-008 | Restore available object | **Blocked** | Phase 3 implements metadata soft-delete/restore, but live Storage object preservation and restoration cannot be verified until the dedicated project and bucket exist. |
| PRI-009 | Restore missing object | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-010 | Permanent delete without step-up | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-011 | Permanent delete confirmation | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| PRI-012 | Bulk purge | **Not applicable** | Private Space/vault, face grouping and permanent/bulk purge are later-phase features and are not exposed by the Phase 3 app. |
| GDR-001 | OAuth start | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-002 | OAuth CSRF | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-003 | Redirect validation | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-004 | Scope minimization | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-005 | Callback authorization | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-006 | Token confidentiality | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-007 | Encrypted token storage | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-008 | Account independence | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-009 | No quota pooling | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-010 | Token refresh | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-011 | Reauthorization required | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-012 | Disconnect | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-013 | Rate limit | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-014 | Ambiguous upload result | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| GDR-015 | Account outage | **Not applicable** | Google Drive OAuth and destination adapters are explicitly deferred to Phase 4. |
| AI-001 | Non-file text task | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-002 | Private Space default | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-003 | Face pipeline | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-004 | Anonymous face groups | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-005 | Embedding security | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-006 | Disable AI | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-007 | Provider failure | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-008 | All providers fail | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-009 | Worker forgery | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-010 | Worker replay | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-011 | Job retry | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-012 | Poisoned content | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-013 | Private logging | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |
| AI-014 | Usage accounting | **Not applicable** | AI metadata processing, face recognition, embeddings and worker queues are later-phase scope, not implemented in Phase 3. |

## Phase 3 code-level coverage (separate from the 93 live acceptance tests)

The new `tests/test_mahidrive.py` suite contains 26 Python tests covering configuration fail-closed behavior, sign-in proxy contracts, invalid/wrong/anonymous/unverified identities, user-metadata spoofing, TOTP/AAL2 session gating, login rate limiting, absence of signup routes, route headers, and static owner/RLS/TUS contracts. These tests run in GitHub Actions; they do not provision or connect a real MahiDrive Supabase project.

The workflow also performs:
- Existing MahiCloud route and integrated-asset tests.
- Node syntax validation of `web/mahidrive/app.js`.
- Deno type-checking of the MahiDrive upload-verification Edge Function.

The final results of those GitHub Actions runs are reported separately in the implementation report and PR.

## Prerequisites to unblock

1. Confirm the Supabase organization in which the dedicated project should be created and review the project-cost quote.
2. Provision the dedicated MahiDrive Supabase project; do not use the shared MahiCloud/Mahi-AI project.
3. Create and verify exactly one permanent owner account, enroll a TOTP factor, and record its Auth UUID.
4. Apply the isolated `supabase/mahidrive` migration, provision the private owner UUID record, create the private bucket, and deploy the JWT-verified upload function.
5. Run the blocked owner/other-user/anonymous database and Storage tests with real sessions and objects.
6. Only then can the Phase 3 core be treated as live and the full deployment gate be evaluated.

A test that is blocked or not applicable is not a pass and does not satisfy the production release gate.
