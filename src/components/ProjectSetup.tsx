'use client'

import { useState } from 'react'
import type { ProjectConfig } from '@/lib/types'
import { uid } from '@/lib/utils'

interface NotebookOption {
  id: string
  title: string
}

interface Props {
  notebooks: NotebookOption[]
  onCreate: (project: ProjectConfig) => void
}

export function ProjectSetup({ notebooks, onCreate }: Props) {
  const [name, setName] = useState('Amyloidosis Writing Project')
  const [notebookName, setNotebookName] = useState('amyloidosis')
  const [zoteroCollectionName, setZoteroCollectionName] = useState('amyloidosis')
  const [error, setError] = useState('')

  const handleCreate = async () => {
    const match = notebooks.find((nb) => nb.title.toLowerCase() === notebookName.toLowerCase()) || notebooks.find((nb) => nb.title.toLowerCase().includes(notebookName.toLowerCase()))
    if (!match) {
      setError('NotebookLM notebook name not found.')
      return
    }

    const res = await fetch(`/api/zotero/collection?name=${encodeURIComponent(zoteroCollectionName)}`)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Unable to resolve Zotero collection')
      return
    }

    onCreate({
      id: uid(),
      name,
      notebookName: match.title,
      notebookId: match.id,
      zoteroCollectionName: data.name,
      zoteroCollectionKey: data.key,
      createdAt: Date.now(),
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">Create a research project</h2>
      <p className="mt-2 text-sm text-slate-600">Blend NotebookLM, AI writing, and Zotero references in one workspace.</p>
      <div className="mt-6 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Project name</span>
          <input className="rounded-xl border border-slate-300 px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">NotebookLM notebook name</span>
          <input className="rounded-xl border border-slate-300 px-4 py-3" value={notebookName} onChange={(e) => setNotebookName(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Zotero collection name</span>
          <input className="rounded-xl border border-slate-300 px-4 py-3" value={zoteroCollectionName} onChange={(e) => setZoteroCollectionName(e.target.value)} />
        </label>
      </div>
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <button onClick={handleCreate} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">Create project</button>
    </div>
  )
}
