(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.MAHI_AI_CONFIG || {};
  const endpoint = (config.supabaseUrl || "").replace(/\/+$/, "") + "/functions/v1/mahicloud-admin";
  const publishableKey = config.supabasePublishableKey || "";
  const sessionKey = "mahicloud-admin-session-v1";
  let session = "";
  let items = [];
  let busy = false;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }
  function notice(message) {
    const node = $("pageStatus");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => node.classList.remove("show"), 3200);
  }
  async function request(action, payload = {}, needsSession = true) {
    if (!endpoint.startsWith("https://") || !publishableKey) throw new Error("MahiCloud is missing the public Supabase configuration.");
    const headers = { "Content-Type": "application/json", "apikey": publishableKey };
    if (needsSession) {
      if (!session) throw new Error("Your admin session has expired. Sign in again.");
      headers.Authorization = "Bearer " + session;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ action, ...payload }), signal: controller.signal });
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("The server took too long to respond. Please retry.");
      throw new Error("Could not reach the admin service. Check your connection and ALLOWED_ORIGINS.");
    } finally { clearTimeout(timer); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && needsSession) showLogin("Your admin session expired. Sign in again.");
      throw new Error(data.error || "The request failed (" + response.status + ").");
    }
    return data;
  }
  function showLogin(message = "") {
    session = "";
    try { sessionStorage.removeItem(sessionKey); } catch (_) {}
    $("loginPanel").hidden = false;
    $("adminPanel").hidden = true;
    if (message) $("loginStatus").textContent = message;
  }
  function showAdmin() { $("loginPanel").hidden = true; $("adminPanel").hidden = false; }
  function slugify(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  }
  function renderStats(overview) {
    const counts = overview.counts || {};
    const cards = [
      ["Catalogue items", counts.total || 0, "Published + drafts"],
      ["Published", counts.published || 0, "Visible on the homepage"],
      ["Drafts", counts.drafts || 0, "Hidden from visitors"],
      ["Active sessions", overview.activeSessions || 0, "Server-verified sessions"]
    ];
    $("statsGrid").innerHTML = cards.map(([label, value, detail]) =>
      '<div class="stat panel"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong><small>' + escapeHtml(detail) + '</small></div>'
    ).join("");
  }
  function renderItems() {
    const tbody = $("catalogRows");
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No catalogue items. Use “Add item” to create one.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map((item) => {
      const published = item.published === true;
      return '<tr><td><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.href) + '</small></td>' +
        '<td><span class="pill-status">' + escapeHtml(item.type) + '</span></td>' +
        '<td><span class="pill-status ' + (published ? 'on' : 'off') + '">' + (published ? 'Published' : 'Draft') + '</span></td>' +
        '<td>' + escapeHtml(item.position) + '</td>' +
        '<td><div class="row-actions"><button class="small-button" type="button" data-edit="' + escapeHtml(item.id) + '">Edit</button><button class="small-button delete" type="button" data-delete="' + escapeHtml(item.id) + '">Delete</button></div></td></tr>';
    }).join("");
  }
  function renderProviders(result) {
    const providers = Array.isArray(result.providers) ? result.providers : [];
    $("providerList").innerHTML = providers.map((item) =>
      '<div class="provider-row"><span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.kind) + '</small></span>' +
      '<span class="pill-status ' + (item.configured ? 'on' : 'off') + '"><i class="status-dot ' + (item.configured ? 'on' : '') + '"></i>' +
      (item.configured ? 'Configured' : 'Missing') + '</span></div>'
    ).join("") + '<p class="muted">Checked ' + escapeHtml(new Date(result.checkedAt || Date.now()).toLocaleString()) + '</p>';
  }
  async function refresh() {
    $("refreshButton").disabled = true;
    try {
      const [overview, catalog, providers] = await Promise.all([
        request("overview"), request("catalog-list"), request("provider-status")
      ]);
      items = Array.isArray(catalog.items) ? catalog.items : [];
      renderStats(overview); renderItems(); renderProviders(providers);
    } catch (error) {
      notice(error.message || "Could not refresh the dashboard.");
    } finally { $("refreshButton").disabled = false; }
  }
  function value(id) { return $(id).value.trim(); }
  function clearForm() {
    $("itemForm").reset();
    $("itemId").readOnly = false;
    $("itemId").dataset.userEdited = "";
    $("itemType").value = "apps";
    $("itemIcon").value = "grid";
    $("itemColorPrimary").value = "#e50914";
    $("itemColorSecondary").value = "#7a0309";
    $("itemPlatforms").value = "Web";
    $("itemPosition").value = String((items.length + 1) * 10);
    $("itemPublished").checked = true;
    $("editorTitle").textContent = "Add project";
    $("saveStatus").textContent = "";
    $("itemForm").hidden = false;
    $("itemName").focus();
  }
  function editItem(id) {
    const item = items.find((x) => x.id === id);
    if (!item) return;
    $("itemForm").reset();
    $("itemId").value = item.id || "";
    $("itemId").readOnly = true;
    $("itemName").value = item.name || "";
    $("itemType").value = item.type || "tools";
    $("itemHref").value = item.href || "";
    $("itemSubtitle").value = item.subtitle || "";
    $("itemDescription").value = item.description || "";
    $("itemIcon").value = item.icon_key || "grid";
    $("itemIconUrl").value = item.icon_url || "";
    $("itemColorPrimary").value = item.color_primary || "#e50914";
    $("itemColorSecondary").value = item.color_secondary || "#7a0309";
    $("itemPlatforms").value = Array.isArray(item.platforms) ? item.platforms.join(", ") : "Web";
    $("itemPosition").value = String(item.position == null ? 100 : item.position);
    $("itemPublished").checked = item.published === true;
    $("editorTitle").textContent = "Edit " + item.name;
    $("saveStatus").textContent = "";
    $("itemForm").hidden = false;
    $("itemName").focus();
    $("itemForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = $("loginButton");
    button.disabled = true; button.textContent = "Verifying…";
    $("loginStatus").textContent = "Verifying the passcode with Supabase…";
    try {
      const data = await request("login", { pin: $("pinInput").value }, false);
      if (!data.session) throw new Error("The server did not return an admin session.");
      session = data.session;
      try { sessionStorage.setItem(sessionKey, session); } catch (_) {}
      $("pinInput").value = "";
      showAdmin();
      await refresh();
      notice("Admin session established.");
    } catch (error) {
      $("loginStatus").textContent = error.message || "Login failed.";
    } finally { busy = false; button.disabled = false; button.textContent = "Unlock workspace ↗"; }
  });
  $("newItemButton").addEventListener("click", clearForm);
  $("cancelEditButton").addEventListener("click", () => { $("itemForm").hidden = true; });
  $("catalogRows").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    if (edit) editItem(edit.dataset.edit);
    if (del) {
      const id = del.dataset.delete;
      const item = items.find((x) => x.id === id);
      if (!confirm('Delete "' + (item ? item.name : id) + '" from the homepage catalogue?')) return;
      del.disabled = true;
      try { await request("catalog-delete", { id }); items = items.filter((x) => x.id !== id); renderItems(); await refresh(); notice("Catalogue item deleted."); }
      catch (error) { notice(error.message || "Could not delete the item."); del.disabled = false; }
    }
  });
  $("itemName").addEventListener("input", () => {
    if (!$("itemId").readOnly && !$("itemId").dataset.userEdited) $("itemId").value = slugify($("itemName").value);
  });
  $("itemId").addEventListener("input", () => { $("itemId").dataset.userEdited = "true"; });
  $("itemForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = $("saveItemButton");
    button.disabled = true; button.textContent = "Saving…";
    const item = {
      id: slugify(value("itemId")), name: value("itemName"), type: value("itemType"),
      href: value("itemHref"), subtitle: value("itemSubtitle"), description: value("itemDescription"),
      icon_key: value("itemIcon"), icon_url: value("itemIconUrl"),
      color_primary: value("itemColorPrimary"), color_secondary: value("itemColorSecondary"),
      platforms: value("itemPlatforms").split(",").map((x) => x.trim()).filter(Boolean),
      position: Number(value("itemPosition")), published: $("itemPublished").checked
    };
    try {
      const data = await request("catalog-save", { item });
      if (data.item) {
        const index = items.findIndex((x) => x.id === data.item.id);
        if (index >= 0) items[index] = data.item; else items.push(data.item);
      }
      $("itemId").dataset.userEdited = "";
      $("itemForm").hidden = true;
      await refresh();
      notice("Catalogue item saved. Published items update on the homepage after its catalogue refresh.");
    } catch (error) {
      $("saveStatus").textContent = error.message || "Could not save the item.";
    } finally { busy = false; button.disabled = false; button.textContent = "Save catalogue item"; }
  });
  $("refreshButton").addEventListener("click", refresh);
  $("logoutButton").addEventListener("click", async () => {
    try { await request("logout"); } catch (_) {}
    showLogin("This admin session has been locked.");
    $("itemForm").hidden = true;
    notice("Admin session revoked.");
  });
  try { session = sessionStorage.getItem(sessionKey) || ""; } catch (_) {}
  if (session) { showAdmin(); refresh().catch(() => showLogin("Could not restore the session. Sign in again.")); }
})();