'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, getOrderedCitationMap } from '@/store/useStore';
import { Block, Citation } from '@/types';
import BlockAIPopup from './BlockAIPopup';

function formatAuthors(creators?: { firstName?: string; lastName?: string; name?: string }[]): string {
  if (!creators || creators.length === 0) return '';
  return creators
    .slice(0, 3)
    .map(c => c.lastName || c.name || c.firstName || '')
    .filter(Boolean)
    .join(', ') + (creators.length > 3 ? ' et al.' : '');
}

// Strip markdown syntax and [N] reference artifacts from HTML text nodes
function cleanMarkdown(html: string): string {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag; // leave HTML tags untouched
    return text
      .replace(/\[\d+\]/g, '')           // [1] [2] … NotebookLM refs
      .replace(/^#{1,6}\s*/gm, '')        // ## headings
      .replace(/\*\*(.*?)\*\*/g, '$1')    // **bold**
      .replace(/\*(.*?)\*/g, '$1')        // *italic*
      .replace(/_(.*?)_/g, '$1')          // _italic_
      .replace(/`(.*?)`/g, '$1')          // `code`
      .replace(/\s{2,}/g, ' ');
  });
}

function wordCount(html: string): number {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function CitationBadge({
  num,
  citation,
  blockId,
  onRemove,
}: {
  num: number;
  citation: Citation;
  blockId: string;
  onRemove: (blockId: string, citationId: string) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  const authors = formatAuthors(citation.data.creators);
  const year = citation.data.date ? citation.data.date.substring(0, 4) : '';
  const abstract = citation.data.abstractNote
    ? citation.data.abstractNote.substring(0, 200) + (citation.data.abstractNote.length > 200 ? '...' : '')
    : '';
  const doiUrl = citation.data.DOI
    ? (citation.data.DOI.startsWith('http') ? citation.data.DOI : `https://doi.org/${citation.data.DOI}`)
    : citation.data.url || null;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(false);
    setPendingRemove(true);
  };

  const doiVerifiedIcon = citation.doiVerified === true ? ' ✓' : citation.doiVerified === false ? ' ✗' : '';
  const doiVerifiedColor = citation.doiVerified === true ? 'text-green-400' : citation.doiVerified === false ? 'text-red-400' : 'text-[#8b90a0]';

  return (
    <span className="relative inline-block" onContextMenu={handleContextMenu}>
      <sup
        className="text-[10px] bg-[#6c8aff]/20 text-[#6c8aff] px-1 py-0.5 rounded cursor-pointer hover:bg-[#6c8aff]/40 transition-colors select-none"
        onMouseEnter={() => { if (!pendingRemove) setShowTooltip(true); }}
        onMouseLeave={() => setShowTooltip(false)}
        title="Right-click to remove"
      >
        [{num}]
      </sup>
      {pendingRemove && (
        <div className="absolute bottom-full left-0 mb-1 bg-[#1a1d27] border border-red-500/40 rounded shadow-xl p-2 z-50 whitespace-nowrap">
          <div className="text-[11px] text-[#e1e4ed] mb-1.5">Remove citation [{num}]?</div>
          <div className="flex gap-1">
            <button
              onClick={() => { setPendingRemove(false); onRemove(blockId, citation.id); }}
              className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
            >
              Remove
            </button>
            <button
              onClick={() => setPendingRemove(false)}
              className="px-2 py-0.5 text-[11px] bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {showTooltip && (
        <div
          className="absolute bottom-full left-0 mb-1 w-72 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl p-3 z-50 text-xs"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="font-semibold text-[#e1e4ed] mb-1 leading-tight">{citation.data.title || 'Untitled'}</div>
          {(authors || year) && (
            <div className="text-[#8b90a0]">{authors}{year ? ` (${year})` : ''}</div>
          )}
          {citation.data.publicationTitle && (
            <div className="text-[#8b90a0] italic">{citation.data.publicationTitle}</div>
          )}
          {abstract && <div className="text-[#8b90a0] mt-1 leading-relaxed">{abstract}</div>}
          {citation.annotationNote && (
            <div className="text-[#6c8aff] mt-1 italic border-t border-[#2d3140] pt-1">{citation.annotationNote}</div>
          )}
          {doiUrl && (
            <a
              href={doiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-1 block hover:underline cursor-pointer ${doiVerifiedColor}`}
            >
              DOI: {citation.data.DOI || doiUrl}{doiVerifiedIcon}
            </a>
          )}
        </div>
      )}
    </span>
  );
}

interface BlockContextMenuProps {
  blockId: string;
  blockHtml: string;
  position: { top: number; left: number };
  onClose: () => void;
  onOpenAI: () => void;
  onSaveVersion: () => void;
  onDisassemble: () => void;
  onDeleteBlock: () => void;
  onCheckCoherence: () => void;
  onClean: () => void;
  canDisassemble: boolean;
}

function BlockContextMenu({
  position, onClose, onOpenAI, onSaveVersion, onDisassemble, onDeleteBlock, onCheckCoherence, onClean, canDisassemble,
}: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const btnClass = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed] transition-colors text-left';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl py-1 min-w-[180px]"
      style={{ top: position.top, left: position.left }}
    >
      <button className={btnClass} onClick={onOpenAI}>
        ✨ AI Rewrite
      </button>
      <button className={btnClass} onClick={onCheckCoherence}>
        🔎 Check Coherence
      </button>
      <button className={btnClass} onClick={onClean}>
        🧹 Clean Markdown
      </button>
      <button className={btnClass} onClick={onSaveVersion}>
        💾 Save as New Version
      </button>
      {canDisassemble && (
        <button className={btnClass} onClick={onDisassemble}>
          🔀 Disassemble Block
        </button>
      )}
      <div className="border-t border-[#2d3140] my-0.5" />
      <button className={`${btnClass} text-red-400 hover:text-red-300 hover:bg-red-500/10`} onClick={onDeleteBlock}>
        🗑️ Delete Block
      </button>
    </div>
  );
}

interface CoherenceToastProps {
  message: string;
  onClose: () => void;
}

function CoherenceToast({ message, onClose }: CoherenceToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 15000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-[#1a1d27] border border-[#6c8aff]/40 rounded-lg shadow-xl p-3">
      <div className="flex items-start gap-2">
        <span className="text-[#6c8aff] text-sm">🔎</span>
        <div className="flex-1">
          <div className="text-xs font-semibold text-[#e1e4ed] mb-1">Coherence Check</div>
          <div className="text-xs text-[#c8ccd8] leading-relaxed whitespace-pre-wrap">{message}</div>
        </div>
        <button onClick={onClose} className="text-[#8b90a0] hover:text-[#e1e4ed] text-xs">✕</button>
      </div>
    </div>
  );
}

interface PastePopupProps {
  detected: { type: 'doi' | 'url' | 'citation'; value: string };
  onLookup: () => void;
  onDismiss: () => void;
}

function PastePopup({ detected, onLookup, onDismiss }: PastePopupProps) {
  const labels: Record<string, string> = {
    doi: 'DOI detected',
    url: 'URL detected',
    citation: 'Citation string detected',
  };
  const actions: Record<string, string> = {
    doi: 'Search Zotero',
    url: 'Search Zotero',
    citation: 'Search Zotero',
  };
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#1a1d27] border border-[#6c8aff]/40 rounded-lg shadow-xl px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-[#8b90a0]">{labels[detected.type]}: <span className="text-[#e1e4ed] font-mono">{detected.value.substring(0, 40)}</span></span>
      <button onClick={onLookup} className="px-2 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded transition-colors">
        {actions[detected.type]}
      </button>
      <button onClick={onDismiss} className="text-[#8b90a0] hover:text-[#e1e4ed] text-xs">✕</button>
    </div>
  );
}

interface BlockItemProps {
  block: Block;
  blockIndex: number;
  isFirst: boolean;
  onFocus: (id: string) => void;
  onBlur: (id: string, html: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string, html: string) => void;
  onPaste: (e: React.ClipboardEvent, id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | null;
  onShowContextMenu: (blockId: string, pos: { top: number; left: number }) => void;
  onSwitchVersion: (id: string, idx: number) => void;
  onDeleteVersion: (id: string, versionIndex: number) => void;
  focusedId: string | null;
  citationMap: Map<string, number>;
  projectCitations: Citation[];
  cmdMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  draggedId: string | null;
  onRemoveCitation: (blockId: string, citationId: string) => void;
}

function BlockItem({
  block,
  blockIndex,
  isFirst,
  onFocus,
  onBlur,
  onKeyDown,
  onPaste,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  dropTargetId,
  dropPosition,
  onShowContextMenu,
  onSwitchVersion,
  onDeleteVersion,
  focusedId,
  citationMap,
  projectCitations,
  cmdMode,
  isSelected,
  onToggleSelect,
  draggedId,
  onRemoveCitation,
}: BlockItemProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const activeHtml = block.versions[block.activeVersion]?.html || '';
  const prevActiveVersion = useRef(block.activeVersion);
  const prevBlockId = useRef(block.id);
  const [hovered, setHovered] = useState(false);
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState<number | null>(null);

  // Set innerHTML on mount or when version/block changes
  useEffect(() => {
    if (!contentRef.current) return;
    const versionChanged = prevActiveVersion.current !== block.activeVersion;
    const blockChanged = prevBlockId.current !== block.id;
    if (versionChanged || blockChanged) {
      contentRef.current.innerHTML = activeHtml;
      prevActiveVersion.current = block.activeVersion;
      prevBlockId.current = block.id;
    }
  }, [block.activeVersion, block.id, activeHtml]);

  // Set initial innerHTML on mount
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = activeHtml;
    }
  }, []); // Only on mount

  const isDropBefore = dropTargetId === block.id && dropPosition === 'before';
  const isDropAfter = dropTargetId === block.id && dropPosition === 'after';
  const isFocused = focusedId === block.id;
  const isCmdDropTarget = draggedId !== null && cmdMode && dropTargetId === block.id && draggedId !== block.id;

  const handleHandleClick = (e: React.MouseEvent) => {
    if (cmdMode) {
      onToggleSelect(block.id);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onShowContextMenu(block.id, { top: rect.top, left: rect.right + 8 });
  };

  const blockCitations = (block.citationIds || [])
    .map(cid => ({ num: citationMap.get(cid), citation: projectCitations.find(c => c.id === cid) }))
    .filter((x): x is { num: number; citation: Citation } => x.num !== undefined && x.citation !== undefined);

  const wc = wordCount(activeHtml);

  return (
    <div className="group relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Block number — shown on hover, floats left of the block rectangle */}
      <div
        className={`absolute -left-7 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#8b90a0]/40 select-none transition-opacity pointer-events-none ${hovered ? 'opacity-100' : 'opacity-0'}`}
      >
        {blockIndex + 1}
      </div>
      {/* Drop indicator before */}
      <div className={`drop-indicator ${isDropBefore && !cmdMode ? 'active' : ''}`} />
      <div
        className={`flex items-start gap-1 px-4 py-0.5 rounded transition-colors ${
          isCmdDropTarget
            ? 'ring-2 ring-[#6c8aff] bg-[#6c8aff]/10'
            : isSelected
            ? 'bg-[#6c8aff]/15 ring-1 ring-[#6c8aff]/40'
            : isFocused
            ? 'bg-[#1a1d27]/50'
            : 'hover:bg-[#1a1d27]/30'
        }`}
        draggable
        onDragStart={e => onDragStart(e, block.id)}
        onDragOver={e => onDragOver(e, block.id)}
        onDrop={e => onDrop(e, block.id)}
        onDragLeave={onDragLeave}
      >
        {/* Cmd-mode checkbox */}
        {cmdMode && (
          <div
            className="flex-shrink-0 mt-1 w-4 h-4 rounded border border-[#6c8aff] flex items-center justify-center cursor-pointer select-none"
            style={{ background: isSelected ? '#6c8aff' : 'transparent' }}
            onClick={() => onToggleSelect(block.id)}
          >
            {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
          </div>
        )}
        {/* Drag handle */}
        <div
          className={`flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity select-none ${
            cmdMode
              ? 'cursor-pointer text-[#6c8aff]'
              : 'cursor-pointer text-[#8b90a0] hover:text-[#6c8aff]'
          }`}
          title={cmdMode ? 'Click to select for merge' : 'Drag to reorder / Click for options'}
          onClick={handleHandleClick}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="4" cy="3" r="1.2" />
            <circle cx="4" cy="7" r="1.2" />
            <circle cx="4" cy="11" r="1.2" />
            <circle cx="9" cy="3" r="1.2" />
            <circle cx="9" cy="7" r="1.2" />
            <circle cx="9" cy="11" r="1.2" />
          </svg>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            ref={contentRef}
            className="block-content"
            contentEditable
            suppressContentEditableWarning
            data-placeholder={isFirst ? 'Start writing your research...' : ''}
            onFocus={() => onFocus(block.id)}
            onBlur={() => onBlur(block.id, contentRef.current?.innerHTML || '')}
            onKeyDown={e => onKeyDown(e, block.id, contentRef.current?.innerHTML || '')}
            onPaste={e => onPaste(e, block.id)}
          />
          {/* Citation badges */}
          {blockCitations.length > 0 && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {blockCitations.map(({ num, citation }) => (
                <CitationBadge key={citation.id} num={num} citation={citation} blockId={block.id} onRemove={onRemoveCitation} />
              ))}
            </div>
          )}
          {/* Version pills */}
          {block.versions.length > 1 && (
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap items-center">
              {block.versions.map((v, idx) => (
                <div key={idx} className="relative">
                  <button
                    onClick={() => onSwitchVersion(block.id, idx)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (block.versions.length > 1) setPendingDeleteVersion(idx);
                    }}
                    className={`version-pill ${idx === block.activeVersion ? 'active' : ''}`}
                    title={`${v.instruction || `Version ${idx + 1}`} — right-click to delete`}
                  >
                    v{idx + 1}
                  </button>
                  {pendingDeleteVersion === idx && (
                    <div className="absolute bottom-full left-0 mb-1 bg-[#1a1d27] border border-red-500/40 rounded shadow-xl p-2 z-50 whitespace-nowrap">
                      <div className="text-[11px] text-[#e1e4ed] mb-1.5">Delete v{idx + 1}?</div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setPendingDeleteVersion(null); onDeleteVersion(block.id, idx); }}
                          className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setPendingDeleteVersion(null)}
                          className="px-2 py-0.5 text-[11px] bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Word count badge (hover) */}
        {hovered && wc > 0 && (
          <div className="flex-shrink-0 mt-1 text-[10px] text-[#8b90a0]/60 select-none whitespace-nowrap">
            {wc}w
          </div>
        )}
      </div>
      {/* Drop indicator after */}
      <div className={`drop-indicator ${isDropAfter && !cmdMode ? 'active' : ''}`} />
    </div>
  );
}

export default function BlockEditor() {
  const {
    currentProject,
    updateBlock,
    deleteBlock,
    addBlock,
    moveBlock,
    mergeBlocks,
    splitBlock,
    addBlockVersion,
    switchBlockVersion,
    deleteBlockVersion,
    setFocusedBlockId,
    removeCitationFromBlock,
  } = useStore();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [aiPopup, setAiPopup] = useState<{ blockId: string; pos: { top: number; left: number } } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ blockId: string; pos: { top: number; left: number } } | null>(null);
  const [cmdMode, setCmdMode] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [coherenceToast, setCoherenceToast] = useState<string | null>(null);
  const [pastePopup, setPastePopup] = useState<{ type: 'doi' | 'url' | 'citation'; value: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFocusId = useRef<string | null>(null);

  const blocks = currentProject?.blocks || [];
  const projectCitations = currentProject?.citations || [];
  const citationMap = getOrderedCitationMap(blocks, projectCitations);

  // Total word count
  const totalWords = blocks.reduce((sum, b) => sum + wordCount(b.versions[b.activeVersion]?.html || ''), 0);
  const readingMins = Math.ceil(totalWords / 200);

  // Track Cmd key for merge mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta') setCmdMode(true);
      // Cmd+K handled in MainApp
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') setCmdMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Clear selection when leaving cmd mode
  useEffect(() => {
    if (!cmdMode) setSelectedBlockIds(new Set());
  }, [cmdMode]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      useStore.getState().saveCurrentProject();
    }, 500);
  }, []);

  const handleFocus = (id: string) => {
    setFocusedId(id);
    setFocusedBlockId(id);
  };

  const handleBlur = (id: string, html: string) => {
    updateBlock(id, html);
    scheduleAutoSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, html: string) => {
    // Cmd+Shift+Up/Down — move block
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      updateBlock(id, html);
      const blockIdx = blocks.findIndex(b => b.id === id);
      if (e.key === 'ArrowUp' && blockIdx > 0) {
        moveBlock(id, blocks[blockIdx - 1].id, 'before');
        pendingFocusId.current = id;
      } else if (e.key === 'ArrowDown' && blockIdx < blocks.length - 1) {
        moveBlock(id, blocks[blockIdx + 1].id, 'after');
        pendingFocusId.current = id;
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      updateBlock(id, html);
      const newBlock = addBlock('', id);
      pendingFocusId.current = newBlock.id;
    } else if (e.key === 'Backspace') {
      const el = e.currentTarget as HTMLDivElement;
      if (el.innerHTML === '' || el.innerHTML === '<br>') {
        e.preventDefault();
        const blockIdx = blocks.findIndex(b => b.id === id);
        deleteBlock(id);
        if (blockIdx > 0) {
          pendingFocusId.current = blocks[blockIdx - 1].id;
        }
      }
    }
  };

  // #18 — Paste-and-Parse Smart Detection
  const handlePaste = useCallback((_e: React.ClipboardEvent, _blockId: string) => {
    const text = _e.clipboardData.getData('text/plain').trim();
    // DOI pattern
    const doiMatch = text.match(/\b(10\.\d{4,}\/\S+)/);
    // URL pattern
    const urlMatch = text.match(/^https?:\/\/\S+$/);
    // Citation string: "Author et al., YYYY"
    const citMatch = text.match(/[A-Z][a-z]+.{1,50}\d{4}/);

    if (doiMatch) {
      setPastePopup({ type: 'doi', value: doiMatch[1] });
    } else if (urlMatch && !doiMatch) {
      setPastePopup({ type: 'url', value: text });
    } else if (citMatch && text.length < 200) {
      setPastePopup({ type: 'citation', value: text });
    }
    // Always allow normal paste to proceed
  }, []);

  const handlePasteSearch = () => {
    if (!pastePopup) return;
    // Open Zotero tab and populate search with the detected value
    const event = new CustomEvent('zotero-search', { detail: { query: pastePopup.value } });
    window.dispatchEvent(event);
    setPastePopup(null);
  };

  // Focus pending block after render
  useEffect(() => {
    if (pendingFocusId.current) {
      const id = pendingFocusId.current;
      pendingFocusId.current = null;
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${id}"] .block-content`) as HTMLElement;
        if (el) {
          el.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 10);
    }
  });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === draggedId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTargetId(id);
    setDropPosition(e.clientY < midY ? 'before' : 'after');
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && targetId !== draggedId) {
      if (e.metaKey) {
        mergeBlocks([draggedId, targetId]);
      } else if (dropPosition) {
        moveBlock(draggedId, targetId, dropPosition);
      }
    }
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDropTargetId(null);
    setDropPosition(null);
  };

  // #16 — PDF Drop-to-Extract
  const handleEditorDragOver = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.items || []);
    const hasPdf = files.some(f => f.type === 'application/pdf' || (f.kind === 'file' && f.getAsFile()?.name?.endsWith('.pdf')));
    if (hasPdf) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleEditorDrop = async (e: React.DragEvent) => {
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (!pdf) return;
    e.preventDefault();
    e.stopPropagation();

    // Show loading block
    const loadingBlock = addBlock(`<p><em>Extracting PDF: ${pdf.name}...</em></p>`);
    const formData = new FormData();
    formData.append('file', pdf);
    try {
      const res = await fetch('/api/pdf/extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.text) {
        addBlockVersion(loadingBlock.id, `<p>${data.text}</p>`, `PDF: ${pdf.name}`);
      }
    } catch (err) {
      addBlockVersion(loadingBlock.id, `<p>Failed to extract PDF: ${pdf.name}</p>`, 'Error');
    }
  };

  const handleShowContextMenu = (blockId: string, pos: { top: number; left: number }) => {
    setContextMenu({ blockId, pos });
    setAiPopup(null);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedBlockIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMergeSelected = () => {
    mergeBlocks(Array.from(selectedBlockIds));
    setSelectedBlockIds(new Set());
    setCmdMode(false);
  };

  // Context menu actions
  const handleContextSaveVersion = () => {
    if (!contextMenu) return;
    const { blockId } = contextMenu;
    const liveEl = document.querySelector(`[data-block-id="${blockId}"] .block-content`) as HTMLElement;
    const liveHtml = liveEl?.innerHTML || '';
    addBlockVersion(blockId, liveHtml, 'Manual edit');
    setContextMenu(null);
  };

  const handleContextDisassemble = () => {
    if (!contextMenu) return;
    const { blockId } = contextMenu;
    const liveEl = document.querySelector(`[data-block-id="${blockId}"] .block-content`) as HTMLElement;
    const liveHtml = liveEl?.innerHTML || '';
    splitBlock(blockId, liveHtml);
    setContextMenu(null);
  };

  const handleContextDeleteBlock = () => {
    if (!contextMenu) return;
    deleteBlock(contextMenu.blockId);
    setContextMenu(null);
  };

  const handleContextClean = () => {
    if (!contextMenu) return;
    const { blockId } = contextMenu;
    const liveEl = document.querySelector(`[data-block-id="${blockId}"] .block-content`) as HTMLElement;
    const rawHtml = liveEl?.innerHTML || '';
    const cleaned = cleanMarkdown(rawHtml);
    if (cleaned !== rawHtml) {
      addBlockVersion(blockId, cleaned, 'Cleaned markdown');
    }
    setContextMenu(null);
  };

  const handleContextOpenAI = () => {
    if (!contextMenu) return;
    setAiPopup({ blockId: contextMenu.blockId, pos: contextMenu.pos });
    setContextMenu(null);
  };

  // #2 — Paragraph-Level Coherence Check
  const handleContextCheckCoherence = async () => {
    if (!contextMenu) return;
    const { blockId } = contextMenu;
    setContextMenu(null);

    const blockIdx = blocks.findIndex(b => b.id === blockId);
    if (blockIdx === -1) return;

    const getHtml = (b: Block) => {
      const liveEl = document.querySelector(`[data-block-id="${b.id}"] .block-content`) as HTMLElement | null;
      return liveEl?.innerHTML || b.versions[b.activeVersion]?.html || '';
    };
    const stripHtmlLocal = (h: string) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent || ''; };

    const before = blocks.slice(Math.max(0, blockIdx - 2), blockIdx).map(getHtml).map(stripHtmlLocal);
    const current = stripHtmlLocal(getHtml(blocks[blockIdx]));
    const after = blocks.slice(blockIdx + 1, blockIdx + 3).map(getHtml).map(stripHtmlLocal);

    const contextParts: string[] = [];
    if (before.length) contextParts.push('Previous paragraphs:\n' + before.join('\n\n'));
    contextParts.push('Current paragraph:\n' + current);
    if (after.length) contextParts.push('Following paragraphs:\n' + after.join('\n\n'));

    try {
      const res = await fetch('/api/ai/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Does this paragraph flow logically from the surrounding paragraphs? Flag any logical gaps, abrupt transitions, or coherence issues. Be concise.\n\n${contextParts.join('\n\n---\n\n')}`,
          model: 'anthropic/claude-sonnet-4-20250514',
        }),
      });
      const data = await res.json();
      setCoherenceToast(data.text || 'No response');
    } catch {
      setCoherenceToast('Failed to check coherence.');
    }
  };

  const handleAIApply = (newHtml: string, instruction: string) => {
    if (aiPopup) {
      addBlockVersion(aiPopup.blockId, newHtml, instruction);
    }
    setAiPopup(null);
  };

  const handleInsertFromChat = useCallback((html: string) => {
    if (focusedId) {
      addBlock(html, focusedId);
    } else {
      addBlock(html);
    }
  }, [focusedId, addBlock]);

  // Expose insert handler globally for BottomPane
  useEffect(() => {
    (window as any).__insertToEditor = handleInsertFromChat;
    return () => { delete (window as any).__insertToEditor; };
  }, [handleInsertFromChat]);

  // Expose focusedId for CommandPalette / other components
  useEffect(() => {
    (window as any).__editorFocusedBlockId = focusedId;
  }, [focusedId]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full text-[#8b90a0] text-sm">
        No project open
      </div>
    );
  }

  // Determine if the context menu block can be disassembled
  const contextMenuBlock = contextMenu ? blocks.find(b => b.id === contextMenu.blockId) : null;
  const contextMenuHtml = contextMenuBlock
    ? (() => {
        const liveEl = typeof document !== 'undefined'
          ? document.querySelector(`[data-block-id="${contextMenu!.blockId}"] .block-content`) as HTMLElement | null
          : null;
        return liveEl?.innerHTML || contextMenuBlock.versions[contextMenuBlock.activeVersion]?.html || '';
      })()
    : '';
  const canDisassemble = /<br\s*\/?>\s*<br\s*\/?>/i.test(contextMenuHtml);

  // Context blocks for AI popup (#4)
  const getAiPopupContext = () => {
    if (!aiPopup) return { contextBefore: [], contextAfter: [] };
    const idx = blocks.findIndex(b => b.id === aiPopup.blockId);
    const getHtml = (b: Block) => b.versions[b.activeVersion]?.html || '';
    const contextBefore = blocks.slice(Math.max(0, idx - 2), idx).map(getHtml);
    const contextAfter = blocks.slice(idx + 1, idx + 3).map(getHtml);
    return { contextBefore, contextAfter };
  };
  const { contextBefore, contextAfter } = getAiPopupContext();

  const selectedBlocksHtmlArr = Array.from(selectedBlockIds)
    .map(id => blocks.find(b => b.id === id))
    .filter(Boolean)
    .map(b => b!.versions[b!.activeVersion]?.html || '');

  return (
    <div
      className={`h-full overflow-y-auto bg-[#0f1117] relative ${isDragOver ? 'ring-2 ring-[#6c8aff] ring-inset' : ''}`}
      onDragOver={handleEditorDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleEditorDrop}
    >
      {/* Cmd-mode hint bar */}
      {cmdMode && (
        <div className="sticky top-0 z-10 bg-[#6c8aff]/10 border-b border-[#6c8aff]/30 px-4 py-1.5 flex items-center gap-3 text-xs text-[#6c8aff]">
          <span>⌘ Merge mode — click block handles or checkboxes to select</span>
          {selectedBlockIds.size >= 2 && (
            <button
              onClick={handleMergeSelected}
              className="ml-auto px-3 py-1 bg-[#6c8aff] text-white rounded font-medium hover:bg-[#5a78f0] transition-colors"
            >
              Merge {selectedBlockIds.size} blocks
            </button>
          )}
        </div>
      )}
      {/* PDF drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#6c8aff]/10 pointer-events-none">
          <div className="text-[#6c8aff] text-lg font-semibold">Drop PDF to extract</div>
        </div>
      )}
      {/* Word count bar */}
      {totalWords > 0 && (
        <div className="sticky top-0 z-[5] flex justify-end px-4 py-0.5 bg-[#0f1117]/80 backdrop-blur-sm">
          <span className="text-[10px] text-[#8b90a0]/60">{totalWords} words · ~{readingMins} min read</span>
        </div>
      )}
      <div className="max-w-3xl mx-auto py-6">
        {blocks.map((block, idx) => (
          <div key={block.id} data-block-id={block.id}>
            <BlockItem
              block={block}
              blockIndex={idx}
              isFirst={idx === 0}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragLeave={handleDragLeave}
              dropTargetId={dropTargetId}
              dropPosition={dropPosition}
              onShowContextMenu={handleShowContextMenu}
              onSwitchVersion={switchBlockVersion}
              onDeleteVersion={deleteBlockVersion}
              focusedId={focusedId}
              citationMap={citationMap}
              projectCitations={projectCitations}
              cmdMode={cmdMode}
              isSelected={selectedBlockIds.has(block.id)}
              onToggleSelect={handleToggleSelect}
              draggedId={draggedId}
              onRemoveCitation={removeCitationFromBlock}
            />
          </div>
        ))}
        {/* Click area to add new block */}
        <div
          className="h-16 cursor-text"
          onClick={() => {
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock) {
              const el = document.querySelector(`[data-block-id="${lastBlock.id}"] .block-content`) as HTMLElement;
              if (el) el.focus();
            }
          }}
        />
      </div>
      {/* Context menu */}
      {contextMenu && (
        <BlockContextMenu
          blockId={contextMenu.blockId}
          blockHtml={contextMenuHtml}
          position={contextMenu.pos}
          onClose={() => setContextMenu(null)}
          onOpenAI={handleContextOpenAI}
          onSaveVersion={handleContextSaveVersion}
          onDisassemble={handleContextDisassemble}
          onDeleteBlock={handleContextDeleteBlock}
          onCheckCoherence={handleContextCheckCoherence}
          onClean={handleContextClean}
          canDisassemble={canDisassemble}
        />
      )}
      {/* AI popup */}
      {aiPopup && (
        <BlockAIPopup
          blockId={aiPopup.blockId}
          blockHtml={blocks.find(b => b.id === aiPopup.blockId)?.versions[blocks.find(b => b.id === aiPopup.blockId)?.activeVersion || 0]?.html || ''}
          contextBefore={contextBefore}
          contextAfter={contextAfter}
          selectedBlocksHtml={selectedBlocksHtmlArr}
          projectTitle={currentProject?.name}
          onApply={handleAIApply}
          onClose={() => setAiPopup(null)}
          position={aiPopup.pos}
        />
      )}
      {/* Coherence toast (#2) */}
      {coherenceToast && (
        <CoherenceToast message={coherenceToast} onClose={() => setCoherenceToast(null)} />
      )}
      {/* Paste popup (#18) */}
      {pastePopup && (
        <PastePopup
          detected={pastePopup}
          onLookup={handlePasteSearch}
          onDismiss={() => setPastePopup(null)}
        />
      )}
    </div>
  );
}
