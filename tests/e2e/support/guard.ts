// Refuses to point the suite at anything but a staging preview or, for the pre-staging check, this repo's own local stack.
// QA rule: never production, never real client data. Fails closed: with PRODUCTION_HOSTS unset nothing runs, because
// production is itself a *.vercel.app address and a preview cannot be told apart from it by shape alone.
//
// Two targets:
//   remote (default)  BASE_URL is an https *.vercel.app preview or the single STAGING_HOST; the Supabase project is
//                     staging and SUPABASE_PROD_PROJECT_REF must be set (the URL must not contain it).
//   local             E2E_TARGET=local. BASE_URL is exactly http://localhost:3000 or http://127.0.0.1:3000 and the Supabase
//                     URL is http://127.0.0.1:554xx (this repo's `npx supabase start` ports only). Local runs are a
//                     pre-staging check; the release verdict still comes from a staging run.
// Both targets still require PRODUCTION_HOSTS and refuse a BASE_URL listed in it.

export const BYPASS_HEADER = 'x-vercel-protection-bypass';

type Env = Record<string, string | undefined>;

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);

export const isLocalRun = (env: Env): boolean => env.E2E_TARGET === 'local';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function assertSafeTarget(baseUrl: string | undefined, env: Env): URL {
  if (!baseUrl) throw new Error('e2e: BASE_URL is not set (the staging preview URL, or http://localhost:3000 with E2E_TARGET=local)');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('e2e: BASE_URL is not a valid URL');
  }
  const host = url.hostname.toLowerCase();
  const production = csv(env.PRODUCTION_HOSTS);
  if (production.length === 0) {
    throw new Error('e2e: PRODUCTION_HOSTS is not set. Refusing to run: the suite cannot tell staging from production without it');
  }
  if (production.includes(host) || production.includes(url.host.toLowerCase())) {
    throw new Error(`e2e: refusing ${host}, it is listed in PRODUCTION_HOSTS. QA runs on staging (or the local stack) only`);
  }

  if (isLocalRun(env)) {
    if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(host) || url.port !== '3000') {
      throw new Error('e2e: E2E_TARGET=local only allows BASE_URL http://localhost:3000 or http://127.0.0.1:3000');
    }
    return url;
  }

  if (url.protocol !== 'https:') throw new Error('e2e: refusing a non-https BASE_URL (set E2E_TARGET=local for the local stack)');
  const staging = (env.STAGING_HOST ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const isPreview = host.endsWith('.vercel.app');
  if (!isPreview && !(staging && host === staging)) {
    throw new Error(`e2e: refusing ${host}: not a Vercel preview (*.vercel.app) and not STAGING_HOST`);
  }
  return url;
}

/** The Supabase project behind the app must not be production either (same rule as tests/helpers/auth.ts). */
export function assertSafeSupabase(env: Env): string {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('e2e: NEXT_PUBLIC_SUPABASE_URL is not set (the staging Supabase project, or the local stack)');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('e2e: NEXT_PUBLIC_SUPABASE_URL is not a valid URL');
  }
  const prodRef = env.SUPABASE_PROD_PROJECT_REF;
  if (prodRef && url.includes(prodRef)) throw new Error('e2e: refusing, the Supabase URL is the production project');

  if (isLocalRun(env)) {
    const port = Number(parsed.port);
    if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname) || !(port >= 55400 && port <= 55499)) {
      throw new Error('e2e: E2E_TARGET=local only allows a Supabase URL on http://127.0.0.1:554xx (this repo\'s stack)');
    }
    return url;
  }
  if (!prodRef) throw new Error('e2e: SUPABASE_PROD_PROJECT_REF is not set. Refusing a remote Supabase without it');
  return url;
}
