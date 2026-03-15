import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const headers = {
  'Zotero-API-Key': process.env.ZOTERO_API_KEY || '',
  'Zotero-API-Version': '3',
}

const base = `${process.env.ZOTERO_API_BASE || `https://api.zotero.org/users/${process.env.ZOTERO_USER_ID || '7734498'}`}`

export async function GET(req: NextRequest) {
  try {
    const collectionKey = req.nextUrl.searchParams.get('collectionKey')
    if (!collectionKey) return NextResponse.json({ error: 'collectionKey required' }, { status: 400 })

    const resp = await fetch(`${base}/collections/${collectionKey}/items?limit=100`, { headers, cache: 'no-store' })
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: 502 })
    const items = await resp.json()
    const normalized = items
      .filter((item: any) => item?.data?.title)
      .map((item: any, index: number) => ({
        key: item.key,
        number: index + 1,
        title: item.data.title,
        creators: (item.data.creators || []).map((c: any) => [c.firstName, c.lastName].filter(Boolean).join(' ')).filter(Boolean),
        publicationTitle: item.data.publicationTitle || '',
        date: item.data.date || '',
        doi: item.data.DOI || '',
        url: item.data.url || '',
      }))
    return NextResponse.json(normalized)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
