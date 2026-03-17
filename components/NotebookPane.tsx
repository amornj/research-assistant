'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  showInsert?: boolean;
}

export default function NotebookPane() {
  const { currentProject, addChatMessage, setChatHistory, setConversationId } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages: Message[] = (currentProject?.chatHistory || []) as Message[];
  const notebookId = currentProject?.notebookId;
  const conversationId = currentProject?.conversationId || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    addChatMessage({ role: 'user', content: question });
    setLoading(true);
    try {
      const res = await fetch('/api/notebooks/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebook_id: notebookId,
          question,
          conversation_id: conversationId,
        }),
      });
      const data = await res.json();
      const answer = data.answer || data.response || data.text || 'No response';
      const newConvId = data.conversation_id || data.conversationId || conversationId;
      if (newConvId) setConversationId(newConvId);
      addChatMessage({ role: 'assistant', content: answer, showInsert: true });
    } catch (e) {
      addChatMessage({ role: 'assistant', content: 'Error connecting to NotebookLM.' });
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (content: string) => {
    const fn = (window as any).__insertToEditor;
    if (fn) fn(`<p>${content}</p>`);
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1d27]">
      <div className="px-3 py-2 border-b border-[#2d3140] flex items-center justify-between">
        <span className="text-xs font-semibold text-[#8b90a0] uppercase tracking-wide">NotebookLM</span>
        {currentProject?.notebookName && (
          <span className="text-xs text-[#6c8aff] truncate max-w-[150px]" title={currentProject.notebookName}>
            {currentProject.notebookName}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-xs text-[#8b90a0] text-center mt-4">
            Ask questions about your research sources
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
            {msg.role === 'assistant' && msg.showInsert && (
              <button
                onClick={() => handleInsert(msg.content)}
                className="mt-1 text-xs text-[#6c8aff] hover:text-[#5a78f0] transition-colors"
              >
                ↓ Insert to editor
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="text-xs text-[#8b90a0] mb-1">Querying NotebookLM (may take up to 60s)...</div>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-[#6c8aff] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-[#2d3140]">
        <div className="flex gap-1">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask a question..."
            disabled={loading}
            className="flex-1 bg-[#232733] border border-[#2d3140] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#6c8aff] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-2 py-1.5 bg-[#6c8aff] hover:bg-[#5a78f0] text-white text-xs rounded disabled:opacity-50 transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
