# DocRight Refactor Architecture

## Goals
- Keep VS Code APIs at the edges only.
- Keep core logic pure and testable.
- Use typed message contracts between extension and webviews.
- Make settings explicit and editable via a single settings file.

## Module Boundaries
- `src/extension.ts`: VS Code entrypoint.
- `src/host/`: VS Code-specific adapters (workspace, notifications).
- `src/settings/`: Settings load/normalize/save (no VS Code imports).
- `src/project/`: Project bootstrapping and defaults (no VS Code imports).
- `src/core/`: Pure logic (prompt builder, XML, scope handling).
- `src/storage/`: File IO for DocRight project data.
- `src/webview/`: Webview HTML, message schemas, render helpers.
- `src/llm/`: LLM providers, streaming, prompt assembly adapters.

## Data Flow
1. Command -> host adapter resolves workspace root.
2. Settings module loads `.docright/settings.json` (defaults merged).
3. Core modules compute prompt / XML / scope updates.
4. Webview messages follow a typed protocol.
5. Storage layer persists iteration snapshots and project state.

## Settings
- Settings file: `.docright/settings.json` (per project).
- Defaults are in `src/settings/settings.ts`.
- Settings are normalized on load to guarantee valid values.

## Testing Strategy
- Unit: `src/core`, `src/settings` (pure logic).
- Contract: message schemas for webview messages.
- Integration: VS Code tests via `@vscode/test-electron`.
