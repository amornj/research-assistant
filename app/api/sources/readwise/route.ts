import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  const tmpPath = path.join(os.tmpdir(), `readwise_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const scriptPath = path.join(os.tmpdir(), `readwise_mail_${Date.now()}.scpt`);

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpPath, buffer);

    const subject = file.name.replace(/\.pdf$/i, '');
    const script = `tell application "Mail"
  set targetAccount to first account whose name is "Google"
  set newMessage to make new outgoing message with properties {subject:"${subject.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", content:"Imported by research-assistant", visible:false}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"amornj@library.readwise.io"}
    make new attachment with properties {file name:POSIX file "${tmpPath}"} at after the last paragraph
    send
  end tell
end tell`;

    writeFileSync(scriptPath, script);
    execSync(`osascript "${scriptPath}"`, { timeout: 30000 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}
