// PUT /api/jobs/{job_id}/status (contract: setJobStatus)
import type { NextRequest } from 'next/server';
import { SetJobStatusBody } from '@/lib/api/generated/jobs/jobs.zod';
import { requireMember } from '@/lib/server/auth';
import { json, readJson, route, validationError } from '@/lib/server/http';
import { setJobStatus } from '@/lib/server/services/jobs';

export const dynamic = 'force-dynamic';

export const PUT = route('setJobStatus', async (req: NextRequest, ctx: { params: Promise<{ job_id: string }> }) => {
  const caller = await requireMember(req);
  const { job_id } = await ctx.params;
  const body = await readJson(req);
  const parsed = SetJobStatusBody.strict().safeParse(body);
  if (!parsed.success) throw validationError(parsed.error, body);
  return json(await setJobStatus(caller, job_id, parsed.data.version, parsed.data.status));
});
