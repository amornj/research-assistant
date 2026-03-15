# GEO Wiring Spec — Research Assistant

Defines the target API contracts for replacing MCP-stdio NotebookLM and BBT-local Zotero with HTTP-based alternatives.

---

## 1. NotebookLM via HTTP Proxy

**Current**: MCP stdio subprocess (`notebooklm-mcp` CLI) in `server/mcp_client.py`
**Target**: HTTP proxy at `NLM_PROXY_URL`, authenticated with `NLM_PROXY_KEY`

### Env vars

| Variable | Example | Required |
|---|---|---|
| `NLM_PROXY_URL` | `https://nlm-proxy.example.com` | Yes |
| `NLM_PROXY_KEY` | `sk-nlm-...` | Yes |

### Auth

All requests include header: `Authorization: Bearer {NLM_PROXY_KEY}`

### Endpoints consumed

The proxy must expose these endpoints, matching the MCP tool semantics the app already uses:

#### `GET {NLM_PROXY_URL}/notebooks`

List all notebooks.

**Response** `200`:
```json
[
  { "id": "notebook-abc123", "title": "My Research Notebook" }
]
```

#### `GET {NLM_PROXY_URL}/notebooks/{notebook_id}`

Get single notebook metadata.

**Response** `200`:
```json
{ "id": "notebook-abc123", "title": "My Research Notebook", "sources": [...] }
```

#### `POST {NLM_PROXY_URL}/notebooks/{notebook_id}/query`

Query a notebook (chat).

**Request body**:
```json
{
  "query": "What does the paper say about X?",
  "conversation_id": "conv-xyz789"   // optional, for multi-turn
}
```

**Response** `200`:
```json
{
  "answer": "According to the sources...",
  "conversation_id": "conv-xyz789",
  "citations": [
    { "source_id": "src-1", "text": "relevant excerpt" }
  ]
}
```

#### `GET {NLM_PROXY_URL}/notebooks/{notebook_id}/sources`

List sources in a notebook.

**Response** `200`:
```json
[
  { "id": "src-1", "title": "Paper Title", "type": "pdf" }
]
```

### Client changes (`server/mcp_client.py`)

Replace MCP stdio transport with `httpx.AsyncClient`. The four public functions stay identical in signature:

| Function | Maps to |
|---|---|
| `list_notebooks()` | `GET /notebooks` |
| `get_notebook(notebook_id)` | `GET /notebooks/{notebook_id}` |
| `query_notebook(notebook_id, query, conversation_id?)` | `POST /notebooks/{notebook_id}/query` |
| `list_sources(notebook_id)` | `GET /notebooks/{notebook_id}/sources` |

`start()` becomes a no-op (or creates the httpx client). `stop()` closes the httpx client. No subprocess management.

### Error contract

| Status | Meaning |
|---|---|
| `401` | Bad or missing `NLM_PROXY_KEY` |
| `404` | Notebook not found |
| `429` | Rate limited — client should surface to user |
| `5xx` | Proxy/upstream error — log and return 502 to frontend |

---

## 2. Zotero Web API

**Current**: Better BibTeX JSON-RPC at `localhost:23119` in `server/zotero_client.py`
**Target**: Zotero Web API v3 at `https://api.zotero.org`

### Env vars

| Variable | Example | Required |
|---|---|---|
| `ZOTERO_API_KEY` | `abcDEF123...` | Yes |
| `ZOTERO_USER_ID` | `12345678` | Yes |

### Auth

All requests include header: `Zotero-API-Key: {ZOTERO_API_KEY}`

Base URL: `https://api.zotero.org/users/{ZOTERO_USER_ID}`

### Endpoints consumed

#### Search items

`GET /users/{user_id}/items?q={query}&format=json&include=data,citation,bib&limit=25`

Maps to current `search_items(query)`.

**Response** `200`: Array of Zotero item objects. Each has:
```json
{
  "key": "ABC12345",
  "data": {
    "itemType": "journalArticle",
    "title": "...",
    "creators": [{ "creatorType": "author", "firstName": "...", "lastName": "..." }],
    "date": "2024",
    "DOI": "10.1234/...",
    "extra": "Citation Key: smithPaper2024"
  },
  "citation": "<span>Smith (2024)</span>",
  "bib": "<div class=\"csl-entry\">...</div>"
}
```

**Citekey extraction**: The BBT citation key lives in `data.extra` as `Citation Key: {key}`. Parse with regex `Citation Key:\s*(\S+)`.

#### Export items (CSL-JSON)

`GET /users/{user_id}/items?itemKey={key1},{key2}&format=csljson`

Maps to current `export_items(citekeys)`.

**Note**: Zotero Web API indexes by item `key`, not citekey. The client must either:
1. Search by citekey via `q=` param first, then use the returned `key`, or
2. Maintain a local citekey→key mapping from prior searches.

**Response** `200`:
```json
{
  "items": [
    { "id": "ABC12345", "type": "article-journal", "title": "...", "author": [...] }
  ]
}
```

### Client changes (`server/zotero_client.py`)

| Current function | New implementation |
|---|---|
| `search_items(query)` | `GET /users/{uid}/items?q={query}&format=json&limit=25` |
| `export_items(citekeys)` | Resolve citekeys → item keys, then `GET /users/{uid}/items?itemKey=...&format=csljson` |
| `get_citation_keys(item_keys)` | Parse `extra` field from item data (no separate API call needed) |

Remove `_rpc()` helper entirely. Replace with standard `httpx.AsyncClient` against `api.zotero.org`.

### Error contract

| Status | Meaning |
|---|---|
| `403` | Invalid API key or insufficient permissions |
| `404` | Item/collection not found |
| `429` | Rate limited (Zotero uses `Retry-After` header) |

---

## 3. Project Creation Flow

**No changes to the HTTP API contract.** The route stays:

### `POST /api/projects`

**Request body**:
```json
{
  "name": "My Literature Review",
  "notebook_name": "Research Notebook",
  "zotero_collection": "machine-learning"
}
```

### Internal flow (what changes behind the scenes)

```
1. Frontend POSTs to /api/projects
2. Route handler calls mcp_client.list_notebooks()
   ├── CURRENT: MCP stdio → notebooklm-mcp subprocess
   └── NEW:     HTTP GET  → {NLM_PROXY_URL}/notebooks
3. Match notebook by name (case-insensitive title match)
   → Extract notebook_id from matched entry
   → If no match: notebook_id = null (project created anyway)
4. Generate project ID (uuid4 hex, 12 chars)
5. Write project JSON to data/projects/{id}.json
6. Return project object
```

### Stored project shape (`data/projects/{id}.json`)

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "My Literature Review",
  "notebook_name": "Research Notebook",
  "notebook_id": "notebook-abc123",
  "zotero_collection": "machine-learning",
  "document_html": "",
  "conversation_id": null,
  "created_at": "2026-03-15T10:30:00+00:00"
}
```

**`zotero_collection`** is stored as a string label. It is used as a search scope hint in the frontend references pane — the Zotero Web API equivalent is searching within a collection by name. With the Web API, we may resolve this to a collection key via `GET /users/{uid}/collections?q={name}` and then scope item searches to `GET /users/{uid}/collections/{collKey}/items`.

---

## Config changes (`server/config.py`)

Add:

```python
import os

NLM_PROXY_URL = os.environ.get("NLM_PROXY_URL", "")
NLM_PROXY_KEY = os.environ.get("NLM_PROXY_KEY", "")
ZOTERO_API_KEY = os.environ.get("ZOTERO_API_KEY", "")
ZOTERO_USER_ID = os.environ.get("ZOTERO_USER_ID", "")
ZOTERO_API_URL = f"https://api.zotero.org/users/{ZOTERO_USER_ID}" if ZOTERO_USER_ID else ""
```

Remove: `BBT_URL`

---

## Summary of file changes needed

| File | Action |
|---|---|
| `server/config.py` | Add env var reads, remove `BBT_URL` |
| `server/mcp_client.py` | Replace MCP stdio with httpx to `NLM_PROXY_URL` |
| `server/zotero_client.py` | Replace BBT JSON-RPC with Zotero Web API v3 |
| `server/app.py` | Simplify lifespan (no subprocess), remove `mcp` dependency |
| `server/routes/*` | No changes — route signatures and response shapes unchanged |
| `static/js/*` | No changes — frontend API calls unchanged |
| `requirements` / `pyproject.toml` | Remove `mcp` SDK dep; keep `httpx` |
