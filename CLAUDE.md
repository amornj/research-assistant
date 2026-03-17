# Research Assistant

## Architecture
- **Backend**: Python FastAPI (`server/`) — proxies MCP and Zotero calls, handles export
- **Frontend**: Vanilla JS SPA (`static/`) — TipTap editor loaded from esm.sh CDN, no build step
- **Storage**: JSON files on disk (`data/projects/`) — one file per project, no database

## Running
```bash
cd /Users/home/projects/research-assistant
uv run uvicorn server.app:app --host 127.0.0.1 --port 8081 --reload
```
Open http://localhost:8081

Requires `.env` with: `NLM_PROXY_URL`, `NLM_PROXY_KEY`, `NLM_CLI_PATH`, `ZOTERO_API_KEY`, `ZOTERO_USER_ID`

## Key integrations
- **NotebookLM**: queries via Tailscale HTTP proxy (`NLM_PROXY_URL/query`), listing via `nlm` CLI. Client in `server/mcp_client.py`
- **Zotero**: via Zotero Web API v3 (`api.zotero.org`). Client in `server/zotero_client.py`
- **Export**: pandoc subprocess for DOCX/PDF. Handler in `server/export.py`
- **MiniMax via OpenClaw**: uses OpenClaw Gateway as OAuth proxy. Client in `server/openclaw_client.py`
- **MiniMax Direct**: uses OAuth 2.0 directly. Client integrated in `server/routes/ai.py`

## File layout
```
server/
  app.py          — FastAPI app, lifespan, static mount
  config.py       — paths, URLs
  mcp_client.py   — NotebookLM HTTP proxy + CLI client
  zotero_client.py — Zotero Web API v3 client
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
- Config via `.env` file loaded by python-dotenv
- NLM queries go through Tailscale proxy; notebook/source listing via local `nlm` CLI
- Zotero search uses Web API `/items?q=` endpoint; export fetches CSL-JSON per item key
