// tests/helpers/auth.ts: test tenants, users and requests for the API tests. Runs against the throwaway
// local Supabase stack (dry runs) or the staging preview branch, never production.
// Env (names only): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_PROD_PROJECT_REF (optional; the guard refuses it).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import type { Database } from '@/types/database';

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);

export function assertNotProduction(url = process.env.NEXT_PUBLIC_SUPABASE_URL, prodRef = process.env.SUPABASE_PROD_PROJECT_REF): string {
  if (!url) throw new Error('tests: NEXT_PUBLIC_SUPABASE_URL is not set (preview branch or local test stack)');
  const host = new URL(url).hostname;
  if (prodRef && url.includes(prodRef)) throw new Error('tests: refusing, the Supabase URL is the production project');
  if (!LOCAL.has(host) && !prodRef) throw new Error('tests: refusing a remote Supabase while SUPABASE_PROD_PROJECT_REF is unset');
  return url;
}

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`tests: ${name} is not set`);
  return v;
};

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** Service-role client: test setup and assertions only (creating orgs and users, reading audit rows). */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(assertNotProduction(), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: noSession });
}

export type TestUser = { userId: string; memberId: string; orgId: string; email: string; name: string; accessToken: string; role: 'owner' | 'technician' };

export type Tenant = {
  runId: string;
  orgId: string;
  owner: TestUser;
  techA: TestUser;
  techB: TestUser;
  /** A different organisation, with its own owner and technician. */
  other: { orgId: string; owner: TestUser; tech: TestUser };
  userIds: string[];
  orgIds: string[];
};

async function makeUser(orgId: string, role: 'owner' | 'technician', label: string, runId: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `test+${label}-${runId}@example.test`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const name = `${label} ${runId}`.slice(0, 60);
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`tests: createUser failed: ${error?.message}`);
  const { data: member, error: memberError } = await admin
    .from('team_members')
    .insert({ org_id: orgId, user_id: created.user.id, name, email, role })
    .select('id')
    .single();
  if (memberError || !member) throw new Error(`tests: team member insert failed: ${memberError?.message}`);
  const anon = createClient<Database>(assertNotProduction(), need('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: noSession });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`tests: sign-in failed: ${signInError?.message}`);
  return { userId: created.user.id, memberId: member.id, orgId, email, name, accessToken: session.session.access_token, role };
}

async function makeOrg(label: string, runId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('organizations')
    .insert({ name: `${label} ${runId}`, is_test: true })
    .select('id')
    .single();
  if (error || !data) throw new Error(`tests: org insert failed: ${error?.message}`);
  return data.id;
}

/** Two test orgs (is_test = true, decision 0004): an owner and two technicians in one, an owner and a technician in the other. */
export async function testTenant(): Promise<Tenant> {
  const runId = crypto.randomUUID().slice(0, 8);
  const orgId = await makeOrg('Org A', runId);
  const otherOrgId = await makeOrg('Org B', runId);
  const [owner, techA, techB, otherOwner, otherTech] = await Promise.all([
    makeUser(orgId, 'owner', 'owner', runId),
    makeUser(orgId, 'technician', 'techA', runId),
    makeUser(orgId, 'technician', 'techB', runId),
    makeUser(otherOrgId, 'owner', 'otherowner', runId),
    makeUser(otherOrgId, 'technician', 'othertech', runId),
  ]);
  const users = [owner, techA, techB, otherOwner, otherTech];
  return {
    runId,
    orgId,
    owner,
    techA,
    techB,
    other: { orgId: otherOrgId, owner: otherOwner, tech: otherTech },
    userIds: users.map((u) => u.userId),
    orgIds: [orgId, otherOrgId],
  };
}

/** Removes a technician from the team the way the team service does (is_active = false), for edge cases. */
export async function deactivate(user: TestUser): Promise<void> {
  const { error } = await adminClient().from('team_members').update({ is_active: false, removed_at: new Date().toISOString() }).eq('id', user.memberId);
  if (error) throw new Error(`tests: deactivate failed: ${error.message}`);
}

/**
 * Deletes the test users. Jobs, team members, audit rows and orgs are never deleted by the app (NG-6),
 * and the database refuses it for `authenticated`; test rows stay in their own `is_test` orgs.
 */
export async function cleanupTenant(t: Tenant): Promise<void> {
  const admin = adminClient();
  for (const id of t.userIds) await admin.auth.admin.deleteUser(id);
}

export function request(method: string, path: string, init: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}): NextRequest {
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  return new NextRequest(new URL(path, 'http://test.local'), {
    method,
    body,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...init.headers },
  });
}

/** Attaches the user's access token as the contract's bearer token. */
export function authed(req: NextRequest, user: Pick<TestUser, 'accessToken'>): NextRequest {
  req.headers.set('authorization', `Bearer ${user.accessToken}`);
  return req;
}

export const status = (jobId: string) => `/api/jobs/${jobId}/status`;

/** Creates a job straight through the service-role client, for arranging test data only. */
export async function arrangeJob(t: Tenant, over: Partial<Database['public']['Tables']['jobs']['Insert']> = {}) {
  const { data, error } = await adminClient()
    .from('jobs')
    .insert({
      org_id: t.orgId,
      client_request_id: crypto.randomUUID(),
      title: `Arranged ${crypto.randomUUID().slice(0, 6)}`,
      address: '1 Test St',
      job_date: '2026-11-12',
      start_time: '09:00',
      assigned_member_id: t.techA.memberId,
      created_by: t.owner.memberId,
      updated_by: t.owner.memberId,
      ...over,
    })
    .select('id, version, status')
    .single();
  if (error || !data) throw new Error(`tests: arrangeJob failed: ${error?.message}`);
  return data;
}
