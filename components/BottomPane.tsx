'use client';

import { useState } from 'react';
import AIWritingTab from './AIWritingTab';
import ZoteroTab from './ZoteroTab';

export default function BottomPane() {
  const [activeTab, setActiveTab] = useState<'ai' | 'zotero'>('ai');

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
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'ai' ? <AIWritingTab /> : <ZoteroTab />}
      </div>
    </div>
  );
}
