# Research Assistant — 20 Feature Ideas
*2026-03-18*

Brainstormed from current codebase state. Focused on writing quality, reference correctness, and import speed.

---

## Writing Quality

### 1. Citation Style Formatter (APA / MLA / Chicago / Vancouver)
Export currently uses a custom format. Add a style selector in TopBar that reformats the References section on export. Vancouver (numbered) suits biomedical; APA suits social sciences. Makes exported drafts publication-ready without manual cleanup.

### 2. Paragraph-Level Coherence Check
After writing or AI-rewriting a block, add a "Check coherence" option that sends the 2–3 surrounding blocks as context and asks: *"Does this paragraph flow logically from the one before? Flag any logical gaps."* Better than rewriting in isolation.

### 3. AI Writing Modes: Argue / Synthesize / Contrast
Current presets (Formal, Shorten, etc.) are style-only. Add higher-order reasoning modes:
- **Synthesize**: Combine ideas from two selected blocks into one paragraph with a clear claim.
- **Argue**: Turn this observation into an argument with evidence structure.
- **Contrast**: Rewrite to highlight tension or disagreement with the previous paragraph.

### 4. Multi-Block AI Rewrite with Document Context ⭐
Rewrite currently sends only the current block. Add a "Contextual Rewrite" that sends title + 2 blocks before + 2 after as context, so AI maintains continuity. Dramatic improvement in output quality.

### 5. Block-Level Word / Reading-Time Counter
Show live word count per block on hover + total in TopBar. Add reading-time estimate (200 WPM). Surfaces over/under-written sections instantly.

---

## Reference Correctness

### 6. DOI Verification Badge
When a citation is added from Zotero, silently ping `https://doi.org/{DOI}` via an API route to verify it resolves. Show green ✓ or red ✗ in the citation tooltip. Dead DOIs are a top journal rejection reason.

### 7. CrossRef Auto-Fill for Incomplete Zotero Records
Zotero entries often have missing volume/pages/journal. Add a "Complete from CrossRef" button that hits `https://api.crossref.org/works/{DOI}` and backfills missing fields before export.

### 8. Citation Context Suggester
When a citation is added to a block, send the block text + citation abstract to AI and ask: *"In one sentence, explain how this source supports the claim in this paragraph."* Display as an editable annotation on the citation badge. Makes citation justification explicit.

### 9. Duplicate Citation Detector
Detect when two citations map to the same DOI or Zotero key. Show a warning and offer to merge them. Currently possible to add the same paper twice with different internal IDs.

### 10. Zotero Collection Filter ⭐
The `zoteroCollection` field already exists in the Project type but isn't wired up. Scope Zotero searches to the project's collection. Essential for writers managing 5+ projects with different bibliographies.

---

## Speed / Flow

### 11. NotebookLM → Block Pipeline ("Capture" button) ⭐
In NotebookPane, add a "Capture as block" option that inserts the NLM answer directly as a new block at cursor position. Also add "Capture + cite sources" that extracts inline source references from the NLM answer and automatically attaches matching Zotero citations.

### 12. AI Chat with Selected Blocks as Context ⭐
In AI Writing Tab, add a "Use selected blocks" toggle. When active, chat sends the highlighted blocks as document context — useful for: "Is this argument internally consistent?" or "What am I missing in this section?"

### 13. Keyboard-First Command Palette (Cmd+K)
A searchable command palette exposing: switch project, insert block, rewrite block, export, search Zotero, query NotebookLM. Everything without lifting hands from keyboard. Reduces friction ~60% for power users.

### 14. NotebookLM Question Suggestions
After each NLM response, auto-generate 3 follow-up questions using AI ("Based on this answer, you might also ask:"). Makes NotebookLM feel like a research dialogue partner rather than a single-shot query box.

### 15. Smart Outline View (Left Sidebar Toggle)
Parse all `<h1>`, `<h2>`, `<h3>` elements across blocks and display a live document outline in the left sidebar (toggleable from NotebookLM view). Click to scroll to that block.

---

## Import Quality

### 16. PDF Drop-to-Extract (via AI)
Allow dragging a PDF onto the editor. Backend extracts text (via `pdf-parse`) and sends key passages to AI asking: *"Summarize the main claims, methods, and findings."* Insert as a block or into NotebookLM as a source.

### 17. URL → Structured Import
Drop a URL onto ZoteroTab or editor. Backend fetches the page, extracts metadata (title, authors, date, abstract via OpenGraph / Schema.org), creates a local citation object, and inserts a block with the summary. Fills the gap when papers aren't in Zotero yet.

### 18. Paste-and-Parse Smart Detection
When user pastes into a block, detect if it looks like: a DOI, a citation string (e.g., "Smith et al., 2023"), a URL, or raw text. If DOI/URL, offer to look up the reference. If citation string, offer to search Zotero. Turns manual reference hunting into one-click flow.

### 19. NotebookLM Source Status Panel
Show which sources are currently loaded in the connected NLM notebook (via the list API already built), with a "Add to Zotero" button for each. Closes the loop between what NLM is reading and what the reference list contains.

### 20. Project Export to Roam / Notion
Roam MCP and Notion MCP are already connected. Add export buttons that push the full document (blocks + citations) to a Roam page or Notion doc. Turns the research assistant into a writing-to-PKM pipeline — draft here, publish there.

---

## Priority Order

| Tier | Features | Reason |
|------|----------|--------|
| **Do first** | #4, #11, #12, #10, #13 | Fastest speed gains with existing AI infrastructure |
| **High value** | #1, #6, #7, #3, #15 | Citation quality + export correctness |
| **Medium** | #2, #8, #14, #16, #5 | Writing depth improvements |
| **Later** | #9, #17, #18, #19, #20 | Import pipeline & integrations |

> Features **#4, #11, #12** are highest ROI — they fix the biggest current gap: AI and NotebookLM currently work in isolation from your document context.
