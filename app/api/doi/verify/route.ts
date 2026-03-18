import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const doi = searchParams.get('doi') || '';
  if (!doi) return NextResponse.json({ valid: false });
  try {
    const res = await fetch(`https://doi.org/${doi}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ valid: res.ok || res.status === 301 || res.status === 302 || res.redirected });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
