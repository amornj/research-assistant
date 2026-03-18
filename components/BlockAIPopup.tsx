'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  blockId: string;
  blockHtml: string;
  /** HTML of blocks before (up to 2) */
  contextBefore?: string[];
  /** HTML of blocks after (up to 2) */
  contextAfter?: string[];
  /** Whether 2+ blocks are selected (for synthesize/contrast modes) */
  selectedBlocksHtml?: string[];
  projectTitle?: string;
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

const MODELS = [
  { value: 'anthropic/claude-sonnet-4-20250514', label: '🔍 Geo (Sonnet 4.6)' },
  { value: 'google/gemini-2.5-flash', label: '🔄 Echo (Gemini Flash)' },
];

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

export default function BlockAIPopup({ blockId, blockHtml, contextBefore, contextAfter, selectedBlocksHtml, projectTitle, onApply, onClose, position }: Props) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [useContext, setUseContext] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const hasContext = !!(contextBefore?.length || contextAfter?.length);

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

  const buildContext = (): string | undefined => {
    if (!useContext || !hasContext) return undefined;
    const parts: string[] = [];
    if (projectTitle) parts.push(`Document title: ${projectTitle}`);
    if (contextBefore?.length) {
      parts.push('--- Preceding paragraphs ---');
      contextBefore.forEach(h => parts.push(stripHtml(h)));
    }
    parts.push('--- Current paragraph (to rewrite) ---');
    parts.push(stripHtml(blockHtml));
    if (contextAfter?.length) {
      parts.push('--- Following paragraphs ---');
      contextAfter.forEach(h => parts.push(stripHtml(h)));
    }
    return parts.join('\n\n');
  };

  const handleRewrite = async (inst: string) => {
    if (!inst.trim()) return;
    setLoading(true);
    setError('');
    const plainText = stripHtml(blockHtml);
    const context = buildContext();
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText, instruction: inst, model: selectedModel, context }),
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

  const handleSynthesize = async () => {
    if (!selectedBlocksHtml || selectedBlocksHtml.length < 2) {
      setError('Select 2+ blocks first (hold ⌘ and click)');
      return;
    }
    setLoading(true);
    setError('');
    const combined = selectedBlocksHtml.map(h => stripHtml(h)).join('\n\n');
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: combined,
          instruction: 'Combine these ideas into one paragraph with a clear claim. Synthesize the key points.',
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (data.text) {
        onApply(`<p>${data.text}</p>`, 'Synthesize ideas');
        onClose();
      } else {
        setError('No response');
      }
    } catch (e) {
      setError('Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleArgue = async () => {
    await handleRewrite('Turn this observation into an argument with evidence structure. Make it persuasive with a clear claim.');
  };

  const handleContrast = async () => {
    if (contextBefore && contextBefore.length > 0) {
      const prevText = stripHtml(contextBefore[contextBefore.length - 1]);
      const currText = stripHtml(blockHtml);
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/ai/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currText,
            instruction: `Rewrite to highlight tension or disagreement with the preceding paragraph. Preceding paragraph for reference: "${prevText}"`,
            model: selectedModel,
          }),
        });
        const data = await res.json();
        if (data.text) {
          onApply(`<p>${data.text}</p>`, 'Contrast with previous');
          onClose();
        } else {
          setError('No response');
        }
      } catch (e) {
        setError('Failed');
      } finally {
        setLoading(false);
      }
    } else {
      await handleRewrite('Rewrite to highlight tension or disagreement with the broader argument. Surface any contradictions or counterpoints.');
    }
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-[#1a1d27] border border-[#2d3140] rounded-lg shadow-xl p-3 w-80"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[#8b90a0] font-medium">✨ AI Rewrite</div>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="px-1.5 py-0.5 text-xs bg-[#232733] border border-[#2d3140] rounded text-[#8b90a0] focus:outline-none focus:border-[#6c8aff] cursor-pointer"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Context toggle */}
      {hasContext && (
        <button
          onClick={() => setUseContext(v => !v)}
          className={`mb-2 w-full px-2 py-1 text-xs rounded border transition-colors ${
            useContext
              ? 'bg-[#6c8aff]/20 border-[#6c8aff] text-[#6c8aff]'
              : 'bg-[#232733] border-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          {useContext ? '🔗 Contextual rewrite ON' : '🔗 Contextual rewrite OFF'}
        </button>
      )}

      {/* Style presets */}
      <div className="text-xs text-[#8b90a0] mb-1 font-medium">Style</div>
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

      {/* Reasoning modes */}
      <div className="text-xs text-[#8b90a0] mb-1 font-medium">Reasoning</div>
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          onClick={handleArgue}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
          title="Turn observation into argument with evidence structure"
        >
          ⚖️ Argue
        </button>
        <button
          onClick={handleSynthesize}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
          title="Combine 2+ selected blocks into one paragraph (hold ⌘ to select)"
        >
          🔀 Synthesize
        </button>
        <button
          onClick={handleContrast}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
          title="Highlight tension with the preceding paragraph"
        >
          ↔️ Contrast
        </button>
      </div>

      {/* Custom instruction */}
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
