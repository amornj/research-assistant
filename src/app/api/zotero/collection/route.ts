import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const headers = {
  'Zotero-API-Key': process.env.ZOTERO_API_KEY || '',
  'Zotero-API-Version': '3',
}

const base = `${process.env.ZOTERO_API_BASE || `https://api.zotero.org/users/${process.env.ZOTERO_USER_ID || '7734498'}`}`

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get('name')
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const listResp = await fetch(`${base}/collections`, { headers, cache: 'no-store' })
    if (!listResp.ok) return NextResponse.json({ error: await listResp.text() }, { status: 502 })
    const collections = await listResp.json()
    const exact = collections.find((c: any) => c?.data?.name?.toLowerCase() === name.toLowerCase())
    if (exact) return NextResponse.json({ key: exact.key, name: exact.data.name })

    const createResp = await fetch(`${base}/collections`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ name }]),
    })
    if (!createResp.ok) return NextResponse.json({ error: await createResp.text() }, { status: 502 })
    const created = await createResp.json()
    return NextResponse.json({ key: created.successful['0'].key, name })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
