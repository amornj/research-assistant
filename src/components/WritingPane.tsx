'use client'

import type { ReferenceItem, WritingBlock } from '@/lib/types'
import { formatReference } from '@/lib/utils'

interface Props {
  blocks: WritingBlock[]
  setBlocks: (blocks: WritingBlock[]) => void
  references: ReferenceItem[]
  activeBlockId: string | null
  setActiveBlockId: (id: string | null) => void
}

export function WritingPane({ blocks, setBlocks, references, activeBlockId, setActiveBlockId }: Props) {
  const refMap = new Map(references.map((r) => [r.key, r]))

  const updateText = (id: string, text: string) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, text } : b)))
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setBlocks(next)
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">AI Writing</h3>
        <p className="text-xs text-slate-500">Editable block-based draft. References stay attached to blocks when moved.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {blocks.map((block, index) => (
          <div key={block.id} className={`rounded-2xl border p-4 ${activeBlockId === block.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'}`}>
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>Block {index + 1}</span>
              <div className="flex gap-2">
                <button onClick={() => move(block.id, -1)} className="rounded bg-slate-100 px-2 py-1">↑</button>
                <button onClick={() => move(block.id, 1)} className="rounded bg-slate-100 px-2 py-1">↓</button>
              </div>
            </div>
            <textarea
              value={block.text}
              onFocus={() => setActiveBlockId(block.id)}
              onChange={(e) => updateText(block.id, e.target.value)}
              className="min-h-44 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm"
            />
            {block.references.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <div className="mb-2 font-medium">Attached references</div>
                <ul className="space-y-1">
                  {block.references.map((key) => {
                    const ref = refMap.get(key)
                    return ref ? <li key={key}>[{ref.number}] {formatReference(ref)}</li> : null
                  })}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
