'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Block } from '@/types';
import BlockAIPopup from './BlockAIPopup';

interface BlockItemProps {
  block: Block;
  isFirst: boolean;
  onFocus: (id: string) => void;
  onBlur: (id: string, html: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string, html: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | null;
  onShowAI: (blockId: string, pos: { top: number; left: number }) => void;
  onSwitchVersion: (id: string, idx: number) => void;
  focusedId: string | null;
}

function BlockItem({
  block,
  isFirst,
  onFocus,
  onBlur,
  onKeyDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  dropTargetId,
  dropPosition,
  onShowAI,
  onSwitchVersion,
  focusedId,
}: BlockItemProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const activeHtml = block.versions[block.activeVersion]?.html || '';
  const prevActiveVersion = useRef(block.activeVersion);
  const prevBlockId = useRef(block.id);

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

  const handleHandleClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onShowAI(block.id, { top: rect.top, left: rect.right + 8 });
  };

  return (
    <div className="group relative">
      {/* Drop indicator before */}
      <div className={`drop-indicator ${isDropBefore ? 'active' : ''}`} />
      <div
        className={`flex items-start gap-1 px-4 py-0.5 rounded transition-colors ${isFocused ? 'bg-[#1a1d27]/50' : 'hover:bg-[#1a1d27]/30'}`}
        draggable
        onDragStart={e => onDragStart(e, block.id)}
        onDragOver={e => onDragOver(e, block.id)}
        onDrop={e => onDrop(e, block.id)}
        onDragLeave={onDragLeave}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[#8b90a0] hover:text-[#6c8aff] select-none"
          title="Drag to reorder / Click for AI rewrite"
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
          />
          {/* Version pills */}
          {block.versions.length > 1 && (
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {block.versions.map((v, idx) => (
                <button
                  key={idx}
                  onClick={() => onSwitchVersion(block.id, idx)}
                  className={`version-pill ${idx === block.activeVersion ? 'active' : ''}`}
                  title={v.instruction || `Version ${idx + 1}`}
                >
                  v{idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Drop indicator after */}
      <div className={`drop-indicator ${isDropAfter ? 'active' : ''}`} />
    </div>
  );
}

export default function BlockEditor() {
  const { currentProject, updateBlock, deleteBlock, addBlock, moveBlock, addBlockVersion, switchBlockVersion } = useStore();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [aiPopup, setAiPopup] = useState<{ blockId: string; pos: { top: number; left: number } } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFocusId = useRef<string | null>(null);

  const blocks = currentProject?.blocks || [];

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      useStore.getState().saveCurrentProject();
    }, 500);
  }, []);

  const handleFocus = (id: string) => setFocusedId(id);

  const handleBlur = (id: string, html: string) => {
    updateBlock(id, html);
    scheduleAutoSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, html: string) => {
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

  // Focus pending block after render
  useEffect(() => {
    if (pendingFocusId.current) {
      const id = pendingFocusId.current;
      pendingFocusId.current = null;
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${id}"] .block-content`) as HTMLElement;
        if (el) {
          el.focus();
          // Place cursor at end
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
    if (draggedId && targetId !== draggedId && dropPosition) {
      moveBlock(draggedId, targetId, dropPosition);
    }
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleShowAI = (blockId: string, pos: { top: number; left: number }) => {
    setAiPopup({ blockId, pos });
  };

  const handleAIApply = (newHtml: string, instruction: string) => {
    if (aiPopup) {
      addBlockVersion(aiPopup.blockId, newHtml, instruction);
    }
    setAiPopup(null);
  };

  const handleInsertFromChat = useCallback((html: string) => {
    // Insert content at focused block or append
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

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full text-[#8b90a0] text-sm">
        No project open
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0f1117]">
      <div className="max-w-3xl mx-auto py-6">
        {blocks.map((block, idx) => (
          <div key={block.id} data-block-id={block.id}>
            <BlockItem
              block={block}
              isFirst={idx === 0}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragLeave={handleDragLeave}
              dropTargetId={dropTargetId}
              dropPosition={dropPosition}
              onShowAI={handleShowAI}
              onSwitchVersion={switchBlockVersion}
              focusedId={focusedId}
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
      {aiPopup && (
        <BlockAIPopup
          blockId={aiPopup.blockId}
          blockHtml={blocks.find(b => b.id === aiPopup.blockId)?.versions[blocks.find(b => b.id === aiPopup.blockId)?.activeVersion || 0]?.html || ''}
          onApply={handleAIApply}
          onClose={() => setAiPopup(null)}
          position={aiPopup.pos}
        />
      )}
    </div>
  );
}
