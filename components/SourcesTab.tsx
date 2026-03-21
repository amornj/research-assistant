'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Collection { key: string; name: string; }
interface Notebook { id: string; name: string; }

interface TaskStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  detail?: string;
}

interface ProcessingFile {
  name: string;
  tasks: {
    readwise: TaskStatus;
    summarize: TaskStatus;
    zotero: TaskStatus;
    notebooklm: TaskStatus;
  };
}

interface HistoryEntry {
  filename: string;
  date: string;
  results: { readwise: boolean; summarize: boolean; zotero: boolean; notebooklm: boolean };
  obsidianPath?: string;
}

const HISTORY_KEY = 'ra_sources_history';

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
}

// Extract text from PDF using pdf-parse via the existing extract endpoint
async function extractPdfText(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/pdf/extract', { method: 'POST', body: form });
  if (!res.ok) return '';
  const data = await res.json() as { text?: string; summary?: string };
  return data.text || data.summary || '';
}

export default function SourcesTab() {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState<ProcessingFile | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedNotebookId, setSelectedNotebookId] = useState('');
  const [newNotebookName, setNewNotebookName] = useState('');
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
    // Fetch collections and notebooks in parallel
    fetch('/api/sources/zotero/collections')
      .then(r => r.json())
      .then((d: { ok: boolean; collections?: Collection[] }) => {
        if (d.ok && d.collections) setCollections(d.collections);
      })
      .catch(() => {});
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then((d: Array<{ id: string; name: string }>) => {
        if (Array.isArray(d)) setNotebooks(d);
      })
      .catch(() => {});
  }, []);

  const effectiveCollection = newCollectionName.trim() || selectedCollection;

  const runTask = async <T,>(
    name: keyof ProcessingFile['tasks'],
    fn: () => Promise<T>,
    setProc: React.Dispatch<React.SetStateAction<ProcessingFile | null>>
  ): Promise<T | null> => {
    setProc(p => p ? { ...p, tasks: { ...p.tasks, [name]: { state: 'running' } } } : p);
    try {
      const result = await fn();
      setProc(p => p ? { ...p, tasks: { ...p.tasks, [name]: { state: 'done' } } } : p);
      return result;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setProc(p => p ? { ...p, tasks: { ...p.tasks, [name]: { state: 'error', detail } } } : p);
      return null;
    }
  };

  const createAndSelectNotebook = async (): Promise<string> => {
    const name = newNotebookName.trim();
    if (!name) throw new Error('No notebook name');
    setCreatingNotebook(true);
    try {
      const res = await fetch('/api/sources/notebooklm/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json() as { ok: boolean; notebookId?: string; error?: string };
      if (!data.ok || !data.notebookId) throw new Error(data.error || 'Failed to create notebook');
      // Refresh notebook list
      fetch('/api/notebooks/list')
        .then(r => r.json())
        .then((d: Array<{ id: string; name: string }>) => { if (Array.isArray(d)) setNotebooks(d); })
        .catch(() => {});
      setSelectedNotebookId(data.notebookId);
      setNewNotebookName('');
      return data.notebookId;
    } finally {
      setCreatingNotebook(false);
    }
  };

  const processFile = useCallback(async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please drop a PDF file.');
      return;
    }

    // Confirm creation of new collection/notebook before proceeding
    const willCreateCollection = newCollectionName.trim() && !collections.some(c => c.name.toLowerCase() === newCollectionName.trim().toLowerCase());
    const willCreateNotebook = newNotebookName.trim() && !notebooks.some(n => n.name.toLowerCase() === newNotebookName.trim().toLowerCase());

    if (willCreateCollection || willCreateNotebook) {
      const parts: string[] = [];
      if (willCreateCollection) parts.push(`• New Zotero collection: "${newCollectionName.trim()}"`);
      if (willCreateNotebook) parts.push(`• New NotebookLM notebook: "${newNotebookName.trim()}"`);
      const confirmed = window.confirm(
        `This will create:\n\n${parts.join('\n')}\n\nContinue?`
      );
      if (!confirmed) return;
    }

    const init: ProcessingFile = {
      name: file.name,
      tasks: {
        readwise: { state: 'idle' },
        summarize: { state: 'idle' },
        zotero: { state: 'idle' },
        notebooklm: { state: 'idle' },
      },
    };
    setProcessing(init);

    // Extract text first (needed for summarize + zotero)
    const title = file.name.replace(/\.pdf$/i, '');
    let text = '';
    try {
      text = await extractPdfText(file);
    } catch { /* text stays empty */ }

    // Run all 4 tasks in parallel
    type TaskResult = {
      readwise: null;
      summarize: { path?: string } | null;
      zotero: null;
      notebooklm: null;
    };
    const results: TaskResult = { readwise: null, summarize: null, zotero: null, notebooklm: null };

    await Promise.allSettled([
      (async () => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/sources/readwise', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error || 'Readwise failed');
        results.readwise = null;
      })().then(
        () => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, readwise: { state: 'done' } } } : p),
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, readwise: { state: 'error', detail: String(err) } } } : p)
      ),

      (async () => {
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'running' } } } : p);
        const res = await fetch('/api/sources/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, text, filename: file.name }),
        });
        const data = await res.json() as { ok: boolean; path?: string; filename?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'Summarize failed');
        results.summarize = { path: data.path };
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'done', detail: data.filename } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'error', detail: String(err) } } } : p)
      ),

      (async () => {
        if (!effectiveCollection) {
          setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'done', detail: 'Skipped — no collection selected' } } } : p);
          return;
        }
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'running' } } } : p);
        const res = await fetch('/api/sources/zotero', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, text: text.slice(0, 500), collection: effectiveCollection }),
        });
        const data = await res.json() as { ok: boolean; itemKey?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'Zotero failed');
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'done', detail: data.itemKey } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'error', detail: String(err) } } } : p)
      ),

      (async () => {
        let nbId = selectedNotebookId;
        if (!nbId && newNotebookName.trim()) {
          nbId = await createAndSelectNotebook();
        }
        if (!nbId) {
          setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'done', detail: 'Skipped — no notebook selected' } } } : p);
          return;
        }
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'running' } } } : p);
        const form = new FormData();
        form.append('file', file);
        form.append('notebookId', nbId);
        const res = await fetch('/api/sources/notebooklm', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; details?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'NotebookLM failed');
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'done', detail: data.details } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'error', detail: String(err) } } } : p)
      ),
    ]);

    // Save to history
    setProcessing(current => {
      const entry: HistoryEntry = {
        filename: file.name,
        date: new Date().toISOString(),
        results: {
          readwise: current?.tasks.readwise.state === 'done',
          summarize: current?.tasks.summarize.state === 'done',
          zotero: current?.tasks.zotero.state === 'done',
          notebooklm: current?.tasks.notebooklm.state === 'done',
        },
        obsidianPath: results.summarize?.path,
      };
      const h = [entry, ...loadHistory()];
      saveHistory(h);
      setHistory(h);
      return current;
    });
  }, [effectiveCollection, selectedNotebookId, newNotebookName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const taskLabel: Record<keyof ProcessingFile['tasks'], string> = {
    readwise: '📖 Readwise Reader',
    summarize: '📝 Obsidian Summary',
    zotero: '📚 Zotero',
    notebooklm: '🔬 NotebookLM',
  };

  const TaskRow = ({ name, status }: { name: keyof ProcessingFile['tasks']; status: TaskStatus }) => (
    <div className="flex items-start gap-2 py-1.5 text-xs border-b border-[#2d3140] last:border-0">
      <span className="w-4 flex-shrink-0 mt-0.5">
        {status.state === 'idle' && <span className="text-[#8b90a0]">○</span>}
        {status.state === 'running' && <span className="animate-spin inline-block text-[#6c8aff]">⟳</span>}
        {status.state === 'done' && <span className="text-green-400">✓</span>}
        {status.state === 'error' && <span className="text-red-400">✗</span>}
      </span>
      <div className="flex-1 min-w-0">
        <span className={status.state === 'error' ? 'text-red-400' : status.state === 'done' ? 'text-[#e1e4ed]' : 'text-[#8b90a0]'}>
          {taskLabel[name]}
        </span>
        {status.detail && (
          <div className="text-[#8b90a0] truncate mt-0.5">{status.detail}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-3 text-sm text-[#e1e4ed]">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-[#6c8aff] bg-[#6c8aff]/10 text-[#6c8aff]'
            : 'border-[#2d3140] text-[#8b90a0] hover:border-[#6c8aff] hover:text-[#6c8aff]'
        }`}
      >
        <div className="text-2xl mb-1">📄</div>
        <div className="font-medium">Drop PDF here</div>
        <div className="text-xs mt-1">or click to browse</div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
      />

      {/* Collection + Notebook selectors */}
      <div className="flex flex-col gap-2">
        <div>
          <label className="text-xs text-[#8b90a0] block mb-1">Zotero Collection <span className="text-[#555a6e]">(optional)</span></label>
          {collections.length > 0 ? (
            <select
              value={selectedCollection}
              onChange={e => { setSelectedCollection(e.target.value); setNewCollectionName(''); }}
              className="w-full bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]"
            >
              <option value="">— Select or type new —</option>
              {collections.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
            </select>
          ) : null}
          <input
            type="text"
            placeholder={collections.length > 0 ? 'Or type new collection name…' : 'Collection name…'}
            value={newCollectionName}
            onChange={e => { setNewCollectionName(e.target.value); setSelectedCollection(''); }}
            className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]"
          />
        </div>
        <div>
          <label className="text-xs text-[#8b90a0] block mb-1">NotebookLM Notebook <span className="text-[#555a6e]">(optional)</span></label>
          {notebooks.length > 0 && (
            <select
              value={selectedNotebookId}
              onChange={e => { setSelectedNotebookId(e.target.value); setNewNotebookName(''); }}
              className="w-full bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]"
            >
              <option value="">— Select existing —</option>
              {notebooks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          )}
          <input
            type="text"
            placeholder={notebooks.length > 0 ? 'Or type name to create new…' : 'Notebook name to create…'}
            value={newNotebookName}
            onChange={e => { setNewNotebookName(e.target.value); setSelectedNotebookId(''); }}
            className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]"
          />
          {creatingNotebook && <div className="text-[10px] text-[#8b90a0] mt-0.5">Creating notebook...</div>}
        </div>
      </div>

      {/* Processing status */}
      {processing && (
        <div className="rounded-lg bg-[#1a1d27] border border-[#2d3140] p-3">
          <div className="text-xs font-medium text-[#e1e4ed] mb-2 truncate">
            Processing: {processing.name}
          </div>
          {(Object.keys(processing.tasks) as Array<keyof ProcessingFile['tasks']>).map(name => (
            <TaskRow key={name} name={name} status={processing.tasks[name]} />
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="text-xs text-[#8b90a0] font-medium mb-2 flex items-center justify-between">
            <span>Recent</span>
            <button
              onClick={() => { saveHistory([]); setHistory([]); }}
              className="text-[#8b90a0] hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {history.map((entry, i) => (
              <div key={i} className="rounded bg-[#1a1d27] border border-[#2d3140] px-2.5 py-2">
                <div className="text-xs font-medium truncate text-[#e1e4ed]">{entry.filename}</div>
                <div className="text-[10px] text-[#8b90a0] mt-0.5">
                  {new Date(entry.date).toLocaleString()}
                </div>
                <div className="flex gap-2 mt-1.5 text-[10px]">
                  <span className={entry.results.readwise ? 'text-green-400' : 'text-red-400'}>Readwise</span>
                  <span className={entry.results.summarize ? 'text-green-400' : 'text-red-400'}>Obsidian</span>
                  <span className={entry.results.zotero ? 'text-green-400' : 'text-red-400'}>Zotero</span>
                  <span className={entry.results.notebooklm ? 'text-green-400' : 'text-red-400'}>NLM</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
