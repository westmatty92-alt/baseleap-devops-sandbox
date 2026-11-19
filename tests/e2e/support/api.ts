// Black-box API access: one request context per role, using the access token the setup project obtained
// (bearerAuth in docs/openapi.yaml; the app also accepts the session cookie, which needs the sign-in screens).
// Nothing here knows how the server works; it speaks docs/openapi.yaml only.
import { expect, request as pwRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BYPASS_HEADER, isLocalRun } from './guard';
import { IDS_FILE, accessTokenFor, type Role } from './session';
import { jobBody, type JobInput } from './data';

export type Ids = {
  owner: { id: string; name: string; email: string };
  techA: { id: string; name: string; email: string };
  techB: { id: string; name: string; email: string };
  orgId: string;
  today: string;
};
export const loadIds = (): Ids => JSON.parse(readFileSync(IDS_FILE, 'utf8'));

const headers = (): Record<string, string> => {
  const b = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return b && !isLocalRun(process.env) ? { [BYPASS_HEADER]: b } : {};
};

export const apiAs = (role: Role): Promise<APIRequestContext> =>
  pwRequest.newContext({ baseURL: process.env.BASE_URL, extraHTTPHeaders: { ...headers(), authorization: `Bearer ${accessTokenFor(role)}` } });

/** No credentials at all: the signed-out caller. */
export const apiAnon = (): Promise<APIRequestContext> =>
  pwRequest.newContext({ baseURL: process.env.BASE_URL, extraHTTPHeaders: headers() });

export type Job = {
  id: string; job_date: string; start_time: string; title: string; address: string;
  customer_name: string | null; customer_phone: string | null; notes: string | null;
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled'; version: number;
  assigned_technician: { id: string; name: string; is_active: boolean }; is_mine: boolean;
  permissions: { change_status: boolean; edit_notes: boolean; edit_all: boolean; cancel: boolean };
  created_at: string; updated_at: string;
};

// GET /api/jobs/{job_id} is in the contract but not built yet. Until it is, a job is read back from its day's board
// (the same data, the same role filter), so the tests that need "read the job again" still run. The date comes from the
// job the suite created. Switch `getJob` to the endpoint when it exists; the fixme'd GET tests cover the endpoint itself.
const dateOf = new Map<string, string>();

export async function createJob(owner: APIRequestContext, over: Partial<JobInput> & Pick<JobInput, 'assigned_member_id' | 'job_date'>): Promise<Job> {
  const res = await owner.post('/api/jobs', { data: jobBody(over) });
  expect(res.status(), `arrange: owner POST /api/jobs ${await res.text()}`).toBe(201);
  const job: Job = await res.json();
  dateOf.set(job.id, job.job_date);
  return job;
}

export const board = async (ctx: APIRequestContext, date?: string) => {
  const res = await ctx.get(date ? `/api/board?date=${date}` : '/api/board');
  expect(res.status(), 'GET /api/board').toBe(200);
  return res.json() as Promise<{ date: string; today: string; is_today: boolean; viewer: { member_id: string; role: string }; job_count: number; truncated: boolean; jobs: Job[] }>;
};

export const getJob = async (ctx: APIRequestContext, id: string, date?: string): Promise<Job> => {
  const day = date ?? dateOf.get(id);
  if (!day) throw new Error('e2e: getJob needs the job date (the job was not created by this run)');
  const found = (await board(ctx, day)).jobs.find((j) => j.id === id);
  expect(found, `job ${id} on the ${day} board`).toBeTruthy();
  return found!;
};

/** application/problem+json with the contract's machine code. */
export async function expectProblem(res: APIResponse, status: number, code?: string) {
  expect(res.status(), `status (body: ${(await res.text()).slice(0, 200)})`).toBe(status);
  expect(res.headers()['content-type'] ?? '').toContain('application/problem+json');
  const body = await res.json();
  if (code) expect(body.code).toBe(code);
  expect(JSON.stringify(body)).not.toMatch(/select |insert into|\bat \S+\.(ts|js):\d+|stack/i); // no SQL or stack in errors
  return body;
}

export async function addTechnician(owner: APIRequestContext, name: string, email: string) {
  const res = await owner.post('/api/team', { data: { name, email } });
  expect([200, 201], `arrange: POST /api/team ${await res.text()}`).toContain(res.status());
  return (await res.json()).member as { id: string; name: string; email: string; role: string; is_active: boolean };
}

export const removeMember = (owner: APIRequestContext, id: string) => owner.post(`/api/team/${id}/remove`);
