import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/**
 * Session refresh for the Next.js proxy (Next 16 renamed middleware.ts to proxy.ts; the file
 * goes at src/proxy.ts and is the backend lane's). Returns the response carrying refreshed
 * auth cookies plus the user (or null). Redirect rules (AC-001.7) and the 30-day cap fallback
 * are the backend's to add on top. Not a security boundary: every page and handler still calls
 * requireMember().
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Validates the JWT (don't trust getSession() on the server) and refreshes it if needed.
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}
