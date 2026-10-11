import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { getServiceSupabase } from '../apps/web/src/lib/supabase';

async function main() {
  const sb = getServiceSupabase();
  console.log('[Remote Probe] Checking remote Supabase database...');

  // 1. Probe RPC call
  const { data, error } = await sb.rpc('process_payment_entitlement', {
    p_order_id: 'PROBE-CHECK-ORDER',
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_plan_tier: 'pro',
    p_amount_idr: 1099000,
    p_duration_days: 30,
  });

  console.log('[Remote Probe] RPC result:', { data, error });

  // 2. Query PostgREST OpenAPI spec for exposed functions
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch('https://qnayeagrksnkeelthehq.supabase.co/rest/v1/', {
    headers: {
      apikey: key || '',
      Authorization: `Bearer ${key || ''}`,
    },
  });

  const schema = await res.json();
  const paths = Object.keys(schema.paths || {});
  console.log('[Remote Probe] Available PostgREST paths:', paths);
  const rpcPaths = paths.filter((p) => p.startsWith('/rpc/'));
  console.log('[Remote Probe] Available RPC paths:', rpcPaths);

  const hasRpc = rpcPaths.includes('/rpc/process_payment_entitlement');
  console.log('[Remote Probe] process_payment_entitlement deployed on remote database:', hasRpc);
}

main().catch(console.error);
