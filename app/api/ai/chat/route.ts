import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { message, documentContext, history = [] } = await req.json();
    const systemPrompt = documentContext
      ? `You are a research writing assistant. The user is working on a document. Help them write, edit, and improve their document.\n\nCurrent document content:\n${documentContext}`
      : 'You are a research writing assistant. Help the user write and improve their document.';

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });
    const result = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return NextResponse.json({ text: result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
