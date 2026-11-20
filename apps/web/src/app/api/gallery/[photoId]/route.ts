import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getServiceSupabase } from '@/lib/supabase';
import { getR2Storage } from '@/lib/storage/storage-provider';

export const dynamic = 'force-dynamic';

const DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS = parseInt(
  process.env.GALLERY_PRESIGNED_GET_TTL_SECONDS || '900',
  10
);

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
    let eventName = 'Acara Photobooth';
    let dateFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

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
            fsSync.existsSync(path.join(checkDir, 'thumbnails', `${photoId}_thumb.jpg`)) ||
            fsSync.existsSync(path.join(checkDir, 'raw', `${photoId}_raw_1.jpg`)) ||
            fsSync.existsSync(path.join(checkDir, 'raw', `${photoId}.jpg`)) ||
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
      let rawCount = 0;
      let resolvedEventId: string | null = null;

      if (matchedEventDir) {
        const gifPossibles = [
          path.join(matchedEventDir, 'gifs', `${photoId}.gif`),
          path.join(matchedEventDir, 'processed', `${photoId}.gif`),
          path.join(matchedEventDir, `${photoId}.gif`),
        ];
        hasGif = gifPossibles.some((p) => fsSync.existsSync(p));

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

      // Check Supabase Cloud Database & Storage if available
      try {
        const client = getServiceSupabase();
        if (client) {
          // Check gifs table by exact session identity or exact filename
          const { data: gRec } = await client
            .from('gifs')
            .select('cloud_storage_path, event_id, storage_provider, is_cloud_deleted')
            .or(`session_photo_id.eq.${photoId},cloud_storage_path.ilike.%/${photoId}.gif,cloud_storage_path.ilike.%/${photoId}.mp4`)
            .eq('is_cloud_deleted', false)
            .limit(1)
            .maybeSingle();

          if (gRec) {
            hasGif = true;
          }

          // Check photos table for event details by exact session identity or exact filename
          const { data: pRec } = await client
            .from('photos')
            .select('cloud_storage_path, event_id, storage_provider, raw_files, is_cloud_deleted, upload_status')
            .or(`session_photo_id.eq.${photoId},cloud_storage_path.ilike.%/${photoId}.jpg,cloud_storage_path.ilike.%/${photoId}.png`)
            .eq('is_cloud_deleted', false)
            .limit(1)
            .maybeSingle();

          resolvedEventId = pRec?.event_id || gRec?.event_id || null;

          // Cross-event security validation if requested with specific eventId
          const reqEventId = searchParams.get('eventId') || searchParams.get('event');
          if (reqEventId && resolvedEventId && reqEventId !== resolvedEventId) {
            return NextResponse.json(
              { success: false, error: 'Akses ditolak: Foto tidak sesuai dengan acara yang diminta.' },
              { status: 403, headers: corsHeaders }
            );
          }

          // If photo record has raw_files array, populate rawCount
          if (pRec?.raw_files && Array.isArray(pRec.raw_files) && pRec.raw_files.length > 0) {
            rawCount = Math.max(rawCount, pRec.raw_files.length);
          }

          // If not in database table, search storage events folder directly
          if (!resolvedEventId) {
            const { data: evFolders } = await client.storage.from('minglebooth-storage').list('events');
            if (evFolders && evFolders.length > 0) {
              for (const f of evFolders) {
                const { data: subFiles } = await client.storage.from('minglebooth-storage').list(`events/${f.name}`);
                if (subFiles && (subFiles as any[]).some((sf: any) => sf.name.includes(photoId))) {
                  resolvedEventId = f.name;
                  if ((subFiles as any[]).some((sf: any) => sf.name === `${photoId}.gif`)) {
                    hasGif = true;
                  }
                  break;
                }
              }
            }
          }

          if (resolvedEventId) {
            const { data: evRec } = await client
              .from('events')
              .select('name, date, branding_json')
              .eq('id', resolvedEventId)
              .limit(1)
              .maybeSingle();

            if (evRec) {
              eventName = evRec.name || eventName;
              dateFormatted = evRec.branding_json?.dateFormatted || evRec.date || dateFormatted;
            }

            // Check raw shots in legacy storage if rawCount not yet set
            if (rawCount === 0) {
              const { data: rawList } = await client.storage
                .from('minglebooth-storage')
                .list(`events/${resolvedEventId}/raw`);

              if (rawList && rawList.length > 0) {
                const matchedRaws = (rawList as any[]).filter((f: any) => f.name.startsWith(`${photoId}_raw_`));
                if (matchedRaws.length > 0) {
                  rawCount = Math.max(rawCount, matchedRaws.length);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Metadata check warning:', err);
      }

      const eventParam = resolvedEventId ? `&eventId=${encodeURIComponent(resolvedEventId)}` : '';
      const slides: any[] = [
        {
          id: 'slide_photo',
          type: 'photo',
          title: 'Foto Berbingkai',
          subtitle: 'Hasil Cetak Siap HD',
          badge: 'FOTO BERBINGKAI',
          url: `/api/gallery/${photoId}?type=photo${eventParam}`,
          downloadName: `MingleBooth_Foto_${photoId}.jpg`,
        },
      ];

      if (hasGif) {
        slides.push({
          id: 'slide_gif',
          type: 'gif',
          title: 'Animasi Bergerak',
          subtitle: 'Looping Mini Moment',
          badge: 'ANIMASI GIF',
          url: `/api/gallery/${photoId}?type=gif${eventParam}`,
          downloadName: `MingleBooth_Animasi_${photoId}.gif`,
        });
      }

      // Only include raw slides if actual raw files were detected
      if (rawCount > 0) {
        for (let i = 1; i <= rawCount; i++) {
          slides.push({
            id: `slide_raw_${i}`,
            type: 'raw',
            title: `Foto Original #${i}`,
            subtitle: `Jepretan Mentah Pose ${i}`,
            badge: `POSE #${i}`,
            url: `/api/gallery/${photoId}?type=raw&index=${i}${eventParam}`,
            downloadName: `MingleBooth_Original_Pose${i}_${photoId}.jpg`,
          });
        }
      }

      return NextResponse.json(
        {
          success: true,
          photoId,
          eventId: resolvedEventId || null,
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
        // type === 'photo' (composite) or type === 'thumbnail'
        const photoPossibles = [
          path.join(matchedEventDir, 'thumbnails', `${photoId}_thumb.jpg`),
          path.join(matchedEventDir, 'processed', `${photoId}.jpg`),
          path.join(matchedEventDir, 'processed', `${photoId}.png`),
          path.join(matchedEventDir, `${photoId}.jpg`),
          path.join(matchedEventDir, `${photoId}.png`),
          path.join(matchedEventDir, 'raw', `${photoId}_raw_1.jpg`),
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

    // ── Dual-Provider Cloud Storage Resolution (R2 + Supabase) ──
    try {
      const client = getServiceSupabase();
      if (client) {
        const reqEventId = searchParams.get('eventId') || searchParams.get('event');

        if (type === 'gif') {
          const { data: gRec } = await client
            .from('gifs')
            .select('id, event_id, organization_id, session_photo_id, cloud_storage_path, storage_provider, is_cloud_deleted')
            .or(`session_photo_id.eq.${photoId},cloud_storage_path.ilike.%/${photoId}.gif,cloud_storage_path.ilike.%/${photoId}.mp4`)
            .eq('is_cloud_deleted', false)
            .limit(1)
            .maybeSingle();

          if (gRec && gRec.cloud_storage_path) {
            // Security: cross-event validation
            if (reqEventId && reqEventId !== gRec.event_id) {
              return NextResponse.json(
                { error: 'Akses ditolak: Aset GIF tidak sesuai dengan acara yang diminta.' },
                { status: 403, headers: corsHeaders }
              );
            }

            const provider = gRec.storage_provider || 'supabase';
            if (provider === 'r2') {
              try {
                const r2 = getR2Storage();
                const signed = await r2.createPresignedGetUrl(gRec.cloud_storage_path, { expiresIn: DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS });
                return NextResponse.redirect(signed.url, {
                  status: 307,
                  headers: { ...corsHeaders, 'Cache-Control': `private, max-age=${DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS}` },
                });
              } catch (r2Err: any) {
                console.warn('[R2 GIF Read Notice]:', r2Err?.message);
              }
            } else {
              const { data: pubData } = client.storage
                .from('minglebooth-storage')
                .getPublicUrl(gRec.cloud_storage_path);
              if (pubData?.publicUrl) {
                return NextResponse.redirect(pubData.publicUrl);
              }
            }
          }
        } else {
          // type === 'photo' | 'thumbnail' | 'raw'
          const { data: pRec } = await client
            .from('photos')
            .select('id, event_id, organization_id, session_photo_id, cloud_storage_path, thumbnail_storage_path, storage_provider, raw_files, is_cloud_deleted, upload_status')
            .or(`session_photo_id.eq.${photoId},cloud_storage_path.ilike.%/${photoId}.jpg,cloud_storage_path.ilike.%/${photoId}.png`)
            .eq('is_cloud_deleted', false)
            .limit(1)
            .maybeSingle();

          if (pRec) {
            // Security: cross-event validation
            if (reqEventId && reqEventId !== pRec.event_id) {
              return NextResponse.json(
                { error: 'Akses ditolak: Foto tidak sesuai dengan acara yang diminta.' },
                { status: 403, headers: corsHeaders }
              );
            }

            const provider = pRec.storage_provider || 'supabase';

            if (type === 'raw') {
              const rawIndexNum = parseInt(rawIndex, 10) || 1;
              if (provider === 'r2') {
                let rawKey: string | null = null;
                if (Array.isArray(pRec.raw_files)) {
                  const matchedRaw = pRec.raw_files.find((r: any) => r.raw_index === rawIndexNum);
                  if (matchedRaw?.storage_path) {
                    rawKey = matchedRaw.storage_path;
                  }
                }
                if (!rawKey) {
                  rawKey = `events/${pRec.event_id}/raw/${photoId}_raw_${rawIndexNum}.arw`;
                }

                if (rawKey) {
                  try {
                    const r2 = getR2Storage();
                    const signed = await r2.createPresignedGetUrl(rawKey, { expiresIn: DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS });
                    return NextResponse.redirect(signed.url, {
                      status: 307,
                      headers: { ...corsHeaders, 'Cache-Control': `private, max-age=${DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS}` },
                    });
                  } catch (r2Err: any) {
                    console.warn('[R2 RAW Read Notice]:', r2Err?.message);
                  }
                }
              } else {
                // Supabase raw
                const rawStoragePath = `events/${pRec.event_id}/raw/${photoId}_raw_${rawIndex}.jpg`;
                const { data: rawList } = await client.storage
                  .from('minglebooth-storage')
                  .list(`events/${pRec.event_id}/raw`);
                const exists = rawList && rawList.some((f: any) => f.name === `${photoId}_raw_${rawIndex}.jpg` || f.name.startsWith(`${photoId}_raw_${rawIndex}.`));
                if (exists) {
                  const { data: pubData } = client.storage
                    .from('minglebooth-storage')
                    .getPublicUrl(rawStoragePath);
                  if (pubData?.publicUrl) {
                    return NextResponse.redirect(pubData.publicUrl);
                  }
                }
              }
            } else if (type === 'thumbnail') {
              if (provider === 'r2') {
                const thumbKey = pRec.thumbnail_storage_path || pRec.cloud_storage_path;
                if (thumbKey) {
                  try {
                    const r2 = getR2Storage();
                    const signed = await r2.createPresignedGetUrl(thumbKey, { expiresIn: DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS });
                    return NextResponse.redirect(signed.url, {
                      status: 307,
                      headers: { ...corsHeaders, 'Cache-Control': `private, max-age=${DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS}` },
                    });
                  } catch (r2Err: any) {
                    console.warn('[R2 Thumbnail Read Notice]:', r2Err?.message);
                  }
                }
              } else {
                const thumbPath = pRec.thumbnail_storage_path || pRec.cloud_storage_path;
                if (thumbPath) {
                  const { data: pubData } = client.storage
                    .from('minglebooth-storage')
                    .getPublicUrl(thumbPath);
                  if (pubData?.publicUrl) {
                    return NextResponse.redirect(pubData.publicUrl);
                  }
                }
              }
            } else {
              // type === 'photo' (composite framed photo)
              if (provider === 'r2') {
                if (pRec.cloud_storage_path) {
                  try {
                    const r2 = getR2Storage();
                    const signed = await r2.createPresignedGetUrl(pRec.cloud_storage_path, { expiresIn: DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS });
                    return NextResponse.redirect(signed.url, {
                      status: 307,
                      headers: { ...corsHeaders, 'Cache-Control': `private, max-age=${DEFAULT_PRESIGNED_GET_EXPIRES_SECONDS}` },
                    });
                  } catch (r2Err: any) {
                    console.warn('[R2 Photo Read Notice]:', r2Err?.message);
                  }
                }
              } else {
                if (pRec.cloud_storage_path) {
                  const { data: pubData } = client.storage
                    .from('minglebooth-storage')
                    .getPublicUrl(pRec.cloud_storage_path);
                  if (pubData?.publicUrl) {
                    return NextResponse.redirect(pubData.publicUrl);
                  }
                }
              }
            }
          }

          // Legacy storage scan fallback
          const { data: evFolders } = await client.storage.from('minglebooth-storage').list('events');
          if (evFolders && evFolders.length > 0) {
            for (const ev of evFolders) {
              const checkExt = type === 'gif' ? 'gif' : 'jpg';
              const possiblePath = `events/${ev.name}/${photoId}.${checkExt}`;
              const { data: pubData } = client.storage.from('minglebooth-storage').getPublicUrl(possiblePath);
              if (pubData?.publicUrl) {
                return NextResponse.redirect(pubData.publicUrl);
              }
            }
          }
        }
      }
    } catch (sbErr) {
      console.warn('Storage redirection notice:', sbErr);
    }
  } catch (err) {
    console.warn('Gallery serving warning:', err);
  }

  // Graceful controlled fallback SVG if file is not found (avoids broken image browser icons)
  const isGifReq = type === 'gif';
  const label = isGifReq
    ? 'ANIMASI GIF BELUM TERSEDIA'
    : type === 'raw'
    ? 'FOTO ORIGINAL TIDAK TERSEDIA'
    : 'FOTO BERBINGKAI BELUM TERSEDIA';
  const subLabel = type === 'raw'
    ? `Pose ${rawIndex} belum selesai diunggah atau tidak tersedia`
    : 'File sedang diproses oleh sistem';

  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
    <rect width="720" height="960" fill="#0A0B0E"/>
    <rect x="32" y="32" width="656" height="896" rx="20" fill="#12141A" stroke="#232732" stroke-width="2"/>
    <circle cx="360" cy="420" r="44" fill="#1B1E26"/>
    <path d="M338 412h44M360 390v44" stroke="#6B7280" stroke-width="3" stroke-linecap="round"/>
    <text x="360" y="510" fill="#F3F4F6" font-size="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="1">${label}</text>
    <text x="360" y="546" fill="#9CA3AF" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" text-anchor="middle">${subLabel}</text>
  </svg>`;

  return new NextResponse(fallbackSvg, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
