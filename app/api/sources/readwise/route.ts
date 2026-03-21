import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  let tmpPath = '';
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(os.tmpdir(), `readwise_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    writeFileSync(tmpPath, buffer);

    // Match pdf-up CLI approach: pass AppleScript via -e argument to osascript
    const subject = file.name.replace(/\.pdf$/i, '').replace(/"/g, "'");
    const body = 'Imported by research-assistant';
    const script = `
    tell application "Mail"
      set targetAccount to first account whose name is "Google"
      set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${body}" & return & return, visible:false}
      tell newMessage
        make new to recipient at end of to recipients with properties {address:"amornj@library.readwise.io"}
        make new attachment with properties {file name:POSIX file "${tmpPath}"} at after the last paragraph
        send
      end tell
    end tell
    `;

    // Retry up to 2 times like pdf-up does
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync('/usr/bin/osascript', ['-e', script], {
        timeout: 180000,
        encoding: 'utf8',
        env: { ...process.env, HOME: '/Users/home' },
      });

      if (result.status === 0) {
        return NextResponse.json({ ok: true, method: 'email' });
      }
      lastError = ((result.stderr || '') + (result.stdout || '')).trim().slice(0, 400);

      // Wait 2s before retry
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({ ok: false, error: `Mail failed after retry: ${lastError}` }, { status: 500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    // Don't delete tmpPath immediately — Mail.app needs time to attach it
    // Schedule cleanup after 30s
    if (tmpPath) setTimeout(() => { try { unlinkSync(tmpPath); } catch {} }, 30000);
  }
}
