import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

const NLM_BIN = '/Users/home/.local/bin/nlm';

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Notebook name is required' }, { status: 400 });
    }

    const safeName = name.trim().replace(/['"\\]/g, '');
    const output = execSync(`${NLM_BIN} notebook create "${safeName}"`, {
      timeout: 30000,
      encoding: 'utf8',
    });

    // Parse notebook ID from CLI output — typical format: "Created notebook: <id>" or JSON
    let notebookId = '';
    const idMatch = output.match(/notebook[_\s-]?id[:\s]+([a-zA-Z0-9_-]+)/i)
      || output.match(/created[:\s]+([a-zA-Z0-9_-]{8,})/i)
      || output.match(/([a-zA-Z0-9_-]{10,})/);
    if (idMatch) notebookId = idMatch[1];

    // Also try JSON parse
    if (!notebookId) {
      try {
        const parsed = JSON.parse(output);
        notebookId = parsed.id || parsed.notebook_id || parsed.notebookId || '';
      } catch { /* not JSON */ }
    }

    if (!notebookId) {
      return NextResponse.json({ ok: false, error: `Could not parse notebook ID from: ${output.trim()}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, notebookId, name: safeName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
