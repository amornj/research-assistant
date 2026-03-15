# Echo QA Report — research-assistant

**Date:** 2026-03-15 17:59 GMT+7
**Server:** FastAPI on port 8181 (8080 was occupied by stale process)
**Commit:** a229561 (Replace Next.js scaffold with production-lean Python/FastAPI MVP)

## Test Results

| # | Test | Endpoint | Status | Notes |
|---|------|----------|--------|-------|
| 1 | Notebook listing | `GET /api/notebooks` | **PASS** (200) | Returned 51 notebooks with id, title, source_count, updated_at |
| 2 | Notebook query | `POST /api/notebooks/{id}/query` | **PASS** (200) | Queried "amyloidosis" notebook; received answer with sources_used, conversation_id, elapsed_ms (~23s) |
| 3 | Zotero collection lookup (search) | `GET /api/zotero/search?q=test` | **PASS** (200) | Returned 3 items from Zotero via BBT JSON-RPC |
| 4 | Zotero items listing | `GET /api/zotero/search?q=amyloidosis` | **PASS** (200) | Returned 13 items with key, title, creators, date, DOI, abstractNote |
| 5 | Project creation (end-to-end) | `POST /api/projects` + `GET /api/projects/{id}` | **PASS** (200) | Created project linked notebook_id correctly via name match; persisted to disk; retrievable by id |

## Summary

**5/5 tests passed.** All core integrations (NotebookLM MCP, Zotero BBT, project CRUD) are functional.

### Observations

- **MCP startup:** MCP client connected successfully via HTTP proxy (`homes-imac.tail459031.ts.net`), not stdio as originally configured — `mcp_client.py` may have been updated after CLAUDE.md was written.
- **Notebook query latency:** ~23 seconds for first query; acceptable for LLM-backed Q&A.
- **Project creation notebook matching:** Correctly resolved notebook name "amyloidosis" → id `ed0570ad-3df5-4652-b155-2e7494ceca8a` (case-insensitive match).
- **Zotero search:** BBT `item.search` works; returned duplicate entries for "Monoclonal IgM-related AL amyloidosis" (3 copies with different keys) — this is a Zotero library issue, not an app bug.
- **No collection-level browsing endpoint** exists (only search). This matches CLAUDE.md note about BBT lacking a collection list API.

### Not Tested (out of scope)

- Export (pandoc DOCX/PDF)
- Document save (`PUT /api/projects/{id}/document`)
- Frontend SPA rendering
- Source listing per notebook (`GET /api/notebooks/{id}/sources`)
