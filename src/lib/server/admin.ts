import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env, serviceRoleKey } from './env';

/**
 * Service-role client. Bypasses RLS: use ONLY for the operations listed in
 * docs/SECURITY_MODEL.md (auth user create/ban/unban/delete, the sign-in lookup, sign-in events,
 * rate limits). Never for job or team writes on behalf of a user.
 */
export function createAdminClient() {
  return createClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
