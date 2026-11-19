# QA3: the end-to-end suite on the real app

Branch: current. Not pushed. **The suite has not been run.** The local run needs Supabase keys that QA cannot read, so this report stops where the brief says to stop: the commands below are for Claude to run. No secret value was read, printed or written.

## What was done

- QA1's plan and specs are in the repo and adapted to the app as built: `docs/test-plan.md`, `playwright.config.ts`, `tests/e2e/**` (13 spec/support files, 334 test cases across projects), `tests/api/e2e-guard.test.ts`, `tests/e2e/local-env.sh`, `tests/e2e/run-local.sh`, `docs/qa-reports/latest-run.md` (says NOT RUN).
- Checked without keys: `npx playwright test --list` lists everything; TypeScript is clean on the config and `tests/e2e/**`; `npx playwright test` with no `BASE_URL` refuses at config load.
- **Not checked:** `npx vitest run tests/api/e2e-guard.test.ts` (the guard's unit test) was not approved in this session, so it is written but unrun. Run it first (command 3).
- Shell copies (`cp`, `mkdir`) were not approved either, so every file was written whole with the editor. QA1's copies in `.baseleap/inputs/qa1/` are untouched.

## The app as built (what the suite found when it read the routes)

| Built | Not built |
|---|---|
| `GET /api/health`, `GET /api/me`, `GET /api/board`, `POST /api/jobs`, `PUT /api/jobs/{id}/status` | `GET` and `PATCH /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, `GET /api/technicians`, `/api/team` (GET, POST, remove), `POST /api/events` |
| Pages exist at `/board`, `/team`, `/jobs/new`, `/jobs/{id}`, `/jobs/{id}/edit`, `/sign-in`, `/link-expired`, `/not-allowed`, `/offline`, `/` | …but all are placeholders; no `/auth/confirm`, no `src/proxy.ts`, no `public/` (manifest, `sw.js`, icons) |

Tests for what is not built are `test.fixme(true, reason)` and stay in their files unchanged. Reasons are in `tests/e2e/support/unbuilt.ts`.

## Acceptance criteria (101)

| | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| **RUN** (every test live) | 1 | 4 | 3 | 0 | **8** |
| **PART** (API part live, screen or endpoint `fixme`) | 6 | 15 | 10 | 0 | **31** |
| **FIXME** (all tests off, reason given) | 5 | 22 | 18 | 14 | **59** |
| Manual / no test / out of scope (AC-005.4, AC-001.8, AC-006.2) | 0 | 0 | 0 | 3 | **3** |
| **Failing** | not known: not run | | | | |

Every AC has a row in `docs/test-plan.md` section 4 with its status. 39 ACs have at least some live coverage. The Critical boundary probes that run today: signed-out 401s on the four built endpoints, technician cannot create a job, technician cannot change another technician's job or set Cancelled or touch a cancelled job, cross-org `PUT status` → 404 with the database row unchanged, DELETE refused everywhere, and the direct Data API probes (PATCH/INSERT/DELETE, `team_members`, `audit_log`/`events`/`rate_limits`, other org's jobs).

## Safety rules kept

- `playwright.config.ts` refuses to load for a real run when `PRODUCTION_HOSTS` is unset or contains the target, in both modes. `--list` is the only exemption. Every spec also re-checks through an auto-fixture.
- Remote mode takes only an https `*.vercel.app` preview or `STAGING_HOST`, and needs `SUPABASE_PROD_PROJECT_REF` (refuses a URL containing it).
- Local mode (`E2E_TARGET=local`) takes only `http://localhost:3000` / `127.0.0.1:3000` and a Supabase URL on `127.0.0.1:554xx`. `local-env.sh` also refuses any other API port before exporting anything. The Vercel bypass header is never sent to localhost.
- The `setup` project makes its own org `E2E <run id>` (`is_test`), owner, Tech A and Tech B with the service role. Every id is written to a manifest (`tests/e2e/.auth/manifest.json`, git-ignored) the moment it exists. The `cleanup` project deletes only manifest ids (auth users, then orgs that are `is_test` and named `E2E …`, checked again). The org delete is best effort: jobs cannot be deleted through the app (NG-6), and the run report will say how many orgs were kept.
- Tokens and passwords stay in memory and in `tests/e2e/.auth/` (ignored). Nothing prints a key, token or email.

## Commands to run (Claude)

Everything uses this repo's own Supabase (project `northside-be1-dryrun`, ports 554xx). Do not run these against any other container. `PRODUCTION_HOSTS` must be the real production host list (comma-separated, every alias); the suite refuses to start without it.

```bash
# 0. once: browser for Playwright
npx playwright install chromium

# 1. the local Supabase stack (applies supabase/migrations)
npx supabase start

# 2. the app on port 3000, in the background, with the local env (values are loaded, not printed)
export PRODUCTION_HOSTS='<production hosts, comma separated>'
(source tests/e2e/local-env.sh && npm run dev) > /tmp/qa3-dev.log 2>&1 &
# wait until it answers:
curl -fsS http://localhost:3000/api/health

# 3. unit test for the guard (no stack needed)
npx vitest run tests/api/e2e-guard.test.ts

# 4. the @smoke tag (setup and cleanup are tagged @smoke on purpose; --grep filters dependency projects too)
bash tests/e2e/run-local.sh --grep @smoke

# 5. the API probes: contract, permissions, audit/events
bash tests/e2e/run-local.sh --project=api

# 6. everything (browser specs are fixme except smoke, AC-006.4 and AC-006.6)
bash tests/e2e/run-local.sh

# 7. stop
kill %1   # the dev server; then: npx supabase stop
```

A single test: `bash tests/e2e/run-local.sh -g "AC-007.9"`. Reports go to `docs/qa-reports/playwright/` (HTML and `results.json`). Send back the pass/fail lines and any stack for a failure; do not paste `tests/e2e/.auth/*` or env values.

If `local-env.sh` says `ANON_KEY` or `SERVICE_ROLE_KEY` is missing, this CLI version names them differently: check the names only with `npx supabase status -o env | cut -d= -f1` and tell me; the three variables the app needs are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

## What staging needs (`qa-staging.yml`, owned by devops; QA did not edit it)

The workflow already provides `BASE_URL`, `DEPLOY_SHA`, `PRODUCTION_HOSTS`, `VERCEL_AUTOMATION_BYPASS_SECRET` and runs `npx playwright test --grep @smoke`. The new setup project also needs these in the `staging` GitHub environment and in the `smoke` job's `env:`:

| Name | Kind | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | variable | the **staging** Supabase project URL (must be the same project the preview deployment talks to) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | variable or secret | that project's anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | that project's service-role key, in the `staging` environment only (decision 0004) |
| `SUPABASE_PROD_PROJECT_REF` | variable | the production project ref; the suite refuses a URL containing it |
| `STAGING_HOST` | variable, optional | only if staging is a named host rather than a `*.vercel.app` preview |

No longer needed: `E2E_OWNER_EMAIL`, `E2E_TECH_A_EMAIL`, `E2E_TECH_B_EMAIL` (the suite creates its own users). The workflow must not set `E2E_TARGET`: without it the guard only accepts an https preview or `STAGING_HOST`. If the preview and `NEXT_PUBLIC_SUPABASE_URL` are different projects, setup fails at "owner GET /api/me" with 401, which is a configuration fault, not an app bug.

## Needs a decision or someone else's file

1. **`package.json` has no `e2e` script** (AC-006.1 names `npm run e2e`; QA does not own the file). Suggest `"e2e": "playwright test"` and `"e2e:local": "bash tests/e2e/run-local.sh"`. Same as QA1's Q1.
2. **Unbuilt endpoints and screens** (list above). Each `fixme` group is switched on by deleting one line. Tell me the order they merge and I will turn them on and re-run (Q8 in the plan).
3. **Security headers** come from `vercel.json`, which `next dev` ignores. `SECURITY 14 … not frameable` is skipped on the local stack with that reason and runs on the staging preview.
4. **`GET /api/health?check=db`** calls PostgREST's root with the anon key; check it answers 200 on staging (Q9).
5. **Audit `details` shape** is visible in the migration (`from_status`/`to_status`, `fields_changed`, …) but not in `docs/architecture.md` (Q4).

## Things I could not verify, so the first run may fail for a QA reason

These are mine to fix after the run (`test` tickets), not app bugs, unless the evidence says otherwise:

- Sign-in for the tests uses a throwaway password through Supabase Auth (the repo's own `tests/helpers/auth.ts` does the same). If the stack disables password sign-in, setup fails; then the fallback is `generateLink` plus `verifyOtp` (decision 0004's path).
- Inserting `organizations` and `team_members` rows with the service role depends on the database's guard triggers; the repo's vitest helpers do the same, so I expect it to work.
- Error codes in a few contract assertions come from the OpenAPI contract, not from the code (for example `too_long` on over-length fields, `invalid_date` on bad dates, `invalid_format` on bad phones). A mismatch there is a finding to check against `docs/openapi.yaml`, not a test to loosen.
- AC-003.4 assumes `notes` limits of 2000 code points and AC-003.5 the phone pattern `^[0-9 +()-]{7,20}$` from the contract.

## Commit

Owned paths only: `docs/test-plan.md`, `playwright.config.ts`, `tests/e2e`, `tests/api/e2e-guard.test.ts`, `docs/qa-reports`, `.baseleap/reports/QA3.md`. Message: `STEP QA3: e2e suite on the real app`. Not pushed.
