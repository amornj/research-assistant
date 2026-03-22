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

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    await ensureDir();
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const projects = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
          const project = JSON.parse(content);
          // Return minimal data for list view (handle old snake_case schema)
          return {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt || project.created_at,
            lastModified: project.lastModified,
            notebookName: project.notebookName || project.notebook_name,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = projects.filter(Boolean);
    // Sort by lastModified (then createdAt) descending — most recently edited first
    valid.sort((a: any, b: any) => {
      const ta = new Date(a.lastModified || a.createdAt || 0).getTime();
      const tb = new Date(b.lastModified || b.createdAt || 0).getTime();
      return tb - ta;
    });

    return NextResponse.json(valid);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}
