import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `readwise_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    writeFileSync(tmpPath, buffer);

    const subject = file.name.replace(/\.pdf$/i, '');
    const script = `
tell application "Mail"
  set theMessage to make new outgoing message with properties {subject:"${subject.replace(/"/g, '\\"')}", content:""}
  tell theMessage
    make new to recipient with properties {address:"amornj@library.readwise.io"}
    make new attachment with properties {file name:POSIX file "${tmpPath}"}
    send
  end tell
end tell
`.trim();

    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 30000 });

    try { unlinkSync(tmpPath); } catch { /* ignore */ }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
