'use client';

import { useState, useEffect } from 'react';
import AIWritingTab from './AIWritingTab';
import ZoteroTab from './ZoteroTab';
import NotebookSwitcher from './NotebookSourcePanel';
import CitationGraph from './CitationGraph';

export default function BottomPane() {
  const [activeTab, setActiveTab] = useState<'ai' | 'zotero' | 'sources' | 'graph'>('ai');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) setActiveTab(detail.tab);
    };
    window.addEventListener('bottom-tab-change', handler);
    return () => window.removeEventListener('bottom-tab-change', handler);
  }, []);

  useEffect(() => {
    const handler = () => setActiveTab('zotero');
    window.addEventListener('command-focus-zotero', handler);
    return () => window.removeEventListener('command-focus-zotero', handler);
  }, []);

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-[#6c8aff] text-[#6c8aff]'
        : 'border-transparent text-[#8b90a0] hover:text-[#e1e4ed]'
    }`;

  return (
    <div className="flex flex-col h-full bg-[#1a1d27]">
      <div className="flex border-b border-[#2d3140] flex-shrink-0">
        <button onClick={() => setActiveTab('ai')} className={tabClass('ai')}>AI Writing</button>
        <button onClick={() => setActiveTab('zotero')} className={tabClass('zotero')}>Zotero</button>
        <button onClick={() => setActiveTab('sources')} className={tabClass('sources')}>Notebooks</button>
        <button onClick={() => setActiveTab('graph')} className={tabClass('graph')}>Graph</button>
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
        <div style={{ display: activeTab === 'graph' ? 'flex' : 'none', height: '100%' }}>
          {activeTab === 'graph' && <CitationGraph />}
        </div>
      </div>
    </div>
  );
}
