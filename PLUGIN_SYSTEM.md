# MahiCloud Plugin System

## What is included

- `/plugins/` is the plugin directory and manager.
- Built-in tools: web-search link generation, calculator, JSON formatter/validator, text tools, and date/time.
- Users enable plugins explicitly; enabling displays the plugin's permission list first.
- Enabled plugin settings are stored in the current browser under `mc:plugin-hub:v1`.
- Users may import a JSON manifest for a custom HTTPS shortcut. Custom manifests are link-only: they cannot ship JavaScript, call arbitrary APIs, or receive credentials.
- The manager exposes a permission-checked, same-origin tool interface.

## Tool interface

Load `/plugins/plugins.js` on a same-origin page. When the page is not the Plugin Hub, the script registers the runtime and exits before initializing the Hub UI.

```js
const availableTools = window.MahiCloudPluginHost.listTools();

// Only offer availableTools to the model. The tool runner checks that a plugin
// remains enabled and rejects tool names that are not in the enabled registry.
const result = await window.MahiCloudPluginHost.runTool("calculator_evaluate", {
  expression: "(18.5 * 4) / 2"
});
```

Available methods:

- `listPlugins()`: return plugin metadata.
- `listEnabledPlugins()`: return enabled plugin metadata and tool schemas.
- `listTools()`: return tool schemas for enabled built-in plugins only.
- `runTool(name, input)`: invoke one enabled built-in tool.
- `isEnabled(id)`: check whether a plugin is enabled.

The runtime emits a `mahicloud:plugin-state-change` browser event when settings change. It is not an authorization boundary for a remote server: a server must independently validate permissions, user identity and tool inputs.

## Adding a built-in tool

1. Add a plugin descriptor to `BUILTINS` in `web/plugins/plugins.js`.
2. Give it a stable, unique `id`, a permission list, and one or more tool definitions with JSON input schemas.
3. Implement its `run` handler without `eval`, dynamic script loading, or secrets in browser code.
4. Validate inputs and cap input sizes in the handler.
5. Add regression tests for the new tool and its permission behavior.

Custom imported manifests intentionally support only HTTPS links; they do not load remote JavaScript or implement OAuth connectors.

## AI chat integration boundary

MahiCloud's current `/mahi-ai` route redirects to the home page, so there is no active chat interface in this repository to invoke tools automatically. The runtime bridge is ready for a same-origin chat UI that implements the model's tool-call loop. Third-party integrations such as GitHub, Google Drive, Slack or calendar require their own authenticated server-side connector, per-user consent, scoped OAuth tokens, and secret storage; the Plugin Hub does not claim those integrations are connected.
