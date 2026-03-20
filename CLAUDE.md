# Research Assistant

## Architecture
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 (dark theme)
- **State**: Zustand — projects stored in browser `localStorage`
- **AI**: OpenClaw gateway (`/api/ai/*`) — Claude Sonnet 4.6 + Gemini Flash via `OPENCLAW_API_URL`
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
OPENCLAW_API_URL=<openclaw gateway url>
OPENCLAW_API_KEY=<openclaw key>
```

## Key integrations
- **NotebookLM**: proxied via `/api/notebooks/query` and `/api/notebooks/list` → Tailscale HTTP proxy
- **Zotero**: proxied via `/api/zotero/search` → api.zotero.org (collection-scoped per project)
- **DOI verification**: `/api/doi/verify` → doi.org HEAD check
- **CrossRef**: `/api/crossref/lookup` → api.crossref.org (auto-fill missing metadata)
- **PDF extraction**: `/api/pdf/extract` → pdf-parse + AI summarisation
- **URL import**: `/api/url/extract` → OpenGraph/Schema.org scrape + AI summary
- **AI Rewrite**: `/api/ai/rewrite` → OpenClaw (contextual per-block rewrite)
- **AI Chat**: `/api/ai/general` → OpenClaw (general + document-context mode)

## File layout
```
app/
  layout.tsx              — dark theme root layout
  page.tsx                — renders MainApp
  globals.css             — CSS variables + custom classes
  api/
    notebooks/list/       — GET: list NLM notebooks
    notebooks/query/      — POST: query NLM (90s timeout)
    zotero/search/        — GET: search Zotero library (collection param)
    doi/verify/           — GET: verify DOI resolves via doi.org
    crossref/lookup/      — GET: fetch CrossRef metadata by DOI
    pdf/extract/          — POST: extract + summarise PDF (multipart)
    url/extract/          — POST: scrape URL metadata + AI summary
    ai/rewrite/           — POST: rewrite block (context-aware)
    ai/general/           — POST: general AI Q&A (documentContext param)
components/
  MainApp.tsx             — 2-pane layout (left sidebar + editor area), resizable dividers, Cmd+K, Roam/Notion export events; no bottom pane
  TopBar.tsx              — project selector, citation style selector (#1), export menu
  NotebookPane.tsx        — NLM chat, capture-as-block (#11), follow-up suggestions (#14)
                            (left sidebar NLM tab)
  OutlinePanel.tsx        — live h1/h2/h3 document outline, click-to-scroll (#15)
                            (left sidebar Outline tab)
  NotebookSourcePanel.tsx — NLM source list with "Add to Zotero search" (#19)
                            (left sidebar Sources tab)
  BlockEditor.tsx         — THE CORE: contentEditable blocks, DnD, versions, AI popup,
                            word count (#5), coherence check (#2), PDF drop (#16),
                            paste detection (#18), citation badges with DOI/annotation (#6/#8)
  EditorToolbar.tsx       — execCommand formatting toolbar + alignment buttons; PDF/Zotero pane controls
  BlockAIPopup.tsx        — floating AI rewrite: style presets, Argue/Synthesize/Contrast (#3),
                            contextual rewrite (#4), multi-block synthesis
  AIWritingTab.tsx        — general chat + document-context toggle (#12), model selector
                            (rendered in left sidebar AI tab)
  ZoteroTab.tsx           — Zotero search (collection-scoped #10), 📎 Cite, CrossRef fill (#7),
                            DOI badge (#6), duplicate warning (#9), citation annotator (#8),
                            URL import (#17) — rendered in editor panes (mode: 'zotero')
  CommandPalette.tsx      — Cmd+K palette: switch project, insert block, export, search, rewrite (#13)
  NewProjectModal.tsx     — project creation dialog
lib/
  citationFormatter.ts    — Vancouver / APA / MLA / Chicago formatters (#1)
store/
  useStore.ts             — Zustand store: projects, blocks, citations, versions, chat
types/
  index.ts                — Block, Project, Citation, ChatMessage interfaces
```

## Storage structure (localStorage)
```ts
interface Block {
  id: string;
  type: string;
  versions: { html: string; ts: number; instruction: string | null }[];
  activeVersion: number;
  citationIds: string[];           // ordered citation refs for this block
}
interface Citation {
  id: string;
  zoteroKey: string;
  data: ZoteroData;                // title, creators, date, DOI, publicationTitle, volume, pages...
  doiVerified: boolean | null;     // null = not checked, true/false = result
  annotationNote?: string;         // AI-generated one-sentence justification (#8)
}
interface Project {
  id: string;
  name: string;
  notebookName: string;
  notebookId: string | null;
  zoteroCollection: string;        // scopes Zotero searches (#10)
  blocks: Block[];
  citations: Citation[];           // project-level citation registry
  chatHistory: { role: string; content: string; showInsert?: boolean; suggestions?: string[] }[];
  conversationId: string | null;
  createdAt: string;
}
```

## Conventions
- All interactive components use `"use client"` directive
- `contentEditable` blocks use refs (not controlled state) — set innerHTML on mount/version-switch, read on blur
- Insert-to-editor uses `window.__insertToEditor` as a cross-component bridge
- Editor focused block tracked via `window.__editorFocusedBlockId`
- Cross-component events via `CustomEvent` on `window`: `command-focus-zotero` (opens Zotero in right split pane), `command-focus-nlm`, `command-focus-ai` (switches left sidebar to AI tab), `command-ai-rewrite`, `command-export`, `trigger-ai-rewrite`, `zotero-search`, `zotero-add-item`, `export-to-roam`, `export-to-notion`
- Auto-save debounced 500ms to localStorage on block changes
- Export: client-side Markdown and HTML (no pandoc); Roam/Notion via clipboard + MCP events
- Citation style (Vancouver/APA/MLA/Chicago) selected in TopBar, applied on export
- AI routes call OpenClaw gateway with `model` param; default model: `anthropic/claude-sonnet-4-20250514`

## Implemented features (all 20 from 2026-03-18 roadmap)
| # | Feature | Where |
|---|---------|-------|
| 1 | Citation style formatter (APA/MLA/Chicago/Vancouver) | TopBar + `lib/citationFormatter.ts` |
| 2 | Paragraph coherence check | BlockEditor right-click menu → `/api/ai/general` |
| 3 | AI writing modes: Argue / Synthesize / Contrast | BlockAIPopup |
| 4 | Contextual multi-block rewrite | BlockAIPopup contextual toggle → `/api/ai/rewrite` |
| 5 | Block word count + reading-time | BlockEditor hover + sticky bar |
| 6 | DOI verification badge | ZoteroTab + BlockEditor citation tooltip → `/api/doi/verify` |
| 7 | CrossRef auto-fill | ZoteroTab "CrossRef" button → `/api/crossref/lookup` |
| 8 | Citation context suggester (annotation) | ZoteroTab → `/api/ai/general` |
| 9 | Duplicate citation detector | ZoteroTab + store `addCitationToBlock` |
| 10 | Zotero collection filter | ZoteroTab (uses `project.zoteroCollection`) |
| 11 | NotebookLM → block pipeline (Capture / Capture+cite) | NotebookPane |
| 12 | AI chat with document context | AIWritingTab "Doc context" toggle |
| 13 | Cmd+K command palette | CommandPalette + MainApp |
| 14 | NotebookLM follow-up question suggestions | NotebookPane → `/api/ai/general` |
| 15 | Smart outline view (left sidebar) | OutlinePanel tab in MainApp left pane |
| 16 | PDF drop-to-extract | BlockEditor drag handler → `/api/pdf/extract` |
| 17 | URL → structured import | ZoteroTab URL input → `/api/url/extract` |
| 18 | Paste-and-parse smart detection | BlockEditor paste handler |
| 19 | NotebookLM source status panel | NotebookSourcePanel tab in BottomPane |
| 20 | Export to Roam / Notion | TopBar export menu → MainApp event handlers |
