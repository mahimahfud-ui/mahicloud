import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import * as tus from "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm";

const API = "/api/mahidrive";
const BUCKET = "mahi-drive-private";
const MAX_NAME_LENGTH = 255;
const TusUpload = tus.Upload;

const state = {
  client: null,
  pendingMfa: null,
  db: null,
  user: null,
  config: null,
  view: "files",
  currentFolderId: null,
  folders: [],
  files: [],
  activeUploads: new Map(),
  cancelledUploads: new Set(),
  previewUrl: null,
  searchTimer: null,
  query: "",
};

const $ = (id) => document.getElementById(id);

function bytesLabel(bytes) {
  const amount = Number(bytes) || 0;
  if (amount < 1024) return amount + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = amount / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return value.toFixed(value >= 100 ? 0 : 1) + " " + units[index];
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric",
  }).format(date);
}

function safeFileName(value) {
  const name = String(value || "").normalize("NFC").trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[/\\\u0000-\u001f\u007f]/.test(name)) return null;
  if (name === "." || name === "..") return null;
  return name;
}

function mimeLabel(type, name) {
  if (type) {
    const parts = type.split("/");
    return (parts[1] || parts[0] || "File").toUpperCase().slice(0, 12);
  }
  const extension = String(name || "").split(".").pop();
  return extension && extension !== name ? extension.toUpperCase().slice(0, 10) : "FILE";
}

function fileGlyph(type) {
  if (type?.startsWith("image/")) return "▧";
  if (type?.startsWith("video/")) return "▶";
  if (type?.startsWith("audio/")) return "♫";
  if (type === "application/pdf") return "PDF";
  if (type?.includes("spreadsheet")) return "▦";
  if (type?.includes("document") || type?.includes("word")) return "D";
  if (type?.includes("zip") || type?.includes("compressed")) return "▤";
  return "▧";
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = "toast " + type;
  item.textContent = String(message || "Something went wrong.");
  $("toastRegion").append(item);
  window.setTimeout(() => item.remove(), 3400);
}

function showLogin(message = "") {
  state.pendingMfa = null;
  $("appShell").hidden = true;
  $("loginScreen").hidden = false;
  $("mfaPanel").hidden = true;
  $("loginEmailLabel").hidden = false;
  $("loginEmail").hidden = false;
  $("loginPasswordLabel").hidden = false;
  $("loginPassword").hidden = false;
  $("loginButton").hidden = false;
  $("loginError").textContent = message;
  $("mfaError").textContent = "";
  $("loginMfaCode").value = "";
  $("loginButton").disabled = false;
  $("loginButton").querySelector("span").textContent = "Unlock MahiDrive";
}

function showApp() {
  $("loginScreen").hidden = true;
  $("appShell").hidden = false;
  $("accountLabel").textContent = state.user?.email || "Owner";
}

async function requestOwnerCheck() {
  const { data: { session }, error: sessionError } = await state.client.auth.getSession();
  if (sessionError || !session?.access_token) return false;

  const { data: { user }, error: userError } = await state.client.auth.getUser();
  if (userError || !user || user.is_anonymous === true) return false;

  const response = await fetch(API + "/session", {
    method: "GET",
    headers: { Authorization: "Bearer " + session.access_token },
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) return false;
  if (response.status === 403) {
    const result = await response.json().catch(() => ({}));
    if (result.mfa_required === true) {
      state.user = user;
      return "mfa_required";
    }
    return false;
  }
  if (!response.ok) throw new Error("Owner verification is temporarily unavailable.");
  const result = await response.json();
  if (result.authenticated !== true) return false;
  state.user = user;
  return true;
}

async function startOwnerMfaChallenge() {
  $("appShell").hidden = true;
  $("loginScreen").hidden = false;
  const { data, error } = await state.client.auth.mfa.listFactors();
  if (error) throw new Error("The owner authenticator could not be checked.");
  const factor = (data?.totp || []).find((item) => item.status === "verified");
  if (!factor) {
    await state.client.auth.signOut({ scope: "global" }).catch(() => {});
    state.pendingMfa = null;
    showLogin("A verified TOTP authenticator must be enrolled on the owner account before MahiDrive can be unlocked.");
    return false;
  }

  const { data: challenge, error: challengeError } = await state.client.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge?.id) {
    throw new Error("MahiDrive could not start two-step verification. Try again.");
  }

  state.pendingMfa = { factorId: factor.id, challengeId: challenge.id };
  $("loginEmailLabel").hidden = true;
  $("loginEmail").hidden = true;
  $("loginPasswordLabel").hidden = true;
  $("loginPassword").hidden = true;
  $("loginButton").hidden = true;
  $("mfaPanel").hidden = false;
  $("loginError").textContent = "";
  $("mfaError").textContent = "";
  $("loginMfaCode").value = "";
  $("loginMfaCode").focus();
  return true;
}

async function verifyOwnerMfa() {
  const code = $("loginMfaCode").value.trim();
  if (!/^\d{6}$/.test(code) || !state.pendingMfa) {
    $("mfaError").textContent = "Enter the current 6-digit authenticator code.";
    return;
  }
  $("verifyMfaButton").disabled = true;
  $("verifyMfaButton").querySelector("span").textContent = "Verifying…";
  $("mfaError").textContent = "";
  try {
    const { error } = await state.client.auth.mfa.verify({
      factorId: state.pendingMfa.factorId,
      challengeId: state.pendingMfa.challengeId,
      code,
    });
    if (error) throw new Error("The authenticator code was not accepted.");

    const { data: assurance, error: assuranceError } =
      await state.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      throw new Error("Two-step verification did not reach the required security level.");
    }

    const valid = await requestOwnerCheck();
    if (valid !== true) throw new Error("The owner session could not be authorized after verification.");
    state.pendingMfa = null;
    $("mfaPanel").hidden = true;
    $("loginForm").reset();
    showApp();
    await loadWorkspace();
  } catch (error) {
    $("mfaError").textContent = error.message || "Two-step verification failed. Try again.";
    $("loginMfaCode").value = "";
    $("loginMfaCode").focus();
  } finally {
    $("verifyMfaButton").disabled = false;
    $("verifyMfaButton").querySelector("span").textContent = "Verify and unlock";
  }
}

function resetLoginToPassword() {
  state.pendingMfa = null;
  if (state.client) state.client.auth.signOut({ scope: "global" }).catch(() => {});
  $("mfaPanel").hidden = true;
  $("loginEmailLabel").hidden = false;
  $("loginEmail").hidden = false;
  $("loginPasswordLabel").hidden = false;
  $("loginPassword").hidden = false;
  $("loginButton").hidden = false;
  $("loginError").textContent = "";
  $("loginMfaCode").value = "";
  $("loginEmail").focus();
}

async function boot() {
  try {
    const response = await fetch(API + "/config", { cache: "no-store" });
    if (!response.ok) {
      $("setupNotice").hidden = false;
      $("loginButton").disabled = true;
      $("loginButton").querySelector("span").textContent = "Not configured";
      return;
    }
    const config = await response.json();
    if (!config.ready || !config.supabaseUrl || !config.publishableKey) {
      $("setupNotice").hidden = false;
      $("loginButton").disabled = true;
      $("loginButton").querySelector("span").textContent = "Not configured";
      return;
    }

    state.config = config;
    state.client = createClient(config.supabaseUrl, config.publishableKey, {
      db: { schema: "mahidrive" },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storage: window.sessionStorage,
        storageKey: "mahidrive-owner-session-v1",
      },
    });
    state.db = state.client.schema("mahidrive");

    const { data: { session } } = await state.client.auth.getSession();
    if (!session) {
      showLogin();
      return;
    }
    const valid = await requestOwnerCheck();
    if (valid === "mfa_required") {
      await startOwnerMfaChallenge();
      return;
    }
    if (valid !== true) {
      await state.client.auth.signOut({ scope: "global" });
      showLogin("This session is not authorized for MahiDrive. Sign in with the verified owner account.");
      return;
    }
    showApp();
    await loadWorkspace();
  } catch (error) {
    showLogin("MahiDrive could not verify the owner session. Please try again.");
  }
}

async function login(event) {
  event.preventDefault();
  $("loginError").textContent = "";
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if (!email || !password) return;
  $("loginButton").disabled = true;
  $("loginButton").querySelector("span").textContent = "Verifying…";

  try {
    const response = await fetch(API + "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MahiDrive-Intent": "1",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ email, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      $("loginError").textContent = result.error || "Sign-in failed. Please try again.";
      $("loginButton").disabled = false;
      $("loginButton").querySelector("span").textContent = "Unlock MahiDrive";
      return;
    }

    const { error } = await state.client.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    if (error) throw error;

    const valid = await requestOwnerCheck();
    if (valid === "mfa_required") {
      await startOwnerMfaChallenge();
      return;
    }
    if (valid !== true) {
      await state.client.auth.signOut({ scope: "global" });
      showLogin("This account is not authorized for MahiDrive.");
      return;
    }
    $("loginForm").reset();
    showApp();
    await loadWorkspace();
  } catch (error) {
    $("loginError").textContent = "Unable to complete sign-in. Check your connection and try again.";
    $("loginButton").disabled = false;
    $("loginButton").querySelector("span").textContent = "Unlock MahiDrive";
  }
}

async function signOut() {
  try {
    for (const [fileId, upload] of state.activeUploads.entries()) {
      state.cancelledUploads.add(fileId);
      try { await upload.abort(); } catch (_) {}
      await markUploadFailed(fileId, "cancel");
    }
    state.activeUploads.clear();
    updateUploadPanelCount();
    clearPreview();
    if (state.client) await state.client.auth.signOut({ scope: "global" });
  } finally {
    state.user = null;
    state.files = [];
    state.folders = [];
    showLogin();
  }
}

function storagePath(file) {
  // The key is generated by Postgres from the random file UUID and is immutable.
  return typeof file?.storage_key === "string" ? file.storage_key : "";
}

async function loadFolders() {
  const { data, error } = await state.db.from("folders")
    .select("id,name,parent_id,created_at,updated_at")
    .order("name", { ascending: true })
    .limit(2000);
  if (error) throw error;
  state.folders = data || [];
}

async function loadFiles() {
  let query = state.db.from("files")
    .select("id,storage_key,name,mime_type,size_bytes,upload_status,folder_id,created_at,updated_at,deleted_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (state.view === "trash") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (state.query) {
    query = query.ilike("name", "%" + state.query.replace(/[%*,]/g, " ") + "%");
  } else if (state.view === "files") {
    query = state.currentFolderId
      ? query.eq("folder_id", state.currentFolderId)
      : query.is("folder_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  state.files = data || [];
}

async function loadStorageUsage() {
  let offset = 0;
  let total = 0;
  let count = 0;
  while (true) {
    const { data, error } = await state.db.from("files")
      .select("size_bytes")
      .is("deleted_at", null)
      .eq("upload_status", "ready")
      .range(offset, offset + 999);
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      total += Number(row.size_bytes) || 0;
      count += 1;
    }
    if (rows.length < 1000) break;
    offset += 1000;
    if (offset >= 100000) break;
  }
  $("storageUsed").textContent = bytesLabel(total);
  $("storageCount").textContent = count + (count === 1 ? " stored file" : " stored files");
  $("storageCapacityNote").textContent = "Private bucket · Total from verified files";
}

async function loadWorkspace() {
  $("fileList").innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Loading your files…</span></div>';
  try {
    await loadFolders();
    await loadFiles();
    renderWorkspace();
    loadStorageUsage().catch(() => {
      $("storageUsed").textContent = "—";
      $("storageCount").textContent = "Usage unavailable";
    });
  } catch (error) {
    $("fileList").innerHTML = "";
    $("emptyState").hidden = false;
    $("emptyTitle").textContent = "Your files could not be loaded";
    $("emptyText").textContent = "Check the database schema and owner access policies, then try again.";
    $("emptyUploadButton").hidden = true;
    toast("Could not load the private library. Check project setup and RLS.", "error");
  }
}

function renderWorkspace() {
  const isTrash = state.view === "trash";
  $("pageTitle").textContent = isTrash ? "Recently deleted" : (state.query ? "Search results" : currentFolderName());
  $("pageSubtitle").textContent = isTrash
    ? "Deleted files remain recoverable until a later retention policy is applied."
    : "Everything in your personal cloud, in one place.";
  $("filesHeading").textContent = isTrash ? "Deleted files" : "Files";
  $("folderSection").hidden = isTrash || Boolean(state.query);
  $("newFolderButton").hidden = isTrash || Boolean(state.query);
  $("breadcrumbs").replaceChildren();
  if (isTrash) {
    const label = document.createElement("span");
    label.textContent = "Recently deleted";
    $("breadcrumbs").append(label);
  } else {
    renderBreadcrumbs();
  }

  renderFolders();
  renderFiles();
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function currentFolderName() {
  if (!state.currentFolderId) return "My files";
  return state.folders.find((folder) => folder.id === state.currentFolderId)?.name || "My files";
}

function renderBreadcrumbs() {
  const root = document.createElement("button");
  root.type = "button";
  root.textContent = "My files";
  root.addEventListener("click", () => navigateFolder(null));
  $("breadcrumbs").append(root);

  const chain = [];
  let folderId = state.currentFolderId;
  const seen = new Set();
  while (folderId && !seen.has(folderId)) {
    seen.add(folderId);
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder) break;
    chain.unshift(folder);
    folderId = folder.parent_id;
  }
  for (const folder of chain) {
    const separator = document.createElement("span");
    separator.textContent = "›";
    $("breadcrumbs").append(separator);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = folder.name;
    button.addEventListener("click", () => navigateFolder(folder.id));
    $("breadcrumbs").append(button);
  }
}

function renderFolders() {
  const grid = $("folderGrid");
  grid.replaceChildren();
  const folders = state.folders.filter((folder) => folder.parent_id === state.currentFolderId);
  $("folderCount").textContent = folders.length ? String(folders.length) : "";
  for (const folder of folders) {
    const button = document.createElement("button");
    button.className = "folder-card";
    button.type = "button";
    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.textContent = "▰";
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = folder.name;
    const meta = document.createElement("small");
    const itemCount = state.files.filter((file) => file.folder_id === folder.id).length;
    meta.textContent = "Open folder";
    details.append(name, meta);
    button.append(icon, details);
    button.addEventListener("click", () => navigateFolder(folder.id));
    grid.append(button);
  }
}

function renderFiles() {
  const list = $("fileList");
  list.replaceChildren();
  $("fileCount").textContent = state.files.length ? String(state.files.length) : "";
  if (!state.files.length) {
    $("emptyState").hidden = false;
    $("emptyUploadButton").hidden = state.view === "trash";
    if (state.view === "trash") {
      $("emptyTitle").textContent = "Nothing in Recently Deleted";
      $("emptyText").textContent = "Files you delete will appear here while they are recoverable.";
    } else if (state.query) {
      $("emptyTitle").textContent = "No matching files";
      $("emptyText").textContent = "Try another file name or clear your search.";
    } else {
      $("emptyTitle").textContent = "Your library is ready";
      $("emptyText").textContent = "Upload a file or create a folder to get started.";
    }
    return;
  }
  $("emptyState").hidden = true;

  for (const file of state.files) {
    const row = document.createElement("article");
    row.className = "file-row";
    const nameCell = document.createElement("div");
    nameCell.className = "file-name-cell";
    const icon = document.createElement("span");
    icon.className = "file-type-icon";
    icon.textContent = fileGlyph(file.mime_type);
    const text = document.createElement("span");
    text.className = "file-name-text";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const status = document.createElement("small");
    status.className = "file-status " + (file.upload_status || "");
    status.textContent = file.upload_status === "ready" ? "Stored privately" : (file.upload_status || "Unknown");
    text.append(name, status);
    nameCell.append(icon, text);

    const type = document.createElement("span");
    type.className = "file-type-cell";
    type.textContent = mimeLabel(file.mime_type, file.name);
    const size = document.createElement("span");
    size.className = "file-size-cell";
    size.textContent = bytesLabel(file.size_bytes);
    const date = document.createElement("span");
    date.className = "file-date-cell";
    date.textContent = dateLabel(file.updated_at);

    const actions = document.createElement("div");
    actions.className = "file-actions";
    if (state.view === "trash") {
      actions.append(actionButton("↶", "Restore file", () => restoreFile(file)));
    } else {
      if (file.upload_status === "ready") {
        actions.append(actionButton("↗", "Preview file", () => previewFile(file)));
        actions.append(actionButton("↓", "Download file", () => downloadFile(file)));
        actions.append(actionButton("✎", "Rename file", () => renameFile(file)));
        actions.append(actionButton("⇢", "Move file", () => openMoveDialog(file)));
        actions.append(actionButton("×", "Delete file", () => deleteFile(file), true));
      } else if (file.upload_status === "uploading") {
        actions.append(actionButton("↻", "Retry upload verification", () => retryUploadVerification(file)));
      }
    }
    row.append(nameCell, type, size, date, actions);
    list.append(row);
  }
}

function actionButton(label, title, onClick, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-action";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  if (danger) button.style.color = "#f08080";
  button.addEventListener("click", onClick);
  return button;
}

async function retryUploadVerification(file) {
  try {
    await verifyUpload(file.id);
    toast("Upload verified and available in your private library.", "success");
    await loadWorkspace();
  } catch (error) {
    toast("Storage has not confirmed this upload yet. You can retry verification.", "error");
  }
}

async function navigateFolder(folderId) {
  state.currentFolderId = folderId;
  state.view = "files";
  state.query = "";
  $("fileSearch").value = "";
  await loadFiles();
  renderWorkspace();
}

async function createFolder(event) {
  event.preventDefault();
  const name = safeFileName($("folderName").value);
  if (!name) {
    $("folderError").textContent = "Enter a valid folder name without path separators.";
    return;
  }
  $("createFolderSubmit").disabled = true;
  const { error } = await state.db.from("folders").insert({
    parent_id: state.currentFolderId,
    name,
  });
  $("createFolderSubmit").disabled = false;
  if (error) {
    $("folderError").textContent = "Folder could not be created. Check the name and owner permissions.";
    return;
  }
  $("folderDialog").close();
  $("folderForm").reset();
  await loadWorkspace();
  toast("Folder created.", "success");
}

function openMoveDialog(file) {
  $("moveFileId").value = file.id;
  $("moveFolderSelect").replaceChildren();
  const root = document.createElement("option");
  root.value = "";
  root.textContent = "My files (root)";
  $("moveFolderSelect").append(root);
  for (const folder of state.folders) {
    if (folder.id === file.folder_id) continue;
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    $("moveFolderSelect").append(option);
  }
  $("moveFolderSelect").value = file.folder_id || "";
  $("moveDialog").showModal();
}

async function moveFile(event) {
  event.preventDefault();
  const fileId = $("moveFileId").value;
  const selectedFolder = $("moveFolderSelect").value || null;
  const { error } = await state.db.from("files")
    .update({ folder_id: selectedFolder, updated_at: new Date().toISOString() })
    .eq("id", fileId);
  if (error) {
    $("moveError").textContent = "This file could not be moved to that folder.";
    return;
  }
  $("moveDialog").close();
  await loadWorkspace();
  toast("File moved.", "success");
}

async function renameFile(file) {
  const entered = window.prompt("Rename file", file.name);
  if (entered === null) return;
  const name = safeFileName(entered);
  if (!name) {
    toast("Enter a valid name without path separators.", "error");
    return;
  }
  const { error } = await state.db.from("files")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", file.id);
  if (error) {
    toast("File could not be renamed.", "error");
    return;
  }
  await loadWorkspace();
  toast("File renamed.", "success");
}

async function deleteFile(file) {
  if (!window.confirm("Move “" + file.name + "” to Recently Deleted?")) return;
  try {
    // Lifecycle changes are server-authorized; the browser cannot edit deleted_at.
    await verifyUpload(file.id, "delete");
    await loadWorkspace();
    toast("File moved to Recently Deleted.", "success");
  } catch (error) {
    toast("File could not be moved to Recently Deleted.", "error");
  }
}

async function restoreFile(file) {
  try {
    // Restore checks the original private object and size before re-enabling reads.
    await verifyUpload(file.id, "restore");
    await loadWorkspace();
    toast("File restored.", "success");
  } catch (error) {
    toast("The original private object is missing or could not be verified; this file cannot be restored.", "error");
  }
}

async function getFileBlob(file) {
  const { data, error } = await state.client.storage.from(BUCKET).download(storagePath(file));
  if (error || !data) throw new Error("Private file transfer failed.");
  return data;
}

async function downloadFile(file) {
  try {
    const blob = await getFileBlob(file);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    toast("The private file could not be downloaded.", "error");
  }
}

async function previewFile(file) {
  const type = String(file.mime_type || "").toLowerCase();
  const safePreview = (type.startsWith("image/") && type !== "image/svg+xml")
    || type.startsWith("video/")
    || type.startsWith("audio/")
    || type === "application/pdf";
  if (!safePreview) {
    toast("Preview is not supported for this file type. Use Download instead.");
    return;
  }
  try {
    clearPreview();
    const blob = await getFileBlob(file);
    state.previewUrl = URL.createObjectURL(blob);
    $("previewTitle").textContent = file.name;
    const content = $("previewContent");
    content.replaceChildren();
    let element;
    if (type.startsWith("image/")) {
      element = document.createElement("img");
      element.alt = file.name;
    } else if (type.startsWith("video/")) {
      element = document.createElement("video");
      element.controls = true;
      element.playsInline = true;
    } else if (type.startsWith("audio/")) {
      element = document.createElement("audio");
      element.controls = true;
    } else {
      element = document.createElement("iframe");
      element.title = "PDF preview";
      element.referrerPolicy = "no-referrer";
      element.setAttribute("sandbox", "");
    }
    element.src = state.previewUrl;
    content.append(element);
    $("previewDialog").showModal();
  } catch (error) {
    toast("A private preview could not be loaded.", "error");
  }
}

function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $("previewContent")?.replaceChildren();
}

function addUploadItem(file, rowId) {
  const item = document.createElement("div");
  item.className = "upload-item";
  item.dataset.uploadId = rowId;
  const top = document.createElement("div");
  top.className = "upload-item-top";
  const name = document.createElement("span");
  name.className = "upload-item-name";
  name.textContent = file.name;
  const status = document.createElement("span");
  status.className = "upload-item-status";
  status.textContent = "Starting…";
  top.append(name, status);
  const track = document.createElement("div");
  track.className = "upload-track";
  const fill = document.createElement("span");
  track.append(fill);
  const foot = document.createElement("div");
  foot.className = "upload-item-foot";
  const progress = document.createElement("span");
  progress.textContent = "Preparing transfer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "upload-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => cancelUpload(rowId));
  foot.append(progress, cancel);
  item.append(top, track, foot);
  $("uploadQueue").prepend(item);
  $("uploadPanel").hidden = false;
  updateUploadPanelCount();
  return { item, status, fill, progress, cancel };
}

function updateUploadPanelCount() {
  $("uploadPanelCount").textContent = state.activeUploads.size + " active";
}

async function verifyUpload(fileId, action = "verify") {
  const { data, error } = await state.client.functions.invoke("mahidrive-verify-upload", {
    body: { file_id: fileId, action },
  });
  const accepted = action === "verify" ? data?.verified === true
    : action === "cancel" || action === "fail" ? data?.failed === true
    : action === "delete" ? data?.deleted === true
    : action === "restore" ? data?.restored === true
    : false;
  if (error || !accepted) throw new Error("Private file operation could not be verified.");
  return data;
}

async function markUploadFailed(fileId, action = "fail") {
  try {
    await verifyUpload(fileId, action);
  } catch (_) {
    // Fail closed: the file remains unavailable because Storage RLS requires ready.
  }
}

async function startUpload(file) {
  const name = safeFileName(file.name);
  if (!name) {
    toast("File name contains an unsupported path or control character.", "error");
    return;
  }
  const sizeLimit = Number(state.config.maxFileBytes) || 50 * 1024 * 1024;
  if (file.size <= 0 || file.size > sizeLimit) {
    toast("This file is empty or exceeds the configured upload limit of " + bytesLabel(sizeLimit) + ".", "error");
    return;
  }

  const mime = file.type || "application/octet-stream";
  const { data: record, error: insertError } = await state.db.from("files")
    .insert({
      folder_id: state.currentFolderId,
      name,
      mime_type: mime,
      size_bytes: file.size,
    })
    .select("id,storage_key,name,size_bytes,mime_type,folder_id")
    .single();

  if (insertError || !record) {
    toast("Upload could not be prepared. Check the folder and owner access policies.", "error");
    return;
  }

  const ui = addUploadItem(file, record.id);
  const { data: { session } } = await state.client.auth.getSession();
  if (!session?.access_token) {
    await markUploadFailed(record.id, "fail");
    ui.status.textContent = "Session expired";
    ui.cancel.hidden = true;
    toast("Your owner session expired. Sign in again.", "error");
    return;
  }

  const projectHost = new URL(state.config.supabaseUrl);
  if (!projectHost.hostname.endsWith(".supabase.co")) {
    ui.status.textContent = "Storage host unsupported";
    ui.cancel.hidden = true;
    toast("Configure the canonical Supabase project URL before uploading.", "error");
    return;
  }
  const storageHost = projectHost.protocol + "//" + projectHost.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  const path = storagePath(record);
  if (!path || path !== "library/" + record.id + "/original") {
    ui.status.textContent = "Invalid storage reference";
    ui.cancel.hidden = true;
    await markUploadFailed(record.id, "fail");
    updateUploadPanelCount();
    return;
  }
  const upload = new TusUpload(file, {
    endpoint: storageHost + "/storage/v1/upload/resumable",
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers: {
      authorization: "Bearer " + session.access_token,
      apikey: state.config.publishableKey,
      "x-upsert": "false",
    },
    metadata: {
      bucketName: BUCKET,
      objectName: path,
      contentType: mime,
      cacheControl: "3600",
    },
    chunkSize: 6 * 1024 * 1024,
    storeFingerprintForResuming: false,
    removeFingerprintOnSuccess: true,
    onError: async () => {
      state.activeUploads.delete(record.id);
      if (state.cancelledUploads.has(record.id)) return;
      await markUploadFailed(record.id, "fail");
      ui.status.textContent = "Failed";
      ui.progress.textContent = "Transfer failed";
      ui.cancel.hidden = true;
      updateUploadPanelCount();
      toast("Upload failed for " + name + ".", "error");
      await loadWorkspace();
    },
    onProgress: (uploaded, total) => {
      const ratio = total > 0 ? Math.min(100, Math.round(uploaded / total * 100)) : 0;
      ui.fill.style.width = ratio + "%";
      ui.status.textContent = ratio + "%";
      ui.progress.textContent = bytesLabel(uploaded) + " of " + bytesLabel(total);
    },
    onSuccess: async () => {
      state.activeUploads.delete(record.id);
      try {
        // The backend verifies the final Storage object size/type before marking
        // the metadata row ready. The browser never marks an upload ready itself.
        await verifyUpload(record.id);
        ui.fill.style.width = "100%";
        ui.status.textContent = "Complete";
        ui.progress.textContent = "Stored in your private bucket";
        ui.cancel.hidden = true;
        updateUploadPanelCount();
        toast("Uploaded " + name + ".", "success");
        await loadWorkspace();
      } catch (error) {
        ui.status.textContent = "Verification blocked";
        ui.progress.textContent = "Transfer finished; server verification is required before download.";
        ui.cancel.hidden = true;
        updateUploadPanelCount();
        toast("The file upload finished but needs verification. Do not upload a duplicate yet.", "error");
        await loadWorkspace();
      }
    },
  });

  state.activeUploads.set(record.id, upload);
  updateUploadPanelCount();
  upload.start();
}

async function cancelUpload(fileId) {
  const upload = state.activeUploads.get(fileId);
  if (!upload) return;
  state.cancelledUploads.add(fileId);
  try {
    await upload.abort();
  } catch (error) {
    // The transfer may already have completed or been interrupted.
  }
  state.activeUploads.delete(fileId);
  await markUploadFailed(fileId, "cancel");
  const item = $("uploadQueue").querySelector('[data-upload-id="' + CSS.escape(fileId) + '"]');
  if (item) {
    item.querySelector(".upload-item-status").textContent = "Cancelled";
    item.querySelector(".upload-item-foot span").textContent = "Upload cancelled";
    item.querySelector(".upload-cancel").hidden = true;
  }
  updateUploadPanelCount();
  await loadWorkspace();
}

function openFolderDialog() {
  $("folderError").textContent = "";
  $("folderDialog").showModal();
  $("folderName").focus();
}

function setView(view) {
  state.view = view;
  state.query = "";
  $("fileSearch").value = "";
  if (view === "trash") state.currentFolderId = null;
  loadFiles().then(renderWorkspace).catch(() => toast("Could not load this view.", "error"));
}

function bindEvents() {
  $("loginForm").addEventListener("submit", login);
  $("verifyMfaButton").addEventListener("click", verifyOwnerMfa);
  $("restartLoginButton").addEventListener("click", resetLoginToPassword);
  $("loginMfaCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyOwnerMfa();
    }
  });
  $("signOutButton").addEventListener("click", signOut);
  $("uploadButton").addEventListener("click", () => $("fileInput").click());
  $("uploadSidebarButton").addEventListener("click", () => $("fileInput").click());
  $("emptyUploadButton").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    for (const file of selected) await startUpload(file);
    $("uploadPanel").hidden = false;
  });
  $("newFolderButton").addEventListener("click", openFolderDialog);
  $("folderForm").addEventListener("submit", createFolder);
  $("moveForm").addEventListener("submit", moveFile);
  $("fileSearch").addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(async () => {
      state.query = $("fileSearch").value.trim();
      try { await loadFiles(); renderWorkspace(); }
      catch (error) { toast("Search could not be completed.", "error"); }
    }, 250);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $(button.dataset.closeDialog).close());
  });
  $("previewDialog").addEventListener("close", clearPreview);
  $("closeUploadPanel").addEventListener("click", () => { $("uploadPanel").hidden = true; });
  $("mobileMenuButton").addEventListener("click", () => {
    const open = $("sidebar").classList.toggle("open");
    $("mobileScrim").classList.toggle("active", open);
    $("mobileMenuButton").setAttribute("aria-expanded", String(open));
    $("mobileMenuButton").setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  $("mobileScrim").addEventListener("click", closeMobileNav);
  window.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      $("fileSearch").focus();
    }
    if (event.key === "Escape") closeMobileNav();
  });
  $("fileList").addEventListener("click", closeMobileNav);
  $("folderGrid").addEventListener("click", closeMobileNav);
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    if ($("appShell").hidden || !event.dataTransfer?.files?.length) return;
    for (const file of Array.from(event.dataTransfer.files)) await startUpload(file);
  });
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && state.client && !$("appShell").hidden) {
      try {
        const ownerStatus = await requestOwnerCheck();
        if (ownerStatus === "mfa_required") {
          await startOwnerMfaChallenge();
        } else if (ownerStatus !== true) {
          await signOut();
        }
      } catch (error) {
        toast("Could not refresh the owner session.", "error");
      }
    }
  });
}

function closeMobileNav() {
  $("sidebar").classList.remove("open");
  $("mobileScrim").classList.remove("active");
  $("mobileMenuButton").setAttribute("aria-expanded", "false");
  $("mobileMenuButton").setAttribute("aria-label", "Open navigation");
}

bindEvents();
boot();
