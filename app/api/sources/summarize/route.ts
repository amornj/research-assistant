import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
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
  try {
    const { title, text, filename } = await req.json() as { title: string; text: string; filename?: string };
    if (!title) return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });

    const slug = toSlug(title) || `source-${Date.now()}`;
    const outPath = path.join(OBSIDIAN_JOURNAL, `${slug}.md`);

    const hasText = text && text.trim().length > 0;
    const excerpt = hasText ? text.slice(0, 60000) : '';

    // Match pdf-up CLI approach: pass prompt as CLI argument to claude
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
${hasText ? `\nPDF TEXT:\n${excerpt}` : '\n(No extractable text — summarize based on title/filename only)'}`;

    // Pass prompt as argument like pdf-up does
    const result = spawnSync(CLAUDE_BIN, [
      '--permission-mode', 'bypassPermissions',
      '--print',
      '--model', 'sonnet',
      prompt,
    ], {
      timeout: 600000,
      encoding: 'utf8',
      cwd: os.homedir(),
      env: { ...process.env, HOME: '/Users/home' },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || '').trim().slice(0, 400) || `Claude exited with code ${result.status}`);
    }

    const header = `# ${title}\n\n> Source PDF: \`${filename || title}\`\n\n`;
    writeFileSync(outPath, header + result.stdout.trim() + '\n');

    return NextResponse.json({ ok: true, path: outPath, filename: `${slug}.md` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}
