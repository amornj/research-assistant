'use client';

import { useState } from 'react';

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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/zotero/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setResults(data);
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

  const handleInsert = (item: ZoteroItem) => {
    const citation = formatCitation(item);
    const html = `<p>${citation}</p>`;
    const fn = (window as any).__insertToEditor;
    if (fn) fn(html);
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
            placeholder="Search references..."
            className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#6c8aff]"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-2 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : 'Search'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error && <div className="text-xs text-red-400 p-2">{error}</div>}
        {results.length === 0 && !loading && !error && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">
            Search your Zotero library
          </div>
        )}
        {results.map(item => (
          <div
            key={item.key}
            className="p-2 rounded bg-[#232733] border border-[#2d3140] hover:border-[#6c8aff] transition-colors group"
          >
            <div className="text-xs font-medium text-[#e1e4ed] line-clamp-2 mb-0.5">
              {item.data.title || 'Untitled'}
            </div>
            <div className="text-xs text-[#8b90a0]">
              {formatAuthors(item.data.creators)}{item.data.date ? ` · ${item.data.date.substring(0, 4)}` : ''}
            </div>
            {item.data.publicationTitle && (
              <div className="text-xs text-[#8b90a0] italic truncate">{item.data.publicationTitle}</div>
            )}
            <button
              onClick={() => handleInsert(item)}
              className="mt-1 text-xs text-[#6c8aff] hover:text-[#5a78f0] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ↓ Insert citation
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
