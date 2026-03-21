'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playCompletionSound } from '@/lib/sounds';

interface Collection { key: string; name: string; }
interface Notebook { id: string; name: string; }

interface TaskStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  detail?: string;
}

interface ProcessingState {
  name: string;
  pdfUp: TaskStatus;
  zotero: TaskStatus;
}

interface HistoryEntry {
  filename: string;
  date: string;
  results: { pdfUp: boolean; zotero: boolean };
}

const HISTORY_KEY = 'ra_sources_history';

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
}

export default function SourcesTab() {
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedNotebookId, setSelectedNotebookId] = useState('');
  const [newNotebookName, setNewNotebookName] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
    fetch('/api/sources/zotero/collections')
      .then(r => r.json())
      .then((d: { ok: boolean; collections?: Collection[] }) => {
        if (d.ok && d.collections) setCollections(d.collections);
      }).catch(() => {});
    fetch('/api/notebooks/list')
      .then(r => r.json())
      .then((d: Array<Record<string, string>>) => {
        if (Array.isArray(d)) setNotebooks(d.map(item => ({
          id: item.id || item.notebook_id || '',
          name: item.name || item.title || 'Untitled',
        })));
      }).catch(() => {});
  }, []);

  const effectiveCollection = newCollectionName.trim() || selectedCollection;
  const isProcessing = processing && (processing.pdfUp.state === 'running' || processing.zotero.state === 'running');

  const stageFile = useCallback((file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please drop a PDF file.');
      return;
    }
    setStagedFile(file);
    setProcessing(null);
  }, []);

  const runPipeline = useCallback(async () => {
    if (!stagedFile) return;
    const file = stagedFile;

    // Confirm new collection/notebook creation
    const willCreateCollection = newCollectionName.trim() && !collections.some(c => c.name.toLowerCase() === newCollectionName.trim().toLowerCase());
    const willCreateNotebook = newNotebookName.trim() && !notebooks.some(n => n.name.toLowerCase() === newNotebookName.trim().toLowerCase());
    if (willCreateCollection || willCreateNotebook) {
      const parts: string[] = [];
      if (willCreateCollection) parts.push(`• New Zotero collection: "${newCollectionName.trim()}"`);
      if (willCreateNotebook) parts.push(`• New NotebookLM notebook: "${newNotebookName.trim()}"`);
      if (!window.confirm(`This will create:\n\n${parts.join('\n')}\n\nContinue?`)) return;
    }

    setProcessing({
      name: file.name,
      pdfUp: { state: 'running', detail: 'Saving PDF & running pdf-up (Reader + Obsidian + NLM)...' },
      zotero: effectiveCollection ? { state: 'idle' } : { state: 'done', detail: 'Skipped — no collection' },
    });

    const title = file.name.replace(/\.pdf$/i, '');

    // Run pdf-up and Zotero in parallel
    const results = { pdfUp: false, zotero: false };

    await Promise.allSettled([
      // pdf-up: handles Reader + Obsidian + NotebookLM
      (async () => {
        const form = new FormData();
        form.append('file', file);
        if (effectiveCollection) form.append('collection', effectiveCollection);

        // Resolve notebook ID
        let nbId = selectedNotebookId;
        if (!nbId && newNotebookName.trim()) {
          // Create notebook first
          const createRes = await fetch('/api/sources/notebooklm/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newNotebookName.trim() }),
          });
          const createData = await createRes.json() as { ok: boolean; notebookId?: string; error?: string };
          if (createData.ok && createData.notebookId) {
            nbId = createData.notebookId;
          }
        }
        if (nbId) form.append('notebookId', nbId);

        const res = await fetch('/api/sources/process', { method: 'POST', body: form });
        const data = await res.json() as { ok: boolean; output?: string; error?: string };

        if (data.ok) {
          results.pdfUp = true;
          setProcessing(p => p ? { ...p, pdfUp: { state: 'done', detail: 'Reader ✓ Obsidian ✓ NLM ✓' } } : p);
        } else {
          // Parse partial results from output
          const out = data.output || data.error || 'Failed';
          const readerOk = out.includes('[OK] readwise');
          const obsidianOk = out.includes('[OK] obsidian');
          const nlmOk = out.includes('[OK] notebooklm');
          const parts = [
            readerOk ? 'Reader ✓' : 'Reader ✗',
            obsidianOk ? 'Obsidian ✓' : 'Obsidian ✗',
            nlmOk ? 'NLM ✓' : 'NLM ✗',
          ];
          results.pdfUp = readerOk || obsidianOk || nlmOk;
          setProcessing(p => p ? { ...p, pdfUp: {
            state: results.pdfUp ? 'done' : 'error',
            detail: parts.join(' | ')
          }} : p);
        }
      })().catch(err => {
        setProcessing(p => p ? { ...p, pdfUp: { state: 'error', detail: String(err).slice(0, 200) } } : p);
      }),

      // Zotero: direct API call (already works)
      (async () => {
        if (!effectiveCollection) return;
        setProcessing(p => p ? { ...p, zotero: { state: 'running' } } : p);
        const res = await fetch('/api/sources/zotero', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, text: '', collection: effectiveCollection }),
        });
        const data = await res.json() as { ok: boolean; itemKey?: string; error?: string };
        if (!data.ok) throw new Error(data.error || 'Zotero failed');
        results.zotero = true;
        setProcessing(p => p ? { ...p, zotero: { state: 'done', detail: `Item: ${data.itemKey}` } } : p);
      })().catch(err => {
        setProcessing(p => p ? { ...p, zotero: { state: 'error', detail: String(err).slice(0, 200) } } : p);
      }),
    ]);

    // History + sound
    const entry: HistoryEntry = { filename: file.name, date: new Date().toISOString(), results };
    const h = [entry, ...loadHistory()];
    saveHistory(h);
    setHistory(h);
    if (results.pdfUp || results.zotero) playCompletionSound();

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

  const StatusIcon = ({ state }: { state: TaskStatus['state'] }) => (
    <span className="w-4 flex-shrink-0">
      {state === 'idle' && <span className="text-[#8b90a0]">○</span>}
      {state === 'running' && <span className="animate-spin inline-block text-[#6c8aff]">⟳</span>}
      {state === 'done' && <span className="text-green-400">✓</span>}
      {state === 'error' && <span className="text-red-400">✗</span>}
    </span>
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
          isDragging ? 'border-[#6c8aff] bg-[#6c8aff]/10 text-[#6c8aff]'
            : stagedFile ? 'border-[#6c8aff]/50 bg-[#6c8aff]/5 text-[#e1e4ed]'
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
            <button onClick={(e) => { e.stopPropagation(); setStagedFile(null); setProcessing(null); }}
              className="text-[#8b90a0] hover:text-red-400 text-xs px-1">✕</button>
          </div>
        ) : (
          <>
            <div className="text-xl mb-0.5">📄</div>
            <div className="font-medium text-xs">Drop PDF here</div>
            <div className="text-[10px] mt-0.5">or click to browse</div>
          </>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) stageFile(f); e.target.value = ''; }} />

      {/* Zotero Collection */}
      <div>
        <label className="text-[10px] text-[#8b90a0] block mb-1">Zotero Collection <span className="text-[#555a6e]">(optional)</span></label>
        {collections.length > 0 && (
          <select value={selectedCollection}
            onChange={e => { setSelectedCollection(e.target.value); setNewCollectionName(''); }}
            className="w-full bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]">
            <option value="">— Select or type new —</option>
            {collections.map(c => <option key={c.key} value={c.name}>{c.name}</option>)}
          </select>
        )}
        <input type="text" placeholder="Or type new collection name…" value={newCollectionName}
          onChange={e => { setNewCollectionName(e.target.value); setSelectedCollection(''); }}
          className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]" />
      </div>

      {/* NLM Notebook */}
      <div>
        <label className="text-[10px] text-[#8b90a0] block mb-1">NotebookLM Notebook <span className="text-[#555a6e]">(optional)</span></label>
        {notebooks.length > 0 && (
          <select value={selectedNotebookId}
            onChange={e => { setSelectedNotebookId(e.target.value); setNewNotebookName(''); }}
            className="w-full bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]">
            <option value="">— Select existing —</option>
            {notebooks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        <input type="text" placeholder="Or type name to create new…" value={newNotebookName}
          onChange={e => { setNewNotebookName(e.target.value); setSelectedNotebookId(''); }}
          className="w-full mt-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] placeholder-[#8b90a0] focus:outline-none focus:border-[#6c8aff]" />
      </div>

      {/* Run button */}
      <button onClick={runPipeline} disabled={!stagedFile || !!isProcessing}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
          stagedFile && !isProcessing
            ? 'bg-[#6c8aff] hover:bg-[#5a78f0] text-white cursor-pointer'
            : 'bg-[#232733] text-[#555a6e] cursor-not-allowed'
        }`}>
        {isProcessing ? '⟳ Processing…' : stagedFile ? `▶ Process "${stagedFile.name.slice(0, 30)}"` : 'Drop a PDF to start'}
      </button>

      {/* Status */}
      {processing && (
        <div className="rounded-lg bg-[#1a1d27] border border-[#2d3140] p-3 space-y-2">
          <div className="text-xs font-medium text-[#e1e4ed] truncate">{processing.name}</div>
          <div className="flex items-start gap-2 text-xs">
            <StatusIcon state={processing.pdfUp.state} />
            <div className="flex-1 min-w-0">
              <span className={processing.pdfUp.state === 'error' ? 'text-red-400' : processing.pdfUp.state === 'done' ? 'text-[#e1e4ed]' : 'text-[#8b90a0]'}>
                📦 pdf-up (Reader + Obsidian + NLM)
              </span>
              {processing.pdfUp.detail && <div className="text-[10px] text-[#8b90a0] mt-0.5">{processing.pdfUp.detail}</div>}
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <StatusIcon state={processing.zotero.state} />
            <div className="flex-1 min-w-0">
              <span className={processing.zotero.state === 'error' ? 'text-red-400' : processing.zotero.state === 'done' ? 'text-[#e1e4ed]' : 'text-[#8b90a0]'}>
                📚 Zotero
              </span>
              {processing.zotero.detail && <div className="text-[10px] text-[#8b90a0] mt-0.5">{processing.zotero.detail}</div>}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="text-[10px] text-[#8b90a0] font-medium mb-1.5 flex items-center justify-between">
            <span>Recent</span>
            <button onClick={() => { saveHistory([]); setHistory([]); }}
              className="text-[#8b90a0] hover:text-red-400 transition-colors">Clear</button>
          </div>
          <div className="flex flex-col gap-1">
            {history.map((entry, i) => (
              <div key={i} className="rounded bg-[#1a1d27] border border-[#2d3140] px-2.5 py-1.5">
                <div className="text-[11px] font-medium truncate text-[#e1e4ed]">{entry.filename}</div>
                <div className="flex gap-2 mt-1 text-[10px]">
                  <span className={entry.results.pdfUp ? 'text-green-400' : 'text-red-400'}>pdf-up</span>
                  <span className={entry.results.zotero ? 'text-green-400' : 'text-red-400'}>Zotero</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
