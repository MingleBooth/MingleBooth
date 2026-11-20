import {
  getPendingMobileCaptures,
  updateMobileCaptureSyncStatus,
  getMobileCaptureById,
  MobileSyncStatus,
} from './mobileStorage';
import { uploadSessionWithFallback } from '@minglebooth/sync-engine';

export interface MobileSyncResult {
  totalPending: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
}

// Concurrency mutex lock to prevent simultaneous duplicate upload tasks
let isSyncInProgress = false;

/**
 * Sinkronisasi antrean foto mobile ke backend MingleBooth
 * Mematuhi kontrak endpoint /api/sync/upload-capture
 * Dilengkapi dengan duplicate prevention & concurrency mutex guard.
 */
export async function syncPendingCaptures(
  backendUrl: string,
  authToken: string,
  isDemoMode: boolean
): Promise<MobileSyncResult> {
  const result: MobileSyncResult = {
    totalPending: 0,
    syncedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  // 1. Demo Mode: Pengunggahan cloud diblokir secara ketat
  const isStoredDemo = typeof window !== 'undefined' && localStorage.getItem('mb_is_demo') === 'true';
  if (isDemoMode || isStoredDemo) {
    return result;
  }

  // 2. Concurrency Guard: Jika sinkronisasi sedang berjalan, hindari eksekusi paralel ganda
  if (isSyncInProgress) {
    console.log('[MobileSync] Sync loop already in progress, skipping concurrent run.');
    return result;
  }

  isSyncInProgress = true;

  try {
    const pending = await getPendingMobileCaptures();
    result.totalPending = pending.length;

    if (pending.length === 0) {
      return result;
    }

    const baseUrl = backendUrl.replace(/\/$/, '');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    for (const item of pending) {
      // 3. Double-check status terkini di IndexedDB untuk mencegah re-upload duplicate
      const currentFresh = await getMobileCaptureById(item.photoId);
      if (!currentFresh || currentFresh.syncStatus === 'synced') {
        result.skippedCount++;
        continue;
      }

      try {
        await updateMobileCaptureSyncStatus(item.photoId, 'uploading');

        // Execute Direct Upload (R2 binary streaming with automatic fallback to legacy Supabase)
        const uploadRes = await uploadSessionWithFallback({
          backendUrl: baseUrl,
          authToken,
          payload: {
            photoId: item.photoId,
            eventId: item.eventId,
            compositeDataUrl: item.photoDataUrl,
            gifDataUrl: item.gifDataUrl,
            rawShots: item.rawShots,
          },
          onProgress: (assetType: string, idx: number, percent: number) => {
            console.log(`[MobileSync] ${item.photoId} ${assetType}${idx ? ' #' + idx : ''}: ${percent}%`);
          },
        });

        if (!uploadRes.success) {
          throw new Error(uploadRes.error || 'Mobile upload failed');
        }

        // Only transition local status to 'synced' AFTER backend confirmation succeeds
        await updateMobileCaptureSyncStatus(item.photoId, 'synced');
        console.log(`[MobileSync] PhotoId=${item.photoId} successfully synced via ${uploadRes.provider}.`);
        result.syncedCount++;
      } catch (err: any) {
        console.warn(`[MobileSync] Gagal upload photoId=${item.photoId}:`, err);
        const msg = err.message || 'Network error';
        await updateMobileCaptureSyncStatus(item.photoId, 'failed', msg);
        result.failedCount++;
        result.errors.push(`${item.photoId}: ${msg}`);
      }
    }

    return result;
  } finally {
    isSyncInProgress = false;
  }
}
