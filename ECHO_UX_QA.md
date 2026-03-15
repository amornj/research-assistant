# UX Improvements QA Report

**Date:** 2026-03-15
**Tester:** Echo (QA agent)
**Server:** http://127.0.0.1:8181
**Branch:** main (commit 90d4cfe)

---

## Test Results Summary

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | NotebookLM chat is scrollable | **PASS** | `overflow-y: auto` on `.chat-messages`; auto-scroll on new messages |
| 2 | Push-to-writer button works | **PASS** (partial) | Button renders on assistant messages; wired to `editor.insertText()` |
| 3 | Pane width is adjustable | **FAIL — NOT IMPLEMENTED** | Fixed 380px grid column, no drag handles |
| 4 | 2-tab structure renders correctly | **FAIL — NOT IMPLEMENTED** | 3-pane layout with no tabs |
| 5 | Right-click context menu on highlighted text | **FAIL — NOT IMPLEMENTED** | No `contextmenu` event listeners |
| 6 | Model selector is present | **FAIL — NOT IMPLEMENTED** | No model dropdown in UI |

**Overall: 2/6 PASS, 4/6 NOT IMPLEMENTED**

---

## Detailed Findings

### 1. NotebookLM Chat Scrollable — PASS

- **CSS:** `.chat-messages` has `flex: 1; overflow-y: auto;` (style.css line ~72)
- **JS:** `messagesEl.scrollTop = messagesEl.scrollHeight` called after each new message (notebook-pane.js)
- **Scrollbar styling:** Custom thin scrollbar via `::-webkit-scrollbar` rules
- **Verdict:** Chat container scrolls correctly when content exceeds viewport height

### 2. Push-to-Writer Button — PASS (partial)

- **Rendering:** Assistant messages get a `<span class="insert-btn">+ Insert into document</span>` element (notebook-pane.js)
- **Wiring:** Click handler calls `onInsertToEditor(content)` which maps to `editor.insertText(text)` in app.js
- **Styling:** Styled as underlined accent-color link text (style.css `.insert-btn`)
- **References pane:** Also has per-reference "Insert" buttons for citation insertion
- **Caveat:** Marked partial because `insertText()` inserts plain text — does not create structured blocks (headings, lists) from formatted notebook responses. The button works but the output is unformatted.

### 3. Adjustable Pane Width — FAIL (Not Implemented)

- **Current state:** `grid-template-columns: 380px 1fr` — notebook pane is fixed at 380px
- **Missing:** No resize handles, no drag dividers, no `mousedown`/`pointermove` listeners for resizing
- **Missing:** No CSS `resize` property or cursor styling for drag affordance
- **Impact:** Users cannot customize pane proportions to suit their workflow

### 4. 2-Tab Structure — FAIL (Not Implemented)

- **Current state:** 3-pane layout: left (notebook chat), right-top (editor), right-bottom (references)
- **Missing:** No `<nav>`, `role="tablist"`, tab buttons, or tab-switching logic anywhere in HTML or JS
- **Missing:** No `.tab`, `.tab-active`, or similar CSS classes
- **Layout:** Right side uses `grid-template-rows: 1fr 260px` — editor and references are always visible simultaneously, not tabbed

### 5. Right-Click Context Menu — FAIL (Not Implemented)

- **Current state:** No `contextmenu` event listeners in any JS file
- **Missing:** No custom context menu HTML element or positioning logic
- **Missing:** No text selection detection for triggering context actions
- **TipTap editor:** Initialized with basic extensions only (Bold, Italic, Underline, Heading, Lists, Blockquote, Placeholder, custom Citation node) — no context menu extension

### 6. Model Selector — FAIL (Not Implemented)

- **Current state:** No `<select>` or dropdown for model selection in index.html
- **Missing:** No model parameter in the notebook query API call (`POST /api/notebooks/{id}/query` sends only `{ query, conversation_id }`)
- **Missing:** No model configuration in backend config.py or mcp_client.py
- **Topbar contents:** Only contains project selector, "New Project" button, project name display, and export buttons

---

## Recommendations

1. **Pane resizing:** Add a draggable divider between notebook and editor panes with `mousedown`/`mousemove` handlers updating `grid-template-columns`
2. **Tab structure:** Consider tabbing the right-side panes (Editor | References) to maximize editor space, or tabbing notebook sub-features (Chat | Sources | Notes)
3. **Context menu:** Register a `contextmenu` listener on the TipTap editor that appears on text selection, offering actions like "Ask NotebookLM about this", "Find references", "Summarize"
4. **Model selector:** Add a dropdown to the topbar or chat input area if multiple LLM backends are planned
5. **Push-to-writer improvement:** Consider inserting as formatted HTML blocks rather than plain text to preserve structure from notebook responses
