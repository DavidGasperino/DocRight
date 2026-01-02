# LLM Callouts (Refactor)

This repository contains the refactored DocRight extension.

## Run the Extension
- `code --extensionDevelopmentPath=.`

## Commands
- `DocRight: Start Session` (creates project if needed)
- `DocRight: Open Editor`
- `DocRight: Open LLM Panel`
- `DocRight: Set Scope to Selection`
- `DocRight: Set Scope to Full Document`

## Scripts
- Build: `npm run compile` (includes webview bundle)
- Webview bundle only: `npm run build:docright`
- Lint: `npm run lint`
- Test: `npm test`

## Settings
- Per-project settings live at `.docright/settings.json`.
- Defaults are defined in `src/settings/settings.ts`.
