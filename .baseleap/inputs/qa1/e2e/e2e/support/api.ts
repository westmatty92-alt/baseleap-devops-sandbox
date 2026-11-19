// Black-box API access: one request context per role, using the saved browser session cookie (cookieAuth in the
// contract). Nothing here knows how the server works; it speaks docs/openapi.yaml only.
import { expect, request as pwRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BYPASS_HEADER } from './guard';
import { IDS_FILE, stateFile, type Role } from './session';
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
  return b ? { [BYPASS_HEADER]: b } : {};
};

export const apiAs = (role: Role): Promise<APIRequestContext> =>
  pwRequest.newContext({ baseURL: process.env.BASE_URL, storageState: stateFile(role), extraHTTPHeaders: headers() });

/** No cookies at all: the signed-out caller. */
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

export async function createJob(owner: APIRequestContext, over: Partial<JobInput> & Pick<JobInput, 'assigned_member_id' | 'job_date'>): Promise<Job> {
  const res = await owner.post('/api/jobs', { data: jobBody(over) });
  expect(res.status(), `arrange: owner POST /api/jobs ${await res.text()}`).toBe(201);
  return res.json();
}

export const getJob = async (ctx: APIRequestContext, id: string): Promise<Job> => {
  const res = await ctx.get(`/api/jobs/${id}`);
  expect(res.status(), 'GET /api/jobs/{id}').toBe(200);
  return res.json();
};

export const board = async (ctx: APIRequestContext, date?: string) => {
  const res = await ctx.get(date ? `/api/board?date=${date}` : '/api/board');
  expect(res.status(), 'GET /api/board').toBe(200);
  return res.json() as Promise<{ date: string; today: string; is_today: boolean; viewer: { member_id: string; role: string }; job_count: number; truncated: boolean; jobs: Job[] }>;
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
