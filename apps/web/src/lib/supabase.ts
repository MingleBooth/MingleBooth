import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnayeagrksnkeelthehq.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuYXllYWdya3Nua2VlbHRoZWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTExMjEsImV4cCI6MjEwMzc2NzEyMX0.Rg9oi2jy63FZjxZkIt9aeXt-0AsfR96gYzxzQBT66SM';
const defaultServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuYXllYWdya3Nua2VlbHRoZWhxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODE5MTEyMSwiZXhwIjoyMTAzNzY3MTIxfQ.2l14tmcg9o8IdxKE-d6R6OXCarMuFdV7wHzcR6u2sWE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getServiceSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || defaultServiceKey;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
