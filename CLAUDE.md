# Research Assistant

## Architecture
- **Backend**: Python FastAPI (`server/`) — proxies MCP and Zotero calls, handles export
- **Frontend**: Vanilla JS SPA (`static/`) — TipTap editor loaded from esm.sh CDN, no build step
- **Storage**: JSON files on disk (`data/projects/`) — one file per project, no database

## Running
```bash
cd /Users/home/projects/research-assistant
uv run uvicorn server.app:app --host 127.0.0.1 --port 8080 --reload
```
Open http://localhost:8080

## Key integrations
- **NotebookLM**: via `notebooklm-mcp` CLI subprocess (MCP stdio transport). Client in `server/mcp_client.py`
- **Zotero**: via Better BibTeX JSON-RPC at `localhost:23119`. Client in `server/zotero_client.py`
- **Export**: pandoc subprocess for DOCX/PDF. Handler in `server/export.py`

## File layout
```
server/
  app.py          — FastAPI app, lifespan, static mount
  config.py       — paths, URLs
  mcp_client.py   — NotebookLM MCP stdio client
  zotero_client.py — BBT JSON-RPC client
  export.py       — pandoc HTML->DOCX/PDF
  routes/
    projects.py   — CRUD for projects
    notebooks.py  — proxy NotebookLM queries
    zotero.py     — proxy Zotero search/export
    export.py     — download endpoints
static/
  index.html      — SPA shell, 3-pane layout
  css/style.css   — dark theme, CSS grid layout
  js/
    app.js        — boot, project management, export
    editor-pane.js — TipTap editor + citation node
    notebook-pane.js — chat interface for NotebookLM
    references-pane.js — Zotero references list + insert
    api.js        — fetch wrapper
```

## Conventions
- No build tooling — frontend loads deps from CDN
- Projects stored as `data/projects/{id}.json`
- MCP client auto-reconnects on failure
- Zotero collection lookup uses BBT `item.search` (no collection list API in BBT)
