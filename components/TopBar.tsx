'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';

interface TopBarProps {
  onNewProject: () => void;
}

export default function TopBar({ onNewProject }: TopBarProps) {
  const { projects, currentProjectId, selectProject } = useStore();
  const [showExport, setShowExport] = useState(false);

  const handleExportMarkdown = () => {
    const { currentProject } = useStore.getState();
    if (!currentProject) return;
    let md = `# ${currentProject.name}\n\n`;
    for (const block of currentProject.blocks) {
      const html = block.versions[block.activeVersion]?.html || '';
      // Simple HTML to markdown
      const text = html
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
      md += text + '\n\n';
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
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${currentProject.name}</title></head><body>`;
    for (const block of currentProject.blocks) {
      html += block.versions[block.activeVersion]?.html || '';
    }
    html += '</body></html>';
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
