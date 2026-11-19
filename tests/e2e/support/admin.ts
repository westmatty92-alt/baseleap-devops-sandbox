// The e2e tenant (decision 0004) and read-only audit/event assertions. Uses the service-role key, which SECURITY_MODEL
// invariant 2 allows in `tests/e2e/**` only. It never prints the key, a token, a password or an email address.
//
// Everything this file creates is written to a manifest (tests/e2e/.auth/manifest.json, git-ignored) the moment it exists,
// so the cleanup project removes exactly those rows and users and never anything it did not create.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { assertSafeSupabase } from './guard';

let cached: SupabaseClient | undefined;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const url = assertSafeSupabase(process.env);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('e2e: SUPABASE_SERVICE_ROLE_KEY is not set (CI e2e environment or the local stack only)');
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return cached;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

// ---------------------------------------------------------------------------------------------
// manifest: what this run created
// ---------------------------------------------------------------------------------------------
const AUTH_DIR = 'tests/e2e/.auth';
export const MANIFEST_FILE = `${AUTH_DIR}/manifest.json`;
export type Manifest = { orgIds: string[]; userIds: string[] };

export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_FILE)) return { orgIds: [], userIds: [] };
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as Manifest;
}

/** Appends ids to the manifest right away (not at the end), so a crash mid-setup still leaves a complete list to clean. */
export function track(part: Partial<Manifest>): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  const m = readManifest();
  writeFileSync(MANIFEST_FILE, JSON.stringify({ orgIds: [...m.orgIds, ...(part.orgIds ?? [])], userIds: [...m.userIds, ...(part.userIds ?? [])] }));
}

export function resetManifest(): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(MANIFEST_FILE, JSON.stringify({ orgIds: [], userIds: [] }));
}

// ---------------------------------------------------------------------------------------------
// the e2e org: an owner and two technicians, signed in without email
// ---------------------------------------------------------------------------------------------
export type TenantMember = { id: string; name: string; email: string; userId: string; accessToken: string };
export type E2eTenant = { orgId: string; today?: string; owner: TenantMember; techA: TenantMember; techB: TenantMember };

/**
 * Creates `E2E <tag>` (is_test = true) with an owner, Tech A and Tech B on example.test addresses, then signs each in with a
 * throwaway password against the Supabase Auth API (no email is sent). The password is never written anywhere and the
 * users are deleted by the cleanup project. The browser sign-in route (/auth/confirm) is not built yet; when it is,
 * `confirmPathFor` below is the path for the UI specs.
 */
export async function createE2eTenant(tag: string): Promise<E2eTenant> {
  const a = admin();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('e2e: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  const url = assertSafeSupabase(process.env);

  const org = await a.from('organizations').insert({ name: `E2E ${tag}`, is_test: true }).select('id').single();
  if (org.error || !org.data) throw new Error(`e2e: org create failed: ${org.error?.message}`);
  track({ orgIds: [org.data.id] });

  const make = async (role: 'owner' | 'technician', label: string, display: string): Promise<TenantMember> => {
    const email = `e2e.${label}.${tag}@example.test`;
    const password = `${randomUUID()}Aa1!`;
    const u = await a.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw new Error(`e2e: create user (${label}) failed: ${u.error?.message}`);
    track({ userIds: [u.data.user.id] });
    const name = `${display} ${tag}`.slice(0, 60);
    const m = await a.from('team_members').insert({ org_id: org.data.id, user_id: u.data.user.id, name, email, role }).select('id').single();
    if (m.error || !m.data) throw new Error(`e2e: team member (${label}) failed: ${m.error?.message}`);
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const s = await anon.auth.signInWithPassword({ email, password });
    if (s.error || !s.data.session) throw new Error(`e2e: sign-in (${label}) failed: ${s.error?.message}`);
    return { id: m.data.id as string, name, email, userId: u.data.user.id, accessToken: s.data.session.access_token };
  };

  const owner = await make('owner', 'owner', 'E2E Owner');
  const techA = await make('technician', 'techa', 'E2E Tech A');
  const techB = await make('technician', 'techb', 'E2E Tech B');
  return { orgId: org.data.id, owner, techA, techB };
}

/**
 * Removes what the manifest lists: auth users first, then the organisations (is_test and named `E2E …` only, checked again
 * here). Jobs cannot be deleted through the app (NG-6); whether the service role can is the database's call, so the org delete
 * is best effort and its outcome is returned for the run report. Never touches an id that is not in the manifest.
 */
export type CleanupResult = {
  usersDeleted: number; usersAlreadyGone: number; usersFailed: number; orgsDeleted: number; orgsKept: number;
  /** One line per failure: "user <status> <code>: <message>" or "org <code>: <message>". Ids, emails and keys are never included. */
  problems: string[];
};

// Error text from Supabase can echo an id or an email; keep it short and strip both before it reaches a log.
const safeText = (s: unknown) =>
  String(s ?? '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/[^\s@]+@[^\s@]+/g, '<email>')
    .slice(0, 160);

export async function cleanupManifest(): Promise<CleanupResult> {
  const a = admin();
  const m = readManifest();
  const r: CleanupResult = { usersDeleted: 0, usersAlreadyGone: 0, usersFailed: 0, orgsDeleted: 0, orgsKept: 0, problems: [] };
  // De-duplicated: dropForeignTenant may already have removed some users, and an id can only be deleted once.
  for (const id of new Set(m.userIds)) {
    const d = await a.auth.admin.deleteUser(id);
    if (!d.error) { r.usersDeleted++; continue; }
    const code = (d.error as { code?: string }).code, status = (d.error as { status?: number }).status;
    if (code === 'user_not_found' || status === 404) { r.usersAlreadyGone++; continue; }
    r.usersFailed++;
    r.problems.push(`user ${status ?? '?'} ${code ?? '?'}: ${safeText(d.error.message)}`);
  }
  for (const id of new Set(m.orgIds)) {
    const o = await a.from('organizations').select('id, name, is_test').eq('id', id).maybeSingle();
    if (!o.data) continue; // already gone
    if (!o.data.is_test || !String(o.data.name).startsWith('E2E ')) { r.orgsKept++; r.problems.push('org not is_test or not named E2E: refused to delete'); continue; }
    const d = await a.from('organizations').delete().eq('id', id);
    if (d.error) { r.orgsKept++; r.problems.push(`org ${d.error.code ?? '?'}: ${safeText(d.error.message)}`); } else r.orgsDeleted++;
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// browser sign-in path (for the UI specs, once /auth/confirm exists)
// ---------------------------------------------------------------------------------------------

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
 * A second organisation (is_test) with its own owner, technician and one job, created straight in the database. It is the
 * "other tenant" for cross-org probes (SECURITY_MODEL invariant 8). Everything is tracked in the manifest.
 */
export type ForeignTenant = { orgId: string; ownerMemberId: string; techMemberId: string; techEmail: string; jobId: string; userIds: string[] };

export async function makeForeignTenant(tag: string): Promise<ForeignTenant> {
  const a = admin();
  const org = await a.from('organizations').insert({ name: `E2E foreign ${tag}`, is_test: true }).select('id').single();
  if (org.error || !org.data) throw new Error(`e2e: foreign org failed: ${org.error?.message}`);
  track({ orgIds: [org.data.id] });
  const userIds: string[] = [];
  let techEmail = '';
  const member = async (role: 'owner' | 'technician', label: string) => {
    const email = `e2e.foreign.${label}.${tag}@example.test`;
    const u = await a.auth.admin.createUser({ email, email_confirm: true });
    if (u.error || !u.data.user) throw new Error(`e2e: foreign user failed: ${u.error?.message}`);
    userIds.push(u.data.user.id);
    track({ userIds: [u.data.user.id] });
    const m = await a.from('team_members').insert({ org_id: org.data.id, user_id: u.data.user.id, name: `Foreign ${label}`, email, role }).select('id').single();
    if (m.error || !m.data) throw new Error(`e2e: foreign member failed: ${m.error?.message}`);
    if (role === 'technician') techEmail = email;
    return m.data.id as string;
  };
  const ownerMemberId = await member('owner', 'owner');
  const techMemberId = await member('technician', 'tech');
  const job = await a
    .from('jobs')
    .insert({
      org_id: org.data.id, client_request_id: randomUUID(), title: `E2E foreign job ${tag}`, address: '1 Foreign St',
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
