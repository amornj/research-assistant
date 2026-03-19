'use client';

import { useState } from 'react';
import { Block } from '@/types';

interface VersionTimelineProps {
  block: Block;
  blockIndex: number;
  onClose: () => void;
  onSwitchVersion: (blockId: string, idx: number) => void;
  onDeleteVersion: (blockId: string, idx: number) => void;
}

function wordCount(html: string): number {
  if (typeof document === 'undefined') return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function VersionTimeline({ block, blockIndex, onClose, onSwitchVersion, onDeleteVersion }: VersionTimelineProps) {
  const [previewIdx, setPreviewIdx] = useState<number>(block.activeVersion);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const previewHtml = block.versions[previewIdx]?.html || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1d27] border border-[#2d3140] rounded-xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2d3140] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#e1e4ed]">Version History — Block {blockIndex + 1}</h2>
          <button onClick={onClose} className="text-[#8b90a0] hover:text-[#e1e4ed] text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Timeline sidebar */}
          <div className="w-56 flex-shrink-0 border-r border-[#2d3140] overflow-y-auto p-4">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-2.5 top-3 bottom-3 w-px bg-[#2d3140]" />
              <div className="space-y-4">
                {block.versions.map((v, idx) => {
                  const isActive = idx === block.activeVersion;
                  const isPreviewing = idx === previewIdx;
                  const wc = wordCount(v.html);
                  const date = new Date(v.ts);
                  const label = v.instruction || `Version ${idx + 1}`;

                  return (
                    <div key={idx} className="relative pl-7">
                      {/* Dot */}
                      <div
                        className={`absolute left-0 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors ${
                          isActive
                            ? 'border-[#6c8aff] bg-[#6c8aff]'
                            : isPreviewing
                            ? 'border-[#6c8aff] bg-[#6c8aff]/30'
                            : 'border-[#2d3140] bg-[#232733] hover:border-[#6c8aff]/60'
                        }`}
                        onClick={() => setPreviewIdx(idx)}
                      >
                        {isActive && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                      </div>
                      <div
                        className={`cursor-pointer rounded p-1.5 transition-colors ${isPreviewing ? 'bg-[#232733]' : 'hover:bg-[#232733]/50'}`}
                        onClick={() => setPreviewIdx(idx)}
                      >
                        <div className="text-[11px] font-medium text-[#e1e4ed] truncate">{label}</div>
                        <div className="text-[10px] text-[#8b90a0]">{wc} words</div>
                        <div className="text-[10px] text-[#8b90a0]/60">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d3140] flex-shrink-0 bg-[#232733]/40">
              <span className="text-xs text-[#8b90a0]">
                Previewing v{previewIdx + 1}
                {block.versions[previewIdx]?.instruction ? ` · ${block.versions[previewIdx].instruction}` : ''}
                {previewIdx === block.activeVersion && ' (active)'}
              </span>
              <div className="flex gap-2">
                {previewIdx !== block.activeVersion && (
                  <button
                    onClick={() => { onSwitchVersion(block.id, previewIdx); onClose(); }}
                    className="px-3 py-1 text-xs bg-[#6c8aff] hover:bg-[#5a78f0] text-white rounded transition-colors"
                  >
                    Restore this version
                  </button>
                )}
                {block.versions.length > 1 && (
                  pendingDelete === previewIdx ? (
                    <div className="flex gap-1 items-center">
                      <span className="text-[11px] text-red-400">Delete v{previewIdx + 1}?</span>
                      <button
                        onClick={() => { onDeleteVersion(block.id, previewIdx); setPendingDelete(null); setPreviewIdx(Math.max(0, previewIdx - 1)); }}
                        className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded"
                      >
                        Delete
                      </button>
                      <button onClick={() => setPendingDelete(null)} className="px-2 py-0.5 text-[11px] bg-[#232733] text-[#8b90a0] rounded">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPendingDelete(previewIdx)}
                      className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                    >
                      Delete version
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div
                className="block-content prose-sm max-w-none text-[#e1e4ed]"
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-[#8b90a0] italic">(empty)</p>' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
