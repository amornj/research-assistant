import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { message, documentContext, history = [], model = 'anthropic/claude-sonnet-4-20250514' } = await req.json();
    const systemPrompt = documentContext
      ? `You are a research writing assistant. The user is working on a document. Help them write, edit, and improve their document.\n\nCurrent document content:\n${documentContext}`
      : 'You are a research writing assistant. Help the user write and improve their document.';

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const res = await fetch(`${process.env.OPENCLAW_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Gateway error: ${err}` }, { status: 500 });
    }
    const data = await res.json();
    const result = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ text: result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
