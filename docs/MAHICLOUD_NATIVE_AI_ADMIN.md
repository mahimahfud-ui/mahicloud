# MahiCloud Native Mahi-AI and Master Admin

## Architecture

- `/mahi-ai/` serves the Mahi-AI interface and related assets from this repository's own origin. It is not an iframe.
- `/mahi-ai-launcher.js` replaces the old Quick Add floating launcher on main-site pages.
- The native assistant calls the existing Supabase `mahi-ai-chat` Edge Function. Its task-aware provider router remains the single AI gateway.
- `/admin/` is a static shell; privileged actions are verified by the `mahicloud-admin` Edge Function.
- The catalogue, rate-limit records and revocable sessions are stored in Supabase tables with RLS enabled and browser-role permissions revoked.

## Secrets

Keep all provider keys in Supabase Edge Function Secrets only. Do not expose secrets in browser config or Git:
- Chat: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `VENICE_API_KEY`, and the existing Cloudflare/Shannon aliases. The existing router also supports NVIDIA and Mistral when their keys exist.
- Metadata: `OMDB_API_KEY`.
- Admin: `ADMIN_PIN` and `ADMIN_SESSION_SECRET` (at least 32 characters).
- CORS: `ALLOWED_ORIGINS`, a comma-separated list of exact origins without paths, e.g. `https://mahimahfud-ui.github.io,https://your-production-origin.example`.
- Privileged operations: `GITHUB_TOKEN`, `SC_SUPABASE_MANAGEMENT_TOKEN`, `SC_SUPABASE_PROJECT_REF`, `simplelogin_api_key`. These should only be used by dedicated server operations, never sent to an AI provider.

The Admin panel shows whether a secret exists, never its value. “Configured” is not equivalent to live API health, quota or billing.

## Folder structure

```text
web/mahi-ai/              # Native assets copied from Mahi-AI/public
web/admin/                # Master Admin UI (glassmorphism, CRUD, provider config status)
supabase/functions/mahicloud-admin/index.ts
supabase/migrations/20261028170000_mahicloud_master_admin_catalog.sql
docs/MAHICLOUD_NATIVE_AI_ADMIN.md
```

## Setup checklist

1. Set `ADMIN_PIN=699360` in Supabase Function Secrets if that is the desired passcode. It is not hardcoded in source.
2. Set a random `ADMIN_SESSION_SECRET` with at least 32 characters.
3. Add the current production MahiCloud origin to `ALLOWED_ORIGINS` (comma-separated exact origins). Add local development origins only when needed.
4. Keep provider keys in Supabase Edge Function Secrets. The public `web/mahi-ai/config.js` contains only the Supabase URL and publishable key.
5. Visit `/admin/`, sign in, edit a published catalogue card, and confirm it appears on the main homepage. Then visit `/mahi-ai/` and send a test message.

## Scope

The current Master Admin manages homepage launch cards, the shared MahiFlix Websites/Apps collection, MahiFrame profile metadata, and publish/feature/order controls for stored MahiFrame videos. It reports secret presence but does not expose secret values or run billable provider probes. Physical video deletion is intentionally not exposed because it must remove the associated object-store assets as well. Mahi-AI's existing AI Control Centre continues to manage AI global instructions and provider preferences.
