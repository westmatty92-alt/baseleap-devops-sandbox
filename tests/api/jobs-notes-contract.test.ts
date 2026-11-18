// @vitest-environment node
// Expand/contract drill, release 2 (jobs.notes column dropped): the API field `notes` is stored in column `details`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/jobs/route';
import { GET as getBoard } from '@/app/api/board/route';
import { adminClient, arrangeJob, authed, cleanupTenant, request, testTenant, type Tenant } from '../helpers/auth';

let t: Tenant;
beforeAll(async () => {
  t = await testTenant();
});
afterAll(async () => {
  await cleanupTenant(t);
});

// database.ts is generated and not backend-owned, so it still lists `notes` and lacks `details`: query loosely.
type Row = { id: string; details: string | null; version: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminClient() as unknown as { from: (t: string) => any };

const read = async (id: string): Promise<Row> => {
  const { data, error } = await db().from('jobs').select('id, details, version').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Row;
};
const update = async (id: string, cols: Record<string, unknown>) => {
  const { error } = await db().from('jobs').update(cols).eq('id', id);
  return error as { message: string } | null;
};
const create = (notes: unknown) =>
  POST(
    authed(
      request('POST', '/api/jobs', {
        body: {
          client_request_id: crypto.randomUUID(),
          title: 'Contract drill',
          assigned_member_id: t.techA.memberId,
          job_date: '2026-11-18',
          start_time: '08:00',
          address: '1 Drill St',
          notes,
        },
      }),
      t.owner,
    ),
    undefined,
  );

describe('jobs.notes column is gone', () => {
  it('selecting or writing the column `notes` fails; `details` works', async () => {
    const sel = await db().from('jobs').select('notes').limit(1);
    expect(sel.error).not.toBeNull();
    const base = await arrangeJob(t);
    expect(await update(base.id, { notes: 'x' })).not.toBeNull();
    expect(await update(base.id, { details: 'x' })).toBeNull();
    expect((await read(base.id)).details).toBe('x');
  });
});

describe('the API field `notes` is stored in column `details`', () => {
  it('POST /api/jobs: response says notes, never details; the row has details', async () => {
    const res = await create('Gate code 1234');
    expect(res.status).toBe(201);
    const job = await res.json();
    expect(job.notes).toBe('Gate code 1234');
    expect('details' in job).toBe(false);
    expect((await read(job.id)).details).toBe('Gate code 1234');
  });

  it('the board shows notes from details', async () => {
    const job = await (await create('Board note')).json();
    const res = await getBoard(authed(request('GET', '/api/board?date=2026-11-18'), t.owner), undefined);
    expect(res.status).toBe(200);
    const board = await res.json();
    expect(board.jobs.find((j: { id: string }) => j.id === job.id).notes).toBe('Board note');
  });
});

describe('one update = one version bump (guard compares details)', () => {
  it('changing details bumps once; the same value does not', async () => {
    const job = await (await create('first')).json();
    expect(job.version).toBe(1);
    expect(await update(job.id, { details: 'second' })).toBeNull();
    expect((await read(job.id)).version).toBe(2);
    expect(await update(job.id, { details: 'second' })).toBeNull();
    expect((await read(job.id)).version).toBe(2);
    expect(await update(job.id, { details: null })).toBeNull();
    expect((await read(job.id)).version).toBe(3);
  });

  it('details keeps the 1–2000 char check', async () => {
    const base = await arrangeJob(t);
    expect(await update(base.id, { details: '' })).not.toBeNull();
    expect(await update(base.id, { details: 'x'.repeat(2001) })).not.toBeNull();
    expect(await update(base.id, { details: 'x'.repeat(2000) })).toBeNull();
  });

  it('a technician (RLS) editing details on their own job bumps once', async () => {
    const base = await arrangeJob(t);
    const before = await read(base.id);
    const { createClient } = await import('@supabase/supabase-js');
    const tech = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { authorization: `Bearer ${t.techA.accessToken}` } },
    });
    const { error } = await tech.from('jobs').update({ details: 'Key under mat' } as never).eq('id', base.id);
    expect(error).toBeNull();
    expect(await read(base.id)).toMatchObject({ details: 'Key under mat', version: before.version + 1 });
  });

  it('the audit record still names the changed field `notes`', async () => {
    const job = await (await create('a')).json();
    expect(await update(job.id, { details: 'b' })).toBeNull();
    const { data } = await db().from('audit_log').select('details').eq('action', 'job.updated').eq('entity_id', job.id);
    expect(data).toHaveLength(1);
    expect(data[0].details).toEqual({ fields_changed: ['notes'] });
  });
});
