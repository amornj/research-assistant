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
}

export interface Block {
  id: string;
  type: string;
  versions: BlockVersion[];
  activeVersion: number;
  citationIds: string[];
}

export interface ChatMessage {
  role: string;
  content: string;
  showInsert?: boolean;
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
