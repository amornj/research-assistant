'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage, ProjectConfig } from '@/lib/types'
import { uid } from '@/lib/utils'

interface Props {
  project: ProjectConfig
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
  onSendToWriter: (content: string) => void
}

export function AskNotebookPane({ project, messages, setMessages, onSendToWriter }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async (text?: string) => {
    const question = (text ?? input).trim()
    if (!question || loading) return
    const next = [...messages, { id: uid(), role: 'user', content: question, createdAt: Date.now() }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/notebooklm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId: project.notebookId, question }),
      })
      const data = await res.json()
      setMessages([...next, { id: uid(), role: 'assistant', content: data.answer || 'No response.', createdAt: Date.now() } as ChatMessage])
    } finally {
      setLoading(false)
    }
  }

  const presets = [
    'Summarize the key themes from this notebook.',
    'Use this notebook to answer a real clinical case and explain your reasoning.',
    'Write a comprehensive 4000-word research article from this notebook.',
  ]

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Ask NotebookLM</h3>
        <p className="text-xs text-slate-500">Notebook: {project.notebookName}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            {presets.map((p) => (
              <button key={p} onClick={() => send(p)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm hover:bg-slate-100">{p}</button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`rounded-xl p-3 text-sm ${m.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white'}`}>
            {m.role === 'assistant' ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
            {m.role === 'assistant' && (
              <button onClick={() => onSendToWriter(m.content)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">Send to writing pane</button>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 p-4">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question or request a long-form research draft…" className="min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm" />
        <button onClick={() => send()} disabled={loading} className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{loading ? 'Thinking…' : 'Ask NotebookLM'}</button>
      </div>
    </div>
  )
}
