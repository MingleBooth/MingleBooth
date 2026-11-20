/**
 * MingleBooth Cloudflare R2 Direct Uploader Client
 *
 * Implements the 3-step high-performance binary direct upload architecture:
 * 1. POST /api/gallery/upload/initiate -> receives uploadAttemptId & presigned PUT URL
 * 2. PUT uploadUrl -> uploads binary directly to Cloudflare R2 (with progress tracking)
 * 3. POST /api/gallery/upload/confirm -> requests backend to verify object in R2 and update database
 *
 * Safety & Compatibility Features:
 * - Direct binary streaming (Uint8Array / Blob) without Base64 payload overhead to Next.js
 * - Offline-first queue support: local status only marked 'synced' after confirm succeeds
 * - Resilient retry capability with backend idempotency protection
 * - Automatic dual-mode fallback: gracefully falls back to legacy /api/sync/upload-capture
 *   if R2 initiate is unavailable or when Supabase Storage provider is requested.
 */

export type AssetType = 'photo' | 'thumbnail' | 'gif' | 'raw';

export interface AssetUploadResult {
  success: boolean;
  uploadAttemptId: string;
  assetType: AssetType;
  objectKey: string;
  storageProvider: string;
  cloudUrl?: string | null;
  qrUrl?: string | null;
  idempotent?: boolean;
}

export interface CaptureSessionPayload {
  photoId: string;
  eventId: string;
  compositeDataUrl: string;
  thumbnailDataUrl?: string | null;
  gifDataUrl?: string | null;
  rawShots?: Array<{ index: number; dataUrl: string }> | string[];
}

export interface SessionUploadResult {
  success: boolean;
  provider: 'r2' | 'supabase';
  photoId: string;
  eventId: string;
  assets: {
    photo?: AssetUploadResult;
    thumbnail?: AssetUploadResult;
    gif?: AssetUploadResult;
    raw?: AssetUploadResult[];
  };
  error?: string;
}

export interface DirectUploadOptions {
  backendUrl: string;
  authToken: string;
  providerPreference?: 'auto' | 'r2' | 'supabase';
  onProgress?: (assetType: AssetType, index: number, percent: number) => void;
}

/**
 * Converts a data URL (Base64) to raw binary Uint8Array and extracts its MIME type.
 * Works seamlessly in Browser, Electron, Android WebView, and Node.js.
 */
export function dataUrlToBinary(dataUrl: string): { buffer: Uint8Array; contentType: string } {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URL: missing comma');
  }
  const header = dataUrl.substring(0, commaIdx);
  const base64 = dataUrl.substring(commaIdx + 1);

  const mimeMatch = header.match(/data:([^;]+)/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let buffer: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    const nodeBuf = Buffer.from(base64, 'base64');
    buffer = new Uint8Array(nodeBuf.buffer, nodeBuf.byteOffset, nodeBuf.byteLength);
  } else if (typeof atob === 'function') {
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = binaryStr.charCodeAt(i);
    }
  } else {
    throw new Error('Neither Buffer nor atob is available in this environment');
  }

  return { buffer, contentType };
}

/**
 * Uploads raw binary directly to a presigned URL using HTTP PUT.
 * Uses XMLHttpRequest when available for accurate progress tracking,
 * falling back to fetch for Node.js / headless test environments.
 */
export async function uploadBinaryDirect(
  url: string,
  data: Uint8Array | ArrayBuffer | Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const byteLength = data instanceof Blob ? data.size : (data as Uint8Array).byteLength;

  // Use XMLHttpRequest when available (Chromium Electron, Android WebView, Browser)
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve();
        } else {
          reject(new Error(`Presigned PUT failed with status HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during presigned PUT upload'));
      xhr.ontimeout = () => reject(new Error('Presigned PUT upload timed out'));
      xhr.send(data instanceof Blob ? data : (data as any));
    });
  }

  // Fallback to fetch for Node.js environments
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(byteLength),
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: data as any,
  });

  if (!res.ok) {
    throw new Error(`Presigned PUT failed with status HTTP ${res.status}: ${res.statusText}`);
  }

  if (onProgress) onProgress(100);
}

/**
 * Initiates an upload attempt with the MingleBooth R2 upload API.
 * Step 1 of the 3-step pipeline.
 */
export async function initiateR2Upload(
  backendUrl: string,
  authToken: string,
  payload: {
    eventId: string;
    sessionPhotoId: string;
    assetType: AssetType;
    rawIndex?: number;
    contentType: string;
    expectedSizeBytes: number;
  }
): Promise<{
  success: boolean;
  uploadAttemptId: string;
  uploadUrl: string;
  storageProvider: string;
  objectKey: string;
  bucketName: string;
}> {
  const cleanBase = backendUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/gallery/upload/initiate`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const resJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(resJson.error || `Initiate failed with status HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).code = resJson.code;
    throw err;
  }

  return resJson;
}

/**
 * Confirms an upload attempt after the binary has been written to R2.
 * Step 3 of the 3-step pipeline.
 */
export async function confirmR2Upload(
  backendUrl: string,
  authToken: string,
  payload: {
    uploadAttemptId: string;
    sessionPhotoId: string;
    eventId: string;
  }
): Promise<{
  success: boolean;
  idempotent: boolean;
  uploadStatus: string;
  storageProvider: string;
  objectKey: string;
  cloudUrl?: string | null;
  qrUrl?: string | null;
}> {
  const cleanBase = backendUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/gallery/upload/confirm`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const resJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(resJson.error || `Confirm failed with status HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).code = resJson.code;
    throw err;
  }

  return resJson;
}

/**
 * Executes the complete 3-step pipeline for a single asset:
 * 1. Initiate attempt
 * 2. Direct binary PUT
 * 3. Confirm with backend
 */
export async function uploadSingleAssetDirectToR2(
  backendUrl: string,
  authToken: string,
  params: {
    eventId: string;
    sessionPhotoId: string;
    assetType: AssetType;
    rawIndex?: number;
    data: Uint8Array | string;
    contentType?: string;
    onProgress?: (percent: number) => void;
  }
): Promise<AssetUploadResult> {
  let binary: Uint8Array;
  let resolvedContentType = params.contentType || 'image/jpeg';

  if (typeof params.data === 'string') {
    const parsed = dataUrlToBinary(params.data);
    binary = parsed.buffer;
    resolvedContentType = params.contentType || parsed.contentType;
  } else {
    binary = params.data;
  }

  // 1. Initiate
  const initRes = await initiateR2Upload(backendUrl, authToken, {
    eventId: params.eventId,
    sessionPhotoId: params.sessionPhotoId,
    assetType: params.assetType,
    rawIndex: params.rawIndex,
    contentType: resolvedContentType,
    expectedSizeBytes: binary.byteLength,
  });

  // 2. Direct PUT to Cloudflare R2 presigned URL
  await uploadBinaryDirect(
    initRes.uploadUrl,
    binary,
    resolvedContentType,
    params.onProgress
  );

  // 3. Confirm
  const confirmRes = await confirmR2Upload(backendUrl, authToken, {
    uploadAttemptId: initRes.uploadAttemptId,
    sessionPhotoId: params.sessionPhotoId,
    eventId: params.eventId,
  });

  return {
    success: true,
    uploadAttemptId: initRes.uploadAttemptId,
    assetType: params.assetType,
    objectKey: confirmRes.objectKey,
    storageProvider: confirmRes.storageProvider || 'r2',
    cloudUrl: confirmRes.cloudUrl,
    qrUrl: confirmRes.qrUrl,
    idempotent: confirmRes.idempotent,
  };
}

/**
 * Uploads an entire photo session (photo, thumbnail, GIF, RAW) using R2 Direct Upload.
 */
export async function uploadSessionToR2(
  backendUrl: string,
  authToken: string,
  payload: CaptureSessionPayload,
  onProgress?: (assetType: AssetType, index: number, percent: number) => void
): Promise<SessionUploadResult> {
  const result: SessionUploadResult = {
    success: false,
    provider: 'r2',
    photoId: payload.photoId,
    eventId: payload.eventId,
    assets: {},
  };

  // 1. Upload main composite photo (Mandatory)
  result.assets.photo = await uploadSingleAssetDirectToR2(backendUrl, authToken, {
    eventId: payload.eventId,
    sessionPhotoId: payload.photoId,
    assetType: 'photo',
    data: payload.compositeDataUrl,
    onProgress: (p) => onProgress?.('photo', 0, p),
  });

  // 2. Upload thumbnail if available
  if (payload.thumbnailDataUrl) {
    try {
      result.assets.thumbnail = await uploadSingleAssetDirectToR2(backendUrl, authToken, {
        eventId: payload.eventId,
        sessionPhotoId: payload.photoId,
        assetType: 'thumbnail',
        data: payload.thumbnailDataUrl,
        onProgress: (p) => onProgress?.('thumbnail', 0, p),
      });
    } catch (thumbErr: any) {
      console.warn(`[R2Uploader] Thumbnail upload warning for ${payload.photoId}:`, thumbErr.message);
    }
  }

  // 3. Upload GIF if available
  if (payload.gifDataUrl) {
    try {
      result.assets.gif = await uploadSingleAssetDirectToR2(backendUrl, authToken, {
        eventId: payload.eventId,
        sessionPhotoId: payload.photoId,
        assetType: 'gif',
        data: payload.gifDataUrl,
        onProgress: (p) => onProgress?.('gif', 0, p),
      });
    } catch (gifErr: any) {
      console.warn(`[R2Uploader] GIF upload warning for ${payload.photoId}:`, gifErr.message);
    }
  }

  // 4. Upload RAW shots sequentially if available
  if (payload.rawShots && payload.rawShots.length > 0) {
    result.assets.raw = [];
    for (let i = 0; i < payload.rawShots.length; i++) {
      const shot = payload.rawShots[i];
      const dataUrl = typeof shot === 'string' ? shot : shot.dataUrl;
      const rawIndex = typeof shot === 'object' && shot.index !== undefined ? shot.index : i + 1;

      if (!dataUrl) continue;

      try {
        const rawRes = await uploadSingleAssetDirectToR2(backendUrl, authToken, {
          eventId: payload.eventId,
          sessionPhotoId: payload.photoId,
          assetType: 'raw',
          rawIndex,
          data: dataUrl,
          onProgress: (p) => onProgress?.('raw', rawIndex, p),
        });
        result.assets.raw.push(rawRes);
      } catch (rawErr: any) {
        console.warn(`[R2Uploader] RAW shot ${rawIndex} warning for ${payload.photoId}:`, rawErr.message);
      }
    }
  }

  result.success = true;
  return result;
}

/**
 * Uploads an entire photo session using the legacy /api/sync/upload-capture route (Supabase Storage).
 */
export async function uploadSessionLegacySupabase(
  backendUrl: string,
  authToken: string,
  payload: CaptureSessionPayload
): Promise<SessionUploadResult> {
  const cleanBase = backendUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/sync/upload-capture`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // 1. Upload main composite photo
  const photoRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      photoId: payload.photoId,
      eventId: payload.eventId,
      fileDataUrl: payload.compositeDataUrl,
      type: 'photo',
    }),
  });

  const photoJson = await photoRes.json().catch(() => ({}));
  if (!photoRes.ok) {
    throw new Error(photoJson.error || `Legacy photo upload failed: HTTP ${photoRes.status}`);
  }

  const result: SessionUploadResult = {
    success: true,
    provider: 'supabase',
    photoId: payload.photoId,
    eventId: payload.eventId,
    assets: {
      photo: {
        success: true,
        uploadAttemptId: 'legacy_supabase',
        assetType: 'photo',
        objectKey: photoJson.storagePath || '',
        storageProvider: 'supabase',
        cloudUrl: photoJson.cloudUrl,
      },
    },
  };

  // 2. Upload GIF if available
  if (payload.gifDataUrl) {
    try {
      const gifRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          photoId: payload.photoId,
          eventId: payload.eventId,
          fileDataUrl: payload.gifDataUrl,
          type: 'gif',
        }),
      });
      if (gifRes.ok) {
        const gifJson = await gifRes.json().catch(() => ({}));
        result.assets.gif = {
          success: true,
          uploadAttemptId: 'legacy_supabase_gif',
          assetType: 'gif',
          objectKey: gifJson.storagePath || '',
          storageProvider: 'supabase',
          cloudUrl: gifJson.cloudUrl,
        };
      }
    } catch (e: any) {
      console.warn(`[LegacyUpload] GIF upload notice:`, e.message);
    }
  }

  // 3. Upload RAW shots if available
  if (payload.rawShots && payload.rawShots.length > 0) {
    result.assets.raw = [];
    for (let i = 0; i < payload.rawShots.length; i++) {
      const shot = payload.rawShots[i];
      const dataUrl = typeof shot === 'string' ? shot : shot.dataUrl;
      const rawIndex = typeof shot === 'object' && shot.index !== undefined ? shot.index : i + 1;
      if (!dataUrl) continue;

      try {
        const rawRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            photoId: payload.photoId,
            eventId: payload.eventId,
            fileDataUrl: dataUrl,
            type: 'raw',
            rawIndex,
          }),
        });
        if (rawRes.ok) {
          const rawJson = await rawRes.json().catch(() => ({}));
          result.assets.raw.push({
            success: true,
            uploadAttemptId: `legacy_supabase_raw_${rawIndex}`,
            assetType: 'raw',
            objectKey: rawJson.storagePath || '',
            storageProvider: 'supabase',
          });
        }
      } catch (e: any) {
        console.warn(`[LegacyUpload] RAW shot ${rawIndex} notice:`, e.message);
      }
    }
  }

  return result;
}

/**
 * High-level unified uploader with automatic fallback:
 * - If preference is 'supabase', uses legacy upload.
 * - If preference is 'r2', uses R2 direct upload.
 * - If preference is 'auto' (default), tries R2 direct upload first;
 *   if R2 initiate returns HTTP 404, 501, or STORAGE_PROVIDER_DISABLED,
 *   it seamlessly falls back to legacy Supabase Storage upload.
 */
export async function uploadSessionWithFallback(
  options: DirectUploadOptions & {
    payload: CaptureSessionPayload;
  }
): Promise<SessionUploadResult> {
  const preference = options.providerPreference || 'auto';

  if (preference === 'supabase') {
    return uploadSessionLegacySupabase(options.backendUrl, options.authToken, options.payload);
  }

  if (preference === 'r2') {
    return uploadSessionToR2(options.backendUrl, options.authToken, options.payload, options.onProgress);
  }

  // 'auto' mode: try R2 first, fallback if unavailable
  try {
    return await uploadSessionToR2(options.backendUrl, options.authToken, options.payload, options.onProgress);
  } catch (err: any) {
    const isR2Unavailable =
      err?.status === 404 ||
      err?.status === 501 ||
      err?.code === 'STORAGE_PROVIDER_DISABLED' ||
      err?.code === 'R2_NOT_CONFIGURED';

    if (isR2Unavailable) {
      console.log('[Uploader] R2 Direct Upload not enabled on backend, falling back to legacy Supabase upload.');
      return uploadSessionLegacySupabase(options.backendUrl, options.authToken, options.payload);
    }

    // Re-throw genuine errors (auth failure, validation, network timeout)
    throw err;
  }
}
