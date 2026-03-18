import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const doi = searchParams.get('doi') || '';
  if (!doi) return NextResponse.json({ error: 'Missing doi' }, { status: 400 });
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'ResearchAssistant/1.0 (mailto:research@example.com)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ error: `CrossRef error: ${res.status}` }, { status: res.status });
    const json = await res.json();
    const work = json.message;
    return NextResponse.json({
      data: {
        title: work.title?.[0] || '',
        author: work.author || [],
        published: work.published || work['published-print'] || work['published-online'],
        'container-title': work['container-title'] || [],
        volume: work.volume || '',
        page: work.page || '',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'CrossRef lookup failed' }, { status: 500 });
  }
}
