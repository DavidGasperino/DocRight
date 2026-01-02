# Refactor Guide

## Workflow
1. Add characterization tests for existing behavior before porting code.
2. Port one module at a time into the refactor extension.
3. Keep tests green after each module move.
4. Run integration tests after any webview or VS Code API change.

## Quality Gates
- No VS Code imports in `src/core/`.
- All public functions in `src/core/` and `src/settings/` have tests.
- Webview message types are documented and validated.
- No file writes outside the DocRight project root.

## Test Commands
- Unit + integration: `npm test`
- Lint: `npm run lint`
- Build only: `npm run compile`
- Webview bundle only: `npm run build:docright`

## Suggested Migration Order
1. Project bootstrap + settings.
2. Prompt and XML builders (pure core logic).
3. Scope selection + apply logic (pure core + webview adapter).
4. LLM provider + streaming.
5. Webview UI state management.

## Notes
- If you are migrating from another repo, keep a parallel branch until full parity is verified.
- Use the settings file for new configuration parameters.
