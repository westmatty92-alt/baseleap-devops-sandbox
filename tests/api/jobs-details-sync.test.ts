// @vitest-environment node
// Expand/contract drill, release 1 (jobs.notes -> jobs.details): the two-way sync trigger and the app's use of `details`.
// Release 2 deletes this file together with the trigger and the `notes` column.
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

// database.ts is not regenerated for the expand migration, so it does not know `details`: read and write loosely.
type Row = { id: string; notes: string | null; details: string | null; version: number };
const db = () => adminClient() as unknown as { from: (t: 'jobs') => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const insertRaw = async (cols: Record<string, unknown>): Promise<Row> => {
  const base = await arrangeJob(t); // a valid row to copy required columns from
  const { data: src } = await db().from('jobs').select('*').eq('id', base.id).single();
  const { data, error } = await db()
    .from('jobs')
    .insert({
      org_id: t.orgId,
      client_request_id: crypto.randomUUID(),
      title: 'Raw insert',
      address: src.address,
      job_date: src.job_date,
      start_time: src.start_time,
      assigned_member_id: t.techA.memberId,
      created_by: t.owner.memberId,
      updated_by: t.owner.memberId,
      ...cols,
    })
    .select('id, notes, details, version')
    .single();
  if (error) throw new Error(`insert failed: ${error.message}`);
  return data as Row;
};

const update = async (id: string, cols: Record<string, unknown>) => {
  const { error } = await db().from('jobs').update(cols).eq('id', id);
  return error as { message: string } | null;
};

const read = async (id: string): Promise<Row> => {
  const { data, error } = await db().from('jobs').select('id, notes, details, version').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Row;
};

describe('jobs.notes ⇄ jobs.details sync trigger', () => {
  it('old app: insert via notes → details has it', async () => {
    const r = await insertRaw({ notes: 'from old app' });
    expect([r.notes, r.details]).toEqual(['from old app', 'from old app']);
    expect(r.version).toBe(1);
  });

  it('new app: insert via details → notes has it', async () => {
    const r = await insertRaw({ details: 'from new app' });
    expect([r.notes, r.details]).toEqual(['from new app', 'from new app']);
  });

  it('insert with neither → both null; with both different → details wins', async () => {
    const none = await insertRaw({});
    expect([none.notes, none.details]).toEqual([null, null]);
    const both = await insertRaw({ notes: 'old', details: 'new' });
    expect([both.notes, both.details]).toEqual(['new', 'new']);
  });

  it('update via notes → read details, and one version bump', async () => {
    const r = await insertRaw({ details: 'first' });
    expect(await update(r.id, { notes: 'edited by old app' })).toBeNull();
    const after = await read(r.id);
    expect([after.notes, after.details]).toEqual(['edited by old app', 'edited by old app']);
    expect(after.version).toBe(r.version + 1);
  });

  it('update via details → read notes, and one version bump', async () => {
    const r = await insertRaw({ notes: 'first' });
    expect(await update(r.id, { details: 'edited by new app' })).toBeNull();
    const after = await read(r.id);
    expect([after.notes, after.details]).toEqual(['edited by new app', 'edited by new app']);
    expect(after.version).toBe(r.version + 1);
  });

  it('clearing either column clears both', async () => {
    const a = await insertRaw({ notes: 'x' });
    expect(await update(a.id, { notes: null })).toBeNull();
    expect(await read(a.id)).toMatchObject({ notes: null, details: null, version: 2 });
    const b = await insertRaw({ details: 'x' });
    expect(await update(b.id, { details: null })).toBeNull();
    expect(await read(b.id)).toMatchObject({ notes: null, details: null, version: 2 });
  });

  it('both changed and different in one update → details wins, still one bump', async () => {
    const r = await insertRaw({ notes: 'first' });
    expect(await update(r.id, { notes: 'old wrote', details: 'new wrote' })).toBeNull();
    expect(await read(r.id)).toMatchObject({ notes: 'new wrote', details: 'new wrote', version: r.version + 1 });
  });

  it('a no-op update, or one that touches only other columns, does not bump the version', async () => {
    const r = await insertRaw({ notes: 'same' });
    expect(await update(r.id, { details: 'same' })).toBeNull();
    expect(await update(r.id, { notes: 'same' })).toBeNull();
    expect((await read(r.id)).version).toBe(r.version);
    expect(await update(r.id, { title: 'Renamed' })).toBeNull();
    expect(await read(r.id)).toMatchObject({ notes: 'same', details: 'same', version: r.version + 1 });
  });

  it('details has the same check as notes (1–2000 chars)', async () => {
    const r = await insertRaw({});
    expect(await update(r.id, { details: '' })).not.toBeNull();
    expect(await update(r.id, { details: 'x'.repeat(2001) })).not.toBeNull();
    expect(await update(r.id, { details: 'x'.repeat(2000) })).toBeNull();
  });

  it('a version-bumping update by a technician through RLS also bumps once (details only)', async () => {
    const r = await insertRaw({});
    const { createClient } = await import('@supabase/supabase-js');
    const tech = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { authorization: `Bearer ${t.techA.accessToken}` } },
    });
    const { error } = await tech.from('jobs').update({ details: 'Key under mat' } as never).eq('id', r.id);
    expect(error).toBeNull();
    expect(await read(r.id)).toMatchObject({ notes: 'Key under mat', details: 'Key under mat', version: r.version + 1 });
  });
});

describe('the app reads and writes `details`, the API field stays `notes`', () => {
  it('POST /api/jobs writes details (and the trigger mirrors notes); the response says notes', async () => {
    const res = await POST(
      authed(
        request('POST', '/api/jobs', {
          body: {
            client_request_id: crypto.randomUUID(),
            title: 'Details drill',
            assigned_member_id: t.techA.memberId,
            job_date: '2026-11-18',
            start_time: '08:00',
            address: '1 Drill St',
            notes: 'Gate code 1234',
          },
        }),
        t.owner,
      ),
      undefined,
    );
    expect(res.status).toBe(201);
    const job = await res.json();
    expect(job.notes).toBe('Gate code 1234');
    expect('details' in job).toBe(false);
    expect(await read(job.id)).toMatchObject({ notes: 'Gate code 1234', details: 'Gate code 1234' });
  });

  it('the board shows a note written only to `details` by the new app, and one written only to `notes` by the old app', async () => {
    const viaDetails = await insertRaw({ details: 'new-app note', job_date: '2026-11-19', start_time: '09:00' });
    const viaNotes = await insertRaw({ notes: 'old-app note', job_date: '2026-11-19', start_time: '10:00' });
    const res = await getBoard(authed(request('GET', '/api/board?date=2026-11-19'), t.owner), undefined);
    expect(res.status).toBe(200);
    const board = await res.json();
    const byId = Object.fromEntries(board.jobs.map((j: { id: string; notes: string | null }) => [j.id, j.notes]));
    expect(byId[viaDetails.id]).toBe('new-app note');
    expect(byId[viaNotes.id]).toBe('old-app note');
  });
});
