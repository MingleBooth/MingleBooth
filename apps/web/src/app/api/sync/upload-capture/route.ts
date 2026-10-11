import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

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
  if (isPreviewDeployment()) {
    return previewBlockedResponse('sync_upload', 'Cloud sync upload is disabled in Preview deployments to protect production storage and galleries.');
  }

  try {
    // 1. Mandatory Cryptographic Server Authentication
    const auth = await verifyServerAuth(req);
    if (!auth.success || !auth.orgId) {
      return NextResponse.json(
        { error: auth.error || 'Autentikasi Bearer wajib untuk sinkronisasi cloud.', code: auth.code || 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }

    // Explicitly reject Demo tokens
    if (auth.payload?.isDemo) {
      return NextResponse.json(
        { error: 'Mode Demo tidak memiliki akses sinkronisasi cloud. Silakan aktifkan langganan berbayar.', code: 'DEMO_MODE_BLOCKED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    if (!client) {
      return NextResponse.json(
        { error: 'Koneksi database tidak tersedia.' },
        { status: 503, headers: corsHeaders }
      );
    }

    // 2. Authoritative Database Subscription Verification
    const isSuperAdmin = !!auth.isSuperAdmin;
    if (!isSuperAdmin) {
      const { data: orgData, error: orgErr } = await client
        .from('organizations')
        .select('id, name, subscription_status, subscription_expires_at')
        .eq('id', auth.orgId)
        .single();

      if (orgErr || !orgData) {
        return NextResponse.json(
          { error: 'Organisasi vendor tidak ditemukan di database.', code: 'ORG_ACCESS_DENIED' },
          { status: 404, headers: corsHeaders }
        );
      }

      const now = new Date();
      const expiresAt = orgData.subscription_expires_at ? new Date(orgData.subscription_expires_at) : new Date(0);
      const hasActiveSub = orgData.subscription_status === 'active' && expiresAt >= now;

      if (!hasActiveSub) {
        return NextResponse.json(
          {
            error: orgData.subscription_status === 'expired'
              ? 'Masa aktif langganan telah berakhir. Sinkronisasi cloud diblokir.'
              : 'Akun Anda belum memiliki langganan aktif. Sinkronisasi cloud hanya tersedia untuk akun berbayar.',
            code: 'SUBSCRIPTION_REQUIRED',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const body = await req.json();
    const {
      photoId,
      eventId,
      fileDataUrl,
      type = 'photo',
      rawIndex = 1,
    } = body;

    if (!photoId || !eventId || !fileDataUrl) {
      return NextResponse.json(
        { error: 'Missing required sync fields (photoId, eventId, fileDataUrl)' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof photoId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(photoId) || photoId.length < 3 || photoId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid photoId format. Must be 3-100 alphanumeric characters, dashes, or underscores' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(eventId) || eventId.length < 1 || eventId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid eventId format' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['photo', 'gif', 'raw'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid sync type. Must be photo, gif, or raw' },
        { status: 400, headers: corsHeaders }
      );
    }

    const parsedRawIndex = parseInt(String(rawIndex), 10);
    if (type === 'raw' && (isNaN(parsedRawIndex) || parsedRawIndex < 1 || parsedRawIndex > 50)) {
      return NextResponse.json(
        { error: 'Invalid rawIndex. Must be an integer between 1 and 50' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof fileDataUrl !== 'string' || fileDataUrl.length > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload size exceeds safety limit (15MB)' },
        { status: 413, headers: corsHeaders }
      );
    }

    const ext = type === 'gif' ? 'gif' : 'jpg';

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

    // Optional: Mirror to local filesystem in local dev mode (fail silently on Vercel serverless)
    try {
      const dataRoot = getDataDirectory();
      const cloudGalleryDir = path.join(dataRoot, 'cloud-storage/public-gallery/events', eventId);
      await fs.mkdir(cloudGalleryDir, { recursive: true });

      if (type === 'raw') {
        const rawLocalDir = path.join(cloudGalleryDir, 'raw');
        await fs.mkdir(rawLocalDir, { recursive: true });
        await fs.writeFile(path.join(rawLocalDir, `${photoId}_raw_${rawIndex}.jpg`), finalBuffer);
      } else {
        const filePath = path.join(cloudGalleryDir, `${photoId}.${ext}`);
        await fs.writeFile(filePath, finalBuffer);

        const localEventDir = path.join(dataRoot, 'events', eventId);
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
      }
    } catch {
      // In serverless environments (e.g. Vercel), disk writes are read-only; proceed with cloud storage
    }

    // ── Save Raw Camera Shots locally if writable ──
    const rawShotsList: string[] = Array.isArray(body.rawShots) ? body.rawShots : [];
    if (rawShotsList.length > 0) {
      try {
        const dataRoot = getDataDirectory();
        const cloudRawDir = path.join(dataRoot, 'cloud-storage/public-gallery/events', eventId, 'raw');
        const localRawDir = path.join(dataRoot, 'events', eventId, 'raw');
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
      } catch {
        // Safe ignore on serverless
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://minglebooth.id';
    const cloudUrl = `${baseUrl}/p/${photoId}`;
    const syncedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Resolve Event and Organization strictly scoped to authenticated tenant ──
    const validOrgId = auth.orgId;
    let validEventId: string | null = null;

    try {
      const isUuid = (str: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      let matchedEvt: any = null;

      if (eventId && isUuid(eventId)) {
        const res = await client
          .from('events')
          .select('id, organization_id')
          .eq('id', eventId)
          .limit(1)
          .maybeSingle();
        matchedEvt = res.data;
      } else if (eventId && eventId !== 'default_event' && eventId !== 'all') {
        const resSlug = await client
          .from('events')
          .select('id, organization_id')
          .eq('slug', eventId)
          .limit(1)
          .maybeSingle();
        matchedEvt = resSlug.data;

        if (!matchedEvt) {
          const resName = await client
            .from('events')
            .select('id, organization_id')
            .ilike('name', eventId)
            .limit(1)
            .maybeSingle();
          matchedEvt = resName.data;
        }
      }

      if (matchedEvt) {
        // Cross-tenant guard: ensure caller owns this event
        if (!isSuperAdmin && matchedEvt.organization_id !== validOrgId) {
          return NextResponse.json(
            { error: 'Akses ditolak: Event ini bukan milik organisasi Anda.', code: 'ORG_ACCESS_DENIED' },
            { status: 403, headers: corsHeaders }
          );
        }
        validEventId = matchedEvt.id;
      } else {
        // Scoped Fallback: only pick events from the authenticated organization
        const { data: orgEvt } = await client
          .from('events')
          .select('id, organization_id')
          .eq('organization_id', validOrgId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (orgEvt) {
          validEventId = orgEvt.id;
        } else {
          return NextResponse.json(
            { error: 'Event tidak ditemukan untuk organisasi Anda.', code: 'EVENT_NOT_FOUND' },
            { status: 404, headers: corsHeaders }
          );
        }
      }
    } catch (evtErr: any) {
      console.warn('[Supabase Event Resolution Notice]:', evtErr.message);
    }

    const targetEventFolder = validEventId || eventId;
    const isRawType = type === 'raw';
    const storagePath = isRawType
      ? `events/${targetEventFolder}/raw/${photoId}_raw_${rawIndex}.jpg`
      : `events/${targetEventFolder}/${photoId}.${ext}`;

    // ── Upload to Supabase Storage Bucket (minglebooth-storage) ──
    if (client) {
      try {
        const { error: storageErr } = await client.storage
          .from('minglebooth-storage')
          .upload(storagePath, finalBuffer, {
            contentType: type === 'gif' ? 'image/gif' : 'image/jpeg',
            upsert: true,
          });

        if (storageErr) {
          console.error('[Supabase Storage Upload Failed]:', storageErr.message);
          return NextResponse.json(
            { error: `Storage upload failed: ${storageErr.message}` },
            { status: 502, headers: corsHeaders }
          );
        }

        // Backward compatibility: upload raw shots array if provided
        if (rawShotsList.length > 0) {
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
              await client.storage
                .from('minglebooth-storage')
                .upload(`events/${targetEventFolder}/raw/${photoId}_raw_${i + 1}.jpg`, jpgBuf, {
                  contentType: 'image/jpeg',
                  upsert: true,
                });
            } catch {
              await client.storage
                .from('minglebooth-storage')
                .upload(`events/${targetEventFolder}/raw/${photoId}_raw_${i + 1}.jpg`, buf, {
                  contentType: 'image/jpeg',
                  upsert: true,
                });
            }
          }
        }
      } catch (stErr: any) {
        console.error('[Supabase Storage Exception]:', stErr.message);
        return NextResponse.json(
          { error: `Storage connection error: ${stErr.message}` },
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // ── Insert/Update Record into Supabase Cloud Database (Idempotent) ──
    let supabaseRecordId: string | null = null;
    if (client && validEventId && validOrgId && !isRawType) {
      try {
        if (type === 'gif') {
          const { data: existingGifs } = await client
            .from('gifs')
            .select('id')
            .eq('event_id', validEventId)
            .ilike('cloud_storage_path', `%${photoId}%`);

          if (existingGifs && existingGifs.length > 0) {
            const primaryId = existingGifs[0].id;
            await client
              .from('gifs')
              .update({
                captured_at: syncedAt,
              })
              .eq('id', primaryId);
            supabaseRecordId = primaryId;

            // Self-healing: remove duplicate records if any exist
            if (existingGifs.length > 1) {
              const duplicateIds = existingGifs.slice(1).map((g) => g.id);
              await client.from('gifs').delete().in('id', duplicateIds);
              console.log(`[Cloud Sync] Pruned ${duplicateIds.length} duplicate GIF rows for ${photoId}`);
            }
          } else {
            const { data: gData, error: gErr } = await client
              .from('gifs')
              .insert({
                event_id: validEventId,
                organization_id: validOrgId,
                cloud_storage_path: storagePath,
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
          }
        } else {
          const { data: existingPhotos } = await client
            .from('photos')
            .select('id')
            .eq('event_id', validEventId)
            .ilike('cloud_storage_path', `%${photoId}%`);

          if (existingPhotos && existingPhotos.length > 0) {
            const primaryId = existingPhotos[0].id;
            await client
              .from('photos')
              .update({
                file_size_bytes: finalBuffer.length,
                captured_at: syncedAt,
              })
              .eq('id', primaryId);
            supabaseRecordId = primaryId;

            // Self-healing: remove duplicate records if any exist
            if (existingPhotos.length > 1) {
              const duplicateIds = existingPhotos.slice(1).map((p) => p.id);
              await client.from('photos').delete().in('id', duplicateIds);
              console.log(`[Cloud Sync] Pruned ${duplicateIds.length} duplicate photo rows for ${photoId}`);
            }
          } else {
            const { data: pData, error: pErr } = await client
              .from('photos')
              .insert({
                event_id: validEventId,
                organization_id: validOrgId,
                cloud_storage_path: storagePath,
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
        }

        // Record sync log with verified entity ID
        await client.from('cloud_sync_logs').insert({
          organization_id: validOrgId,
          event_id: validEventId,
          entity_id: supabaseRecordId || photoId,
          entity_type: type,
          synced_at: syncedAt,
        });
      } catch (supErr: any) {
        console.warn('[Supabase Sync Exception]:', supErr.message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        photoId,
        eventId: targetEventFolder,
        organizationId: validOrgId,
        cloudUrl: isRawType ? null : cloudUrl,
        storagePath,
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
