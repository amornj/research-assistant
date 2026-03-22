import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'projects');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (process.env.PROJECTS_API_KEY && apiKey !== process.env.PROJECTS_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function projectPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const content = await fs.readFile(projectPath(id), 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to read project' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    await ensureDir();
    const data = await request.json();
    await fs.writeFile(projectPath(id), JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to write project' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    await ensureDir();
    let existing: any = {};
    try {
      const content = await fs.readFile(projectPath(id), 'utf-8');
      existing = JSON.parse(content);
    } catch {
      // File doesn't exist yet — patch creates it
    }
    const patch = await request.json();
    const merged = { ...existing, ...patch };
    await fs.writeFile(projectPath(id), JSON.stringify(merged, null, 2), 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to patch project' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    await fs.unlink(projectPath(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
