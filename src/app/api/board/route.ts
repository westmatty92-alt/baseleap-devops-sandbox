// GET /api/board (contract: getBoard)
import type { NextRequest } from 'next/server';
import { GetBoardQueryParams } from '@/lib/api/generated/board/board.zod';
import { requireMember } from '@/lib/server/auth';
import { json, route, validationError } from '@/lib/server/http';
import { getBoard } from '@/lib/server/services/jobs';

export const dynamic = 'force-dynamic';

export const GET = route('getBoard', async (req: NextRequest) => {
  const caller = await requireMember(req);
  const query = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = GetBoardQueryParams.strict().safeParse(query);
  if (!parsed.success) throw validationError(parsed.error, query);
  return json(await getBoard(caller, parsed.data.date));
});
