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
    .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => `IMG_TAG_START${src}IMG_TAG_END`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/IMG_TAG_START(.*?)IMG_TAG_END/g, '<img src="$1" style="width: 100%; height: auto;" />')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function formatCitationEntryHTML(citation: Citation, num: number, style: CitationStyle): string {
  const text = formatCitationEntry(citation, num, style).replace(/^\d+\.\s*/, '');
  const doiUrl = citation.data.DOI ? `https://doi.org/${citation.data.DOI}` : citation.data.url || '';
  if (doiUrl && citation.data.DOI) {
    return `<li>${text.replace(doiUrl, `<a href="${doiUrl}" style="color:#6c8aff">${doiUrl}</a>`)}</li>`;
  }
  return `<li>${text}</li>`;
}

// Feature #14: Sparkline component
function WritingSparkline({ log }: { log: { date: string; words: number }[] }) {
  const last7 = [...log].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const max = Math.max(...last7.map(e => e.words), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {last7.map((entry, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div
            className="w-4 bg-[#6c8aff]/50 rounded-sm transition-all"
            style={{ height: `${Math.max(2, (entry.words / max) * 28)}px` }}
            title={`${entry.date}: +${entry.words} words`}
          />
        </div>
      ))}
    </div>
  );
}

export default function TopBar({ onNewProject, theme, onThemeChange }: TopBarProps) {
  const { projects, currentProjectId, selectProject, setWordCountGoal, updateWritingLog } = useStore();
  const currentProject = useStore(s => s.currentProject);
  const [showExport, setShowExport] = useState(false);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('vancouver');
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalInputVal, setGoalInputVal] = useState('');
  const [showWritingLog, setShowWritingLog] = useState(false);
  const [showHamburger, setShowHamburger] = useState(false);

  // Compute total words from current project blocks
  const totalWords = (() => {
    if (!currentProject) return 0;
    return currentProject.blocks.reduce((sum, b) => {
      if (typeof document === 'undefined') return sum;
      const tmp = document.createElement('div');
      tmp.innerHTML = b.versions[b.activeVersion]?.html || '';
      const text = tmp.textContent || '';
      return sum + (text.trim() ? text.trim().split(/\s+/).length : 0);
    }, 0);
  })();

  // Also try window.__totalWordCount as fallback
  const displayWords = typeof window !== 'undefined' && (window as any).__totalWordCount !== undefined
    ? (window as any).__totalWordCount
    : totalWords;

  const wordCountGoal = currentProject?.wordCountGoal;
  const progressPct = wordCountGoal ? Math.min(100, (displayWords / wordCountGoal) * 100) : null;
  const readingMins = Math.ceil(displayWords / 200);

  // Listen for command palette export events
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
      const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
      if (nums.length > 0) md += text.trimEnd() + ` [${nums.join(',')}]\n\n`;
      else md += text + '\n\n';
    }
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '## References\n\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) md += `${formatCitationEntry(citation, num, citationStyle)}\n\n`;
      }
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${currentProject.name}.md`; a.click();
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
      const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
      if (nums.length > 0) {
        const badges = nums.map(n => `<sup style="background:#6c8aff22;color:#6c8aff;padding:0 3px;border-radius:3px;font-size:10px">[${n}]</sup>`).join('');
        body += blockHtml + badges;
      } else {
        body += blockHtml;
      }
    }
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      body += '<hr style="margin:2em 0;border-color:#2d3140"><h2>References</h2><ol style="padding-left:1.5em">';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) body += formatCitationEntryHTML(citation, num, citationStyle);
      }
      body += '</ol>';
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${currentProject.name}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:2em auto;padding:0 1em;color:#1a1a1a;line-height:1.6}h1,h2,h3{margin-top:1.5em}img{width:100%;height:auto;display:block;margin:1em 0;border-radius:4px}</style></head><body><h1>${currentProject.name}</h1>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${currentProject.name}.html`; a.click();
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
        if (citation) body += `<li>${formatCitationEntry(citation, num, citationStyle).replace(/^\d+\.\s*/, '')}</li>`;
      }
      body += '</ol></div>';
    }
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${currentProject.name}</title>
<style>
@page { size: A4; margin: 25mm 20mm 25mm 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #000; background: #fff; margin: 0; }
h1.doc-title { font-size: 20pt; font-weight: 700; text-align: center; margin-bottom: 28pt; }
.block { margin-bottom: 9pt; }
.block h1 { font-size: 16pt; font-weight: 700; margin: 18pt 0 6pt; }
.block h2 { font-size: 13pt; font-weight: 700; margin: 14pt 0 5pt; }
.block h3 { font-size: 11pt; font-weight: 700; margin: 11pt 0 4pt; }
.block p { margin: 0 0 7pt; }
.block ul, .block ol { padding-left: 1.4em; margin: 0 0 7pt; }
.block li { margin-bottom: 2pt; }
img { width: 100%; height: auto; display: block; margin: 12pt 0; }
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

  // Feature #16: Export to .docx
  const handleExportDocx = async () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    try {
      const { exportToDocx } = await import('@/lib/docxExporter');
      const blob = await exportToDocx(currentProject.name, currentProject.blocks, currentProject.citations, citationStyle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${currentProject.name}.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('DOCX export failed:', err);
      alert('DOCX export failed. Please install the docx package: npm install docx');
    }
  };

  // Feature #18: Export to Obsidian markdown
  const handleExportObsidian = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);

    let md = `# ${currentProject.name}\n\n`;
    for (const block of currentProject.blocks) {
      const html = block.versions[block.activeVersion]?.html || '';
      let text = htmlToText(html).trim();
      if (!text) continue;

      // Replace block-link spans with [[...]]
      text = text.replace(/\[\[([^\]]+)\]\]/g, (m) => m);

      // Add citations as [@key]
      const cids = block.citationIds || [];
      const citRefs = cids.map(id => {
        const citation = currentProject.citations.find(c => c.id === id);
        return citation ? `[@${citation.zoteroKey}]` : '';
      }).filter(Boolean).join(' ');

      md += text + (citRefs ? ' ' + citRefs : '') + '\n\n';
    }

    // References
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '## References\n\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) md += `${formatCitationEntry(citation, num, citationStyle)}\n\n`;
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${currentProject.name}_obsidian.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRoam = async () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);
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
    const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
    if (allCited.length > 0) {
      md += '\n- ## References\n';
      for (const [citId, num] of allCited) {
        const citation = currentProject.citations.find(c => c.id === citId);
        if (citation) md += `    - ${formatCitationEntry(citation, num, citationStyle)}\n`;
      }
    }
    window.dispatchEvent(new CustomEvent('export-to-roam', { detail: { title: currentProject.name, content: md } }));
  };

  const handleExportNotion = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    setShowExport(false);
    const citationMap = getOrderedCitationMap(currentProject.blocks, currentProject.citations);
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
        if (citation) md += `${formatCitationEntry(citation, num, citationStyle)}\n\n`;
      }
    }
    window.dispatchEvent(new CustomEvent('export-to-notion', { detail: { title: currentProject.name, content: md } }));
  };

  // Feature #8: Generate Abstract (triggers BlockEditor)
  const handleGenerateAbstract = () => {
    setShowExport(false);
    window.dispatchEvent(new CustomEvent('generate-abstract'));
  };

  // Feature #20: Share link
  const handleShare = () => {
    setShowExport(false);
    window.dispatchEvent(new CustomEvent('share-document'));
  };

  // Feature #5: Goal input
  const handleGoalSubmit = () => {
    const n = parseInt(goalInputVal, 10);
    if (!isNaN(n) && n > 0) setWordCountGoal(n);
    else if (goalInputVal === '' || goalInputVal === '0') setWordCountGoal(undefined);
    setShowGoalInput(false);
    setGoalInputVal('');
  };

  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1d27] border-b border-[#2d3140] h-10">
        <span className="text-[#6c8aff] font-semibold text-sm mr-2">Research Assistant</span>
        <select
          value={currentProjectId || ''}
          onChange={e => selectProject(e.target.value)}
          className="flex-1 max-w-xs bg-[#232733] border border-[#2d3140] text-[#e1e4ed] text-sm rounded px-2 py-1 focus:outline-none focus:border-[#6c8aff]"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={onNewProject} className="px-3 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-sm rounded transition-colors">
          + New
        </button>

        <div className="relative ml-auto">
          {/* Hamburger menu button */}
          <button
            onClick={() => setShowHamburger(v => !v)}
            className="px-2 py-1 text-lg bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded transition-colors text-[#e1e4ed]"
            title="Menu"
          >
            ☰
          </button>

          {showHamburger && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a1d27] border border-[#2d3140] rounded shadow-xl z-50 min-w-[220px] py-1"
              onMouseLeave={() => { setShowHamburger(false); setShowWritingLog(false); setShowGoalInput(false); setShowExport(false); }}>

              {/* Theme */}
              <div className="px-3 py-1.5 text-[10px] text-[#8b90a0] uppercase tracking-wide font-semibold">Appearance</div>
              <button
                onClick={() => onThemeChange(NEXT_THEME[theme])}
                className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed] transition-colors"
              >
                {THEME_ICONS[theme]} Theme: {theme}
              </button>

              {/* Citation style */}
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-[#8b90a0]">Citation:</span>
                <select value={citationStyle} onChange={e => setCitationStyle(e.target.value as CitationStyle)}
                  className="flex-1 px-1.5 py-1 text-xs bg-[#232733] border border-[#2d3140] rounded text-[#8b90a0] focus:outline-none focus:border-[#6c8aff] cursor-pointer">
                  <option value="vancouver">Vancouver</option>
                  <option value="apa">APA</option>
                  <option value="mla">MLA</option>
                  <option value="chicago">Chicago</option>
                </select>
              </div>

              <div className="border-t border-[#2d3140] my-1" />

              {/* Writing log */}
              <div className="px-3 py-1.5 text-[10px] text-[#8b90a0] uppercase tracking-wide font-semibold">Writing</div>
              <button
                onClick={() => setShowWritingLog(v => !v)}
                className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed] transition-colors"
              >
                📊 Writing Log
              </button>
              {showWritingLog && (
                <div className="px-4 py-2 bg-[#232733]/50">
                  {currentProject?.writingLog && currentProject.writingLog.length > 0 ? (
                    <>
                      <WritingSparkline log={currentProject.writingLog} />
                      <div className="mt-2 text-[10px] text-[#8b90a0]">
                        {currentProject.writingLog.slice(-3).reverse().map(e => (
                          <div key={e.date}>{e.date}: +{e.words} words</div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-[#8b90a0]">No writing data yet</div>
                  )}
                </div>
              )}

              {/* Word count goal */}
              <button
                onClick={() => setShowGoalInput(v => !v)}
                className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140] hover:text-[#e1e4ed] transition-colors"
              >
                🎯 Word Count Goal{wordCountGoal ? ` (${wordCountGoal})` : ''}
              </button>
              {showGoalInput && (
                <div className="px-4 py-2 flex gap-1 items-center bg-[#232733]/50">
                  <input
                    type="number"
                    value={goalInputVal}
                    onChange={e => setGoalInputVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleGoalSubmit(); if (e.key === 'Escape') setShowGoalInput(false); }}
                    placeholder={wordCountGoal?.toString() || 'Word goal'}
                    className="w-24 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs text-[#e1e4ed] focus:outline-none focus:border-[#6c8aff]"
                    autoFocus
                  />
                  <button onClick={handleGoalSubmit} className="px-2 py-1 text-xs bg-[#6c8aff] hover:bg-[#5a78f0] text-white rounded">Set</button>
                  {wordCountGoal && (
                    <button onClick={() => { setWordCountGoal(undefined); setShowGoalInput(false); }} className="px-2 py-1 text-xs bg-[#232733] text-[#8b90a0] rounded">Clear</button>
                  )}
                </div>
              )}

              <div className="border-t border-[#2d3140] my-1" />

              {/* Export section */}
              <div className="px-3 py-1.5 text-[10px] text-[#8b90a0] uppercase tracking-wide font-semibold">Export</div>
              <button onClick={handleExportMarkdown} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">⬇ Markdown</button>
              <button onClick={handleExportHTML} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">⬇ HTML</button>
              <button onClick={handleExportPDF} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">⬇ PDF (A4)</button>
              <button onClick={handleExportDocx} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">⬇ Word (.docx)</button>
              <button onClick={handleExportObsidian} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">📝 Obsidian (.md)</button>

              <div className="border-t border-[#2d3140] my-1" />

              {/* Tools */}
              <div className="px-3 py-1.5 text-[10px] text-[#8b90a0] uppercase tracking-wide font-semibold">Tools</div>
              <button onClick={handleGenerateAbstract} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">🧠 Generate Abstract</button>
              <button onClick={handleShare} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">🔗 Share (read-only link)</button>

              <div className="border-t border-[#2d3140] my-1" />

              {/* Integrations */}
              <div className="px-3 py-1.5 text-[10px] text-[#8b90a0] uppercase tracking-wide font-semibold">Integrations</div>
              <button onClick={handleExportRoam} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">📋 Export to Roam</button>
              <button onClick={handleExportNotion} className="w-full text-left px-4 py-2 text-sm text-[#c8ccd8] hover:bg-[#2d3140]">📋 Export to Notion</button>
            </div>
          )}
        </div>
      </div>

      {/* Feature #5: Word count progress bar */}
      {wordCountGoal && (
        <div className="bg-[#1a1d27] border-b border-[#2d3140] px-4 py-1 flex items-center gap-3">
          <div className="flex-1 bg-[#232733] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: progressPct! >= 100 ? '#22c55e' : progressPct! >= 70 ? '#f59e0b' : '#6c8aff',
              }}
            />
          </div>
          <span className="text-[10px] text-[#8b90a0] whitespace-nowrap flex-shrink-0">
            {displayWords} / {wordCountGoal} words · {readingMins} min read
          </span>
        </div>
      )}
    </div>
  );
}
