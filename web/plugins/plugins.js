(function () {
  "use strict";

  var STORAGE_KEY = "mc:plugin-hub:v1";
  var CATEGORIES = ["Research", "Productivity", "Utilities"];
  var ICONS = {
    search: "⌕",
    calculator: "∑",
    json: "{ }",
    text: "T",
    time: "◷",
    custom: "↗"
  };

  function localNow(timeZone) {
    var now = new Date();
    var zone = String(timeZone || "").trim();
    if (!zone || zone.toLowerCase() === "local") {
      return {
        iso: now.toISOString(),
        local: now.toLocaleString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time"
      };
    }
    var formatted = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: zone
    }).format(now);
    return { iso: now.toISOString(), local: formatted, timeZone: zone };
  }

  function calculate(expression) {
    var source = String(expression || "").replace(/\s+/g, "");
    if (!source || source.length > 200) throw new Error("Enter a math expression of 1–200 characters.");
    var tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%^]/g) || [];
    if (tokens.join("") !== source || tokens.length > 100) {
      throw new Error("Use numbers, parentheses and + − × ÷ % ^ operators only.");
    }
    var at = 0;
    function peek() { return tokens[at]; }
    function take() { return tokens[at++]; }
    function primary() {
      var token = take();
      if (token === "(") {
        var nested = addSub();
        if (take() !== ")") throw new Error("Missing closing parenthesis.");
        return nested;
      }
      if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
        throw new Error("Expected a number.");
      }
      var n = Number(token);
      if (!Number.isFinite(n)) throw new Error("That number is outside the supported range.");
      return n;
    }
    function power() {
      var n = primary();
      if (peek() === "^") {
        take();
        n = Math.pow(n, unary());
      }
      return n;
    }
    function unary() {
      if (peek() === "+") { take(); return unary(); }
      if (peek() === "-") { take(); return -unary(); }
      return power();
    }
    function mulDiv() {
      var n = unary();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        var op = take(), right = unary();
        if ((op === "/" || op === "%") && right === 0) throw new Error("Cannot divide by zero.");
        if (op === "*") n *= right;
        else if (op === "/") n /= right;
        else n %= right;
      }
      return n;
    }
    function addSub() {
      var n = mulDiv();
      while (peek() === "+" || peek() === "-") {
        var op = take(), right = mulDiv();
        n = op === "+" ? n + right : n - right;
      }
      return n;
    }
    var result = addSub();
    if (at !== tokens.length) throw new Error("There is an unexpected token in the expression.");
    if (!Number.isFinite(result)) throw new Error("The result is outside the supported numeric range.");
    return Object.is(result, -0) ? 0 : result;
  }

  function parseJson(text, mode) {
    if (String(text || "").length > 250000) throw new Error("JSON input is limited to 250 KB.");
    var value;
    try { value = JSON.parse(String(text || "")); }
    catch (err) { throw new Error("Invalid JSON: " + err.message); }
    if (mode === "validate") return { valid: true, message: "Valid JSON.", type: Array.isArray(value) ? "array" : (value === null ? "null" : typeof value) };
    return { valid: true, output: mode === "minify" ? JSON.stringify(value) : JSON.stringify(value, null, 2) };
  }

  function processText(text, mode) {
    var value = String(text == null ? "" : text);
    if (value.length > 200000) throw new Error("Text input is limited to 200,000 characters.");
    var words = value.trim() ? (value.trim().match(/\S+/g) || []).length : 0;
    var lines = value ? value.split(/\r\n|\r|\n/).length : 0;
    if (mode === "uppercase") return { output: value.toLocaleUpperCase() };
    if (mode === "lowercase") return { output: value.toLocaleLowerCase() };
    if (mode === "title-case") return { output: value.toLocaleLowerCase().replace(/(^|[\s([{])([^\s([{])/g, function (_m, prefix, char) { return prefix + char.toLocaleUpperCase(); }) };
    if (mode === "trim") return { output: value.trim().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n") };
    return { words: words, characters: value.length, charactersNoSpaces: value.replace(/\s/g, "").length, lines: lines, output: "Words: " + words + "\nCharacters: " + value.length + "\nCharacters (without whitespace): " + value.replace(/\s/g, "").length + "\nLines: " + lines };
  }

  var BUILTINS = [
    {
      id: "web-search", name: "Web Search", category: "Research", version: "1.0.0", icon: "search",
      description: "Turn a natural-language query into a web search link you can inspect and open.",
      details: "Search runs in your browser. When you open the generated link, your query is sent to DuckDuckGo.",
      permissions: ["Create a DuckDuckGo search URL from the query you provide.", "Open search results only after you click the link."],
      form: [{ name: "query", label: "What do you want to find?", type: "text", placeholder: "e.g. latest browser security guidance", required: true }],
      tools: [{ name: "web_search", description: "Create a web search URL from a user-provided query. Does not fetch or open the results automatically.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Search query, up to 400 characters." } }, required: ["query"], additionalProperties: false } }],
      run: function (args) {
        var query = String(args.query || "").trim();
        if (!query || query.length > 400) throw new Error("Enter a search query of 1–400 characters.");
        return { query: query, url: "https://duckduckgo.com/?q=" + encodeURIComponent(query), note: "Open the link to view external search results." };
      }
    },
    {
      id: "calculator", name: "Calculator", category: "Utilities", version: "1.0.0", icon: "calculator",
      description: "Evaluate arithmetic expressions with a small, safe parser—no code execution or eval.",
      details: "Calculations stay in this browser. Supported operators: +, −, ×, ÷, remainder, exponent and parentheses.",
      permissions: ["Process the expression locally in this browser.", "No network access or account connection."],
      form: [{ name: "expression", label: "Expression", type: "text", placeholder: "(18.5 * 4) / 2", required: true }],
      tools: [{ name: "calculator_evaluate", description: "Safely evaluate a basic arithmetic expression. Supports +, -, *, /, %, ^ and parentheses.", inputSchema: { type: "object", properties: { expression: { type: "string", description: "Arithmetic expression, maximum 200 characters." } }, required: ["expression"], additionalProperties: false } }],
      run: function (args) { return { expression: String(args.expression || ""), result: calculate(args.expression) }; }
    },
    {
      id: "json-studio", name: "JSON Studio", category: "Productivity", version: "1.0.0", icon: "json",
      description: "Validate, format or minify JSON directly in your browser.",
      details: "JSON is parsed and formatted locally. Your pasted content is not sent to a server.",
      permissions: ["Read the JSON text you paste into the tool.", "Process and display the result locally in this browser."],
      form: [
        { name: "json", label: "JSON input", type: "textarea", placeholder: "{\"name\":\"MahiCloud\",\"enabled\":true}", required: true },
        { name: "mode", label: "Action", type: "select", value: "pretty", options: [{ value: "pretty", label: "Format / pretty print" }, { value: "minify", label: "Minify" }, { value: "validate", label: "Validate only" }] }
      ],
      tools: [{ name: "json_process", description: "Validate, pretty-print or minify JSON locally. Input limit is 250 KB.", inputSchema: { type: "object", properties: { json: { type: "string" }, mode: { type: "string", enum: ["pretty", "minify", "validate"] } }, required: ["json", "mode"], additionalProperties: false } }],
      run: function (args) { return parseJson(args.json, args.mode || "pretty"); }
    },
    {
      id: "text-toolkit", name: "Text Toolkit", category: "Productivity", version: "1.0.0", icon: "text",
      description: "Count words and lines, change case, or clean extra whitespace in text.",
      details: "Text analysis and transformations happen locally in your browser and are not uploaded.",
      permissions: ["Read the text you paste into the tool.", "Process and display the result locally in this browser."],
      form: [
        { name: "text", label: "Text", type: "textarea", placeholder: "Paste or type text here…", required: true },
        { name: "mode", label: "Action", type: "select", value: "stats", options: [{ value: "stats", label: "Word & character count" }, { value: "uppercase", label: "UPPERCASE" }, { value: "lowercase", label: "lowercase" }, { value: "title-case", label: "Title Case" }, { value: "trim", label: "Clean whitespace" }] }
      ],
      tools: [{ name: "text_process", description: "Analyze text or transform its case/whitespace locally. Input limit is 200,000 characters.", inputSchema: { type: "object", properties: { text: { type: "string" }, mode: { type: "string", enum: ["stats", "uppercase", "lowercase", "title-case", "trim"] } }, required: ["text", "mode"], additionalProperties: false } }],
      run: function (args) { return processText(args.text, args.mode || "stats"); }
    },
    {
      id: "date-time", name: "Date & Time", category: "Utilities", version: "1.0.0", icon: "time",
      description: "Get the current time in your browser's local timezone or a timezone you specify.",
      details: "The tool uses the current date/time from your device. A timezone label can be supplied, for example Asia/Dhaka or UTC.",
      permissions: ["Read the current clock and timezone from your browser.", "No network access or account connection."],
      form: [{ name: "timeZone", label: "Timezone (optional)", type: "text", placeholder: "Local, UTC or Asia/Dhaka" }],
      tools: [{ name: "time_now", description: "Return the current time in the browser's local timezone or a supplied IANA timezone.", inputSchema: { type: "object", properties: { timeZone: { type: "string", description: "Optional IANA timezone such as Asia/Dhaka." } }, additionalProperties: false } }],
      run: function (args) { return localNow(args.timeZone); }
    }
  ];

  var state = loadState();
  var filter = "all";
  var searchText = "";
  var pendingPlugin = null;
  var runningPlugin = null;
  var toastTimer = 0;

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        enabled: Array.isArray(saved.enabled) ? saved.enabled.filter(function (id) { return typeof id === "string"; }) : [],
        custom: Array.isArray(saved.custom) ? saved.custom.filter(validStoredCustom) : []
      };
    } catch (_) { return { enabled: [], custom: [] }; }
  }

  function validStoredCustom(plugin) {
    return !!plugin && typeof plugin.id === "string" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(plugin.id) &&
      typeof plugin.name === "string" && typeof plugin.url === "string" && isSafeHttpsUrl(plugin.url);
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { showToast("Browser storage is unavailable. Your changes may not persist."); }
    window.dispatchEvent(new CustomEvent("mahicloud:plugin-state-change", { detail: { enabled: getEnabledIds(), tools: listTools() } }));
  }

  function allPlugins() {
    return BUILTINS.concat(state.custom.map(function (item) {
      return {
        id: item.id, name: item.name, description: item.description, category: item.category || "Productivity",
        version: item.version || "1.0.0", icon: "custom", custom: true, url: item.url,
        details: "This imported plugin is an HTTPS shortcut. MahiCloud does not run code from imported manifests.",
        permissions: ["Open the external website " + item.url + " after you choose Open.", "No remote scripts are executed by this plugin."],
        tools: []
      };
    }));
  }

  function getPlugin(id) {
    return allPlugins().filter(function (item) { return item.id === id; })[0] || null;
  }

  function isEnabled(id) { return state.enabled.indexOf(id) !== -1; }
  function getEnabledIds() { return state.enabled.filter(function (id) { return !!getPlugin(id); }); }

  function listTools() {
    var output = [];
    allPlugins().forEach(function (plugin) {
      if (!isEnabled(plugin.id) || !Array.isArray(plugin.tools)) return;
      plugin.tools.forEach(function (tool) {
        output.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      });
    });
    return output;
  }

  function listEnabledPlugins() {
    return allPlugins().filter(function (plugin) { return isEnabled(plugin.id); }).map(publicPlugin);
  }

  function publicPlugin(plugin) {
    return {
      id: plugin.id, name: plugin.name, description: plugin.description, category: plugin.category,
      version: plugin.version, custom: !!plugin.custom, url: plugin.custom ? plugin.url : undefined,
      permissions: (plugin.permissions || []).slice(),
      tools: (plugin.tools || []).map(function (tool) {
        return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
      })
    };
  }

  function runTool(toolName, input) {
    var tool = null, plugin = null;
    allPlugins().some(function (candidate) {
      if (!isEnabled(candidate.id)) return false;
      var found = (candidate.tools || []).filter(function (item) { return item.name === toolName; })[0];
      if (found) { tool = found; plugin = candidate; return true; }
      return false;
    });
    if (!tool || !plugin || typeof plugin.run !== "function") {
      return Promise.reject(new Error("That tool is not available. Enable its plugin first."));
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return Promise.reject(new Error("Tool input must be a JSON object."));
    }
    try {
      var result = plugin.run(input);
      return Promise.resolve({ ok: true, pluginId: plugin.id, toolName: toolName, result: result });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("The plugin could not complete that action."));
    }
  }

  window.MahiCloudPluginHost = Object.freeze({
    version: "1.0.0",
    listPlugins: function () { return allPlugins().map(publicPlugin); },
    listEnabledPlugins: listEnabledPlugins,
    listTools: listTools,
    runTool: runTool,
    isEnabled: isEnabled
  });

  // The runtime can be loaded by a same-origin assistant page without rendering the hub UI.
  if (!document.getElementById("pluginSearch")) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function showToast(message) {
    var toast = document.getElementById("phToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2600);
  }

  function iconNode(plugin) {
    var node = el("span", "ph-plugin-icon", ICONS[plugin.icon] || ICONS.custom);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function button(label, className, action, ariaLabel) {
    var node = el("button", "ph-button " + className, label);
    node.type = "button";
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    node.addEventListener("click", action);
    return node;
  }

  function makeCard(plugin) {
    var card = el("article", "ph-plugin-card");
    var top = el("div", "ph-card-top");
    top.appendChild(iconNode(plugin));
    var status = el("span", "ph-status" + (isEnabled(plugin.id) ? " is-enabled" : ""), isEnabled(plugin.id) ? "Enabled" : (plugin.custom ? "Custom" : "Available"));
    top.appendChild(status);
    card.appendChild(top);
    card.appendChild(el("h3", "", plugin.name));
    card.appendChild(el("p", "", plugin.description));
    var meta = el("div", "ph-card-meta");
    meta.appendChild(el("span", "ph-chip", plugin.category));
    meta.appendChild(el("span", "ph-chip", plugin.version || "1.0.0"));
    meta.appendChild(el("span", "ph-chip", plugin.custom ? "External link only" : ((plugin.permissions || []).some(function (p) { return p.toLowerCase().indexOf("external") >= 0 || p.toLowerCase().indexOf("duckduckgo") >= 0; }) ? "External access" : "Local tool")));
    card.appendChild(meta);
    var actions = el("div", "ph-card-actions");
    if (!isEnabled(plugin.id)) {
      actions.appendChild(button("Enable plugin", "ph-button-primary", function () { requestEnable(plugin.id); }));
    } else if (plugin.custom) {
      actions.appendChild(button("Open plugin ↗", "ph-button-primary", function () { window.open(plugin.url, "_blank", "noopener,noreferrer"); }));
    } else {
      actions.appendChild(button("Run tool", "ph-button-primary", function () { openRunner(plugin.id); }));
    }
    actions.appendChild(button("Permissions", "ph-button-quiet", function () { showPermissions(plugin.id, false); }, "Review permissions for " + plugin.name));
    card.appendChild(actions);
    return card;
  }

  function renderPlugins() {
    var grid = document.getElementById("pluginGrid");
    var empty = document.getElementById("emptyState");
    var resultCount = document.getElementById("resultCount");
    var list = allPlugins().filter(function (plugin) {
      var matchesSearch = !searchText || [plugin.name, plugin.description, plugin.category, (plugin.tools || []).map(function (t) { return t.name; }).join(" ")].join(" ").toLowerCase().indexOf(searchText) >= 0;
      var matchesFilter = filter === "all" || (filter === "enabled" ? isEnabled(plugin.id) : plugin.category === filter);
      return matchesSearch && matchesFilter;
    });
    grid.textContent = "";
    list.forEach(function (plugin) { grid.appendChild(makeCard(plugin)); });
    empty.hidden = list.length > 0;
    resultCount.textContent = list.length + (list.length === 1 ? " plugin" : " plugins");
    document.getElementById("availableCount").textContent = String(BUILTINS.length);
    document.getElementById("enabledFilterCount").textContent = String(getEnabledIds().length);
    renderEnabled();
  }

  function renderEnabled() {
    var host = document.getElementById("enabledList");
    host.textContent = "";
    var enabled = allPlugins().filter(function (plugin) { return isEnabled(plugin.id); });
    if (!enabled.length) {
      host.appendChild(el("div", "ph-empty-enabled", "No plugins enabled yet. Enable one above to make its tools available through the plugin bridge."));
      return;
    }
    enabled.forEach(function (plugin) {
      var row = el("div", "ph-enabled-row");
      row.appendChild(iconNode(plugin));
      var info = el("div", "ph-enabled-info");
      info.appendChild(el("b", "", plugin.name));
      info.appendChild(el("small", "", plugin.custom ? plugin.url : ((plugin.tools || []).map(function (tool) { return tool.name; }).join(", ") || "External shortcut")));
      row.appendChild(info);
      if (plugin.custom) {
        row.appendChild(button("Open ↗", "ph-button-quiet", function () { window.open(plugin.url, "_blank", "noopener,noreferrer"); }));
      } else {
        row.appendChild(button("Run", "ph-button-quiet", function () { openRunner(plugin.id); }));
      }
      row.appendChild(button("Disable", "ph-button-quiet", function () { disablePlugin(plugin.id); }));
      host.appendChild(row);
    });
  }

  function showPermissions(id, allowByDefault) {
    var plugin = getPlugin(id);
    if (!plugin) return;
    pendingPlugin = { id: id, enable: !!allowByDefault };
    document.getElementById("permissionTitle").textContent = allowByDefault ? "Enable " + plugin.name + "?" : plugin.name + " permissions";
    document.getElementById("permissionDescription").textContent = plugin.details || "Review the access this plugin requests.";
    var list = document.getElementById("permissionList");
    list.textContent = "";
    (plugin.permissions || ["No special permissions requested."]).forEach(function (permission) {
      var row = el("div", "ph-permission");
      row.appendChild(el("span", "", "✓"));
      row.appendChild(el("div", "", permission));
      list.appendChild(row);
    });
    var confirm = document.getElementById("permissionConfirm");
    confirm.hidden = !allowByDefault;
    confirm.textContent = "Allow and enable";
    document.getElementById("permissionDialog").hidden = false;
    confirm.focus();
  }

  function requestEnable(id) { showPermissions(id, true); }

  function disablePlugin(id) {
    state.enabled = state.enabled.filter(function (item) { return item !== id; });
    saveState();
    renderPlugins();
    showToast("Plugin disabled.");
  }

  function openRunner(id) {
    var plugin = getPlugin(id);
    if (!plugin || !isEnabled(id)) { showToast("Enable this plugin before running it."); return; }
    if (plugin.custom) {
      window.open(plugin.url, "_blank", "noopener,noreferrer");
      return;
    }
    runningPlugin = plugin;
    document.getElementById("runnerCategory").textContent = plugin.category.toUpperCase() + " · PLUGIN TOOL";
    document.getElementById("runnerTitle").textContent = plugin.name;
    document.getElementById("runnerDescription").textContent = plugin.details || plugin.description;
    var form = document.getElementById("runnerForm");
    form.textContent = "";
    document.getElementById("runnerOutputWrap").hidden = true;
    (plugin.form || []).forEach(function (field) {
      var label = el("label", "ph-field");
      label.appendChild(el("span", "", field.label));
      var input;
      if (field.type === "textarea") {
        input = el("textarea");
        input.rows = field.rows || 6;
      } else if (field.type === "select") {
        input = el("select");
        (field.options || []).forEach(function (option) {
          var opt = el("option", "", option.label);
          opt.value = option.value;
          input.appendChild(opt);
        });
        input.value = field.value || (field.options && field.options[0] ? field.options[0].value : "");
      } else {
        input = el("input");
        input.type = field.type || "text";
        input.placeholder = field.placeholder || "";
      }
      input.name = field.name;
      input.id = "ph-field-" + field.name;
      if (field.required) input.required = true;
      if (field.value && field.type !== "select") input.value = field.value;
      label.appendChild(input);
      form.appendChild(label);
    });
    var actions = el("div", "ph-modal-actions");
    actions.appendChild(button("Close", "ph-button-quiet", function () { document.getElementById("runnerDialog").hidden = true; }));
    var submit = el("button", "ph-button ph-button-primary", plugin.id === "web-search" ? "Create search link" : "Run plugin");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);
    document.getElementById("runnerDialog").hidden = false;
    var firstField = form.querySelector("input,textarea,select");
    if (firstField) firstField.focus();
  }

  function displayResult(response) {
    var wrap = document.getElementById("runnerOutputWrap");
    var output = document.getElementById("runnerOutput");
    var link = document.getElementById("runnerLink");
    var result = response.result;
    var text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    output.textContent = text;
    link.hidden = true;
    link.removeAttribute("href");
    if (result && typeof result === "object" && typeof result.url === "string" && isSafeHttpsUrl(result.url)) {
      link.href = result.url;
      link.hidden = false;
    } else if (result && typeof result === "object" && typeof result.output === "string") {
      output.textContent = result.output;
    }
    wrap.hidden = false;
  }

  function validImportedManifest(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Manifest must be a JSON object.");
    if (typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(item.id)) throw new Error("ID must use 2–40 lowercase letters, numbers or hyphens.");
    if (typeof item.name !== "string" || item.name.trim().length < 2 || item.name.trim().length > 48) throw new Error("Name must be 2–48 characters.");
    if (typeof item.description !== "string" || item.description.trim().length > 180) throw new Error("Description must be 0–180 characters.");
    if (!isSafeHttpsUrl(item.url)) throw new Error("Only public HTTPS URLs are allowed.");
    if (getPlugin(item.id)) throw new Error("A plugin with that ID already exists.");
    var category = CATEGORIES.indexOf(item.category) >= 0 ? item.category : "Productivity";
    return {
      id: item.id,
      name: item.name.trim(),
      description: item.description.trim() || "An external service shortcut.",
      url: item.url,
      category: category,
      version: (typeof item.version === "string" && item.version.length <= 20) ? item.version : "1.0.0"
    };
  }

  function isSafeHttpsUrl(value) {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
      var url = new URL(value);
      var host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || !host || url.username || url.password) return false;
      if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
      // Imported shortcut plugins are links, not network fetches; reject IP literals and local hosts outright.
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.indexOf(":") >= 0) return false;
      return true;
    } catch (_) { return false; }
  }

  document.querySelectorAll("[data-filter]").forEach(function (node) {
    node.addEventListener("click", function () {
      filter = node.dataset.filter || "all";
      document.querySelectorAll("[data-filter]").forEach(function (other) {
        var active = other === node;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderPlugins();
    });
  });

  document.getElementById("pluginSearch").addEventListener("input", function (event) {
    searchText = String(event.target.value || "").toLowerCase().trim();
    renderPlugins();
  });

  document.getElementById("permissionConfirm").addEventListener("click", function () {
    if (!pendingPlugin || !getPlugin(pendingPlugin.id)) return;
    if (state.enabled.indexOf(pendingPlugin.id) === -1) state.enabled.push(pendingPlugin.id);
    saveState();
    document.getElementById("permissionDialog").hidden = true;
    renderPlugins();
    showToast("Plugin enabled. Its tools are now available through the plugin bridge.");
    pendingPlugin = null;
  });

  document.querySelectorAll("[data-close]").forEach(function (node) {
    node.addEventListener("click", function () {
      var target = document.getElementById(node.dataset.close);
      if (target) target.hidden = true;
      pendingPlugin = null;
    });
  });

  document.querySelectorAll(".ph-modal-backdrop").forEach(function (backdrop) {
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) { backdrop.hidden = true; pendingPlugin = null; }
    });
  });

  document.getElementById("runnerForm").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!runningPlugin) return;
    var args = {};
    (runningPlugin.form || []).forEach(function (field) {
      var input = document.getElementById("ph-field-" + field.name);
      args[field.name] = input ? input.value : "";
    });
    var submit = event.submitter || this.querySelector('[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = "Running…"; }
    runTool((runningPlugin.tools[0] || {}).name, args).then(function (response) {
      displayResult(response);
    }).catch(function (error) {
      document.getElementById("runnerOutput").textContent = error && error.message ? error.message : "The plugin could not complete that action.";
      document.getElementById("runnerLink").hidden = true;
      document.getElementById("runnerOutputWrap").hidden = false;
    }).finally(function () {
      if (submit) { submit.disabled = false; submit.textContent = runningPlugin && runningPlugin.id === "web-search" ? "Create search link" : "Run plugin"; }
    });
  });

  document.getElementById("copyResult").addEventListener("click", function () {
    var value = document.getElementById("runnerOutput").textContent || "";
    copyText(value, "Result copied.");
  });

  document.getElementById("importOpen").addEventListener("click", function () {
    document.getElementById("manifestInput").value = "";
    document.getElementById("importDialog").hidden = false;
    document.getElementById("manifestInput").focus();
  });

  document.getElementById("importForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var raw = document.getElementById("manifestInput").value;
    if (raw.length > 12000) { showToast("Manifest is too large. Maximum 12 KB."); return; }
    try {
      var plugin = validImportedManifest(JSON.parse(raw));
      state.custom.push(plugin);
      saveState();
      renderPlugins();
      document.getElementById("importDialog").hidden = true;
      showToast("Custom shortcut added. Enable it to make it available in your setup.");
    } catch (error) {
      showToast(error && error.message ? error.message : "Could not import that manifest.");
    }
  });

  document.getElementById("copyTools").addEventListener("click", function () {
    copyText(JSON.stringify(listTools(), null, 2), listTools().length ? "Enabled tool schemas copied." : "No runnable tools are enabled yet.");
  });

  document.getElementById("exportSetup").addEventListener("click", function () {
    copyText(JSON.stringify({ version: 1, enabled: getEnabledIds(), custom: state.custom }, null, 2), "Plugin setup exported to clipboard.");
  });

  document.getElementById("copyBridge").addEventListener("click", function () {
    copyText("const tools = window.MahiCloudPluginHost.listTools();\n// After checking the model-requested tool against the enabled list:\nconst result = await window.MahiCloudPluginHost.runTool(toolName, toolInput);", "Bridge example copied.");
  });

  function copyText(value, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { showToast(message); }).catch(function () { fallbackCopy(value, message); });
    } else fallbackCopy(value, message);
  }

  function fallbackCopy(value, message) {
    var box = el("textarea");
    box.value = value;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    box.remove();
    showToast(ok ? message : "Clipboard permission was unavailable. Select and copy the content manually.");
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      document.getElementById("pluginSearch").focus();
    }
    if (event.key === "Escape") {
      document.querySelectorAll(".ph-modal-backdrop:not([hidden])").forEach(function (modal) { modal.hidden = true; });
      pendingPlugin = null;
    }
  });

  renderPlugins();
})();