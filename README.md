# DocRight

DocRight is a VS Code extension for structured document editing with scoped LLM callouts. It provides a rich text editor, a callouts workflow that turns edits into structured instructions, and a safe apply step that only replaces the scoped range.

## How to use
1) Command Palette -> DocRight: Start Session (creates .docright project files)
2) Open panels:
   - DocRight: Open Editor
   - DocRight: Open LLM Panel
3) Write in the DocRight Document.
4) Add callouts:
   - Inline callout: select text and add a callout
   - Overall callout: describe a global change
5) Lock scope:
   - Use Selection for a specific range
   - Full Document for global changes
6) Generate prompt in the Callouts panel and send to Roo (or copy the prompt to your LLM).
7) Review Response (preview) and Apply to DocRight to replace the scoped text.
8) Save an iteration when needed.

## Local development
1) Install dependencies:
```
eval "$(fnm env)"
npm install
```
2) Build:
```
npm run compile
```
3) Run the extension: press F5 and run `DocRight: Start Session` in the Extension Development Host.

## Common commands
- DocRight: Start Session
- DocRight: Open Editor
- DocRight: Open LLM Panel
- DocRight: Set Scope to Selection
- DocRight: Set Scope to Full Document

## Packaging
```
npm run compile
npx @vscode/vsce package
```

## License
MIT
