export interface BlockVersion {
  html: string;
  ts: number;
  instruction: string | null;
}

export interface Block {
  id: string;
  type: string;
  versions: BlockVersion[];
  activeVersion: number;
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
  chatHistory: ChatMessage[];
  conversationId: string | null;
  createdAt: string;
}
