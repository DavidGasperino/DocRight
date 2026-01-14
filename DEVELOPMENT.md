# DocRight Developer Guide

This document is the primary developer reference for the DocRight VS Code extension. It is intended to help a new contributor understand the system quickly, run it locally, and make safe changes.

## Purpose and product summary
DocRight is a structured document editor with scoped LLM callouts. The product experience is:
- Write or paste content into a rich text editor (Lexical).
- Add inline and overall callouts to describe changes.
- Lock a scope (selection or full document).
- Generate a prompt, run an LLM, review the response.
- Apply changes only inside the locked scope.
- Save iterations for traceability.

## Local setup
Prerequisites:
- Node.js and npm (use `fnm` if you work across versions).
- VS Code.

Install dependencies:
```
eval "$(fnm env)"
npm install
```

Build webviews and TypeScript:
```
npm run compile
```

Run the extension:
- Press F5 to launch the Extension Development Host.
- In the host window, run `DocRight: Start Session`.

## Repo layout
```
src/
  extension.ts                  VS Code entrypoint
  host/                          VS Code adapters (panels, commands, Roo)
  core/                          Pure logic (scope, prompt, XML)
  storage/                       On-disk state IO
  webview/                       Webview HTML wrappers and message types
webview/                          Webview JS entrypoints (Lexical, UI)
media/                            Bundled webview JS (build output)
scripts/                          Build scripts
```

Important note: the live webview logic is in `webview/*.js`. `npm run build:docright` bundles those files into `media/`.

## Build pipeline
- `npm run build:docright` bundles webview JS into `media/` via `scripts/build-docright-editor.js`.
- `npm run compile` runs the webview bundle and TypeScript compilation.

## User flow (step-by-step)
1) Start session: creates `.docright/` and project defaults.
2) Editor opens: user writes in DocRight Document panel.
3) Callouts:
   - Inline callout: select text and add a callout.
   - Overall callout: define a global instruction.
4) Scope lock:
   - Use Selection locks to a range (markers inserted in Lexical).
   - Full Document locks to the whole document.
5) Generate prompt in Callouts panel.
6) LLM panel shows the prompt and receives response.
7) Apply updates: response replaces only the locked scope.
8) Save iteration: snapshot state in `.docright/iterations/`.

## Core data files
At the workspace root:
- `document.lexical.json` - Lexical editor state.
- `callouts.json` - inline and overall callouts.
- `contexts.json` - context items and active flags.
- `scope.json` - current scope selection and markerId.

Under `.docright/`:
- `docright.json` - project metadata.
- `settings.json` - user-editable settings.
- `llm/roo_response.html` - last LLM response.
- `iterations/` - snapshots and metadata.

## Scope mechanics
- The webview captures a selection payload from Lexical.
- It inserts hidden `ScopeMarkerNode` elements at selection boundaries.
- The markerId is stored in `scope.json`.
- The scope overlay uses DOM ranges derived from markers.
- Apply reconstructs a selection from markers and replaces the range.

Key files:
- `src/core/scope.ts` (serialized scope state)
- `webview/docright-editor.js` (marker insertion, overlay, apply)

## Prompt and LLM pipeline
- Callouts are converted to XML (`src/core/callouts-xml.ts`).
- Scope and context are embedded in the prompt (`src/core/prompt.ts`).
- Roo integration watches `.docright/llm/roo_response.html` (`src/host/roo.ts`).
- Summary bullets are extracted and stored (`src/llm/summary.ts`).

## Debugging
- Extension Host logs: `View -> Output -> Extension Host`.
- Webview console: `Developer: Open Webview Developer Tools`.
- Scope/apply traces: `.docright/logs/ui-debug.log`.
  - `docright.scope.trace` shows selection source and marker info.
  - `docright.apply.trace` shows selection before/after removal.

## Tests
- Unit tests live under `src/test/suite/`.
- Run all tests:
```
npm test
```

## Common tasks for contributors
### Add a new webview message
1) Update `src/webview/*-messages.ts` with the new message type.
2) Handle it in the webview JS (`webview/*.js`).
3) Handle it in the host (`src/host/*-host.ts`).
4) Add logging if the workflow is user-visible.

### Update editor behavior
1) Edit `webview/docright-editor.js`.
2) Run `npm run build:docright` or `npm run compile`.
3) Reload the Extension Development Host.

### Update prompt output
1) Change `src/core/prompt.ts` or `src/core/callouts-xml.ts`.
2) Run `npm run compile`.

## Strengths and weaknesses
Strengths:
- Deterministic scoped replacements via marker-based ranges.
- Clear separation between VS Code host and webview logic.
- Persistent on-disk state that is easy to inspect and version.

Weaknesses:
- Webview code is JS, so type safety is limited in the UI layer.
- Scope logic is subtle and depends on Lexical behavior.
- Timeline provider uses a proposed API that may require flags during dev.

## Packaging
```
npm run compile
npx @vscode/vsce package
```

## Release checklist
1) `npm run compile`
2) `npm test`
3) `npx @vscode/vsce package`
4) Install the VSIX in a clean VS Code window and smoke-test the flow.
