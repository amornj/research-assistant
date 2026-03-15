# ECHO CHECKLIST — research-assistant

**Date:** 2026-03-15
**Repo baseline:** Empty git repo (master, no commits). Node v24.12.0, npm 11.6.2.

---

## 1. Editor Model

| Option | Fit | Notes |
|--------|-----|-------|
| **Tiptap (ProseMirror)** | ★★★ | Best rich-text editor for Next.js/React. Headless, extensible, supports collaborative editing. Mature ecosystem. |
| Slate.js | ★★ | Flexible but lower-level; more boilerplate for citations/footnotes. |
| Lexical (Meta) | ★★ | Fast but younger plugin ecosystem; citation plugins would be custom. |
| MDXEditor | ★ | Markdown-first; poor fit if output target is structured DOCX/PDF. |

**Recommendation:** Tiptap with custom extensions for citations, footnotes, and figure anchoring.

---

## 2. Reference Anchoring (Citations)

| Approach | Fit | Notes |
|----------|-----|-------|
| **CSL-JSON + citeproc-js** | ★★★ | Standard citation engine (powers Zotero/Mendeley). Supports 10k+ citation styles. Import from Zotero via Better BibTeX CSL-JSON export. |
| citation-js | ★★ | Lighter, npm-native, but fewer styles and edge cases. |
| Manual formatting | ★ | Unmaintainable. |

**Recommendation:** Store references as CSL-JSON. Use `citeproc-js` for rendering. Tiptap citation node maps `[@citekey]` to inline citations. Import from Zotero via BBT JSON-RPC API (confirmed live on localhost:23119).

---

## 3. PDF / DOCX Export

| Tool | PDF | DOCX | Notes |
|------|-----|------|-------|
| **Pandoc (installed v2.13)** | ⚠️ | ✅ | DOCX works natively. PDF requires LaTeX engine — **none installed**. |
| Pandoc + html→pdf via puppeteer | ✅ | ✅ | Render HTML first, then Puppeteer `page.pdf()`. No LaTeX needed. Works in Node. |
| react-pdf (@react-pdf/renderer) | ✅ | ✗ | Good for styled PDF but no DOCX. |
| docx (npm) | ✗ | ✅ | Programmatic DOCX generation. Combines well with Pandoc fallback. |

**Recommendation:**
- **DOCX:** Pandoc (markdown/HTML → DOCX with reference-doc template for styling).
- **PDF:** HTML → Puppeteer `page.pdf()` (available via Node, no extra install). Puppeteer ships Chromium; size ~170 MB but works on Vercel serverless with `@sparticuz/chromium`.
- **Risk:** Pandoc v2.13 is old (current is 3.x). Some CSL features may behave differently. Test citation rendering early.

---

## 4. NotebookLM Integration

| Status | Detail |
|--------|--------|
| CLI | `nlm` v0.3.16 installed, authenticated ✅ |
| API | MCP server available in this session ✅ |
| Notebooks | Active notebooks found (amyloidosis, DLP2026, etc.) |

**Recommended approach:**
- Use NotebookLM MCP tools (`notebook_create`, `source_add`, `notebook_query`) for programmatic access.
- For Vercel deployment: MCP won't be available server-side. Expose nlm operations via a local companion script or keep NotebookLM features as local-only CLI commands.
- **Risk:** NotebookLM has no official public API. Both nlm CLI and MCP rely on unofficial auth. Could break without notice.

---

## 5. Zotero Integration

| Status | Detail |
|--------|--------|
| App | Running locally ✅ |
| Better BibTeX | Installed, JSON-RPC API live on `localhost:23119` ✅ |
| Library | ~398 items in storage |
| CLI | No `zotero` in PATH (GUI app only) |

**Recommended approach:**
- **Import references:** BBT JSON-RPC → CSL-JSON. Endpoint: `POST http://localhost:23119/better-bibtex/json-rpc` with method `item.bibliography` or export BibTeX/CSL-JSON.
- **Export to Zotero:** Use Zotero Web API (api.zotero.org) with user API key for cloud sync, or `open -a Zotero <file>` for local import.
- **In-app:** Provide a "Sync from Zotero" button that calls BBT locally. Won't work in deployed Vercel — local-only feature or requires Zotero Web API key.
- **Risk:** BBT JSON-RPC has no formal docs. Use `item.search` and `item.export` methods (community-documented).

---

## 6. Vercel Deployment Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| **Serverless function size** | 50 MB (compressed) on Hobby, 250 MB on Pro | Puppeteer/Chromium needs `@sparticuz/chromium` (~50 MB). Tight on Hobby. |
| **Execution timeout** | 10s Hobby / 60s Pro | PDF generation may hit 10s limit. Use streaming or client-side generation. |
| **No persistent filesystem** | `/tmp` only, ephemeral | Cannot install pandoc on Vercel serverless. Use pandoc via WASM (`pandoc-wasm`) or client-side. |
| **No local services** | Zotero BBT and nlm unavailable | Zotero: use Web API with key. NotebookLM: not available in production. |
| **Edge functions** | No Node APIs (no child_process, no fs) | Keep export logic in serverless functions, not edge. |

**Recommended stack for Vercel:**
- **Framework:** Next.js (App Router)
- **Editor:** Tiptap (client-side)
- **Citations:** citeproc-js (client-side)
- **DOCX export:** `docx` npm package (client-side generation, no server needed)
- **PDF export:** Client-side via `window.print()` or `html2pdf.js` (avoids Puppeteer entirely) — or server-side with `@sparticuz/chromium` on Pro plan
- **Zotero sync:** Zotero Web API (works anywhere with API key)
- **NotebookLM:** Local-only feature or deferred

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Pandoc unavailable on Vercel | HIGH | CERTAIN | Use client-side DOCX generation (`docx` npm) or `pandoc-wasm` |
| Puppeteer exceeds Hobby plan limits | MEDIUM | LIKELY | Default to client-side PDF; offer server PDF on Pro |
| NotebookLM auth breaks | MEDIUM | POSSIBLE | Isolate as optional feature; graceful degradation |
| Zotero BBT API undocumented changes | LOW | UNLIKELY | Pin to known-working methods; fallback to Web API |
| Pandoc 2.13 CSL quirks | LOW | POSSIBLE | Test early with target citation styles; upgrade if needed |
| Tiptap bundle size | LOW | UNLIKELY | Tree-shake extensions; lazy-load editor |

---

## Recommended Tech Stack Summary

```
Next.js (App Router) + Vercel
├── Editor:        Tiptap v2 (ProseMirror)
├── Citations:     CSL-JSON + citeproc-js
├── PDF export:    Client-side (html2pdf.js) or server (Puppeteer on Pro)
├── DOCX export:   Client-side (docx npm package)
├── Zotero:        Web API (deployed) + BBT JSON-RPC (local dev)
├── NotebookLM:    nlm CLI / MCP (local only)
└── Storage:       Vercel KV or Supabase (for documents & references)
```
