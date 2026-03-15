import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { notebookId, question } = await req.json()
    if (!notebookId || !question) {
      return NextResponse.json({ error: 'notebookId and question are required' }, { status: 400 })
    }

    const proxyUrl = process.env.NLM_PROXY_URL || 'http://localhost:3847'
    const apiKey = process.env.NLM_PROXY_KEY || ''

    const response = await fetch(`${proxyUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ notebook_id: notebookId, question }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: await response.text() }, { status: 502 })
    }

    const data = await response.json()
    return NextResponse.json({ answer: data.answer || '' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
