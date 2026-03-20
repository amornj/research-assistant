import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

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
  try {
    const { title, text, filename } = await req.json() as { title: string; text: string; filename?: string };
    if (!title || !text) return NextResponse.json({ ok: false, error: 'Missing title or text' }, { status: 400 });

    const slug = toSlug(title) || `source-${Date.now()}`;
    const outPath = path.join(OBSIDIAN_JOURNAL, `${slug}.md`);

    const prompt = `You are a research assistant. Summarize the following PDF document into a well-structured Obsidian markdown note.

Include:
- A YAML frontmatter block with title, date (today), and tags
- ## Summary section (3-5 sentences)
- ## Key Points section (bullet list)
- ## Notable Quotes section (2-4 direct quotes if available)
- ## Research Relevance section (how this might be useful for research)

PDF Title: ${title}
${filename ? `Filename: ${filename}` : ''}

Full text (may be truncated):
${text.slice(0, 12000)}

Output ONLY the markdown content, no preamble.`;

    const escaped = prompt.replace(/'/g, "'\\''").replace(/\\/g, '\\\\');
    const result = execSync(
      `claude --print --permission-mode bypassPermissions '${escaped}'`,
      { timeout: 120000, encoding: 'utf8', env: { ...process.env, HOME: '/Users/home' } }
    );

    writeFileSync(outPath, result);

    return NextResponse.json({ ok: true, path: outPath, filename: `${slug}.md` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
