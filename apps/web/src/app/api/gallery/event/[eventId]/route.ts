import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;

  try {
    const client = getServiceSupabase();
    let eventName = 'Wedding Bayu & Irma';
    let eventDate = '2026-08-29';
    let matchedEventId = eventId;

    // 1. Resolve Event details from Supabase if possible
    if (client) {
      try {
        const { data: dbEvent } = await client
          .from('events')
          .select('*')
          .or(`id.eq.${eventId},slug.eq.${eventId}`)
          .limit(1)
          .single();

        if (dbEvent) {
          eventName = dbEvent.name || eventName;
          eventDate = dbEvent.date || eventDate;
          matchedEventId = dbEvent.id;
        }
      } catch {
        // Continue with local resolution
      }
    }

    const eventsDir = path.resolve(process.cwd(), '../../data/events');
    const cloudDir = path.resolve(process.cwd(), '../../data/cloud-storage/public-gallery/events');

    // List of candidate directory names to look into
    const candidateDirs: string[] = [eventId];
    if (matchedEventId && matchedEventId !== eventId) {
      candidateDirs.push(matchedEventId);
    }
    // Also include default event folder if Bayu & Irma
    if (
      eventName.toLowerCase().includes('bayu') ||
      eventId === 'b739dae7-9a16-48e9-bc53-3fa159380a87' ||
      eventId.includes('bayu')
    ) {
      candidateDirs.push('evt_bayu_irma_2026');
      candidateDirs.push('b739dae7-9a16-48e9-bc53-3fa159380a87');
    }

    const photoMap = new Map<string, {
      photoId: string;
      thumbUrl: string;
      fullUrl: string;
      gifUrl: string | null;
      hasGif: boolean;
      rawShots: Array<{ index: number; url: string }>;
      url: string;
      createdAt: string;
    }>();

    // 2. Scan Filesystem directories
    for (const cand of Array.from(new Set(candidateDirs))) {
      for (const root of [eventsDir, cloudDir]) {
        const dirPath = path.join(root, cand);
        if (!fsSync.existsSync(dirPath)) continue;

        const subdirs = ['processed', 'thumbnails', 'raw', 'gifs', ''];
        for (const sub of subdirs) {
          const targetSub = sub ? path.join(dirPath, sub) : dirPath;
          if (!fsSync.existsSync(targetSub)) continue;

          try {
            const files = await fs.readdir(targetSub);
            for (const f of files) {
              if (f.startsWith('.') || f.endsWith('.DS_Store')) continue;
              const isJpg = f.endsWith('.jpg') || f.endsWith('.png');
              const isGif = f.endsWith('.gif');
              if (!isJpg && !isGif) continue;

              // Check if it's a raw pose file
              const rawMatch = f.match(/^(.*?)_raw_(\d+)\.(jpg|png)$/);
              let rawIdx: number | null = null;
              let pid = f.replace(/\.[^/.]+$/, '');
              if (rawMatch) {
                pid = rawMatch[1];
                rawIdx = parseInt(rawMatch[2], 10);
              } else {
                pid = pid.replace(/_thumb$/, '');
              }

              let mtime = new Date().toISOString();
              try {
                const stat = fsSync.statSync(path.join(targetSub, f));
                mtime = stat.mtime.toISOString();
              } catch {}

              if (!photoMap.has(pid)) {
                photoMap.set(pid, {
                  photoId: pid,
                  thumbUrl: `/api/gallery/${pid}?type=photo`,
                  fullUrl: `/api/gallery/${pid}?type=photo`,
                  gifUrl: isGif ? `/api/gallery/${pid}?type=gif` : null,
                  hasGif: isGif,
                  rawShots: rawIdx !== null ? [{ index: rawIdx, url: `/api/gallery/${pid}?type=raw&index=${rawIdx}` }] : [],
                  url: `/p/${pid}`,
                  createdAt: mtime,
                });
              } else {
                const existing = photoMap.get(pid)!;
                if (isGif) {
                  existing.hasGif = true;
                  existing.gifUrl = `/api/gallery/${pid}?type=gif`;
                }
                if (rawIdx !== null && !existing.rawShots.some((r) => r.index === rawIdx)) {
                  existing.rawShots.push({
                    index: rawIdx,
                    url: `/api/gallery/${pid}?type=raw&index=${rawIdx}`,
                  });
                  existing.rawShots.sort((a, b) => a.index - b.index);
                }
              }
            }
          } catch {}
        }
      }
    }

    // 3. Scan Supabase photos & gifs table if connected
    if (client && matchedEventId) {
      try {
        const { data: dbPhotos } = await client
          .from('photos')
          .select('id, cloud_storage_path, created_at')
          .eq('event_id', matchedEventId)
          .order('created_at', { ascending: false });

        if (dbPhotos) {
          for (const p of dbPhotos) {
            const pid = p.id;
            if (!photoMap.has(pid)) {
              photoMap.set(pid, {
                photoId: pid,
                thumbUrl: `/api/gallery/${pid}?type=photo`,
                fullUrl: `/api/gallery/${pid}?type=photo`,
                gifUrl: null,
                hasGif: false,
                rawShots: [],
                url: `/p/${pid}`,
                createdAt: p.created_at || new Date().toISOString(),
              });
            }
          }
        }

        const { data: dbGifs } = await client
          .from('gifs')
          .select('id, cloud_storage_path, created_at')
          .eq('event_id', matchedEventId);

        if (dbGifs) {
          for (const g of dbGifs) {
            const pid = g.id;
            if (photoMap.has(pid)) {
              const item = photoMap.get(pid)!;
              item.hasGif = true;
              item.gifUrl = `/api/gallery/${pid}?type=gif`;
            } else {
              photoMap.set(pid, {
                photoId: pid,
                thumbUrl: `/api/gallery/${pid}?type=gif`,
                fullUrl: `/api/gallery/${pid}?type=gif`,
                gifUrl: `/api/gallery/${pid}?type=gif`,
                hasGif: true,
                rawShots: [],
                url: `/p/${pid}`,
                createdAt: g.created_at || new Date().toISOString(),
              });
            }
          }
        }
      } catch {}
    }

    const photos = Array.from(photoMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(
      {
        success: true,
        eventId: matchedEventId || eventId,
        eventName,
        eventDate,
        totalPhotos: photos.length,
        photos,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching event gallery' },
      { status: 500, headers: corsHeaders }
    );
  }
}
