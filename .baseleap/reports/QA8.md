# QA8: first staging run, and CI lint

## Result
- **Staging run 44434945604** (`@smoke`, deployment of 1727926, staging Supabase): **FAIL**, 21 passed, 1 failed, 0 flaky. The failure is real (503 on attempt and on retry) and is a new ticket, **QA8-001**.
- **Lint and type check:** `npm run lint` clean (was 2 errors, 17 warnings); `npx tsc --noEmit -p tsconfig.json` clean.
- No permission boundary crossed.

## 1. CI lint
- The 2 errors (`react-hooks/rules-of-hooks`, `tests/e2e/support/fixtures.ts`): the rule treats any call to a function named `use` as a React hook, and Playwright's fixture callback is named `use`. Renamed it to `provide` in all four fixtures (`guard`, `context`, `consoleGuard`, `ids`), with a one-line comment. The rule is not disabled anywhere.
- The 17 warnings (`no-unused-vars`, `roundtrip.spec.ts` 16, `shapes.spec.ts` 1): values destructured only to drop them. Added `tests/e2e/support/omit.ts` (`omit(obj, keys)`) and used it in those places. Same keys are removed, so every comparison is the same; no test was weakened, skipped or loosened.
- Not re-run: the specs themselves. Both files compile and lint, but the first run of them after this change is what proves `omit` is equal to the destructuring. The expected effect is none.

## 2. QA8-001: `/api/health?check=db` is 503 on hosted Supabase
Ticket: `docs/qa-reports/tickets/QA8-001-health-db-check-fails-on-hosted-supabase.md` (Important, owner bl-backend, AC-006.3).
- `dbReachable()` calls `/rest/v1/` with the anon key. Hosted Supabase refuses the anon key there; the local stack accepts it. So the probe says "down" whatever the database state. Production shows the same (`degraded`, `db: down`), per Claude's check, which I did not repeat.
- Local runs A to C were green on this test for that reason; it could not fail until it met a hosted project.
- No request id: the test asserts only the status, and the log has no headers or body. The trace zips in artifact `qa-staging-smoke` have them.
- The test is unchanged, as asked.

## 3. Staging DoD
| Item | Held? |
|---|---|
| Tenant created | Yes (setup passed, 3 users signed in) |
| Tenant cleaned up | **Partly.** Users yes (3 deleted). Orgs no: 0 deleted, 2 kept, `23503` on `team_members_org_id_fkey`. QA4-002, now confirmed on staging. Each run leaves 2 `E2E` orgs. |
| Mobile and desktop | Yes, 8 of 8 smoke page tests, no console errors |
| Production refused | The workflow guards passed for the staging URL (host and Supabase ref). No run had production as the target, so the refusal was not seen happening. |
| Correct build | Yes, `/api/health` version 1727926 equals `DEPLOY_SHA` |

## 4. Still missing
- Full suite on staging (only 22 of 401 tests ran), and the fuzz run.
- The embed project (nothing embed ran).
- The 220 fixme / unbuilt / Vercel-only tests: how many run on staging is unknown until a full run.
- Open: QA8-001 (new), QA4-002 (confirmed on staging), QA4-001 (contract decision).
- Not release evidence, and Gate 3 can't use this run.

## 5. Next
1. bl-backend fixes the health probe (QA8-001); bl-backend / bl-architect decide QA4-002 (the staging org pile-up now matters more).
2. A full `qa-staging` run (not only `@smoke`) on the fixed deployment, with the embed project configured.
3. Re-run `npx playwright test --project=api -g "health"` on the staging URL to close QA8-001.

## Files changed
- `tests/e2e/support/fixtures.ts`, `tests/e2e/support/omit.ts` (new), `tests/e2e/api/roundtrip.spec.ts`, `tests/e2e/api/shapes.spec.ts`
- `docs/qa-reports/latest-run.md`, `docs/qa-reports/tickets/QA8-001-health-db-check-fails-on-hosted-supabase.md`, `.baseleap/reports/QA8.md`
- App code untouched.

## Tickets
| Id | Severity | Owner | Status |
|---|---|---|---|
| QA8-001 | Important | bl-backend | New |
| QA4-001 | Important | bl-architect | Reopened; contract decision and staging proof pending |
| QA4-002 | Minor | bl-backend | Open; reproduced on staging (orgs kept 2) |
