import { NextRequest, NextResponse } from 'next/server';

async function getOrCreateCollection(apiKey: string, userId: string, name: string): Promise<string> {
  // List all collections
  const listRes = await fetch(`https://api.zotero.org/users/${userId}/collections?limit=100`, {
    headers: { 'Zotero-API-Key': apiKey, 'Zotero-API-Version': '3' },
  });
  if (!listRes.ok) throw new Error(`Failed to list collections: ${listRes.status}`);
  const collections = await listRes.json() as Array<{ key: string; data: { name: string } }>;

  const existing = collections.find(c => c.data.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.key;

  // Create new collection
  const createRes = await fetch(`https://api.zotero.org/users/${userId}/collections`, {
    method: 'POST',
    headers: {
      'Zotero-API-Key': apiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ name }]),
  });
  if (!createRes.ok) throw new Error(`Failed to create collection: ${createRes.status}`);
  const created = await createRes.json() as { success: Record<string, string> };
  const key = Object.values(created.success)[0];
  if (!key) throw new Error('No collection key returned');
  return key;
}

export async function POST(req: NextRequest) {
  try {
    const { title, text, doi, collection } = await req.json() as {
      title: string;
      text?: string;
      doi?: string;
      collection: string;
    };

    if (!title || !collection) {
      return NextResponse.json({ ok: false, error: 'Missing title or collection' }, { status: 400 });
    }

    const apiKey = process.env.ZOTERO_API_KEY;
    const userId = process.env.ZOTERO_USER_ID;
    if (!apiKey || !userId) return NextResponse.json({ ok: false, error: 'Missing Zotero env vars' }, { status: 500 });

    const collectionKey = await getOrCreateCollection(apiKey, userId, collection);

    const item: Record<string, unknown> = {
      itemType: 'journalArticle',
      title,
      collections: [collectionKey],
      abstractNote: text ? text.slice(0, 2000) : '',
    };
    if (doi) item.DOI = doi;

    const createRes = await fetch(`https://api.zotero.org/users/${userId}/items`, {
      method: 'POST',
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([item]),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Zotero item creation failed: ${createRes.status} ${body}`);
    }

    const result = await createRes.json() as { success: Record<string, string> };
    const itemKey = Object.values(result.success)[0];

    return NextResponse.json({ ok: true, itemKey, collection });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
