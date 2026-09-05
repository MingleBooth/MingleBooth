import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getServiceSupabase } from '@/lib/supabase';

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
 * Cloud Sync Upload Endpoint
 * 1. Persists media into local cloud-storage archive
 * 2. Writes photo record into Supabase public.photos / public.gifs
 * 3. Logs synchronization into public.cloud_sync_logs
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      photoId,
      eventId,
      organizationId,
      fileDataUrl,
      type = 'photo',
    } = body;

    if (!photoId || !eventId || !fileDataUrl) {
      return NextResponse.json(
        { error: 'Missing required sync fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    const dataRoot = getDataDirectory();
    const cloudGalleryDir = path.join(dataRoot, 'cloud-storage/public-gallery/events', eventId);
    await fs.mkdir(cloudGalleryDir, { recursive: true });

    const ext = type === 'gif' ? 'gif' : 'jpg';
    const filePath = path.join(cloudGalleryDir, `${photoId}.${ext}`);

    let rawBuffer: Buffer;
    if (fileDataUrl.includes(';base64,')) {
      rawBuffer = Buffer.from(fileDataUrl.split(';base64,')[1], 'base64');
    } else if (fileDataUrl.startsWith('data:image/svg+xml;utf8,')) {
      const svgText = decodeURIComponent(fileDataUrl.replace('data:image/svg+xml;utf8,', ''));
      rawBuffer = Buffer.from(svgText, 'utf-8');
    } else {
      rawBuffer = Buffer.from(fileDataUrl, 'utf-8');
    }

    let finalBuffer: Buffer;
    if (type === 'gif') {
      finalBuffer = rawBuffer;
    } else {
      try {
        finalBuffer = await sharp(rawBuffer).jpeg({ quality: 95 }).toBuffer();
      } catch {
        finalBuffer = rawBuffer;
      }
    }

    // Save media to disk so gallery endpoint can immediately serve it
    await fs.writeFile(filePath, finalBuffer);

    // Also mirror to data/events directory for local serving redundancy
    const localEventDir = path.join(dataRoot, 'events', eventId);
    try {
      await fs.mkdir(localEventDir, { recursive: true });
      if (type === 'gif') {
        const gifDir = path.join(localEventDir, 'gifs');
        await fs.mkdir(gifDir, { recursive: true });
        await fs.writeFile(path.join(gifDir, `${photoId}.gif`), finalBuffer);
      } else {
        await fs.writeFile(path.join(localEventDir, `${photoId}.jpg`), finalBuffer);
        const thumbDir = path.join(localEventDir, 'thumbnails');
        await fs.mkdir(thumbDir, { recursive: true });
        await fs.writeFile(path.join(thumbDir, `${photoId}_thumb.jpg`), finalBuffer);
      }
    } catch (e) {
      console.warn('Local event mirror warning:', e);
    }

    // ── Save Raw Camera Shots if provided ──
    const rawShotsList: string[] = Array.isArray(body.rawShots) ? body.rawShots : [];
    if (rawShotsList.length > 0) {
      const cloudRawDir = path.join(cloudGalleryDir, 'raw');
      const localRawDir = path.join(localEventDir, 'raw');
      await fs.mkdir(cloudRawDir, { recursive: true });
      await fs.mkdir(localRawDir, { recursive: true });

      for (let i = 0; i < rawShotsList.length; i++) {
        const rawData = rawShotsList[i];
        if (!rawData) continue;
        let buf: Buffer;
        if (rawData.includes(';base64,')) {
          buf = Buffer.from(rawData.split(';base64,')[1], 'base64');
        } else {
          buf = Buffer.from(rawData, 'utf-8');
        }
        try {
          const jpgBuf = await sharp(buf).jpeg({ quality: 92 }).toBuffer();
          await fs.writeFile(path.join(cloudRawDir, `${photoId}_raw_${i + 1}.jpg`), jpgBuf);
          await fs.writeFile(path.join(localRawDir, `${photoId}_raw_${i + 1}.jpg`), jpgBuf);
        } catch {
          await fs.writeFile(path.join(cloudRawDir, `${photoId}_raw_${i + 1}.jpg`), buf);
          await fs.writeFile(path.join(localRawDir, `${photoId}_raw_${i + 1}.jpg`), buf);
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://minglebooth.id';
    const cloudUrl = `${baseUrl}/p/${photoId}`;
    const syncedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Insert Record into Supabase Cloud Database ──
    let supabaseRecordId: string | null = null;
    try {
      const client = getServiceSupabase();
      if (client) {
        let validOrgId: string | null = null;
        let validEventId: string | null = null;

        const isUuid = (str: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        if (eventId && isUuid(eventId)) {
          const { data: matchedEvt } = await client
            .from('events')
            .select('id, organization_id')
            .eq('id', eventId)
            .limit(1)
            .single();
          if (matchedEvt) {
            validEventId = matchedEvt.id;
            validOrgId = matchedEvt.organization_id;
          }
        }

        // Fallback to active event in database if not matched
        if (!validEventId) {
          const { data: firstEvt } = await client
            .from('events')
            .select('id, organization_id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (firstEvt) {
            validEventId = firstEvt.id;
            validOrgId = firstEvt.organization_id;
          }
        }

        if (validEventId && validOrgId) {
          if (type === 'gif') {
            const { data: gData, error: gErr } = await client
              .from('gifs')
              .insert({
                event_id: validEventId,
                organization_id: validOrgId,
                cloud_storage_path: `public-gallery/events/${validEventId}/${photoId}.${ext}`,
                frames_count: 4,
                duration_ms: 1000,
                captured_at: syncedAt,
                expires_at: expiresAt,
              })
              .select('id')
              .single();

            if (gErr) {
              console.warn('[Supabase GIF Sync Notice]:', gErr.message);
            } else if (gData) {
              supabaseRecordId = gData.id;
            }
          } else {
            const { data: pData, error: pErr } = await client
              .from('photos')
              .insert({
                event_id: validEventId,
                organization_id: validOrgId,
                cloud_storage_path: `public-gallery/events/${validEventId}/${photoId}.${ext}`,
                file_size_bytes: finalBuffer.length,
                width: 1200,
                height: 1800,
                qr_url: cloudUrl,
                captured_at: syncedAt,
                expires_at: expiresAt,
              })
              .select('id')
              .single();

            if (pErr) {
              console.warn('[Supabase Photo Sync Notice]:', pErr.message);
            } else if (pData) {
              supabaseRecordId = pData.id;
            }
          }

          // Record sync log
          await client.from('cloud_sync_logs').insert({
            organization_id: validOrgId,
            event_id: validEventId,
            entity_id: validEventId,
            entity_type: type,
            synced_at: syncedAt,
          });
        }
      }
    } catch (supErr: any) {
      console.warn('[Supabase Sync Exception]:', supErr.message);
    }

    return NextResponse.json(
      {
        success: true,
        photoId,
        eventId,
        organizationId,
        cloudUrl,
        storagePath: `public-gallery/events/${eventId}/${photoId}.${ext}`,
        supabaseRecordId,
        syncedAt,
        expiresAt,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Cloud Sync Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Sync upload failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
