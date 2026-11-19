// Test data builders. Every run makes uniquely titled data so a rerun the same day passes (AC-006.5) and nothing
// collides in the e2e org. Jobs can't be deleted (NG-6): they stay in the is_test org, invisible to Northside.
import { randomUUID } from 'node:crypto';

export const runId = randomUUID().slice(0, 8);
let n = 0;
export const uniq = (label: string) => `E2E ${label} ${runId}-${++n}`.slice(0, 100);
export const uuid = () => randomUUID();

/** A string of exactly `len` Unicode code points (the contract counts code points, not UTF-16 units). */
export const chars = (len: number, ch = 'x') => ch.repeat(len);

export const NIL_UUID = '00000000-0000-4000-8000-000000000000';

/** Toronto calendar date, offset by `days`. Used only to build inputs; "today" itself always comes from GET /me. */
export function torontoDate(days = 0, from = new Date()): string {
  const base = new Date(from.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
}

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type JobInput = {
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

export const jobBody = (over: Partial<JobInput> & Pick<JobInput, 'assigned_member_id' | 'job_date'>): JobInput => ({
  client_request_id: uuid(),
  title: uniq('job'),
  start_time: '10:00',
  address: '45 Main St W, Hamilton',
  ...over,
});

/** A syntactically valid address of exactly `len` characters (local part 64, labels <= 63), unique per run. */
export function emailOfLength(len: number): string {
  const id = `e2e${runId}x${++n}`;
  const local = id.padEnd(64, 'a').slice(0, 64);
  let inner = len - local.length - 1 - '.test'.length;
  const labels: string[] = [];
  while (inner > 0) {
    const take = inner > 63 ? 63 : inner;
    labels.push('b'.repeat(take));
    inner -= take + 1;
  }
  return `${local}@${labels.join('.')}.test`;
}

export const uniqueEmail = (label: string) => `e2e.${label}.${runId}.${++n}@example.test`;
