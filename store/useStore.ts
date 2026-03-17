import { create } from 'zustand';
import { Project, Block, ChatMessage, Citation, CitationData } from '@/types';

function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function createBlock(html: string = '', type: string = 'paragraph'): Block {
  return {
    id: generateId(),
    type,
    versions: [{ html, ts: Date.now(), instruction: null }],
    activeVersion: 0,
    citationIds: [],
  };
}

const STORAGE_KEY = 'research_assistant_projects';

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

interface Store {
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  focusedBlockId: string | null;
  // Actions
  loadProjects: () => void;
  createProject: (data: Partial<Project>) => Project;
  selectProject: (id: string) => void;
  updateProjectField: (field: keyof Project, value: any) => void;
  saveCurrentProject: () => void;
  setFocusedBlockId: (id: string | null) => void;
  // Block actions
  setBlocks: (blocks: Block[]) => void;
  addBlock: (html: string, afterId?: string) => Block;
  updateBlock: (id: string, html: string) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (fromId: string, toId: string, position: 'before' | 'after') => void;
  addBlockVersion: (id: string, html: string, instruction: string) => void;
  switchBlockVersion: (id: string, versionIndex: number) => void;
  mergeBlocks: (blockIds: string[]) => void;
  splitBlock: (blockId: string, liveHtml?: string) => void;
  // Citation actions
  addCitationToBlock: (blockId: string, zoteroKey: string, data: CitationData) => void;
  removeCitationFromBlock: (blockId: string, citationId: string) => void;
  // Chat
  setChatHistory: (history: ChatMessage[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setConversationId: (id: string | null) => void;
}

function saveToStorage(projects: Project[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save projects:', e);
  }
}

export const useStore = create<Store>((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentProject: null,
  focusedBlockId: null,

  loadProjects: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const projects: Project[] = raw ? JSON.parse(raw) : [];
      // Migrate legacy projects missing new fields
      const migrated = projects.map(p => ({
        ...p,
        citations: p.citations || [],
        blocks: (p.blocks || []).map(b => ({ ...b, citationIds: b.citationIds || [] })),
      }));
      const currentProjectId = migrated.length > 0 ? migrated[0].id : null;
      set({
        projects: migrated,
        currentProjectId,
        currentProject: currentProjectId ? migrated.find(p => p.id === currentProjectId) || null : null,
      });
    } catch (e) {
      set({ projects: [], currentProjectId: null, currentProject: null });
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
    saveToStorage(projects);
    set({ projects, currentProjectId: project.id, currentProject: project });
    return project;
  },

  selectProject: (id) => {
    const { projects } = get();
    const project = projects.find(p => p.id === id) || null;
    set({ currentProjectId: id, currentProject: project });
  },

  updateProjectField: (field, value) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, [field]: value } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  saveCurrentProject: () => {
    const { projects } = get();
    saveToStorage(projects);
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  addBlock: (html = '', afterId) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) {
      const block = createBlock(html);
      return block;
    }
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) {
      const block = createBlock(html);
      return block;
    }
    const block = createBlock(html);
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  addBlockVersion: (id, html, instruction) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        const newVersion = { html, ts: Date.now(), instruction };
        const versions = [...b.versions, newVersion].slice(-5); // keep last 5
        return { ...b, versions, activeVersion: versions.length - 1 };
      });
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  mergeBlocks: (blockIds) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId || blockIds.length < 2) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      // Determine document order by filtering p.blocks
      const orderedIds = p.blocks.map(b => b.id).filter(id => blockIds.includes(id));
      if (orderedIds.length < 2) return p;
      const [firstId, ...restIds] = orderedIds;
      const firstBlock = p.blocks.find(b => b.id === firstId)!;
      const restBlocks = restIds.map(id => p.blocks.find(b => b.id === id)!).filter(Boolean);
      // Merge HTML with <br><br> separator
      const allHtmlParts = [
        firstBlock.versions[firstBlock.activeVersion]?.html || '',
        ...restBlocks.map(b => b.versions[b.activeVersion]?.html || ''),
      ];
      const mergedHtml = allHtmlParts.filter(h => h.trim()).join('<br><br>');
      // Union citationIds preserving order
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
      // Build new block (first block with new version)
      const newVersion = { html: mergedHtml, ts: Date.now(), instruction: 'Merged' };
      const newVersions = [...firstBlock.versions, newVersion].slice(-5);
      const mergedBlock: Block = {
        ...firstBlock,
        versions: newVersions,
        activeVersion: newVersions.length - 1,
        citationIds: mergedCitationIds,
      };
      const restIdSet = new Set(restIds);
      const blocks = p.blocks
        .filter(b => !restIdSet.has(b.id))
        .map(b => b.id === firstId ? mergedBlock : b);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
      // Split on <br><br> boundaries
      const segments = html.split(/<br\s*\/?>\s*<br\s*\/?>/gi).map(s => s.trim()).filter(s => s.length > 0);
      if (segments.length <= 1) return p; // nothing to split
      // First segment replaces original block
      const firstHtml = segments[0];
      const newVersion = { html: firstHtml, ts: Date.now(), instruction: 'Split' };
      const newVersions = [...block.versions, newVersion].slice(-5);
      const updatedFirstBlock: Block = {
        ...block,
        versions: newVersions,
        activeVersion: newVersions.length - 1,
      };
      // Remaining segments become new blocks
      const newBlocks: Block[] = segments.slice(1).map(seg => ({
        id: generateId(),
        type: block.type,
        versions: [{ html: seg, ts: Date.now(), instruction: null }],
        activeVersion: 0,
        citationIds: [...(block.citationIds || [])],
      }));
      const blocks = [...p.blocks];
      blocks.splice(blockIdx, 1, updatedFirstBlock, ...newBlocks);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  addCitationToBlock: (blockId, zoteroKey, data) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;

    // Find or create citation in project.citations
    let citation = project.citations.find(c => c.zoteroKey === zoteroKey);
    let citations = project.citations;
    if (!citation) {
      citation = { id: generateId(), zoteroKey, data };
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  setChatHistory: (history) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, chatHistory: history } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  setConversationId: (id) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p =>
      p.id === currentProjectId ? { ...p, conversationId: id } : p
    );
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },
}));
