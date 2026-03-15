# GEO UX Spec — Research Assistant UI Improvements

Defines interaction models for three UI upgrades: enhanced NotebookLM pane, tabbed right-bottom pane (AI Writing + Zotero References), and enriched writing pane.

---

## 1. NotebookLM Pane (Left)

### 1a. Push-to-Writer Button

Each assistant response bubble gets a **"→ Insert"** button in its footer (alongside existing `insert-btn`).

| Element | Behavior |
|---|---|
| Button label | `→ Writer` (icon: arrow-right) |
| Click | Inserts the full response text at the current cursor position in the TipTap editor. If no cursor, appends to end of document. |
| Content format | Strips markdown fences, preserves paragraphs/lists as HTML nodes via `editor.commands.insertContent()`. |
| Feedback | Button briefly shows "✓ Inserted" (1.5s), then reverts. Prevents double-click via disabled state during feedback. |

### 1b. Scrollable Chat

Already implemented (`overflow-y: auto` on `.chat-messages`). Spec additions:

- **Auto-scroll**: Scroll to bottom on new message. If user has scrolled up (reading history), do NOT auto-scroll — show a "↓ New message" pill at the bottom instead.
- **Scroll detection**: Track `scrollTop + clientHeight < scrollHeight - 40` to determine if user scrolled away.

### 1c. Adjustable Pane Width (Drag Handle)

| Element | Behavior |
|---|---|
| Handle | 4px vertical strip on the right edge of `.pane-notebook`, cursor: `col-resize`. Visible on hover as a subtle `var(--accent-dim)` bar. |
| Drag | `mousedown` on handle starts resize. `mousemove` updates `grid-template-columns` on `.main`. `mouseup` ends. |
| Constraints | Min width: 280px. Max width: 50% of viewport. |
| Persistence | Save width to `localStorage('pane-notebook-width')`. Restore on load. |
| CSS change | `.main` grid switches from fixed `380px 1fr` to `var(--notebook-width, 380px) 1fr`. |

---

## 2. Right Bottom Pane — Tabbed

Replace the current single `.pane-references` with a tabbed container holding two tabs.

### Tab Bar

| Element | Behavior |
|---|---|
| Container | `.tab-bar` row at top of `.pane-references` area, replacing current `.header`. |
| Tabs | Two buttons: **"AI Writing"** (default active) and **"References"**. |
| Style | Active tab: `border-bottom: 2px solid var(--accent)`, text `var(--text)`. Inactive: `var(--text-dim)`, no border. |
| Click | Switches visible panel. No content destruction — both panels stay in DOM, toggled via `.hidden` class. |

### Tab 1: AI Writing

#### Model Selector

| Element | Behavior |
|---|---|
| Placement | Top-right corner of AI Writing panel, `<select>` dropdown. |
| Options | `Claude Opus` (value: `opus`), `Claude Sonnet` (value: `sonnet`), `GPT-4o` (value: `gpt`). |
| Default | `Claude Sonnet`. |
| Persistence | Save to `localStorage('ai-model')`. Restore on load. |
| Backend | Sent as `model` field in AI writing requests. Backend routes to appropriate provider. |

#### Right-Click Style Popup (on highlighted text in AI Writing output)

| Trigger | User selects text in the AI Writing output area, then right-clicks. |
|---|---|
| Element | Custom context menu (`.style-popup`), positioned at click coordinates. |
| Contents | Text input: "Describe style change..." + Submit button. Preset buttons: `More formal`, `Simplify`, `Expand`, `Shorten`. |
| Behavior | On submit (or preset click): sends `{ text: selectedText, instruction: userInput, model: selectedModel }` to `POST /api/ai/rewrite`. Response replaces the selected text in-place. |
| Dismiss | Click outside popup, or Escape key. |
| Conflict avoidance | `contextmenu` event calls `e.preventDefault()` only when text is selected within the AI output area. Browser default context menu preserved everywhere else. |

#### AI Chatbox (Photo/Table Extraction)

| Element | Behavior |
|---|---|
| Layout | Bottom of AI Writing panel. Input row: text input + attachment button + send button. |
| Attachment button | Opens file picker (`accept="image/*,.pdf"`). Selected file shown as thumbnail chip above input. Multiple files allowed. |
| Paste support | `paste` event on input detects `clipboardData.files` — auto-attaches pasted images. |
| Send | `POST /api/ai/extract` with `multipart/form-data`: `{ files: [...], prompt: "extract text from this table" }`. |
| Response | AI-extracted text displayed as a new message bubble in the AI Writing chat area. Each response gets the same **"→ Writer"** button to push content to the editor. |
| Chat history | Scrollable message list (same pattern as NotebookLM pane). Messages alternate user/assistant. Not persisted across sessions. |

### Tab 2: Zotero References

Identical to current `.pane-references` content, with one addition:

#### Drag-to-Editor

| Element | Behavior |
|---|---|
| Draggable | Each `.ref-item` gets `draggable="true"`. |
| Drag start | `dragstart` sets `dataTransfer` with: `text/plain` = formatted citation string, `application/x-citation` = JSON `{ key, title, authors, year, citekey }`. |
| Drag visual | Ghost image: semi-transparent pill showing truncated title. |
| Editor drop | TipTap editor area listens for `drop`. On drop, reads `application/x-citation` data and inserts a `citation` node (existing TipTap extension). Falls back to `text/plain` if custom type unavailable. |
| Existing "Cite" button | Remains as-is for click-to-insert workflow. Drag is an additional interaction path. |

---

## 3. Main Writing Pane (Center)

### 3a. Paste Images/Tables

| Trigger | `Ctrl+V` / `Cmd+V` in the TipTap editor with image data on clipboard. |
|---|---|
| Detection | `editor` paste handler checks `clipboardData.files` for image MIME types and `clipboardData.getData('text/html')` for HTML tables. |
| Image handling | Upload image to `POST /api/upload` → returns `{ url: "/uploads/{id}.png" }`. Insert `<img>` node at cursor via TipTap Image extension. |
| Table handling | If pasted HTML contains `<table>`, insert as TipTap Table node (requires `@tiptap/extension-table` from CDN). |
| Plain text tables | If pasted text looks tabular (tab-separated or pipe-delimited), offer a toast: "Convert to table?" — on confirm, parse and insert as Table node. On dismiss, insert as plain text. |
| File size limit | Client-side check: reject images > 10MB with toast notification. |

### 3b. Accept Dragged References

| Trigger | User drags a `.ref-item` from the References tab and drops it into the editor. |
|---|---|
| Drop zone indicator | When dragging over editor, show a blue insertion line at the drop position (CSS `::after` pseudo-element on the nearest block node). |
| Insert behavior | Creates a `citation` node (existing custom TipTap node) with the reference metadata from `dataTransfer`. |
| Position | Inserts at the drop coordinates, resolved to the nearest text position via `editor.view.posAtCoords()`. |

---

## 4. New Backend Endpoints Required

| Endpoint | Purpose |
|---|---|
| `POST /api/ai/rewrite` | Accepts `{ text, instruction, model }`, returns `{ result }`. Routes to Claude API or OpenAI based on model. |
| `POST /api/ai/extract` | Accepts multipart `files` + `prompt`, returns `{ text }`. Sends images to vision-capable model for text/table extraction. |
| `POST /api/upload` | Accepts image file, stores in `data/uploads/`, returns `{ url }`. |

---

## 5. Layout Changes Summary

```
BEFORE:
┌──────────────────────────────────────────────┐
│ Topbar                                       │
├────────────┬─────────────────────────────────┤
│            │  Editor (toolbar + content)      │
│ NotebookLM │                                 │
│   Chat     ├─────────────────────────────────┤
│            │  References                      │
├────────────┴─────────────────────────────────┤

AFTER:
┌──────────────────────────────────────────────┐
│ Topbar                                       │
├──────┤├────┬─────────────────────────────────┤
│      ││    │  Editor (toolbar + content)      │
│ NLM  ││    │  - accepts pasted images/tables  │
│ Chat │dragH│  - accepts dragged references    │
│      ││    ├─────────────────────────────────┤
│      ││    │ [AI Writing] [References]  ← tabs│
│ each ││    │  (tab content area)              │
│ msg: ││    │                                 │
│ [→W] ││    │                                 │
├──────┤├────┴─────────────────────────────────┤
```

### CSS Grid Update

```css
/* .main changes */
.main {
  grid-template-columns: var(--notebook-width, 380px) 4px 1fr;
  /*                      notebook pane        drag   right side */
}
```

---

## 6. File Impact

| File | Changes |
|---|---|
| `static/index.html` | Add drag handle div, tab bar markup, AI writing panel, model selector, AI chatbox |
| `static/css/style.css` | Drag handle styles, tab styles, style-popup, drop zone indicator, AI chatbox styles |
| `static/js/app.js` | Drag handle resize logic, localStorage persistence, pane width restore |
| `static/js/notebook-pane.js` | "→ Writer" button on each response, smart auto-scroll |
| `static/js/references-pane.js` | `draggable` attribute, `dragstart` handler with citation data |
| `static/js/editor-pane.js` | Drop handler for citations, paste handler for images/tables, Image + Table extensions |
| `static/js/ai-writing-pane.js` | **New file**. Model selector, style popup, AI chatbox, file attachment, extraction |
| `static/js/api.js` | Add `aiRewrite()`, `aiExtract()`, `uploadImage()` fetch wrappers |
| `server/routes/ai.py` | **New file**. `/api/ai/rewrite`, `/api/ai/extract` endpoints |
| `server/routes/upload.py` | **New file**. `/api/upload` endpoint |
| `server/app.py` | Register new route modules |
