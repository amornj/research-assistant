'use client';

import { useState, useEffect } from 'react';
import AIWritingTab from './AIWritingTab';
import ZoteroTab from './ZoteroTab';
import NotebookSwitcher from './NotebookSourcePanel';

export default function BottomPane() {
  const [activeTab, setActiveTab] = useState<'ai' | 'zotero' | 'sources'>('ai');

  // Listen for tab-switch events from command palette
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) setActiveTab(detail.tab);
    };
    window.addEventListener('bottom-tab-change', handler);
    return () => window.removeEventListener('bottom-tab-change', handler);
  }, []);

  // Focus Zotero search when commanded
  useEffect(() => {
    const handler = () => {
      setActiveTab('zotero');
    };
    window.addEventListener('command-focus-zotero', handler);
    return () => window.removeEventListener('command-focus-zotero', handler);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#1a1d27]">
      <div className="flex border-b border-[#2d3140] flex-shrink-0">
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'ai'
              ? 'border-[#6c8aff] text-[#6c8aff]'
              : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          AI Writing
        </button>
        <button
          onClick={() => setActiveTab('zotero')}
          className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'zotero'
              ? 'border-[#6c8aff] text-[#6c8aff]'
              : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          Zotero
        </button>
        <button
          onClick={() => setActiveTab('sources')}
          className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'sources'
              ? 'border-[#6c8aff] text-[#6c8aff]'
              : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          Notebooks
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div style={{ display: activeTab === 'ai' ? 'flex' : 'none' }} className="flex-col h-full">
          <AIWritingTab />
        </div>
        <div style={{ display: activeTab === 'zotero' ? 'flex' : 'none' }} className="flex-col h-full">
          <ZoteroTab />
        </div>
        <div style={{ display: activeTab === 'sources' ? 'flex' : 'none' }} className="flex-col h-full">
          <NotebookSwitcher />
        </div>
      </div>
    </div>
  );
}
