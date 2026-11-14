import 'server-only';
import { z } from 'zod';

// Server-side environment, validated on first use (names: docs/architecture.md "Environment
// variables"). Values are never logged. Read lazily so `next build` works without secrets.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SITE_URL: z.url().optional(),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** Service-role key: only src/lib/server/admin.ts may call this (SECURITY_MODEL). */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  return key;
}
