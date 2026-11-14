# BE1 report: day-board slice (getMe, getBoard, createJob, setJobStatus)

## Acceptance commands
| # | Command | Result |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm run lint` | exit 0 |
| 3 | `npm test -- tests/api` | exit 0: 4 files, 39 tests, run against the local Supabase stack |
| 4 | `npm run build` | exit 0 (routes: /api/me, /api/board, /api/jobs, /api/jobs/[job_id]/status) |
| 5 | `node scripts/check-code-guards.mjs service-role` | OK |

## What was built
- `src/lib/server/auth.ts`: `requireMember(req)` accepts the bearer token (validated with `auth.getUser`) or the session cookie. It returns the user-scoped client and the active member, or 401. The service-role client is not used anywhere in this slice.
- `src/lib/server/http.ts`: `route()` wrapper, problem+json errors, zod issues mapped to the contract's `errors[]`, `Cache-Control: no-store`, and `X-Request-Id` on every response.
- `src/lib/server/log.ts`: structured logs with ids only.
- `src/lib/server/services/jobs.ts`: all four operations. Database SQLSTATEs are mapped as in architecture.md. Column rules, versioning and audit stay in the database.
- Handlers are thin. Bodies and queries are parsed with the generated zod schemas plus `.strict()`, so unknown fields give 422.
- Tests and helpers: `tests/helpers/auth.ts` (two test orgs, `is_test = true`) and `tests/api/{me,board,jobs-create,jobs-status}.test.ts`. `vitest.config.ts` aliases `server-only` to a stub for tests and includes `tests/api`.

## Auth-matrix results (all pass)
| Operation | 401 no session | Wrong role | Cross-tenant | Unknown field | Idempotency / version |
|---|---|---|---|---|---|
| getMe | yes (also a bad token and a removed member) | n/a | own org only | n/a | n/a |
| getBoard | yes | n/a | other org's jobs never listed | 422 | n/a |
| createJob | yes | technician → 403, nothing saved | job saved in the caller's org | 422, nothing saved | same `client_request_id` twice and in parallel → one job (201 then 200) |
| setJobStatus | yes | technician on another's job → 403 (also for the same status, or a stale version) | other org's job → 404 | 422 | stale version → 409 with `current`. Same status → 200 no-op, one audit row |

Assumption: setJobStatus checks the permission matrix first (403) and then the version. A technician on someone else's job with a stale version therefore gets 403, not 409.

## CONTRACT QUESTIONS
1. **Estimated duration (owner's request) was NOT built.** `JobCreate` and `Job` have no duration field, and `jobs` has no column for it. PRD NG-7 lists "end time or duration" as a non-goal, and the user stories say "Out of scope: end time or duration". I can't change the contract or migrations, and adding the field without them would break "no extra fields". Because `.strict()` is on, a body with `estimated_minutes` currently gets 422 (tested). If the owner wants it, the architect needs to:
   - revisit NG-7;
   - add a nullable `estimated_minutes` int to `JobCreate`, `Job` and `JobUpdate`;
   - add the migration, with a check constraint and an update to the guard trigger;
   - regenerate the code.
   Then I'll wire it up.
2. **Empty `customer_phone`.** The conventions say an empty string becomes null. The `customer_phone` pattern `^[0-9 +()-]{7,20}$` rejects `''`, so sending `''` returns 422. The frontend must send `null` or omit the field. If `''` should be accepted, the pattern needs an alternative.
3. **500 body.** The contract defines no 500, but `Problem.code` is required and has an enum. Unexpected errors return 500 with `code: "internal_error"`, which is outside the enum. Suggest adding a 500 response and code. I put the request id in the `X-Request-Id` header and not in the body.
4. **DELETE → 405** (contract conventions) is not implemented for these paths. Next returns a bare 405 for unexported methods, which is not problem+json. It is outside the four operations.

## Notes for the frontend
- 409 body: problem+json plus `current` (the full Job). 422 `errors[].field` is the contract field name. Unknown fields have no `code`.
- `job_count` is the number of jobs on the day (an exact count). Jobs of other days and other orgs are excluded.
- `GET /api/board` without `date` uses the org's today. Out-of-range or invalid dates give 422.
- A technician sees `permissions.change_status = false` on their own cancelled jobs.
- A malformed or non-uuid `job_id` returns 404.

## Not done / notes
- No EXPLAIN run. The board query uses `jobs_board_idx` (org via RLS, `job_date`, `start_time`, `created_at`) plus the PK join. The `id` tiebreak in the ORDER BY is a cheap extra sort key.
- Test rows stay in `is_test` orgs (jobs and audit can't be deleted, NG-6). Only auth users are deleted on cleanup.
- `getJob`, `updateJob`, `cancelJob`, team and events routes, `src/proxy.ts` and sign-in are out of scope for BE1.
