import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { confirmGalleryUpload, ServiceError } from '@/lib/gallery/upload-service';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

/**
 * POST /api/gallery/upload/confirm
 * Verifies that the binary object was successfully written to Cloudflare R2 via HEAD request,
 * then atomically confirms the attempt and updates public.photos metadata to READY.
 */
export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse(
      'r2_gallery_upload_confirm',
      'Upload confirm is disabled in Preview deployments to protect production storage.'
    );
  }

  try {
    // 1. Mandatory Cryptographic Authentication
    const auth = await verifyServerAuth(req);
    if (!auth.success || !auth.orgId) {
      return NextResponse.json(
        { error: auth.error || 'Autentikasi Bearer wajib.', code: auth.code || 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }

    if (auth.payload?.isDemo) {
      return NextResponse.json(
        {
          error: 'Mode Demo tidak memiliki akses upload galeri. Silakan aktifkan langganan berbayar.',
          code: 'DEMO_MODE_BLOCKED',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    if (!client) {
      return NextResponse.json(
        { error: 'Koneksi database tidak tersedia.', code: 'DB_UNAVAILABLE' },
        { status: 503, headers: corsHeaders }
      );
    }

    // 2. Parse and Validate Request Payload
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Format JSON request tidak valid.', code: 'INVALID_JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    const {
      uploadAttemptId,
      sessionPhotoId,
      photoId, // Legacy alias fallback
      eventId,
    } = body;

    const resolvedSessionPhotoId = sessionPhotoId || photoId;

    if (!uploadAttemptId || !resolvedSessionPhotoId || !eventId) {
      return NextResponse.json(
        {
          error: 'Field wajib tidak lengkap: uploadAttemptId, sessionPhotoId, dan eventId harus disertakan.',
          code: 'MISSING_REQUIRED_FIELDS',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Delegate to Authoritative Confirmation Service
    const result = await confirmGalleryUpload(
      auth,
      {
        uploadAttemptId,
        sessionPhotoId: resolvedSessionPhotoId,
        eventId,
      },
      { client }
    );

    return NextResponse.json(result, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    if (err && typeof err === 'object' && err.code && err.status) {
      const serviceErr = err as ServiceError;
      return NextResponse.json(
        { error: serviceErr.error, code: serviceErr.code },
        { status: serviceErr.status, headers: corsHeaders }
      );
    }

    console.error('[Gallery Upload Confirm Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Gagal mengonfirmasi upload galeri.', code: 'INTERNAL_ERROR' },
      { status: 500, headers: corsHeaders }
    );
  }
}

