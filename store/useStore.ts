import { create } from 'zustand';
import { Project, Block, ChatMessage, Citation, CitationData, BlockComment } from '@/types';

function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function createBlock(html: string = '', type: string = 'paragraph', indentLevel: 0 | 1 | 2 = 0): Block {
  return {
    id: generateId(),
    type,
    versions: [{ html, ts: Date.now(), instruction: null }],
    activeVersion: 0,
    citationIds: [],
    indentLevel,
    collapsed: false,
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const API_BASE = (process.env.NEXT_PUBLIC_SYNC_API_URL || '').trim();

function authHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_PROJECTS_API_KEY;
  return key ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` } : { 'Content-Type': 'application/json' };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPut(path: string, data: any): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API PUT error: ${res.status}`);
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(`API DELETE error: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Sync Engine (iCloud-inspired)
//
// Principles:
// 1. Local edits are NEVER overwritten by server fetches
// 2. Every local mutation marks the project "dirty" with a local version counter
// 3. Saves are debounced but MUST complete before any server refresh can apply
// 4. On tab focus / selectProject, we only apply server data if local is clean
// 5. If save fails, status goes to "error" and retries on next mutation
// ---------------------------------------------------------------------------
export type SyncStatus = 'synced' | 'pending' | 'saving' | 'error';

// Per-project dirty tracking
const dirtyProjects = new Map<string, number>(); // projectId → dirty counter
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let _getState: (() => Store) | null = null;
let _setState: ((partial: Partial<Store>) => void) | null = null;

function markDirty(projectId: string) {
  dirtyProjects.set(projectId, (dirtyProjects.get(projectId) || 0) + 1);
}

function isDirty(projectId: string): boolean {
  return (dirtyProjects.get(projectId) || 0) > 0;
}

function markClean(projectId: string) {
  dirtyProjects.delete(projectId);
}

async function flushSave(): Promise<void> {
  if (!_getState || !_setState) return;
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  
  const { currentProject, currentProjectId } = _getState();
  if (!currentProject || !currentProjectId) return;
  if (!isDirty(currentProjectId)) {
    _setState({ syncStatus: 'synced' });
    return;
  }

  saveInFlight = true;
  _setState({ syncStatus: 'saving' });
  
  try {
    const toSave = { ...currentProject, lastModified: new Date().toISOString() };
    await apiPut(`/api/projects/${currentProjectId}`, toSave);
    markClean(currentProjectId);
    saveInFlight = false;
    // Check if more edits happened during save
    if (isDirty(currentProjectId)) {
      _setState({ syncStatus: 'pending' });
      scheduleSave();
    } else {
      _setState({ syncStatus: 'synced' });
    }
  } catch (err) {
    console.error('Failed to save project:', err);
    saveInFlight = false;
    _setState({ syncStatus: 'error' });
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (saveInFlight) return; // will re-schedule after current save completes
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    flushSave();
  }, 500);
}

function onMutation(project: Project) {
  markDirty(project.id);
  _setState?.({ syncStatus: 'pending' });
  scheduleSave();
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------
export function getOrderedCitationMap(blocks: Block[], citations: Citation[]): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 1;
  for (const block of blocks) {
    for (const cid of (block.citationIds || [])) {
      if (!map.has(cid)) {
        map.set(cid, counter++);
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------
interface Store {
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  focusedBlockId: string | null;
  projectsLoaded: boolean;
  syncStatus: SyncStatus;
  // Actions
  loadProjects: () => Promise<void>;
  createProject: (data: Partial<Project>) => Project;
  deleteProject: (id: string) => void;
  selectProject: (id: string) => void;
  refreshCurrentProject: () => Promise<void>;
  flushAndRefresh: () => Promise<void>;
  updateProjectField: (field: keyof Project, value: any) => void;
  saveCurrentProject: () => void;
  setFocusedBlockId: (id: string | null) => void;
  // Block actions
  setBlocks: (blocks: Block[]) => void;
  addBlock: (html: string, afterId?: string, indentLevel?: 0 | 1 | 2) => Block;
  updateBlock: (id: string, html: string) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (fromId: string, toId: string, position: 'before' | 'after') => void;
  addBlockVersion: (id: string, html: string, instruction: string) => void;
  switchBlockVersion: (id: string, versionIndex: number) => void;
  deleteBlockVersion: (id: string, versionIndex: number) => void;
  mergeBlocks: (blockIds: string[]) => void;
  splitBlock: (blockId: string, liveHtml?: string) => void;
  // Citation actions
  addCitationToBlock: (blockId: string, zoteroKey: string, data: CitationData) => { duplicate: boolean; citationId: string };
  removeCitationFromBlock: (blockId: string, citationId: string) => void;
  updateCitation: (citationId: string, updates: Partial<import('@/types').Citation>) => void;
  // Chat
  setChatHistory: (history: ChatMessage[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setConversationId: (id: string | null) => void;
  // Feature #5
  setWordCountGoal: (goal: number | undefined) => void;
  // Feature #7
  setBlockType: (blockId: string, type: Block['blockType']) => void;
  // Feature #9
  addBlockComment: (blockId: string, text: string) => void;
  deleteBlockComment: (blockId: string, commentId: string) => void;
  // Feature #14
  updateWritingLog: (date: string, words: number) => void;
  // Feature #17
  toggleBlockFrozen: (blockId: string) => void;
  // Outliner
  setBlockIndent: (blockId: string, level: 0 | 1 | 2) => void;
  toggleBlockCollapsed: (blockId: string) => void;
  setBlocksCollapsedAll: (collapsed: boolean) => void;
  moveBlockFamily: (fromId: string, toId: string, position: 'before' | 'after', newIndentLevel?: 0 | 1 | 2) => void;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
function migrateProject(raw: any): Project {
  const p: Project = {
    id: raw.id,
    name: raw.name || 'Untitled',
    notebookName: raw.notebookName || raw.notebook_name || '',
    notebookId: raw.notebookId ?? raw.notebook_id ?? null,
    zoteroCollection: raw.zoteroCollection || raw.zotero_collection || '',
    blocks: raw.blocks || [],
    citations: raw.citations || [],
    chatHistory: raw.chatHistory || raw.chat_history || [],
    conversationId: raw.conversationId ?? raw.conversation_id ?? null,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    wordCountGoal: raw.wordCountGoal,
    writingLog: raw.writingLog || [],
  };
  p.blocks = (p.blocks.length > 0 ? p.blocks : [createBlock(raw.document_html || '')]).map(b => ({
    ...b,
    citationIds: b.citationIds || [],
    blockType: b.blockType || undefined,
    blockComments: b.blockComments || [],
    frozen: b.frozen || false,
    indentLevel: (b.indentLevel ?? 0) as 0 | 1 | 2,
    collapsed: b.collapsed ?? false,
  }));
  return p;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useStore = create<Store>((set, get) => {
  // Wire up sync engine references
  _getState = get;
  _setState = (partial) => set(partial as any);

  return {
  projects: [],
  currentProjectId: null,
  currentProject: null,
  focusedBlockId: null,
  projectsLoaded: false,
  syncStatus: 'synced' as SyncStatus,

  loadProjects: async () => {
    try {
      set({ syncStatus: 'saving' }); // "loading" uses saving indicator (yellow)
      const list = await apiGet<any[]>('/api/projects');
      if (list.length === 0) {
        set({ projects: [], currentProjectId: null, currentProject: null, projectsLoaded: true, syncStatus: 'synced' });
        return;
      }
      const first = await apiGet<any>(`/api/projects/${list[0].id}`);
      const migratedFirst = migrateProject(first);
      const stubs: Project[] = list.slice(1).map(item => ({
        id: item.id,
        name: item.name,
        notebookName: item.notebookName || item.notebook_name || '',
        notebookId: null,
        zoteroCollection: '',
        blocks: [],
        citations: [],
        chatHistory: [],
        conversationId: null,
        createdAt: item.createdAt || item.created_at || '',
      }));
      const projects = [migratedFirst, ...stubs];
      set({ projects, currentProjectId: migratedFirst.id, currentProject: migratedFirst, projectsLoaded: true, syncStatus: 'synced' });
    } catch (e) {
      console.error('Failed to load projects:', e);
      set({ projects: [], currentProjectId: null, currentProject: null, projectsLoaded: true, syncStatus: 'error' });
    }
  },

  createProject: (data) => {
    const project: Project = {
      id: generateId(),
      name: data.name || 'Untitled Project',
      notebookName: data.notebookName || '',
      notebookId: data.notebookId || null,
      zoteroCollection: data.zoteroCollection || '',
      blocks: [createBlock('')],
      citations: [],
      chatHistory: [],
      conversationId: null,
      createdAt: new Date().toISOString(),
    };
    const projects = [...get().projects, project];
    set({ projects, currentProjectId: project.id, currentProject: project, syncStatus: 'saving' });
    // Immediately persist new project (no debounce)
    const toSave = { ...project, lastModified: new Date().toISOString() };
    apiPut(`/api/projects/${project.id}`, toSave)
      .then(() => set({ syncStatus: 'synced' }))
      .catch(err => {
        console.error('Failed to create project:', err);
        set({ syncStatus: 'error' });
      });
    return project;
  },

  deleteProject: (id) => {
    const { projects, currentProjectId } = get();
    // Cancel any pending save for this project
    markClean(id);
    const updated = projects.filter(p => p.id !== id);
    const newCurrentId = currentProjectId === id
      ? (updated.length > 0 ? updated[0].id : null)
      : currentProjectId;
    const newCurrent = newCurrentId ? updated.find(p => p.id === newCurrentId) || null : null;
    set({ projects: updated, currentProjectId: newCurrentId, currentProject: newCurrent, syncStatus: 'saving' });
    apiDelete(`/api/projects/${id}`)
      .then(() => set({ syncStatus: 'synced' }))
      .catch(err => {
        console.error('Failed to delete project:', err);
        set({ syncStatus: 'error' });
      });
  },

  selectProject: async (id) => {
    const { projects, currentProjectId } = get();
    
    // STEP 1: Flush any pending saves for the CURRENT project first
    if (currentProjectId && isDirty(currentProjectId)) {
      await flushSave();
    }
    
    // STEP 2: Fetch fresh from server
    set({ syncStatus: 'saving' }); // yellow while loading
    try {
      const full = await apiGet<any>(`/api/projects/${id}`);
      const migrated = migrateProject(full);
      const updated = projects.map(p => p.id === id ? migrated : p);
      set({ projects: updated, currentProjectId: id, currentProject: migrated, syncStatus: 'synced' });
    } catch {
      // Fallback to in-memory version
      const project = projects.find(p => p.id === id) || null;
      set({ currentProjectId: id, currentProject: project, syncStatus: 'error' });
    }
  },

  // Called on tab visibility change — flush first, then refresh
  refreshCurrentProject: async () => {
    const { currentProjectId, projects } = get();
    if (!currentProjectId) return;
    
    // STEP 1: If there are dirty local edits, flush them to server FIRST
    if (isDirty(currentProjectId)) {
      await flushSave();
      // After flush, local is the most recent — no need to pull from server
      // (server now has our latest version)
      return;
    }
    
    // STEP 2: Only refresh from server if local is clean
    if (saveInFlight) return; // wait for in-flight save to complete
    
    set({ syncStatus: 'saving' }); // yellow while fetching
    try {
      const list = await apiGet<any[]>('/api/projects');
      const full = await apiGet<any>(`/api/projects/${currentProjectId}`);
      const migrated = migrateProject(full);
      
      // Double-check: if edits happened while we were fetching, DON'T overwrite
      if (isDirty(currentProjectId)) {
        set({ syncStatus: 'pending' });
        scheduleSave();
        return;
      }
      
      const freshStubs: Project[] = list
        .filter(item => item.id !== currentProjectId)
        .map(item => {
          const existing = projects.find(p => p.id === item.id);
          return existing && existing.blocks.length > 0
            ? { ...existing, name: item.name }
            : {
                id: item.id,
                name: item.name,
                notebookName: item.notebookName || item.notebook_name || '',
                notebookId: null,
                zoteroCollection: '',
                blocks: [],
                citations: [],
                chatHistory: [],
                conversationId: null,
                createdAt: item.createdAt || item.created_at || '',
              };
        });
      const updated = [migrated, ...freshStubs];
      set({ projects: updated, currentProject: migrated, syncStatus: 'synced' });
    } catch (e) {
      console.error('Failed to refresh project:', e);
      set({ syncStatus: 'error' });
    }
  },

  // Flush pending saves then refresh — used by visibility change handler
  flushAndRefresh: async () => {
    await flushSave();
    await get().refreshCurrentProject();
  },

  updateProjectField: (field, value) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, [field]: value } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  saveCurrentProject: () => {
    const { currentProject } = get();
    if (currentProject) {
      markDirty(currentProject.id);
      flushSave();
    }
  },

  setFocusedBlockId: (id) => {
    set({ focusedBlockId: id });
  },

  setBlocks: (blocks) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, blocks } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  addBlock: (html = '', afterId, indentLevel = 0) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) {
      return createBlock(html, 'paragraph', indentLevel);
    }
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) {
      return createBlock(html, 'paragraph', indentLevel);
    }
    const block = createBlock(html, 'paragraph', indentLevel);
    let blocks: Block[];
    if (afterId) {
      const idx = project.blocks.findIndex(b => b.id === afterId);
      blocks = [...project.blocks];
      blocks.splice(idx + 1, 0, block);
    } else {
      blocks = [...project.blocks, block];
    }
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, blocks } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
    return block;
  },

  updateBlock: (id, html) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        const versions = [...b.versions];
        versions[b.activeVersion] = { ...versions[b.activeVersion], html };
        return { ...b, versions };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  deleteBlock: (id) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.filter(b => b.id !== id);
      return { ...p, blocks: blocks.length > 0 ? blocks : [createBlock('')] };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  moveBlock: (fromId, toId, position) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = [...p.blocks];
      const fromIdx = blocks.findIndex(b => b.id === fromId);
      const toIdx = blocks.findIndex(b => b.id === toId);
      if (fromIdx === -1 || toIdx === -1) return p;
      const [moved] = blocks.splice(fromIdx, 1);
      const newToIdx = blocks.findIndex(b => b.id === toId);
      const insertIdx = position === 'after' ? newToIdx + 1 : newToIdx;
      blocks.splice(insertIdx, 0, moved);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  addBlockVersion: (id, html, instruction) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        const newVersion = { html, ts: Date.now(), instruction };
        const versions = [...b.versions, newVersion].slice(-5);
        return { ...b, versions, activeVersion: versions.length - 1 };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  switchBlockVersion: (id, versionIndex) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        return { ...b, activeVersion: versionIndex };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  deleteBlockVersion: (id, versionIndex) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        if (b.versions.length <= 1) return b;
        const versions = b.versions.filter((_, i) => i !== versionIndex);
        let activeVersion = b.activeVersion;
        if (activeVersion >= versions.length) activeVersion = versions.length - 1;
        else if (activeVersion > versionIndex) activeVersion--;
        return { ...b, versions, activeVersion };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  mergeBlocks: (blockIds) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId || blockIds.length < 2) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const orderedIds = p.blocks.map(b => b.id).filter(id => blockIds.includes(id));
      if (orderedIds.length < 2) return p;
      const [firstId, ...restIds] = orderedIds;
      const firstBlock = p.blocks.find(b => b.id === firstId)!;
      const restBlocks = restIds.map(id => p.blocks.find(b => b.id === id)!).filter(Boolean);
      const allHtmlParts = [
        firstBlock.versions[firstBlock.activeVersion]?.html || '',
        ...restBlocks.map(b => b.versions[b.activeVersion]?.html || ''),
      ];
      const mergedHtml = allHtmlParts.filter(h => h.trim()).join('<br><br>');
      const seenCids = new Set<string>();
      const mergedCitationIds: string[] = [];
      for (const b of [firstBlock, ...restBlocks]) {
        for (const cid of (b.citationIds || [])) {
          if (!seenCids.has(cid)) {
            seenCids.add(cid);
            mergedCitationIds.push(cid);
          }
        }
      }
      const segmentCitations: string[][] = [
        [...(firstBlock.citationIds || [])],
        ...restBlocks.map(b => [...(b.citationIds || [])]),
      ];
      const newVersion = { html: mergedHtml, ts: Date.now(), instruction: 'Merged' };
      const newVersions = [...firstBlock.versions, newVersion].slice(-5);
      const mergedBlock: Block = {
        ...firstBlock,
        versions: newVersions,
        activeVersion: newVersions.length - 1,
        citationIds: mergedCitationIds,
        mergeSegmentCitations: segmentCitations,
      };
      const restIdSet = new Set(restIds);
      const blocks = p.blocks
        .filter(b => !restIdSet.has(b.id))
        .map(b => b.id === firstId ? mergedBlock : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  splitBlock: (blockId, liveHtml) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blockIdx = p.blocks.findIndex(b => b.id === blockId);
      if (blockIdx === -1) return p;
      const block = p.blocks[blockIdx];
      const html = liveHtml !== undefined ? liveHtml : (block.versions[block.activeVersion]?.html || '');
      const segments = html.split(/<br\s*\/?>\s*<br\s*\/?>/gi).map(s => s.trim()).filter(s => s.length > 0);
      if (segments.length <= 1) return p;
      const segCitations = block.mergeSegmentCitations;
      const hasSegCitations = segCitations && segCitations.length === segments.length;
      const firstHtml = segments[0];
      const newVersion = { html: firstHtml, ts: Date.now(), instruction: 'Split' };
      const newVersions = [...block.versions, newVersion].slice(-5);
      const updatedFirstBlock: Block = {
        ...block,
        versions: newVersions,
        activeVersion: newVersions.length - 1,
        citationIds: hasSegCitations ? segCitations[0] : (block.citationIds || []),
        mergeSegmentCitations: undefined,
      };
      const newBlocks: Block[] = segments.slice(1).map((seg, i) => ({
        id: generateId(),
        type: block.type,
        versions: [{ html: seg, ts: Date.now(), instruction: null }],
        activeVersion: 0,
        citationIds: hasSegCitations ? segCitations[i + 1] : [],
      }));
      const blocks = [...p.blocks];
      blocks.splice(blockIdx, 1, updatedFirstBlock, ...newBlocks);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  addCitationToBlock: (blockId, zoteroKey, data) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return { duplicate: false, citationId: '' };
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return { duplicate: false, citationId: '' };

    const existingByKey = project.citations.find(c => c.zoteroKey === zoteroKey);
    const existingByDoi = data.DOI
      ? project.citations.find(c => c.data.DOI && c.data.DOI === data.DOI && c.zoteroKey !== zoteroKey)
      : null;

    let citation = existingByKey || existingByDoi || null;
    let citations = project.citations;
    const isDuplicate = !!(existingByKey || existingByDoi);

    if (!citation) {
      citation = { id: generateId(), zoteroKey, data, doiVerified: null };
      citations = [...citations, citation];
    }

    const citId = citation.id;
    const blocks = project.blocks.map(b => {
      if (b.id !== blockId) return b;
      if (b.citationIds.includes(citId)) return b;
      return { ...b, citationIds: [...b.citationIds, citId] };
    });

    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, citations, blocks } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
    return { duplicate: isDuplicate, citationId: citId };
  },

  updateCitation: (citationId, updates) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const citations = p.citations.map(c =>
        c.id === citationId ? { ...c, ...updates } : c
      );
      return { ...p, citations };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  removeCitationFromBlock: (blockId, citationId) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== blockId) return b;
        return { ...b, citationIds: b.citationIds.filter(id => id !== citationId) };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  setChatHistory: (history) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, chatHistory: history } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  addChatMessage: (msg) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId
        ? { ...p, chatHistory: [...p.chatHistory, msg] }
        : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  setConversationId: (id) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, conversationId: id } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  setWordCountGoal: (goal) => {
    get().updateProjectField('wordCountGoal', goal);
  },

  setBlockType: (blockId, type) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId ? { ...b, blockType: type } : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  addBlockComment: (blockId, text) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const comment: BlockComment = { id: Math.random().toString(36).substr(2, 9), text, createdAt: Date.now() };
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId
        ? { ...b, blockComments: [...(b.blockComments || []), comment] }
        : b
      );
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  deleteBlockComment: (blockId, commentId) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId
        ? { ...b, blockComments: (b.blockComments || []).filter(c => c.id !== commentId) }
        : b
      );
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  updateWritingLog: (date, words) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const log = [...(p.writingLog || [])];
      const existing = log.findIndex(e => e.date === date);
      if (existing >= 0) {
        log[existing] = { date, words };
      } else {
        log.push({ date, words });
      }
      log.sort((a, b) => a.date.localeCompare(b.date));
      return { ...p, writingLog: log.slice(-30) };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  toggleBlockFrozen: (blockId) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId ? { ...b, frozen: !b.frozen } : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  setBlockIndent: (blockId, level) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId ? { ...b, indentLevel: level } : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  toggleBlockCollapsed: (blockId) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => b.id === blockId ? { ...b, collapsed: !b.collapsed } : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  setBlocksCollapsedAll: (collapsed) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => ({ ...b, collapsed }));
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },

  moveBlockFamily: (fromId, toId, position, newIndentLevel) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = [...p.blocks];
      const fromIdx = blocks.findIndex(b => b.id === fromId);
      if (fromIdx === -1) return p;
      const fromLevel = blocks[fromIdx].indentLevel ?? 0;

      const familyIndices: number[] = [fromIdx];
      for (let i = fromIdx + 1; i < blocks.length; i++) {
        if ((blocks[i].indentLevel ?? 0) <= fromLevel) break;
        familyIndices.push(i);
      }

      const family = familyIndices.map(i => blocks[i]);

      let adjustedFamily = family;
      if (newIndentLevel !== undefined) {
        const delta = newIndentLevel - fromLevel;
        adjustedFamily = family.map((b, i) => ({
          ...b,
          indentLevel: i === 0
            ? newIndentLevel
            : Math.min(2, Math.max(0, (b.indentLevel ?? 0) + delta)) as 0 | 1 | 2,
        }));
      }

      const sortedIndices = [...familyIndices].sort((a, b) => b - a);
      sortedIndices.forEach(i => blocks.splice(i, 1));

      const toIdx = blocks.findIndex(b => b.id === toId);
      if (toIdx === -1) return p;
      const insertIdx = position === 'after' ? toIdx + 1 : toIdx;
      blocks.splice(insertIdx, 0, ...adjustedFamily);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    set({ projects: updated, currentProject });
    if (currentProject) onMutation(currentProject);
  },
};
});
