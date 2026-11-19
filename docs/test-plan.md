# Test plan: Northside Plumbing Tech Job Board

Owner: bl-qa · Step QA3 (adapts the QA1 plan to the app as built) · Sources: `docs/PRD.md`, `docs/user-stories.md` (101 acceptance criteria), `docs/user-flows.md`, `docs/openapi.yaml`, `docs/SECURITY_MODEL.md`, `docs/metrics-spec.md`, decisions 0004 and 0006. What "correct" means still comes from those documents, not from the code. The code was read only for routes, labels and API shapes.

**Status of this plan (2026-11-18):** the suite compiles (`npx playwright test --list`: 334 test cases across projects, TypeScript clean). **Nothing has been run against a live app yet.** The local run needs Supabase keys that QA cannot read, so the commands are in `.baseleap/reports/QA3.md` for Claude to run. Every verdict later points to `docs/qa-reports/latest-run.md` and the Playwright report.

## 1. How to read this plan

- **Find a test:** every test title starts with its AC id (or a named rule such as `SECURITY 8`, `FR-2`, `metrics:`). Run one with `npx playwright test -g "AC-007.4"`.
- **Spec files** (all under `tests/e2e/`): `smoke` · `signin` · `team` · `jobs` · `board` · `pwa` · `perf` · `loop` (browser) and `api/contract` · `api/permissions` · `api/team-audit-events` (HTTP only). Support code is in `tests/e2e/support/`. The guard has a unit test in `tests/api/e2e-guard.test.ts` (vitest).
- **Status column (QA3):**
  - **RUN** every test for this AC is live.
  - **PART** the part that the built API supports is live; the rest (screen, or an endpoint that is not built) is `fixme`.
  - **FIXME** all tests are `test.fixme(true, reason)`: written, kept, switched off with the reason in the report. Delete that one line when the thing exists. Reasons are in `tests/e2e/support/unbuilt.ts`.
  - **MANUAL / NONE / OUT** not testable black-box, see section 6.
- **Types:** `e2e` = browser flow · `API` = contract/black-box HTTP · `probe` = permission-boundary probe (qa-probe) · `fuzz` = boundary payload tables.
- **Viewports:** `M` = mobile 390 px · `D` = desktop 1280 px · `-` = no browser.
- **Roles:** O owner · A Tech A · B Tech B · X signed out · R removed member.
- **A pass on retry is reported FLAKY.** No test is skipped, weakened or given a longer timeout to get green. A change to a test is made only when it contradicts the PRD or contract, and is listed in section 10.
- **Smoke:** `@smoke` in a title puts the test in `npx playwright test --grep @smoke` (the staging job `qa-staging.yml`).

## 2. The app as built (what is live and what is `fixme`)

| Part | State | Consequence for tests |
|---|---|---|
| `GET /api/health`, `GET /api/me`, `GET /api/board`, `POST /api/jobs`, `PUT /api/jobs/{id}/status` | built | live (API project) |
| `GET /api/jobs/{id}`, `PATCH /api/jobs/{id}`, `POST /api/jobs/{id}/cancel`, `GET /api/technicians`, `/api/team` (GET, POST, remove), `POST /api/events` | not built | `fixme` (route answers 404 from the framework, which is not a permission decision and is never read as a pass) |
| Sign-in: `/auth/confirm`, the form on `/sign-in`, `src/proxy.ts` redirect, sign-out | not built (`/sign-in` and `/link-expired` are placeholders) | AC-001.* and every browser test that needs a session are `fixme` |
| Screens `/board`, `/team`, `/jobs/new`, `/jobs/{id}`, `/jobs/{id}/edit`, `/not-allowed`, `/offline` | placeholders (`placeholder-screen.tsx`) | UI tests `fixme` |
| PWA (manifest, `sw.js`, icons) | not built (no `public/`) | `pwa.spec` `fixme` |
| Security headers | set by `vercel.json` only | not applied by `next dev`: the header test runs on the staging preview and is skipped on the local stack (reason shown) |
| Database | audit rows and server events are written by triggers on `jobs` and `team_members` | job create and status-change audit/event tests are live |

Because `GET /api/jobs/{id}` does not exist, `getJob()` in `support/api.ts` reads the job back from its day's board (same data and same role filter). Switch it to the endpoint when it is built.

## 3. Rules that shape the suite

- **Targets.** Remote (default): `BASE_URL` is an https `*.vercel.app` preview or `STAGING_HOST`, never a host in `PRODUCTION_HOSTS`. Local (`E2E_TARGET=local`): `BASE_URL` is exactly `http://localhost:3000` or `http://127.0.0.1:3000` and the Supabase URL is `http://127.0.0.1:554xx`. In both, `PRODUCTION_HOSTS` is required, and the config and an auto-fixture refuse otherwise. `--list` is the only exemption. A local run is a pre-staging check; **release evidence is a staging run.**
- **Own tenant.** The `setup` project creates its own org `E2E <run id>` (`is_test = true`) with an owner, Tech A and Tech B on `example.test` addresses, using the service role, signs them in with a throwaway password (no email), and records ids and tokens in `tests/e2e/.auth/` (git-ignored). The `cleanup` project removes only what the manifest lists: auth users, and the org when the database allows (`is_test`, name `E2E …`, checked again). A user already removed counts as "already gone"; any other user error is logged (code and message, no ids or emails) and fails the cleanup test. Jobs cannot be deleted through the app (NG-6) and the audit log is append-only, so orgs are kept today and the report says so; ticket QA4-002 asks bl-backend for a service-role purge function.
- **No seeded accounts.** `E2E_OWNER_EMAIL` and friends from QA1 are no longer needed.
- **Unique data.** Every test makes its own uniquely titled data (`E2E <label> <run id>-<n>`) so a same-day rerun passes (AC-006.5).
- **Throwaway users.** Tests that sign a user out or remove one use a throwaway technician, so the three fixed sessions are never revoked.
- **Dropped connections** are simulated by aborting writes in the browser. A real network drop is not reproduced.
- **Selectors** follow `docs/design-specs.md` (labels, button words, roles, `aria-pressed`, `role="alertdialog"`). A wording change is one edit in `support/ui.ts`. They are unverified until the screens exist.
- **Time:** "today" always comes from `GET /api/me` (`org.today`), never from the runner's clock.
- **Secrets:** never printed. Tokens and passwords live only in memory and in `tests/e2e/.auth/`.

## 4. Coverage by acceptance criterion, ranked by risk

Risk: **Critical** = crossing it exposes data, loses data or opens a bypass (SECURITY_MODEL "Finding classes"). **High** = breaks the definition of done or a core rule. **Medium** = validation, error states, audit, ordering. **Low** = presentation, P2, or checks done by hand.
Test column: `file › title key`. `Data API` means the direct-PostgREST probes in `api/permissions`.

### 4.1 Critical (12)

| AC | Status | Test type | Spec › title key (what runs now) | Roles | View |
|---|---|---|---|---|---|
| AC-001.3 | FIXME | e2e + event check | signin › AC-001.3 (same message listed/unlisted; `listed=false`). Needs the sign-in form | X | M |
| AC-001.6 | FIXME | e2e | signin › AC-001.6 used link → expired screen; prefetch GET. Needs `/auth/confirm`. Expiry at 61 min: see 6 | X | M |
| AC-001.7 | PART | e2e + probe | permissions › signed-out `GET /me`, `GET /board`, `POST /jobs`, `PUT status` → 401 + malformed bearer (run). Signed-out page redirect, the unbuilt endpoints and `SECURITY 3` page gating: `fixme` | X | M |
| AC-002.6 | FIXME | e2e + probe | team › AC-002.6; permissions › FR-2 / AC-002.6. Needs the team API and screen | A | M, D |
| AC-003.9 | PART | e2e + probe | permissions › AC-003.9 `@smoke` (technician `POST /jobs` → 403, no job) runs; jobs › AC-003.9 (no New job control) `fixme` | A | M, D |
| AC-007.3 | PART | e2e + probe | permissions › AC-007.3 (PUT status on another tech's job → 403, unchanged) and the Data API probes run; the PATCH probe and the screen are `fixme` | A | M, D |
| AC-007.4 | PART | e2e + probe | Data API direct PATCH of title, address, assignee, start time, status, version, org_id, details runs (DB row checked); the 8 per-field `PATCH` probes, the mixed PATCH and the screen are `fixme` | A | M, D |
| AC-007.5 | PART | e2e + probe | permissions › AC-007.5 (technician cannot PUT Cancelled; cannot change a cancelled own job; Data API cancelled job) runs; PATCH variants and screen `fixme` | A | M, D |
| AC-009.2 | PART | e2e + probe | permissions › AC-009.2 (DELETE on every path → 405/404, rows remain; Data API DELETE of `jobs` and `team_members`) runs; "no delete control on 4 screens" and technician `POST cancel → 403` `fixme` | O, A | M, D |
| AC-011.1 | FIXME | e2e + API | team-audit-events › AC-011.1 (removed member gets 401 within 60 s); team › AC-011.1. Needs team API and sign-in | O, R | M, D |
| AC-011.4 | FIXME | e2e + probe | team › AC-011.4; permissions › AC-011.4 (403 `owner_cannot_be_removed`). Needs the team API | O | M, D |
| AC-006.6 | RUN | API | loop › AC-006.6 (job lives in an `is_test` org; its `job_created` event is `is_test`). Cross-org: permissions › `SECURITY invariant 8` (see below) | O | D |

Also Critical, not tied to one AC (run with the probes): `SECURITY 8` cross-org (live: PUT status on a foreign job → 404 and the DB row unchanged, owner and technician; assigning to a foreign technician → 422; foreign job absent from the board. `fixme`: GET/PATCH/cancel/remove/lists) · Data API reads of `audit_log`, `events`, `rate_limits` return nothing (live) · direct writes to `team_members` (role, is_active) change nothing (live) · direct INSERT of a job refused (live) · unknown body fields (`org_id`, `created_by`, `status`, `version`) rejected on `POST /jobs` (live; PATCH and `POST /team` variants `fixme`) · `SECURITY 12` service worker (`fixme`) · `SECURITY 14` frame-ancestors and nosniff headers (staging preview only).

### 4.2 High (41)

| AC | Status | Test type | Spec › title key (what runs now) | Roles | View |
|---|---|---|---|---|---|
| AC-001.1 | FIXME | e2e | signin › AC-001.1 | O | M |
| AC-001.2 | FIXME | e2e | signin › AC-001.2 (390 px, Technician role, no Team/New job) | A | M |
| AC-001.4 | FIXME | e2e | signin › AC-001.4 (case and spaces; `listed=true`) | X | M |
| AC-001.5 | FIXME | e2e | signin › AC-001.5 (second request in seconds) | X | M |
| AC-001.9 | FIXME | e2e | signin › AC-001.9 (own session; board then redirects) | A | M |
| AC-002.1 | FIXME | e2e + API | team › AC-002.1; team-audit-events › AC-002.1 | O | M, D |
| AC-002.2 | FIXME | e2e + API | team › AC-002.2; team-audit-events › AC-002.2 (list order) | O, new tech | M, D |
| AC-002.3 | FIXME | e2e + API | team › AC-002.3; team-audit-events › AC-002.3; permissions › AC-002.3 | O | M, D |
| AC-003.1 | PART | e2e + API | contract › AC-003.1 `@smoke` (Scheduled, version 1, permissions) runs; jobs › AC-003.1 (card on board) `fixme` | O | M, D |
| AC-003.2 | FIXME | e2e | jobs › AC-003.2 (customer name, phone, notes on the card) | O | M, D |
| AC-003.3 | PART | e2e + fuzz | contract › AC-003.3 (each missing field, blank title, empty address → 422) runs; jobs › AC-003.3 `fixme` | O | M, D |
| AC-003.6 | PART | e2e + API | contract › AC-003.6 `@smoke` (same `client_request_id` twice → one job, 200/201) runs; jobs › AC-003.6 (double tap) `fixme` | O | M, D |
| AC-003.8 | PART | e2e + API | contract › AC-003.8 (markup, emoji, line breaks returned exactly) runs; jobs › AC-003.8 (nothing runs on screen) `fixme` | O, A | M, D |
| AC-003.10 | FIXME | e2e + API | jobs › AC-003.10; team-audit-events › AC-011.3 / AC-003.10. Needs `/api/team` to remove a technician | O | M, D |
| AC-003.11 | FIXME | e2e | jobs › AC-003.11 (values kept; retry creates one job) | O | M, D |
| AC-004.1 | PART | e2e + API | contract › AC-004.1 `@smoke` (shape, no-store) and order tests run; board › AC-004.1 `fixme` | A | M |
| AC-004.2 | RUN | API | contract › AC-004.1 / .2 / .3 (three roles, same order) | B | - |
| AC-004.3 | PART | e2e + API | contract (same order for three roles) and permissions › AC-004.3 (permission flags per job) run; board › AC-004.3 `fixme` | O | M, D |
| AC-004.4 | FIXME | e2e | board › AC-004.4 (both tests) | A | M |
| AC-004.6 | RUN | API | contract › AC-004.6 (two jobs at one start time: created first listed first) | A, B | - |
| AC-004.8 | PART | e2e + API | contract › AC-004.8 (`/me` is Toronto; the board's default day is the server's date, hostile headers) runs; board › AC-004.8 (browser clock 22:00 Pacific) `fixme` | A | M |
| AC-004.11 | FIXME | e2e | board › AC-004.11 | A | M |
| AC-006.1 | FIXME | e2e | loop › AC-006.1 (three named steps; owner D, techs 390 px). Needs sign-in and screens | O, A, B | D, M |
| AC-006.3 | RUN | API | contract › AC-006.3 (3 tests: 200, `check=db`, bad param → 400); first two are `@smoke` | X | - |
| AC-006.5 | FIXME | e2e | loop › AC-006.5 (the loop twice in a row). The CI job must also run the whole suite twice | O, A, B | D, M |
| AC-007.1 | PART | e2e + API | contract › AC-007.1 / 007.6 `@smoke` (technician In progress, Done, back) runs; jobs › AC-007.1 `fixme` | A, O | M, D |
| AC-007.2 | FIXME | e2e + API | jobs › AC-007.2; contract › AC-007.2. Needs `PATCH` | A, B | M, D |
| AC-007.6 | PART | e2e + API | contract › AC-007.1 / 007.6 (any status to any); jobs › AC-007.6 `fixme` | A | M, D |
| AC-007.8 | PART | e2e + API | contract › AC-007.8 **status-only variant** (owner then technician with an old version → 409 `stale_version` with `current`) runs; the original (owner PATCH makes the other change) and the screen are `fixme` | A, O | M, D |
| AC-007.9 | PART | e2e + API | contract › AC-007.9 (one version step); team-audit-events › AC-007.9 (one audit row) run; jobs › AC-007.9 `fixme` | A | M, D |
| AC-008.1 | FIXME | e2e + API | jobs › AC-008.1; contract › AC-008.1. Needs `PATCH` | O | M, D |
| AC-008.2 | FIXME | e2e + API | jobs › AC-008.2; contract › AC-008.2. Needs `PATCH` | O, A, B | M, D |
| AC-008.3 | RUN | API | contract › AC-008.3 (owner sets any status) | O | - |
| AC-008.6 | FIXME | e2e + API | jobs › AC-008.6; contract › AC-008.6. Needs `PATCH` | O, A | M, D |
| AC-009.1 | PART | e2e + API | contract › AC-009.1 **via PUT status** (cancelled job keeps its place; `job_count` includes it) runs; the `POST /cancel` original and the screen are `fixme` | O | M, D |
| AC-009.4 | PART | e2e + API | contract › AC-009.4 **via PUT status** (restore; technician can change again) runs; `POST /cancel` original and screen `fixme` | O, A | M, D |
| AC-009.5 | PART | API | team-audit-events › AC-009.5 **via PUT status** (repeat cancel → one audit row) runs; contract › AC-009.5 (old-version `POST /cancel` → 200, version unchanged) `fixme` | O | - |
| AC-010.2 | PART | e2e + API | contract › AC-010.2 (job for 2026-11-17 on that day's board, not today's; range edges 2020-01-01 and 2100-12-31) runs; jobs › AC-010.2 `fixme` | O | M, D |
| AC-011.2 | FIXME | API | team-audit-events › AC-011.2 (`is_active:false` on past jobs). Needs `/api/team` to remove | O, A | - |
| AC-011.3 | FIXME | API | team-audit-events › AC-011.3 / AC-003.10; contract › AC-008.5 / AC-011.3. Needs team and technicians | O | - |
| AC-011.5 | FIXME | e2e + API | team › AC-011.5; team-audit-events › AC-011.5 | O | M, D |

### 4.3 Medium (31)

| AC | Status | Test type | Spec › title key (what runs now) | Roles | View |
|---|---|---|---|---|---|
| AC-002.4 | FIXME | e2e + fuzz | team › AC-002.4; team-audit-events › AC-002.4 | O | M, D |
| AC-002.5 | FIXME | e2e + fuzz | team › AC-002.5; team-audit-events › AC-002.5 (60/61, 254/255) | O | M, D |
| AC-002.7 | FIXME | e2e | team › AC-002.7 | O | M, D |
| AC-002.8 | FIXME | API (audit read) | team-audit-events › AC-002.8 | O | - |
| AC-003.4 | PART | fuzz + e2e | contract › AC-003.4 (100/101, 100/101, 200/201, 2000/2001, code points) runs; jobs › AC-003.4 `fixme` | O | M, D |
| AC-003.5 | PART | fuzz + e2e | contract › AC-003.5 (5 bad, 6 good phones) runs; jobs › AC-003.5 `fixme`. **Open spec gap QA4-001:** the blank `""` and `"   "` cases fail because the contract pattern rejects them; the tests are unchanged until the contract or AC is settled. | O | M, D |
| AC-003.7 | PART | e2e + API | contract › AC-003.7 (00:01 accepted, listed in time order) runs; jobs › AC-003.7 `fixme` | O | M, D |
| AC-003.12 | RUN | API (audit read) | team-audit-events › AC-003.12 (`job.created`, actor, time, no personal data) | O | - |
| AC-004.5 | PART | e2e + API | contract › AC-004.5 / 010.5 (empty day → 200, `job_count` 0) runs; board › AC-004.5 `fixme` | A | M |
| AC-004.7 | PART | e2e + API | contract › AC-004.7 (50 jobs, one response, none cut off) runs; board › AC-004.7 `fixme` | O, B | D |
| AC-004.9 | FIXME | e2e | board › AC-004.9 (Refresh button) | A | M |
| AC-004.10 | FIXME | e2e | board › AC-004.10 | A | M |
| AC-007.7 | FIXME | e2e + API | jobs › AC-007.7; contract › AC-007.7. Needs `PATCH` | A | M, D |
| AC-007.10 | FIXME | e2e | jobs › AC-007.10 (note and status tap) | A | M, D |
| AC-007.11 | RUN | API (audit read) | team-audit-events › AC-007.11 (`job.status_changed`, actor, time, old and new status) | A | - |
| AC-008.4 | FIXME | e2e + API | jobs › AC-008.4; contract › AC-008.4. Needs `PATCH` | O | M, D |
| AC-008.5 | FIXME | e2e + API | jobs › AC-008.5; team-audit-events › AC-008.5; contract › AC-008.5. Needs technicians and team | O | M, D |
| AC-008.7 | FIXME | e2e | jobs › AC-008.7 | O | M, D |
| AC-008.8 | FIXME | API (audit read) | team-audit-events › AC-008.8 (field names, never values). Needs `PATCH` | O | - |
| AC-009.3 | FIXME | e2e | jobs › AC-009.1 / AC-009.3 (No leaves the job unchanged) | O | M, D |
| AC-009.6 | FIXME | e2e | jobs › AC-009.6 | O | M, D |
| AC-010.1 | PART | e2e + API | contract › AC-010.1 (given date: `is_today` false, today still reported) runs; board › AC-010.1 `fixme` | A | M |
| AC-010.3 | PART | e2e + API | contract › AC-010.3 (technician reads a past day with notes; cannot create → 403) runs; board › AC-010.3 `fixme` | A, B | M |
| AC-010.4 | FIXME | e2e | board › AC-010.3 / AC-010.4 | A | M |
| AC-010.5 | PART | e2e + API | contract › AC-004.5 / AC-010.5 (empty other day) runs; board › AC-010.5 `fixme` | A | M |
| AC-010.6 | PART | e2e + fuzz | contract › AC-010.6 (5 bad dates → 422 `invalid_date`; `GET /board?date=` bad → 4xx; 2 edge dates) runs; jobs › AC-010.6 `fixme` | O | M, D |
| AC-010.7 | PART | e2e + API | contract › AC-010.7 (2027-03-14: 08:00 before 09:00, no conversion) runs; board › AC-010.7 `fixme` | O | D |
| AC-010.8 | FIXME | e2e | board › AC-010.8 | A | M |
| AC-011.6 | FIXME | e2e | team › AC-011.6 | O | M, D |
| AC-011.7 | FIXME | e2e | team › AC-011.7 | O | M, D |
| AC-006.4 | RUN | meta | loop › AC-006.4 (steps are named "Step 1/2/3"). The non-zero exit code is Playwright's own; Phase 3 confirms with one deliberately broken run, see 6 | - | - |

Metrics checklist (`docs/metrics-spec.md`): **live** `job_created` once on a double submit, `lead_days` 0 and `job_date − today` · `job_status_changed` from/to and actor role, once on a repeated cancel · PII sweep over every event written by the run · `is_test` on e2e events. **`fixme`** `job_reassigned`, `job_updated` (field names only), `team_member_added` / `removed`, `POST /events` (two client events only, extra fields rejected, 401 signed out, 429 after 120/hour), `signin_link_requested`. `signin_completed` and `board_viewed` / `board_load_failed` are Phase 3 additions once the client code exists.

### 4.4 Low (17)

| AC | Status | Test type | Spec › title key | Roles | View |
|---|---|---|---|---|---|
| AC-001.8 | NONE, see 6 | needs a way to make the mail provider fail | - | - | - |
| AC-001.10 | FIXME | e2e (proxy) | signin › AC-001.10 (auth cookie ≥ 29 days, Secure, SameSite=Lax) | A | M |
| AC-004.12 | FIXME | e2e (perf) | perf › AC-004.12 (30 jobs, CDP 1.6 Mbps / 150 ms, ≤ 2 s, no raised timeout) | A | M |
| AC-004.13 | FIXME | e2e | board › AC-004.13 (every control ≥ 44 × 44; text ≥ 16 px; board and job detail) | A | M |
| AC-005.1 | FIXME | e2e | pwa › AC-005.1 (manifest, standalone, `/board` start, 192/512 icons, worker registers) | A | M |
| AC-005.2 | FIXME, partly manual | e2e | pwa › AC-005.2 (metadata only). Full-screen launch on a device is manual | - | M |
| AC-005.3 | FIXME, partly manual | e2e | pwa › AC-005.3 (touch icon resolves). Add to Home Screen on an iPhone is manual | - | M |
| AC-005.4 | MANUAL | real iPhone, installed app, type the 6-digit code. Named in the PRD as not covered by `npm run e2e` | - | - | - |
| AC-005.5 | FIXME | e2e | pwa › AC-005.5 (offline screen, Retry, no job data); SECURITY 12 cache check | A | M |
| AC-006.2 | OUT, see 6 | production run | - | - | - |
| AC-012.1 | FIXME (P2) | e2e | board › AC-012.1 / AC-012.2 | A | M |
| AC-012.2 | FIXME (P2) | e2e | board › AC-012.1 / AC-012.2 | A | M |
| AC-012.3 | FIXME (P2) | e2e | board › AC-012.3 | A | M |
| AC-012.4 | FIXME (P2) | e2e | board › AC-012.1 / AC-012.2 (checks `#` and `&` survive) | A | M |
| AC-013.1 | FIXME (P2) | e2e | board › AC-013.1 | A | M |
| AC-013.2 | FIXME (P2) | e2e | board › AC-013.2 | A | M |
| AC-013.3 | FIXME (P2) | e2e | board › AC-013.3 | A | M |

P2 stories are not in the approved scope (`docs/user-flows.md`). They are `fixme` until built; the report says "not built", never "passed" or "bug".

### 4.5 Totals (101 ACs)

| Status | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| RUN | 1 | 4 | 3 | 0 | **8** |
| PART | 6 | 15 | 10 | 0 | **31** |
| FIXME | 5 | 22 | 18 | 14 | **59** |
| MANUAL / NONE / OUT | 0 | 0 | 0 | 3 | **3** |

Failing: **not known, the suite has not been run.** The first run produces the failing column.

## 5. Run order

1. `setup` project: create the e2e org, owner, Tech A and Tech B; sign in; record ids, tokens and the org date.
2. `api` project: contract → permissions → team/audit/events. Permission failures are reported first.
3. `mobile` then `desktop` projects: smoke, then flows (almost all `fixme` today).
4. `cleanup` project: removes what the manifest lists.
5. Fuzz per role (Phase 3, see 7).
6. Repeat the whole suite once more to prove AC-006.5.
Run the `POST /events` rate-limit test last and no more than once an hour: it spends Tech B's event budget (120/hour). Today it is `fixme`.

## 6. Not fully testable black-box (and what covers the gap)

| AC | Why | Cover |
|---|---|---|
| AC-001.3 "no email is sent" | No inbox is read (decision 0004). | The server's `signin_link_requested` event shows `listed=false` with no member. Residual: SMTP behaviour itself is unobserved. |
| AC-001.6 link older than 61 minutes | A one-time token cannot be aged from outside. | Used-once and prefetch cases are tested. Expiry needs a short-lived OTP setting on the preview branch, or a devops-assisted check once. |
| AC-001.8 email service unavailable | Needs the provider to fail on demand. | Devops drill on staging (revoke the SMTP key on a preview branch), run by hand, result recorded in the run report. |
| AC-001.10 29 days | Cannot wait 29 days or move the server clock. | Cookie lifetime proxy. Middleware cap is checked by bl-security. |
| AC-004.8 | Cannot change the server clock. | Browser clock set to 22:00 Pacific and server date compared with `/me`. |
| AC-004.12 | Real 4G and a real phone are not available. | CDP throttling in Chromium. A miss near the budget is reported with numbers, not treated as flaky. |
| AC-005.2, 005.3, 005.4 | Needs a real Android/iPhone home screen. | Manifest and icon checks only. AC-005.4 is manual (PRD says so). |
| AC-006.2 production run | QA runs on staging (and the local stack) only. | A devops CI job runs the same suite against production with a production-only guard. This config deliberately cannot do it. See Q2. |
| AC-006.4 non-zero exit naming the step | Exit code is the runner's. | Steps are named. Phase 3 does one deliberate failure to see the exit code and output. |
| AC-002.8, 003.12, 007.11, 008.8 | `audit_log` has no API or client access (matrix). | Service-role read, read-only. Asserts actor, action, time, field names and no personal data. Audit details keys are asserted loosely until a spec fixes them (Q4); the job rows now written by the database show `from_status`/`to_status` and `fields_changed`. |
| "Connection drops" criteria | A real network cut is not reproduced. | Writes aborted in the browser; the board-load failures abort the board request. |
| Security headers on the local stack | `vercel.json` headers are applied by Vercel, not by `next dev`. | The headers test runs on the staging preview and is skipped on `E2E_TARGET=local`. |

## 7. Fuzz (qa-fuzz)

`tests/fuzz/**` is not an owned file of this step. Boundary payload tables are already in `api/contract` (lengths at limit ±1, code points, phones, dates, times, unknown fields, malformed JSON) and the Data API probes in `api/permissions`. Phase 3: add `tests/fuzz/run.sh` driving a schema-based fuzzer from `docs/openapi.yaml` once per role (O, A, B), asserting no 5xx, no SQL or stack text in problem+json, and no response outside the matrix.

## 8. Questions for the owners of the contract (raised, not decided)

| # | Question | Owner |
|---|---|---|
| Q1 | AC-006.1 names `npm run e2e` but `package.json` has no such script, and QA does not own that file. Needs `"e2e": "playwright test"` (the setup and cleanup projects run automatically as dependencies). Also `npm run e2e:local` could wrap `tests/e2e/run-local.sh`. | backend / devops |
| Q2 | The PRD wants the same suite on production (AC-006.2), QA's rules forbid pointing it there. Devops needs a separate production job. Confirm who owns it. | orchestrator |
| Q3 | The board's day is chosen by a date input in tests (`input[type=date]`). If the day is also in the URL (`/board?date=`), say so in `openapi.yaml`/architecture so tests can deep-link. | frontend / architect |
| Q4 | `audit_log.details` keys: the migration writes `from_status`/`to_status`, `fields_changed`, `from_member_id`/`to_member_id`, `assigned_member_id`/`job_date`. Please record this shape in `docs/architecture.md` so QA can assert exact keys. | architect |
| Q5 | Screen addresses used: `/sign-in`, `/link-expired`, `/board`, `/team`, `/jobs/new`, `/jobs/{id}`, `/jobs/{id}/edit`, `/offline`, `/sw.js`, manifest via `<link rel="manifest">`. All route files exist. Confirm they are stable. | frontend |
| Q6 | The sign-in Server Actions are outside `openapi.yaml`, so their rate limits can be probed only through the UI. A documented endpoint would allow API probes. | architect |
| Q7 | "No jobs today" cannot be asserted against a shared org. The test empties the board response in the browser; if the board is server-rendered that stub will not apply. | frontend |
| Q8 | Which of the unbuilt endpoints land next? QA turns the matching `fixme` groups on in the order they merge (`GET/PATCH /jobs/{id}`, `/cancel`, `/technicians`, `/team`, `/events`, then sign-in and screens). | orchestrator |
| Q9 | `GET /api/health?check=db` calls PostgREST's root with the anon key. If a staging project restricts that, the smoke test `AC-006.3 … check=db` fails for a reason that is not the app. Confirm it works on staging. | devops |

## 9. Test data

Created per test through the API (`createJob`) with unique titles and `example.test` emails; the e2e org and its three users are created by `setup` and removed by `cleanup`. Fixed dates used: today (from `/me`) ± small offsets; 2026-11-17 (AC-010.2, lead days); 2027-03-14 (AC-010.7); 2099-06-15 and `today + 2500` days for empty days; `today + 40…62` days for ordering, 50-job and 30-job days. Nothing outside the manifest is deleted. Real customer data and third-party APIs are never used.

## 10. Changes from the QA1 specs (what moved and why)

| Change | Why |
|---|---|
| Guard has a local mode (`E2E_TARGET=local`, `localhost:3000`, Supabase `127.0.0.1:554xx`); `PRODUCTION_HOSTS` is still required | The step asks for a local run first. Staging rules are unchanged. |
| Setup creates its own org and users (service role) and `cleanup` removes them; no `E2E_*_EMAIL` | Step rule: never touch data it did not create. |
| API contexts send `Authorization: Bearer <token>` instead of the browser cookie | The app has no sign-in route yet. `bearerAuth` is in `openapi.yaml`. |
| `getJob()` reads the job from its day's board | `GET /api/jobs/{id}` is not built. |
| Cancelled jobs are made with `PUT /status` (owner) in the live tests; the `POST /cancel` originals are kept as `fixme` | `POST /cancel` is not built; the matrix lets the owner set Cancelled. |
| AC-007.8 has a status-only variant (live) beside the original (`fixme`) | The original needs `PATCH`. |
| Data API probes read the database column `details` (the API's `notes`), compare `version` and `org_id` too | The migration renamed the column; the old check could never fail. |
| Audit/event PII regexes strip uuids and dates first | A run of digits inside a uuid could match the phone pattern (flaky false failure). |
| `permissions.spec` is no longer `serial` | In serial mode one failed probe skips the others; a crossed boundary must not hide more. |
| Security-header check is skipped on the local stack | `vercel.json` headers are applied by Vercel only. |
| New `smoke.spec.ts`, `@smoke` tags, `tests/api/e2e-guard.test.ts` | The staging job runs `--grep @smoke`; the guard needs a permanent test. |

No test was weakened or deleted: each assertion that moved to `fixme` is unchanged and still in its file.
