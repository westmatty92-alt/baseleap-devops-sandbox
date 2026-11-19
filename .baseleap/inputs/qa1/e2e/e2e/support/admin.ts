// The e2e sign-in helper (decision 0004) and read-only audit/event assertions. Uses the service-role key, which
// SECURITY_MODEL invariant 2 allows in `tests/e2e/**` only. It never prints the key, a token or an email address.
//
// Sign-in without reading email: auth.admin.generateLink({ type: 'magiclink' }) returns a one-time token and sends no
// email. The browser then opens /auth/confirm like a person tapping the link. The helper refuses any email that does
// not belong to an `is_test` org, so it cannot be turned on the client's real team.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertSafeSupabase } from './guard';

let cached: SupabaseClient | undefined;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const url = assertSafeSupabase(process.env);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('e2e: SUPABASE_SERVICE_ROLE_KEY is not set (CI e2e environment only)');
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return cached;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Throws unless the email is a member of an organisation with is_test = true. */
export async function assertTestEmail(email: string): Promise<void> {
  const { data, error } = await admin()
    .from('team_members')
    .select('id, organizations!inner(is_test)')
    .eq('email', normaliseEmail(email))
    .limit(1);
  if (error) throw new Error(`e2e: member lookup failed: ${error.message}`);
  const row = data?.[0] as { organizations?: { is_test?: boolean } | { is_test?: boolean }[] } | undefined;
  const org = Array.isArray(row?.organizations) ? row?.organizations[0] : row?.organizations;
  if (!org?.is_test) throw new Error('e2e: refusing to generate a sign-in link for an email outside an is_test org');
}

/** One-time confirm token for a test member. No email is sent. Returns the path the emailed link would open. */
export async function confirmPathFor(email: string): Promise<string> {
  await assertTestEmail(email);
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email: normaliseEmail(email) });
  if (error || !data?.properties?.hashed_token) throw new Error(`e2e: generateLink failed: ${error?.message ?? 'no token'}`);
  return `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`;
}

/**
 * A second organisation (is_test) with its own owner, technician and one job, created straight in the staging
 * database. It is the "other tenant" for cross-org probes (SECURITY_MODEL invariant 8). Rows stay (NG-6); only the
 * auth users are removed by `dropForeignTenant`.
 */
export type ForeignTenant = { orgId: string; ownerMemberId: string; techMemberId: string; techEmail: string; jobId: string; userIds: string[] };

export async function makeForeignTenant(tag: string): Promise<ForeignTenant> {
  const a = admin();
  const org = await a.from('organizations').insert({ name: `E2E foreign ${tag}`, is_test: true }).select('id').single();
  if (org.error || !org.data) throw new Error(`e2e: foreign org failed: ${org.error?.message}`);
  const userIds: string[] = [];
  const member = async (role: 'owner' | 'technician', label: string) => {
    const email = `e2e.foreign.${label}.${tag}@example.test`;
    const u = await a.auth.admin.createUser({ email, email_confirm: true });
    if (u.error || !u.data.user) throw new Error(`e2e: foreign user failed: ${u.error?.message}`);
    userIds.push(u.data.user.id);
    const m = await a.from('team_members').insert({ org_id: org.data.id, user_id: u.data.user.id, name: `Foreign ${label}`, email, role }).select('id').single();
    if (m.error || !m.data) throw new Error(`e2e: foreign member failed: ${m.error?.message}`);
    if (role === 'technician') techEmail = email;
    return m.data.id as string;
  };
  let techEmail = '';
  const ownerMemberId = await member('owner', 'owner');
  const techMemberId = await member('technician', 'tech');
  const job = await a
    .from('jobs')
    .insert({
      org_id: org.data.id, client_request_id: crypto.randomUUID(), title: `E2E foreign job ${tag}`, address: '1 Foreign St',
      job_date: '2026-11-12', start_time: '09:00', assigned_member_id: techMemberId, created_by: ownerMemberId, updated_by: ownerMemberId,
    })
    .select('id')
    .single();
  if (job.error || !job.data) throw new Error(`e2e: foreign job failed: ${job.error?.message}`);
  return { orgId: org.data.id, ownerMemberId, techMemberId, techEmail, jobId: job.data.id, userIds };
}

export async function dropForeignTenant(t: ForeignTenant): Promise<void> {
  for (const id of t.userIds) await admin().auth.admin.deleteUser(id);
}

/** Reads one job straight from the database so a probe can prove nothing changed, whatever the API said. */
export async function jobRow(jobId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin().from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(`e2e: job read failed: ${error.message}`);
  return data;
}

export async function orgIsTest(orgId: string): Promise<boolean | null> {
  const { data, error } = await admin().from('organizations').select('is_test').eq('id', orgId).maybeSingle();
  if (error) throw new Error(`e2e: org read failed: ${error.message}`);
  return data ? Boolean(data.is_test) : null;
}

export type AuditRow = {
  id: string;
  actor_member_id: string | null;
  entity: 'job' | 'team_member';
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

/** audit_log rows for one entity, oldest first (FR-18: AC-002.8, AC-003.12, AC-007.11, AC-008.8). Read-only. */
export async function auditFor(entityId: string): Promise<AuditRow[]> {
  const { data, error } = await admin().from('audit_log').select('*').eq('entity_id', entityId).order('created_at', { ascending: true });
  if (error) throw new Error(`e2e: audit read failed: ${error.message}`);
  return (data ?? []) as AuditRow[];
}

export type EventRow = { name: string; source: string; is_test: boolean; member_id: string | null; properties: Record<string, unknown>; occurred_at: string };

/** events rows for a member (metrics-spec QA checklist). Read-only. */
export async function eventsFor(memberId: string, name?: string, since?: string): Promise<EventRow[]> {
  let q = admin().from('events').select('name, source, is_test, member_id, properties, occurred_at').eq('member_id', memberId);
  if (name) q = q.eq('name', name);
  if (since) q = q.gte('occurred_at', since);
  const { data, error } = await q.order('occurred_at', { ascending: true });
  if (error) throw new Error(`e2e: events read failed: ${error.message}`);
  return (data ?? []) as EventRow[];
}

/** Sign-in-requested events carry no member for unlisted emails, so they are read by time window in the e2e org only. */
export async function signinRequestsSince(since: string): Promise<EventRow[]> {
  const { data, error } = await admin()
    .from('events')
    .select('name, source, is_test, member_id, properties, occurred_at')
    .eq('name', 'signin_link_requested')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true });
  if (error) throw new Error(`e2e: events read failed: ${error.message}`);
  return (data ?? []) as EventRow[];
}
