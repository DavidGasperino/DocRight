# DocRight Architecture

## Overview
DocRight is a VS Code extension for structured document editing with scoped LLM callouts. It is built as a classic VS Code extension with host-side TypeScript, multiple webviews for UI, and a persistent project state on disk. The core design goals are: scoped edits, reproducible document state, and a clear boundary between VS Code APIs and pure logic.

## System boundaries
- VS Code host layer owns commands, panels, and disk IO.
- Webviews own UI and Lexical editor logic.
- Core modules are pure logic and do not import VS Code.
- Storage modules serialize DocRight state under `.docright/`.

## Major components
### Extension entrypoint
- `src/extension.ts`
- Registers commands, creates panel hosts, and wires the session lifecycle.

### Host layer (VS Code adapters)
- `src/host/docright-editor-host.ts`
  - Owns DocRight Document panel.
  - Persists document state to `document.lexical.json`.
  - Manages scope state and apply requests.
- `src/host/callouts-panel-host.ts`
  - Owns Callouts panel UI.
  - Saves inline and overall callouts to `callouts.json`.
  - Builds the prompt payload and launches the LLM flow.
- `src/host/llm-panel-host.ts`
  - Owns LLM panel UI.
  - Displays prompt and response preview.
  - Applies response to the DocRight Document.
- `src/host/roo.ts`
  - Integrates with Roo Code by writing `roo_response.html` and watching for updates.
- `src/host/timeline.ts` and `src/host/timeline-panel-host.ts`
  - Timeline popup and optional VS Code timeline provider.
- `src/host/ui-diagnostics.ts`
  - Appends `ui-debug.log` traces for scope and apply events.

### Webviews (UI)
- `webview/docright-editor.js` -> bundled to `media/docright-editor.js`
  - Lexical editor, scope markers, selection overlay, apply logic.
- `webview/callouts-panel.js` -> bundled to `media/callouts-panel.js`
  - Callouts UI, contexts, prompt generation.
- `webview/llm-panel.js` -> bundled to `media/llm-panel.js`
  - Prompt display and response preview.
- `webview/timeline-panel.js` -> bundled to `media/timeline-panel.js`

### Core logic
- `src/core/`
  - `scope.ts` defines the persisted scope state.
  - `prompt.ts` and `callouts-xml.ts` build the prompt XML.

### Storage layer
- `src/storage/` reads and writes project files:
  - `document.lexical.json`, `callouts.json`, `contexts.json`, `scope.json`
  - `.docright/settings.json`, `.docright/docright.json`
  - `.docright/llm/roo_response.html` and session metadata
  - `.docright/iterations/` snapshots and metadata

## Scope and selection
DocRight uses a locked scope to guarantee deterministic LLM applies:
- A selection payload is captured in the editor webview.
- The editor inserts hidden `ScopeMarkerNode` elements at the selection boundaries.
- The markerId and selection payload are persisted in `scope.json`.
- The scope overlay uses DOM ranges derived from markers to draw a bounding box.

This approach avoids ambiguity when the document changes or the user clicks elsewhere.

## Apply pipeline (LLM response -> document)
1) LLM panel produces HTML response (from Roo or another LLM).
2) The DocRight editor parses the response:
   - Strips summary comments and DocRight markers.
   - Ensures the response contains block HTML.
   - Converts DOM to Lexical nodes.
3) The scope range is reconstructed from markers (preferred) or selection payload.
4) The selected content is removed and replaced with the response nodes.
5) The document state is saved and the scope overlay is refreshed.

## Prompt pipeline
1) Callouts panel collects inline and overall callouts.
2) Active contexts and scope metadata are assembled into XML.
3) The prompt is sent to the LLM panel and Roo.
4) The response is displayed in the LLM panel and can be applied.

## Strengths
- Deterministic scoped editing via marker-based ranges.
- Clear separation of concerns between host, core, webview, and storage.
- Persistent on-disk project state that is easy to inspect and version.
- Diagnostics logging for scope and apply flows.

## Weaknesses and tradeoffs
- Webview logic lives in `webview/*.js` (not TypeScript), which can be harder to refactor.
- Scope and selection logic is non-trivial and depends on Lexical internals.
- Timeline provider uses a proposed VS Code API and is optional for users.
- LLM workflow assumes Roo Code integration; other providers require manual prompt handling.

## User flow and experience
1) User starts a session and opens the DocRight Document panel.
2) User writes or imports content in the Lexical editor.
3) User adds callouts to guide edits.
4) User locks scope to a selection or the full document.
5) User generates a prompt and runs an LLM.
6) User reviews the response preview and applies changes to the locked scope.
7) DocRight saves state and optionally stores an iteration snapshot.

This flow keeps edits focused, traceable, and reversible.
