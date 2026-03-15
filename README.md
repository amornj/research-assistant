# research-assistant

A webapp that blends **NotebookLM**, **AI writing**, and **Zotero references** into one research workspace.

## What it does

When you create a new project, you provide:
- a **NotebookLM notebook name**
- a **Zotero collection name**

Then the app gives you a two-pane writing environment:

### Left pane — NotebookLM assistant
- Ask grounded questions from the notebook
- Give a real case and ask for synthesis/opinion from notebook sources
- Ask for long-form output, e.g.:
  - “give me a comprehensive 4000-word research article from this notebook”
- Send NotebookLM output directly into the writing pane

### Right pane — AI writing surface
- Editable writing area
- Block-based document model
- You can scroll, edit, and rearrange writing blocks
- References stay attached to blocks when blocks move

### Bottom-right pane — Zotero references
- Shows references from the selected Zotero collection
- Click references to attach them to the active writing block
- Multiple references can be attached to the same block

## Exports
- **DOCX** export
- **PDF** export

## Tech stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- `docx` for Word export
- `jspdf` for PDF export
- NotebookLM proxy integration
- Zotero Web API integration

## Environment variables

Create a `.env.local` with:

```bash
NLM_PROXY_URL=https://homes-imac.tail459031.ts.net
NLM_PROXY_KEY=your_proxy_key
NLM_CLI_PATH=/Users/home/.local/bin/nlm
ZOTERO_API_KEY=your_zotero_api_key
ZOTERO_USER_ID=7734498
# optional:
# ZOTERO_API_BASE=https://api.zotero.org/users/7734498
```

## Local development

```bash
npm install
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Build

```bash
npm run build
npm run start
```

## Deployment notes
This app is deployable to Vercel, but full functionality depends on the required environment variables being set in the Vercel project.

For production, set:
- `NLM_PROXY_URL`
- `NLM_PROXY_KEY`
- `ZOTERO_API_KEY`
- `ZOTERO_USER_ID`

`NLM_CLI_PATH` is mainly useful for local notebook-name listing and may not exist on Vercel.

## Current MVP limitations
- Notebook name resolution in production depends on how notebook listing is provided
- Writing area is block-based rather than fully rich-text
- Citation formatting for specific journal styles is not fully automated yet
- Inline reference insertion is manual by design for now

## Roadmap ideas
- richer editor (TipTap / ProseMirror)
- CSL/journal-specific reference formatting
- smarter notebook selection UI
- automatic source-to-reference linking
- saved projects backend instead of local-only state
