# GEMINI.md - Project Updates Summary

## 1. AI Models & OpenClaw Integration
- **OpenClaw ACP Integration**:
    - AI Writing connects to the local **OpenClaw** instance (gateway at ws://127.0.0.1:18789).
    - Uses `openclaw agent` CLI subprocess — no separate API key required (auth is in OpenClaw's own store).
    - **Available models**: Claude Opus 4.6 (`anthropic/claude-opus-4-6`), MiniMax M2.5 variants.
    - Google/Gemini models are filtered out from the model selector (Google auth not configured).
    - Default model set to `anthropic/claude-opus-4-6`.
- **Backend Logic**:
    - `server/openclaw_client.py` — CLI subprocess bridge with JSON parsing (`result.payloads[0].text`).
    - Each AI call uses a unique session ID to prevent history contamination between writing tasks.
    - `server/routes/ai.py` — no API key gate (local OpenClaw doesn't need one).

## 2. Multi-Stage Versioning System
- **Global Document Versions**:
    - 5-stage version history for global AI edits (bottom chatbox).
    - "Doc Versions" bar lets users revert entire document state.
- **Paragraph/Block Versioning**:
    - Each paragraph has unique `data-id` attribute (set in TipTap `CustomParagraph` extension).
    - Right-click context menu shows block history for the selected paragraph.
    - Revert specific paragraphs via the context menu.

## 3. Bug Fixes (Mar 16 2026)
- **Project creation was failing**: `mcp_client.list_notebooks()` had no try/except around
  subprocess. If `nlm` CLI had any issue, the entire `POST /api/projects` returned 500.
  Fixed: outer try/except returns `[]` on any failure; project is always created regardless.
- **AI writing was returning 503**: `OPENCLAW_API_KEY` env var check blocked all AI routes.
  Fixed: removed the check entirely (local OpenClaw CLI needs no API key).
- **`openclaw agent --model` was an invalid flag**: openclaw agent CLI has no `--model` flag.
  Fixed: removed flag. Model is controlled by the global openclaw default (set to Claude).
- **Export button gave no feedback** when no project was loaded. Fixed: shows alert.
- **Model selector showed Google (unavailable) models**. Fixed: backend filters to `available:true`
  and excludes `google/` prefix.

## 4. UI, UX & Stability
- **Resizing & Layout**: draggable vertical + horizontal dividers, min-height/min-width constraints.
- **Tabbed bottom pane**: AI Writing tab + Zotero tab.
- **Scrollability**: all panes scroll independently.

## 5. Persistence & Schema
- Projects stored as `data/projects/{id}.json`.
- Schema includes `document_versions` (list, max 5) and `block_versions` (dict keyed by data-id).
- Auto-save every 10 seconds.
