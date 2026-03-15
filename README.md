# Research Assistant

A local webapp for research writing that integrates NotebookLM (AI-powered notebook queries) with Zotero (reference management) in a unified workspace.

## Features

- **Project-based workflow** — create projects linked to a NotebookLM notebook and Zotero collection
- **NotebookLM chat** (left pane) — ask questions, generate summaries, insert responses into your document
- **Rich text editor** (right pane) — TipTap-based editor with formatting toolbar
- **Zotero references** (bottom-right) — browse and filter references, insert inline citations
- **Export** — download as DOCX or PDF via pandoc

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [pandoc](https://pandoc.org/) (for export)
- [Zotero](https://www.zotero.org/) with [Better BibTeX](https://retorque.re/zotero-better-bibtex/) running locally
- [notebooklm-mcp](https://github.com/nicholasgasior/notebooklm-mcp) CLI authenticated

## Setup

```bash
cd research-assistant
uv sync
uv run uvicorn server.app:app --host 127.0.0.1 --port 8080 --reload
```

Open http://localhost:8080

## Usage

1. Click **+ New Project** — enter a name, your NotebookLM notebook name, and a Zotero search term
2. Use the left pane to query your notebook — click "Insert into document" to add content
3. Write and edit in the main editor with formatting tools
4. Browse references in the bottom-right — click **Insert** to add inline citations
5. Export your document as DOCX or PDF

## Architecture

| Layer | Tech | Purpose |
|-------|------|---------|
| Backend | FastAPI + uvicorn | API proxy, project storage, export |
| Frontend | Vanilla JS + TipTap (CDN) | SPA, no build step |
| NotebookLM | MCP stdio client | AI notebook queries |
| Zotero | BBT JSON-RPC | Reference search and export |
| Export | pandoc | HTML to DOCX/PDF |
| Storage | JSON files | One file per project, no database |
