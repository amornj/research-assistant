# Research Assistant

A local webapp for research writing that integrates NotebookLM (AI-powered notebook queries) and MiniMax 2.5 (AI writing assistance) with Zotero (reference management) in a unified workspace.

## Features

- **Project-based workflow** — create projects linked to a NotebookLM notebook and Zotero collection
- **NotebookLM chat** (left pane) — ask questions, generate summaries, insert responses into your document
- **AI Writing** (left pane tab) — rewrite selected text or chat-edit your writing via MiniMax 2.5 with OAuth
- **Rich text editor** (right pane) — TipTap-based editor with formatting toolbar
- **Zotero references** (bottom-right) — browse and filter references, insert inline citations
- **Export** — download as DOCX or PDF via pandoc

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [pandoc](https://pandoc.org/) (for export)
- [Zotero](https://www.zotero.org/) running locally with a [Zotero Web API key](https://www.zotero.org/settings/keys)
- [notebooklm-mcp](https://github.com/nicholasgasior/notebooklm-mcp) CLI authenticated

## Setup

```bash
cd research-assistant
uv sync
```

Create a `.env` file with:

```
NLM_PROXY_URL=http://your-tailscale-ip:8080/query
NLM_PROXY_KEY=your-notebooklm-proxy-key
NLM_CLI_PATH=/Users/home/.local/bin/nlm
ZOTERO_API_KEY=your-zotero-api-key
ZOTERO_USER_ID=your-zotero-user-id
```

Run:

```bash
uv run uvicorn server.app:app --host 127.0.0.1 --port 8081 --reload
```

Open http://localhost:8081

## Usage

1. Click **+ New Project** — enter a name, your NotebookLM notebook name, and a Zotero search term
2. Use the left pane to query your notebook — click "Insert into document" to add content
3. Switch to **AI Writing** tab to rewrite selected text or chat with MiniMax
4. Write and edit in the main editor with formatting tools
5. Browse references in the bottom-right — click **Insert** to add inline citations
6. Export your document as DOCX or PDF

## Architecture

| Layer | Tech | Purpose |
|-------|------|---------|
| Backend | FastAPI + uvicorn | API proxy, project storage, export |
| Frontend | Vanilla JS + TipTap (CDN) | SPA, no build step |
| NotebookLM | HTTP proxy via Tailscale | AI notebook queries |
| Zotero | Web API v3 | Reference search and export |
| AI Writing | MiniMax 2.5 via OAuth | Rewrite & chat-edit |
| OpenClaw | Gateway proxy (Phase 1) | OAuth token management |
| Export | pandoc | HTML to DOCX/PDF |
| Storage | JSON files | One file per project, no database |
