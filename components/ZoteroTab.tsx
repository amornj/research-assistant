'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { playCompletionSound } from '@/lib/sounds';

interface ZoteroItem {
  key: string;
  data: {
    title?: string;
    creators?: { firstName?: string; lastName?: string; name?: string }[];
    date?: string;
    itemType?: string;
    abstractNote?: string;
    DOI?: string;
    url?: string;
    publicationTitle?: string;
    volume?: string;
    pages?: string;
  };
}

interface CrossRefData {
  title?: string;
  author?: { given?: string; family?: string }[];
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  volume?: string;
  page?: string;
}

function formatAuthors(creators?: { firstName?: string; lastName?: string; name?: string }[]): string {
  if (!creators || creators.length === 0) return '';
  return creators
    .slice(0, 3)
    .map(c => c.lastName || c.name || c.firstName || '')
    .filter(Boolean)
    .join(', ') + (creators.length > 3 ? ' et al.' : '');
}

function formatCitation(item: ZoteroItem): string {
  const { data } = item;
  const authors = formatAuthors(data.creators);
  const year = data.date ? data.date.substring(0, 4) : '';
  const title = data.title || '';
  const pub = data.publicationTitle || '';
  return `${authors}${year ? ` (${year})` : ''}. ${title}${pub ? `. ${pub}` : ''}.`;
}

export default function ZoteroTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ZoteroItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [crossRefLoading, setCrossRefLoading] = useState<string | null>(null);
  const [crossRefData, setCrossRefData] = useState<Record<string, CrossRefData>>({});
  const [doiStatus, setDoiStatus] = useState<Record<string, boolean | null>>({});
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const { focusedBlockId, addCitationToBlock, updateCitation, currentProject } = useStore();

  // Listen for zotero-search events from BlockEditor paste detection (#18)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.query) {
        setQuery(detail.query);
        setTimeout(() => handleSearchWithQuery(detail.query), 100);
      }
    };
    window.addEventListener('zotero-search', handler);
    return () => window.removeEventListener('zotero-search', handler);
  }, []);

  // Also listen for URL import events (#17)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.item) {
        setResults(prev => [detail.item, ...prev]);
      }
    };
    window.addEventListener('zotero-add-item', handler);
    return () => window.removeEventListener('zotero-add-item', handler);
  }, []);

  const handleSearchWithQuery = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    try {
      const collection = currentProject?.zoteroCollection || '';
      const params = new URLSearchParams({ q });
      if (collection) params.set('collection', collection);
      const res = await fetch(`/api/zotero/search?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setResults(data);
        playCompletionSound();
        // Verify DOIs in background
        verifyDois(data);
      } else if (data.error) {
        setError(data.error);
        setResults([]);
      } else {
        setResults([]);
      }
    } catch (e) {
      setError('Failed to search Zotero');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => handleSearchWithQuery(query);

  // #6 — DOI verification (async, non-blocking)
  const verifyDois = async (items: ZoteroItem[]) => {
    for (const item of items) {
      if (!item.data.DOI) continue;
      const doi = item.data.DOI;
      try {
        const res = await fetch(`/api/doi/verify?doi=${encodeURIComponent(doi)}`);
        const data = await res.json();
        setDoiStatus(prev => ({ ...prev, [doi]: data.valid === true }));
        // Update any matching citation in store
        const project = useStore.getState().currentProject;
        if (project) {
          const citation = project.citations.find(c => c.data.DOI === doi);
          if (citation) {
            useStore.getState().updateCitation(citation.id, { doiVerified: data.valid === true });
          }
        }
      } catch { /* ignore */ }
    }
  };

  // Primary: add as structured citation to focused block
  const handleCite = async (item: ZoteroItem) => {
    if (!focusedBlockId) {
      handleInsertText(item);
      return;
    }
    const result = addCitationToBlock(focusedBlockId, item.key, item.data);

    // #9 — duplicate detection
    if (result.duplicate) {
      setDuplicateWarning(`"${item.data.title || 'This citation'}" is already in your project. Added to this block anyway.`);
      setTimeout(() => setDuplicateWarning(null), 5000);
    }

    // #6 — verify DOI
    if (item.data.DOI) {
      try {
        const res = await fetch(`/api/doi/verify?doi=${encodeURIComponent(item.data.DOI)}`);
        const data = await res.json();
        useStore.getState().updateCitation(result.citationId, { doiVerified: data.valid === true });
        setDoiStatus(prev => ({ ...prev, [item.data.DOI!]: data.valid === true }));
      } catch { /* ignore */ }
    }

    // #8 — Citation context suggester
    if (item.data.abstractNote) {
      const block = useStore.getState().currentProject?.blocks.find(b => b.id === focusedBlockId);
      const blockText = block
        ? (() => { const d = document.createElement('div'); d.innerHTML = block.versions[block.activeVersion]?.html || ''; return d.textContent || ''; })()
        : '';
      if (blockText) {
        try {
          const res = await fetch('/api/ai/general', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `In one sentence, explain how this source supports the claim in the paragraph.\n\nParagraph: "${blockText.substring(0, 500)}"\n\nSource abstract: "${item.data.abstractNote.substring(0, 500)}"`,
              model: 'anthropic/claude-sonnet-4-20250514',
            }),
          });
          const data = await res.json();
          if (data.text && result.citationId) {
            useStore.getState().updateCitation(result.citationId, { annotationNote: data.text });
          }
        } catch { /* ignore */ }
      }
    }
  };

  // Secondary: insert full citation text into editor
  const handleInsertText = (item: ZoteroItem) => {
    const citation = formatCitation(item);
    const html = `<p>${citation}</p>`;
    const fn = (window as any).__insertToEditor;
    if (fn) fn(html);
  };

  // #7 — CrossRef Auto-Fill
  const handleCrossRefFill = async (item: ZoteroItem) => {
    if (!item.data.DOI) return;
    setCrossRefLoading(item.key);
    try {
      const res = await fetch(`/api/crossref/lookup?doi=${encodeURIComponent(item.data.DOI)}`);
      const data = await res.json();
      if (data.data) {
        setCrossRefData(prev => ({ ...prev, [item.key]: data.data }));
      }
    } catch { /* ignore */ }
    finally {
      setCrossRefLoading(null);
    }
  };

  // Apply CrossRef data to a citation being cited
  const getCitationDataWithCrossRef = (item: ZoteroItem) => {
    const cr = crossRefData[item.key];
    if (!cr) return item.data;
    return {
      ...item.data,
      title: item.data.title || cr.title || '',
      publicationTitle: item.data.publicationTitle || (cr['container-title']?.[0]) || '',
      volume: item.data.volume || cr.volume || '',
      pages: item.data.pages || cr.page || '',
      date: item.data.date || (cr.published?.['date-parts']?.[0]?.[0]?.toString()) || '',
      creators: item.data.creators?.length ? item.data.creators :
        (cr.author?.map(a => ({ firstName: a.given || '', lastName: a.family || '' })) || []),
    };
  };

  // #17 — URL Import
  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    try {
      const res = await fetch('/api/url/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (data.item) {
        setResults(prev => [data.item, ...prev]);
        setUrlInput('');
        setShowUrlImport(false);
      } else {
        setError(data.error || 'Failed to extract URL');
      }
    } catch {
      setError('Failed to import URL');
    } finally {
      setUrlLoading(false);
    }
  };

  const doiStatusIcon = (doi: string | undefined) => {
    if (!doi) return null;
    const status = doiStatus[doi];
    if (status === true) return <span className="text-green-400 text-[10px]" title="DOI verified">✓</span>;
    if (status === false) return <span className="text-red-400 text-[10px]" title="DOI not found">✗</span>;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-[#2d3140] flex-shrink-0">
        <div className="flex gap-1">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={currentProject?.zoteroCollection ? `Search in collection...` : 'Search references...'}
            className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#6c8aff]"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-2 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : 'Search'}
          </button>
          <button
            onClick={() => setShowUrlImport(v => !v)}
            className={`px-2 py-1.5 text-xs rounded border transition-colors ${showUrlImport ? 'bg-[#6c8aff]/20 border-[#6c8aff] text-[#6c8aff]' : 'bg-[#232733] border-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed]'}`}
            title="Import from URL"
          >
            🔗
          </button>
        </div>
        {/* #17 — URL import */}
        {showUrlImport && (
          <div className="flex gap-1 mt-1">
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
              placeholder="Paste URL to import metadata..."
              className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#6c8aff]"
            />
            <button
              onClick={handleUrlImport}
              disabled={urlLoading || !urlInput.trim()}
              className="px-2 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors"
            >
              {urlLoading ? '...' : '→'}
            </button>
          </div>
        )}
        {currentProject?.zoteroCollection && (
          <div className="text-[10px] text-[#8b90a0] mt-0.5">Scoped to collection: {currentProject.zoteroCollection}</div>
        )}
        {!focusedBlockId && results.length > 0 && (
          <div className="text-xs text-[#8b90a0] mt-1">Click a block in the editor to focus it, then use 📎 Cite</div>
        )}
      </div>
      {duplicateWarning && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
          ⚠️ {duplicateWarning}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error && <div className="text-xs text-red-400 p-2">{error}</div>}
        {results.length === 0 && !loading && !error && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">
            Search your Zotero library
          </div>
        )}
        {results.map(item => {
          const cr = crossRefData[item.key];
          return (
            <div
              key={item.key}
              className="p-2 rounded bg-[#232733] border border-[#2d3140] hover:border-[#6c8aff] transition-colors group"
            >
              <div className="text-xs font-medium text-[#e1e4ed] line-clamp-2 mb-0.5">
                {item.data.title || 'Untitled'}
              </div>
              <div className="text-xs text-[#8b90a0] flex items-center gap-1">
                {formatAuthors(item.data.creators)}{item.data.date ? ` · ${item.data.date.substring(0, 4)}` : ''}
                {doiStatusIcon(item.data.DOI)}
              </div>
              {(item.data.publicationTitle || cr?.['container-title']?.[0]) && (
                <div className="text-xs text-[#8b90a0] italic truncate">
                  {cr?.['container-title']?.[0] || item.data.publicationTitle}
                  {cr?.volume && `, ${cr.volume}`}
                  {cr?.page && `, ${cr.page}`}
                </div>
              )}
              <div className="mt-1.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                <button
                  onClick={() => handleCite({ ...item, data: getCitationDataWithCrossRef(item) })}
                  className="px-2 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded font-medium transition-colors"
                  title={focusedBlockId ? 'Add citation badge to focused block' : 'Focus a block first'}
                >
                  📎 Cite
                </button>
                <button
                  onClick={() => handleInsertText(item)}
                  className="px-2 py-1 bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] text-xs rounded border border-[#2d3140] transition-colors"
                >
                  ↓ Insert text
                </button>
                {item.data.DOI && (
                  <button
                    onClick={() => handleCrossRefFill(item)}
                    disabled={crossRefLoading === item.key}
                    className="px-2 py-1 bg-[#232733] hover:bg-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed] text-xs rounded border border-[#2d3140] transition-colors disabled:opacity-50"
                    title="Complete missing metadata from CrossRef"
                  >
                    {crossRefLoading === item.key ? '...' : '🔗 CrossRef'}
                  </button>
                )}
              </div>
              {cr && (
                <div className="text-[10px] text-green-400 mt-1">✓ Metadata filled from CrossRef</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
