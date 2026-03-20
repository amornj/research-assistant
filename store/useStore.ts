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
        blocks: (p.blocks || []).map(b => ({
          ...b,
          citationIds: b.citationIds || [],
          blockType: b.blockType || undefined,
          blockComments: b.blockComments || [],
          frozen: b.frozen || false,
          indentLevel: (b.indentLevel ?? 0) as 0 | 1 | 2,
          collapsed: b.collapsed ?? false,
        })),
        writingLog: p.writingLog || [],
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

  addBlock: (html = '', afterId, indentLevel = 0) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) {
      const block = createBlock(html, 'paragraph', indentLevel);
      return block;
    }
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) {
      const block = createBlock(html, 'paragraph', indentLevel);
      return block;
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

  deleteBlockVersion: (id, versionIndex) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return;
    const updated = projects.map(p => {
      if (p.id !== currentProjectId) return p;
      const blocks = p.blocks.map(b => {
        if (b.id !== id) return b;
        if (b.versions.length <= 1) return b; // can't delete the only version
        const versions = b.versions.filter((_, i) => i !== versionIndex);
        let activeVersion = b.activeVersion;
        if (activeVersion >= versions.length) activeVersion = versions.length - 1;
        else if (activeVersion > versionIndex) activeVersion--;
        return { ...b, versions, activeVersion };
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
      // Save per-segment citation mapping for disassemble
      const segmentCitations: string[][] = [
        [...(firstBlock.citationIds || [])],
        ...restBlocks.map(b => [...(b.citationIds || [])]),
      ];
      // Build new block (first block with new version)
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
      // Use per-segment citation mapping if available (from merge), else empty
      const segCitations = block.mergeSegmentCitations;
      const hasSegCitations = segCitations && segCitations.length === segments.length;

      // First segment replaces original block
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
      // Remaining segments become new blocks
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },

  addCitationToBlock: (blockId, zoteroKey, data) => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return { duplicate: false, citationId: '' };
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return { duplicate: false, citationId: '' };

    // Duplicate detection: check by zoteroKey OR DOI
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
      // Keep last 30 days
      log.sort((a, b) => a.date.localeCompare(b.date));
      return { ...p, writingLog: log.slice(-30) };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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
    saveToStorage(updated);
    set({ projects: updated, currentProject });
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

      // Compute the family: fromBlock + all immediate descendants
      const familyIndices: number[] = [fromIdx];
      for (let i = fromIdx + 1; i < blocks.length; i++) {
        if ((blocks[i].indentLevel ?? 0) <= fromLevel) break;
        familyIndices.push(i);
      }

      // Extract family blocks (in order)
      const family = familyIndices.map(i => blocks[i]);

      // If newIndentLevel is specified, adjust all family blocks by the delta
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

      // Remove family from current position (highest indices first)
      const sortedIndices = [...familyIndices].sort((a, b) => b - a);
      sortedIndices.forEach(i => blocks.splice(i, 1));

      // Find toId in updated blocks array
      const toIdx = blocks.findIndex(b => b.id === toId);
      if (toIdx === -1) return p;
      const insertIdx = position === 'after' ? toIdx + 1 : toIdx;
      blocks.splice(insertIdx, 0, ...adjustedFamily);
      return { ...p, blocks };
    });
    const currentProject = updated.find(p => p.id === currentProjectId) || null;
    saveToStorage(updated);
    set({ projects: updated, currentProject });
  },
}));
