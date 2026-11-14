import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { env } from './env';
import { unauthenticated } from './http';
import { annotateActor } from './log';

export type Role = 'owner' | 'technician';

export type Member = {
  id: string;
  name: string;
  role: Role;
  org: { id: string; name: string; time_zone: string; today: string };
};

export type Caller = {
  /** User-scoped client: the caller's JWT, anon key, so RLS and the guard triggers apply. */
  db: SupabaseClient<Database>;
  member: Member;
};

/** Today's calendar date in the org's time zone (decision 0006); the client's clock never decides it. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * The contract's bearerAuth (Supabase access token) or, for the app's own pages, the session cookie.
 * Returns the caller's user-scoped client and active team member, else 401. Not a role check:
 * call `requireOwner` or check `member.role` against the permission matrix next.
 */
export async function requireMember(req: NextRequest): Promise<Caller> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon } = env();
  const authorization = req.headers.get('authorization');
  let db: SupabaseClient<Database>;
  let userId: string | undefined;

  if (authorization !== null) {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
    if (!token) throw unauthenticated();
    db = createClient<Database>(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await db.auth.getUser(token); // validated by Supabase Auth, not just decoded
    if (error || !data.user) throw unauthenticated();
    userId = data.user.id;
  } else {
    db = createServerClient<Database>(url, anon, {
      cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} }, // refresh happens in the proxy
    });
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) throw unauthenticated();
    userId = data.user.id;
  }

  // RLS shows an active member their own org's rows; a removed member's helpers resolve to null → no row → 401.
  const { data: row, error } = await db
    .from('team_members')
    .select('id, name, role, organizations(id, name, time_zone)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error('member lookup failed');
  const org = row?.organizations;
  if (!row || !org) throw unauthenticated();

  const member: Member = {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    org: { id: org.id, name: org.name, time_zone: org.time_zone, today: todayIn(org.time_zone) },
  };
  annotateActor(req, { org_id: org.id, member_id: member.id });
  return { db, member };
}
