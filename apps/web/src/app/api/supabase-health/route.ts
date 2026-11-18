import { NextRequest, NextResponse } from 'next/server';
import { supabase, getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const client = getServiceSupabase();
    // Test selecting from organizations table
    const { data: orgs, error } = await client.from('organizations').select('*').limit(5);

    if (error) {
      return NextResponse.json({
        connected: false,
        error: error.message,
        hint: error.hint,
        details: error.details,
      }, { status: 400 });
    }

    let keyRef = 'unknown';
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const payloadPart = key.split('.')[1];
      if (payloadPart) {
        const parsed = JSON.parse(Buffer.from(payloadPart, 'base64').toString());
        keyRef = parsed.ref;
      }
    } catch {}

    return NextResponse.json({
      connected: true,
      status: 'ONLINE',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyRef,
      organizationsCount: orgs?.length ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      error: err?.message || 'Failed to connect to Supabase',
    }, { status: 500 });
  }
}
