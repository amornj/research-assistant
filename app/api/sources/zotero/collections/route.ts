import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.ZOTERO_API_KEY;
    const userId = process.env.ZOTERO_USER_ID;
    if (!apiKey || !userId) return NextResponse.json({ ok: false, error: 'Missing Zotero env vars' }, { status: 500 });

    const res = await fetch(`https://api.zotero.org/users/${userId}/collections?limit=100`, {
      headers: { 'Zotero-API-Key': apiKey, 'Zotero-API-Version': '3' },
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `Zotero API error: ${res.status}` }, { status: 500 });

    const data = await res.json() as Array<{ key: string; data: { name: string } }>;
    const collections = data.map(c => ({ key: c.key, name: c.data.name }));

    return NextResponse.json({ ok: true, collections });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
