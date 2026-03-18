export interface BlockVersion {
  html: string;
  ts: number;
  instruction: string | null;
}

export interface CitationData {
  title?: string;
  creators?: { firstName?: string; lastName?: string; name?: string }[];
  date?: string;
  publicationTitle?: string;
  DOI?: string;
  abstractNote?: string;
  volume?: string;
  pages?: string;
  url?: string;
  itemType?: string;
}

export interface Citation {
  id: string;
  zoteroKey: string;
  data: CitationData;
  /** null = not yet verified, true = resolves, false = dead link */
  doiVerified?: boolean | null;
  /** AI-generated annotation explaining how this source supports the claim */
  annotationNote?: string;
}

export interface Block {
  id: string;
  type: string;
  versions: BlockVersion[];
  activeVersion: number;
  citationIds: string[];
  /** Per-segment citation mapping from merge — used by disassemble to restore citations correctly */
  mergeSegmentCitations?: string[][];
}

export interface ChatMessage {
  role: string;
  content: string;
  showInsert?: boolean;
  /** Follow-up question suggestions (for NotebookLM responses) */
  suggestions?: string[];
}

export interface Project {
  id: string;
  name: string;
  notebookName: string;
  notebookId: string | null;
  zoteroCollection: string;
  blocks: Block[];
  citations: Citation[];
  chatHistory: ChatMessage[];
  conversationId: string | null;
  createdAt: string;
}
