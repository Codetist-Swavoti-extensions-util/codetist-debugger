# Codetist debugger extension starter

This directory is a forkable TypeScript debugger extension starter. It demonstrates the Codetist extension manifest, a TypeScript Debug Adapter Protocol (DAP) process, and an optional webview UI. The sample adapter is a protocol demo; replace its simulated execution with your language runtime or a DAP-compatible adapter.

## Build

```sh
npm install
npm run build
```

The built adapter is `dist/adapter.js`. Install or copy this extension into the workspace's `.extensions` directory, then open the extension in Codetist. If a webview entry is present, **Open debugger UI** opens it in its own editor tab. The extension details page also provides built-in launch controls, so a debugger contribution does not require a webview.

## Manifest

`codetist-extension.json` contributes a debugger type and its process:

```json
{
  "contributes": {
    "debuggers": [
      {
        "type": "codetist-sample",
        "label": "Codetist DAP Sample",
        "languages": ["typescript", "javascript"],
        "adapter": {
          "command": "node",
          "args": ["${extensionPath}/dist/adapter.js"]
        }
      }
    ]
  },
  "webview": {
    "entry": "webview/index.html"
  }
}
```

The host expands `${extensionPath}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${file}`, `${fileDirname}`, and `${fileBasename}` in adapter commands and arguments. It starts the adapter without a shell and asks the user to approve each launch. DAP requests and messages are transported over the adapter's standard input and output using `Content-Length` framing.

## Webview API

The injected `ideAPI` exposes:

- `getProjectContext()` — project type, active file, active language, and LSP language/status.
- `getDiagnostics()` — current workspace diagnostics.
- `debug.startSession(type, configuration)` — start the matching manifest contribution after user approval.
- `debug.sendRequest(sessionId, request)` — send a DAP request; the adapter host assigns the DAP sequence number.
- `debug.stopSession(sessionId)` — stop the adapter process.
- `on('debugMessage', callback)` — receive DAP messages, adapter output/errors, and process exit notifications.
- `on('projectContextChanged', callback)` — observe project and active-file context changes.
- `readFile`, `getActiveFilePath`, and `getTerminalOutput`.

The UI sends DAP `initialize` and `launch` requests after starting a session. The sample adapter returns a simulated thread and stack frame so the request/response/event flow can be exercised without attaching to a real runtime. Add launch configuration validation and runtime-specific behavior when building a real debugger.

## Project type signals

Codetist currently derives the project type from workspace files such as `pubspec.yaml`, `package.json`, `tsconfig.json`, `Cargo.toml`, and `go.mod`. The LSP context reports the active file's language and Codetist's current LSP status; it does not infer a debugger or substitute for a language server's project model.
