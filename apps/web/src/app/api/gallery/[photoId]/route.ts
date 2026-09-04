import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Gallery Media & Metadata Serving Endpoint
 * Serves:
 * - ?type=photo : Composite framed photo (processed/<id>.jpg)
 * - ?type=gif : Animated Boomerang GIF (gifs/<id>.gif)
 * - ?type=raw&index=N : Raw unedited take (raw/<id>_raw_N.jpg)
 * - ?type=meta : JSON slides structure for Google Drive-style carousel viewer
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { photoId: string } }
) {
  const { photoId } = params;
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') || 'photo';
  const rawIndex = searchParams.get('index') || '1';

  try {
    const eventsDir = path.resolve(process.cwd(), '../../data/events');
    const cloudDir = path.resolve(process.cwd(), '../../data/cloud-storage/public-gallery/events');
    const searchDirs = [cloudDir, eventsDir];

    // Find the event folder containing this photo
    let matchedEventDir: string | null = null;
    let eventName = 'Wedding Bayu & Irma';
    let dateFormatted = '29 August 2026';

    for (const rootDir of searchDirs) {
      if (!fsSync.existsSync(rootDir)) continue;
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const checkDir = path.join(rootDir, entry.name);
          const hasPhoto =
            fsSync.existsSync(path.join(checkDir, 'processed', `${photoId}.jpg`)) ||
            fsSync.existsSync(path.join(checkDir, 'processed', `${photoId}.png`)) ||
            fsSync.existsSync(path.join(checkDir, 'gifs', `${photoId}.gif`)) ||
            fsSync.existsSync(path.join(checkDir, `${photoId}.jpg`));
          if (hasPhoto) {
            matchedEventDir = checkDir;
            break;
          }
        }
      }
      if (matchedEventDir) break;
    }

    // Default to first event if not specifically isolated yet
    if (!matchedEventDir && fsSync.existsSync(eventsDir)) {
      const entries = await fs.readdir(eventsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          matchedEventDir = path.join(eventsDir, entry.name);
          break;
        }
      }
    }

    // ── Handle Metadata Request (?type=meta) ──
    if (type === 'meta') {
      let hasGif = false;
      let rawCount = 2;

      if (matchedEventDir) {
        const gifPath = path.join(matchedEventDir, 'gifs', `${photoId}.gif`);
        hasGif = fsSync.existsSync(gifPath);

        const rawDir = path.join(matchedEventDir, 'raw');
        if (fsSync.existsSync(rawDir)) {
          const rawFiles = (await fs.readdir(rawDir)).filter(
            (f) => f.startsWith(`${photoId}_raw_`) && !f.startsWith('.')
          );
          if (rawFiles.length > 0) {
            rawCount = rawFiles.length;
          }
        }
      }

      const slides: Array<{
        id: string;
        type: 'photo' | 'gif' | 'raw';
        title: string;
        subtitle: string;
        badge: string;
        url: string;
        downloadName: string;
      }> = [
        {
          id: 'slide_photo',
          type: 'photo',
          title: 'Foto Berbingkai',
          subtitle: 'Hasil Cetak Siap Cetak HD',
          badge: 'HASIL CETAK',
          url: `/api/gallery/${photoId}?type=photo`,
          downloadName: `MingleBooth_Foto_${photoId}.jpg`,
        },
      ];

      // Slide 2: GIF Boomerang
      slides.push({
        id: 'slide_gif',
        type: 'gif',
        title: 'Animasi GIF',
        subtitle: 'Boomerang dengan Bingkai Khusus',
        badge: 'ANIMASI GIF',
        url: `/api/gallery/${photoId}?type=gif`,
        downloadName: `MingleBooth_Animasi_${photoId}.gif`,
      });

      // Slide 3..N: Raw Shots
      for (let i = 1; i <= Math.max(1, rawCount); i++) {
        slides.push({
          id: `slide_raw_${i}`,
          type: 'raw',
          title: `Foto Original #${i}`,
          subtitle: `Jepretan Mentah Pose ${i}`,
          badge: `POSE #${i}`,
          url: `/api/gallery/${photoId}?type=raw&index=${i}`,
          downloadName: `MingleBooth_Original_Pose${i}_${photoId}.jpg`,
        });
      }

      return NextResponse.json(
        {
          success: true,
          photoId,
          eventName,
          dateFormatted,
          hasGif,
          rawCount,
          totalSlides: slides.length,
          slides,
        },
        { headers: corsHeaders }
      );
    }

    // ── Handle Media Binary File Requests ──
    let targetFilePath: string | null = null;
    let contentType = 'image/jpeg';

    if (matchedEventDir) {
      if (type === 'gif') {
        const gifPossibles = [
          path.join(matchedEventDir, 'gifs', `${photoId}.gif`),
          path.join(matchedEventDir, 'processed', `${photoId}.gif`),
          path.join(matchedEventDir, `${photoId}.gif`),
        ];
        for (const p of gifPossibles) {
          if (fsSync.existsSync(p)) {
            targetFilePath = p;
            contentType = 'image/gif';
            break;
          }
        }
      } else if (type === 'raw') {
        const rawPossibles = [
          path.join(matchedEventDir, 'raw', `${photoId}_raw_${rawIndex}.jpg`),
          path.join(matchedEventDir, 'raw', `${photoId}_raw_${rawIndex}.png`),
        ];
        for (const p of rawPossibles) {
          if (fsSync.existsSync(p)) {
            targetFilePath = p;
            contentType = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
            break;
          }
        }
      } else {
        // type === 'photo' (composite)
        const photoPossibles = [
          path.join(matchedEventDir, 'processed', `${photoId}.jpg`),
          path.join(matchedEventDir, 'processed', `${photoId}.png`),
          path.join(matchedEventDir, `${photoId}.jpg`),
          path.join(matchedEventDir, `${photoId}.png`),
        ];
        for (const p of photoPossibles) {
          if (fsSync.existsSync(p)) {
            targetFilePath = p;
            contentType = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
            break;
          }
        }
      }
    }

    if (targetFilePath && fsSync.existsSync(targetFilePath)) {
      const buffer = await fs.readFile(targetFilePath);
      return new NextResponse(buffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  } catch (err) {
    console.warn('Gallery serving warning:', err);
  }

  // Fallback placeholder SVG if file is not found on disk
  const isGifReq = type === 'gif';
  const label = isGifReq ? 'GIF BOOMERANG READY' : type === 'raw' ? `RAW SHOT #${rawIndex}` : 'PHOTO COMPOSITE';
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900"><rect width="720" height="900" fill="#121418"/><text x="360" y="450" fill="#9CA3AF" font-size="24" font-family="sans-serif" text-anchor="middle">${label}</text></svg>`;

  return new NextResponse(fallbackSvg, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/svg+xml',
    },
  });
}
