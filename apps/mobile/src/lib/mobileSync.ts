import {
  getPendingMobileCaptures,
  updateMobileCaptureSyncStatus,
  getMobileCaptureById,
  MobileSyncStatus,
} from './mobileStorage';
import { safeApiFetch } from './networkGuard';

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

        // Step 1: Upload main composite photo
        const photoPayload = {
          photoId: item.photoId,
          eventId: item.eventId,
          fileDataUrl: item.photoDataUrl,
          type: 'photo' as const,
        };

        const res = await safeApiFetch(`${baseUrl}/api/sync/upload-capture`, {
          method: 'POST',
          headers,
          body: JSON.stringify(photoPayload),
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(errorBody.message || errorBody.error || `HTTP ${res.status}`);
        }

        // Step 2: Upload Boomerang GIF jika tersedia
        if (item.gifDataUrl) {
          try {
            const gifPayload = {
              photoId: item.photoId,
              eventId: item.eventId,
              fileDataUrl: item.gifDataUrl,
              type: 'gif' as const,
            };
            const gifRes = await safeApiFetch(`${baseUrl}/api/sync/upload-capture`, {
              method: 'POST',
              headers,
              body: JSON.stringify(gifPayload),
            });
            if (!gifRes.ok) {
              console.warn(`[MobileSync] Warning upload GIF photoId=${item.photoId}: HTTP ${gifRes.status}`);
            }
          } catch (gifErr) {
            console.warn(`[MobileSync] GIF upload notice for photoId=${item.photoId}:`, gifErr);
          }
        }

        // Step 3: Upload all original raw shots for desktop parity
        if (item.rawShots && item.rawShots.length > 0) {
          for (let i = 0; i < item.rawShots.length; i++) {
            const shot = item.rawShots[i];
            if (!shot || !shot.dataUrl) continue;
            try {
              const rawPayload = {
                photoId: item.photoId,
                eventId: item.eventId,
                fileDataUrl: shot.dataUrl,
                type: 'raw' as const,
                rawIndex: shot.index !== undefined ? shot.index + 1 : i + 1,
              };
              const rawRes = await safeApiFetch(`${baseUrl}/api/sync/upload-capture`, {
                method: 'POST',
                headers,
                body: JSON.stringify(rawPayload),
              });
              if (!rawRes.ok) {
                console.warn(`[MobileSync] Warning upload raw shot ${i + 1} photoId=${item.photoId}: HTTP ${rawRes.status}`);
              }
            } catch (rawErr) {
              console.warn(`[MobileSync] Raw shot ${i + 1} notice for photoId=${item.photoId}:`, rawErr);
            }
          }
        }

        await updateMobileCaptureSyncStatus(item.photoId, 'synced');
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
