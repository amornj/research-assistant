export const runtime = 'nodejs';
export const maxDuration = 600;

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const PDF_UP_BIN = '/Library/Frameworks/Python.framework/Versions/3.13/bin/pdf-up';
const DOWNLOADS_DIR = '/Users/home/Downloads';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const collection = form.get('collection') as string | null;
    const notebookId = form.get('notebookId') as string | null;

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    // Save PDF to Downloads
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_');
    const pdfPath = path.join(DOWNLOADS_DIR, safeName);
    writeFileSync(pdfPath, buffer);

    // Build pdf-up args
    const args = [pdfPath, '--yes'];
    if (collection) args.push('--zotero-collection', collection);
    if (notebookId) args.push('--notebook-id', notebookId);

    // Run pdf-up as a detached subprocess
    const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
      let output = '';
      const proc = spawn(PDF_UP_BIN, args, {
        env: { ...process.env, HOME: '/Users/home' },
        cwd: DOWNLOADS_DIR,
        timeout: 600000,
      });

      proc.stdout?.on('data', (d) => { output += d.toString(); });
      proc.stderr?.on('data', (d) => { output += d.toString(); });

      proc.on('close', (code) => {
        resolve({ ok: code === 0, output: output.trim() });
      });

      proc.on('error', (err) => {
        resolve({ ok: false, output: err.message });
      });
    });

    return NextResponse.json({
      ok: result.ok,
      output: result.output.slice(0, 1000),
      pdfPath,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
