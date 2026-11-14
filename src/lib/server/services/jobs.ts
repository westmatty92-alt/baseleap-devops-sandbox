import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Job, BoardDay, Me } from '@/lib/api/generated/model';
import type { Caller, Member } from '../auth';
import { HttpError, notAllowed, notFound } from '../http';

// One row of the board: the job and its technician (the FK hint avoids created_by / updated_by).
const JOB_SELECT = '*, assigned:team_members!jobs_assigned_member_id_fkey(id, name, is_active)' as const;

const MAX_BOARD = 500;
const MIN_DATE = '2020-01-01';
const MAX_DATE = '2100-12-31';

type JobStatus = Job['status'];

export type CreateJobInput = {
  client_request_id: string;
  title: string;
  assigned_member_id: string;
  job_date: string;
  start_time: string;
  address: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------------------------
// shaping
// ---------------------------------------------------------------------------------------------

/** The permission matrix (SECURITY_MODEL.md) for one job and one viewer. The database enforces it again. */
function permissionsFor(member: Member, job: { assigned_member_id: string; status: string }): Job['permissions'] {
  if (member.role === 'owner') return { change_status: true, edit_notes: true, edit_all: true, cancel: true };
  const own = job.assigned_member_id === member.id && job.status !== 'cancelled';
  return { change_status: own, edit_notes: own, edit_all: false, cancel: false };
}

type JobRow = {
  id: string;
  job_date: string;
  start_time: string;
  title: string;
  address: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  status: string;
  version: number;
  assigned_member_id: string;
  created_at: string;
  updated_at: string;
  assigned: { id: string; name: string; is_active: boolean } | null;
};

function toJob(member: Member, r: JobRow): Job {
  if (!r.assigned) throw new Error('job without a readable technician');
  return {
    id: r.id,
    job_date: r.job_date,
    start_time: r.start_time.slice(0, 5), // 'HH:MM:SS' → 'HH:MM', never converted (decision 0006)
    title: r.title,
    address: r.address,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    notes: r.notes,
    status: r.status as JobStatus,
    version: r.version,
    assigned_technician: { id: r.assigned.id, name: r.assigned.name, is_active: r.assigned.is_active },
    is_mine: r.assigned_member_id === member.id,
    permissions: permissionsFor(member, r),
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

/** Optional text: empty or whitespace-only → null (contract conventions). */
const blankToNull = (v: string | null | undefined, trim: boolean): string | null => {
  if (v === null || v === undefined) return null;
  return v.trim() === '' ? null : trim ? v.trim() : v;
};

// ---------------------------------------------------------------------------------------------
// database errors → contract responses (docs/architecture.md "Error mapping")
// ---------------------------------------------------------------------------------------------

function mapDbError(error: PostgrestError): never {
  switch (error.code) {
    case 'BLA01':
      throw new HttpError(422, 'technician_not_assignable', {
        errors: [{ field: 'assigned_member_id', code: 'technician_not_assignable', message: 'That technician is no longer on the team' }],
      });
    case 'BLA02':
    case 'BLA03':
    case '42501':
      throw notAllowed();
    case 'BLA04':
      throw new HttpError(422, 'validation_failed');
    case '23514': {
      const column = /constraint "jobs_(\w+?)_check"/.exec(error.message)?.[1];
      const field = column ?? 'body';
      throw new HttpError(422, 'validation_failed', {
        errors: [{ field, code: field === 'job_date' ? 'invalid_date' : 'invalid_format', message: field === 'job_date' ? 'Enter a valid date' : 'Check this value' }],
      });
    }
    case '22P02':
    case '22007':
    case '22008':
      throw new HttpError(422, 'validation_failed');
    default:
      throw new Error(`database error ${error.code}`); // → generic 500; message stays out of the response
  }
}

// ---------------------------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------------------------

export function getMe(member: Member): Me {
  return {
    member: { id: member.id, name: member.name, role: member.role },
    org: member.org,
  };
}

/** Q1: every job of one day in the caller's org, by start time then created_at. RLS scopes the org. */
export async function getBoard({ db, member }: Caller, date: string | undefined): Promise<BoardDay> {
  const day = date ?? member.org.today;
  if (day < MIN_DATE || day > MAX_DATE) {
    throw new HttpError(422, 'validation_failed', { errors: [{ field: 'date', code: 'invalid_date', message: 'Enter a valid date' }] });
  }
  const { data, error, count } = await db
    .from('jobs')
    .select(JOB_SELECT, { count: 'exact' })
    .eq('job_date', day)
    .order('start_time', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_BOARD);
  if (error) mapDbError(error);
  const total = count ?? data.length;
  return {
    date: day,
    today: member.org.today,
    is_today: day === member.org.today,
    viewer: { member_id: member.id, role: member.role },
    job_count: total,
    truncated: total > MAX_BOARD,
    jobs: (data as unknown as JobRow[]).map((r) => toJob(member, r)),
  };
}

/** Q2: one job; RLS hides other orgs' jobs, so "not found" and "not yours" look the same. */
async function readJob({ db, member }: Caller, id: string): Promise<Job | null> {
  const { data, error } = await db.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
  if (error) {
    if (error.code === '22P02') return null; // not a uuid: can't exist
    mapDbError(error);
  }
  return data ? toJob(member, data as unknown as JobRow) : null;
}

// ---------------------------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------------------------

/** Owner creates a job. Returns `created: false` for a replay of the same client_request_id (HTTP 200). */
export async function createJob(caller: Caller, input: CreateJobInput): Promise<{ job: Job; created: boolean }> {
  const { db, member } = caller;
  if (member.role !== 'owner') throw notAllowed();

  const title = input.title.trim();
  const address = input.address.trim();
  if (title === '' || address === '') {
    throw new HttpError(422, 'validation_failed', {
      errors: [
        ...(title === '' ? [{ field: 'title', code: 'required' as const, message: 'Enter a job title' }] : []),
        ...(address === '' ? [{ field: 'address', code: 'required' as const, message: 'Enter an address' }] : []),
      ],
    });
  }

  // Q4 first: a replay returns the saved job even if its technician was removed since (AC-003.11);
  // the guard trigger would refuse a second insert before the unique index is reached.
  const replay = await findByRequestId(caller, input.client_request_id);
  if (replay) return { job: replay, created: false };

  const { data, error } = await db
    .from('jobs')
    .insert({
      org_id: member.org.id,
      client_request_id: input.client_request_id,
      title,
      assigned_member_id: input.assigned_member_id,
      job_date: input.job_date,
      start_time: input.start_time,
      address,
      customer_name: blankToNull(input.customer_name, true),
      customer_phone: blankToNull(input.customer_phone, true),
      notes: blankToNull(input.notes, false),
      created_by: member.id, // the guard trigger sets created_by / updated_by / status / version itself
      updated_by: member.id,
    })
    .select(JOB_SELECT)
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('jobs_client_request_unique')) {
      // Two taps raced past the pre-check: the other insert won.
      const winner = await findByRequestId(caller, input.client_request_id);
      if (winner) return { job: winner, created: false };
    }
    mapDbError(error);
  }
  return { job: toJob(member, data as unknown as JobRow), created: true };
}

async function findByRequestId({ db, member }: Caller, clientRequestId: string): Promise<Job | null> {
  const { data, error } = await db.from('jobs').select(JOB_SELECT).eq('client_request_id', clientRequestId).maybeSingle();
  if (error) mapDbError(error);
  return data ? toJob(member, data as unknown as JobRow) : null;
}

/**
 * Set a job's status (decision 0005). Same status → 200 no-op whatever the version. Otherwise one
 * `update … where id and version`; zero rows → re-read to tell 404 / 409 / 403 apart.
 */
export async function setJobStatus(caller: Caller, id: string, version: number, status: JobStatus): Promise<Job> {
  const { db, member } = caller;

  const job = await readJob(caller, id);
  if (!job) throw notFound();

  // Matrix check at the handler layer (RLS and the guard trigger check again).
  if (!job.permissions.change_status) throw notAllowed();
  if (status === 'cancelled' && member.role !== 'owner') throw notAllowed();

  if (job.status === status) return job;

  const { data, error } = await db
    .from('jobs')
    .update({ status })
    .eq('id', id)
    .eq('version', version)
    .select(JOB_SELECT)
    .maybeSingle();
  if (error) mapDbError(error);
  if (data) return toJob(member, data as unknown as JobRow);

  // Nothing matched: it changed under us, vanished, or the database refused without raising.
  const latest = await readJob(caller, id);
  if (!latest) throw notFound();
  if (latest.status === status) return latest; // someone else already made the same change
  if (latest.version !== version) throw new HttpError(409, 'stale_version', { current: latest });
  throw notAllowed();
}
