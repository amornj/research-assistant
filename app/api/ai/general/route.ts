import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { message, model = 'anthropic/claude-sonnet-4-20250514', documentContext } = await req.json();

    const systemPrompt = documentContext
      ? `You are a helpful research and writing assistant. The user is working on a document. Here is their current draft:\n\n${documentContext}\n\nAnswer questions about the document, help improve it, or provide writing assistance.`
      : 'You are a helpful research and writing assistant.';

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
          { role: 'user', content: message },
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
