# Test plan: Northside Plumbing Tech Job Board

Owner: bl-qa · Step QA1 (Phase 2, authored before the app exists) · Sources: `docs/PRD.md`, `docs/user-stories.md` (101 acceptance criteria), `docs/user-flows.md`, `docs/openapi.yaml`, `docs/SECURITY_MODEL.md`, `docs/metrics-spec.md`, decisions 0004 and 0006. The code was not read to decide what "correct" means.

Nothing here has been run. There is no staging deployment yet. Every verdict later points to `docs/qa-reports/latest-run.md` and the Playwright report.

## 1. How to read this plan

- **Find a test:** every test title starts with its AC id (or a named rule such as `SECURITY 8`, `FR-2`, `metrics:`). Run one with `npx playwright test -g "AC-007.4"`.
- **Spec files** (all under `tests/e2e/`): `signin` · `team` · `jobs` · `board` · `pwa` · `perf` · `loop` (browser flows) and `api/contract` · `api/permissions` · `api/team-audit-events` (HTTP only). Support code is in `tests/e2e/support/`.
- **Types:** `e2e` = browser flow · `API` = contract/black-box HTTP · `probe` = permission-boundary probe (qa-probe) · `fuzz` = boundary payload tables (qa-fuzz; schema-driven fuzz proper is Phase 3, see 7).
- **Viewports:** `M` = mobile 390 px · `D` = desktop 1280 px · `-` = no browser. Specs that need a phone run in M only. Sign-in, PWA and perf specs run in M only because sign-in requests share a per-IP rate limit (10 per 15 min).
- **Roles:** O owner · A Tech A · B Tech B · X signed out · R removed member.
- **A pass on retry is reported FLAKY.** No test is skipped, weakened or given a longer timeout to get green.

## 2. What staging needs (blocking Phase 3)

| Need | Detail | Owner |
|---|---|---|
| Staging preview URL | `BASE_URL`, an https `*.vercel.app` preview or the single `STAGING_HOST`. | orchestrator / devops |
| Production host list | `PRODUCTION_HOSTS` (comma list, every alias). **Required**: with it unset the suite refuses to run, because production is also a `*.vercel.app` address. | devops |
| Deployment Protection bypass | `VERCEL_AUTOMATION_BYPASS_SECRET`, sent as header `x-vercel-protection-bypass`. | devops |
| E2E tenant | The "Baseleap E2E" org (`is_test = true`) bootstrapped on staging with an owner and two technicians on `example.test` addresses: `E2E_OWNER_EMAIL`, `E2E_TECH_A_EMAIL`, `E2E_TECH_B_EMAIL` (decision 0004). Tests add their own throwaway technicians; Tech C does not need seeding. | devops (bootstrap script) |
| Sign-in without email | CI-only `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` for the staging Supabase (preview branch). The helper refuses emails outside an `is_test` org. `SUPABASE_PROD_PROJECT_REF` must be set; the suite refuses a URL containing it. | devops |
| Direct Data API probes | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (staging). | devops |
| Test inbox | **Not needed.** No email is read. "A link is sent / not sent" is asserted from the server's own `signin_link_requested` event (`listed` true/false), read with the service role. Listed requests still send real mail through the staging SMTP to `example.test`; devops should route that to a sink so it does not burn the daily send cap. | devops |
| Audit and event reads | The service role reads `audit_log` and `events` (read-only) for AC-002.8, AC-003.12, AC-007.11, AC-008.8 and the metrics checklist. Allowed in `tests/e2e/**` by SECURITY_MODEL invariant 2. | - |
| Second tenant for cross-org probes | Created and cleaned up by the suite in the staging database (`is_test` org, one owner, one tech, one job). Its job rows stay (NG-6) and are invisible to Northside. | - |
| `npm run e2e` | AC-006.1 names it. `package.json` has no `e2e` script and QA does not own that file. See question Q1. | backend / devops |

## 3. Rules that shape the suite

- Staging preview only: `playwright.config.ts` and an auto-fixture in `support/fixtures.ts` throw on production hosts, non-https URLs, local servers and any host that is not a Vercel preview or `STAGING_HOST`. `--list` is the only exemption (it runs nothing).
- Every test makes its own uniquely titled data (`E2E <label> <run id>-<n>`) so a same-day rerun passes (AC-006.5). Jobs cannot be deleted; they stay in the `is_test` org.
- Tests that sign a user out (AC-001.9) or remove one use a throwaway technician, so the three fixed sessions are never revoked.
- Dropped-connection criteria are simulated by aborting writes in the browser (`dropWrites`). A real network drop is not reproduced.
- Selectors follow `docs/design-specs.md` (labels, button words, roles, `aria-pressed`, `role="alertdialog"`). A wording change is one edit in `support/ui.ts`.
- Time: "today" always comes from `GET /api/me` (`org.today`), never from the runner's clock.

## 4. Coverage by acceptance criterion, ranked by risk

Risk: **Critical** = crossing it exposes data, loses data or opens a bypass (SECURITY_MODEL "Finding classes"). **High** = breaks the definition of done or a core rule. **Medium** = validation, error states, audit, ordering. **Low** = presentation, P2, or checks done by hand.
Test column: `file › title key`. A key in square brackets is the supporting API or probe test; `Data API` means the direct-PostgREST probes in `api/permissions`.

### 4.1 Critical

| AC | Test type | Spec › title key | Roles | View |
|---|---|---|---|---|
| AC-001.3 | e2e + event check | signin › AC-001.3 (same message listed/unlisted; `listed=false`, no member, no address on the event) | X | M |
| AC-001.6 | e2e | signin › AC-001.6 used link → expired screen, no session; prefetch GET does not use the token up. Expiry at 61 min: see 6 | X | M |
| AC-001.7 | e2e + probe | signin › AC-001.7; permissions › AC-001.7 / FR-2 (12 signed-out calls → 401, no data); `SECURITY 3` all pages auth-gated | X | M |
| AC-002.6 | e2e + probe | team › AC-002.6; permissions › FR-2 / AC-002.6 (GET/POST team, technicians, remove → 403, team unchanged) | A | M, D |
| AC-003.9 | e2e + probe | jobs › AC-003.9; permissions › AC-003.9 (POST /jobs → 403, no job) | A | M, D |
| AC-007.3 | e2e + probe | jobs › AC-007.3; permissions › AC-007.3 (PATCH/PUT on another tech's job → 403, unchanged); Data API (other tech's job) | A | M, D |
| AC-007.4 | e2e + probe | jobs › AC-007.4; permissions › AC-007.4 (8 fields one by one + mixed PATCH refused whole); Data API direct PATCH of title, address, assignee, start time, status, version, org_id | A | M, D |
| AC-007.5 | e2e + probe | jobs › AC-007.5; permissions › AC-007.5 (cannot set Cancelled; cannot touch a cancelled job); Data API cancelled job | A | M, D |
| AC-009.2 | e2e + probe | jobs › AC-009.2 (no delete control on 4 screens); permissions › AC-009.2 (DELETE on every path → 405/404; Data API DELETE jobs and team_members; rows remain) | O, A | M, D |
| AC-011.1 | e2e + API | team-audit-events › AC-011.1 (removed member gets 401 within 60 s, polled each second; board redirects to sign-in); team › AC-011.1 | O, R | M, D |
| AC-011.4 | e2e + probe | team › AC-011.4; permissions › AC-011.4 (403 `owner_cannot_be_removed`) | O | M, D |
| AC-006.6 | API | loop › AC-006.6 (job lives in an `is_test` org; its `job_created` event is `is_test`). Cross-org isolation itself: permissions › `SECURITY invariant 8` (5 probes) | O | D |

Also Critical, not tied to one AC (run with the probes): `SECURITY 8` cross-org read/write → 404 and DB row unchanged · Data API reads of `audit_log`, `events`, `rate_limits` return nothing · direct writes to `team_members` (role, is_active) change nothing · a second owner cannot be added · unknown body fields (`org_id`, `created_by`) are rejected · `SECURITY 12` service worker caches no `/api/` or job page · `SECURITY 14` no-store and frame-ancestors headers.

### 4.2 High

| AC | Test type | Spec › title key | Roles | View |
|---|---|---|---|---|
| AC-001.1 | e2e | signin › AC-001.1 | O | M |
| AC-001.2 | e2e | signin › AC-001.2 (390 px, Technician role, no Team/New job) | A | M |
| AC-001.4 | e2e | signin › AC-001.4 (case and spaces; `listed=true` for that member) | X | M |
| AC-001.5 | e2e | signin › AC-001.5 (second request in seconds: stricter than 20 s) | X | M |
| AC-001.9 | e2e | signin › AC-001.9 (own session; board then redirects) | A | M |
| AC-002.1 | e2e + API | team › AC-002.1; team-audit-events › AC-002.1 | O | M, D |
| AC-002.2 | e2e + API | team › AC-002.2 (owner adds, the new technician signs in by link and sees the board); team-audit-events › AC-002.2 (list order) | O, new tech | M, D |
| AC-002.3 | e2e + API | team › AC-002.3; team-audit-events › AC-002.3; permissions › AC-002.3 (cross-org email gets the same 409, no hint) | O | M, D |
| AC-003.1 | e2e + API | jobs › AC-003.1; contract › AC-003.1 | O | M, D |
| AC-003.2 | e2e | jobs › AC-003.2 | O | M, D |
| AC-003.3 | e2e + fuzz | jobs › AC-003.3; contract › AC-003.3 | O | M, D |
| AC-003.6 | e2e + API | jobs › AC-003.6; contract › AC-003.6 (same `client_request_id` twice → one job) | O | M, D |
| AC-003.8 | e2e + API | jobs › AC-003.8 (nothing runs, line breaks kept); contract › AC-003.8 | O, A | M, D |
| AC-003.10 | e2e + API | jobs › AC-003.10; team-audit-events › AC-011.3 / AC-003.10 | O | M, D |
| AC-003.11 | e2e | jobs › AC-003.11 (values kept; retry creates one job) | O | M, D |
| AC-004.1 | e2e + API | board › AC-004.1; contract › AC-004.1 (order; shape; no-store) | A | M |
| AC-004.2 | API | contract › AC-004.1 / AC-004.2 / AC-004.3 (three roles, same order) | B | - |
| AC-004.3 | e2e + API | board › AC-004.3; permissions › AC-004.3 (permission flags per job) | O | M, D |
| AC-004.4 | e2e | board › AC-004.4 (both tests) | A | M |
| AC-004.6 | API | contract › AC-004.6 | A, B | - |
| AC-004.8 | e2e + API | board › AC-004.8 (browser clock 22:00 Pacific); contract › AC-004.8 (server date, hostile headers) | A | M |
| AC-004.11 | e2e | board › AC-004.11 | A | M |
| AC-006.1 | e2e | loop › AC-006.1 (three named steps; owner D, techs 390 px) | O, A, B | D, M |
| AC-006.3 | API | contract › AC-006.3 (3 tests: 200, `check=db`, bad param is 400) | X | - |
| AC-006.5 | e2e | loop › AC-006.5 (the loop twice in a row). The CI job must also run the whole suite twice | O, A, B | D, M |
| AC-007.1 | e2e + API | jobs › AC-007.1; contract › AC-007.1 | A, O | M, D |
| AC-007.2 | e2e + API | jobs › AC-007.2; contract › AC-007.2 | A, B | M, D |
| AC-007.6 | e2e + API | jobs › AC-007.6; contract › AC-007.6 | A | M, D |
| AC-007.8 | e2e + API | jobs › AC-007.8; contract › AC-007.8 (409 `stale_version` with `current`) | A, O | M, D |
| AC-007.9 | e2e + API | jobs › AC-007.9; contract › AC-007.9 (one version step); team-audit-events › AC-007.9 (one audit row) | A | M, D |
| AC-008.1 | e2e + API | jobs › AC-008.1; contract › AC-008.1 | O | M, D |
| AC-008.2 | e2e + API | jobs › AC-008.2; contract › AC-008.2 | O, A, B | M, D |
| AC-008.3 | API | contract › AC-008.3 | O | - |
| AC-008.6 | e2e + API | jobs › AC-008.6; contract › AC-008.6 | O, A | M, D |
| AC-009.1 | e2e + API | jobs › AC-009.1 / AC-009.3; contract › AC-009.1 (keeps its place, `job_count` includes it) | O | M, D |
| AC-009.4 | e2e + API | jobs › AC-009.4; contract › AC-009.4 | O, A | M, D |
| AC-009.5 | API | contract › AC-009.5 (old version, still cancelled, no version step); team-audit-events › AC-009.5 (one row) | O | - |
| AC-010.2 | e2e + API | jobs › AC-010.2; contract › AC-010.2 | O | M, D |
| AC-011.2 | API | team-audit-events › AC-011.2 (`is_active:false` on past jobs). The "(removed)" label on screen is checked in Phase 3 once the card markup exists | O, A | - |
| AC-011.3 | API | team-audit-events › AC-011.3 / AC-003.10; contract › AC-008.5 / AC-011.3 | O | - |
| AC-011.5 | e2e + API | team › AC-011.5; team-audit-events › AC-011.5 (200 `reactivated:true`, same id) | O | M, D |

### 4.3 Medium

| AC | Test type | Spec › title key | Roles | View |
|---|---|---|---|---|
| AC-002.4 | e2e + fuzz | team › AC-002.4; team-audit-events › AC-002.4 | O | M, D |
| AC-002.5 | e2e + fuzz | team › AC-002.5; team-audit-events › AC-002.5 (60/61, 254/255) | O | M, D |
| AC-002.7 | e2e | team › AC-002.7 | O | M, D |
| AC-002.8 | API (audit read) | team-audit-events › AC-002.8 | O | - |
| AC-003.4 | fuzz + e2e | contract › AC-003.4 (100/101, 100/101, 200/201, 2000/2001 and code points); jobs › AC-003.4 | O | M, D |
| AC-003.5 | fuzz + e2e | contract › AC-003.5 (5 bad, 6 good phones); jobs › AC-003.5 | O | M, D |
| AC-003.7 | e2e + API | jobs › AC-003.7; contract › AC-003.7 | O | M, D |
| AC-003.12 | API (audit read) | team-audit-events › AC-003.12 | O | - |
| AC-004.5 | e2e + API | board › AC-004.5 (response emptied in the browser); contract › AC-004.5 | A | M |
| AC-004.7 | e2e + API | board › AC-004.7 (50 cards, no page 2); contract › AC-004.7 | O, B | D |
| AC-004.9 | e2e | board › AC-004.9 (Refresh button, then card appears) | A | M |
| AC-004.10 | e2e | board › AC-004.10 | A | M |
| AC-007.7 | e2e + API | jobs › AC-007.7; contract › AC-007.7 | A | M, D |
| AC-007.10 | e2e | jobs › AC-007.10 (note and status tap) | A | M, D |
| AC-007.11 | API (audit read) | team-audit-events › AC-007.11 | A | - |
| AC-008.4 | e2e + API | jobs › AC-008.4; contract › AC-008.4 | O | M, D |
| AC-008.5 | e2e + API | jobs › AC-008.5; team-audit-events › AC-008.5; contract › AC-008.5 | O | M, D |
| AC-008.7 | e2e | jobs › AC-008.7 | O | M, D |
| AC-008.8 | API (audit read) | team-audit-events › AC-008.8 (field names, never values); AC-008.2 reassignment row | O | - |
| AC-009.3 | e2e | jobs › AC-009.1 / AC-009.3 (No leaves the job unchanged) | O | M, D |
| AC-009.6 | e2e | jobs › AC-009.6 | O | M, D |
| AC-010.1 | e2e + API | board › AC-010.1; contract › AC-010.1 | A | M |
| AC-010.3 | e2e + API | board › AC-010.3 / AC-010.4; contract › AC-010.3 | A, B | M |
| AC-010.4 | e2e | board › AC-010.3 / AC-010.4 | A | M |
| AC-010.5 | e2e | board › AC-010.5 | A | M |
| AC-010.6 | e2e + fuzz | jobs › AC-010.6; contract › AC-010.6 (5 bad dates, 2 edge dates) | O | M, D |
| AC-010.7 | e2e + API | board › AC-010.7; contract › AC-010.7 (decision 0006: no time conversion) | O | D |
| AC-010.8 | e2e | board › AC-010.8 | A | M |
| AC-011.6 | e2e | team › AC-011.6 | O | M, D |
| AC-011.7 | e2e | team › AC-011.7 | O | M, D |
| AC-006.4 | meta | loop › AC-006.4 (steps are named "Step 1/2/3"). The non-zero exit code is Playwright's own behaviour; Phase 3 confirms it with one deliberately broken run, see 6 | - | - |

Metrics checklist (`docs/metrics-spec.md`), run as API tests with audit/event reads: `signin_link_requested` (listed true / false, no address) · `job_created` once on a double submit, `lead_days` · `job_status_changed` from/to, once on re-cancel · `job_reassigned`, `job_updated` (field names only) · `team_member_added` / `team_member_removed` · PII sweep over every event written by the run · `is_test` on e2e events · `POST /events` accepts only the two client events, rejects extra fields, 401 signed out, 429 after 120/hour. `signin_completed` and `board_viewed` / `board_load_failed` are Phase 3 additions once the client code exists (the checklist needs a real page load and an offline queue).

### 4.4 Low

| AC | Test type | Spec › title key | Roles | View |
|---|---|---|---|---|
| AC-001.8 | **no test, see 6** | needs a way to make the mail provider fail | - | - |
| AC-001.10 | e2e (proxy) | signin › AC-001.10 (auth cookie lives ≥ 29 days, Secure, SameSite=Lax) | A | M |
| AC-004.12 | e2e (perf) | perf › AC-004.12 (30 jobs, CDP 1.6 Mbps / 150 ms, ≤ 2 s, no raised timeout) | A | M |
| AC-004.13 | e2e | board › AC-004.13 (every control ≥ 44 × 44; text ≥ 16 px; board and job detail) | A | M |
| AC-005.1 | e2e | pwa › AC-005.1 (manifest, standalone, `/board` start, 192/512 icons resolve, worker registers). Lighthouse run by hand in Phase 3 | A | M |
| AC-005.2 | **partly manual** | pwa › AC-005.2 (metadata only). Full-screen launch on a device is manual | - | M |
| AC-005.3 | **partly manual** | pwa › AC-005.3 (touch icon resolves). Add to Home Screen on an iPhone is manual | - | M |
| AC-005.4 | **manual only** | real iPhone, installed app, type the 6-digit code. Named in the PRD as not covered by `npm run e2e` | - | - |
| AC-005.5 | e2e | pwa › AC-005.5 (offline screen, Retry, no job data); SECURITY 12 cache check | A | M |
| AC-006.2 | **out of QA scope, see 6** | production run | - | - |
| AC-012.1 | e2e (P2) | board › AC-012.1 / AC-012.2 | A | M |
| AC-012.2 | e2e (P2) | board › AC-012.1 / AC-012.2 | A | M |
| AC-012.3 | e2e (P2) | board › AC-012.3 | A | M |
| AC-012.4 | e2e (P2) | board › AC-012.1 / AC-012.2 (checks `#` and `&` survive) | A | M |
| AC-013.1 | e2e (P2) | board › AC-013.1 | A | M |
| AC-013.2 | e2e (P2) | board › AC-013.2 | A | M |
| AC-013.3 | e2e (P2) | board › AC-013.3 | A | M |

P2 stories are not in the approved scope (`docs/user-flows.md`). If they are not built, those tests will fail; the report will say "not built", not "passed" and not "bug".

## 5. Run order (Phase 3)

1. `setup` project: sign in O, A, B by one-time link; record member ids and org date.
2. `api` project: contract → permissions → team/audit/events. Permission failures are reported first.
3. `mobile` then `desktop` projects: flows.
4. Fuzz per role (Phase 3, see 7).
5. Repeat the whole suite once more to prove AC-006.5.
Run `api/team-audit-events` rate-limit test last and no more than once an hour: it spends Tech B's event budget (120/hour).

## 6. Not fully testable black-box (and what covers the gap)

| AC | Why | Cover |
|---|---|---|
| AC-001.3 "no email is sent" | No inbox is read (decision 0004). | The server's `signin_link_requested` event shows `listed=false` with no member. Residual: SMTP behaviour itself is unobserved. |
| AC-001.6 link older than 61 minutes | A one-time token cannot be aged from outside, and waiting an hour is not acceptable. | Used-once and prefetch cases are tested. Expiry needs a short-lived OTP setting on the preview branch, or a devops-assisted check once. |
| AC-001.8 email service unavailable | Needs the provider to fail on demand. | Devops drill on staging (revoke the SMTP key on a preview branch), run by hand, result recorded in the run report. |
| AC-001.10 29 days | Cannot wait 29 days or move the server clock. | Cookie lifetime proxy. Middleware cap is checked by bl-security. |
| AC-004.8 | Cannot change the server clock. | Browser clock set to 22:00 Pacific and server date compared with `/me`. Discriminates only against a client that trusts the phone. |
| AC-004.12 | Real 4G and a real phone are not available. | CDP throttling in Chromium. A miss near the budget is reported with numbers, not treated as flaky. |
| AC-005.2, 005.3, 005.4 | Needs a real Android/iPhone home screen. | Manifest and icon checks only. AC-005.4 is manual (PRD says so). |
| AC-006.2 production run | QA runs on staging only. | A devops CI job runs the same suite against production with a production-only guard. This config deliberately cannot do it. See Q2. |
| AC-006.4 non-zero exit naming the step | Exit code is the runner's. | Steps are named. Phase 3 does one deliberate failure to see the exit code and output. |
| AC-002.8, 003.12, 007.11, 008.8 | `audit_log` has no API or client access (matrix). | Service-role read, read-only. Asserts actor, action, time, field names and no personal data. Exact `details` keys are asserted loosely until a spec fixes them (Q4). |
| "Connection drops" criteria | A real network cut is not reproduced. | Writes aborted in the browser; the board-load failures abort the board request. |

## 7. Fuzz (qa-fuzz)

`tests/fuzz/**` is not an owned file of this step. Boundary payload tables are already in `api/contract` (lengths at limit ±1, code points, phones, dates, times, unknown fields, malformed JSON) and the Data API probes in `api/permissions`. Phase 3: add `tests/fuzz/run.sh` driving a schema-based fuzzer from `docs/openapi.yaml` once per role (O, A, B), asserting no 5xx, no SQL or stack text in problem+json, and no response outside the matrix.

## 8. Questions for the owners of the contract (raised, not decided)

| # | Question | Owner |
|---|---|---|
| Q1 | AC-006.1 names `npm run e2e` but `package.json` has no such script. Needs `"e2e": "playwright test"` (and a way to run the setup project first). | backend / devops |
| Q2 | The PRD wants the same suite on production (AC-006.2), QA's rules forbid pointing it there. Devops needs a separate production job (service-role key from the production GitHub environment, `is_test` org only). Confirm who owns it. | orchestrator |
| Q3 | The board's day is chosen by a date input in tests (`input[type=date]`, design-specs "date button opens the phone's date picker"). If the day is also in the URL (`/board?date=`), say so in `openapi.yaml`/architecture so tests can deep-link. | frontend / architect |
| Q4 | `audit_log.details` keys are not specified (old/new status, changed field names). QA asserts presence of `scheduled`/`in_progress` and field names. Please fix the shape in `docs/architecture.md`. | architect |
| Q5 | Screen addresses used: `/sign-in`, `/link-expired`, `/board`, `/team`, `/jobs/new`, `/jobs/{id}`, `/jobs/{id}/edit`, `/offline`, `/sw.js`, manifest via `<link rel="manifest">`. Taken from the route files; confirm they are stable. | frontend |
| Q6 | The sign-in Server Actions are outside `openapi.yaml`, so their rate limits (1/60 s per email, 10/15 min per IP) can be probed only through the UI. Fine for now; a documented endpoint would allow API probes. | architect |
| Q7 | "No jobs today" cannot be asserted against the shared e2e org (never empty). Test fulfils an empty board response in the browser. If the board is server-rendered, this stub will not apply and the test needs a dedicated empty tenant. | frontend |

## 9. Test data

Created per test through the API (`createJob`, `addTechnician`) with unique titles and `example.test` emails. Fixed dates used: today (from `/me`) ± small offsets; 2026-11-17 (AC-010.2, lead days); 2027-03-14 (AC-010.7); `today + 40…62` days for ordering, 50-job and 30-job days; `today + 2500…3000` days for empty days. Nothing is deleted. Real customer data and third-party APIs are never used.
