'use client';

import { useStore } from '@/store/useStore';
import { Block } from '@/types';

interface OutlineItem {
  blockId: string;
  level: number;
  text: string;
}

function parseOutline(blocks: Block[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const block of blocks) {
    const html = block.versions[block.activeVersion]?.html || '';
    // Match h1, h2, h3
    const matches = html.matchAll(/<(h[1-3])[^>]*>(.*?)<\/\1>/gi);
    for (const m of matches) {
      const tag = m[1].toLowerCase();
      const level = parseInt(tag[1]);
      // Strip inner HTML tags
      const tmp = document.createElement('div');
      tmp.innerHTML = m[2];
      const text = tmp.textContent?.trim() || '';
      if (text) items.push({ blockId: block.id, level, text });
    }
    // Also treat paragraphs with all-bold text as potential headings
  }
  return items;
}

function scrollToBlock(blockId: string) {
  const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the content editable
    const content = el.querySelector('.block-content') as HTMLElement | null;
    if (content) content.focus();
  }
}

export default function OutlinePanel() {
  const { currentProject } = useStore();
  const blocks = currentProject?.blocks || [];
  const outline = parseOutline(blocks);

  if (outline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-xs text-[#8b90a0] text-center">
          <div className="mb-1">No headings found</div>
          <div className="text-[10px]">Use h1/h2/h3 in your blocks to build an outline</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="space-y-0.5">
        {outline.map((item, i) => (
          <button
            key={i}
            onClick={() => scrollToBlock(item.blockId)}
            className="w-full text-left px-2 py-1 rounded hover:bg-[#232733] transition-colors group"
            style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
          >
            <span className="text-xs text-[#8b90a0] group-hover:text-[#e1e4ed] transition-colors line-clamp-1">
              {item.level === 1 && <span className="text-[#6c8aff] mr-1 font-bold">H1</span>}
              {item.level === 2 && <span className="text-[#6c8aff]/70 mr-1">H2</span>}
              {item.level === 3 && <span className="text-[#6c8aff]/50 mr-1">H3</span>}
              {item.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
