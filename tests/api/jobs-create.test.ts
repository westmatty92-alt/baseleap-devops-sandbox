// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/jobs/route';
import { CreateJobResponse } from '@/lib/api/generated/jobs/jobs.zod';
import { adminClient, authed, cleanupTenant, deactivate, request, testTenant, type Tenant } from '../helpers/auth';

let t: Tenant;
beforeAll(async () => {
  t = await testTenant();
});
afterAll(async () => {
  await cleanupTenant(t);
});

const valid = (over: Record<string, unknown> = {}) => ({
  client_request_id: crypto.randomUUID(),
  title: 'Leaking kitchen faucet',
  assigned_member_id: t.techA.memberId,
  job_date: '2026-11-12',
  start_time: '15:30',
  address: '45 Main St W, Hamilton',
  customer_name: 'Pat Example',
  customer_phone: '(905) 555-0123',
  notes: 'Key under mat',
  ...over,
});

const post = (body: unknown, user?: { accessToken: string }) => {
  const req = request('POST', '/api/jobs', { body });
  return POST(user ? authed(req, user) : req, undefined);
};

const jobsWithRequestId = async (id: string) => {
  const { data } = await adminClient().from('jobs').select('id').eq('client_request_id', id);
  return data ?? [];
};

describe('POST /api/jobs (createJob)', () => {
  it('AC-003.1 owner creates a Scheduled job; 201 in the contract shape', async () => {
    const res = await post(valid(), t.owner);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const job = CreateJobResponse.parse(await res.json());
    expect(job.status).toBe('scheduled');
    expect(job.version).toBe(1);
    expect(job.start_time).toBe('15:30');
    expect(job.assigned_technician).toEqual({ id: t.techA.memberId, name: t.techA.name, is_active: true });
    expect(job.is_mine).toBe(false);
    expect(job.permissions).toEqual({ change_status: true, edit_notes: true, edit_all: true, cancel: true });
  });

  it('trims text and turns blank optional fields into null', async () => {
    const res = await post(valid({ title: '  Padded  ', address: ' 1 St ', customer_name: '   ', customer_phone: null, notes: '  ' }), t.owner);
    expect(res.status).toBe(201);
    const job = CreateJobResponse.parse(await res.json());
    expect([job.title, job.address, job.customer_name, job.customer_phone, job.notes]).toEqual(['Padded', '1 St', null, null, null]);
  });

  it('AC-003.6 the same client_request_id twice → one job (201 then 200, same id)', async () => {
    const body = valid();
    const a = await post(body, t.owner);
    const b = await post(body, t.owner);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(CreateJobResponse.parse(await b.json()).id).toBe(CreateJobResponse.parse(await a.json()).id);
    expect(await jobsWithRequestId(body.client_request_id)).toHaveLength(1);
  });

  it('AC-003.6 two simultaneous submits → one job', async () => {
    const body = valid();
    const [a, b] = await Promise.all([post(body, t.owner), post(body, t.owner)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await jobsWithRequestId(body.client_request_id)).toHaveLength(1);
  });

  it('AC-003.11 a replay after the technician was removed still returns the saved job', async () => {
    const body = valid({ assigned_member_id: t.techB.memberId });
    expect((await post(body, t.owner)).status).toBe(201);
    await deactivate(t.techB);
    expect((await post(body, t.owner)).status).toBe(200);
  });

  it('AC-003.10 a removed technician → 422 technician_not_assignable on assigned_member_id', async () => {
    await deactivate(t.techB); // idempotent: may already be removed by the replay test
    const res = await post(valid({ assigned_member_id: t.techB.memberId }), t.owner);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('technician_not_assignable');
    expect(body.errors).toEqual([expect.objectContaining({ field: 'assigned_member_id', code: 'technician_not_assignable' })]);
  });

  it('the owner (not a technician) and another org’s technician cannot be assigned → 422', async () => {
    for (const id of [t.owner.memberId, t.other.tech.memberId, crypto.randomUUID()]) {
      const res = await post(valid({ assigned_member_id: id }), t.owner);
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe('technician_not_assignable');
    }
  });

  it('no session → 401', async () => {
    const res = await post(valid());
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  it('AC-003.9 a technician → 403 and nothing is saved', async () => {
    const body = valid();
    const res = await post(body, t.techA);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('not_allowed');
    expect(await jobsWithRequestId(body.client_request_id)).toHaveLength(0);
  });

  it('cross-tenant: a job is created in the caller’s org, and the same request id in another org is a separate job', async () => {
    const id = crypto.randomUUID();
    const mine = CreateJobResponse.parse(await (await post(valid({ client_request_id: id }), t.owner)).json());
    const theirsRes = await post(valid({ client_request_id: id, assigned_member_id: t.other.tech.memberId }), t.other.owner);
    expect(theirsRes.status).toBe(201);
    expect(CreateJobResponse.parse(await theirsRes.json()).id).not.toBe(mine.id);
    const { data } = await adminClient().from('jobs').select('org_id').eq('id', mine.id).single();
    expect(data?.org_id).toBe(t.orgId);
  });

  it('an unknown body field (including an estimated duration) → 422 naming it; nothing saved', async () => {
    for (const extra of [{ estimated_minutes: 45 }, { status: 'done' }, { org_id: t.other.orgId }, { version: 5 }]) {
      const body = valid(extra);
      const res = await post(body, t.owner);
      expect(res.status, JSON.stringify(extra)).toBe(422);
      const problem = await res.json();
      expect(problem.code).toBe('validation_failed');
      expect(problem.errors.map((e: { field: string }) => e.field)).toContain(Object.keys(extra)[0]);
      expect(await jobsWithRequestId(body.client_request_id)).toHaveLength(0);
    }
  });

  it('missing, empty, too long, and badly formatted fields → 422 with the field and code', async () => {
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ title: undefined }, 'title', 'required'],
      [{ title: '' }, 'title', 'required'],
      [{ title: '   ' }, 'title', 'required'],
      [{ title: 'x'.repeat(101) }, 'title', 'too_long'],
      [{ address: '' }, 'address', 'required'],
      [{ customer_phone: 'call me' }, 'customer_phone', 'invalid_format'],
      [{ start_time: '25:00' }, 'start_time', 'invalid_format'],
      [{ job_date: '2026-02-30' }, 'job_date', 'invalid_date'],
      [{ job_date: '2019-12-31' }, 'job_date', 'invalid_date'],
      [{ assigned_member_id: 'nope' }, 'assigned_member_id', 'invalid_format'],
      [{ client_request_id: 'nope' }, 'client_request_id', 'invalid_format'],
    ];
    for (const [over, field, code] of cases) {
      const res = await post(valid(over), t.owner);
      expect(res.status, field + JSON.stringify(over)).toBe(422);
      const errors: Array<{ field: string; code?: string }> = (await res.json()).errors;
      expect(errors.some((e) => e.field === field && e.code === code), JSON.stringify(errors)).toBe(true);
    }
  });

  it('malformed JSON → 400 problem+json', async () => {
    const res = await POST(authed(request('POST', '/api/jobs', { rawBody: '{nope' }), t.owner), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });
});
