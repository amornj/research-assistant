'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, getOrderedCitationMap } from '@/store/useStore';
import { Block, Citation, BlockComment } from '@/types';
import BlockAIPopup from './BlockAIPopup';
import VersionTimeline from './VersionTimeline';
import { playCompletionSound } from '@/lib/sounds';
import { fleschKincaid } from '@/lib/readability';

function formatAuthors(creators?: { firstName?: string; lastName?: string; name?: string }[]): string {
  if (!creators || creators.length === 0) return '';
  return creators
    .slice(0, 3)
    .map(c => c.lastName || c.name || c.firstName || '')
    .filter(Boolean)
    .join(', ') + (creators.length > 3 ? ' et al.' : '');
}

function cleanMarkdown(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n = walker.nextNode();
  while (n) { nodes.push(n as Text); n = walker.nextNode(); }
  for (const node of nodes) {
    let t = node.textContent || '';
    t = t
      .replace(/\[\d+(?:[,\s\u2013\u2014\-]*\d+)*\]/g, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/[ \t]{2,}/g, ' ');
    node.textContent = t;
  }
  return div.innerHTML;
}

function wordCount(html: string): number {
  if (typeof document === 'undefined') return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function getFirstLine(html: string): string {
  if (typeof document === 'undefined') return '';
  const div = document.createElement('div');
  div.innerHTML = html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = (div.textContent || '').trim();
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
  if (!firstLine) return '(empty block)';
  return firstLine.length > 120 ? firstLine.substring(0, 120) + '…' : firstLine;
}

function getHeadingLevel(html: string): 1 | 2 | 3 | null {
  const m = html.trim().match(/^<h([123])/i);
  return m ? (parseInt(m[1]) as 1 | 2 | 3) : null;
}

// Feature #7: block type colors
const BLOCK_TYPE_COLORS: Record<string, string> = {
  hypothesis: '#f59e0b',
  background: '#64748b',
  method: '#3b82f6',
  result: '#22c55e',
  discussion: '#a855f7',
  conclusion: '#ef4444',
};

function CitationBadge({
  num, citation, blockId, onRemove,
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
            <button onClick={() => { setPendingRemove(false); onRemove(blockId, citation.id); }} className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded">Remove</button>
            <button onClick={() => setPendingRemove(false)} className="px-2 py-0.5 text-[11px] bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">Cancel</button>
          </div>
        </div>
      )}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-1 w-72 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl p-3 z-50 text-xs"
          onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
          <div className="font-semibold text-[#e1e4ed] mb-1 leading-tight">{citation.data.title || 'Untitled'}</div>
          {(authors || year) && <div className="text-[#8b90a0]">{authors}{year ? ` (${year})` : ''}</div>}
          {citation.data.publicationTitle && <div className="text-[#8b90a0] italic">{citation.data.publicationTitle}</div>}
          {abstract && <div className="text-[#8b90a0] mt-1 leading-relaxed">{abstract}</div>}
          {citation.annotationNote && <div className="text-[#6c8aff] mt-1 italic border-t border-[#2d3140] pt-1">{citation.annotationNote}</div>}
          {doiUrl && (
            <a href={doiUrl} target="_blank" rel="noopener noreferrer" className={`mt-1 block hover:underline cursor-pointer ${doiVerifiedColor}`}>
              DOI: {citation.data.DOI || doiUrl}{doiVerifiedIcon}
            </a>
          )}
        </div>
      )}
    </span>
  );
}

// Feature #9: Comment badge
function CommentBadge({ comments, blockId, onDelete }: { comments: BlockComment[]; blockId: string; onDelete: (blockId: string, commentId: string) => void }) {
  const [open, setOpen] = useState(false);
  if (comments.length === 0) return null;
  return (
    <span className="relative inline-block ml-1">
      <button
        className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 py-0.5 rounded cursor-pointer hover:bg-yellow-500/30 transition-colors select-none"
        onClick={() => setOpen(v => !v)}
        title="View comments"
      >
        💬 {comments.length}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl p-2 z-50 text-xs">
          <div className="font-semibold text-[#e1e4ed] mb-1">Comments</div>
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-1 mb-1.5">
              <div className="flex-1 text-[#c8ccd8]">{c.text}</div>
              <button onClick={() => onDelete(blockId, c.id)} className="text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

interface BlockContextMenuProps {
  blockId: string;
  blockHtml: string;
  wordCount: number;
  position: { top: number; left: number };
  onClose: () => void;
  onOpenAI: () => void;
  onSaveVersion: () => void;
  onReadAloud: () => void;
  onDisassemble: () => void;
  onDeleteBlock: () => void;
  onCheckCoherence: () => void;
  onClean: () => void;
  onInsertBelow: () => void;
  canDisassemble: boolean;
  blockHasCitations: boolean;
  onFindReferences: () => void;
  // Feature #7
  currentBlockType?: Block['blockType'];
  onSetBlockType: (type: Block['blockType']) => void;
  // Feature #9
  onAddComment: () => void;
  // Feature #15
  onFindRelated: () => void;
  // Feature #17
  frozen: boolean;
  onToggleFrozen: () => void;
  // Feature #19
  onViewTimeline: () => void;
  // Collapse/Expand
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

function BlockContextMenu({
  position, onClose, onOpenAI, onSaveVersion, onReadAloud, onDisassemble, onDeleteBlock,
  onCheckCoherence, onClean, onInsertBelow, canDisassemble, blockHasCitations, onFindReferences,
  wordCount, currentBlockType, onSetBlockType, onAddComment, onFindRelated,
  frozen, onToggleFrozen, onViewTimeline,
  collapsed, onToggleCollapse, onCollapseAll, onExpandAll,
}: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const btnClass = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed] transition-colors text-left';
  const disabledClass = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[#8b90a0]/40 cursor-not-allowed text-left';

  const BLOCK_TYPES: { value: Block['blockType']; label: string }[] = [
    { value: 'hypothesis', label: '🔬 Hypothesis' },
    { value: 'background', label: '📚 Background' },
    { value: 'method', label: '🔧 Method' },
    { value: 'result', label: '📊 Result' },
    { value: 'discussion', label: '💬 Discussion' },
    { value: 'conclusion', label: '✅ Conclusion' },
  ];

  return (
    <div ref={menuRef} className="fixed z-50 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl py-1 min-w-[190px]"
      style={{ top: position.top, left: position.left }}>
      {frozen ? (
        <>
          <div className={disabledClass}>✨ AI Rewrite (frozen)</div>
          <div className={disabledClass}>🔎 Check Coherence (frozen)</div>
          <div className={disabledClass}>🧹 Clean Markdown (frozen)</div>
        </>
      ) : (
        <>
          <button className={btnClass} onClick={onOpenAI}>✨ AI Rewrite</button>
          <button className={btnClass} onClick={onCheckCoherence}>🔎 Check Coherence</button>
          <button className={btnClass} onClick={onClean}>🧹 Clean Markdown</button>
        </>
      )}
      {!blockHasCitations && !frozen && (
        <button className={btnClass} onClick={onFindReferences}>🔍 Find References</button>
      )}
      <button className={btnClass} onClick={onFindRelated}>🔗 Find Related Blocks</button>
      <button className={btnClass} onClick={onSaveVersion}>💾 Save as New Version</button>
      <button className={btnClass} onClick={onViewTimeline}>🕐 Version History</button>
      <button className={btnClass} onClick={onReadAloud}>🔊 Read Aloud</button>
      {canDisassemble && !frozen && (
        <button className={btnClass} onClick={onDisassemble}>🔀 Disassemble Block</button>
      )}

      {/* Feature #7: Set Type submenu */}
      <div className="border-t border-[#2d3140] my-0.5" />
      <div className="relative">
        <button className={`${btnClass} justify-between`} onClick={() => setShowTypeMenu(v => !v)}>
          <span>🏷️ Set Type{currentBlockType ? ` (${currentBlockType})` : ''}</span>
          <span className="text-[#8b90a0]">›</span>
        </button>
        {showTypeMenu && (
          <div className="absolute left-full top-0 ml-1 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl py-1 min-w-[140px] z-50">
            {BLOCK_TYPES.map(t => (
              <button key={t.value} className={`${btnClass} ${currentBlockType === t.value ? 'text-[#6c8aff]' : ''}`}
                onClick={() => { onSetBlockType(t.value); onClose(); }}>
                {t.label}
              </button>
            ))}
            {currentBlockType && (
              <button className={btnClass} onClick={() => { onSetBlockType(undefined); onClose(); }}>
                ✕ Clear type
              </button>
            )}
          </div>
        )}
      </div>

      {/* Feature #9: Add Comment */}
      <button className={btnClass} onClick={onAddComment}>💬 Add Comment</button>

      <div className="border-t border-[#2d3140] my-0.5" />
      <button className={btnClass} onClick={() => { onToggleCollapse(); onClose(); }}>
        {collapsed ? '▶ Expand Block' : '▼ Collapse Block'}
      </button>
      <button className={btnClass} onClick={() => { onCollapseAll(); onClose(); }}>📦 Collapse All</button>
      <button className={btnClass} onClick={() => { onExpandAll(); onClose(); }}>📂 Expand All</button>
      <div className="border-t border-[#2d3140] my-0.5" />
      <button className={btnClass} onClick={onInsertBelow}>➕ Insert Block Below</button>
      <button className={btnClass} onClick={onToggleFrozen}>
        {frozen ? '🔓 Unfreeze Block' : '🔒 Freeze Block'}
      </button>
      {!frozen && (
        <button className={`${btnClass} text-red-400 hover:text-red-300 hover:bg-red-500/10`} onClick={onDeleteBlock}>
          🗑️ Delete Block
        </button>
      )}
      <div className="border-t border-[#2d3140] my-0.5" />
      <div className="px-3 py-1.5 text-[10px] text-[#8b90a0]/60 select-none italic text-center">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </div>
    </div>
  );
}

function CoherenceToast({ message, onClose }: { message: string; onClose: () => void }) {
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

// Feature #6: Analysis modal
function AnalysisModal({ result, onClose }: { result: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2d3140]">
          <h2 className="text-sm font-semibold text-[#e1e4ed]">🔍 Argument Gap Analysis</h2>
          <button onClick={onClose} className="text-[#8b90a0] hover:text-[#e1e4ed]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-sm text-[#c8ccd8] leading-relaxed whitespace-pre-wrap">{result}</div>
        </div>
      </div>
    </div>
  );
}

// Feature #8: Abstract modal
function AbstractModal({ result, onInsert, onClose }: { result: string; onInsert: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2d3140]">
          <h2 className="text-sm font-semibold text-[#e1e4ed]">🧠 Generated Abstract</h2>
          <button onClick={onClose} className="text-[#8b90a0] hover:text-[#e1e4ed]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-sm text-[#c8ccd8] leading-relaxed whitespace-pre-wrap">{result}</div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#2d3140]">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">Discard</button>
          <button onClick={onInsert} className="px-3 py-1.5 text-xs bg-[#6c8aff] hover:bg-[#5a78f0] text-white rounded">Insert at Top</button>
        </div>
      </div>
    </div>
  );
}

// Feature #20: Share modal
function ShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-xl shadow-2xl w-[500px] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2d3140]">
          <h2 className="text-sm font-semibold text-[#e1e4ed]">🔗 Shareable Link</h2>
          <button onClick={onClose} className="text-[#8b90a0] hover:text-[#e1e4ed]">✕</button>
        </div>
        <div className="p-5">
          <div className="flex gap-2">
            <input readOnly value={url} className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-3 py-2 text-xs text-[#e1e4ed] font-mono" />
            <button onClick={handleCopy} className="px-3 py-2 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded transition-colors">
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-[#8b90a0] mt-2">This is a public GitHub Gist with your document content.</p>
        </div>
      </div>
    </div>
  );
}

function PastePopup({ detected, onLookup, onDismiss }: {
  detected: { type: 'doi' | 'url' | 'citation'; value: string };
  onLookup: () => void; onDismiss: () => void;
}) {
  const labels: Record<string, string> = { doi: 'DOI detected', url: 'URL detected', citation: 'Citation string detected' };
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#1a1d27] border border-[#6c8aff]/40 rounded-lg shadow-xl px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-[#8b90a0]">{labels[detected.type]}: <span className="text-[#e1e4ed] font-mono">{detected.value.substring(0, 40)}</span></span>
      <button onClick={onLookup} className="px-2 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded">Search Zotero</button>
      <button onClick={onDismiss} className="text-[#8b90a0] hover:text-[#e1e4ed] text-xs">✕</button>
    </div>
  );
}

// Feature #11: Block link popup
function BlockLinkPopup({ blocks, query, onSelect, onClose }: {
  blocks: Block[]; query: string; onSelect: (blockId: string, label: string) => void; onClose: () => void;
}) {
  const filtered = blocks.filter(b => {
    const first = getFirstLine(b.versions[b.activeVersion]?.html || '');
    return first.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 8);

  return (
    <div className="fixed z-50 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl py-1 min-w-[260px] max-h-[200px] overflow-y-auto">
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[#8b90a0]">No matching blocks</div>
      ) : filtered.map(b => {
        const label = getFirstLine(b.versions[b.activeVersion]?.html || '');
        return (
          <button key={b.id}
            className="w-full text-left px-3 py-1.5 text-xs text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed]"
            onClick={() => { onSelect(b.id, label); onClose(); }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface BlockItemProps {
  block: Block;
  blockIndex: number;
  isAnimated?: boolean;
  isRelated?: boolean;
  onCompare: (blockId: string, versionIndex: number) => void;
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
  dropIndentLevel: 0 | 1 | 2 | null;
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
  collapsed: boolean;
  onToggleCollapse: (id: string, allBlocks: boolean) => void;
  hasOutlinerChildren: boolean;
  // Feature #2: Section folding
  isSectionHeading: boolean;
  sectionFolded: boolean;
  onToggleSectionFold: () => void;
  // Feature #3: Focus mode
  focusMode: boolean;
  // Feature #9
  onDeleteComment: (blockId: string, commentId: string) => void;
  // Feature #11: block link click
  onBlockLinkClick: (blockId: string) => void;
  // Feature #19: version timeline
  onViewTimeline: (blockId: string) => void;
}

function BlockItem({
  block, blockIndex, isAnimated, isRelated, onCompare, isFirst, onFocus, onBlur, onKeyDown, onPaste,
  onDragStart, onDragOver, onDrop, onDragLeave, dropTargetId, dropPosition, dropIndentLevel,
  onShowContextMenu, onSwitchVersion, onDeleteVersion, focusedId, citationMap, projectCitations, cmdMode,
  isSelected, onToggleSelect, draggedId, onRemoveCitation, collapsed, onToggleCollapse,
  hasOutlinerChildren, isSectionHeading, sectionFolded, onToggleSectionFold, focusMode, onDeleteComment,
  onBlockLinkClick, onViewTimeline,
}: BlockItemProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const activeHtml = block.versions[block.activeVersion]?.html || '';
  const prevActiveVersion = useRef(block.activeVersion);
  const prevBlockId = useRef(block.id);
  const [hovered, setHovered] = useState(false);
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState<number | null>(null);

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

  useEffect(() => {
    if (contentRef.current) contentRef.current.innerHTML = activeHtml;
  }, []);

  const isDropBefore = dropTargetId === block.id && dropPosition === 'before';
  const isDropAfter = dropTargetId === block.id && dropPosition === 'after';
  const isFocused = focusedId === block.id;
  const isCmdDropTarget = draggedId !== null && cmdMode && dropTargetId === block.id && draggedId !== block.id;

  const handleHandleClick = (e: React.MouseEvent) => {
    if (cmdMode) { onToggleSelect(block.id); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onShowContextMenu(block.id, { top: rect.top, left: rect.right + 8 });
  };

  // Feature #11: handle clicks on block-link spans
  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const linkSpan = target.closest('[data-block-link]') as HTMLElement | null;
    if (linkSpan) {
      e.preventDefault();
      const linkedId = linkSpan.getAttribute('data-block-link');
      if (linkedId) onBlockLinkClick(linkedId);
    }
  };

  const blockCitations = (block.citationIds || [])
    .map(cid => ({ num: citationMap.get(cid), citation: projectCitations.find(c => c.id === cid) }))
    .filter((x): x is { num: number; citation: Citation } => x.num !== undefined && x.citation !== undefined);

  const wc = wordCount(activeHtml);

  // Feature #10: readability
  const readability = hovered ? (() => {
    if (typeof document === 'undefined') return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = activeHtml;
    const text = tmp.textContent || '';
    if (!text.trim() || wc < 5) return null;
    return fleschKincaid(text);
  })() : null;

  // Feature #7: block type border color
  const blockTypeColor = block.blockType ? BLOCK_TYPE_COLORS[block.blockType] : null;

  // Feature #3: focus mode opacity
  const isFocusDimmed = focusMode && !isFocused && !hovered;

  return (
    <div
      className={`group relative transition-opacity duration-200 ${isFocusDimmed ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Block number */}
      <div className={`absolute -left-7 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#8b90a0]/40 select-none transition-opacity pointer-events-none ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        {blockIndex + 1}
      </div>
      {/* Drop indicator before */}
      <div
        className={`drop-indicator ${isDropBefore && !cmdMode ? 'active' : ''}`}
        style={isDropBefore && !cmdMode && dropIndentLevel != null ? { marginLeft: dropIndentLevel * 24 } : undefined}
      />
      <div
        className={`flex items-start gap-1 px-4 py-0.5 rounded transition-colors ${
          collapsed ? 'border-b border-[#2d3140]/60' : ''
        } ${
          isCmdDropTarget ? 'ring-2 ring-[#6c8aff] bg-[#6c8aff]/10'
            : isSelected ? 'bg-[#6c8aff]/15 ring-1 ring-[#6c8aff]/40'
            : isRelated ? 'ring-2 ring-purple-500/70'
            : isFocused ? 'bg-[#1a1d27]/50'
            : 'hover:bg-[#1a1d27]/30'
        }`}
        style={{
          borderLeft: blockTypeColor ? `3px solid ${blockTypeColor}` : undefined,
          paddingLeft: blockTypeColor ? undefined : undefined,
        }}
        draggable
        onDragStart={e => onDragStart(e, block.id)}
        onDragOver={e => onDragOver(e, block.id)}
        onDrop={e => onDrop(e, block.id)}
        onDragLeave={onDragLeave}
      >
        {/* Cmd-mode checkbox */}
        {cmdMode && (
          <div className="flex-shrink-0 mt-1 w-4 h-4 rounded border border-[#6c8aff] flex items-center justify-center cursor-pointer select-none"
            style={{ background: isSelected ? '#6c8aff' : 'transparent' }}
            onClick={() => onToggleSelect(block.id)}>
            {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
          </div>
        )}

        {/* Feature #2: Section fold button for headings */}
        {isSectionHeading && (
          <button
            className="flex-shrink-0 mt-1.5 text-[10px] leading-none select-none transition-all text-[#6c8aff]/70 hover:text-[#6c8aff] opacity-0 group-hover:opacity-100"
            style={{ width: 12 }}
            onClick={e => { e.stopPropagation(); onToggleSectionFold(); }}
            title={sectionFolded ? 'Unfold section' : 'Fold section'}
          >
            {sectionFolded ? '📁' : '📂'}
          </button>
        )}

        {/* Collapse triangle — only show on parent blocks (those with children) or already collapsed */}
        {(hasOutlinerChildren || collapsed) && (
          <button
            className={`flex-shrink-0 mt-1.5 text-[9px] leading-none select-none transition-all text-[#71717a] hover:text-[#a1a1aa] ${
              collapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{ width: 10 }}
            onClick={e => { e.stopPropagation(); onToggleCollapse(block.id, e.metaKey || e.ctrlKey); }}
            title={collapsed ? 'Expand block (expand children)' : 'Collapse block (hide children)'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
        {/* Spacer when no collapse triangle */}
        {!hasOutlinerChildren && !collapsed && (
          <span style={{ width: 10, flexShrink: 0, display: 'inline-block' }} />
        )}

        {/* Drag handle */}
        <div
          className={`flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity select-none ${
            cmdMode ? 'cursor-pointer text-[#6c8aff]' : 'cursor-pointer text-[#8b90a0] hover:text-[#6c8aff]'
          }`}
          title={cmdMode ? 'Click to select for merge' : 'Drag to reorder / Click for options'}
          onClick={handleHandleClick}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="4" cy="3" r="1.2" /><circle cx="4" cy="7" r="1.2" /><circle cx="4" cy="11" r="1.2" />
            <circle cx="9" cy="3" r="1.2" /><circle cx="9" cy="7" r="1.2" /><circle cx="9" cy="11" r="1.2" />
          </svg>
        </div>

        {/* Feature #19: Version timeline button */}
        <button
          className="flex-shrink-0 mt-1.5 text-[10px] leading-none select-none text-[#8b90a0]/40 hover:text-[#8b90a0] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ width: 12 }}
          onClick={e => { e.stopPropagation(); onViewTimeline(block.id); }}
          title="Version history"
        >
          🕐
        </button>

        {/* Feature #17: frozen lock icon */}
        {block.frozen && (
          <span className="flex-shrink-0 mt-1.5 text-[10px] text-amber-400" title="Block is frozen">🔒</span>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* First-line preview when collapsed */}
          {collapsed && (
            <div className="block-content text-[#8b90a0]/70 truncate py-0.5 cursor-pointer select-none"
              onClick={() => onToggleCollapse(block.id, false)} title="Click to expand">
              {getFirstLine(activeHtml)}
            </div>
          )}
          {/* Editable content */}
          <div style={{ maxHeight: collapsed ? '0px' : '2000px', overflow: 'hidden', transition: 'max-height 0.2s ease-out' }}>
            <div
              ref={contentRef}
              className="block-content"
              contentEditable={!block.frozen}
              suppressContentEditableWarning
              data-placeholder={isFirst ? 'Start writing your research...' : ''}
              onFocus={() => onFocus(block.id)}
              onBlur={() => onBlur(block.id, contentRef.current?.innerHTML || '')}
              onKeyDown={e => onKeyDown(e, block.id, contentRef.current?.innerHTML || '')}
              onPaste={e => onPaste(e, block.id)}
              onClick={handleContentClick}
              style={block.frozen ? { opacity: 0.7, userSelect: 'text' } : undefined}
            />
          </div>

          {/* Word count + readability tooltip on hover */}
          {hovered && wc > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-[#8b90a0]/40">{wc} words</span>
              {readability && (
                <span className="text-[10px]" style={{ color: readability.color }}>
                  {readability.label} ({readability.score})
                </span>
              )}
              {/* Feature #7: type badge */}
              {block.blockType && (
                <span className="text-[10px] px-1 rounded" style={{ background: blockTypeColor + '30', color: blockTypeColor || '#8b90a0' }}>
                  {block.blockType}
                </span>
              )}
            </div>
          )}

          {/* Citation badges + comment badges */}
          {(blockCitations.length > 0 || (block.blockComments?.length ?? 0) > 0) && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap items-center">
              {blockCitations.map(({ num, citation }) => (
                <CitationBadge key={citation.id} num={num} citation={citation} blockId={block.id} onRemove={onRemoveCitation} />
              ))}
              <CommentBadge comments={block.blockComments || []} blockId={block.id} onDelete={onDeleteComment} />
            </div>
          )}

          {/* Version pills */}
          {!collapsed && block.versions.length > 1 && (
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap items-center">
              {block.versions.map((v, idx) => (
                <div key={idx} className="relative">
                  <button
                    onClick={e => {
                      if (e.metaKey || e.ctrlKey) onCompare(block.id, idx);
                      else onSwitchVersion(block.id, idx);
                    }}
                    onContextMenu={e => {
                      e.preventDefault(); e.stopPropagation();
                      if (block.versions.length > 1) setPendingDeleteVersion(idx);
                    }}
                    className={`version-pill ${idx === block.activeVersion ? 'active' : ''}`}
                    title={`${v.instruction || `Version ${idx + 1}`} — Cmd+click to compare, right-click to delete`}
                  >
                    v{idx + 1}
                  </button>
                  {pendingDeleteVersion === idx && (
                    <div className="absolute bottom-full left-0 mb-1 bg-[#1a1d27] border border-red-500/40 rounded shadow-xl p-2 z-50 whitespace-nowrap">
                      <div className="text-[11px] text-[#e1e4ed] mb-1.5">Delete v{idx + 1}?</div>
                      <div className="flex gap-1">
                        <button onClick={() => { setPendingDeleteVersion(null); onDeleteVersion(block.id, idx); }} className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded">Delete</button>
                        <button onClick={() => setPendingDeleteVersion(null)} className="px-2 py-0.5 text-[11px] bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Drop indicator after */}
      <div
        className={`drop-indicator ${isDropAfter && !cmdMode ? 'active' : ''}`}
        style={isDropAfter && !cmdMode && dropIndentLevel != null ? { marginLeft: dropIndentLevel * 24 } : undefined}
      />
    </div>
  );
}

export default function BlockEditor() {
  const {
    currentProject, updateBlock, deleteBlock, addBlock, moveBlock, mergeBlocks, splitBlock,
    addBlockVersion, switchBlockVersion, deleteBlockVersion, setFocusedBlockId,
    removeCitationFromBlock, setBlockType, addBlockComment, deleteBlockComment, toggleBlockFrozen,
    updateWritingLog, setBlockIndent, toggleBlockCollapsed, setBlocksCollapsedAll, moveBlockFamily,
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
  const [compareMode, setCompareMode] = useState<{ blockId: string; versionIndex: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [animatedBlockId, setAnimatedBlockId] = useState<string | null>(null);
  const [dropIndentLevel, setDropIndentLevel] = useState<0 | 1 | 2 | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const [batchRewriteMode, setBatchRewriteMode] = useState(false);
  const [batchInstruction, setBatchInstruction] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  // Feature #2: Section folding
  const [sectionFoldedIds, setSectionFoldedIds] = useState<Set<string>>(new Set());

  // Feature #3: Focus mode
  const [focusMode, setFocusMode] = useState(false);

  // Feature #4: Search & Replace
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchReplaceText, setSearchReplaceText] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  // Feature #6: Argument analysis
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Feature #8: Abstract generator
  const [abstractResult, setAbstractResult] = useState<string | null>(null);
  const [abstractLoading, setAbstractLoading] = useState(false);

  // Feature #9: Comment input
  const [commentInput, setCommentInput] = useState<{ blockId: string; text: string } | null>(null);

  // Feature #11: Block link popup
  const [blockLinkPopup, setBlockLinkPopup] = useState<{ blockId: string; query: string; pos: { top: number; left: number } } | null>(null);

  // Feature #14: writing log session tracking
  const sessionStartWords = useRef<number>(-1);

  // Feature #15: Related blocks
  const [relatedBlockIds, setRelatedBlockIds] = useState<Set<string>>(new Set());
  const relatedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Feature #19: Version timeline
  const [timelineBlockId, setTimelineBlockId] = useState<string | null>(null);

  // Feature #20: Share modal
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFocusId = useRef<string | null>(null);

  const blocks = currentProject?.blocks || [];
  const projectCitations = currentProject?.citations || [];
  const citationMap = getOrderedCitationMap(blocks, projectCitations);

  const totalWords = blocks.reduce((sum, b) => sum + wordCount(b.versions[b.activeVersion]?.html || ''), 0);
  const readingMins = Math.ceil(totalWords / 200);

  // Expose totalWords for TopBar (Feature #5)
  useEffect(() => {
    (window as any).__totalWordCount = totalWords;
  }, [totalWords]);

  // Feature #14: Record session start
  useEffect(() => {
    if (sessionStartWords.current === -1 && totalWords > 0) {
      sessionStartWords.current = totalWords;
    }
  }, [totalWords]);

  // Feature #14: Save writing log on unmount
  useEffect(() => {
    return () => {
      if (sessionStartWords.current >= 0 && currentProject) {
        const today = new Date().toISOString().split('T')[0];
        const delta = Math.max(0, totalWords - sessionStartWords.current);
        if (delta > 0) updateWritingLog(today, delta);
      }
    };
  }, []);

  // Cmd key tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCmdMode(true);
      // Feature #3: Cmd+Shift+F
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setFocusMode(v => {
          const next = !v;
          window.dispatchEvent(new CustomEvent('focus-mode-change', { detail: { active: next } }));
          return next;
        });
      }
      // Feature #4: Cmd+H
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault();
        setSearchMode(v => !v);
      }
      // Escape
      if (e.key === 'Escape') {
        setFocusMode(false);
        setSearchMode(false);
        window.dispatchEvent(new CustomEvent('focus-mode-change', { detail: { active: false } }));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCmdMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => { if (!cmdMode) setSelectedBlockIds(new Set()); }, [cmdMode]);

  // Feature #12: citation highlight from graph
  useEffect(() => {
    const handler = (e: Event) => {
      const { citationId } = (e as CustomEvent).detail;
      const blocksWithCit = blocks.filter(b => b.citationIds.includes(citationId)).map(b => b.id);
      setRelatedBlockIds(new Set(blocksWithCit));
      if (relatedTimerRef.current) clearTimeout(relatedTimerRef.current);
      relatedTimerRef.current = setTimeout(() => setRelatedBlockIds(new Set()), 5000);
    };
    window.addEventListener('highlight-citation-blocks', handler);
    return () => window.removeEventListener('highlight-citation-blocks', handler);
  }, [blocks]);

  // Feature #20: listen for share event from TopBar
  useEffect(() => {
    const handler = async () => {
      if (!currentProject || shareLoading) return;
      setShareLoading(true);
      try {
        // Build HTML
        const htmlContent = buildShareHtml(currentProject.name, blocks, projectCitations, citationMap);
        const res = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
          body: JSON.stringify({
            description: `Research Assistant: ${currentProject.name}`,
            public: true,
            files: { [`${currentProject.name.replace(/[^a-z0-9]/gi, '_')}.html`]: { content: htmlContent } },
          }),
        });
        const data = await res.json();
        setShareUrl(data.html_url || 'Error creating gist');
      } catch {
        setShareUrl('Failed to create share link');
      } finally {
        setShareLoading(false);
      }
    };
    window.addEventListener('share-document', handler);
    return () => window.removeEventListener('share-document', handler);
  }, [currentProject, blocks, projectCitations, citationMap, shareLoading]);

  // Feature #8: listen for abstract generation event from TopBar
  useEffect(() => {
    const handler = async () => {
      if (!currentProject || abstractLoading) return;
      setAbstractLoading(true);
      const allText = blocks.map(b => {
        const div = document.createElement('div');
        div.innerHTML = b.versions[b.activeVersion]?.html || '';
        return div.textContent || '';
      }).filter(t => t.trim()).join('\n\n');

      try {
        const res = await fetch('/api/ai/general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Write a structured academic abstract (250 words max) with these sections: Background, Objective, Methods, Results, Conclusion. Base it on this draft:\n\n${allText}`,
            model: 'anthropic/claude-sonnet-4-20250514',
          }),
        });
        const data = await res.json();
        setAbstractResult(data.text || 'No response');
        playCompletionSound();
      } catch {
        setAbstractResult('Failed to generate abstract.');
      } finally {
        setAbstractLoading(false);
      }
    };
    window.addEventListener('generate-abstract', handler);
    return () => window.removeEventListener('generate-abstract', handler);
  }, [currentProject, blocks, abstractLoading]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { useStore.getState().saveCurrentProject(); }, 500);
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
    // Outliner Tab / Shift+Tab indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const blockIdx = blocks.findIndex(b => b.id === id);
      if (blockIdx === -1) return;
      const block = blocks[blockIdx];
      const currentLevel = block.indentLevel ?? 0;
      if (!e.shiftKey) {
        // Indent: allowed when prev block's level >= currentLevel
        const prevBlock = blockIdx > 0 ? blocks[blockIdx - 1] : null;
        const prevLevel = prevBlock?.indentLevel ?? 0;
        if (currentLevel < 2 && prevLevel >= currentLevel) {
          updateBlock(id, html);
          setBlockIndent(id, (currentLevel + 1) as 0 | 1 | 2);
        }
      } else {
        // Outdent
        if (currentLevel > 0) {
          updateBlock(id, html);
          setBlockIndent(id, (currentLevel - 1) as 0 | 1 | 2);
        }
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      updateBlock(id, html);
      const blockIdx = blocks.findIndex(b => b.id === id);
      if (e.key === 'ArrowUp' && blockIdx > 0) { moveBlockFamily(id, blocks[blockIdx - 1].id, 'before'); pendingFocusId.current = id; }
      else if (e.key === 'ArrowDown' && blockIdx < blocks.length - 1) { moveBlockFamily(id, blocks[blockIdx + 1].id, 'after'); pendingFocusId.current = id; }
      return;
    }

    // Feature #11: detect [[ typing
    if (e.key === '[') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        // Simple heuristic: check if previous char is also [
        const text = range.startContainer.textContent || '';
        if (text.endsWith('[')) {
          setBlockLinkPopup({ blockId: id, query: '', pos: { top: rect.bottom + 4, left: rect.left } });
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).startContainer;
        while (node && node !== (e.currentTarget as Node)) {
          if ((node as Element).tagName === 'LI') return;
          node = node.parentNode;
        }
      }
      e.preventDefault();
      updateBlock(id, html);
      const currentBlock = blocks.find(b => b.id === id);
      const newBlock = addBlock('', id, currentBlock?.indentLevel ?? 0);
      pendingFocusId.current = newBlock.id;
    } else if (e.key === 'Backspace') {
      const el = e.currentTarget as HTMLDivElement;
      if (el.innerHTML === '' || el.innerHTML === '<br>') {
        e.preventDefault();
        const blockIdx = blocks.findIndex(b => b.id === id);
        deleteBlock(id);
        if (blockIdx > 0) pendingFocusId.current = blocks[blockIdx - 1].id;
      }
    }
  };

  const handlePaste = useCallback((_e: React.ClipboardEvent, _blockId: string) => {
    const text = _e.clipboardData.getData('text/plain').trim();
    const doiMatch = text.match(/\b(10\.\d{4,}\/\S+)/);
    const urlMatch = text.match(/^https?:\/\/\S+$/);
    const citMatch = text.match(/[A-Z][a-z]+.{1,50}\d{4}/);
    if (doiMatch) setPastePopup({ type: 'doi', value: doiMatch[1] });
    else if (urlMatch && !doiMatch) setPastePopup({ type: 'url', value: text });
    else if (citMatch && text.length < 200) setPastePopup({ type: 'citation', value: text });
  }, []);

  const handlePasteSearch = () => {
    if (!pastePopup) return;
    window.dispatchEvent(new CustomEvent('zotero-search', { detail: { query: pastePopup.value } }));
    setPastePopup(null);
  };

  // Focus pending block
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
    // Compute suggested indent level from horizontal mouse position
    const targetBlock = blocks.find(b => b.id === id);
    const targetLevel = targetBlock?.indentLevel ?? 0;
    const relX = e.clientX - rect.left;
    // Suggest child if mouse is 40+px to the right of the target's left edge
    const suggested = relX > 40 && targetLevel < 2 ? (targetLevel + 1) as 0 | 1 | 2 : targetLevel as 0 | 1 | 2;
    setDropIndentLevel(suggested);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/') && /\.(png|jpg|jpeg|gif)$/i.test(f.name));
    if (imageFiles.length > 0) {
      const liveEl = document.querySelector(`[data-block-id="${targetId}"] .block-content`) as HTMLElement;
      const hasHtml = liveEl?.innerHTML?.replace(/<br\s*\/?>/gi, '').trim() !== '';
      if (!hasHtml) {
        imageFiles.forEach(file => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const imgHtml = `<img src="${dataUrl}" alt="${file.name}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" />`;
            updateBlock(targetId, imgHtml);
            if (liveEl) liveEl.innerHTML = imgHtml;
          };
          reader.readAsDataURL(file);
        });
        setDraggedId(null); setDropTargetId(null); setDropPosition(null); setDropIndentLevel(null);
        return;
      }
    }
    if (draggedId && targetId !== draggedId) {
      if (e.metaKey) {
        mergeBlocks([draggedId, targetId]);
      } else if (dropPosition) {
        moveBlockFamily(draggedId, targetId, dropPosition, dropIndentLevel ?? undefined);
      }
    }
    setDraggedId(null); setDropTargetId(null); setDropPosition(null); setDropIndentLevel(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDropTargetId(null); setDropPosition(null); setDropIndentLevel(null);
  };

  const handleEditorDragOver = (e: React.DragEvent) => {
    const items = Array.from(e.dataTransfer.items || []);
    const hasPdf = items.some(f => f.type === 'application/pdf' || (f.kind === 'file' && f.getAsFile()?.name?.endsWith('.pdf')));
    const hasImage = items.some(f => f.type.startsWith('image/'));
    if (hasPdf || hasImage) {
      e.preventDefault();
      if (hasPdf && !hasImage) setIsDragOver(true);
    }
  };

  const handleEditorDrop = async (e: React.DragEvent) => {
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (!pdf) return;
    e.preventDefault(); e.stopPropagation();
    const loadingBlock = addBlock(`<p><em>Extracting PDF: ${pdf.name}...</em></p>`);
    const formData = new FormData();
    formData.append('file', pdf);
    try {
      const res = await fetch('/api/pdf/extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.text) addBlockVersion(loadingBlock.id, `<p>${data.text}</p>`, `PDF: ${pdf.name}`);
    } catch {
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

  const handleBatchDelete = () => setPendingBatchDelete(true);
  const confirmBatchDelete = () => {
    Array.from(selectedBlockIds).forEach(id => deleteBlock(id));
    setSelectedBlockIds(new Set()); setCmdMode(false); setPendingBatchDelete(false);
  };

  const handleBatchCleanup = () => {
    Array.from(selectedBlockIds).forEach(id => {
      const liveEl = document.querySelector(`[data-block-id="${id}"] .block-content`) as HTMLElement;
      const rawHtml = liveEl?.innerHTML || '';
      const cleaned = cleanMarkdown(rawHtml);
      if (cleaned !== rawHtml) addBlockVersion(id, cleaned, 'Cleaned markdown');
    });
    triggerComplete(Array.from(selectedBlockIds)[0] || '');
    setSelectedBlockIds(new Set()); setCmdMode(false);
  };

  const handleBatchRewrite = async () => {
    if (!batchInstruction.trim() || batchLoading) return;
    setBatchLoading(true);
    for (const id of Array.from(selectedBlockIds)) {
      const liveEl = document.querySelector(`[data-block-id="${id}"] .block-content`) as HTMLElement;
      const text = liveEl?.textContent || '';
      if (!text.trim()) continue;
      try {
        const res = await fetch('/api/ai/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, instruction: batchInstruction, model: 'anthropic/claude-sonnet-4-20250514' }),
        });
        const data = await res.json();
        if (data.text) addBlockVersion(id, `<p>${data.text}</p>`, batchInstruction);
      } catch { /* skip */ }
    }
    playCompletionSound();
    setBatchLoading(false); setBatchInstruction(''); setBatchRewriteMode(false);
    setSelectedBlockIds(new Set()); setCmdMode(false);
  };

  // Context menu actions
  const handleContextSaveVersion = () => {
    if (!contextMenu) return;
    const liveEl = document.querySelector(`[data-block-id="${contextMenu.blockId}"] .block-content`) as HTMLElement;
    addBlockVersion(contextMenu.blockId, liveEl?.innerHTML || '', 'Manual edit');
    setContextMenu(null);
  };

  const handleContextReadAloud = () => {
    if (!contextMenu) return;
    const liveEl = document.querySelector(`[data-block-id="${contextMenu.blockId}"] .block-content`) as HTMLElement;
    let text = (liveEl?.textContent || '').replace(/\[\d+(?:[,\s\u2013\u2014\-]*\d+)*\]/g, '');
    if (text.trim()) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
    setContextMenu(null);
  };

  const handleContextDisassemble = () => {
    if (!contextMenu) return;
    const liveEl = document.querySelector(`[data-block-id="${contextMenu.blockId}"] .block-content`) as HTMLElement;
    splitBlock(contextMenu.blockId, liveEl?.innerHTML || '');
    setContextMenu(null);
  };

  const handleContextDeleteBlock = () => {
    if (!contextMenu) return;
    deleteBlock(contextMenu.blockId);
    setContextMenu(null);
  };

  const handleContextInsertBelow = () => {
    if (!contextMenu) return;
    const newBlock = addBlock('', contextMenu.blockId);
    pendingFocusId.current = newBlock.id;
    setContextMenu(null);
  };

  const handleContextClean = () => {
    if (!contextMenu) return;
    const liveEl = document.querySelector(`[data-block-id="${contextMenu.blockId}"] .block-content`) as HTMLElement;
    const rawHtml = liveEl?.innerHTML || '';
    const cleaned = cleanMarkdown(rawHtml);
    if (cleaned !== rawHtml) { addBlockVersion(contextMenu.blockId, cleaned, 'Cleaned markdown'); triggerComplete(contextMenu.blockId); }
    setContextMenu(null);
  };

  const handleContextFindReferences = () => {
    if (!contextMenu) return;
    const liveEl = document.querySelector(`[data-block-id="${contextMenu.blockId}"] .block-content`) as HTMLElement;
    const query = (liveEl?.textContent || '').trim().substring(0, 80);
    if (query) {
      window.dispatchEvent(new CustomEvent('zotero-search', { detail: { query } }));
      window.dispatchEvent(new CustomEvent('bottom-tab-change', { detail: { tab: 'zotero' } }));
    }
    setContextMenu(null);
  };

  const handleContextOpenAI = () => {
    if (!contextMenu) return;
    setAiPopup({ blockId: contextMenu.blockId, pos: contextMenu.pos });
    setContextMenu(null);
  };

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
      triggerComplete(blockId);
    } catch {
      setCoherenceToast('Failed to check coherence.');
    }
  };

  // Feature #6: Argument analysis
  const handleAnalyze = async () => {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    const allText = blocks.map(b => {
      const div = document.createElement('div');
      div.innerHTML = b.versions[b.activeVersion]?.html || '';
      return div.textContent || '';
    }).filter(t => t.trim()).join('\n\n');
    try {
      const res = await fetch('/api/ai/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Analyze this research document. Identify: 1) logical gaps or unsupported claims, 2) missing evidence or counterarguments, 3) structural weaknesses. Be specific and reference the text.\n\n${allText}`,
          model: 'anthropic/claude-sonnet-4-20250514',
        }),
      });
      const data = await res.json();
      setAnalysisResult(data.text || 'No response');
      playCompletionSound();
    } catch {
      setAnalysisResult('Failed to analyze document.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Feature #9: add comment
  const handleContextAddComment = () => {
    if (!contextMenu) return;
    setCommentInput({ blockId: contextMenu.blockId, text: '' });
    setContextMenu(null);
  };

  const handleSubmitComment = () => {
    if (!commentInput || !commentInput.text.trim()) { setCommentInput(null); return; }
    addBlockComment(commentInput.blockId, commentInput.text.trim());
    setCommentInput(null);
  };

  // Feature #15: Find related blocks
  const handleContextFindRelated = async () => {
    if (!contextMenu) return;
    const { blockId } = contextMenu;
    setContextMenu(null);
    const liveEl = document.querySelector(`[data-block-id="${blockId}"] .block-content`) as HTMLElement;
    const currentText = liveEl?.textContent || '';
    const otherTexts = blocks
      .filter(b => b.id !== blockId)
      .map((b, i) => `[${i}] ${(document.querySelector(`[data-block-id="${b.id}"] .block-content`) as HTMLElement)?.textContent || b.versions[b.activeVersion]?.html || ''}`);
    if (!currentText.trim() || otherTexts.length === 0) return;
    try {
      const res = await fetch('/api/ai/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Given this block, identify the indices (0-based) of the 3 most semantically related blocks from the list below. Return ONLY a JSON array of indices like [2, 5, 7].\n\nCurrent block:\n${currentText}\n\nOther blocks:\n${otherTexts.join('\n')}`,
          model: 'anthropic/claude-sonnet-4-20250514',
        }),
      });
      const data = await res.json();
      const text = data.text || '';
      const match = text.match(/\[[\d,\s]+\]/);
      if (match) {
        const indices: number[] = JSON.parse(match[0]);
        const otherBlocks = blocks.filter(b => b.id !== blockId);
        const relatedIds = new Set(indices.map(i => otherBlocks[i]?.id).filter(Boolean) as string[]);
        setRelatedBlockIds(relatedIds);
        if (relatedTimerRef.current) clearTimeout(relatedTimerRef.current);
        relatedTimerRef.current = setTimeout(() => setRelatedBlockIds(new Set()), 5000);
      }
    } catch { /* ignore */ }
  };

  const triggerComplete = (blockId: string) => {
    playCompletionSound();
    setAnimatedBlockId(blockId);
    setTimeout(() => setAnimatedBlockId(null), 1100);
  };

  const handleCompare = (blockId: string, versionIndex: number) => {
    setCompareMode({ blockId, versionIndex });
  };

  const handleToggleCollapse = useCallback((id: string, allBlocks: boolean) => {
    if (allBlocks) {
      const allCollapsed = blocks.every(b => b.collapsed);
      setBlocksCollapsedAll(!allCollapsed);
    } else {
      toggleBlockCollapsed(id);
    }
  }, [blocks, toggleBlockCollapsed, setBlocksCollapsedAll]);

  // Feature #2: Section fold helpers
  const getSectionRange = (headingBlockId: string): string[] => {
    const headingBlock = blocks.find(b => b.id === headingBlockId);
    if (!headingBlock) return [];
    const headingLevel = getHeadingLevel(headingBlock.versions[headingBlock.activeVersion]?.html || '');
    if (!headingLevel) return [];
    const startIdx = blocks.findIndex(b => b.id === headingBlockId);
    const range: string[] = [];
    for (let i = startIdx + 1; i < blocks.length; i++) {
      const b = blocks[i];
      const lvl = getHeadingLevel(b.versions[b.activeVersion]?.html || '');
      if (lvl !== null && lvl <= headingLevel) break;
      range.push(b.id);
    }
    return range;
  };

  const handleToggleSectionFold = (blockId: string) => {
    setSectionFoldedIds(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  // Compute which blocks are hidden due to section folding
  const hiddenBySection = new Set<string>();
  for (const foldedId of sectionFoldedIds) {
    getSectionRange(foldedId).forEach(id => hiddenBySection.add(id));
  }

  const handleAIApply = (newHtml: string, instruction: string) => {
    if (aiPopup) { addBlockVersion(aiPopup.blockId, newHtml, instruction); triggerComplete(aiPopup.blockId); }
    setAiPopup(null);
  };

  const handleInsertFromChat = useCallback((html: string) => {
    if (focusedId) addBlock(html, focusedId);
    else addBlock(html);
  }, [focusedId, addBlock]);

  useEffect(() => {
    (window as any).__insertToEditor = handleInsertFromChat;
    return () => { delete (window as any).__insertToEditor; };
  }, [handleInsertFromChat]);

  useEffect(() => {
    (window as any).__editorFocusedBlockId = focusedId;
  }, [focusedId]);

  // Feature #11: block link click
  const handleBlockLinkClick = (linkedBlockId: string) => {
    const el = document.querySelector(`[data-block-id="${linkedBlockId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setRelatedBlockIds(new Set([linkedBlockId]));
      if (relatedTimerRef.current) clearTimeout(relatedTimerRef.current);
      relatedTimerRef.current = setTimeout(() => setRelatedBlockIds(new Set()), 3000);
    }
  };

  const handleBlockLinkSelect = (linkedBlockId: string, label: string) => {
    if (!blockLinkPopup) return;
    const blockId = blockLinkPopup.blockId;
    const liveEl = document.querySelector(`[data-block-id="${blockId}"] .block-content`) as HTMLElement;
    if (liveEl) {
      // Insert a block-link span at cursor
      const span = document.createElement('span');
      span.setAttribute('data-block-link', linkedBlockId);
      span.className = 'block-link';
      span.textContent = `[[${label.substring(0, 40)}]]`;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // Remove the [[ we just typed
        const container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const text = container.textContent || '';
          const idx = text.lastIndexOf('[[');
          if (idx >= 0) {
            const r2 = document.createRange();
            r2.setStart(container, idx);
            r2.setEnd(container, text.length);
            r2.deleteContents();
          }
        }
        range.insertNode(span);
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      updateBlock(blockId, liveEl.innerHTML);
    }
    setBlockLinkPopup(null);
  };

  // Feature #4: Search highlight & replace
  const getSearchMatches = useCallback(() => {
    if (!searchQuery.trim()) return [];
    const matches: { blockId: string; blockIdx: number }[] = [];
    blocks.forEach((b, idx) => {
      const liveEl = document.querySelector(`[data-block-id="${b.id}"] .block-content`) as HTMLElement;
      const text = (liveEl?.textContent || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      if (text.includes(q)) matches.push({ blockId: b.id, blockIdx: idx });
    });
    return matches;
  }, [searchQuery, blocks]);

  const handleSearchReplace = (replaceAll: boolean) => {
    if (!searchQuery.trim()) return;
    const matches = getSearchMatches();
    const indicesToReplace = replaceAll ? matches.map((_, i) => i) : [searchMatchIndex % Math.max(matches.length, 1)];
    for (const idx of indicesToReplace) {
      const m = matches[idx];
      if (!m) continue;
      const liveEl = document.querySelector(`[data-block-id="${m.blockId}"] .block-content`) as HTMLElement;
      if (!liveEl) continue;
      const html = liveEl.innerHTML;
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const newHtml = html.replace(regex, searchReplaceText);
      liveEl.innerHTML = newHtml;
      updateBlock(m.blockId, newHtml);
    }
    if (!replaceAll) {
      setSearchMatchIndex(prev => (prev + 1) % Math.max(getSearchMatches().length, 1));
    }
  };

  if (!currentProject) {
    return <div className="flex items-center justify-center h-full text-[#8b90a0] text-sm">No project open</div>;
  }

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
  const contextMenuBlockHasCitations = contextMenuBlock ? (contextMenuBlock.citationIds || []).length > 0 : false;
  const contextMenuWc = wordCount(contextMenuHtml);

  const getAiPopupContext = () => {
    if (!aiPopup) return { contextBefore: [], contextAfter: [] };
    const idx = blocks.findIndex(b => b.id === aiPopup.blockId);
    const getHtml = (b: Block) => b.versions[b.activeVersion]?.html || '';
    return {
      contextBefore: blocks.slice(Math.max(0, idx - 2), idx).map(getHtml),
      contextAfter: blocks.slice(idx + 1, idx + 3).map(getHtml),
    };
  };
  const { contextBefore, contextAfter } = getAiPopupContext();

  const selectedBlocksHtmlArr = Array.from(selectedBlockIds)
    .map(id => blocks.find(b => b.id === id))
    .filter(Boolean)
    .map(b => b!.versions[b!.activeVersion]?.html || '');

  // Compare mode
  if (compareMode) {
    const cmpBlock = blocks.find(b => b.id === compareMode.blockId);
    const refVersionIdx = cmpBlock?.activeVersion ?? 0;
    const refLabel = cmpBlock?.versions[refVersionIdx]?.instruction || `v${refVersionIdx + 1}`;
    const cmpLabel = cmpBlock?.versions[compareMode.versionIndex]?.instruction || `v${compareMode.versionIndex + 1}`;
    const renderReadOnlyBlock = (block: Block, html: string) => {
      const isTarget = block.id === compareMode.blockId;
      const bCitations = (block.citationIds || []).map(cid => ({ num: citationMap.get(cid) })).filter((x): x is { num: number } => x.num !== undefined);
      return (
        <div key={block.id} className={`px-4 py-0.5 rounded mb-0.5 ${isTarget ? 'ring-1 ring-[#6c8aff]/40 bg-[#6c8aff]/5' : ''}`}>
          <div className="block-content" dangerouslySetInnerHTML={{ __html: html }} />
          {bCitations.length > 0 && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {bCitations.map(({ num }) => <sup key={num} className="text-[10px] bg-[#6c8aff]/20 text-[#6c8aff] px-1 py-0.5 rounded select-none">[{num}]</sup>)}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="h-full flex bg-[#0f1117]">
        <div className="flex-1 min-w-0 flex flex-col border-r border-[#2d3140]">
          <div className="sticky top-0 z-10 bg-[#1a1d27] border-b border-[#2d3140] px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setCompareMode(null)} className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed]">✕ Close</button>
            <span className="text-[10px] text-[#8b90a0] uppercase tracking-wide">Reference</span>
            <span className="text-xs text-[#8b90a0] truncate">v{refVersionIdx + 1} · {refLabel}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-6 px-2">
              {blocks.map(block => renderReadOnlyBlock(block, block.id === compareMode.blockId ? block.versions[refVersionIdx]?.html || '' : block.versions[block.activeVersion]?.html || ''))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="sticky top-0 z-10 bg-[#1a1d27] border-b border-[#2d3140] px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="text-[10px] text-[#8b90a0] uppercase tracking-wide">Comparing</span>
            <span className="text-xs text-[#6c8aff] truncate">v{compareMode.versionIndex + 1} · {cmpLabel}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-6 px-2">
              {blocks.map(block => renderReadOnlyBlock(block, block.id === compareMode.blockId ? block.versions[compareMode.versionIndex]?.html || '' : block.versions[block.activeVersion]?.html || ''))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const searchMatches = searchMode && searchQuery.trim() ? getSearchMatches() : [];
  const currentMatchBlockId = searchMatches[searchMatchIndex % Math.max(searchMatches.length, 1)]?.blockId;

  return (
    <div
      className={`h-full overflow-y-auto bg-[#0f1117] relative ${isDragOver ? 'ring-2 ring-[#6c8aff] ring-inset' : ''}`}
      onDragOver={handleEditorDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleEditorDrop}
    >
      {/* Feature #3: Focus mode banner */}
      {focusMode && (
        <div className="sticky top-0 z-20 bg-[#6c8aff]/10 border-b border-[#6c8aff]/30 px-4 py-1.5 flex items-center gap-3">
          <span className="text-xs text-[#6c8aff] flex-1">Focus Mode — Press Escape or Cmd+Shift+F to exit</span>
          <button onClick={() => { setFocusMode(false); window.dispatchEvent(new CustomEvent('focus-mode-change', { detail: { active: false } })); }}
            className="text-[#6c8aff] hover:text-[#a0b4ff] text-xs">✕</button>
        </div>
      )}

      {/* Feature #4: Search & Replace bar */}
      {searchMode && (
        <div className="sticky top-0 z-20 bg-[#1a1d27] border-b border-[#6c8aff]/30 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#8b90a0]">Search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
            placeholder="Search..."
            className="bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff] w-40"
            autoFocus
          />
          <span className="text-xs text-[#8b90a0]">Replace</span>
          <input
            type="text"
            value={searchReplaceText}
            onChange={e => setSearchReplaceText(e.target.value)}
            placeholder="Replace with..."
            className="bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff] w-40"
          />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#8b90a0]">{searchMatches.length} match{searchMatches.length !== 1 ? 'es' : ''}</span>
            <button onClick={() => setSearchMatchIndex(p => (p - 1 + Math.max(searchMatches.length, 1)) % Math.max(searchMatches.length, 1))}
              className="px-1.5 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">←</button>
            <button onClick={() => setSearchMatchIndex(p => (p + 1) % Math.max(searchMatches.length, 1))}
              className="px-1.5 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">→</button>
          </div>
          <button onClick={() => handleSearchReplace(false)} className="px-2 py-1 text-xs bg-[#6c8aff]/20 hover:bg-[#6c8aff]/30 text-[#6c8aff] rounded">Replace</button>
          <button onClick={() => handleSearchReplace(true)} className="px-2 py-1 text-xs bg-[#6c8aff] hover:bg-[#5a78f0] text-white rounded">Replace All</button>
          <button onClick={() => setSearchMode(false)} className="text-[#8b90a0] hover:text-[#e1e4ed] text-xs ml-2">✕</button>
        </div>
      )}

      {/* Cmd-mode hint bar */}
      {cmdMode && (
        <div className="sticky top-0 z-10 bg-[#6c8aff]/10 border-b border-[#6c8aff]/30 px-4 py-1.5 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-[#6c8aff]">
            <span>⌘ Select mode</span>
            {selectedBlockIds.size > 0 && <span className="text-[#8b90a0]">{selectedBlockIds.size} selected</span>}
            {selectedBlockIds.size >= 2 && (
              <button onClick={handleMergeSelected} className="px-2 py-0.5 bg-[#6c8aff] text-white rounded font-medium hover:bg-[#5a78f0]">Merge</button>
            )}
            {selectedBlockIds.size >= 1 && (
              <>
                <button onClick={handleBatchCleanup} className="px-2 py-0.5 bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] border border-[#2d3140] rounded">🧹 Clean</button>
                <button onClick={() => setBatchRewriteMode(v => !v)} className="px-2 py-0.5 bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] border border-[#2d3140] rounded">✨ Rewrite</button>
                <button onClick={handleBatchDelete} className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded">🗑️ Delete</button>
              </>
            )}
          </div>
          {batchRewriteMode && (
            <div className="flex gap-1">
              <input type="text" value={batchInstruction} onChange={e => setBatchInstruction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBatchRewrite()}
                placeholder="Rewrite instruction for all selected blocks..."
                className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#6c8aff]" autoFocus />
              <button onClick={handleBatchRewrite} disabled={batchLoading || !batchInstruction.trim()}
                className="px-2 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50">
                {batchLoading ? '...' : '→'}
              </button>
            </div>
          )}
          {pendingBatchDelete && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5 text-xs">
              <span className="text-red-300">Delete {selectedBlockIds.size} blocks permanently?</span>
              <button onClick={confirmBatchDelete} className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded">Delete</button>
              <button onClick={() => setPendingBatchDelete(false)} className="px-2 py-0.5 bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">Cancel</button>
            </div>
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
        <div className="sticky top-0 z-[5] flex justify-end items-center gap-2 px-4 py-0.5 bg-[#0f1117]/80 backdrop-blur-sm">
          <span className="text-[10px] text-[#8b90a0]/60">{totalWords} words · ~{readingMins} min read</span>
          {/* Feature #6: Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={analysisLoading}
            className="text-[10px] text-[#8b90a0]/50 hover:text-[#6c8aff] transition-colors disabled:opacity-40"
            title="Analyze argument gaps"
          >
            {analysisLoading ? '...' : '🔍 Analyze'}
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto py-6">
        {(() => {
          // Compute blocks hidden by outliner-collapsed parents
          const hiddenByOutliner = new Set<string>();
          for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.collapsed) {
              const parentLevel = b.indentLevel ?? 0;
              for (let j = i + 1; j < blocks.length; j++) {
                if ((blocks[j].indentLevel ?? 0) <= parentLevel) break;
                hiddenByOutliner.add(blocks[j].id);
              }
            }
          }

          return blocks.map((block, idx) => {
            if (hiddenBySection.has(block.id)) return null;
            if (hiddenByOutliner.has(block.id)) return null;

            const isSectionHeading = getHeadingLevel(block.versions[block.activeVersion]?.html || '') !== null;
            const sectionFolded = sectionFoldedIds.has(block.id);
            const indentLevel = block.indentLevel ?? 0;

            // A block has outliner children if the next visible block after it has a higher indent level
            const nextBlock = blocks[idx + 1];
            const hasChildren = nextBlock && (nextBlock.indentLevel ?? 0) > indentLevel && !hiddenBySection.has(nextBlock.id);

            return (
              <div
                key={block.id}
                data-block-id={block.id}
                style={{
                  marginLeft: indentLevel * 24,
                  borderLeft: indentLevel > 0 ? '2px solid #2d3140' : undefined,
                  paddingLeft: indentLevel > 0 ? 8 : undefined,
                  outline: searchMode && currentMatchBlockId === block.id ? '2px solid #6c8aff' : undefined,
                  outlineOffset: '2px',
                }}
              >
                <BlockItem
                  block={block}
                  blockIndex={idx}
                  isAnimated={animatedBlockId === block.id}
                  isRelated={relatedBlockIds.has(block.id)}
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
                  dropIndentLevel={dropIndentLevel}
                  onShowContextMenu={handleShowContextMenu}
                  onSwitchVersion={switchBlockVersion}
                  onDeleteVersion={deleteBlockVersion}
                  onCompare={handleCompare}
                  focusedId={focusedId}
                  citationMap={citationMap}
                  projectCitations={projectCitations}
                  cmdMode={cmdMode}
                  isSelected={selectedBlockIds.has(block.id)}
                  onToggleSelect={handleToggleSelect}
                  draggedId={draggedId}
                  onRemoveCitation={removeCitationFromBlock}
                  collapsed={block.collapsed ?? false}
                  onToggleCollapse={handleToggleCollapse}
                  hasOutlinerChildren={!!hasChildren}
                  isSectionHeading={isSectionHeading}
                  sectionFolded={sectionFolded}
                  onToggleSectionFold={() => handleToggleSectionFold(block.id)}
                  focusMode={focusMode}
                  onDeleteComment={deleteBlockComment}
                  onBlockLinkClick={handleBlockLinkClick}
                  onViewTimeline={setTimelineBlockId}
                />
              </div>
            );
          });
        })()}

        {/* Click area to add new block */}
        <div className="h-16 cursor-text" onClick={() => {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock) {
            const el = document.querySelector(`[data-block-id="${lastBlock.id}"] .block-content`) as HTMLElement;
            if (el) el.focus();
          }
        }} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <BlockContextMenu
          blockId={contextMenu.blockId}
          blockHtml={contextMenuHtml}
          wordCount={contextMenuWc}
          position={contextMenu.pos}
          onClose={() => setContextMenu(null)}
          onOpenAI={handleContextOpenAI}
          onSaveVersion={handleContextSaveVersion}
          onReadAloud={handleContextReadAloud}
          onDisassemble={handleContextDisassemble}
          onDeleteBlock={handleContextDeleteBlock}
          onCheckCoherence={handleContextCheckCoherence}
          onClean={handleContextClean}
          onInsertBelow={handleContextInsertBelow}
          canDisassemble={canDisassemble}
          blockHasCitations={contextMenuBlockHasCitations}
          onFindReferences={handleContextFindReferences}
          currentBlockType={contextMenuBlock?.blockType}
          onSetBlockType={(type) => { if (contextMenu) { setBlockType(contextMenu.blockId, type); setContextMenu(null); } }}
          onAddComment={handleContextAddComment}
          onFindRelated={handleContextFindRelated}
          frozen={contextMenuBlock?.frozen ?? false}
          onToggleFrozen={() => { if (contextMenu) { toggleBlockFrozen(contextMenu.blockId); setContextMenu(null); } }}
          onViewTimeline={() => { if (contextMenu) { setTimelineBlockId(contextMenu.blockId); setContextMenu(null); } }}
          collapsed={contextMenu ? (blocks.find(b => b.id === contextMenu.blockId)?.collapsed ?? false) : false}
          onToggleCollapse={() => { if (contextMenu) handleToggleCollapse(contextMenu.blockId, false); }}
          onCollapseAll={() => setBlocksCollapsedAll(true)}
          onExpandAll={() => setBlocksCollapsedAll(false)}
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

      {/* Coherence toast */}
      {coherenceToast && <CoherenceToast message={coherenceToast} onClose={() => setCoherenceToast(null)} />}

      {/* Paste popup */}
      {pastePopup && <PastePopup detected={pastePopup} onLookup={handlePasteSearch} onDismiss={() => setPastePopup(null)} />}

      {/* Feature #6: Analysis modal */}
      {analysisResult && <AnalysisModal result={analysisResult} onClose={() => setAnalysisResult(null)} />}

      {/* Feature #8: Abstract modal */}
      {abstractResult && (
        <AbstractModal
          result={abstractResult}
          onClose={() => setAbstractResult(null)}
          onInsert={() => {
            addBlock(`<p>${abstractResult}</p>`, blocks[0]?.id);
            playCompletionSound();
            setAbstractResult(null);
          }}
        />
      )}
      {abstractLoading && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1a1d27] border border-[#6c8aff]/40 rounded-lg px-4 py-2 text-xs text-[#6c8aff]">
          🧠 Generating abstract...
        </div>
      )}
      {shareLoading && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1a1d27] border border-[#6c8aff]/40 rounded-lg px-4 py-2 text-xs text-[#6c8aff]">
          🔗 Creating share link...
        </div>
      )}

      {/* Feature #9: Comment input popup */}
      {commentInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setCommentInput(null); }}>
          <div className="bg-[#1a1d27] border border-[#2d3140] rounded-lg shadow-xl p-4 w-80">
            <div className="text-xs font-semibold text-[#e1e4ed] mb-2">Add Comment</div>
            <textarea
              autoFocus
              value={commentInput.text}
              onChange={e => setCommentInput(prev => prev ? { ...prev, text: e.target.value } : null)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } if (e.key === 'Escape') setCommentInput(null); }}
              className="w-full bg-[#232733] border border-[#2d3140] rounded px-3 py-2 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff] resize-none"
              rows={3}
              placeholder="Type your comment..."
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setCommentInput(null)} className="px-3 py-1 text-xs bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] rounded">Cancel</button>
              <button onClick={handleSubmitComment} className="px-3 py-1 text-xs bg-[#6c8aff] hover:bg-[#5a78f0] text-white rounded">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Feature #11: Block link popup */}
      {blockLinkPopup && (
        <div style={{ position: 'fixed', top: blockLinkPopup.pos.top, left: blockLinkPopup.pos.left, zIndex: 50 }}>
          <BlockLinkPopup
            blocks={blocks.filter(b => b.id !== blockLinkPopup.blockId)}
            query={blockLinkPopup.query}
            onSelect={handleBlockLinkSelect}
            onClose={() => setBlockLinkPopup(null)}
          />
        </div>
      )}

      {/* Feature #19: Version timeline */}
      {timelineBlockId && (() => {
        const block = blocks.find(b => b.id === timelineBlockId);
        const blockIdx = blocks.findIndex(b => b.id === timelineBlockId);
        if (!block) return null;
        return (
          <VersionTimeline
            block={block}
            blockIndex={blockIdx}
            onClose={() => setTimelineBlockId(null)}
            onSwitchVersion={switchBlockVersion}
            onDeleteVersion={deleteBlockVersion}
          />
        );
      })()}

      {/* Feature #20: Share modal */}
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  );
}

// Feature #20: Build share HTML
function buildShareHtml(name: string, blocks: Block[], citations: Citation[], citationMap: Map<string, number>): string {
  let body = '';
  for (const block of blocks) {
    const html = block.versions[block.activeVersion]?.html || '';
    if (!html.trim()) continue;
    const cids = block.citationIds || [];
    const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
    const badges = nums.length > 0 ? nums.map(n => `<sup style="background:#6c8aff22;color:#6c8aff;padding:0 3px;border-radius:3px;font-size:10px">[${n}]</sup>`).join('') : '';
    body += `<div class="block">${html}${badges}</div>\n`;
  }
  const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
  if (allCited.length > 0) {
    body += '<hr style="margin:2em 0;border-color:#e0e0e0"><h2>References</h2><ol>';
    for (const [citId, num] of allCited) {
      const citation = citations.find(c => c.id === citId);
      if (citation) {
        body += `<li>${citation.data.title || 'Untitled'} (${citation.data.date?.substring(0, 4) || 'n.d.'})</li>`;
      }
    }
    body += '</ol>';
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title><style>
body{font-family:Georgia,serif;max-width:800px;margin:2em auto;padding:0 1em;color:#1a1a1a;line-height:1.7}
h1,h2,h3{margin-top:1.5em}.block{margin-bottom:1em}img{width:100%;height:auto}
</style></head><body><h1>${name}</h1>${body}</body></html>`;
}
