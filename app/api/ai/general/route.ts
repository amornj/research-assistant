import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a helpful research and writing assistant.',
      messages: [{ role: 'user', content: message }],
    });
    const result = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ text: result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
