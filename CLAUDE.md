# Research Assistant

## Architecture
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 (dark theme)
- **State**: Zustand — projects stored in browser `localStorage`
- **AI**: Anthropic SDK (`@anthropic-ai/sdk`) — Claude Sonnet via `/api/ai/*` routes
- **No database, no build step dependencies** — pure Next.js, deployable to Vercel

## Running
```bash
cd /Users/home/projects/research-assistant
npm run dev
```
Open http://localhost:3000

Requires `.env` with:
```
NLM_PROXY_URL=https://homes-imac.tail459031.ts.net
NLM_PROXY_KEY=cto-coach-2026
ZOTERO_API_KEY=BIkDlKKe6aVYG0ncz4YVbEEI
ZOTERO_USER_ID=7734498
ANTHROPIC_API_KEY=<your key>
```

## Key integrations
- **NotebookLM**: proxied via `/api/notebooks/query` and `/api/notebooks/list` → Tailscale HTTP proxy
- **Zotero**: proxied via `/api/zotero/search` → api.zotero.org
- **AI Rewrite**: `/api/ai/rewrite` → Anthropic (per-block rewrite)
- **AI Chat**: `/api/ai/chat` (doc-aware) and `/api/ai/general` → Anthropic

## File layout
```
app/
  layout.tsx         — dark theme root layout
  page.tsx           — renders MainApp
  globals.css        — CSS variables + custom classes (block-content, version-pill, etc.)
  api/
    notebooks/list/  — GET: list NLM notebooks
    notebooks/query/ — POST: query NLM
    zotero/search/   — GET: search Zotero library
    ai/rewrite/      — POST: rewrite block text
    ai/chat/         — POST: document-aware AI chat
    ai/general/      — POST: general AI Q&A
components/
  MainApp.tsx        — 3-pane layout + resizable dividers
  TopBar.tsx         — project selector, new project, export
  NotebookPane.tsx   — NLM chat with insert-to-editor
  BlockEditor.tsx    — THE CORE: contentEditable blocks, DnD, versions, AI popup
  EditorToolbar.tsx  — execCommand formatting toolbar
  BlockAIPopup.tsx   — floating AI rewrite popup with presets
  BottomPane.tsx     — tabbed container
  AIWritingTab.tsx   — general chat + doc-aware write mode
  ZoteroTab.tsx      — Zotero search + citation insert
  NewProjectModal.tsx — project creation dialog
store/
  useStore.ts        — Zustand store (projects, blocks, chat, versions)
types/
  index.ts           — Block, Project, ChatMessage interfaces
```

## Storage structure (localStorage)
```ts
interface Block {
  id: string;
  type: string;
  versions: { html: string; ts: number; instruction: string | null }[];
  activeVersion: number;
}
interface Project {
  id: string;
  name: string;
  notebookName: string;
  notebookId: string | null;
  zoteroCollection: string;
  blocks: Block[];
  chatHistory: { role: string; content: string; showInsert?: boolean }[];
  conversationId: string | null;
  createdAt: string;
}
```

## Conventions
- All interactive components use `"use client"` directive
- `contentEditable` blocks use refs (not controlled state) — set innerHTML on mount/version-switch, read on blur
- Insert-to-editor uses `window.__insertToEditor` as a cross-component bridge
- Auto-save debounced 500ms to localStorage on block changes
- Export: client-side Markdown and HTML (no pandoc)
