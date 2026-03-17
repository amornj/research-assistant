import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const apiKey = process.env.ZOTERO_API_KEY;
    const userId = process.env.ZOTERO_USER_ID;
    if (!apiKey || !userId) {
      return NextResponse.json({ error: 'Zotero not configured' }, { status: 400 });
    }
    const res = await fetch(
      `https://api.zotero.org/users/${userId}/items?q=${encodeURIComponent(q)}&limit=20&format=json`,
      {
        headers: { 'Zotero-API-Key': apiKey },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Zotero API error: ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to search Zotero' }, { status: 500 });
  }
}
