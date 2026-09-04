import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

function getDataDirectory(): string {
  const cwd = process.cwd();
  if (cwd.includes('/apps/web')) {
    return path.resolve(cwd, '../../data');
  }
  const idx = cwd.indexOf('MingleBooth');
  if (idx !== -1) {
    return path.join(cwd.substring(0, idx + 'MingleBooth'.length), 'data');
  }
  return path.resolve(cwd, 'data');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const customStoragePath = searchParams.get('customStoragePath');

    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing eventId query parameter' },
        { status: 400, headers: corsHeaders }
      );
    }

    const eventDir = customStoragePath
      ? path.resolve(customStoragePath)
      : path.join(getDataDirectory(), 'events', eventId);
    const processedDir = path.join(eventDir, 'processed');
    const rawDir = path.join(eventDir, 'raw');
    const thumbnailsDir = path.join(eventDir, 'thumbnails');
    const gifsDir = path.join(eventDir, 'gifs');

    const getFiles = async (dir: string) => {
      try {
        const list = await fs.readdir(dir);
        return list.filter((f) => !f.startsWith('.'));
      } catch {
        return [];
      }
    };

    const [processedFiles, rawFiles, thumbnailFiles, gifFiles] = await Promise.all([
      getFiles(processedDir),
      getFiles(rawDir),
      getFiles(thumbnailsDir),
      getFiles(gifsDir),
    ]);

    let totalBytes = 0;
    const calcDirSize = async (dir: string): Promise<number> => {
      try {
        let size = 0;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            const stat = await fs.stat(fullPath);
            size += stat.size;
          } else if (entry.isDirectory()) {
            size += await calcDirSize(fullPath);
          }
        }
        return size;
      } catch {
        return 0;
      }
    };

    totalBytes = await calcDirSize(eventDir);

    return NextResponse.json(
      {
        success: true,
        eventId,
        eventDir,
        processedCount: processedFiles.length,
        rawCount: rawFiles.length,
        thumbnailsCount: thumbnailFiles.length,
        gifsCount: gifFiles.length,
        totalBytes,
        processedFiles: processedFiles.slice(-10), // latest 10 files
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to list storage files' },
      { status: 500, headers: corsHeaders }
    );
  }
}
