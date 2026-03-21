import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

const NLM_BIN = '/Users/home/.local/bin/nlm';

export async function POST(req: NextRequest) {
  let tmpPath = '';
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const notebookId = form.get('notebookId') as string | null;

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    if (!notebookId) return NextResponse.json({ ok: false, error: 'No notebookId provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(os.tmpdir(), `nlm_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    writeFileSync(tmpPath, buffer);

    const result = spawnSync(NLM_BIN, ['source', 'add', notebookId, '--file', tmpPath, '--wait'], {
      timeout: 180000,
      encoding: 'utf8',
      env: { ...process.env, HOME: '/Users/home' },
    });

    if (result.error) throw result.error;
    const output = (result.stdout || '') + (result.stderr || '');
    if (result.status !== 0) {
      throw new Error(output.trim() || `nlm exited with code ${result.status}`);
    }

    return NextResponse.json({ ok: true, details: output.trim().slice(0, 300) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  } finally {
    if (tmpPath) try { unlinkSync(tmpPath); } catch {}
  }
}
