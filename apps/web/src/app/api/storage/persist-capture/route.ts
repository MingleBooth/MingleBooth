import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

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

/**
 * Local Storage Persistence Endpoint
 * Saves real binary JPG files into data/events/{eventId}/
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, photoId, compositeDataUrl, gifDataUrl, rawPhotos, customStoragePath } = body;

    if (!eventId || !photoId || !compositeDataUrl) {
      return NextResponse.json(
        { error: 'Missing required capture fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    const baseDir = customStoragePath
      ? path.resolve(customStoragePath)
      : path.join(getDataDirectory(), 'events', eventId);
    const rawDir = path.join(baseDir, 'raw');
    const processedDir = path.join(baseDir, 'processed');
    const thumbnailsDir = path.join(baseDir, 'thumbnails');
    const gifsDir = path.join(baseDir, 'gifs');
    const metadataDir = path.join(baseDir, 'metadata');

    await fs.mkdir(rawDir, { recursive: true });
    await fs.mkdir(processedDir, { recursive: true });
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.mkdir(gifsDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });

    // Process composite image buffer
    let rawBuffer: Buffer;
    if (compositeDataUrl.includes(';base64,')) {
      const base64Data = compositeDataUrl.split(';base64,')[1];
      rawBuffer = Buffer.from(base64Data, 'base64');
    } else if (compositeDataUrl.startsWith('data:image/svg+xml;utf8,')) {
      const svgText = decodeURIComponent(compositeDataUrl.replace('data:image/svg+xml;utf8,', ''));
      rawBuffer = Buffer.from(svgText, 'utf-8');
    } else {
      rawBuffer = Buffer.from(compositeDataUrl, 'utf-8');
    }

    // Convert to valid native JPEG using sharp
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
    } catch {
      // Fallback if rawBuffer is already jpeg
      processedBuffer = rawBuffer;
    }

    const processedFileName = `${photoId}.jpg`;
    const processedFilePath = path.join(processedDir, processedFileName);
    await fs.writeFile(processedFilePath, processedBuffer);

    // Save thumbnail
    try {
      const thumbBuffer = await sharp(processedBuffer)
        .resize(300, 375, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
      await fs.writeFile(path.join(thumbnailsDir, `${photoId}_thumb.jpg`), thumbBuffer);
    } catch (e) {
      console.warn('Thumbnail generation notice:', e);
    }

    // Save animated GIF
    let gifFilePath: string | undefined = undefined;
    if (gifDataUrl && typeof gifDataUrl === 'string' && gifDataUrl.includes(';base64,')) {
      try {
        const gifBase64 = gifDataUrl.split(';base64,')[1];
        const gifBuf = Buffer.from(gifBase64, 'base64');
        gifFilePath = path.join(gifsDir, `${photoId}.gif`);
        await fs.writeFile(gifFilePath, gifBuf);
      } catch (gifErr) {
        console.warn('GIF save error:', gifErr);
      }
    }

    // Save raw photo shots
    const rawFilePaths: string[] = [];
    if (Array.isArray(rawPhotos)) {
      for (let i = 0; i < rawPhotos.length; i++) {
        const rawItem = rawPhotos[i];
        let rawItemBuf: Buffer;

        if (typeof rawItem === 'string' && rawItem.includes(';base64,')) {
          rawItemBuf = Buffer.from(rawItem.split(';base64,')[1], 'base64');
        } else if (typeof rawItem === 'string' && rawItem.startsWith('data:image/svg+xml;utf8,')) {
          rawItemBuf = Buffer.from(decodeURIComponent(rawItem.replace('data:image/svg+xml;utf8,', '')), 'utf-8');
        } else {
          rawItemBuf = Buffer.from(rawItem, 'utf-8');
        }

        let jpegRawBuf: Buffer;
        try {
          jpegRawBuf = await sharp(rawItemBuf).jpeg({ quality: 95 }).toBuffer();
        } catch {
          jpegRawBuf = rawItemBuf;
        }

        const rawFileName = `${photoId}_raw_${i + 1}.jpg`;
        const rawFilePath = path.join(rawDir, rawFileName);
        await fs.writeFile(rawFilePath, jpegRawBuf);
        rawFilePaths.push(rawFilePath);
      }
    }

    // Save metadata
    await fs.writeFile(
      path.join(metadataDir, `${photoId}.json`),
      JSON.stringify(
        {
          photoId,
          eventId,
          createdAt: new Date().toISOString(),
          hasGif: Boolean(gifFilePath),
          rawCount: rawFilePaths.length,
        },
        null,
        2
      )
    );

    return NextResponse.json(
      {
        success: true,
        photoId,
        eventId,
        processedFilePath,
        gifFilePath,
        rawFilePaths,
        fileSizeBytes: processedBuffer.byteLength,
        savedLocallyAt: new Date().toISOString(),
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Local Storage Persist Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to save to local storage' },
      { status: 500, headers: corsHeaders }
    );
  }
}
