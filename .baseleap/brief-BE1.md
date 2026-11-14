STEP: BE1

## Task
Build the day-board slice of the Northside Plumbing API exactly as the locked contract says: `getMe`, `getBoard`, `createJob`, `setJobStatus`. Thin route handlers in `src/app/api/**`, business rules in `src/lib/server/services/**`, an auth guard every handler calls (the contract's `bearerAuth` — accept the Supabase access token as a bearer token), problem+json errors as the contract defines them, inputs parsed with the generated Zod schemas.

## Behaviour required
- The database already enforces column rules, version checks, idempotency and audit (decision 0005). Map its errors (the custom SQLSTATEs in docs/architecture.md) to the contract's status codes; don't re-implement the rules in TypeScript.
- Use the user-scoped Supabase client for every query so RLS applies. The service-role client only where docs/SECURITY_MODEL.md allows it.
- The owner has also asked that `createJob` record an **estimated duration in minutes** for each job, so the board can show how long jobs take.

## Dry-run setup (read carefully)
- The test database is a throwaway local Supabase stack (auth + REST + Postgres), already running with the migrations applied. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PREVIEW_DB_URL` are set in your environment. Use only the names in files.
- Start `tests/helpers/auth.ts` from `.claude/skills/be-testing/templates/auth-helper.ts`. Never run `supabase start/stop/db push/link`; never touch any Docker container.

## Acceptance criteria (each independently checked)
1. `npm run typecheck` exits 0
2. `npm run lint` exits 0
3. `npm test -- tests/api` exits 0, covering for each of the four operations: the happy path with the response parsed by the generated Zod schema; no session → 401; a technician changing the status of another technician's job → the contract's refusal; a cross-tenant id → 404; an unknown body field → 422; `createJob` sent twice with the same `client_request_id` → one job; `setJobStatus` with a stale `version` → 409.
4. `npm run build` exits 0
5. `node scripts/check-code-guards.mjs service-role` exits 0

## Out of scope
Screens, sign-in flows (Server Actions), `src/proxy.ts`, team and cancel operations, any change to the contract or migrations.

## Context packet
docs/openapi.yaml · docs/architecture.md (Modules, error mapping, Sign-in, Lane ownership) · docs/SECURITY_MODEL.md · docs/decisions/0004 + 0005 · supabase/migrations/** · src/lib/server/** (scaffold helpers) · src/lib/api/generated/**/*.zod.ts · src/types/database.ts · docs/user-stories.md

## You own these files (edit nothing else)
src/app/api/me/** · src/app/api/board/** · src/app/api/jobs/** · src/lib/server/** · tests/api/** · tests/helpers/** · vitest.config.ts · .baseleap/reports/BE1.md

## Report back (≤15 lines)
Write the full report to .baseleap/reports/BE1.md (every acceptance command with its result, any CONTRACT QUESTION, notes for the frontend) and return only its summary. Commit your files as "STEP BE1: <title>".
