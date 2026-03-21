export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { spawnSync } from 'child_process';

const NLM_BIN = '/Users/home/.local/bin/nlm';

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Notebook name is required' }, { status: 400 });
    }

    const safeName = name.trim();
    const result = spawnSync(NLM_BIN, ['notebook', 'create', safeName], {
      timeout: 30000,
      encoding: 'utf8',
      env: { ...process.env, HOME: '/Users/home' },
    });

    if (result.error) throw result.error;
    const output = ((result.stdout || '') + (result.stderr || '')).trim();
    if (result.status !== 0) {
      throw new Error(output || `nlm exited with code ${result.status}`);
    }

    // Parse: "✓ Created notebook: Name\n  ID: uuid-here"
    let notebookId = '';
    const idMatch = output.match(/ID:\s*([a-f0-9-]{36})/i)
      || output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (idMatch) notebookId = idMatch[1];

    if (!notebookId) {
      return NextResponse.json({ ok: false, error: `Could not parse notebook ID from: ${output.slice(0, 200)}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, notebookId, name: safeName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}
