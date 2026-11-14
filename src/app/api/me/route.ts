// GET /api/me (contract: getMe)
import type { NextRequest } from 'next/server';
import { requireMember } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { getMe } from '@/lib/server/services/jobs';

export const dynamic = 'force-dynamic';

export const GET = route('getMe', async (req: NextRequest) => {
  const { member } = await requireMember(req);
  return json(getMe(member));
});
