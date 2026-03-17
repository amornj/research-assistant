import { NextResponse } from 'next/server';

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const proxyUrl = process.env.NLM_PROXY_URL;
    const apiKey = process.env.NLM_PROXY_KEY;
    if (!proxyUrl) {
      return NextResponse.json({ answer: 'NLM proxy not configured.' });
    }
    const res = await fetch(`${proxyUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ answer: 'Failed to query NotebookLM.' }, { status: 500 });
  }
}
