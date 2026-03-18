import { NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

    // Fetch the page
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ error: `Fetch error: ${res.status}` }, { status: 500 });
    const html = await res.text();

    // Extract metadata using regex (no cheerio dependency needed for basic OG tags)
    const getMetaContent = (name: string): string => {
      const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'));
      return match?.[1] || '';
    };
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const title = getMetaContent('og:title') || getMetaContent('twitter:title') || titleMatch?.[1] || url;
    const description = getMetaContent('og:description') || getMetaContent('description') || getMetaContent('twitter:description') || '';
    const author = getMetaContent('author') || getMetaContent('article:author') || '';
    const publishedDate = getMetaContent('article:published_time') || getMetaContent('datePublished') || '';

    // Build a citation-like object
    const item = {
      key: `url_${Date.now()}`,
      data: {
        title: title.trim(),
        creators: author ? [{ name: author.trim() }] : [],
        date: publishedDate ? publishedDate.substring(0, 10) : '',
        url: url,
        abstractNote: description.trim(),
        itemType: 'webpage',
      },
    };

    return NextResponse.json({ item, title, description, author });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'URL extract error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
