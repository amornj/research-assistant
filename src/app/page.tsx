'use client'

import { useEffect, useMemo, useState } from 'react'
import { AskNotebookPane } from '@/components/AskNotebookPane'
import { ProjectSetup } from '@/components/ProjectSetup'
import { WritingPane } from '@/components/WritingPane'
import { ZoteroPane } from '@/components/ZoteroPane'
import { exportDocx, exportPdf } from '@/lib/export'
import type { ChatMessage, ProjectConfig, ReferenceItem, WritingBlock } from '@/lib/types'
import { uid } from '@/lib/utils'

interface NotebookOption {
  id: string
  title: string
}

export default function Home() {
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([])
  const [project, setProject] = useState<ProjectConfig | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [referencesLoading, setReferencesLoading] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<WritingBlock[]>([
    { id: uid(), text: 'Start writing here. Ask NotebookLM to generate a draft, then edit it here and attach references from Zotero.', references: [] },
  ])

  useEffect(() => {
    fetch('/api/notebooks').then(async (res) => {
      const data = await res.json()
      if (Array.isArray(data)) setNotebooks(data)
    })
  }, [])

  useEffect(() => {
    if (!project) return
    setReferencesLoading(true)
    fetch(`/api/zotero/items?collectionKey=${encodeURIComponent(project.zoteroCollectionKey)}`)
      .then(async (res) => {
        const data = await res.json()
        if (Array.isArray(data)) setReferences(data)
      })
      .finally(() => setReferencesLoading(false))
  }, [project])

  const sendToWriter = (content: string) => {
    const next: WritingBlock = { id: uid(), text: content, references: [] }
    setBlocks((prev) => [...prev, next])
    setActiveBlockId(next.id)
  }

  const stats = useMemo(() => {
    const words = blocks.map((b) => b.text).join(' ').trim().split(/\s+/).filter(Boolean).length
    return { words, refs: references.length, blocks: blocks.length }
  }, [blocks, references])

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">research-assistant</h1>
            <p className="text-sm text-slate-600">NotebookLM + AI writing + Zotero references in one workspace.</p>
          </div>
          {project ? (
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                <div>Words: <strong>{stats.words}</strong></div>
                <div>Blocks: <strong>{stats.blocks}</strong></div>
                <div>Refs: <strong>{stats.refs}</strong></div>
              </div>
              <button onClick={() => exportPdf(project, blocks, references)} className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200">Export PDF</button>
              <button onClick={() => exportDocx(project, blocks, references)} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">Export DOCX</button>
            </div>
          ) : null}
        </div>

        {!project ? (
          <ProjectSetup notebooks={notebooks} onCreate={setProject} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="h-[82vh] min-h-[720px]">
              <AskNotebookPane project={project} messages={messages} setMessages={setMessages} onSendToWriter={sendToWriter} />
            </div>
            <div className="grid h-[82vh] min-h-[720px] grid-rows-[1.3fr_0.9fr] gap-6">
              <WritingPane blocks={blocks} setBlocks={setBlocks} references={references} activeBlockId={activeBlockId} setActiveBlockId={setActiveBlockId} />
              <ZoteroPane references={references} loading={referencesLoading} activeBlockId={activeBlockId} blocks={blocks} setBlocks={setBlocks} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
