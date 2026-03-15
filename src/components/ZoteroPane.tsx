'use client'

import type { ReferenceItem, WritingBlock } from '@/lib/types'
import { formatReference } from '@/lib/utils'

interface Props {
  references: ReferenceItem[]
  loading: boolean
  activeBlockId: string | null
  blocks: WritingBlock[]
  setBlocks: (blocks: WritingBlock[]) => void
}

export function ZoteroPane({ references, loading, activeBlockId, blocks, setBlocks }: Props) {
  const addRef = (key: string) => {
    if (!activeBlockId) return
    setBlocks(
      blocks.map((block) =>
        block.id === activeBlockId
          ? { ...block, references: block.references.includes(key) ? block.references : [...block.references, key] }
          : block
      )
    )
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Zotero references</h3>
        <p className="text-xs text-slate-500">Click references to attach them to the currently selected writing block.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? <p className="text-sm text-slate-500">Loading references…</p> : null}
        <div className="space-y-3">
          {references.map((ref) => (
            <button key={ref.key} onClick={() => addRef(ref.key)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
              <div className="text-sm font-medium text-slate-900">[{ref.number}] {ref.title}</div>
              <div className="mt-1 text-xs text-slate-500">{formatReference(ref)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
