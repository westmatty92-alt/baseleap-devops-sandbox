# QA8-001: `GET /api/health?check=db` returns 503 on every hosted environment (the DB check uses an endpoint hosted Supabase refuses)

- **Severity:** Important. `?check=db` is the contract's database probe (AC-006.3). Today it reports "down" when the database is fine, so it can't be used for monitoring or as a deploy gate. It fails open to nothing user-facing: sign-in and the board are not affected by it.
- **Class:** server / environment-dependent behaviour (works on the local stack, fails on hosted Supabase)
- **Owner agent:** bl-backend (`src/app/api/health/route.ts`). bl-ops to confirm the staging and production env vars once the fix is in.
- **AC:** AC-006.3 (US-006): `GET /api/health?check=db` is 200 with `checks.db = "ok"` when the database answers.
- **Signature suggestion:** `server:health-db-probe-postgrest-root-refused-hosted`

## Steps to reproduce
1. Take the staging deployment of 1727926: `https://baseleap-devops-sandbox-p2gs5apa4-baseleap.vercel.app` (no session needed).
2. `GET /api/health?check=db`.
3. Compare with `GET /api/health` (no `check`), which is 200 on the same deployment.

## Expected
200 `{"status":"ok","checks":{"app":"ok","db":"ok"},"version":"1727926"}` while the staging database is up (contract `getHealth`, AC-006.3).

## Actual
- **503** on both attempts (first try and retry #1), so a real failure, not flaky. The test asserts the status first, so the log does not show the body.
- Claude's check of production: the same route answers `{"status":"degraded","checks":{"app":"ok","db":"down"}}`. So production has the same fault; it is not specific to staging or to this run.
- Request id: **none available.** The Playwright assertion reads only the status code, and the CI log carries no response headers or body for this call. The route itself returns no request id. The trace is in the run's artifact `qa-staging-smoke` (artifact id 14488708070): `test-results/api-contract-health-US-006-6bd36-k-db-returns-200-with-db-ok-api{,-retry1}/trace.zip`, which holds the full response headers (including any Vercel `x-vercel-id`).

## Why the local stack can't show it
`dbReachable()` calls `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/` with the anon key and treats anything but 2xx as "down". The local Supabase stack answers that root for the anon key. Hosted Supabase refuses the anon key on the PostgREST root, since the schema root is limited to privileged keys. Claude confirmed this against the hosted root. Every call therefore returns non-2xx, `db: "down"` and 503, whatever the database's state. The same test passed locally in runs A to C, which is why it was green until it met a hosted project. This is a difference between environments, not a flaky network. The 2000 ms timeout is not the cause: the test took 95 to 192 ms.

## Proposed fix (backend's call)
Probe the database with something the anon role is allowed to do on hosted Supabase. For example, a `select 1`-style RPC (the route's own comment already suggests this; it needs an additive migration with `execute` granted to `anon` and nothing else exposed), or a head request on a table or view the anon role can read. Do not make the check pass by treating a 401 or 403 as "ok": that would report "ok" with the database down. Keep 503 when the probe fails. Do not use the service role key in this public route.

## Regression test
Already in the suite and unchanged: `tests/e2e/api/contract.spec.ts:29` `AC-006.3 @smoke GET /api/health?check=db returns 200 with db ok`. It stays red on staging until fixed. Re-run: `npx playwright test --project=api -g "health" ` against the staging URL (the `qa-staging` workflow with `@smoke`).
Suggested addition once the fix is in (a second test, QA will add it): assert `status` is `ok` and that the body has `version` equal to the deployed short SHA.

## Evidence
`.baseleap/inputs/qa8-staging-run.log` (lines 526, 527, 544 to 596); CI run 44434945604; artifact `qa-staging-smoke`. Code: `src/app/api/health/route.ts` `dbReachable()`.
