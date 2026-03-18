import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text, instruction, model = 'anthropic/claude-sonnet-4-20250514', context } = await req.json();
    if (!text || !instruction) {
      return NextResponse.json({ error: 'Missing text or instruction' }, { status: 400 });
    }

    const systemPrompt = context
      ? `You are a professional writing assistant. Return ONLY the rewritten text, nothing else. No explanations, no prefixes, no markdown code fences. Maintain continuity with the surrounding paragraphs. Here is the document context:\n\n${context}`
      : 'You are a professional writing assistant. Return ONLY the rewritten text, nothing else. No explanations, no prefixes, no markdown code fences.';

    const userPrompt = context
      ? `Rewrite the following paragraph according to this instruction: ${instruction}\n\nParagraph to rewrite:\n${text}`
      : `Rewrite the following text according to this instruction: ${instruction}\n\nText:\n${text}`;

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
          { role: 'user', content: userPrompt },
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
    console.error('Rewrite error:', e);
    const message = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
