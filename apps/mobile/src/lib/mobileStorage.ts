/**
 * Mobile Storage & Native Filesystem Engine for MingleBooth Mobile
 * 
 * P0 Storage Architecture:
 * 1. Native Filesystem: Menyimpan salinan foto komposit (.jpg), raw shots (.jpg),
 *    dan Boomerang GIF (.gif) langsung ke penyimpanan native perangkat (Directory.Documents)
 *    agar tidak terhapus oleh eviction policy browser/OS.
 * 2. IndexedDB: Menyimpan metadata lengkap, antrean sinkronisasi, dan dataUrl
 *    untuk rendering instan, pencarian, dan query offline.
 * 3. Graceful Fallback: Jika native filesystem gagal (izin/kuota), data tetap
 *    aman tersimpan di IndexedDB dengan error status transparan.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';

export type MobileSyncStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'demo';
export type MobileStorageLocation = 'native_and_indexeddb' | 'indexeddb_only' | 'memory_only_demo';

// Ephemeral in-memory storage strictly for Demo Mode sessions (Zero disk / zero IndexedDB persistence)
let ephemeralDemoCaptures: MobileCaptureItem[] = [];

export interface MobileCaptureItem {
  photoId: string;
  eventId: string;
  eventName: string;
  photoDataUrl: string;
  gifDataUrl?: string | null;
  hasGif: boolean;
  rawShots?: Array<{ index: number; dataUrl: string }>;
  createdAt: string;
  isDemo?: boolean;
  syncStatus?: MobileSyncStatus;
  syncError?: string;
  syncedAt?: string;
  retryCount?: number;
  lastRetryAt?: string;
  // P0 Native Filesystem Parity Fields
  nativeFilePathProcessed?: string;
  nativeFilePathGif?: string;
  nativeFilePathsRaw?: string[];
  storageLocation?: MobileStorageLocation;
  storageError?: string;
}

const DB_NAME = 'MingleBooth_MobileDB';
const DB_VERSION = 2; // Incremented for schema versioning
const CAPTURES_STORE = 'mobile_captures';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported on this platform'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(CAPTURES_STORE)) {
        const store = db.createObjectStore(CAPTURES_STORE, { keyPath: 'photoId' });
        store.createIndex('eventId', 'eventId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function sanitizeEventDirectoryName(eventName: string): string {
  return (eventName || 'Acara_Photobooth')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

function cleanBase64Payload(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/[\w+.-]+;base64,([\s\S]+)$/);
  return (match ? match[1] : dataUrl).replace(/\s/g, '');
}

/**
 * Menyimpan file foto & GIF ke Native Filesystem perangkat (Android / iOS)
 */
async function writeCaptureToNativeFilesystem(
  item: MobileCaptureItem
): Promise<{
  processedPath?: string;
  gifPath?: string;
  rawPaths: string[];
  error?: string;
}> {
  const rawPaths: string[] = [];
  let processedPath: string | undefined;
  let gifPath: string | undefined;

  try {
    const eventFolder = sanitizeEventDirectoryName(item.eventName);
    const basePath = `MingleBooth/${eventFolder}`;

    // 1. Simpan foto komposit utama (JPEG)
    if (item.photoDataUrl) {
      const relativePath = `${basePath}/processed/${item.photoId}.jpg`;
      const cleanData = cleanBase64Payload(item.photoDataUrl);

      await Filesystem.writeFile({
        path: relativePath,
        data: cleanData,
        directory: Directory.Documents,
        recursive: true,
      });
      processedPath = relativePath;
    }

    // 2. Simpan Boomerang GIF jika tersedia
    if (item.gifDataUrl) {
      const relativePath = `${basePath}/gifs/${item.photoId}.gif`;
      const cleanData = cleanBase64Payload(item.gifDataUrl);

      await Filesystem.writeFile({
        path: relativePath,
        data: cleanData,
        directory: Directory.Documents,
        recursive: true,
      });
      gifPath = relativePath;
    }

    // 3. Simpan seluruh raw camera shots
    if (Array.isArray(item.rawShots) && item.rawShots.length > 0) {
      for (const shot of item.rawShots) {
        if (shot.dataUrl) {
          const rawRelativePath = `${basePath}/raw/${item.photoId}_raw_${shot.index + 1}.jpg`;
          const cleanData = cleanBase64Payload(shot.dataUrl);

          await Filesystem.writeFile({
            path: rawRelativePath,
            data: cleanData,
            directory: Directory.Documents,
            recursive: true,
          });
          rawPaths.push(rawRelativePath);
        }
      }
    }

    return { processedPath, gifPath, rawPaths };
  } catch (err: any) {
    console.warn('[MobileStorage] Native filesystem write fallback notice:', err);
    return {
      processedPath,
      gifPath,
      rawPaths,
      error: err?.message || 'Native filesystem write failed',
    };
  }
}

/**
 * Simpan hasil capture photobooth (Dual-Storage: Native Filesystem + IndexedDB untuk non-demo; Ephemeral RAM untuk demo)
 */
export async function saveMobileCapture(item: MobileCaptureItem): Promise<MobileCaptureItem> {
  // ATURAN DEMO: Demo captures TIDAK BOLEH ditulis ke native filesystem atau IndexedDB permanen
  if (item.isDemo) {
    const demoItem: MobileCaptureItem = {
      ...item,
      syncStatus: 'demo',
      retryCount: 0,
      storageLocation: 'memory_only_demo',
      storageError: undefined,
      nativeFilePathProcessed: undefined,
      nativeFilePathGif: undefined,
      nativeFilePathsRaw: undefined,
    };
    // Simpan ke array in-memory (ephemeral)
    ephemeralDemoCaptures = [demoItem, ...ephemeralDemoCaptures.filter((c) => c.photoId !== demoItem.photoId)];
    return demoItem;
  }

  // Non-Demo (Paid / Verified Session):
  // Step 1: Simpan ke Native Filesystem Android / iOS
  const nativeResult = await writeCaptureToNativeFilesystem(item);

  const storageLocation: MobileStorageLocation = nativeResult.processedPath
    ? 'native_and_indexeddb'
    : 'indexeddb_only';

  const itemToSave: MobileCaptureItem = {
    ...item,
    syncStatus: item.syncStatus || 'pending',
    retryCount: item.retryCount || 0,
    nativeFilePathProcessed: nativeResult.processedPath,
    nativeFilePathGif: nativeResult.gifPath,
    nativeFilePathsRaw: nativeResult.rawPaths.length > 0 ? nativeResult.rawPaths : undefined,
    storageLocation,
    storageError: nativeResult.error,
  };

  // Step 2: Simpan ke IndexedDB lokal untuk query & sync queue
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readwrite');
    const store = tx.objectStore(CAPTURES_STORE);
    const req = store.put(itemToSave);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return itemToSave;
}

/**
 * Ambil daftar capture yang menunggu sinkronisasi (Kecuali Demo Mode)
 */
export async function getPendingMobileCaptures(): Promise<MobileCaptureItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readonly');
    const store = tx.objectStore(CAPTURES_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const all: MobileCaptureItem[] = req.result || [];
      // Demo Mode STRICTLY blocked from cloud upload.
      // Include interrupted 'uploading' items so an app crash mid-upload doesn't permanently freeze an item.
      const pending = all.filter(
        (item) =>
          !item.isDemo &&
          (item.syncStatus === 'pending' ||
            item.syncStatus === 'failed' ||
            item.syncStatus === 'uploading')
      );
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ambil satu capture spesifik berdasarkan ID
 */
export async function getMobileCaptureById(photoId: string): Promise<MobileCaptureItem | null> {
  // Cek memori sementara demo terlebih dahulu
  const demoFound = ephemeralDemoCaptures.find((c) => c.photoId === photoId);
  if (demoFound) return demoFound;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readonly');
    const store = tx.objectStore(CAPTURES_STORE);
    const req = store.get(photoId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Update status sinkronisasi item capture
 */
export async function updateMobileCaptureSyncStatus(
  photoId: string,
  status: MobileSyncStatus,
  errorMsg?: string
): Promise<void> {
  // Jangan ubah status sinkronisasi item demo
  if (ephemeralDemoCaptures.some((c) => c.photoId === photoId)) {
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readwrite');
    const store = tx.objectStore(CAPTURES_STORE);
    const getReq = store.get(photoId);

    getReq.onsuccess = () => {
      const item: MobileCaptureItem = getReq.result;
      if (!item) return resolve();

      item.syncStatus = status;
      if (status === 'synced') {
        item.syncedAt = new Date().toISOString();
        item.syncError = undefined;
      } else if (status === 'failed') {
        item.syncError = errorMsg;
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastRetryAt = new Date().toISOString();
      }

      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Ambil seluruh riwayat capture untuk event tertentu
 */
export async function getEventMobileCaptures(eventId: string): Promise<MobileCaptureItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readonly');
    const store = tx.objectStore(CAPTURES_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const persistedAll: MobileCaptureItem[] = req.result || [];
      // Gabungkan riwayat demo sementara dengan riwayat persisted non-demo
      const all: MobileCaptureItem[] = [...ephemeralDemoCaptures, ...persistedAll];
      const isDemoQuery = eventId === 'evt_demo_mobile' || eventId?.startsWith('demo');
      const filtered = all
        .filter((item) => {
          if (isDemoQuery) {
            return item.isDemo || item.eventId === eventId;
          }
          return item.eventId === eventId && !item.isDemo;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Bersihkan data pengujian Demo Mode (Memori sementara + legacy DB)
 */
export async function clearDemoCaptures(): Promise<number> {
  const memoryCount = ephemeralDemoCaptures.length;
  ephemeralDemoCaptures = [];

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURES_STORE, 'readwrite');
    const store = tx.objectStore(CAPTURES_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const all: MobileCaptureItem[] = req.result || [];
      const demoItems = all.filter(
        (item) => item.isDemo || item.eventId?.startsWith('demo') || item.photoId?.startsWith('DEMO_') || item.photoId?.startsWith('mob_demo_')
      );
      for (const item of demoItems) {
        store.delete(item.photoId);
      }
      resolve(memoryCount + demoItems.length);
    };
    req.onerror = () => reject(req.error);
  });
}

export interface StorageEstimateInfo {
  usageMb: number;
  quotaMb: number;
  percentUsed: number;
  isPersistent: boolean;
}

/**
 * Periksa kuota dan penggunaan penyimpanan IndexedDB perangkat
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usageMb = Math.round((estimate.usage || 0) / (1024 * 1024));
      const quotaMb = Math.round((estimate.quota || 0) / (1024 * 1024));
      const percentUsed = quotaMb > 0 ? Math.round((usageMb / quotaMb) * 100) : 0;
      const isPersistent = (await navigator.storage.persisted?.()) || false;
      return { usageMb, quotaMb, percentUsed, isPersistent };
    } catch {
      // Safe fallback
    }
  }
  return { usageMb: 0, quotaMb: 0, percentUsed: 0, isPersistent: false };
}
