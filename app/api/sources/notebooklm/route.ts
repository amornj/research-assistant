import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const NLM_BIN = '/Users/home/.local/bin/nlm';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const notebookId = form.get('notebookId') as string | null;

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    if (!notebookId) return NextResponse.json({ ok: false, error: 'No notebookId provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `nlm_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    writeFileSync(tmpPath, buffer);

    let details = '';
    try {
      const result = execSync(
        `${NLM_BIN} source add ${notebookId} --file "${tmpPath}" --wait`,
        { timeout: 120000, encoding: 'utf8', env: { ...process.env, HOME: '/Users/home' } }
      );
      details = result.trim();
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    return NextResponse.json({ ok: true, details });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
