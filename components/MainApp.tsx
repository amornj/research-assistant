'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import TopBar from './TopBar';
import NotebookPane from './NotebookPane';
import OutlinePanel from './OutlinePanel';
import NotebookSourcePanel from './NotebookSourcePanel';
import AIWritingTab from './AIWritingTab';
import ZoteroTab from './ZoteroTab';
import BlockEditor from './BlockEditor';
import EditorToolbar from './EditorToolbar';
import PdfViewer from './PdfViewer';
import NewProjectModal from './NewProjectModal';
import CommandPalette from './CommandPalette';

interface PaneState {
  mode: 'editor' | 'pdf' | 'zotero';
  pdfUrl?: string;
  pdfFilename?: string;
}

export default function MainApp() {
  const { loadProjects, currentProject } = useStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [leftWidth, setLeftWidth] = useState(320);
  const [leftTab, setLeftTab] = useState<'nlm' | 'outline' | 'sources' | 'ai'>('nlm');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  // Split view state
  const [splitView, setSplitView] = useState(false);
  const [splitEditorWidth, setSplitEditorWidth] = useState(600);
  const [leftPane, setLeftPane] = useState<PaneState>({ mode: 'editor' });
  const [rightPane, setRightPane] = useState<PaneState>({ mode: 'editor' });

  // Auto-hide panes state (separate from manual collapse)
  const [panesAutoHidden, setPanesAutoHidden] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingH = useRef(false);
  const isDraggingSplit = useRef(false);
  const leftPdfInputRef = useRef<HTMLInputElement>(null);
  const rightPdfInputRef = useRef<HTMLInputElement>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      } else {
        setLeftCollapsed(false);
      }
    };
    window.addEventListener('focus-mode-change', handler);
    return () => window.removeEventListener('focus-mode-change', handler);
  }, []);

  // Auto-hide panes: 10s timer + spacebar restore
  useEffect(() => {
    const startTimer = () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = setTimeout(() => {
        setPanesAutoHidden(true);
      }, 10000);
    };

    // Spacebar shows panes if not in a contentEditable
    const handleSpacebar = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      setPanesAutoHidden(false);
      startTimer();
    };

    startTimer();
    window.addEventListener('keydown', handleSpacebar);

    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      window.removeEventListener('keydown', handleSpacebar);
    };
  }, []);

  const handlePaneMouseEnter = () => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    setPanesAutoHidden(false);
  };

  const handlePaneMouseLeave = () => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => {
      setPanesAutoHidden(true);
    }, 10000);
  };

  // Command palette actions
  useEffect(() => {
    const focusZotero = () => {
      // Open Zotero in right pane with split view
      setSplitView(true);
      setRightPane({ mode: 'zotero' });
      setTimeout(() => {
        const input = document.querySelector('[data-zotero-search]') as HTMLInputElement;
        if (input) input.focus();
      }, 150);
    };
    const focusNLM = () => {
      setLeftTab('nlm');
      setTimeout(() => {
        const input = document.querySelector('[data-nlm-input]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    };
    const focusAI = () => {
      setLeftTab('ai');
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
    window.addEventListener('command-focus-ai', focusAI);
    window.addEventListener('command-ai-rewrite', aiRewrite);
    return () => {
      window.removeEventListener('command-focus-zotero', focusZotero);
      window.removeEventListener('command-focus-nlm', focusNLM);
      window.removeEventListener('command-focus-ai', focusAI);
      window.removeEventListener('command-ai-rewrite', aiRewrite);
    };
  }, []);

  // #20 — Handle Roam/Notion export events
  useEffect(() => {
    const handleRoamExport = async (e: Event) => {
      const { title, content } = (e as CustomEvent).detail;
      try {
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

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (leftPane.pdfUrl) URL.revokeObjectURL(leftPane.pdfUrl);
      if (rightPane.pdfUrl) URL.revokeObjectURL(rightPane.pdfUrl);
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

  const handleSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    const startX = e.clientX;
    const startWidth = splitEditorWidth;
    const onMove = (me: MouseEvent) => {
      if (!isDraggingSplit.current) return;
      const delta = me.clientX - startX;
      setSplitEditorWidth(Math.max(300, startWidth + delta));
    };
    const onUp = () => {
      isDraggingSplit.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const openPdf = (pane: 'left' | 'right') => {
    if (pane === 'left') {
      leftPdfInputRef.current?.click();
    } else {
      rightPdfInputRef.current?.click();
    }
  };

  const loadPdfFile = (pane: 'left' | 'right', file: File) => {
    const url = URL.createObjectURL(file);
    if (pane === 'left') {
      if (leftPane.pdfUrl) URL.revokeObjectURL(leftPane.pdfUrl);
      setLeftPane({ mode: 'pdf', pdfUrl: url, pdfFilename: file.name });
    } else {
      if (rightPane.pdfUrl) URL.revokeObjectURL(rightPane.pdfUrl);
      setRightPane({ mode: 'pdf', pdfUrl: url, pdfFilename: file.name });
    }
  };

  const closePdf = (pane: 'left' | 'right') => {
    if (pane === 'left') {
      if (leftPane.pdfUrl) URL.revokeObjectURL(leftPane.pdfUrl);
      setLeftPane({ mode: 'editor' });
    } else {
      if (rightPane.pdfUrl) URL.revokeObjectURL(rightPane.pdfUrl);
      setRightPane({ mode: 'editor' });
    }
  };

  const openZotero = (pane: 'left' | 'right') => {
    if (pane === 'left') {
      if (leftPane.pdfUrl) URL.revokeObjectURL(leftPane.pdfUrl);
      setLeftPane({ mode: 'zotero' });
    } else {
      if (rightPane.pdfUrl) URL.revokeObjectURL(rightPane.pdfUrl);
      setRightPane({ mode: 'zotero' });
    }
  };

  const closeZotero = (pane: 'left' | 'right') => {
    if (pane === 'left') {
      setLeftPane({ mode: 'editor' });
    } else {
      setRightPane({ mode: 'editor' });
    }
  };

  const renderPaneContent = (pane: PaneState) => {
    if (pane.mode === 'pdf' && pane.pdfUrl) {
      return <PdfViewer url={pane.pdfUrl} filename={pane.pdfFilename} />;
    }
    if (pane.mode === 'zotero') {
      return (
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <ZoteroTab />
        </div>
      );
    }
    return <BlockEditor />;
  };

  const leftTabClass = (tab: typeof leftTab) =>
    `flex-1 px-2 py-1.5 text-xs font-medium transition-colors border-b-2 ${
      leftTab === tab
        ? 'border-[#6c8aff] text-[#6c8aff]'
        : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
    }`;

  return (
    <div className="flex flex-col h-screen">
      {/* Hidden file inputs for PDF loading */}
      <input
        ref={leftPdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) loadPdfFile('left', file);
          e.target.value = '';
        }}
      />
      <input
        ref={rightPdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) loadPdfFile('right', file);
          e.target.value = '';
        }}
      />

      <TopBar onNewProject={() => setShowNewProject(true)} theme={theme} onThemeChange={setTheme} />
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left pane: NLM / Outline / Sources / AI tabs */}
        <div
          style={{ width: (leftCollapsed || panesAutoHidden) ? 0 : leftWidth, minWidth: (leftCollapsed || panesAutoHidden) ? 0 : leftWidth }}
          className="flex flex-col overflow-hidden border-r border-[#2d3140] transition-[width] duration-200"
          onMouseEnter={handlePaneMouseEnter}
          onMouseLeave={handlePaneMouseLeave}
        >
          {/* Left pane tab switcher */}
          <div className="flex border-b border-[#2d3140] flex-shrink-0">
            <button onClick={() => setLeftTab('nlm')} className={leftTabClass('nlm')}>NLM</button>
            <button onClick={() => setLeftTab('outline')} className={leftTabClass('outline')}>Outline</button>
            <button onClick={() => setLeftTab('sources')} className={leftTabClass('sources')}>Sources</button>
            <button onClick={() => setLeftTab('ai')} className={leftTabClass('ai')}>AI</button>
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'nlm' && <NotebookPane />}
            {leftTab === 'outline' && <OutlinePanel />}
            {leftTab === 'sources' && <NotebookSourcePanel />}
            {leftTab === 'ai' && <AIWritingTab />}
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
        {/* Editor area — split or single, takes full vertical space */}
        <div className="flex flex-1 overflow-hidden min-w-0 min-h-0">
          {splitView ? (
            <>
              {/* Left editor pane */}
              <div
                className="flex flex-col overflow-hidden border-r border-[#2d3140]"
                style={{ width: splitEditorWidth, minWidth: splitEditorWidth }}
              >
                <EditorToolbar
                  showSplitToggle
                  splitActive
                  onSplitToggle={() => setSplitView(false)}
                  paneMode={leftPane.mode}
                  pdfFilename={leftPane.pdfFilename}
                  onOpenPdf={() => openPdf('left')}
                  onClosePdf={() => closePdf('left')}
                  onOpenZotero={() => openZotero('left')}
                  onCloseZotero={() => closeZotero('left')}
                />
                <div className="flex-1 overflow-hidden min-h-0">
                  {renderPaneContent(leftPane)}
                </div>
              </div>
              {/* Draggable split divider */}
              <div
                className="w-1.5 flex-shrink-0 cursor-col-resize bg-[#2d3140] hover:bg-[#6c8aff] transition-colors"
                onMouseDown={handleSplitDrag}
                title="Drag to resize panes"
              />
              {/* Right editor pane */}
              <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                <EditorToolbar
                  paneMode={rightPane.mode}
                  pdfFilename={rightPane.pdfFilename}
                  onOpenPdf={() => openPdf('right')}
                  onClosePdf={() => closePdf('right')}
                  onOpenZotero={() => openZotero('right')}
                  onCloseZotero={() => closeZotero('right')}
                />
                <div className="flex-1 overflow-hidden min-h-0">
                  {renderPaneContent(rightPane)}
                </div>
              </div>
            </>
          ) : (
            /* Single pane */
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              <EditorToolbar
                showSplitToggle
                splitActive={false}
                onSplitToggle={() => setSplitView(true)}
                paneMode={leftPane.mode}
                pdfFilename={leftPane.pdfFilename}
                onOpenPdf={() => openPdf('left')}
                onClosePdf={() => closePdf('left')}
                onOpenZotero={() => openZotero('left')}
                onCloseZotero={() => closeZotero('left')}
              />
              <div className="flex-1 overflow-hidden min-h-0">
                {renderPaneContent(leftPane)}
              </div>
            </div>
          )}
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
