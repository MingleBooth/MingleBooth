import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
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

/**
 * 30-Day Gallery Retention Cleanup Job (Catatan.md Section 12 & 27)
 *
 * Rules:
 * 1. Upload -> expires_at = NOW() + 30 days
 * 2. When expires_at < NOW(): Mark is_cloud_deleted = true & delete from cloud storage
 * 3. Local vendor storage (data/events/...) is NEVER touched or deleted.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Verify Vercel Cron Secret if set
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (!isDev) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
      }
    }

    const client = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const dataRoot = getDataDirectory();

    let deletedPhotosCount = 0;
    let deletedGifsCount = 0;

    // 1. Check expired photos in Supabase
    const { data: expiredPhotos, error: photoErr } = await client
      .from('photos')
      .select('id, event_id, cloud_storage_path')
      .lt('expires_at', nowIso)
      .eq('is_cloud_deleted', false)
      .limit(100);

    if (expiredPhotos && expiredPhotos.length > 0) {
      for (const p of expiredPhotos) {
        // Delete cloud gallery file
        try {
          const cloudFilePath = path.join(
            dataRoot,
            'cloud-storage/public-gallery/events',
            p.event_id,
            `${p.id}.jpg`
          );
          await fs.unlink(cloudFilePath).catch(() => {});
        } catch (e) {
          console.warn('[Cron Cleanup] File deletion notice:', e);
        }

        // Mark as cloud deleted in Supabase
        await client
          .from('photos')
          .update({ is_cloud_deleted: true })
          .eq('id', p.id);

        deletedPhotosCount++;
      }
    }

    // 2. Check expired GIFs in Supabase
    const { data: expiredGifs, error: gifErr } = await client
      .from('gifs')
      .select('id, event_id, cloud_storage_path')
      .lt('expires_at', nowIso)
      .eq('is_cloud_deleted', false)
      .limit(100);

    if (expiredGifs && expiredGifs.length > 0) {
      for (const g of expiredGifs) {
        try {
          const cloudFilePath = path.join(
            dataRoot,
            'cloud-storage/public-gallery/events',
            g.event_id,
            `${g.id}.gif`
          );
          await fs.unlink(cloudFilePath).catch(() => {});
        } catch (e) {
          console.warn('[Cron Cleanup] File deletion notice:', e);
        }

        await client
          .from('gifs')
          .update({ is_cloud_deleted: true })
          .eq('id', g.id);

        deletedGifsCount++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      expiredPhotosProcessed: deletedPhotosCount,
      expiredGifsProcessed: deletedGifsCount,
      totalCleaned: deletedPhotosCount + deletedGifsCount,
      message: '30-day cloud retention cleanup executed successfully. Local vendor files remain 100% untouched.',
    });
  } catch (err: any) {
    console.error('[Retention Cleanup Exception]:', err);
    return NextResponse.json({ error: err?.message || 'Cleanup job failed' }, { status: 500 });
  }
}
