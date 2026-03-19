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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingH = useRef(false);
  const isDraggingV = useRef(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // Load persisted theme on client mount (separate from the apply effect to avoid SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem('ra-theme') as 'dark' | 'light' | 'system' | null;
    if (stored && stored !== 'dark') setTheme(stored);
  }, []);

  // Theme management — JS-injected styles are more reliable than CSS class overrides for Tailwind arbitrary values
  useEffect(() => {
    const LIGHT_CSS = `
      html, body { background-color: #f4f5f8 !important; color: #1a1d27 !important; }
      .bg-\\[\\#0f1117\\] { background-color: #f4f5f8 !important; }
      .bg-\\[\\#1a1d27\\] { background-color: #ffffff !important; }
      .bg-\\[\\#232733\\] { background-color: #eef0f6 !important; }
      .bg-\\[\\#2d3140\\] { background-color: #d8dce8 !important; }
      .hover\\:bg-\\[\\#232733\\]:hover { background-color: #e4e7f0 !important; }
      .hover\\:bg-\\[\\#2d3140\\]:hover { background-color: #d0d4e0 !important; }
      .hover\\:bg-\\[\\#3d4160\\]:hover { background-color: #c8ccd8 !important; }
      .text-\\[\\#e1e4ed\\] { color: #1a1d27 !important; }
      .text-\\[\\#c8ccd8\\] { color: #2d3140 !important; }
      .text-\\[\\#8b90a0\\] { color: #5a6070 !important; }
      .border-\\[\\#2d3140\\] { border-color: #d0d4e0 !important; }
      select, option { background-color: #eef0f6 !important; color: #1a1d27 !important; }
      input[type="text"], textarea { color: #1a1d27 !important; }
    `;
    const applyTheme = (t: 'dark' | 'light' | 'system') => {
      const resolved = t === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.setAttribute('data-theme', resolved);
      document.getElementById('ra-theme-style')?.remove();
      if (resolved === 'light') {
        const style = document.createElement('style');
        style.id = 'ra-theme-style';
        style.textContent = LIGHT_CSS;
        document.head.appendChild(style);
      }
    };
    applyTheme(theme);
    localStorage.setItem('ra-theme', theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

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

  // Feature #3: Focus mode — collapse panels
  useEffect(() => {
    const handler = (e: Event) => {
      const { active } = (e as CustomEvent).detail;
      if (active) {
        setLeftCollapsed(true);
        setBottomCollapsed(true);
      } else {
        setLeftCollapsed(false);
        setBottomCollapsed(false);
      }
    };
    window.addEventListener('focus-mode-change', handler);
    return () => window.removeEventListener('focus-mode-change', handler);
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
      <TopBar onNewProject={() => setShowNewProject(true)} theme={theme} onThemeChange={setTheme} />
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left pane: NLM / Outline toggle */}
        <div
          style={{ width: leftCollapsed ? 0 : leftWidth, minWidth: leftCollapsed ? 0 : leftWidth }}
          className="flex flex-col overflow-hidden border-r border-[#2d3140] transition-[width] duration-150"
        >
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
        {/* Vertical resize handle + left-pane collapse toggle */}
        <div className="relative flex-shrink-0 w-3 flex items-start justify-center bg-[#2d3140] hover:bg-[#3d4160] transition-colors group/vhandle">
          {!leftCollapsed && (
            <div className="absolute inset-0 cursor-col-resize" onMouseDown={handleVerticalDrag} />
          )}
          <button
            onClick={() => setLeftCollapsed(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            className="relative z-10 mt-4 w-3 h-7 flex items-center justify-center text-[#8b90a0] hover:text-white text-[10px] leading-none select-none"
            title={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>
        </div>
        {/* Right: Editor + Bottom Pane */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <EditorToolbar />
          <div className="flex-1 overflow-hidden" style={{ height: `calc(100% - ${bottomCollapsed ? 0 : bottomHeight}px - 20px - 40px)` }}>
            <BlockEditor />
          </div>
          {/* Horizontal resize handle + bottom-pane collapse toggle */}
          <div className="relative flex-shrink-0 h-5 flex items-center justify-center bg-[#2d3140] hover:bg-[#3d4160] transition-colors group/hhandle">
            {!bottomCollapsed && (
              <div className="absolute inset-0 cursor-row-resize" onMouseDown={handleHorizontalDrag} />
            )}
            <button
              onClick={() => setBottomCollapsed(v => !v)}
              onMouseDown={e => e.stopPropagation()}
              className="relative z-10 h-5 w-10 flex items-center justify-center text-[#8b90a0] hover:text-white text-[10px] leading-none select-none"
              title={bottomCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {bottomCollapsed ? '∧' : '∨'}
            </button>
          </div>
          <div style={{ height: bottomCollapsed ? 0 : bottomHeight, minHeight: bottomCollapsed ? 0 : bottomHeight }} className="flex-shrink-0 overflow-hidden border-t border-[#2d3140] transition-[height] duration-150">
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
