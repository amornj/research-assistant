'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Props {
  onClose: () => void;
}

interface Notebook {
  id: string;
  title: string;
}

export default function NewProjectModal({ onClose }: Props) {
  const { createProject, projects } = useStore();
  const [name, setName] = useState('');
  const [notebookId, setNotebookId] = useState('');
  const [notebookName, setNotebookName] = useState('');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  useEffect(() => {
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setNotebooks(data);
        else if (data.notebooks) setNotebooks(data.notebooks);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject({
      name: name.trim(),
      notebookId: notebookId || null,
      notebookName: notebookName || notebookId || '',
    });
    onClose();
  };

  const canClose = projects.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[#8b90a0] mb-1">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Research Paper"
              autoFocus
              className="w-full bg-[#232733] border border-[#2d3140] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#6c8aff]"
            />
          </div>
          <div>
            <label className="block text-sm text-[#8b90a0] mb-1">NotebookLM Notebook</label>
            {notebooks.length > 0 ? (
              <select
                value={notebookId}
                onChange={e => {
                  const nb = notebooks.find(n => n.id === e.target.value);
                  setNotebookId(e.target.value);
                  setNotebookName(nb?.title || '');
                }}
                className="w-full bg-[#232733] border border-[#2d3140] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#6c8aff]"
              >
                <option value="">None</option>
                {notebooks.map(nb => (
                  <option key={nb.id} value={nb.id}>{nb.title}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={notebookName}
                onChange={e => setNotebookName(e.target.value)}
                placeholder="Notebook name (optional)"
                className="w-full bg-[#232733] border border-[#2d3140] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#6c8aff]"
              />
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#232733] hover:bg-[#2d3140] rounded text-sm transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-[#6c8aff] hover:bg-[#5a78f0] disabled:opacity-50 text-white rounded text-sm transition-colors"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
