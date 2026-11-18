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

    return NextResponse.json({
      connected: true,
      status: 'ONLINE',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
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
