'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import TopBar from './TopBar';
import NotebookPane from './NotebookPane';
import BlockEditor from './BlockEditor';
import EditorToolbar from './EditorToolbar';
import BottomPane from './BottomPane';
import NewProjectModal from './NewProjectModal';

export default function MainApp() {
  const { loadProjects, currentProject } = useStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [bottomHeight, setBottomHeight] = useState(280);
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
        {/* Left: NLM Chat Pane */}
        <div style={{ width: leftWidth, minWidth: leftWidth }} className="flex flex-col overflow-hidden border-r border-[#2d3140]">
          <NotebookPane />
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
    </div>
  );
}
