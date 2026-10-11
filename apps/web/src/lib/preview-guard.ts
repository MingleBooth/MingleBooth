import { NextResponse } from 'next/server';

/**
 * Detects whether the current execution is running in a Vercel Preview
 * or explicit Preview staging environment sharing the production Supabase database.
 */
export function isPreviewDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
    process.env.MINGLEBOOTH_ENV === 'preview' ||
    process.env.IS_PREVIEW === 'true'
  );
}

/**
 * Standard HTTP 403 response for blocked Preview operations.
 */
export function previewBlockedResponse(
  operationName: string,
  customMessage?: string
) {
  return NextResponse.json(
    {
      error: 'PREVIEW_MUTATION_BLOCKED',
      code: 'PREVIEW_MUTATION_BLOCKED',
      operation: operationName,
      message:
        customMessage ||
        `Operasi ${operationName} dinonaktifkan pada Vercel Preview untuk melindungi integritas database produksi bersama.`,
    },
    { status: 403 }
  );
}
