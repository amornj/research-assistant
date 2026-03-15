# GEMINI.md - Project Updates Summary

## 1. AI Models & OAuth Integration
- **New Models Added**: Integrated "Gemini 3", "Opus 4.6", "Sonnet 4.6", and "GPT-5.4" into the AI Writing model selection.
- **Simulated OAuth Flow**:
    - Added a "Connect" button and a visual status indicator (✓ Connected) for AI models.
    - Implemented mock token generation and storage in `localStorage` to simulate an authentication lifecycle.
    - Backend `RewriteRequest` now supports an optional `token` field, which is passed as a `Bearer` token in the request headers to the NLM proxy.

## 2. Layout & UI Enhancements
- **Draggable Dividers**:
    - Implemented a vertical divider between the NotebookLM pane and the Editor.
    - Implemented a horizontal divider between the Editor and the bottom tabbed pane (AI Writing/Zotero).
    - Smooth resizing logic using `pageX`/`pageY`.
- **NotebookLM Improvements**:
    - Fixed chat message overflow to allow proper scrolling within the message container.
    - Updated "Push to Writer" button to a minimal double-arrowhead icon (`»`) positioned on the top-right of assistant responses.
- **Consolidated Export**:
    - Merged individual export buttons into a single "Export" dropdown menu.
    - Added support for **Markdown (.md)** export.
    - Enhanced **PDF export** reliability with a multi-engine fallback system.

## 3. Persistence & State Management
- **Full Project Restoration**:
    - The application now remembers and automatically restores the last active project upon refresh or app update.
    - Editor content, Zotero collections, and **NotebookLM chat history** (including conversation IDs) are now fully persisted.
- **Backend Schema Updates**:
    - Modified `server/routes/projects.py` to include `chat_history` and `conversation_id` in the project JSON storage.
- **Synchronized Boot**:
    - Synchronized the boot sequence to ensure project data is loaded correctly before the UI renders.

---
*Note: The inline versioning system was removed to maintain editor stability.*
