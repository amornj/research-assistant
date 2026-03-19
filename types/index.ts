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

export interface BlockComment {
  id: string;
  text: string;
  createdAt: number;
}

export interface Block {
  id: string;
  type: string;
  versions: BlockVersion[];
  activeVersion: number;
  citationIds: string[];
  /** Per-segment citation mapping from merge — used by disassemble to restore citations correctly */
  mergeSegmentCitations?: string[][];
  /** Feature #7: block type label */
  blockType?: 'paragraph' | 'hypothesis' | 'background' | 'method' | 'result' | 'discussion' | 'conclusion';
  /** Feature #9: inline comments */
  blockComments?: BlockComment[];
  /** Feature #17: frozen block (read-only) */
  frozen?: boolean;
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
  /** Feature #5: word count goal */
  wordCountGoal?: number;
  /** Feature #14: daily writing log */
  writingLog?: { date: string; words: number }[];
}
