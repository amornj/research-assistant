'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import TopBar from './TopBar';
import NotebookPane from './NotebookPane';
import OutlinePanel from './OutlinePanel';
import BlockEditor from './BlockEditor';
import EditorToolbar from './EditorToolbar';
import BottomPane from './BottomPane';
import NewProjectModal from './NewProjectModal';
import CommandPalette from './CommandPalette';

export default function MainApp() {
  const { loadProjects, currentProject } = useStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [bottomHeight, setBottomHeight] = useState(280);
  const [leftTab, setLeftTab] = useState<'nlm' | 'outline'>('nlm');
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingH = useRef(false);
  const isDraggingV = useRef(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const store = useStore.getState();
    if (!store.currentProject && store.projects.length === 0) {
      setShowNewProject(true);
    }
  }, []);

  // #13 — Global Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(v => !v);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Command palette actions
  useEffect(() => {
    const focusZotero = () => {
      const event = new CustomEvent('bottom-tab-change', { detail: { tab: 'zotero' } });
      window.dispatchEvent(event);
      setTimeout(() => {
        const input = document.querySelector('[data-zotero-search]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    };
    const focusNLM = () => {
      setLeftTab('nlm');
      setTimeout(() => {
        const input = document.querySelector('[data-nlm-input]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    };
    const aiRewrite = () => {
      const focusedId = (window as any).__editorFocusedBlockId;
      if (focusedId) {
        const event = new CustomEvent('trigger-ai-rewrite', { detail: { blockId: focusedId } });
        window.dispatchEvent(event);
      }
    };
    window.addEventListener('command-focus-zotero', focusZotero);
    window.addEventListener('command-focus-nlm', focusNLM);
    window.addEventListener('command-ai-rewrite', aiRewrite);
    return () => {
      window.removeEventListener('command-focus-zotero', focusZotero);
      window.removeEventListener('command-focus-nlm', focusNLM);
      window.removeEventListener('command-ai-rewrite', aiRewrite);
    };
  }, []);

  // #20 — Handle Roam/Notion export events
  useEffect(() => {
    const handleRoamExport = async (e: Event) => {
      const { title, content } = (e as CustomEvent).detail;
      try {
        // Use Roam MCP to create page
        const event = new CustomEvent('mcp-roam-create', { detail: { title, content } });
        window.dispatchEvent(event);
        alert(`Exported to Roam: "${title}"\n\nNote: Connect Roam MCP to auto-create the page. For now, content is in clipboard.`);
        await navigator.clipboard.writeText(content).catch(() => {});
      } catch { /* ignore */ }
    };
    const handleNotionExport = async (e: Event) => {
      const { title, content } = (e as CustomEvent).detail;
      try {
        alert(`Exported to Notion: "${title}"\n\nNote: Connect Notion MCP to auto-create the page. For now, content is in clipboard.`);
        await navigator.clipboard.writeText(content).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener('export-to-roam', handleRoamExport);
    window.addEventListener('export-to-notion', handleNotionExport);
    return () => {
      window.removeEventListener('export-to-roam', handleRoamExport);
      window.removeEventListener('export-to-notion', handleNotionExport);
    };
  }, []);

  const handleVerticalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingH.current = true;
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (me: MouseEvent) => {
      if (!isDraggingH.current) return;
      const delta = me.clientX - startX;
      setLeftWidth(Math.max(200, Math.min(500, startWidth + delta)));
    };
    const onUp = () => {
      isDraggingH.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleHorizontalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingV.current = true;
    const startY = e.clientY;
    const startHeight = bottomHeight;
    const containerH = containerRef.current?.clientHeight || 600;
    const onMove = (me: MouseEvent) => {
      if (!isDraggingV.current) return;
      const delta = startY - me.clientY;
      setBottomHeight(Math.max(150, Math.min(containerH - 200, startHeight + delta)));
    };
    const onUp = () => {
      isDraggingV.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col h-screen">
      <TopBar onNewProject={() => setShowNewProject(true)} />
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left pane: NLM / Outline toggle */}
        <div style={{ width: leftWidth, minWidth: leftWidth }} className="flex flex-col overflow-hidden border-r border-[#2d3140]">
          {/* Left pane tab switcher (#15) */}
          <div className="flex border-b border-[#2d3140] flex-shrink-0">
            <button
              onClick={() => setLeftTab('nlm')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                leftTab === 'nlm'
                  ? 'border-[#6c8aff] text-[#6c8aff]'
                  : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
              }`}
            >
              NotebookLM
            </button>
            <button
              onClick={() => setLeftTab('outline')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                leftTab === 'outline'
                  ? 'border-[#6c8aff] text-[#6c8aff]'
                  : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
              }`}
            >
              Outline
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'nlm' && <NotebookPane />}
            {leftTab === 'outline' && <OutlinePanel />}
          </div>
        </div>
        {/* Vertical resize handle */}
        <div
          className="resize-handle"
          onMouseDown={handleVerticalDrag}
        />
        {/* Right: Editor + Bottom Pane */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <EditorToolbar />
          <div className="flex-1 overflow-hidden" style={{ height: `calc(100% - ${bottomHeight}px - 4px - 40px)` }}>
            <BlockEditor />
          </div>
          {/* Horizontal resize handle */}
          <div
            className="h-1 cursor-row-resize bg-[#2d3140] hover:bg-[#6c8aff] transition-colors flex-shrink-0"
            onMouseDown={handleHorizontalDrag}
          />
          <div style={{ height: bottomHeight, minHeight: bottomHeight }} className="flex-shrink-0 overflow-hidden border-t border-[#2d3140]">
            <BottomPane />
          </div>
        </div>
      </div>
      {showNewProject && (
        <NewProjectModal onClose={() => setShowNewProject(false)} />
      )}
      {/* #13 — Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onNewProject={() => { setShowNewProject(true); setShowCommandPalette(false); }}
        />
      )}
    </div>
  );
}
