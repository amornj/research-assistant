# CLAUDE.md

## Project
`research-assistant` is a webapp that blends:
- NotebookLM-style grounded question answering
- AI-assisted long-form writing
- Zotero-backed references

## Core UX
- **Project setup** asks for NotebookLM notebook name and Zotero collection name
- **Left pane** is NotebookLM-style ask/generate
- **Right pane** is an editable block-based writing surface
- **Bottom-right pane** shows Zotero references for the selected collection
- References attach to writing blocks so they move with the content when blocks are reordered

## Key architectural choice
The writing pane uses **block-level anchoring** rather than raw inline text references. This keeps manual references attached to the content block when paragraphs move.

## API routes
- `/api/notebooks` — list available NotebookLM notebooks via local CLI if configured
- `/api/notebooklm` — query NotebookLM proxy
- `/api/zotero/collection` — resolve/create Zotero collection by name
- `/api/zotero/items` — fetch Zotero collection items for reference pane

## Export
- DOCX via `docx`
- PDF via `jspdf`

## Required env for full functionality
- `NLM_PROXY_URL`
- `NLM_PROXY_KEY`
- `NLM_CLI_PATH` (optional; for local notebook listing)
- `ZOTERO_API_KEY`
- `ZOTERO_USER_ID`
- optional `ZOTERO_API_BASE`

## MVP caveats
- Notebook listing by name depends on local `nlm` CLI availability
- Right-pane writing is block-based, not yet a full rich-text editor
- Reference insertion is manual click-to-attach; journal-style inline citation formatting is not fully automated yet
- PDF export is client-side layout, not a print-perfect journal formatter
