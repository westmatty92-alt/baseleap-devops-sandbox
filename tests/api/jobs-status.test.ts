// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUT } from '@/app/api/jobs/[job_id]/status/route';
import { SetJobStatusResponse } from '@/lib/api/generated/jobs/jobs.zod';
import { adminClient, arrangeJob, authed, cleanupTenant, request, status, testTenant, type Tenant } from '../helpers/auth';

let t: Tenant;
beforeAll(async () => {
  t = await testTenant();
});
afterAll(async () => {
  await cleanupTenant(t);
});

const put = (jobId: string, body: unknown, user?: { accessToken: string }, rawBody?: string) => {
  const req = request('PUT', status(jobId), { body, rawBody });
  return PUT(user ? authed(req, user) : req, { params: Promise.resolve({ job_id: jobId }) });
};

const events = async (jobId: string) => {
  const { data } = await adminClient().from('audit_log').select('action').eq('entity_id', jobId).eq('action', 'job.status_changed');
  return data ?? [];
};

describe('PUT /api/jobs/{job_id}/status (setJobStatus)', () => {
  it('AC-007.1 the assigned technician moves their job; 200 in the contract shape, version +1', async () => {
    const job = await arrangeJob(t);
    const res = await put(job.id, { version: job.version, status: 'in_progress' }, t.techA);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = SetJobStatusResponse.parse(await res.json());
    expect(body.status).toBe('in_progress');
    expect(body.version).toBe(job.version + 1);
    expect(body.is_mine).toBe(true);
    expect(await events(job.id)).toHaveLength(1);
  });

  it('AC-007.6 any of scheduled / in_progress / done can follow any other', async () => {
    const job = await arrangeJob(t);
    let version = job.version;
    for (const next of ['done', 'scheduled', 'in_progress', 'scheduled'] as const) {
      const body = SetJobStatusResponse.parse(await (await put(job.id, { version, status: next }, t.techA)).json());
      expect(body.status).toBe(next);
      version = body.version;
    }
  });

  it('the owner may set any status, including cancelled and restoring from cancelled', async () => {
    const job = await arrangeJob(t);
    const cancelled = SetJobStatusResponse.parse(await (await put(job.id, { version: job.version, status: 'cancelled' }, t.owner)).json());
    expect(cancelled.status).toBe('cancelled');
    const restored = await put(job.id, { version: cancelled.version, status: 'in_progress' }, t.owner);
    expect(restored.status).toBe(200);
    expect(SetJobStatusResponse.parse(await restored.json()).status).toBe('in_progress');
  });

  it('AC-007.9 the same status again is a 200 no-op whatever the version; one change recorded', async () => {
    const job = await arrangeJob(t);
    const first = SetJobStatusResponse.parse(await (await put(job.id, { version: job.version, status: 'done' }, t.techA)).json());
    const again = await put(job.id, { version: job.version, status: 'done' }, t.techA); // stale version, same status
    expect(again.status).toBe(200);
    const body = SetJobStatusResponse.parse(await again.json());
    expect(body.version).toBe(first.version);
    expect(await events(job.id)).toHaveLength(1);
  });

  it('AC-007.8 a stale version → 409 stale_version with the latest job in `current`', async () => {
    const job = await arrangeJob(t);
    await put(job.id, { version: job.version, status: 'in_progress' }, t.techA);
    const res = await put(job.id, { version: job.version, status: 'done' }, t.owner);
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const problem = await res.json();
    expect(problem.code).toBe('stale_version');
    const current = SetJobStatusResponse.parse(problem.current);
    expect(current.status).toBe('in_progress');
    expect(current.version).toBe(job.version + 1);
    const { data } = await adminClient().from('jobs').select('status').eq('id', job.id).single();
    expect(data?.status).toBe('in_progress'); // nothing saved
  });

  it('no session → 401', async () => {
    const job = await arrangeJob(t);
    const res = await put(job.id, { version: 1, status: 'done' });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  it('AC-007.4 a technician changing another technician’s job → 403 not_allowed; unchanged', async () => {
    const job = await arrangeJob(t, { assigned_member_id: t.techB.memberId });
    for (const version of [job.version, job.version + 7]) {
      const res = await put(job.id, { version, status: 'done' }, t.techA);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('not_allowed');
    }
    // even asking for the status it already has is not a free pass on someone else's job
    expect((await put(job.id, { version: job.version, status: 'scheduled' }, t.techA)).status).toBe(403);
    const { data } = await adminClient().from('jobs').select('status, version').eq('id', job.id).single();
    expect(data).toEqual({ status: 'scheduled', version: job.version });
  });

  it('a technician cannot set cancelled, nor touch a cancelled job → 403', async () => {
    const job = await arrangeJob(t);
    expect((await put(job.id, { version: job.version, status: 'cancelled' }, t.techA)).status).toBe(403);
    const dead = await arrangeJob(t);
    await adminClient().from('jobs').update({ status: 'cancelled' }).eq('id', dead.id);
    const res = await put(dead.id, { version: dead.version + 1, status: 'in_progress' }, t.techA);
    expect(res.status).toBe(403);
    expect((await put(dead.id, { version: dead.version + 1, status: 'cancelled' }, t.techA)).status).toBe(403);
  });

  it('cross-tenant: another org’s job id → 404 for owner and technician alike; unchanged', async () => {
    const job = await arrangeJob(t);
    for (const user of [t.other.owner, t.other.tech]) {
      const res = await put(job.id, { version: job.version, status: 'done' }, user);
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('not_found');
    }
    const { data } = await adminClient().from('jobs').select('status').eq('id', job.id).single();
    expect(data?.status).toBe('scheduled');
  });

  it('an unknown job id, or one that is not a uuid → 404', async () => {
    expect((await put(crypto.randomUUID(), { version: 1, status: 'done' }, t.owner)).status).toBe(404);
    expect((await put('not-a-uuid', { version: 1, status: 'done' }, t.owner)).status).toBe(404);
  });

  it('an unknown body field → 422 and nothing changes', async () => {
    const job = await arrangeJob(t);
    for (const extra of [{ title: 'hacked' }, { notes: 'x' }, { estimated_minutes: 30 }]) {
      const res = await put(job.id, { version: job.version, status: 'done', ...extra }, t.techA);
      expect(res.status).toBe(422);
      const problem = await res.json();
      expect(problem.code).toBe('validation_failed');
      expect(problem.errors.map((e: { field: string }) => e.field)).toContain(Object.keys(extra)[0]);
    }
    const { data } = await adminClient().from('jobs').select('status, title').eq('id', job.id).single();
    expect(data?.status).toBe('scheduled');
  });

  it('missing or invalid version/status → 422 naming the field', async () => {
    const job = await arrangeJob(t);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ status: 'done' }, 'version'],
      [{ version: 0, status: 'done' }, 'version'],
      [{ version: 'one', status: 'done' }, 'version'],
      [{ version: 1 }, 'status'],
      [{ version: 1, status: 'finished' }, 'status'],
    ];
    for (const [body, field] of cases) {
      const res = await put(job.id, body, t.owner);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect((await res.json()).errors.map((e: { field: string }) => e.field)).toContain(field);
    }
  });

  it('malformed JSON → 400', async () => {
    const job = await arrangeJob(t);
    const res = await put(job.id, undefined, t.owner, '{nope');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });
});
