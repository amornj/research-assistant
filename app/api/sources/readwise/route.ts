import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  let tmpPath = '';
  let scriptPath = '';
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Use a clean filename — no spaces or special chars in the temp path
    tmpPath = path.join(os.tmpdir(), `readwise_${Date.now()}.pdf`);
    writeFileSync(tmpPath, buffer);

    const subject = file.name.replace(/\.pdf$/i, '').replace(/"/g, "'").replace(/\\/g, '');

    // Write AppleScript to a temp file — more reliable than -e with complex scripts
    const script = `tell application "Mail"
  set targetAccount to first account whose name is "Google"
  set newMessage to make new outgoing message with properties {subject:"${subject}", content:"Imported by research-assistant" & return & return, visible:false}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"amornj@library.readwise.io"}
    make new attachment with properties {file name:POSIX file "${tmpPath}"} at after the last paragraph
    send
  end tell
end tell`;

    scriptPath = path.join(os.tmpdir(), `mail_${Date.now()}.scpt`);
    writeFileSync(scriptPath, script, 'utf8');

    // Retry up to 2 times
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync('/usr/bin/osascript', [scriptPath], {
        timeout: 180000,
        encoding: 'utf8',
        env: { ...process.env, HOME: '/Users/home' },
      });

      if (result.status === 0) {
        return NextResponse.json({ ok: true, method: 'email' });
      }
      lastError = ((result.stderr || '') + (result.stdout || '')).trim().slice(0, 400);
      if (result.error) lastError = result.error.message;

      // Wait 2s before retry
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }

    return NextResponse.json({ ok: false, error: `Mail failed after retry: ${lastError}` }, { status: 500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    // Clean up script immediately, but delay PDF cleanup so Mail.app can attach it
    if (scriptPath) try { unlinkSync(scriptPath); } catch {}
    if (tmpPath) setTimeout(() => { try { unlinkSync(tmpPath); } catch {} }, 60000);
  }
}
