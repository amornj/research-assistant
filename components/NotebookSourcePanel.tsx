'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Notebook {
  id: string;
  name: string;
}

export default function NotebookSwitcher() {
  const { currentProject, updateProjectField } = useStore();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNotebooks(data.map((item: any) => ({
            id: item.id || item.notebook_id || '',
            name: item.name || item.title || 'Untitled',
          })));
        }
      })
      .catch(() => setError('Failed to load notebooks'))
      .finally(() => setLoading(false));
  }, []);

  const handleSwitch = (nb: Notebook) => {
    setSwitching(nb.id);
    updateProjectField('notebookName', nb.name);
    updateProjectField('notebookId', nb.id);
    // Clear conversation so chat starts fresh with new notebook
    updateProjectField('conversationId', null);
    setTimeout(() => setSwitching(null), 600);
  };

  const activeId = currentProject?.notebookId;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#2d3140] flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-[#8b90a0] uppercase tracking-wide">Notebooks</span>
        {activeId && (
          <span className="text-[10px] text-[#6c8aff] truncate max-w-[130px]" title={currentProject?.notebookName}>
            Active: {currentProject?.notebookName}
          </span>
        )}
      </div>
      {!activeId && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
          No notebook linked — click one below to activate
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && <div className="text-xs text-[#8b90a0] text-center mt-4">Loading notebooks...</div>}
        {error && <div className="text-xs text-red-400 p-2">{error}</div>}
        {!loading && notebooks.length === 0 && !error && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">No notebooks found</div>
        )}
        {notebooks.map(nb => {
          const isActive = nb.id === activeId;
          return (
            <button
              key={nb.id}
              onClick={() => !isActive && handleSwitch(nb)}
              className={`w-full text-left p-2.5 rounded border transition-all ${
                isActive
                  ? 'bg-[#6c8aff]/15 border-[#6c8aff]/40 cursor-default'
                  : 'bg-[#232733] border-[#2d3140] hover:border-[#6c8aff] cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${isActive ? 'text-[#6c8aff]' : 'text-[#e1e4ed]'} leading-snug line-clamp-2`}>
                  {nb.name}
                </span>
                {isActive && <span className="ml-auto text-[10px] text-[#6c8aff] flex-shrink-0">● Active</span>}
                {switching === nb.id && <span className="ml-auto text-[10px] text-[#8b90a0] flex-shrink-0">Switching...</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
