# DocRight Developer Guide

This document is an internal developer reference for the DocRight VS Code extension. It is exhaustive by design and should not be packaged into the VSIX.

## Purpose and Intent
DocRight is a VS Code extension for structured document editing with scoped LLM callouts. It helps users:
- Author a document in a rich-text editor panel (Lexical).
- Add inline and overall callouts to drive targeted edits.
- Generate a structured LLM prompt and apply changes to a specific scope.
- Save and restore iterations with a git-like timeline.
- Integrate with Roo Code to execute LLM tasks and ingest the result.

The extension prioritizes:
- Clear separation of concerns (host logic vs. webviews vs. storage).
- Safe, reproducible project state on disk (under `.docright/`).
- A user flow that preserves context and allows rollback/forking.

## High-Level Architecture
The extension is organized into these layers:

1) Host layer (TypeScript in `src/host/`)
   - Owns VS Code APIs, webview panels, commands, and integrations.
   - Handles control flow and state synchronization.

2) Core and LLM layer (`src/core/`, `src/llm/`)
   - Builds prompts, XML, summary extraction, and LLM state management.

3) Storage layer (`src/storage/`)
   - Read/write project files under `.docright/`.
   - Iterations snapshotting and restore.

4) Webviews (`src/webview/` and bundled JS in `webview/`)
   - HTML/CSS/JS for panels and UI interactions.
   - Bundled into `media/` via `scripts/build-docright-editor.js`.

## Extension Entry Point
File: `src/extension.ts`

Key responsibilities:
- Register commands (Start Session, Open Editor, Open LLM Panel, etc.).
- Create and manage host instances (editor, callouts, LLM, Roo, timeline).
- Register Quickstart view and Timeline provider.
- Orchestrate session flow (new vs resume).

### Commands
Primary commands:
- `DocRight: Start Session` (`docRight.startSession`)
- `DocRight: Start New Session` (`docRight.startSessionNew`)
- `DocRight: Resume Session` (`docRight.startSessionResume`)
- `DocRight: Open Editor` (`docRightRefactor.openEditor`)
- `DocRight: Open LLM Panel` (`docRightRefactor.openLlmPanel`)
- `DocRight: Set Scope to Selection` (`docRightRefactor.setScopeSelection`)
- `DocRight: Set Scope to Full Document` (`docRightRefactor.setScopeFull`)
- `DocRight: Show Iteration Details` (`docRight.timeline.showDetails`)

Quickstart view is registered under `docRight.quickstart` and is a webview view container in the Activity Bar.

## Core User Flow
1) Start Session:
   - New: create `.docright/` with defaults.
   - Resume: load existing project and state.
2) Editor + Callouts panels open.
3) User adds inline/overall callouts and optionally context files.
4) Generate Prompt in Callouts panel:
   - Builds XML prompt with scope + callouts + active contexts.
5) LLM panel displays the prompt + receives response from Roo.
6) Apply:
   - Pre-apply iteration is auto-saved.
   - Response is applied to the Lexical document.
   - Callouts are cleared.

## Panels and Webviews

### DocRight Editor Panel
Host: `src/host/docright-editor-host.ts`
Webview: `src/webview/docright-editor.ts` (bundled to `media/docright-editor.js`)
Role:
- Lexical editor for the document.
- Applies scoped edits on request.
- Syncs document state to `document.lexical.json`.

### DocRight Callouts Panel
Host: `src/host/callouts-panel-host.ts`
Webview: `src/webview/callouts-panel.ts` (bundled to `media/callouts-panel.js`)
Role:
- Manage inline and overall callouts.
- Manage context files with per-iteration activation checkboxes.
- Generate prompt.
- Save/restore iterations.
- Launch Timeline popup.

Notable behaviors:
- Generate Prompt is disabled if there are no callouts.
- Context Insert button is only enabled when the selected context is active.
- Context checkboxes reset after Send to Roo or Apply.

### DocRight LLM Panel
Host: `src/host/llm-panel-host.ts`
Webview: `src/webview/llm-panel.ts` (bundled to `media/llm-panel.js`)
Role:
- Display prompt and response.
- Uses Lexical to render the response preview (read-only).
- Send to Roo, Apply, Reject, Save Iteration.

Reject clears the response preview and resets apply state.

### Quickstart View
Host: `src/host/quickstart-view.ts`
View: `docRight.quickstart`
Role:
- Activity Bar entry point.
- Buttons for Start Session and Resume Session.

### Timeline Popup
Host: `src/host/timeline-panel-host.ts`
Webview: `src/webview/timeline-panel.ts` (bundled to `media/timeline-panel.js`)
Role:
- Git-like graph of iterations.
- Hover tooltip shows the summary bullets and metadata.
- Clicking a node opens a markdown details view.

### Timeline Provider (Explorer Timeline)
Host: `src/host/timeline.ts`
Role:
- Integrates with VS Code Timeline view (proposed API).
- Requires `enabledApiProposals: ["timeline"]` and launch flag for dev/test.
- Separate from Timeline popup (the popup is safe for normal installs).

## LLM and Roo Integration

### LLM Controller
File: `src/llm/controller.ts`
- Manages prompt/response state and sync to webview.
- Tracks summary bullets extracted from the Roo response.
- Clears summary on prompt changes.

### Roo Integration
File: `src/host/roo.ts`
Flow:
- `sendPrompt()` writes a blank `roo_response.html` file, starts a watcher.
- Sends a structured prompt to Roo, including output instructions and summary block instructions.
- Watches for the output file to update and parses the response.
- Summary is extracted from HTML comments and removed from visible response.

Mode switching:
- Sends `/ask` to Roo before prompt, so Roo stays in Ask mode.

### Summary Extraction
Files: `src/llm/summary.ts`
- Summary is embedded in the LLM output inside HTML comment markers.
- Extracted, removed from response, and stored as iteration summary bullets.

## Iterations and Timeline
File: `src/storage/docright-iterations.ts`
- Each iteration is a snapshot under `.docright/iterations/<id>/`.
- Snapshots include document, callouts, scope, contexts, LLM session, and `roo_response.html`.
- Metadata includes parent relationship and summary bullets.
- State file `.docright/iterations/state.json` stores `headId`.

Auto-save:
- Triggered pre-apply (before changes are written to the document).
Manual save:
- Prompts user for summary bullets.

## Context Files
File: `src/storage/docright-contexts.ts`
- Stored in `.docright/contexts.json`.
- Each context has an `active` flag.
- Only active contexts are included in the prompt XML.

## Project Files
Core files (workspace root):
- `document.lexical.json`
- `callouts.json`
- `contexts.json`
- `scope.json`

DocRight metadata:
- `.docright/docright.json`
- `.docright/settings.json`
- `.docright/llm/session.json`
- `.docright/llm/roo_response.html`
- `.docright/iterations/`

## Build and Test
Commands:
- `npm run build:docright` (bundle webviews)
- `npm run compile` (webviews + TypeScript)
- `npm test`

Proposed API:
- Timeline provider requires `--enable-proposed-api davidgasperino.docright` for dev/test.

## Packaging
VSIX:
- `npx @vscode/vsce package`

Packaging exclusions:
- `.vscodeignore` excludes dev-only files (source, tests, docs).

## Debugging Tips
- Extension host output: `View > Output > Extension Host`.
- Webview logs: use `Developer: Open Webview Developer Tools`.
- Roo output is written to `.docright/llm/roo_response.html`.

## Common Issues
- Missing search bar: rebuild with `npm run compile`.
- Timeline view empty: open `document.lexical.json` and ensure iterations exist.
- Roo response not updating: check watcher and output file path.

## Release Checklist
1) `npm run compile`
2) `npm test`
3) `npx @vscode/vsce package`
4) Test VSIX in a clean VS Code window.
