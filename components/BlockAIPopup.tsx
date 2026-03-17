'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  blockId: string;
  blockHtml: string;
  onApply: (newHtml: string, instruction: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const PRESETS = [
  'Make more formal',
  'Simplify',
  'Expand with details',
  'Shorten',
  'Academic tone',
  'Fix grammar',
];

export default function BlockAIPopup({ blockId, blockHtml, onApply, onClose, position }: Props) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRewrite = async (inst: string) => {
    if (!inst.trim()) return;
    setLoading(true);
    setError('');
    // Extract plain text for rewrite
    const tmp = document.createElement('div');
    tmp.innerHTML = blockHtml;
    const plainText = tmp.textContent || '';
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText, instruction: inst }),
      });
      const data = await res.json();
      if (data.text) {
        onApply(`<p>${data.text}</p>`, inst);
        onClose();
      } else {
        setError('No response from AI');
      }
    } catch (e) {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-[#1a1d27] border border-[#2d3140] rounded-lg shadow-xl p-3 w-72"
      style={{ top: position.top, left: position.left }}
    >
      <div className="text-xs text-[#8b90a0] mb-2 font-medium">AI Rewrite</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => handleRewrite(p)}
            disabled={loading}
            className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRewrite(instruction)}
          placeholder="Custom instruction..."
          disabled={loading}
          className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#6c8aff] disabled:opacity-50"
        />
        <button
          onClick={() => handleRewrite(instruction)}
          disabled={loading || !instruction.trim()}
          className="px-2 py-1 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : '→'}
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
}
