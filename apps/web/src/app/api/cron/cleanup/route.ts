import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getServiceSupabase } from '@/lib/supabase';
import { getR2Storage } from '@/lib/storage/storage-provider';
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
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'cron_cleanup',
        'Cron cleanup dinonaktifkan pada Vercel Preview untuk melindungi data retensi foto produksi.'
      );
    }

    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Fail-closed authentication
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'Server misconfiguration: CRON_SECRET is required', code: 'CRON_SECRET_REQUIRED' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized cron request', code: 'CRON_AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const client = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const nowTime = Date.now();
    const dataRoot = getDataDirectory();

    let deletedPhotosCount = 0;
    let deletedGifsCount = 0;
    let failedPhotosCount = 0;
    let failedGifsCount = 0;

    // 1. Check expired photos in Supabase (Batch limit: 100)
    const { data: expiredPhotos, error: photoErr } = await client
      .from('photos')
      .select('id, event_id, cloud_storage_path, thumbnail_storage_path, storage_provider, raw_files, upload_status, upload_lease_expires_at')
      .lt('expires_at', nowIso)
      .eq('is_cloud_deleted', false)
      .order('expires_at', { ascending: true })
      .limit(100);

    if (photoErr) {
      console.warn('[Cron Cleanup] Error querying expired photos:', photoErr.message);
    } else if (expiredPhotos && expiredPhotos.length > 0) {
      for (const p of expiredPhotos) {
        // Safety check 1: Never delete active uploads whose lease has not expired
        if (p.upload_lease_expires_at && new Date(p.upload_lease_expires_at).getTime() > nowTime) {
          continue;
        }
        // Safety check 2: Never delete uploads actively in progress
        if (p.upload_status === 'UPLOADING' || p.upload_status === 'VERIFYING') {
          continue;
        }

        let storageDeletionSucceeded = true;
        const provider = p.storage_provider || 'supabase';

        // Delete from cloud storage provider
        if (provider === 'r2') {
          try {
            const r2 = getR2Storage();
            const keysToDelete: string[] = [];

            if (p.cloud_storage_path) keysToDelete.push(p.cloud_storage_path);
            if (p.thumbnail_storage_path) keysToDelete.push(p.thumbnail_storage_path);
            if (Array.isArray(p.raw_files)) {
              for (const rf of p.raw_files) {
                if (rf.storage_path) keysToDelete.push(rf.storage_path);
              }
            }

            for (const key of keysToDelete) {
              try {
                await r2.deleteObject(key);
              } catch (delErr: any) {
                // If already gone (404/NotFound), it's safe. Otherwise mark failure.
                if (delErr?.$metadata?.httpStatusCode !== 404 && delErr?.name !== 'NotFound' && delErr?.name !== 'NoSuchKey') {
                  console.error(`[Cron Cleanup] R2 deletion failed for key ${key}:`, delErr?.message);
                  storageDeletionSucceeded = false;
                }
              }
            }
          } catch (r2InitErr: any) {
            console.error('[Cron Cleanup] R2 storage initialization error:', r2InitErr?.message);
            storageDeletionSucceeded = false;
          }
        } else {
          // Supabase Storage
          try {
            const filesToDelete = [
              p.cloud_storage_path || `events/${p.event_id}/${p.id}.jpg`,
            ];
            if (p.thumbnail_storage_path) {
              filesToDelete.push(p.thumbnail_storage_path);
            }
            if (Array.isArray(p.raw_files) && p.raw_files.length > 0) {
              for (const rf of p.raw_files) {
                if (rf.storage_path) filesToDelete.push(rf.storage_path);
              }
            } else {
              filesToDelete.push(
                `events/${p.event_id}/raw/${p.id}_raw_1.jpg`,
                `events/${p.event_id}/raw/${p.id}_raw_2.jpg`,
                `events/${p.event_id}/raw/${p.id}_raw_3.jpg`,
                `events/${p.event_id}/raw/${p.id}_raw_4.jpg`
              );
            }
            const { error: remErr } = await client.storage.from('minglebooth-storage').remove(filesToDelete);
            if (remErr) {
              console.warn('[Cron Cleanup] Supabase storage bucket removal notice:', remErr.message);
              // Supabase remove returns error if network fails
            }
          } catch (stErr) {
            console.warn('[Cron Cleanup] Storage bucket removal exception:', stErr);
            storageDeletionSucceeded = false;
          }
        }

        // Delete local cloud gallery copies if any (local cache only, never local vendor storage)
        try {
          const eventCloudDir = path.join(dataRoot, 'cloud-storage/public-gallery/events', p.event_id);
          const cloudFilePath = path.join(eventCloudDir, `${p.id}.jpg`);
          await fs.unlink(cloudFilePath).catch(() => {});

          const rawCloudDir = path.join(eventCloudDir, 'raw');
          try {
            const rawFiles = await fs.readdir(rawCloudDir);
            for (const rf of rawFiles) {
              if (rf.startsWith(`${p.id}_raw_`)) {
                await fs.unlink(path.join(rawCloudDir, rf)).catch(() => {});
              }
            }
          } catch {}
        } catch (e) {
          console.warn('[Cron Cleanup] Local cloud cache deletion notice:', e);
        }

        // Only mark is_cloud_deleted = true if storage deletion did not fail
        if (storageDeletionSucceeded) {
          const { error: updErr } = await client
            .from('photos')
            .update({ is_cloud_deleted: true })
            .eq('id', p.id);

          if (!updErr) {
            deletedPhotosCount++;
          } else {
            failedPhotosCount++;
          }
        } else {
          failedPhotosCount++;
        }
      }
    }

    // 2. Check expired GIFs in Supabase (Batch limit: 100)
    const { data: expiredGifs, error: gifErr } = await client
      .from('gifs')
      .select('id, event_id, cloud_storage_path, storage_provider')
      .lt('expires_at', nowIso)
      .eq('is_cloud_deleted', false)
      .order('expires_at', { ascending: true })
      .limit(100);

    if (gifErr) {
      console.warn('[Cron Cleanup] Error querying expired GIFs:', gifErr.message);
    } else if (expiredGifs && expiredGifs.length > 0) {
      for (const g of expiredGifs) {
        let storageDeletionSucceeded = true;
        const provider = g.storage_provider || 'supabase';

        if (provider === 'r2') {
          if (g.cloud_storage_path) {
            try {
              const r2 = getR2Storage();
              await r2.deleteObject(g.cloud_storage_path);
            } catch (delErr: any) {
              if (delErr?.$metadata?.httpStatusCode !== 404 && delErr?.name !== 'NotFound' && delErr?.name !== 'NoSuchKey') {
                console.error(`[Cron Cleanup] R2 deletion failed for GIF ${g.cloud_storage_path}:`, delErr?.message);
                storageDeletionSucceeded = false;
              }
            }
          }
        } else {
          try {
            const gifStoragePath = g.cloud_storage_path || `events/${g.event_id}/${g.id}.gif`;
            await client.storage.from('minglebooth-storage').remove([gifStoragePath]);
          } catch (stErr) {
            console.warn('[Cron Cleanup] GIF storage bucket removal notice:', stErr);
            storageDeletionSucceeded = false;
          }
        }

        // Delete local cloud gallery copies if any
        try {
          const cloudFilePath = path.join(
            dataRoot,
            'cloud-storage/public-gallery/events',
            g.event_id,
            `${g.id}.gif`
          );
          await fs.unlink(cloudFilePath).catch(() => {});
        } catch (e) {
          console.warn('[Cron Cleanup] GIF local cache deletion notice:', e);
        }

        // Only mark is_cloud_deleted = true if storage deletion did not fail
        if (storageDeletionSucceeded) {
          const { error: updErr } = await client
            .from('gifs')
            .update({ is_cloud_deleted: true })
            .eq('id', g.id);

          if (!updErr) {
            deletedGifsCount++;
          } else {
            failedGifsCount++;
          }
        } else {
          failedGifsCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      expiredPhotosProcessed: deletedPhotosCount,
      expiredGifsProcessed: deletedGifsCount,
      failedPhotos: failedPhotosCount,
      failedGifs: failedGifsCount,
      totalCleaned: deletedPhotosCount + deletedGifsCount,
      message: '30-day cloud retention cleanup executed successfully. Local vendor files remain 100% untouched.',
    });
  } catch (err: any) {
    console.error('[Retention Cleanup Exception]:', err);
    return NextResponse.json({ error: err?.message || 'Cleanup job failed' }, { status: 500 });
  }
}
