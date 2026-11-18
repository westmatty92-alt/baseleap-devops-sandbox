// GET /api/health (contract: getHealth). Scaffolded by the architect; backend lane from here on.
// No session, no personal data. `?check=db` adds a database round trip (503 when it fails).
import { NextResponse, type NextRequest } from 'next/server';
import type { Health, Problem } from '@/lib/api/generated/model';

export const dynamic = 'force-dynamic';

function version(): string {
  return (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7);
}

/**
 * DB reachability through PostgREST: it answers its root only with a live schema cache, and
 * returns 503 when it can't reach Postgres. Backend may swap this for a `select 1` RPC
 * (additive migration) if a stricter check is wanted.
 */
async function dbReachable(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const check = request.nextUrl.searchParams.get('check');
  const headers = { 'Cache-Control': 'no-store' };

  if (check !== null && check !== 'db') {
    const problem: Problem = {
      type: 'about:blank',
      title: 'Bad request',
      status: 400,
      code: 'bad_request',
      detail: 'check must be "db"',
    };
    return NextResponse.json(problem, {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/problem+json' },
    });
  }

  if (check === 'db') {
    const ok = await dbReachable();
    const body: Health = {
      status: ok ? 'ok' : 'degraded',
      checks: { app: 'ok', db: ok ? 'ok' : 'down' },
      version: version(),
    };
    return NextResponse.json(body, { status: ok ? 200 : 503, headers });
  }

  const body: Health = { status: 'ok', checks: { app: 'ok' }, version: version() };
  return NextResponse.json(body, { headers });
}
