'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playCompletionSound } from '@/lib/sounds';

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

export default function SourcesTab() {
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
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
    fetch('/api/sources/zotero/collections')
      .then(r => r.json())
      .then((d: { ok: boolean; collections?: Collection[] }) => {
        if (d.ok && d.collections) setCollections(d.collections);
      })
      .catch(() => {});
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then((d: Array<Record<string, string>>) => {
        if (Array.isArray(d)) setNotebooks(d.map(item => ({
          id: item.id || item.notebook_id || '',
          name: item.name || item.title || 'Untitled',
        })));
      })
      .catch(() => {});
  }, []);

  const effectiveCollection = newCollectionName.trim() || selectedCollection;
  const isProcessing = processing && Object.values(processing.tasks).some(t => t.state === 'running');

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
      fetch('/api/notebooks/list')
        .then(r => r.json())
        .then((d: Array<Record<string, string>>) => {
          if (Array.isArray(d)) setNotebooks(d.map(item => ({
            id: item.id || item.notebook_id || '',
            name: item.name || item.title || 'Untitled',
          })));
        })
        .catch(() => {});
      setSelectedNotebookId(data.notebookId);
      setNewNotebookName('');
      return data.notebookId;
    } finally {
      setCreatingNotebook(false);
    }
  };

  // Stage file on drop/select — don't process immediately
  const stageFile = useCallback((file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please drop a PDF file.');
      return;
    }
    setStagedFile(file);
    setProcessing(null);
  }, []);

  // Run the pipeline on staged file
  const runPipeline = useCallback(async () => {
    if (!stagedFile) return;
    const file = stagedFile;

    // Confirm creation of new collection/notebook
    const willCreateCollection = newCollectionName.trim() && !collections.some(c => c.name.toLowerCase() === newCollectionName.trim().toLowerCase());
    const willCreateNotebook = newNotebookName.trim() && !notebooks.some(n => n.name.toLowerCase() === newNotebookName.trim().toLowerCase());

    if (willCreateCollection || willCreateNotebook) {
      const parts: string[] = [];
      if (willCreateCollection) parts.push(`• New Zotero collection: "${newCollectionName.trim()}"`);
      if (willCreateNotebook) parts.push(`• New NotebookLM notebook: "${newNotebookName.trim()}"`);
      if (!window.confirm(`This will create:\n\n${parts.join('\n')}\n\nContinue?`)) return;
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

    const title = file.name.replace(/\.pdf$/i, '');
    let summarizePath: string | undefined;

    await Promise.allSettled([
      // 1. Readwise — send file directly
      (async () => {
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, readwise: { state: 'running' } } } : p);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/sources/readwise', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error || 'Readwise failed');
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, readwise: { state: 'done' } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, readwise: { state: 'error', detail: String(err).slice(0, 200) } } } : p)
      ),

      // 2. Summarize — send file directly, backend extracts text with pdftotext
      (async () => {
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'running' } } } : p);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/sources/summarize', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; path?: string; filename?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'Summarize failed');
        summarizePath = data.path;
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'done', detail: data.filename } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, summarize: { state: 'error', detail: String(err).slice(0, 200) } } } : p)
      ),

      // 3. Zotero — just needs title + collection
      (async () => {
        if (!effectiveCollection) {
          setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'done', detail: 'Skipped — no collection' } } } : p);
          return;
        }
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'running' } } } : p);
        const res = await fetch('/api/sources/zotero', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, text: '', collection: effectiveCollection }),
        });
        const data = await res.json() as { ok: boolean; itemKey?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'Zotero failed');
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'done', detail: `Item: ${data.itemKey}` } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, zotero: { state: 'error', detail: String(err).slice(0, 200) } } } : p)
      ),

      // 4. NotebookLM — send file directly
      (async () => {
        let nbId = selectedNotebookId;
        if (!nbId && newNotebookName.trim()) {
          nbId = await createAndSelectNotebook();
        }
        if (!nbId) {
          setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'done', detail: 'Skipped — no notebook' } } } : p);
          return;
        }
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'running' } } } : p);
        const form = new FormData();
        form.append('file', file);
        form.append('notebookId', nbId);
        const res = await fetch('/api/sources/notebooklm', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; details?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'NotebookLM failed');
        setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'done', detail: data.details?.slice(0, 100) } } } : p);
      })().catch(
        (err) => setProcessing(p => p ? { ...p, tasks: { ...p.tasks, notebooklm: { state: 'error', detail: String(err).slice(0, 200) } } } : p)
      ),
    ]);

    // Save to history + play sound
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
        obsidianPath: summarizePath,
      };
      const h = [entry, ...loadHistory()];
      saveHistory(h);
      setHistory(h);

      const anySuccess = Object.values(entry.results).some(Boolean);
      if (anySuccess) playCompletionSound();

      return current;
    });
  }, [stagedFile, effectiveCollection, selectedNotebookId, newNotebookName, collections, notebooks]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) stageFile(file);
  }, [stageFile]);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

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
          <div className="text-[10px] text-[#8b90a0] truncate mt-0.5">{status.detail}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-3 text-sm text-[#e1e4ed]">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !stagedFile && fileInputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging
            ? 'border-[#6c8aff] bg-[#6c8aff]/10 text-[#6c8aff]'
            : stagedFile
            ? 'border-[#6c8aff]/50 bg-[#6c8aff]/5 text-[#e1e4ed]'
            : 'border-[#2d3140] text-[#8b90a0] hover:border-[#6c8aff] hover:text-[#6c8aff] cursor-pointer'
        }`}
      >
        {stagedFile ? (
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <div className="flex-1 text-left min-w-0">
              <div className="font-medium text-xs truncate">{stagedFile.name}</div>
              <div className="text-[10px] text-[#8b90a0]">{(stagedFile.size / 1024).toFixed(0)} KB</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setStagedFile(null); setProcessing(null); }}
              className="text-[#8b90a0] hover:text-red-400 text-xs px-1"
              title="Remove"
            >✕</button>
          </div>
        ) : (
          <>
            <div className="text-xl mb-0.5">📄</div>
            <div className="font-medium text-xs">Drop PDF here</div>
            <div className="text-[10px] mt-0.5">or click to browse</div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) stageFile(f); e.target.value = ''; }}
      />

      {/* Collection selector */}
      <div>
        <label className="text-[10px] text-[#8b90a0] block mb-1">Zotero Collection <span className="text-[#555a6e]">(optional)</span></label>
        {collections.length > 0 && (
          <select
            value={selectedCollection}
            onChange={e => { setSelectedCollection(e.target.value); setNewCollectionName(''); }}
            className="w-full bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]"
          >
            <option value="">— Select or type new —</option>
            {collections.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
          </select>
        )}
        <input
          type="text"
          placeholder="Or type new collection name…"
          value={newCollectionName}
          onChange={e => { setNewCollectionName(e.target.value); setSelectedCollection(''); }}
          className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]"
        />
      </div>

      {/* Notebook selector */}
      <div>
        <label className="text-[10px] text-[#8b90a0] block mb-1">NotebookLM Notebook <span className="text-[#555a6e]">(optional)</span></label>
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
          placeholder="Or type name to create new…"
          value={newNotebookName}
          onChange={e => { setNewNotebookName(e.target.value); setSelectedNotebookId(''); }}
          className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]"
        />
        {creatingNotebook && <div className="text-[10px] text-[#8b90a0] mt-0.5">Creating notebook...</div>}
      </div>

      {/* Run button */}
      <button
        onClick={runPipeline}
        disabled={!stagedFile || !!isProcessing}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
          stagedFile && !isProcessing
            ? 'bg-[#6c8aff] hover:bg-[#5a78f0] text-white cursor-pointer'
            : 'bg-[#232733] text-[#555a6e] cursor-not-allowed'
        }`}
      >
        {isProcessing ? '⟳ Processing…' : stagedFile ? `▶ Process "${stagedFile.name.slice(0, 30)}"` : 'Drop a PDF to start'}
      </button>

      {/* Processing status */}
      {processing && (
        <div className="rounded-lg bg-[#1a1d27] border border-[#2d3140] p-3">
          <div className="text-xs font-medium text-[#e1e4ed] mb-2 truncate">
            {processing.name}
          </div>
          {(Object.keys(processing.tasks) as Array<keyof ProcessingFile['tasks']>).map(name => (
            <TaskRow key={name} name={name} status={processing.tasks[name]} />
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="text-[10px] text-[#8b90a0] font-medium mb-1.5 flex items-center justify-between">
            <span>Recent</span>
            <button
              onClick={() => { saveHistory([]); setHistory([]); }}
              className="text-[#8b90a0] hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {history.map((entry, i) => (
              <div key={i} className="rounded bg-[#1a1d27] border border-[#2d3140] px-2.5 py-1.5">
                <div className="text-[11px] font-medium truncate text-[#e1e4ed]">{entry.filename}</div>
                <div className="flex gap-2 mt-1 text-[10px]">
                  <span className={entry.results.readwise ? 'text-green-400' : 'text-red-400'}>Reader</span>
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
