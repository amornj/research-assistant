import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const OBSIDIAN_JOURNAL = '/Users/home/projects/obsidian/journal';

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const promptPath = path.join(os.tmpdir(), `summarize_prompt_${Date.now()}.txt`);

  try {
    const { title, text, filename } = await req.json() as { title: string; text: string; filename?: string };
    if (!title) return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });

    const slug = toSlug(title) || `source-${Date.now()}`;
    const outPath = path.join(OBSIDIAN_JOURNAL, `${slug}.md`);

    const hasText = text && text.trim().length > 0;
    const textSection = hasText
      ? `Full text (may be truncated):\n${text.slice(0, 30000)}`
      : `(No extractable text — summarize based on title/filename only)`;

    const prompt = `You are a research assistant. Summarize the following PDF document into a well-structured Obsidian markdown note.

Include:
- A YAML frontmatter block with title, date (today), and tags
- ## Summary section (3-5 sentences, or best effort if no text available)
- ## Key Points section (bullet list)
- ## Notable Quotes section (2-4 direct quotes if available, otherwise omit)
- ## Research Relevance section (how this might be useful for research)

PDF Title: ${title}
${filename ? `Filename: ${filename}` : ''}

${textSection}

Output ONLY the markdown content, no preamble.`;

    writeFileSync(promptPath, prompt);
    const result = execSync(
      `cat "${promptPath}" | claude --print --permission-mode bypassPermissions`,
      { timeout: 180000, encoding: 'utf8', env: { ...process.env, HOME: '/Users/home' } }
    );
    unlinkSync(promptPath);

    writeFileSync(outPath, result);

    return NextResponse.json({ ok: true, path: outPath, filename: `${slug}.md` });
  } catch (err: unknown) {
    try { unlinkSync(promptPath); } catch { /* ignore */ }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
