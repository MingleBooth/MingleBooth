import { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '../supabase';
import { StorageAdapter } from '../storage/types';
import { getR2Storage } from '../storage/storage-provider';
import { VerifiedAuthResult } from '../auth-server';

export type GalleryAssetType = 'photo' | 'thumbnail' | 'gif' | 'raw';

export interface InitiateUploadInput {
  eventId: string;
  sessionPhotoId: string;
  assetType: GalleryAssetType;
  rawIndex?: number | null;
  contentType: string;
  expectedSizeBytes?: number;
}

export interface InitiateUploadResult {
  success: boolean;
  uploadAttemptId: string;
  sessionPhotoId: string;
  assetType: GalleryAssetType;
  rawIndex: number | null;
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
  expiresAt: string;
  storageProvider: 'r2';
}

export interface ConfirmUploadInput {
  uploadAttemptId: string;
  sessionPhotoId: string;
  eventId: string;
}

export interface ConfirmUploadResult {
  success: boolean;
  idempotent: boolean;
  uploadStatus: string;
  sessionPhotoId: string;
  assetType: GalleryAssetType;
  objectKey: string;
  confirmedAt: string;
}

export interface ServiceError {
  error: string;
  code: string;
  status: number;
}

const ALLOWED_MIME_TYPES: Record<GalleryAssetType, string[]> = {
  photo: ['image/jpeg', 'image/png'],
  thumbnail: ['image/jpeg', 'image/png'],
  gif: ['image/gif'],
  raw: [
    'image/jpeg',
    'image/png',
    'image/x-canon-cr2',
    'image/x-canon-cr3',
    'image/x-nikon-nef',
    'image/x-sony-arw',
  ],
};

const MAX_SIZE_LIMITS: Record<GalleryAssetType, number> = {
  photo: 20 * 1024 * 1024,      // 20 MB
  thumbnail: 5 * 1024 * 1024,   // 5 MB
  gif: 25 * 1024 * 1024,        // 25 MB
  raw: 50 * 1024 * 1024,        // 50 MB
};

/**
 * Maps MIME types to deterministic file extensions
 */
export const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/x-canon-cr2': 'cr2',
  'image/x-canon-cr3': 'cr3',
  'image/x-nikon-nef': 'nef',
  'image/x-sony-arw': 'arw',
};

export function getExtensionFromMime(mimeType: string): string {
  const ext = MIME_EXTENSION_MAP[mimeType.toLowerCase()];
  if (!ext) {
    throw {
      error: `Unsupported MIME type: '${mimeType}'.`,
      code: 'UNSUPPORTED_MIME_TYPE',
      status: 415,
    };
  }
  return ext;
}

/**
 * Validates sessionPhotoId format
 */
export function validateSessionPhotoId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (id.length < 3 || id.length > 100) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Resolves event and guarantees organization ownership
 */
export async function resolveVerifiedEvent(
  client: SupabaseClient,
  eventId: string,
  orgId: string,
  isSuperAdmin: boolean = false
): Promise<{ validEventId: string; organizationId: string } | null> {
  const isUuid = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  let matched: { id: string; organization_id: string } | null = null;

  if (isUuid(eventId)) {
    const { data, error } = await client
      .from('events')
      .select('id, organization_id')
      .eq('id', eventId);

    if (error) {
      throw {
        error: `Database error saat mencari event ID: ${error.message}`,
        code: 'DB_ERROR',
        status: 500,
      };
    }
    if (data && data.length > 0) {
      matched = data[0];
    }
  } else if (eventId && eventId !== 'default_event' && eventId !== 'all') {
    // 1. Try slug
    const { data: bySlug, error: slugErr } = await client
      .from('events')
      .select('id, organization_id')
      .eq('slug', eventId);

    if (slugErr) {
      throw {
        error: `Database error saat mencari event slug: ${slugErr.message}`,
        code: 'DB_ERROR',
        status: 500,
      };
    }

    if (bySlug && bySlug.length > 1) {
      throw {
        error: `Integritas event terlanggar: Ditemukan ${bySlug.length} event dengan slug '${eventId}'.`,
        code: 'AMBIGUOUS_EVENT',
        status: 409,
      };
    }
    if (bySlug && bySlug.length === 1) {
      matched = bySlug[0];
    }

    // 2. Try name if not matched
    if (!matched) {
      const { data: byName, error: nameErr } = await client
        .from('events')
        .select('id, organization_id')
        .ilike('name', eventId);

      if (nameErr) {
        throw {
          error: `Database error saat mencari event name: ${nameErr.message}`,
          code: 'DB_ERROR',
          status: 500,
        };
      }

      if (byName && byName.length > 1) {
        throw {
          error: `Integritas event terlanggar: Ditemukan ${byName.length} event dengan nama '${eventId}'. Silakan gunakan event UUID.`,
          code: 'AMBIGUOUS_EVENT',
          status: 409,
        };
      }
      if (byName && byName.length === 1) {
        matched = byName[0];
      }
    }
  }

  if (!matched) {
    return null;
  }

  // Cross-tenant protection: verify ownership
  if (!isSuperAdmin && matched.organization_id !== orgId) {
    throw {
      error: 'Akses ditolak: Event ini bukan milik organisasi Anda.',
      code: 'ORG_ACCESS_DENIED',
      status: 403,
    };
  }

  return {
    validEventId: matched.id,
    organizationId: matched.organization_id,
  };
}

/**
 * Derives deterministic Cloudflare R2 object key
 */
export function buildR2ObjectKey(
  eventId: string,
  sessionPhotoId: string,
  assetType: GalleryAssetType,
  rawIndex?: number | null,
  contentType: string = 'image/jpeg'
): string {
  const ext = getExtensionFromMime(contentType);

  switch (assetType) {
    case 'thumbnail':
      return `events/${eventId}/thumbnails/${sessionPhotoId}_thumb.${ext}`;
    case 'gif':
      return `events/${eventId}/${sessionPhotoId}.gif`;
    case 'raw':
      return `events/${eventId}/raw/${sessionPhotoId}_raw_${rawIndex || 1}.${ext}`;
    case 'photo':
    default:
      return `events/${eventId}/${sessionPhotoId}.${ext}`;
  }
}

/**
 * Service to initiate a gallery asset upload attempt
 */
export async function initiateGalleryUpload(
  auth: VerifiedAuthResult,
  input: InitiateUploadInput,
  deps: {
    client?: SupabaseClient;
    storage?: StorageAdapter;
  } = {}
): Promise<InitiateUploadResult> {
  const client = deps.client || getServiceSupabase();
  const storage = deps.storage || getR2Storage();

  if (!auth.success || !auth.orgId) {
    throw { error: 'Autentikasi Bearer wajib.', code: 'AUTH_REQUIRED', status: 401 };
  }

  // 1. Validate sessionPhotoId
  if (!validateSessionPhotoId(input.sessionPhotoId)) {
    throw {
      error: 'Format sessionPhotoId tidak valid. Harus 3-100 karakter alfanumerik, dash, atau underscore.',
      code: 'INVALID_SESSION_PHOTO_ID',
      status: 400,
    };
  }

  // 2. Validate assetType
  if (!['photo', 'thumbnail', 'gif', 'raw'].includes(input.assetType)) {
    throw {
      error: 'Tipe asset tidak valid. Harus salah satu dari: photo, thumbnail, gif, raw.',
      code: 'INVALID_ASSET_TYPE',
      status: 400,
    };
  }

  // 3. Validate rawIndex
  let parsedRawIndex: number | null = null;
  if (input.assetType === 'raw') {
    if (input.rawIndex === undefined || input.rawIndex === null) {
      throw {
        error: 'rawIndex wajib diisi untuk tipe asset raw.',
        code: 'MISSING_RAW_INDEX',
        status: 400,
      };
    }
    parsedRawIndex = parseInt(String(input.rawIndex), 10);
    if (isNaN(parsedRawIndex) || parsedRawIndex < 1 || parsedRawIndex > 50) {
      throw {
        error: 'rawIndex harus berupa bilangan bulat antara 1 dan 50.',
        code: 'INVALID_RAW_INDEX',
        status: 400,
      };
    }
  } else if (input.rawIndex !== undefined && input.rawIndex !== null) {
    throw {
      error: 'rawIndex hanya diperbolehkan untuk tipe asset raw.',
      code: 'RAW_INDEX_NOT_ALLOWED',
      status: 400,
    };
  }

  // 4. Validate MIME type
  const allowedMimes = ALLOWED_MIME_TYPES[input.assetType];
  if (!allowedMimes.includes(input.contentType)) {
    throw {
      error: `Content-Type '${input.contentType}' tidak didukung untuk asset '${input.assetType}'. Diizinkan: ${allowedMimes.join(', ')}`,
      code: 'INVALID_CONTENT_TYPE',
      status: 415,
    };
  }

  // 5. Validate expected file size
  const maxSize = MAX_SIZE_LIMITS[input.assetType];
  if (input.expectedSizeBytes !== undefined && input.expectedSizeBytes !== null) {
    if (typeof input.expectedSizeBytes !== 'number' || input.expectedSizeBytes <= 0) {
      throw {
        error: 'expectedSizeBytes harus berupa angka positif.',
        code: 'INVALID_SIZE_BYTES',
        status: 400,
      };
    }
    if (input.expectedSizeBytes > maxSize) {
      throw {
        error: `Ukuran file melebihi batas maksimum (${maxSize / (1024 * 1024)}MB).`,
        code: 'FILE_SIZE_EXCEEDED',
        status: 413,
      };
    }
  }

  // 6. Verify Event and Tenant Ownership
  const eventRes = await resolveVerifiedEvent(client, input.eventId, auth.orgId, auth.isSuperAdmin);
  if (!eventRes) {
    throw {
      error: 'Event tidak ditemukan atau tidak tersedia.',
      code: 'EVENT_NOT_FOUND',
      status: 404,
    };
  }
  const validEventId = eventRes.validEventId;
  const validOrgId = eventRes.organizationId;

  // 7. Generate deterministic R2 object key
  const objectKey = buildR2ObjectKey(
    validEventId,
    input.sessionPhotoId,
    input.assetType,
    parsedRawIndex,
    input.contentType
  );

  // 8. Find or create parent photo record
  let parentPhotoId: string | null = null;
  const { data: matchingPhotos, error: photoLookupErr } = await client
    .from('photos')
    .select('id, upload_status')
    .eq('organization_id', validOrgId)
    .eq('event_id', validEventId)
    .eq('session_photo_id', input.sessionPhotoId)
    .eq('is_cloud_deleted', false);

  if (photoLookupErr) {
    throw {
      error: `Gagal mencari parent photo: ${photoLookupErr.message}`,
      code: 'PHOTO_LOOKUP_FAILED',
      status: 500,
    };
  }

  if (matchingPhotos && matchingPhotos.length > 1) {
    throw {
      error: `Integritas data terlanggar: Ditemukan ${matchingPhotos.length} record parent photo untuk session_photo_id "${input.sessionPhotoId}".`,
      code: 'DATA_INTEGRITY_VIOLATION',
      status: 409,
    };
  }

  const existingPhoto = matchingPhotos && matchingPhotos.length === 1 ? matchingPhotos[0] : null;

  if (input.assetType === 'raw' && !existingPhoto) {
    throw {
      error: `Parent photo untuk session_photo_id "${input.sessionPhotoId}" belum ada. Asset RAW wajib memiliki parent photo.`,
      code: 'PARENT_PHOTO_REQUIRED',
      status: 400,
    };
  }

  if (existingPhoto) {
    parentPhotoId = existingPhoto.id;
  } else if (input.assetType === 'photo') {
    const { data: newPhoto, error: photoErr } = await client
      .from('photos')
      .insert({
        event_id: validEventId,
        organization_id: validOrgId,
        session_photo_id: input.sessionPhotoId,
        upload_status: 'PENDING',
        storage_provider: 'r2',
        cloud_storage_path: objectKey,
        width: null,
        height: null,
      })
      .select('id')
      .single();

    if (photoErr || !newPhoto) {
      // Precision check: ONLY recover if the error explicitly identifies uidx_photos_active_session
      const errCode = String(photoErr?.code || '');
      const errMsg = String(photoErr?.message || '');
      const errDetails = String(photoErr?.details || (photoErr as any)?.detail || '');
      const errConstraint = String((photoErr as any)?.constraint || '');

      const isUniqueViolation =
        errCode === '23505' ||
        errMsg.toLowerCase().includes('duplicate key') ||
        errMsg.toLowerCase().includes('violates unique constraint');

      // Strict explicit check: ONLY allow uidx_photos_active_session.
      // Do NOT fallback to column matching (organization_id, event_id, session_photo_id).
      const isPhotosActiveSessionConstraint =
        errConstraint === 'uidx_photos_active_session' ||
        errMsg.includes('uidx_photos_active_session') ||
        errDetails.includes('uidx_photos_active_session');

      const isSessionPhotoUniqueViolation = isUniqueViolation && isPhotosActiveSessionConstraint;

      if (isSessionPhotoUniqueViolation) {
        // 1. Query ulang foto aktif berdasarkan organization_id, event_id, dan session_photo_id
        const { data: recoveryPhotos, error: recoveryErr } = await client
          .from('photos')
          .select('id, upload_status, storage_provider, organization_id, event_id, session_photo_id, is_cloud_deleted')
          .eq('organization_id', validOrgId)
          .eq('event_id', validEventId)
          .eq('session_photo_id', input.sessionPhotoId)
          .eq('is_cloud_deleted', false);

        if (recoveryErr) {
          throw {
            error: `Gagal mencari ulang parent photo setelah konflik keunikan: ${recoveryErr.message}`,
            code: 'PHOTO_RECOVERY_FAILED',
            status: 500,
          };
        }

        // 2. Pastikan hanya satu parent foto yang ditemukan
        if (!recoveryPhotos || recoveryPhotos.length === 0) {
          throw {
            error: `Konflik keunikan terdeteksi (23505), namun foto aktif tidak ditemukan untuk session "${input.sessionPhotoId}".`,
            code: 'PHOTO_SESSION_CONFLICT',
            status: 409,
          };
        }

        if (recoveryPhotos.length > 1) {
          throw {
            error: `Integritas data terlanggar: Ditemukan ${recoveryPhotos.length} record parent photo untuk session "${input.sessionPhotoId}".`,
            code: 'DATA_INTEGRITY_VIOLATION',
            status: 409,
          };
        }

        const recoveredPhoto = recoveryPhotos[0];

        // 4. Lanjutkan proses hanya jika parent foto benar-benar cocok dengan request
        if (
          recoveredPhoto.organization_id !== validOrgId ||
          recoveredPhoto.event_id !== validEventId ||
          recoveredPhoto.session_photo_id !== input.sessionPhotoId ||
          recoveredPhoto.is_cloud_deleted !== false
        ) {
          throw {
            error: `Parent photo yang di-recover tidak cocok dengan parameter request session "${input.sessionPhotoId}".`,
            code: 'PHOTO_METADATA_MISMATCH',
            status: 409,
          };
        }

        // 3. Gunakan ID foto tersebut sebagai parentPhotoId
        parentPhotoId = recoveredPhoto.id;
      } else {
        // Non-session unique violation, unknown constraint, or other insert error:
        // DO NOT trigger recovery. Preserve original error code and details.
        throw {
          error: `Gagal membuat placeholder parent photo: ${photoErr?.message || 'Database error'}`,
          code: photoErr?.code || 'PHOTO_INSERT_FAILED',
          status: 500,
          details: photoErr?.details || (photoErr as any)?.detail || null,
        };
      }
    } else {
      parentPhotoId = newPhoto.id;
    }
  }

  // 9. Supersede previous active attempt for the same asset
  let supersedeQuery = client
    .from('gallery_upload_attempts')
    .update({
      attempt_status: 'SUPERSEDED',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', validOrgId)
    .eq('event_id', validEventId)
    .eq('session_photo_id', input.sessionPhotoId)
    .eq('asset_type', input.assetType)
    .eq('attempt_status', 'ISSUED');

  if (parsedRawIndex !== null) {
    supersedeQuery = supersedeQuery.eq('raw_index', parsedRawIndex);
  }

  const { error: supersedeErr } = await supersedeQuery;
  if (supersedeErr) {
    throw {
      error: `Gagal memperbarui status attempt sebelumnya: ${supersedeErr.message}`,
      code: 'SUPERSEDE_FAILED',
      status: 500,
    };
  }

  // 10. Insert new attempt in gallery_upload_attempts
  const expiresInSeconds = 900; // 15 minutes lease
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const bucketName =
    (storage as any)?.bucket ||
    (storage as any)?.bucketName ||
    process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();

  if (!bucketName) {
    throw {
      error: 'Konfigurasi Cloudflare R2 tidak lengkap: CLOUDFLARE_R2_BUCKET_NAME belum diset. Fallback otomatis ke staging dilarang.',
      code: 'R2_CONFIG_MISSING',
      status: 500,
    };
  }

  const { data: attemptData, error: attemptErr } = await client
    .from('gallery_upload_attempts')
    .insert({
      organization_id: validOrgId,
      event_id: validEventId,
      photo_id: parentPhotoId,
      session_photo_id: input.sessionPhotoId,
      asset_type: input.assetType,
      raw_index: parsedRawIndex,
      storage_provider: 'r2',
      bucket_name: bucketName,
      object_key: objectKey,
      expected_size_bytes: input.expectedSizeBytes || null,
      mime_type: input.contentType,
      attempt_status: 'ISSUED',
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (attemptErr || !attemptData) {
    if (
      attemptErr?.code === '23505' ||
      attemptErr?.message?.includes('uidx_active_asset_attempt')
    ) {
      throw {
        error: `Terdapat proses inisiasi upload aktif yang sedang berjalan untuk sesi "${input.sessionPhotoId}". Silakan ulangi dalam beberapa saat.`,
        code: 'ACTIVE_UPLOAD_IN_PROGRESS',
        status: 409,
      };
    }

    throw {
      error: `Gagal membuat attempt upload: ${attemptErr?.message || 'Database error'}`,
      code: 'ATTEMPT_CREATION_FAILED',
      status: 500,
    };
  }

  // 11. Generate short-lived R2 Presigned PUT URL
  const presigned = await storage.createPresignedPutUrl(objectKey, {
    expiresIn: expiresInSeconds,
    contentType: input.contentType,
  });

  return {
    success: true,
    uploadAttemptId: attemptData.id,
    sessionPhotoId: input.sessionPhotoId,
    assetType: input.assetType,
    rawIndex: parsedRawIndex,
    objectKey,
    uploadUrl: presigned.url,
    expiresIn: expiresInSeconds,
    expiresAt,
    storageProvider: 'r2',
  };
}

/**
 * Service to confirm an uploaded gallery asset attempt
 */
export async function confirmGalleryUpload(
  auth: VerifiedAuthResult,
  input: ConfirmUploadInput,
  deps: {
    client?: SupabaseClient;
    storage?: StorageAdapter;
  } = {}
): Promise<ConfirmUploadResult> {
  const client = deps.client || getServiceSupabase();
  const storage = deps.storage || getR2Storage();

  if (!auth.success || !auth.orgId) {
    throw { error: 'Autentikasi Bearer wajib.', code: 'AUTH_REQUIRED', status: 401 };
  }

  if (!input.uploadAttemptId || !input.sessionPhotoId || !input.eventId) {
    throw {
      error: 'Missing required fields (uploadAttemptId, sessionPhotoId, eventId).',
      code: 'MISSING_FIELDS',
      status: 400,
    };
  }

  // 1. Resolve event to ensure caller authorization
  const eventRes = await resolveVerifiedEvent(client, input.eventId, auth.orgId, auth.isSuperAdmin);
  if (!eventRes) {
    throw {
      error: 'Event tidak ditemukan atau tidak tersedia.',
      code: 'EVENT_NOT_FOUND',
      status: 404,
    };
  }
  const validEventId = eventRes.validEventId;
  const validOrgId = eventRes.organizationId;

  // 2. Fetch upload attempt
  const { data: attempt, error: attemptErr } = await client
    .from('gallery_upload_attempts')
    .select('*')
    .eq('id', input.uploadAttemptId)
    .limit(1)
    .maybeSingle();

  if (attemptErr) {
    throw {
      error: `Gagal membaca upload attempt: ${attemptErr.message}`,
      code: 'DB_ERROR',
      status: 500,
    };
  }

  if (!attempt) {
    throw {
      error: 'Upload attempt tidak ditemukan.',
      code: 'ATTEMPT_NOT_FOUND',
      status: 404,
    };
  }

  // Tenant scoping check
  if (!auth.isSuperAdmin && attempt.organization_id !== auth.orgId) {
    throw {
      error: 'Akses ditolak: Attempt ini bukan milik organisasi Anda.',
      code: 'ORG_ACCESS_DENIED',
      status: 403,
    };
  }

  if (
    attempt.organization_id !== validOrgId ||
    attempt.event_id !== validEventId ||
    attempt.session_photo_id !== input.sessionPhotoId
  ) {
    throw {
      error: 'Parameter attempt tidak cocok dengan eventId atau sessionPhotoId.',
      code: 'ATTEMPT_MISMATCH',
      status: 400,
    };
  }

  // 3. Handle attempt status
  if (attempt.attempt_status === 'CONFIRMED') {
    if (attempt.asset_type !== 'raw') {
      return {
        success: true,
        idempotent: true,
        uploadStatus: 'READY',
        sessionPhotoId: attempt.session_photo_id,
        assetType: attempt.asset_type,
        objectKey: attempt.object_key,
        confirmedAt: attempt.confirmed_at || new Date().toISOString(),
      };
    }
    // For RAW: do not return early; continue to HEAD and RPC append_photo_raw_file
    // which verifies matching metadata and returns idempotent: true.
  }

  if (attempt.attempt_status === 'SUPERSEDED') {
    throw {
      error: 'Upload attempt telah digantikan oleh attempt baru (SUPERSEDED). Silakan unggah ulang.',
      code: 'ATTEMPT_SUPERSEDED',
      status: 409,
    };
  }

  const now = new Date();
  const expiresAt = new Date(attempt.expires_at);

  if (attempt.attempt_status === 'EXPIRED') {
    throw {
      error: 'Masa berlaku upload attempt telah berakhir (EXPIRED). Silakan inisialisasi ulang.',
      code: 'ATTEMPT_EXPIRED',
      status: 410,
    };
  }

  if (now > expiresAt) {
    // Mark attempt expired
    if (attempt.attempt_status === 'ISSUED') {
      const { data: updatedExpired, error: expiredUpdateErr } = await client
        .from('gallery_upload_attempts')
        .update({ attempt_status: 'EXPIRED', updated_at: now.toISOString() })
        .eq('id', attempt.id)
        .select('id');

      if (expiredUpdateErr) {
        throw {
          error: `Gagal memperbarui status attempt kadaluarsa: ${expiredUpdateErr.message}`,
          code: 'DB_ERROR',
          status: 500,
        };
      }

      if (!updatedExpired || updatedExpired.length === 0) {
        throw {
          error: 'Gagal menandai attempt sebagai kadaluarsa: row tidak ditemukan atau tidak berubah.',
          code: 'EXPIRED_UPDATE_FAILED',
          status: 500,
        };
      }
    }
    throw {
      error: 'Masa berlaku upload attempt telah berakhir (EXPIRED). Silakan inisialisasi ulang.',
      code: 'ATTEMPT_EXPIRED',
      status: 410,
    };
  }

  if (attempt.attempt_status !== 'ISSUED' && attempt.attempt_status !== 'CONFIRMED') {
    throw {
      error: `Status attempt tidak valid untuk konfirmasi: ${attempt.attempt_status}`,
      code: 'ATTEMPT_INVALID_STATUS',
      status: 400,
    };
  }

  // 4. Verify object existence and size in Cloudflare R2
  const headResult = await storage.headObject(attempt.object_key);
  if (!headResult.exists) {
    throw {
      error: 'File binary belum ditemukan di R2 storage. Pastikan presigned PUT selesai sebelum konfirmasi.',
      code: 'OBJECT_NOT_FOUND_IN_STORAGE',
      status: 422,
    };
  }

  const actualSizeBytes = headResult.contentLength;
  if (typeof actualSizeBytes !== 'number' || actualSizeBytes <= 0) {
    throw {
      error: 'Ukuran file di R2 tidak valid atau kosong (0 byte).',
      code: 'EMPTY_STORAGE_OBJECT',
      status: 422,
    };
  }

  const maxAllowedBytes = MAX_SIZE_LIMITS[attempt.asset_type as GalleryAssetType];
  if (maxAllowedBytes && actualSizeBytes > maxAllowedBytes) {
    throw {
      error: `Ukuran file aktual (${actualSizeBytes} bytes) melebihi batas maksimum untuk tipe "${attempt.asset_type}" (${maxAllowedBytes} bytes).`,
      code: 'FILE_SIZE_EXCEEDED',
      status: 413,
    };
  }

  if (attempt.expected_size_bytes !== null && attempt.expected_size_bytes !== undefined) {
    if (actualSizeBytes !== Number(attempt.expected_size_bytes)) {
      throw {
        error: `Ukuran file aktual (${actualSizeBytes} bytes) tidak sesuai dengan ukuran yang diharapkan (${attempt.expected_size_bytes} bytes).`,
        code: 'SIZE_MISMATCH',
        status: 422,
      };
    }
  }

  const confirmedAt = now.toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://minglebooth.id';
  const qrUrl = `${baseUrl}/p/${attempt.session_photo_id}`;
  const retentionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 5. Update Photo / GIF / RAW metadata in Supabase
  if (attempt.asset_type === 'raw') {
    // Task 2 & Task 5: RAW confirmation MUST use append_photo_raw_file RPC exclusively
    if (!attempt.photo_id) {
      throw {
        error: 'Integritas data terlanggar: Attempt RAW tidak memiliki photo_id (parent photo).',
        code: 'MISSING_PARENT_PHOTO',
        status: 400,
      };
    }

    // Authoritative lookup of parent photo by tenant, event, and session_photo_id
    const { data: matchingParentPhotos, error: parentLookupErr } = await client
      .from('photos')
      .select('id, organization_id, event_id, session_photo_id')
      .eq('organization_id', attempt.organization_id)
      .eq('event_id', attempt.event_id)
      .eq('session_photo_id', attempt.session_photo_id)
      .eq('is_cloud_deleted', false);

    if (parentLookupErr) {
      throw {
        error: `Gagal memverifikasi parent photo: ${parentLookupErr.message}`,
        code: 'PARENT_LOOKUP_FAILED',
        status: 500,
      };
    }

    if (!matchingParentPhotos || matchingParentPhotos.length === 0) {
      throw {
        error: `Parent photo untuk session_photo_id "${attempt.session_photo_id}" tidak ditemukan.`,
        code: 'PARENT_PHOTO_NOT_FOUND',
        status: 404,
      };
    }

    if (matchingParentPhotos.length > 1) {
      throw {
        error: `Integritas data terlanggar: Ditemukan ${matchingParentPhotos.length} record parent photo untuk session_photo_id "${attempt.session_photo_id}".`,
        code: 'DATA_INTEGRITY_VIOLATION',
        status: 409,
      };
    }

    const parentPhoto = matchingParentPhotos[0];
    if (parentPhoto.id !== attempt.photo_id) {
      throw {
        error: `Mismatched parent photo: Attempt terikat pada ${attempt.photo_id}, namun session terikat pada ${parentPhoto.id}.`,
        code: 'PHOTO_ID_MISMATCH',
        status: 400,
      };
    }

    // Invoke append_photo_raw_file RPC
    const { data: rpcRes, error: rpcErr } = await client.rpc('append_photo_raw_file', {
      p_organization_id: attempt.organization_id,
      p_event_id: attempt.event_id,
      p_photo_id: attempt.photo_id,
      p_upload_attempt_id: attempt.id,
      p_raw_index: attempt.raw_index,
      p_file_size_bytes: actualSizeBytes,
      p_storage_path: attempt.object_key,
      p_etag: headResult.eTag || null,
    });

    if (rpcErr) {
      throw {
        error: `RPC append_photo_raw_file gagal: ${rpcErr.message}`,
        code: rpcErr.code || 'RAW_RPC_FAILED',
        status: 500,
      };
    }

    const resultObj = typeof rpcRes === 'string' ? JSON.parse(rpcRes) : rpcRes;
    if (!resultObj || resultObj.success !== true) {
      const errCode = resultObj?.code || resultObj?.error || 'RAW_CONFIRMATION_FAILED';
      const errMsg = resultObj?.message || resultObj?.error || 'Gagal menambahkan file RAW';

      if (errCode === 'ATTEMPT_EXPIRED' || resultObj?.attempt_status === 'EXPIRED') {
        throw {
          error: `Masa berlaku upload attempt telah berakhir: ${errMsg}`,
          code: 'ATTEMPT_EXPIRED',
          status: 410,
        };
      }

      throw {
        error: `Konfirmasi RAW ditolak oleh stored procedure: ${errMsg}`,
        code: errCode,
        status: 400,
      };
    }

    // append_photo_raw_file already atomically updated attempt_status to CONFIRMED
    return {
      success: true,
      idempotent: Boolean(resultObj.idempotent),
      uploadStatus: 'READY',
      sessionPhotoId: attempt.session_photo_id,
      assetType: attempt.asset_type,
      objectKey: attempt.object_key,
      confirmedAt: confirmedAt,
    };
  }

  // 5B. Non-RAW assets (photo, thumbnail, gif): Invoke atomic stored procedure confirm_gallery_asset_upload
  const { data: confirmRpcData, error: confirmRpcErr } = await client.rpc(
    'confirm_gallery_asset_upload',
    {
      p_organization_id: attempt.organization_id,
      p_event_id: validEventId,
      p_upload_attempt_id: attempt.id,
      p_session_photo_id: attempt.session_photo_id,
      p_asset_type: attempt.asset_type,
      p_storage_path: attempt.object_key,
      p_file_size_bytes: actualSizeBytes,
      p_etag: headResult.eTag || null,
      p_qr_url: qrUrl,
      p_retention_expires_at: retentionExpiresAt,
    }
  );

  if (confirmRpcErr) {
    const errMsg = confirmRpcErr.message || '';
    if (
      errMsg.includes('Target parent photo not found') ||
      (attempt.asset_type === 'thumbnail' && (errMsg.includes('not found') || confirmRpcErr.code === 'P0002'))
    ) {
      throw {
        error: `Record parent photo untuk thumbnail session_photo_id "${attempt.session_photo_id}" tidak ditemukan.`,
        code: 'PARENT_PHOTO_NOT_FOUND',
        status: 404,
      };
    }
    if (
      errMsg.includes('Target photo record not found') ||
      errMsg.includes('not found') ||
      confirmRpcErr.code === 'P0002'
    ) {
      throw {
        error: `Record photo untuk session_photo_id "${attempt.session_photo_id}" tidak ditemukan saat konfirmasi.`,
        code: 'PHOTO_NOT_FOUND',
        status: 404,
      };
    }
    throw {
      error: `Konfirmasi aset gagal di database: ${errMsg}`,
      code: confirmRpcErr.code || 'DB_ERROR',
      status: 500,
    };
  }

  const resultObj = (
    typeof confirmRpcData === 'string' ? JSON.parse(confirmRpcData) : confirmRpcData
  ) as {
    success?: boolean;
    idempotent?: boolean;
    error?: string;
    code?: string;
    message?: string;
  } | null;

  if (!resultObj || resultObj.success === false) {
    const errCode = resultObj?.code || 'CONFIRMATION_REJECTED';
    const errMsg = resultObj?.message || 'Proses konfirmasi aset ditolak.';
    if (errCode === 'ATTEMPT_EXPIRED') {
      throw {
        error: 'Masa berlaku upload attempt telah berakhir (EXPIRED). Silakan inisialisasi ulang.',
        code: 'ATTEMPT_EXPIRED',
        status: 410,
      };
    }
    throw {
      error: `Konfirmasi aset ditolak: ${errMsg}`,
      code: errCode,
      status: 400,
    };
  }

  return {
    success: true,
    idempotent: Boolean(resultObj.idempotent),
    uploadStatus: 'READY',
    sessionPhotoId: attempt.session_photo_id,
    assetType: attempt.asset_type,
    objectKey: attempt.object_key,
    confirmedAt: confirmedAt,
  };
}
