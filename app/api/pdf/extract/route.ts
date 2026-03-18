import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text using pdf-parse if available, otherwise use AI directly with base64
    let extractedText = '';
    try {
      // Dynamic import to avoid build-time issues if pdf-parse not installed
      const pdfModule = await import('pdf-parse');
      const pdfParse = (pdfModule as any).default || pdfModule;
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text.substring(0, 8000);
    } catch {
      // pdf-parse not available — inform AI to summarize the filename only
      extractedText = `[PDF content from file: ${file.name}. Could not extract text directly.]`;
    }

    // Send to AI for summarization
    const res = await fetch(`${process.env.OPENCLAW_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Summarize the main claims, methods, and findings of the provided text in 2-4 paragraphs. Return plain text only.',
          },
          {
            role: 'user',
            content: extractedText || `Summarize the PDF file named: ${file.name}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${err}` }, { status: 500 });
    }
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ text: summary, filename: file.name });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Extract error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
