export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

const OBSIDIAN_JOURNAL = '/Users/home/projects/obsidian/journal';
const CLAUDE_BIN = '/Users/home/.local/bin/claude';

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  let tmpPdf = '';
  try {
    const contentType = req.headers.get('content-type') || '';

    let title = '';
    let text = '';
    let filename = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

      filename = file.name;
      title = filename.replace(/\.pdf$/i, '');

      const buffer = Buffer.from(await file.arrayBuffer());
      tmpPdf = path.join(os.tmpdir(), `summarize_${Date.now()}.pdf`);
      writeFileSync(tmpPdf, buffer);

      // Extract text using pdftotext (poppler)
      const pdftotext = spawnSync('pdftotext', [tmpPdf, '-'], {
        timeout: 30000,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      if (pdftotext.status === 0 && pdftotext.stdout.trim()) {
        text = pdftotext.stdout;
      }
    } else {
      const body = await req.json() as { title: string; text?: string; filename?: string };
      title = body.title;
      text = body.text || '';
      filename = body.filename || title;
    }

    if (!title) return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });

    const slug = toSlug(title) || `source-${Date.now()}`;
    const outPath = path.join(OBSIDIAN_JOURNAL, `${slug}.md`);
    mkdirSync(path.dirname(outPath), { recursive: true });

    const excerpt = text ? text.slice(0, 60000) : '';

    const prompt = `You are summarizing a PDF for an Obsidian note.
Return markdown only.

Create:
- Title
- Citation (if inferable; otherwise use filename)
- Summary (3-5 paragraphs)
- Key points (bullets)
- Clinical / practical implications (bullets)
- 5 take-home messages

Filename: ${filename || title}
${excerpt ? `\nPDF TEXT:\n${excerpt}` : '\n(No extractable text — summarize based on title/filename only)'}`;

    // Use stdin to pass prompt — avoids ARG_MAX/ENOBUFS issues with large texts
    const result = spawnSync(CLAUDE_BIN, [
      '--permission-mode', 'bypassPermissions',
      '--print',
      '--model', 'sonnet',
    ], {
      input: prompt,
      timeout: 600000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: os.homedir(),
      env: { ...process.env, HOME: '/Users/home' },
    });

    if (result.error) {
      throw new Error(`Claude spawn error: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const errMsg = (result.stderr || result.stdout || '').trim().slice(0, 400);
      throw new Error(errMsg || `Claude exited with code ${result.status}`);
    }

    const header = `# ${title}\n\n> Source PDF: \`${filename || title}\`\n\n`;
    writeFileSync(outPath, header + result.stdout.trim() + '\n');

    return NextResponse.json({ ok: true, path: outPath, filename: `${slug}.md` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  } finally {
    if (tmpPdf) try { unlinkSync(tmpPdf); } catch {}
  }
}
