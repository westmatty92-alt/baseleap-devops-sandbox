// Refuses to point the suite at anything but a staging preview. QA rule: staging preview only, never production,
// never a local server as evidence. Fails closed: with PRODUCTION_HOSTS unset nothing runs, because production is
// itself a *.vercel.app address and a preview cannot be told apart from it by shape alone.

export const BYPASS_HEADER = 'x-vercel-protection-bypass';

type Env = Record<string, string | undefined>;

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);

export function assertSafeTarget(baseUrl: string | undefined, env: Env): URL {
  if (!baseUrl) throw new Error('e2e: BASE_URL is not set (the staging preview URL)');
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
    throw new Error(`e2e: refusing ${host}, it is listed in PRODUCTION_HOSTS. QA runs on the staging preview only`);
  }
  if (url.protocol !== 'https:') throw new Error('e2e: refusing a non-https BASE_URL (no local servers as evidence)');
  const staging = (env.STAGING_HOST ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const isPreview = host.endsWith('.vercel.app');
  if (!isPreview && !(staging && host === staging)) {
    throw new Error(`e2e: refusing ${host}: not a Vercel preview (*.vercel.app) and not STAGING_HOST`);
  }
  return url;
}

/** The Supabase project behind the preview must not be production either (same rule as tests/helpers/auth.ts). */
export function assertSafeSupabase(env: Env): string {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('e2e: NEXT_PUBLIC_SUPABASE_URL is not set (the staging Supabase project or preview branch)');
  const prodRef = env.SUPABASE_PROD_PROJECT_REF;
  if (!prodRef) throw new Error('e2e: SUPABASE_PROD_PROJECT_REF is not set. Refusing a remote Supabase without it');
  if (url.includes(prodRef)) throw new Error('e2e: refusing, the Supabase URL is the production project');
  return url;
}
