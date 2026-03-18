'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  showInsert?: boolean;
  suggestions?: string[];
}

export default function NotebookPane() {
  const { currentProject, addChatMessage, setChatHistory, setConversationId, addBlock, addCitationToBlock, focusedBlockId } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages: Message[] = (currentProject?.chatHistory || []) as Message[];
  const notebookId = currentProject?.notebookId;
  const conversationId = currentProject?.conversationId || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (question?: string) => {
    const q = (question || input).trim();
    if (!q || loading) return;
    setInput('');
    addChatMessage({ role: 'user', content: q });
    setLoading(true);
    try {
      const res = await fetch('/api/notebooks/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebook_id: notebookId,
          question: q,
          conversation_id: conversationId,
        }),
      });
      const data = await res.json();
      const answer = data.answer || data.response || data.text || 'No response';
      const newConvId = data.conversation_id || data.conversationId || conversationId;
      if (newConvId) setConversationId(newConvId);

      // Generate follow-up suggestions (#14)
      let suggestions: string[] = [];
      try {
        const sugRes = await fetch('/api/ai/general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Based on the following answer from a research notebook, generate exactly 3 concise follow-up questions a researcher might ask. Return ONLY a JSON array of 3 strings, nothing else.\n\nAnswer: ${answer.substring(0, 800)}`,
            model: 'anthropic/claude-sonnet-4-20250514',
          }),
        });
        const sugData = await sugRes.json();
        const raw = (sugData.text || '').trim();
        // Parse JSON array
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) suggestions = parsed.slice(0, 3).map(String);
        }
      } catch {
        // suggestions stay empty
      }

      addChatMessage({ role: 'assistant', content: answer, showInsert: true, suggestions });
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

  // #11 — Capture as block
  const handleCapture = (content: string, msgIndex: number) => {
    const insertAfter = (window as any).__editorFocusedBlockId as string | null;
    if (insertAfter) {
      addBlock(`<p>${content}</p>`, insertAfter);
    } else {
      addBlock(`<p>${content}</p>`);
    }
  };

  // #11 — Capture + cite sources
  const handleCaptureWithCites = async (content: string, msgIndex: number) => {
    setCaptureLoading(msgIndex);
    try {
      // Extract source references from the NLM answer using AI
      const res = await fetch('/api/ai/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Extract any paper/source titles or author names mentioned in the following text. Return ONLY a JSON array of search query strings (max 3), or an empty array if none found.\n\nText: ${content.substring(0, 1000)}`,
          model: 'anthropic/claude-sonnet-4-20250514',
        }),
      });
      const data = await res.json();
      let queries: string[] = [];
      try {
        const raw = (data.text || '').trim();
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) queries = parsed.slice(0, 3).map(String);
        }
      } catch { /* empty */ }

      // Insert block first
      const insertAfter = (window as any).__editorFocusedBlockId as string | null;
      const newBlock = insertAfter
        ? addBlock(`<p>${content}</p>`, insertAfter)
        : addBlock(`<p>${content}</p>`);

      // Search Zotero for each extracted source and add citations
      for (const q of queries) {
        try {
          const zRes = await fetch(`/api/zotero/search?q=${encodeURIComponent(q)}`);
          const zData = await zRes.json();
          if (Array.isArray(zData) && zData.length > 0) {
            const item = zData[0];
            addCitationToBlock(newBlock.id, item.key, item.data);
          }
        } catch { /* skip */ }
      }
    } finally {
      setCaptureLoading(null);
    }
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
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button
                  onClick={() => handleInsert(msg.content)}
                  className="text-xs text-[#6c8aff] hover:text-[#5a78f0] transition-colors"
                >
                  ↓ Insert to editor
                </button>
                <button
                  onClick={() => handleCapture(msg.content, i)}
                  className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors"
                  title="Capture as a new block in the editor"
                >
                  📥 Capture as block
                </button>
                <button
                  onClick={() => handleCaptureWithCites(msg.content, i)}
                  disabled={captureLoading === i}
                  className="px-2 py-0.5 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
                  title="Capture as block + auto-attach matching Zotero citations"
                >
                  {captureLoading === i ? '...' : '📎 Capture + cite'}
                </button>
              </div>
            )}
            {/* #14 — Follow-up suggestions */}
            {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] text-[#8b90a0] uppercase tracking-wide">Follow-up</div>
                {msg.suggestions.map((s, si) => (
                  <button
                    key={si}
                    onClick={() => handleSend(s)}
                    disabled={loading}
                    className="block w-full text-left px-2 py-1 text-xs bg-[#232733] hover:bg-[#2d3140] border border-[#2d3140] rounded text-[#8b90a0] hover:text-[#e1e4ed] transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
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
            onClick={() => handleSend()}
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
