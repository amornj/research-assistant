'use client';

import { useState } from 'react';
import { useStore, getOrderedCitationMap } from '@/store/useStore';
import { Citation } from '@/types';

interface TopBarProps {
  onNewProject: () => void;
}

function htmlToText(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function formatCitationEntry(citation: Citation): string {
  const { data } = citation;
  const authors = (data.creators || [])
    .map(c => c.lastName || c.name || c.firstName || '')
    .filter(Boolean)
    .join(', ');
  const year = data.date ? data.date.substring(0, 4) : '';
  const title = data.title || 'Untitled';
  const journal = data.publicationTitle || '';
  const vol = data.volume ? `${data.volume}` : '';
  const pages = data.pages ? `${data.pages}` : '';
  const doi = data.DOI ? `DOI: ${data.DOI}` : '';

  let entry = `${authors}${year ? ` (${year})` : ''}. ${title}.`;
  if (journal) entry += ` ${journal}`;
  if (vol) entry += `, ${vol}`;
  if (pages) entry += `, ${pages}`;
  entry += '.';
  if (doi) entry += ` ${doi}`;
  return entry;
}

function formatCitationEntryHTML(citation: Citation): string {
  const { data } = citation;
  const authors = (data.creators || [])
    .map(c => c.lastName || c.name || c.firstName || '')
    .filter(Boolean)
    .join(', ');
  const year = data.date ? data.date.substring(0, 4) : '';
  const title = data.title || 'Untitled';
  const journal = data.publicationTitle || '';
  const vol = data.volume ? `${data.volume}` : '';
  const pages = data.pages ? `${data.pages}` : '';
  const doi = data.DOI
    ? `<a href="https://doi.org/${data.DOI}" style="color:#6c8aff">DOI: ${data.DOI}</a>`
    : '';

  let entry = `<li>${authors}${year ? ` (${year})` : ''}. <em>${title}</em>.`;
  if (journal) entry += ` ${journal}`;
  if (vol) entry += `, ${vol}`;
  if (pages) entry += `, ${pages}`;
  entry += '.';
  if (doi) entry += ` ${doi}`;
  entry += '</li>';
  return entry;
}

export default function TopBar({ onNewProject }: TopBarProps) {
  const { projects, currentProjectId, selectProject } = useStore();
  const [showExport, setShowExport] = useState(false);

  const handleExportMarkdown = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    let md = `# ${currentProject.name}\n\n`;
    for (const block of currentProject.blocks) {
      const html = block.versions[block.activeVersion]?.html || '';
      const text = htmlToText(html);
      const cids = block.citationIds || [];
      if (cids.length > 0) {
        const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
        if (nums.length > 0) {
          md += text.trimEnd() + ` [${nums.join(',')}]\n\n`;
        } else {
          md += text + '\n\n';
        }
      } else {
        md += text + '\n\n';
      }
    }

    // References section
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '## References\n\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) {
          md += `${num}. ${formatCitationEntry(citation)}\n\n`;
        }
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const handleExportHTML = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    let body = '';
    for (const block of currentProject.blocks) {
      const blockHtml = block.versions[block.activeVersion]?.html || '';
      const cids = block.citationIds || [];
      if (cids.length > 0) {
        const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
        if (nums.length > 0) {
          const badges = nums.map(n => `<sup style="background:#6c8aff22;color:#6c8aff;padding:0 3px;border-radius:3px;font-size:10px">[${n}]</sup>`).join('');
          body += blockHtml + badges;
        } else {
          body += blockHtml;
        }
      } else {
        body += blockHtml;
      }
    }

    // References section
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      body += '<hr style="margin:2em 0;border-color:#2d3140"><h2>References</h2><ol style="padding-left:1.5em">';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) {
          body += formatCitationEntryHTML(citation);
        }
      }
      body += '</ol>';
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${currentProject.name}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:2em auto;padding:0 1em;color:#1a1a1a;line-height:1.6}h1,h2,h3{margin-top:1.5em}</style></head><body><h1>${currentProject.name}</h1>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1d27] border-b border-[#2d3140] h-10 flex-shrink-0">
      <span className="text-[#6c8aff] font-semibold text-sm mr-2">Research Assistant</span>
      <select
        value={currentProjectId || ''}
        onChange={e => selectProject(e.target.value)}
        className="flex-1 max-w-xs bg-[#232733] border border-[#2d3140] text-[#e1e4ed] text-sm rounded px-2 py-1 focus:outline-none focus:border-[#6c8aff]"
      >
        {projects.length === 0 && <option value="">No projects</option>}
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={onNewProject}
        className="px-3 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-sm rounded transition-colors"
      >
        + New
      </button>
      <div className="relative ml-auto">
        <button
          onClick={() => setShowExport(!showExport)}
          className="px-3 py-1 bg-[#232733] hover:bg-[#2d3140] text-[#e1e4ed] text-sm rounded border border-[#2d3140] transition-colors"
        >
          Export ▾
        </button>
        {showExport && (
          <div className="absolute right-0 top-full mt-1 bg-[#1a1d27] border border-[#2d3140] rounded shadow-lg z-50 min-w-[140px]">
            <button
              onClick={handleExportMarkdown}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              Export as Markdown
            </button>
            <button
              onClick={handleExportHTML}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              Export as HTML
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
