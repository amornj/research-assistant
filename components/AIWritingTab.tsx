'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { playCompletionSound } from '@/lib/sounds';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  showInsert?: boolean;
}

const MODELS = [
  { value: 'anthropic/claude-sonnet-4-20250514', label: '🔍 Geo (Sonnet 4.6)' },
  { value: 'google/gemini-2.5-flash', label: '🔄 Echo (Gemini Flash)' },
];

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

export default function AIWritingTab() {
  const { currentProject } = useStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [useDocContext, setUseDocContext] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildDocumentContext = (): string | undefined => {
    if (!useDocContext || !currentProject) return undefined;
    const blocks = currentProject.blocks || [];
    const text = blocks
      .map(b => stripHtml(b.versions[b.activeVersion]?.html || ''))
      .filter(t => t.trim())
      .join('\n\n');
    if (!text) return undefined;
    return `${currentProject.name}\n\n${text}`;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    const userMsg: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const documentContext = buildDocumentContext();
      const res = await fetch('/api/ai/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, model: selectedModel, documentContext }),
      });
      const data = await res.json();
      const reply = data.text || data.response || data.answer || 'No response';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, showInsert: true }]);
      playCompletionSound();
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (content: string) => {
    const fn = (window as any).__insertToEditor;
    if (fn) fn(`<p>${content}</p>`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2d3140] flex-shrink-0">
        <span className="text-xs font-medium text-[#8b90a0]">AI Chat</span>
        {/* #12 — Document context toggle */}
        <button
          onClick={() => setUseDocContext(v => !v)}
          title="When on, AI can see your full document draft"
          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
            useDocContext
              ? 'bg-[#6c8aff]/20 border-[#6c8aff] text-[#6c8aff]'
              : 'bg-[#232733] border-[#2d3140] text-[#8b90a0] hover:text-[#e1e4ed]'
          }`}
        >
          {useDocContext ? '📄 Doc context ON' : '📄 Doc context OFF'}
        </button>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="ml-auto px-1.5 py-0.5 text-xs bg-[#232733] border border-[#2d3140] rounded text-[#8b90a0] focus:outline-none focus:border-[#6c8aff] cursor-pointer"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">
            {useDocContext
              ? 'Document context active — ask about your draft'
              : 'Ask any question or get writing help'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
            {msg.role === 'assistant' && msg.showInsert && (
              <button
                onClick={() => handleInsert(msg.content)}
                className="mt-2 px-3 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded font-medium transition-colors flex items-center gap-1"
              >
                ⬇ Push to Writing Area
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-[#2d3140] flex-shrink-0">
        <div className="flex gap-1">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={useDocContext ? 'Ask about your document...' : 'Ask anything...'}
            disabled={loading}
            rows={2}
            className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#6c8aff] disabled:opacity-50 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-2 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors self-end"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
