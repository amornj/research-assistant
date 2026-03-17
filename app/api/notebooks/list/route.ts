import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const proxyUrl = process.env.NLM_PROXY_URL;
    const apiKey = process.env.NLM_PROXY_KEY;
    if (!proxyUrl) {
      return NextResponse.json([]);
    }
    const res = await fetch(`${proxyUrl}/notebooks`, {
      headers: { 'x-api-key': apiKey || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
