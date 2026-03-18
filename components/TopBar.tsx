'use client';

import { useState, useEffect } from 'react';
import { useStore, getOrderedCitationMap } from '@/store/useStore';
import { Citation } from '@/types';
import { formatCitationEntry, CitationStyle } from '@/lib/citationFormatter';

interface TopBarProps {
  onNewProject: () => void;
  theme: 'dark' | 'light' | 'system';
  onThemeChange: (t: 'dark' | 'light' | 'system') => void;
}

const THEME_ICONS: Record<string, string> = { dark: '🌙', light: '☀️', system: '💻' };
const NEXT_THEME: Record<string, 'dark' | 'light' | 'system'> = { dark: 'light', light: 'system', system: 'dark' };

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

function formatCitationEntryHTML(citation: Citation, num: number, style: CitationStyle): string {
  const text = formatCitationEntry(citation, num, style);
  const doiUrl = citation.data.DOI ? `https://doi.org/${citation.data.DOI}` : citation.data.url || '';
  // For HTML export, linkify DOI if present
  if (doiUrl && citation.data.DOI) {
    return `<li>${text.replace(doiUrl, `<a href="${doiUrl}" style="color:#6c8aff">${doiUrl}</a>`)}</li>`;
  }
  return `<li>${text}</li>`;
}

export default function TopBar({ onNewProject, theme, onThemeChange }: TopBarProps) {
  const { projects, currentProjectId, selectProject } = useStore();
  const [showExport, setShowExport] = useState(false);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('vancouver');

  // Listen for command palette export events (#13)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'markdown') handleExportMarkdown();
      else if (detail?.type === 'html') handleExportHTML();
    };
    window.addEventListener('command-export', handler);
    return () => window.removeEventListener('command-export', handler);
  }, [citationStyle]);

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
          md += `${formatCitationEntry(citation, num, citationStyle)}\n\n`;
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
          body += formatCitationEntryHTML(citation, num, citationStyle);
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

  const handleExportPDF = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    let body = '';
    for (const block of currentProject.blocks) {
      const blockHtml = block.versions[block.activeVersion]?.html || '';
      if (!blockHtml.trim()) continue;
      const cids = block.citationIds || [];
      const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
      const badges = nums.length > 0 ? nums.map(n => `<sup>[${n}]</sup>`).join('') : '';
      body += `<div class="block">${blockHtml}${badges}</div>\n`;
    }

    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      body += '<div class="references"><h2>References</h2><ol>';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) body += `<li>${formatCitationEntry(citation, num, citationStyle)}</li>`;
      }
      body += '</ol></div>';
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${currentProject.name}</title>
<style>
@page { size: A4; margin: 25mm 20mm 25mm 20mm; }
*  { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #000; background: #fff; margin: 0; }
h1.doc-title { font-size: 20pt; font-weight: 700; text-align: center; margin-bottom: 28pt; }
.block { margin-bottom: 9pt; }
.block h1 { font-size: 16pt; font-weight: 700; margin: 18pt 0 6pt; }
.block h2 { font-size: 13pt; font-weight: 700; margin: 14pt 0 5pt; }
.block h3 { font-size: 11pt; font-weight: 700; margin: 11pt 0 4pt; }
.block p  { margin: 0 0 7pt; }
.block ul, .block ol { padding-left: 1.4em; margin: 0 0 7pt; }
.block li { margin-bottom: 2pt; }
.block blockquote { border-left: 2.5pt solid #555; padding-left: 10pt; margin: 8pt 0; color: #333; font-style: italic; }
strong, b { font-weight: 700; }
em, i { font-style: italic; }
sup { font-size: 7.5pt; vertical-align: super; color: #333; }
.references { margin-top: 28pt; padding-top: 10pt; border-top: 0.75pt solid #999; }
.references h2 { font-size: 13pt; font-weight: 700; margin-bottom: 10pt; }
.references ol { padding-left: 1.4em; }
.references li { font-size: 9.5pt; line-height: 1.45; margin-bottom: 5pt; }
a { color: #000; text-decoration: none; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<h1 class="doc-title">${currentProject.name}</h1>
${body}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // #20 — Export to Roam
  const handleExportRoam = async () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    // Build Roam-compatible markdown
    let md = `# ${currentProject.name}\n\n`;
    for (const block of currentProject.blocks) {
      const html = block.versions[block.activeVersion]?.html || '';
      const text = htmlToText(html).trim();
      if (!text) continue;
      const cids = block.citationIds || [];
      const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
      const citStr = nums.length > 0 ? ` [${nums.join(',')}]` : '';
      md += `- ${text}${citStr}\n`;
    }

    // References
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '\n- ## References\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) {
          md += `    - ${formatCitationEntry(citation, num, citationStyle)}\n`;
        }
      }
    }

    // Use Roam MCP via custom event (picked up by MainApp)
    const event = new CustomEvent('export-to-roam', { detail: { title: currentProject.name, content: md } });
    window.dispatchEvent(event);
  };

  // #20 — Export to Notion
  const handleExportNotion = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    // Build Notion-compatible markdown
    let md = `# ${currentProject.name}\n\n`;
    for (const block of currentProject.blocks) {
      const html = block.versions[block.activeVersion]?.html || '';
      const text = htmlToText(html).trim();
      if (!text) continue;
      const cids = block.citationIds || [];
      const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
      const citStr = nums.length > 0 ? ` [${nums.join(',')}]` : '';
      md += `${text}${citStr}\n\n`;
    }

    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '## References\n\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) {
          md += `${formatCitationEntry(citation, num, citationStyle)}\n\n`;
        }
      }
    }

    const event = new CustomEvent('export-to-notion', { detail: { title: currentProject.name, content: md } });
    window.dispatchEvent(event);
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
      <div className="relative ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={() => onThemeChange(NEXT_THEME[theme])}
          className="px-2 py-1 text-sm bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded transition-colors"
          title={`Theme: ${theme} — click to cycle`}
        >
          {THEME_ICONS[theme]}
        </button>
        {/* #1 — Citation style selector */}
        <select
          value={citationStyle}
          onChange={e => setCitationStyle(e.target.value as CitationStyle)}
          className="px-1.5 py-1 text-xs bg-[#232733] border border-[#2d3140] rounded text-[#8b90a0] focus:outline-none focus:border-[#6c8aff] cursor-pointer"
          title="Citation style for exports"
        >
          <option value="vancouver">Vancouver</option>
          <option value="apa">APA</option>
          <option value="mla">MLA</option>
          <option value="chicago">Chicago</option>
        </select>
        <button
          onClick={() => setShowExport(!showExport)}
          className="px-3 py-1 bg-[#232733] hover:bg-[#2d3140] text-[#e1e4ed] text-sm rounded border border-[#2d3140] transition-colors"
        >
          Export ▾
        </button>
        {showExport && (
          <div className="absolute right-0 top-full mt-1 bg-[#1a1d27] border border-[#2d3140] rounded shadow-lg z-50 min-w-[160px]">
            <button
              onClick={handleExportMarkdown}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              ⬇ Markdown
            </button>
            <button
              onClick={handleExportHTML}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              ⬇ HTML
            </button>
            <button
              onClick={handleExportPDF}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              ⬇ PDF (A4)
            </button>
            <div className="border-t border-[#2d3140]" />
            <button
              onClick={handleExportRoam}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              📋 Export to Roam
            </button>
            <button
              onClick={handleExportNotion}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#232733] transition-colors"
            >
              📋 Export to Notion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
