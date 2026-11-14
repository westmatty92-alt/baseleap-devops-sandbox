// POST /api/jobs (contract: createJob)
import type { NextRequest } from 'next/server';
import { CreateJobBody } from '@/lib/api/generated/jobs/jobs.zod';
import { requireMember } from '@/lib/server/auth';
import { json, notAllowed, readJson, route, validationError } from '@/lib/server/http';
import { createJob } from '@/lib/server/services/jobs';

export const dynamic = 'force-dynamic';

export const POST = route('createJob', async (req: NextRequest) => {
  const caller = await requireMember(req);
  if (caller.member.role !== 'owner') throw notAllowed();
  const body = await readJson(req);
  const parsed = CreateJobBody.strict().safeParse(body); // unknown fields → 422, never ignored
  if (!parsed.success) throw validationError(parsed.error, body);
  const { job, created } = await createJob(caller, parsed.data);
  return json(job, created ? 201 : 200);
});
