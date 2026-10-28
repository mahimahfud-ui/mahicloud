import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const APP_NAME = "mahicloud-admin";
const SESSION_TTL_SECONDS = 4 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_ORIGINS = [
  "https://mahimahfud-ui.github.io",
  "https://mahi-ai.onrender.com",
  "https://mahicloud.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const TYPES = new Set(["apps", "movies", "tools", "social", "privacy", "music", "websites"]);
const ICONS = new Set(["grid", "movie", "film", "desktop", "sun", "clean", "users", "shield", "lock", "link", "music"]);

function secret(name: string): string {
  return (Deno.env.get(name) || "").trim();
}
function allowedOrigins(): Set<string> {
  const configured = secret("ALLOWED_ORIGINS").split(",").map((x) => x.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}
function isAllowedOrigin(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === value && allowedOrigins().has(value);
  } catch {
    return false;
  }
}
function responseHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  if (isAllowedOrigin(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "authorization, apikey, x-client-info, content-type";
    h["Access-Control-Expose-Headers"] = "Retry-After";
  }
  return h;
}
function json(req: Request, status: number, payload: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...responseHeaders(req.headers.get("origin")), ...extra } });
}
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const length = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > 64_000) return null;
  const text = await req.text();
  if (text.length > 64_000) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function timingSafeTextEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function serviceClient() {
  const url = secret("SUPABASE_URL");
  let key = secret("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      key = typeof keys.default === "string" ? keys.default : "";
    } catch {}
  }
  if (!url || !key) throw new Error("The server-side Supabase secret key is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function sessionSigningKey(): Promise<CryptoKey> {
  const value = secret("ADMIN_SESSION_SECRET");
  if (value.length < 32) throw new Error("ADMIN_SESSION_SECRET must be configured with at least 32 characters.");
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueSession(db: ReturnType<typeof serviceClient>): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + SESSION_TTL_SECONDS;
  const sid = crypto.randomUUID();
  const payload = base64Url(encoder.encode(JSON.stringify({ iss: APP_NAME, sid, iat: now, exp: expires })));
  const key = await sessionSigningKey();
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const token = payload + "." + base64Url(signature);
  const hash = await sha256(token);
  const { error } = await db.from("mahicloud_admin_sessions").insert({
    id: sid,
    token_hash: hash,
    expires_at: new Date(expires * 1000).toISOString()
  });
  if (error) throw new Error("Could not create the administrator session.");
  return { token, expiresAt: new Date(expires * 1000).toISOString() };
}
async function verifySession(req: Request, db: ReturnType<typeof serviceClient>): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 2_048) return false;
  const pieces = token.split(".");
  if (pieces.length !== 2) return false;
  try {
    const key = await sessionSigningKey();
    if (!await crypto.subtle.verify("HMAC", key, decodeBase64Url(pieces[1]), encoder.encode(pieces[0]))) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(pieces[0])));
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== APP_NAME || typeof payload.sid !== "string" || !Number.isFinite(payload.exp) || payload.exp <= now) return false;
    const hash = await sha256(token);
    const { data, error } = await db.from("mahicloud_admin_sessions")
      .select("id,expires_at,revoked_at")
      .eq("id", payload.sid)
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
async function clientIpHash(req: Request): Promise<string> {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] || "unknown").trim().slice(0, 160);
  return sha256(secret("ADMIN_SESSION_SECRET") + "|ip|" + ip);
}
async function enforceLoginRateLimit(req: Request, db: ReturnType<typeof serviceClient>): Promise<{ blocked: boolean; retryAfter: number }> {
  const ipHash = await clientIpHash(req);
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const { count, error } = await db.from("mahicloud_admin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", cutoff);
  if (error) throw new Error("Administrator rate limiting is not available.");
  return { blocked: (count || 0) >= MAX_FAILED_LOGINS, retryAfter: Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000)) };
}
function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function validHref(value: string): boolean {
  if (value.length > 800) return false;
  if (/^\/(?!\/)[^\s<>]*$/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
function publicHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (u.protocol !== "https:" || !host || u.username || u.password || (u.port && u.port !== "443")) return null;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host === "metadata.google.internal" || host === "169.254.169.254" ||
        /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
        host === "::1" || !host.includes(".") || host.length > 253) return null;
    return u;
  } catch { return null; }
}
function cleanJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return null;
  if (typeof value === "string") return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => cleanJsonValue(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      const safeKey = cleanText(key, 60);
      if (safeKey) output[safeKey] = cleanJsonValue(item, depth + 1);
    }
    return output;
  }
  return null;
}
function validIconUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && value.length <= 800;
  } catch {
    return false;
  }
}
function cleanItem(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const id = cleanText(row.id, 48).toLowerCase();
  const name = cleanText(row.name, 100);
  const type = cleanText(row.type, 20);
  const href = cleanText(row.href, 800);
  const subtitle = cleanText(row.subtitle, 180);
  const description = cleanText(row.description, 800);
  const iconKey = cleanText(row.icon_key, 24);
  const iconUrl = cleanText(row.icon_url, 800);
  const colorPrimary = cleanText(row.color_primary, 7);
  const colorSecondary = cleanText(row.color_secondary, 7);
  const rawPlatforms = Array.isArray(row.platforms) ? row.platforms : [];
  const platforms = [...new Set(rawPlatforms.filter((v): v is string => typeof v === "string").map((v) => cleanText(v, 32)).filter(Boolean))].slice(0, 10);
  const position = Number.isInteger(row.position) ? Number(row.position) : 100;
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id) || !name || !TYPES.has(type) || !validHref(href)) return null;
  if (!ICONS.has(iconKey || "grid") || !validIconUrl(iconUrl)) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(colorPrimary || "#e50914") || !/^#[0-9a-fA-F]{6}$/.test(colorSecondary || "#7a0309")) return null;
  if (position < 0 || position > 100000 || platforms.length === 0) return null;
  return {
    id, name, type, href, subtitle, description,
    icon_key: iconKey || "grid", icon_url: iconUrl,
    color_primary: colorPrimary || "#e50914",
    color_secondary: colorSecondary || "#7a0309",
    platforms, published: row.published === true, position
  };
}
function configured(...names: string[]): boolean {
  return names.some((name) => Boolean((Deno.env.get(name) || "").trim()));
}
function providerStatus(): Array<Record<string, unknown>> {
  const all = [
    { id: "gemini", label: "Gemini", kind: "AI provider", keys: ["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"] },
    { id: "openai", label: "OpenAI", kind: "AI provider", keys: ["OPENAI_API_KEY"] },
    { id: "groq", label: "Groq", kind: "AI provider", keys: ["GROQ_API_KEY"] },
    { id: "openrouter", label: "OpenRouter", kind: "AI provider", keys: ["OPENROUTER_API_KEY"] },
    { id: "deepseek", label: "DeepSeek", kind: "AI provider", keys: ["DEEPSEEK_API_KEY", "DeepSeek"] },
    { id: "nvidia", label: "NVIDIA", kind: "AI provider", keys: ["NVIDIA_API_KEY"] },
    { id: "mistral", label: "Mistral", kind: "AI provider", keys: ["MISTRAL_API_KEY"] },
    { id: "anthropic", label: "Anthropic", kind: "AI provider", keys: ["ANTHROPIC_API_KEY"] },
    { id: "venice", label: "Venice", kind: "AI provider", keys: ["VENICE_API_KEY", "VENICEAI_API_KEY", "VENICE", "Venice AI"] },
    { id: "cloudflare", label: "Cloudflare AI", kind: "AI provider", keys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "Cloudflare"] },
    { id: "shannon", label: "Shannon AI", kind: "AI provider", keys: ["SHANNON_API_KEY", "SHANNONAI_API_KEY", "SHANNON_AI_API_KEY", "Shannon AI"] },
    { id: "omdb", label: "OMDb metadata", kind: "Metadata API", keys: ["OMDB_API_KEY"] },
    { id: "cloudflare-account", label: "Cloudflare account ID", kind: "Configuration", keys: ["CLOUDFLARE_ACCOUNT_ID", "Cloudflare Account ID"] },
    { id: "github", label: "GitHub integration", kind: "Privileged integration", keys: ["GITHUB_TOKEN", "MAHI_AI_GITHUB_TOKEN"] },
    { id: "admin", label: "Admin PIN", kind: "Admin security", keys: ["ADMIN_PIN"] },
    { id: "admin-session", label: "Admin session signing secret", kind: "Admin security", keys: ["ADMIN_SESSION_SECRET"] },
    { id: "origins", label: "Allowed website origins", kind: "CORS configuration", keys: ["ALLOWED_ORIGINS"] },
    { id: "origins", label: "Allowed website origins", kind: "CORS configuration", keys: ["ALLOWED_ORIGINS"] },
    { id: "supabase-management", label: "Supabase management API", kind: "Privileged integration", keys: ["SC_SUPABASE_MANAGEMENT_TOKEN"] },
    { id: "supabase-project", label: "Supabase project reference", kind: "Configuration", keys: ["SC_SUPABASE_PROJECT_REF"] },
    { id: "simplelogin", label: "SimpleLogin integration", kind: "Privileged integration", keys: ["simplelogin_api_key", "SIMPLELOGIN_API_KEY"] }
  ];
  return all.map((item) => ({ id: item.id, label: item.label, kind: item.kind, configured: configured(...item.keys) }));
}
type ResponsePayload = Record<string, unknown>;
async function publicItems(db: ReturnType<typeof serviceClient>): Promise<ResponsePayload> {
  const { data, error } = await db.from("mahicloud_catalog_items")
    .select("id,name,type,href,subtitle,description,icon_key,icon_url,color_primary,color_secondary,platforms,published,position")
    .eq("published", true).order("position", { ascending: true }).order("name", { ascending: true }).limit(500);
  if (error) throw new Error("Could not load the public catalogue.");
  return { items: data || [] };
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) return json(req, 403, { error: "Origin is not allowed." });
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." }, { "Allow": "POST, OPTIONS" });
  if (!isAllowedOrigin(origin)) return json(req, 403, { error: "Origin is not allowed. Add the MahiCloud website origin to ALLOWED_ORIGINS." });
  const body = await readBody(req);
  if (!body) return json(req, 400, { error: "Invalid request body." });
  const action = typeof body.action === "string" ? body.action : "";
  try {
    const db = serviceClient();
    if (action === "public-items") {
      const result = await publicItems(db);
      return json(req, 200, result);
    }
    if (action === "login") {
      const expectedPin = secret("ADMIN_PIN");
      if (!expectedPin || secret("ADMIN_SESSION_SECRET").length < 32) {
        return json(req, 503, { error: "Admin sign-in is not configured. Set ADMIN_PIN and a 32-character ADMIN_SESSION_SECRET in Supabase Function Secrets." });
      }
      const rate = await enforceLoginRateLimit(req, db);
      if (rate.blocked) return json(req, 429, { error: "Too many attempts. Try again later." }, { "Retry-After": String(rate.retryAfter) });
      const pin = typeof body.pin === "string" ? body.pin : "";
      if (!await timingSafeTextEqual(pin, expectedPin)) {
        const ipHash = await clientIpHash(req);
        const { error } = await db.from("mahicloud_admin_attempts").insert({ ip_hash: ipHash });
        if (error) return json(req, 503, { error: "Admin rate limiting is not available." });
        await new Promise((resolve) => setTimeout(resolve, 250));
        return json(req, 401, { error: "Incorrect passcode." });
      }
      const ipHash = await clientIpHash(req);
      await db.from("mahicloud_admin_attempts").delete().eq("ip_hash", ipHash);
      const session = await issueSession(db);
      return json(req, 200, { ok: true, session: session.token, expiresAt: session.expiresAt, expiresIn: SESSION_TTL_SECONDS });
    }
    if (action === "logout") {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        await db.from("mahicloud_admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", await sha256(token)).is("revoked_at", null);
      }
      return json(req, 200, { ok: true });
    }
    if (!await verifySession(req, db)) return json(req, 401, { error: "Admin session expired. Sign in again." });
    if (action === "overview") {
      const [itemsResult, attemptsResult, sessionsResult] = await Promise.all([
        db.from("mahicloud_catalog_items").select("id,published", { count: "exact" }).limit(500),
        db.from("mahicloud_admin_attempts").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        db.from("mahicloud_admin_sessions").select("id", { count: "exact", head: true }).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      ]);
      if (itemsResult.error) return json(req, 500, { error: "Could not load the admin overview." });
      const rows = itemsResult.data || [];
      return json(req, 200, {
        counts: {
          total: itemsResult.count ?? rows.length,
          published: rows.filter((x) => x.published).length,
          drafts: rows.filter((x) => !x.published).length
        },
        failedLogins24h: attemptsResult.count ?? 0,
        activeSessions: sessionsResult.count ?? 0
      });
    }
    if (action === "catalog-list") {
      const { data, error } = await db.from("mahicloud_catalog_items").select("*")
        .order("position", { ascending: true }).order("name", { ascending: true }).limit(500);
      if (error) return json(req, 500, { error: "Could not load catalogue items." });
      return json(req, 200, { items: data || [] });
    }
    if (action === "catalog-save") {
      const item = cleanItem(body.item);
      if (!item) return json(req, 422, { error: "The item is invalid. Check its ID, type, URL, colors, icon and platform fields." });
      const { data, error } = await db.from("mahicloud_catalog_items").upsert({
        ...item,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" }).select("*").single();
      if (error) return json(req, 500, { error: "Could not save the catalogue item." });
      return json(req, 200, { ok: true, item: data });
    }
    if (action === "catalog-delete") {
      const id = cleanText(body.id, 48).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) return json(req, 422, { error: "Invalid catalogue item ID." });
      const { error } = await db.from("mahicloud_catalog_items").delete().eq("id", id);
      if (error) return json(req, 500, { error: "Could not delete the catalogue item." });
      return json(req, 200, { ok: true, id });
    }
    if (action === "mahiflix-list") {
      const { data, error } = await db.from("mahiflix_entries")
        .select("id,kind,name,url,domain,description,created_at")
        .order("created_at", { ascending: false }).limit(500);
      if (error) return json(req, 500, { error: "Could not load MahiFlix entries." });
      return json(req, 200, { entries: data || [] });
    }
    if (action === "mahiflix-save") {
      const raw = body.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? body.entry as Record<string, unknown> : {};
      const id = cleanText(raw.id, 36);
      const kind = raw.kind === "apps" ? "apps" : raw.kind === "sites" ? "sites" : "";
      const name = cleanText(raw.name, 80);
      const description = cleanText(raw.description, 180);
      const url = publicHttpsUrl(raw.url);
      if (id && !UUID.test(id)) return json(req, 422, { error: "Invalid MahiFlix entry ID." });
      if (!kind || !name || !url) return json(req, 422, { error: "Choose Websites or Apps and enter a name and public HTTPS URL." });
      const normalizedUrl = url.href;
      const { data: existing, error: duplicateError } = await db.from("mahiflix_entries")
        .select("id,name,url").eq("kind", kind).limit(1000);
      if (duplicateError) return json(req, 500, { error: "Could not validate this MahiFlix entry." });
      const duplicate = (existing || []).some((row) =>
        String(row.id) !== id &&
        (String(row.name || "").trim().toLowerCase() === name.toLowerCase() ||
         String(row.url || "").replace(/\/$/, "").toLowerCase() === normalizedUrl.replace(/\/$/, "").toLowerCase()));
      if (duplicate) return json(req, 409, { error: "A MahiFlix entry with that name or URL already exists." });
      const recordId = id || crypto.randomUUID();
      const { data, error } = await db.from("mahiflix_entries").upsert({
        id: recordId,
        kind,
        name,
        url: normalizedUrl,
        domain: url.hostname.toLowerCase().replace(/\.$/, ""),
        description,
        source_ip_hash: await sha256(APP_NAME + "|admin-entry|" + recordId)
      }, { onConflict: "id" }).select("id,kind,name,url,domain,description,created_at").single();
      if (error) return json(req, 500, { error: "Could not save this MahiFlix entry." });
      return json(req, 200, { ok: true, entry: data });
    }
    if (action === "mahiflix-delete") {
      const id = cleanText(body.id, 36);
      if (!UUID.test(id)) return json(req, 422, { error: "Invalid MahiFlix entry ID." });
      const { error } = await db.from("mahiflix_entries").delete().eq("id", id);
      if (error) return json(req, 500, { error: "Could not delete this MahiFlix entry." });
      return json(req, 200, { ok: true, id });
    }
    if (action === "mframe-profile-get") {
      const { data, error } = await db.from("mf_profile").select("*").eq("id", 1).maybeSingle();
      if (error) return json(req, 500, { error: "Could not load the MahiFrame profile." });
      return json(req, 200, { profile: data || null });
    }
    if (action === "mframe-profile-save") {
      const raw = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
        ? body.profile as Record<string, unknown> : {};
      const name = cleanText(raw.name, 100) || "MahiFrame";
      const handle = cleanText(raw.handle, 40);
      const bio = cleanText(raw.bio, 600);
      const avatarUrl = cleanText(raw.avatar_url, 800);
      const location = cleanText(raw.location, 120);
      const socials = cleanJsonValue(raw.socials ?? []) as unknown[];
      const categories = cleanJsonValue(raw.categories ?? []) as unknown[];
      const verified = raw.verified === true;
      if (!/^@?[a-zA-Z0-9_.-]{1,32}$/.test(handle)) return json(req, 422, { error: "The profile handle can contain letters, numbers, dots, underscores and hyphens." });
      if (avatarUrl && !validIconUrl(avatarUrl)) return json(req, 422, { error: "The avatar URL must be HTTPS." });
      if (!Array.isArray(socials) || !Array.isArray(categories)) return json(req, 422, { error: "Social links and categories must be JSON arrays." });
      const serializedSize = JSON.stringify({ socials, categories }).length;
      if (serializedSize > 24_000) return json(req, 422, { error: "Social links and categories are too large." });
      const { data, error } = await db.from("mf_profile").upsert({
        id: 1, name, handle, bio, avatar_url: avatarUrl, location, socials, categories, verified, updated_at: new Date().toISOString()
      }, { onConflict: "id" }).select("*").single();
      if (error) return json(req, 500, { error: "Could not save the MahiFrame profile." });
      return json(req, 200, { ok: true, profile: data });
    }
    if (action === "mframe-videos-list") {
      const { data, error } = await db.from("mf_videos")
        .select("id,title,description,category,mime,size,width,height,duration,status,published,featured,position,created_at,updated_at")
        .order("position", { ascending: true }).order("created_at", { ascending: false }).limit(500);
      if (error) return json(req, 500, { error: "Could not load MahiFrame videos." });
      return json(req, 200, { videos: data || [] });
    }
    if (action === "mframe-video-update") {
      const id = cleanText(body.id, 36);
      if (!UUID.test(id)) return json(req, 422, { error: "Invalid video ID." });
      const { data: existing, error: readError } = await db.from("mf_videos")
        .select("id,status,published,featured,position,title,description,category")
        .eq("id", id).maybeSingle();
      if (readError || !existing) return json(req, 404, { error: "MahiFrame video not found." });
      const nextPublished = typeof body.published === "boolean" ? body.published : existing.published;
      if (nextPublished && existing.status !== "ready") return json(req, 422, { error: "Only a ready video can be published." });
      const title = body.title === undefined ? existing.title : cleanText(body.title, 120);
      const description = body.description === undefined ? existing.description : cleanText(body.description, 2000);
      const category = body.category === undefined ? existing.category : cleanText(body.category, 80);
      const position = body.position === undefined ? existing.position : Number(body.position);
      if (!title || !Number.isInteger(position) || position < 0 || position > 100000) {
        return json(req, 422, { error: "The video title or display position is invalid." });
      }
      const { data, error } = await db.from("mf_videos").update({
        title, description, category, position,
        published: nextPublished,
        featured: typeof body.featured === "boolean" ? body.featured : existing.featured,
        updated_at: new Date().toISOString()
      }).eq("id", id).select("id,title,description,category,status,published,featured,position,updated_at").single();
      if (error) return json(req, 500, { error: "Could not update the MahiFrame video." });
      return json(req, 200, { ok: true, video: data });
    }
    if (action === "provider-status") {
      return json(req, 200, { providers: providerStatus(), checkedAt: new Date().toISOString(), note: "Configured indicates a server-side secret exists; it does not claim the provider endpoint, quota or billing is healthy." });
    }
    return json(req, 400, { error: "Unknown action." });
  } catch (error) {
    console.error(JSON.stringify({
      service: APP_NAME,
      level: "error",
      event: "request_failed",
      action,
      error: error instanceof Error ? error.message.slice(0, 200) : "Unknown error"
    }));
    return json(req, 500, { error: "The admin service could not complete the request. Try again." });
  }
});
