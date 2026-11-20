import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { initiateGalleryUpload, ServiceError } from '@/lib/gallery/upload-service';

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
 * POST /api/gallery/upload/initiate
 * Initializes a Cloudflare R2 gallery asset upload attempt.
 * Issues a short-lived presigned PUT URL and tracks the attempt in gallery_upload_attempts.
 */
export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse(
      'r2_gallery_upload_initiate',
      'Upload initiate is disabled in Preview deployments to protect production storage.'
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

    // 2. Subscription Verification
    if (!auth.isSuperAdmin) {
      const { data: orgData, error: orgErr } = await client
        .from('organizations')
        .select('id, name, subscription_status, subscription_expires_at')
        .eq('id', auth.orgId)
        .single();

      if (orgErr || !orgData) {
        return NextResponse.json(
          { error: 'Organisasi vendor tidak ditemukan di database.', code: 'ORG_ACCESS_DENIED' },
          { status: 404, headers: corsHeaders }
        );
      }

      const now = new Date();
      const expiresAt = orgData.subscription_expires_at ? new Date(orgData.subscription_expires_at) : new Date(0);
      const hasActiveSub = orgData.subscription_status === 'active' && now < expiresAt;

      if (!hasActiveSub) {
        return NextResponse.json(
          {
            error: orgData.subscription_status === 'expired'
              ? 'Masa aktif langganan telah berakhir. Upload galeri diblokir.'
              : 'Akun Anda belum memiliki langganan aktif. Upload galeri hanya tersedia untuk akun berbayar.',
            code: 'SUBSCRIPTION_REQUIRED',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // 3. Parse and Validate Request Payload
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Format JSON request tidak valid.', code: 'INVALID_JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    const {
      eventId,
      sessionPhotoId,
      photoId, // Legacy alias fallback
      assetType = 'photo',
      rawIndex,
      contentType = 'image/jpeg',
      expectedSizeBytes,
    } = body;

    const resolvedSessionPhotoId = sessionPhotoId || photoId;

    if (!eventId || !resolvedSessionPhotoId) {
      return NextResponse.json(
        {
          error: 'Field wajib tidak lengkap: eventId dan sessionPhotoId harus disertakan.',
          code: 'MISSING_REQUIRED_FIELDS',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Delegate to Authoritative Upload Service
    const result = await initiateGalleryUpload(
      auth,
      {
        eventId,
        sessionPhotoId: resolvedSessionPhotoId,
        assetType,
        rawIndex,
        contentType,
        expectedSizeBytes,
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

    console.error('[Gallery Upload Initiate Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Gagal menginisialisasi upload galeri.', code: 'INTERNAL_ERROR' },
      { status: 500, headers: corsHeaders }
    );
  }
}

