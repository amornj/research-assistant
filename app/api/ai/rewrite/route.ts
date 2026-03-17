import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { text, instruction } = await req.json();
    if (!text || !instruction) {
      return NextResponse.json({ error: 'Missing text or instruction' }, { status: 400 });
    }
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a professional writing assistant. Return ONLY the rewritten text, nothing else. No explanations, no prefixes, no markdown code fences.',
      messages: [
        {
          role: 'user',
          content: `Rewrite the following text according to this instruction: ${instruction}\n\nText:\n${text}`,
        },
      ],
    });
    const result = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ text: result });
  } catch (e: unknown) {
    console.error('Rewrite error:', e);
    const message = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
