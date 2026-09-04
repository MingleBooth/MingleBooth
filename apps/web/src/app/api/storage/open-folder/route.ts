import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import os from 'os';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { folderPath, eventId, subPath } = body;

    let targetDir: string;

    if (folderPath && path.isAbsolute(folderPath)) {
      targetDir = subPath ? path.join(folderPath, subPath) : folderPath;
    } else {
      const rootDir = folderPath
        ? path.resolve(getDataDirectory(), '..', folderPath.replace(/^\.\//, ''))
        : getDataDirectory();

      if (eventId) {
        targetDir = subPath
          ? path.join(rootDir, 'events', eventId, subPath)
          : path.join(rootDir, 'events', eventId);
      } else if (folderPath) {
        targetDir = path.resolve(rootDir, folderPath.replace(/^\.\//, ''));
      } else {
        targetDir = rootDir;
      }
    }

    // Ensure the folder exists before attempting to open
    if (!fsSync.existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    // Open directory in native OS file manager
    const platform = os.platform();
    let command: string;

    if (platform === 'darwin') {
      command = `open "${targetDir}"`;
    } else if (platform === 'win32') {
      command = `explorer.exe "${targetDir}"`;
    } else {
      command = `xdg-open "${targetDir}"`;
    }

    await new Promise<void>((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          console.error('[Open Folder Exec Error]:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    return NextResponse.json(
      {
        success: true,
        path: targetDir,
        message: `Folder opened in ${platform === 'darwin' ? 'Finder' : 'File Explorer'}`,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Storage Open Folder Error]:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to open directory',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
