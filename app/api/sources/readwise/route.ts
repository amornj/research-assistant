import { NextRequest, NextResponse } from 'next/server';

const READWISE_TOKEN = process.env.READWISE_TOKEN || 'N8sP1Wwih0yJHTu1q4PQGwOAaOw6DzYqv3lF8znLQ3JMeIAjpq';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    // Use Readwise save API with URL approach — upload the file as base64 data URL
    // Actually, Readwise Reader save endpoint works best with URLs.
    // For local PDFs, the email method via osascript is most reliable.
    // Try osascript first, fall back to writing a temp file and using Mail.

    const buffer = Buffer.from(await file.arrayBuffer());

    // Method: use osascript via spawn (more reliable than execSync for Mail.app)
    const { writeFileSync, unlinkSync } = await import('fs');
    const { execSync } = await import('child_process');
    const path = await import('path');
    const os = await import('os');

    const tmpPath = path.join(os.tmpdir(), `readwise_${Date.now()}.pdf`);
    const scriptPath = path.join(os.tmpdir(), `readwise_mail_${Date.now()}.applescript`);

    writeFileSync(tmpPath, buffer);

    const subject = file.name.replace(/\.pdf$/i, '').replace(/["\\\n\r]/g, ' ');
    const script = [
      'tell application "Mail"',
      `  set targetAccount to first account whose name is "Google"`,
      `  set newMessage to make new outgoing message with properties {subject:"${subject}", content:"Imported by research-assistant", visible:false}`,
      '  tell newMessage',
      `    make new to recipient at end of to recipients with properties {address:"amornj@library.readwise.io"}`,
      `    make new attachment with properties {file name:POSIX file "${tmpPath}"} at after the last paragraph`,
      '    send',
      '  end tell',
      'end tell',
    ].join('\n');

    writeFileSync(scriptPath, script, 'utf8');

    try {
      execSync(`/usr/bin/osascript "${scriptPath}" 2>&1`, {
        timeout: 60000,
        encoding: 'utf8',
        env: { ...process.env, HOME: '/Users/home' },
      });
      return NextResponse.json({ ok: true, method: 'email' });
    } catch (osErr) {
      // osascript failed — try curl to Readwise save API as fallback
      try {
        const saveRes = await fetch('https://readwise.io/api/v3/save/', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${READWISE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `file://${tmpPath}`,
            title: file.name.replace(/\.pdf$/i, ''),
            category: 'pdf',
            tags: ['pdf-up', 'research-assistant'],
          }),
        });
        if (saveRes.ok) {
          return NextResponse.json({ ok: true, method: 'api-fallback' });
        }
      } catch { /* fallback also failed */ }

      const message = osErr instanceof Error ? osErr.message : String(osErr);
      return NextResponse.json({ ok: false, error: `Mail failed: ${message.slice(0, 200)}` }, { status: 500 });
    } finally {
      try { unlinkSync(tmpPath); } catch {}
      try { unlinkSync(scriptPath); } catch {}
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
