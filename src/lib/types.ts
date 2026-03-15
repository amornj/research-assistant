export interface ProjectConfig {
  id: string
  name: string
  notebookName: string
  notebookId: string
  zoteroCollectionName: string
  zoteroCollectionKey: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface ReferenceItem {
  key: string
  number: number
  title: string
  creators?: string[]
  publicationTitle?: string
  date?: string
  doi?: string
  url?: string
}

export interface WritingBlock {
  id: string
  text: string
  references: string[]
}
