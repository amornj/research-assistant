'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';

interface Command {
  id: string;
  label: string;
  description?: string;
  action: () => void;
}

interface Props {
  onClose: () => void;
  onNewProject: () => void;
}

export default function CommandPalette({ onClose, onNewProject }: Props) {
  const { projects, selectProject, currentProject, addBlock } = useStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doExportMarkdown = () => {
    const event = new CustomEvent('command-export', { detail: { type: 'markdown' } });
    window.dispatchEvent(event);
    onClose();
  };

  const doExportHtml = () => {
    const event = new CustomEvent('command-export', { detail: { type: 'html' } });
    window.dispatchEvent(event);
    onClose();
  };

  const doInsertBlock = () => {
    addBlock('');
    onClose();
  };

  const doSearchZotero = () => {
    const event = new CustomEvent('command-focus-zotero');
    window.dispatchEvent(event);
    onClose();
  };

  const doFocusAI = () => {
    const event = new CustomEvent('command-focus-ai');
    window.dispatchEvent(event);
    onClose();
  };

  const doQueryNLM = () => {
    const event = new CustomEvent('command-focus-nlm');
    window.dispatchEvent(event);
    onClose();
  };

  const doAIRewrite = () => {
    const event = new CustomEvent('command-ai-rewrite');
    window.dispatchEvent(event);
    onClose();
  };

  const allCommands: Command[] = [
    { id: 'new-project', label: '+ New Project', description: 'Create a new research project', action: () => { onNewProject(); onClose(); } },
    ...projects.map(p => ({
      id: `switch-${p.id}`,
      label: `Switch to: ${p.name}`,
      description: 'Switch project',
      action: () => { selectProject(p.id); onClose(); },
    })),
    { id: 'insert-block', label: '↵ Insert Block', description: 'Add a new block at end', action: doInsertBlock },
    { id: 'export-md', label: '⬇ Export Markdown', description: 'Download as .md file', action: doExportMarkdown },
    { id: 'export-html', label: '⬇ Export HTML', description: 'Download as .html file', action: doExportHtml },
    { id: 'search-zotero', label: '🔍 Search Zotero', description: 'Open Zotero in split pane', action: doSearchZotero },
    { id: 'query-nlm', label: '📚 Query NotebookLM', description: 'Focus NotebookLM input', action: doQueryNLM },
    { id: 'focus-ai', label: '✨ AI Writing', description: 'Switch to AI Writing tab', action: doFocusAI },
    { id: 'ai-rewrite', label: '✨ AI Rewrite Current Block', description: 'Open AI rewrite popup for focused block', action: doAIRewrite },
  ];

  const filtered = query.trim()
    ? allCommands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(query.toLowerCase())
      )
    : allCommands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selected]) filtered[selected].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Reset selection when filter changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-24"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2d3140]">
          <span className="text-[#8b90a0] text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm text-[#e1e4ed] focus:outline-none placeholder-[#8b90a0]"
          />
          <kbd className="text-[10px] text-[#8b90a0] bg-[#232733] border border-[#2d3140] rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-xs text-[#8b90a0]">No commands found</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              onMouseEnter={() => setSelected(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selected ? 'bg-[#6c8aff]/15' : 'hover:bg-[#232733]'
              }`}
            >
              <div>
                <div className={`text-sm ${i === selected ? 'text-[#6c8aff]' : 'text-[#e1e4ed]'}`}>{cmd.label}</div>
                {cmd.description && <div className="text-xs text-[#8b90a0]">{cmd.description}</div>}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[#2d3140] flex gap-3 text-[10px] text-[#8b90a0]">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  );
}
