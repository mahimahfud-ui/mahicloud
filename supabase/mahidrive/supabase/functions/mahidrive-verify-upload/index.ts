import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const bucket = "mahi-drive-private";
const maxBytesDefault = 50 * 1024 * 1024;
const corsHeadersBase = {
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
};

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers(corsHeadersBase);
  if (!origin) return headers;
  const allowed = env("MAHIDRIVE_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(status: number, payload: Record<string, unknown>, headers: Headers): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" ? payload : {};
  } catch (_) {
    return {};
  }
}

function sniffMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const starts = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(0, 4) === "PK\x03\x04") return "application/zip";
  if (ascii(4, 8) === "ftyp") return "video/mp4";
  if (ascii(0, 3) === "ID3" || starts(0xff, 0xfb) || starts(0xff, 0xf3)) return "audio/mpeg";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  return null;
}

async function readObjectHeader(url: string, serviceKey: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      Range: "bytes=0-63",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error("storage_read_failed");
  }

  const reader = response.body.getReader();
  try {
    const first = await reader.read();
    if (first.done || !first.value) return new Uint8Array();
    return first.value.slice(0, 64);
  } finally {
    try {
      await reader.cancel();
    } catch (_) {
      // The first range has already been read; cancellation is best effort.
    }
  }
}

async function patchFileStatus(
  supabaseUrl: string,
  serviceKey: string,
  fileId: string,
  ownerId: string,
  fromStatus: string,
  toStatus: string,
): Promise<void> {
  const query = new URLSearchParams({
    id: "eq." + fileId,
    owner_user_id: "eq." + ownerId,
    upload_status: "eq." + fromStatus,
  });
  const response = await fetch(
    supabaseUrl + "/rest/v1/files?" + query.toString(),
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        "Content-Profile": "mahidrive",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        upload_status: toStatus,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("metadata_update_failed");
  const updatedRows = await response.json().catch(() => []);
  if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
    throw new Error("metadata_update_not_applied");
  }
}

async function patchFileLifecycle(
  supabaseUrl: string,
  serviceKey: string,
  fileId: string,
  ownerId: string,
  expectedStatus: "ready" | "deleted",
  expectedDeleted: boolean,
  nextDeletedAt: string | null,
): Promise<void> {
  const query = new URLSearchParams({
    id: "eq." + fileId,
    owner_user_id: "eq." + ownerId,
    upload_status: "eq." + expectedStatus,
    deleted_at: expectedDeleted ? "not.is.null" : "is.null",
  });
  const response = await fetch(
    supabaseUrl + "/rest/v1/files?" + query.toString(),
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        "Content-Profile": "mahidrive",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        deleted_at: nextDeletedAt,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("metadata_lifecycle_update_failed");
  const updatedRows = await response.json().catch(() => []);
  if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
    throw new Error("metadata_lifecycle_update_not_applied");
  }
}

async function findStoredObject(
  supabaseUrl: string,
  serviceKey: string,
  fileId: string,
): Promise<Record<string, unknown> | null> {
  const prefix = "library/" + fileId;
  const response = await fetch(
    supabaseUrl + "/storage/v1/object/list/" + bucket,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit: 20,
        offset: 0,
        search: "original",
      }),
    },
  );
  if (!response.ok) throw new Error("storage_list_failed");
  const objects = await response.json().catch(() => []);
  if (!Array.isArray(objects)) throw new Error("storage_list_invalid");
  const object = objects.find((item) =>
    item?.name === "original"
  );
  return object && typeof object === "object" ? object : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (origin && !headers.has("Access-Control-Allow-Origin")) {
      return json(403, { error: "Origin not allowed." }, headers);
    }
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, headers);
  }
  if (origin && !headers.has("Access-Control-Allow-Origin")) {
    return json(403, { error: "Origin not allowed." }, headers);
  }

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  const ownerId = env("MAHIDRIVE_OWNER_USER_ID").toLowerCase();
  if (!supabaseUrl || !anonKey || !serviceKey || !isUuid(ownerId)) {
    return json(503, { error: "MahiDrive verification is not configured." }, headers);
  }

  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization) || authorization.length > 9000) {
    return json(401, { error: "Authentication required." }, headers);
  }

  let userResponse: Response;
  try {
    userResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: authorization },
    });
  } catch (_) {
    return json(502, { error: "Authentication service unavailable." }, headers);
  }
  if (!userResponse.ok) return json(401, { error: "Invalid owner session." }, headers);

  const user = await userResponse.json().catch(() => null);
  const appMetadata = user?.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata
    : {};
  if (
    !user ||
    String(user.id || "").toLowerCase() !== ownerId ||
    user.is_anonymous === true ||
    !(user.email_confirmed_at || user.confirmed_at) ||
    appMetadata.mahidrive_owner !== true
  ) {
    return json(403, { error: "This identity is not authorized for MahiDrive." }, headers);
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const claims = jwtClaims(token);
  if (
    String(claims.sub || "").toLowerCase() !== ownerId ||
    claims.role !== "authenticated"
  ) {
    return json(401, { error: "Invalid owner session." }, headers);
  }
  if (claims.aal !== "aal2") {
    return json(403, { error: "Two-step verification is required." }, headers);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 4096) return json(413, { error: "Request too large." }, headers);
  const payload = await req.json().catch(() => null);
  const fileId = payload?.file_id;
  if (!isUuid(fileId)) return json(400, { error: "Invalid file reference." }, headers);
  const action = payload?.action || "verify";
  if (action !== "verify" && action !== "cancel" && action !== "fail" && action !== "delete" && action !== "restore") {
    return json(400, { error: "Unsupported upload action." }, headers);
  }

  let maximum = maxBytesDefault;
  const configuredMaximum = Number(env("MAHIDRIVE_MAX_FILE_BYTES"));
  if (Number.isSafeInteger(configuredMaximum) && configuredMaximum > 0) {
    maximum = Math.min(configuredMaximum, maxBytesDefault);
  }

  const fileQuery = new URLSearchParams({
    select: "id,owner_user_id,storage_key,mime_type,size_bytes,upload_status,deleted_at",
    id: "eq." + fileId,
    owner_user_id: "eq." + ownerId,
    limit: "1",
  });
  let fileResponse: Response;
  try {
    fileResponse = await fetch(supabaseUrl + "/rest/v1/files?" + fileQuery.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Accept-Profile": "mahidrive",
      },
    });
  } catch (_) {
    return json(502, { error: "File verification service unavailable." }, headers);
  }
  if (!fileResponse.ok) return json(502, { error: "File record could not be checked." }, headers);
  const rows = await fileResponse.json().catch(() => []);
  const file = Array.isArray(rows) ? rows[0] : null;
  if (!file) return json(404, { error: "File record not found." }, headers);
  if (action === "cancel" || action === "fail") {
    if (file.upload_status !== "uploading") {
      return json(409, { error: "Upload is no longer active." }, headers);
    }
    try {
      await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "failed");
    } catch (_) {
      return json(502, { error: "Upload state could not be updated." }, headers);
    }
    return json(200, { failed: true, status: "failed" }, headers);
  }

  if (action === "delete") {
    if (file.deleted_at || file.upload_status !== "ready") {
      return json(409, { error: "Only an active, verified file can be deleted." }, headers);
    }
    try {
      await patchFileLifecycle(supabaseUrl, serviceKey, fileId, ownerId, "ready", false, new Date().toISOString());
    } catch (_) {
      return json(502, { error: "File lifecycle could not be updated." }, headers);
    }
    return json(200, { deleted: true, status: "deleted" }, headers);
  }

  if (action === "restore") {
    if (!file.deleted_at || file.upload_status !== "deleted") {
      return json(409, { error: "File is not in Recently Deleted." }, headers);
    }
    const objectPath = String(file.storage_key || "");
    if (objectPath !== "library/" + fileId + "/original") {
      return json(409, { error: "File storage reference is invalid." }, headers);
    }
    let storedObject: Record<string, unknown> | null;
    try {
      storedObject = await findStoredObject(supabaseUrl, serviceKey, fileId);
    } catch (_) {
      return json(502, { error: "Private storage could not be checked." }, headers);
    }
    if (!storedObject) return json(409, { error: "The original private object no longer exists." }, headers);
    const storedMetadata = storedObject.metadata && typeof storedObject.metadata === "object"
      ? storedObject.metadata as Record<string, unknown>
      : {};
    const storedSize = Number(storedMetadata.size ?? storedMetadata.contentLength ?? storedObject.size);
    const expectedSize = Number(file.size_bytes);
    if (!Number.isSafeInteger(storedSize) || storedSize !== expectedSize) {
      return json(422, { error: "The original private object's size no longer matches its metadata." }, headers);
    }
    const declaredMime = String(file.mime_type || "application/octet-stream").toLowerCase();
    const storedMime = String(storedMetadata.mimetype ?? storedMetadata.contentType ?? declaredMime).toLowerCase();
    if (declaredMime !== storedMime && declaredMime !== "application/octet-stream" && storedMime !== "application/octet-stream") {
      return json(422, { error: "The original private object's MIME type no longer matches its metadata." }, headers);
    }
    try {
      const header = await readObjectHeader(
        supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath,
        serviceKey,
      );
      const detectedMime = sniffMime(header);
      const signatureCheckedTypes = new Set([
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "application/pdf", "video/mp4", "audio/mpeg", "audio/ogg", "audio/wav",
      ]);
      if (detectedMime && signatureCheckedTypes.has(declaredMime) && detectedMime !== declaredMime) {
        return json(422, { error: "The original private object's signature no longer matches its metadata." }, headers);
      }
    } catch (_) {
      return json(502, { error: "The original private object could not be inspected." }, headers);
    }
    try {
      await patchFileLifecycle(supabaseUrl, serviceKey, fileId, ownerId, "deleted", true, null);
    } catch (_) {
      return json(502, { error: "File could not be restored." }, headers);
    }
    return json(200, { restored: true, status: "ready" }, headers);
  }

  if (file.deleted_at) return json(404, { error: "File record not found." }, headers);
  if (file.upload_status === "ready") {
    return json(200, { verified: true, status: "ready" }, headers);
  }
  if (file.upload_status !== "uploading") {
    return json(409, { error: "File is not awaiting upload verification." }, headers);
  }

  const expectedSize = Number(file.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > maximum) {
    await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "failed")
      .catch(() => {});
    return json(422, { error: "File size is outside the allowed limit." }, headers);
  }

  const objectPath = String(file.storage_key || "");
  if (objectPath !== "library/" + fileId + "/original") {
    return json(409, { error: "File storage reference is invalid." }, headers);
  }
  const prefix = "library/" + fileId;
  let object: Record<string, unknown> | null;
  try {
    object = await findStoredObject(supabaseUrl, serviceKey, fileId);
  } catch (_) {
    return json(502, { error: "Storage verification service unavailable." }, headers);
  }
  if (!object) return json(409, { error: "The uploaded object is not finalized in private storage." }, headers);

  const metadata = object.metadata && typeof object.metadata === "object"
    ? object.metadata as Record<string, unknown>
    : {};
  const storedSize = Number(metadata.size ?? metadata.contentLength ?? object.size);
  const declaredMime = String(file.mime_type || "application/octet-stream").toLowerCase();
  const storedMime = String(metadata.mimetype ?? metadata.contentType ?? declaredMime).toLowerCase();

  if (!Number.isSafeInteger(storedSize) || storedSize !== expectedSize || storedSize > maximum) {
    await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "failed")
      .catch(() => {});
    return json(422, { error: "Stored object size does not match the upload record." }, headers);
  }

  const mimePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
  if (
    !mimePattern.test(declaredMime) ||
    !mimePattern.test(storedMime) ||
    (declaredMime !== storedMime &&
      declaredMime !== "application/octet-stream" &&
      storedMime !== "application/octet-stream")
  ) {
    await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "failed")
      .catch(() => {});
    return json(422, { error: "Stored MIME metadata does not match the upload record." }, headers);
  }

  const objectUrl = supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath;
  let header: Uint8Array;
  try {
    header = await readObjectHeader(objectUrl, serviceKey);
  } catch (_) {
    return json(502, { error: "Stored file could not be inspected." }, headers);
  }
  const detectedMime = sniffMime(header);
  const signatureCheckedTypes = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "video/mp4", "audio/mpeg", "audio/ogg", "audio/wav",
  ]);
  if (
    detectedMime &&
    signatureCheckedTypes.has(declaredMime) &&
    declaredMime !== detectedMime
  ) {
    await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "failed")
      .catch(() => {});
    return json(422, { error: "File signature does not match its declared MIME type." }, headers);
  }

  await patchFileStatus(supabaseUrl, serviceKey, fileId, ownerId, "uploading", "ready");
  console.info(JSON.stringify({
    event: "mahidrive_upload_verified",
    file_id: fileId,
    size_bytes: expectedSize,
    detected_mime: detectedMime || "unclassified",
  }));
  return json(200, { verified: true, status: "ready" }, headers);
});
