/**
 * Offline & Local Storage Helper for MingleBooth Tablet
 * Stores photo composite & GIF captures reliably in browser IndexedDB (hundreds of MB capacity)
 * Works 100% offline on iPad Safari, Android Chrome, and Desktop browsers.
 */

export type OfflineSyncStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'demo';

export interface OfflineCaptureItem {
  photoId: string;
  eventId: string;
  eventName: string;
  photoDataUrl: string;
  gifDataUrl?: string | null;
  hasGif: boolean;
  rawShots?: Array<{ index: number; dataUrl: string }>;
  createdAt: string;
  isDemo?: boolean;
  syncStatus?: OfflineSyncStatus;
  syncError?: string;
  syncedAt?: string;
  retryCount?: number;
  lastRetryAt?: string;
}

const DB_NAME = 'MingleBooth_TabletDB';
const DB_VERSION = 1;
const STORE_NAME = 'captures';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'photoId' });
        store.createIndex('eventId', 'eventId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a completed capture into Tablet IndexedDB
 */
export async function saveOfflineCapture(item: OfflineCaptureItem): Promise<void> {
  const itemToSave: OfflineCaptureItem = {
    ...item,
    syncStatus: item.syncStatus || 'pending',
    retryCount: item.retryCount || 0,
  };

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(itemToSave);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to localStorage metadata:', err);
    try {
      const key = 'mb_offline_meta';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({
        photoId: itemToSave.photoId,
        eventId: itemToSave.eventId,
        eventName: itemToSave.eventName,
        createdAt: itemToSave.createdAt,
        hasGif: itemToSave.hasGif,
        syncStatus: itemToSave.syncStatus,
      });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 30)));
    } catch {}
  }
}

/**
 * Update sync status for a specific capture in IndexedDB
 */
export async function updateOfflineCaptureSyncStatus(
  photoId: string,
  status: OfflineSyncStatus,
  error?: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(photoId);

      getReq.onsuccess = () => {
        const existing: OfflineCaptureItem | undefined = getReq.result;
        if (!existing) {
          resolve();
          return;
        }

        existing.syncStatus = status;
        existing.syncError = error || undefined;
        existing.lastRetryAt = new Date().toISOString();
        if (status === 'synced') {
          existing.syncedAt = new Date().toISOString();
        } else if (status === 'failed') {
          existing.retryCount = (existing.retryCount || 0) + 1;
        }

        const putReq = store.put(existing);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error updating sync status:', err);
  }
}

/**
 * Get single capture by photoId
 */
export async function getOfflineCaptureById(photoId: string): Promise<OfflineCaptureItem | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(photoId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error getting capture by id:', err);
    return null;
  }
}

/**
 * Get all captures saved in this Tablet
 */
export async function getOfflineCaptures(eventId?: string): Promise<OfflineCaptureItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineCaptureItem[] = req.result || [];
        // Sort descending by creation date (newest first)
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (eventId && eventId !== 'all') {
          results = results.filter((c) => c.eventId === eventId);
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB fetch error:', err);
    return [];
  }
}

/**
 * Get pending captures that need cloud synchronization
 * Demo captures are strictly excluded so they never enter the cloud queue.
 */
export async function getPendingOfflineCaptures(eventId?: string): Promise<OfflineCaptureItem[]> {
  const all = await getOfflineCaptures(eventId);
  return all.filter((item) => item.syncStatus !== 'synced' && !item.isDemo && !item.eventId?.startsWith('demo'));
}

/**
 * Delete single capture from Tablet storage
 */
export async function deleteOfflineCapture(photoId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(photoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }
}

/**
 * Clear all demo-scoped captures from Tablet storage (idempotent, safe)
 */
export async function clearDemoCaptures(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: OfflineCaptureItem[] = req.result || [];
        for (const item of items) {
          if (item.isDemo || item.eventId?.startsWith('demo') || item.photoId?.startsWith('DEMO_')) {
            store.delete(item.photoId);
          }
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error clearing demo captures:', err);
  }
}

/**
 * Clear captures from Tablet storage (optionally filtered by eventId)
 */
export async function clearOfflineCaptures(eventId?: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (!eventId || eventId === 'all') {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const items: OfflineCaptureItem[] = req.result || [];
          for (const item of items) {
            if (item.eventId === eventId) {
              store.delete(item.photoId);
            }
          }
          resolve();
        };
        req.onerror = () => reject(req.error);
      }
    });
  } catch (err) {
    console.warn('IndexedDB clear error:', err);
  }
}
