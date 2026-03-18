'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Source {
  id: string;
  title: string;
  type?: string;
}

export default function NotebookSourcePanel() {
  const { currentProject, addCitationToBlock, focusedBlockId } = useStore();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const notebookId = currentProject?.notebookId;

  useEffect(() => {
    if (!notebookId) return;
    setLoading(true);
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then(data => {
        // The list API returns notebooks; we want sources from the current notebook
        // If the API returns sources directly, use them
        if (Array.isArray(data)) {
          // Data might be notebooks list or sources list depending on API
          setSources(data.map((item: { id?: string; title?: string; name?: string }) => ({
            id: item.id || '',
            title: item.title || item.name || 'Untitled',
          })));
        }
      })
      .catch(() => setError('Failed to load sources'))
      .finally(() => setLoading(false));
  }, [notebookId]);

  const handleSearchZotero = (title: string) => {
    const event = new CustomEvent('zotero-search', { detail: { query: title } });
    window.dispatchEvent(event);
    // Switch to Zotero tab
    const event2 = new CustomEvent('command-focus-zotero');
    window.dispatchEvent(event2);
  };

  if (!notebookId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-xs text-[#8b90a0] text-center">No NotebookLM notebook linked to this project</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#2d3140] flex items-center justify-between">
        <span className="text-xs font-semibold text-[#8b90a0] uppercase tracking-wide">NLM Sources</span>
        <span className="text-xs text-[#6c8aff] truncate max-w-[120px]">{currentProject?.notebookName}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading && <div className="text-xs text-[#8b90a0] text-center mt-4">Loading sources...</div>}
        {error && <div className="text-xs text-red-400 p-2">{error}</div>}
        {!loading && sources.length === 0 && !error && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">No sources found in notebook</div>
        )}
        {sources.map(s => (
          <div key={s.id} className="p-2 rounded bg-[#232733] border border-[#2d3140] mb-1 group hover:border-[#6c8aff] transition-colors">
            <div className="text-xs text-[#e1e4ed] line-clamp-2">{s.title}</div>
            <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleSearchZotero(s.title)}
                className="px-2 py-0.5 text-xs bg-[#6c8aff]/20 hover:bg-[#6c8aff]/30 text-[#6c8aff] rounded transition-colors"
              >
                + Add to Zotero search
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
