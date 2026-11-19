# QA run report

**Verdict: FAIL** (first staging run, `@smoke` only). 21 passed, 1 failed, 0 flaky, of the 22 `@smoke` tests that ran. Not release evidence: the full suite has not run on staging.

- Step: QA8. Target: **staging**, `https://baseleap-devops-sandbox-p2gs5apa4-baseleap.vercel.app`, the deployment of commit `172792684f6f32f74f2f0318869b5315b69074f0` (1727926), against the staging Supabase project. Workflow `qa-staging`, run 44434945604, `--grep @smoke`, 2 workers, 1 retry.
- Evidence: `.baseleap/inputs/qa8-staging-run.log`; CI artifact `qa-staging-smoke` (id 14488708070: traces and error contexts).
- Crossed permission boundaries: **none.** The four signed-out probes (`/api/me`, `/api/board`, `POST /api/jobs`, `PUT /api/jobs/{id}/status` all 401) and the technician `POST /api/jobs` 403 passed.

## Failed
| Test | Result | Ticket |
|---|---|---|
| `contract.spec.ts:29` AC-006.3 `GET /api/health?check=db` returns 200 with db ok | 503 on the first attempt and on retry #1. A real failure, not flaky. | QA8-001 (Important, bl-backend) |

Cause, from the code and Claude's checks (I did not call production myself): `dbReachable()` probes `/rest/v1/` with the anon key. Hosted Supabase refuses that, the local stack accepts it, so the check reports "down" on every hosted environment. Production answers `degraded` / `db: down` too. The test is unchanged and stays red until the route is fixed. No request id is in the log; the traces in the artifact hold the response headers.

## Flaky
None. The one failure repeated on retry.

## Staging Definition of Done
| Item | Held? | Evidence |
|---|---|---|
| Tenant created on staging | **Yes** | `auth.setup.ts` passed (3.9 s): tenant, owner, Tech A and Tech B signed in. |
| Tenant cleaned up | **Partly** | Users: deleted 3 (2 already gone, 0 failed). **Organisations: deleted 0, kept 2**, `23503` on `team_members_org_id_fkey`. This is QA4-002 and it now happens on staging, so each staging run leaves 2 `E2E` orgs behind. The cleanup test itself passes, because it reports problems without failing. |
| Mobile and desktop | **Yes, for the smoke pages** | `/sign-in`, `/link-expired`, `/offline` and the root redirect passed on both projects (8 of 8). No console errors (the guard fixture is active). |
| Production refused | **Held, but not shown as a refusal** | The workflow guard steps passed for this URL ("BASE_URL is not a production host", "Supabase guard passed: staging URL matches the staging ref and not production"). This run had no case where production was the target, so the refusal itself was not exercised. The target-guard logic is covered by the local checks only. |
| Right build | **Yes** | The pre-test smoke reported `/api/health` version `1727926`, equal to `DEPLOY_SHA`. |

## What is still missing
1. **The full suite on staging.** Only `@smoke` ran (22 of 401 listed). The other ~380, including all of the `permissions.spec.ts` boundary probes beyond the five smoke ones, the shape, nulls and round-trip specs, and the fuzz run, have no staging evidence.
2. **The embed project.** No embed test ran (the embed handoff is not in the smoke set). Nothing about the embedded view is proven on staging.
3. **The skipped set.** The 220 `fixme` / unbuilt (P2, PATCH, cancel) / Vercel-only tests from the local runs are unchanged. I can't say yet how many Vercel-only tests will run on staging; that is the next run's first number.
4. **The open tickets:** QA8-001 (new), QA4-002 (confirmed on staging), QA4-001 (contract decision still open; no staging proof).

## Lint and type check (CI `verify`)
Fixed in my files: `npm run lint` and `npx tsc --noEmit -p tsconfig.json` are both clean. The two `react-hooks/rules-of-hooks` errors came from the rule reading Playwright's fixture callback `use` as a React hook; the callback is now named `provide` in `tests/e2e/support/fixtures.ts`, so the rule stays on everywhere. The 17 unused-variable warnings came from destructuring values only to drop them; a small `omit()` helper (`tests/e2e/support/omit.ts`) replaces that in `roundtrip.spec.ts` and `shapes.spec.ts`. No assertion changed. I have not re-run the specs after this edit (no staging or local run in this step), so the first green after it is the check that `omit` behaves as the destructuring did.

## Run history
| Run | Target | Passed | Failed | Flaky | Skipped | Verdict |
|---|---|---|---|---|---|---|
| A (before QA4-001 fix) | local | 177 | 4 | 1 | 220 | FAIL |
| B (after fix) | local | 179 | 2 | 1 | 220 | FAIL |
| C (after test fixes) | local | 181 | 0 | 0 | 220 | PASS locally, not release evidence |
| D, QA8 (`@smoke`) | **staging** 1727926 | 21 | 1 | 0 | n/a (grep) | **FAIL** |

Details and triage: `.baseleap/reports/QA8.md`, `docs/qa-reports/tickets/`.
