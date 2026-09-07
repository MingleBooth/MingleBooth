/**
 * Offline & Local Storage Helper for MingleBooth Tablet
 * Stores photo composite & GIF captures reliably in browser IndexedDB (hundreds of MB capacity)
 * Works 100% offline on iPad Safari, Android Chrome, and Desktop browsers.
 */

export interface OfflineCaptureItem {
  photoId: string;
  eventId: string;
  eventName: string;
  photoDataUrl: string;
  gifDataUrl?: string | null;
  hasGif: boolean;
  rawShots?: Array<{ index: number; dataUrl: string }>;
  createdAt: string;
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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to localStorage metadata:', err);
    try {
      const key = 'mb_offline_meta';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({
        photoId: item.photoId,
        eventId: item.eventId,
        eventName: item.eventName,
        createdAt: item.createdAt,
        hasGif: item.hasGif,
      });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 30)));
    } catch {}
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
