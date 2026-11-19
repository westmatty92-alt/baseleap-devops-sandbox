# QA run report

**Verdict: PASS on the tests that ran, NOT release evidence** (run C, the latest). 181 passed, 0 failed, 0 flaky, 220 skipped/fixme (401 listed).

- Step: QA7 (re-run after the QA6 test fixes). Target: **local stack, not staging**, `--retries=1`. Evidence: `.baseleap/inputs/qa6/runC.{log,json}`. Commit SHA: working tree on top of the branch head, with an uncommitted local change in `src/app/api/jobs/route.ts` (the QA4-001 fix).
- Crossed permission boundaries: none (the permissions spec passed).
- Counts are the Playwright summary lines (181 + 220 = 401). I could not run a JSON summary in this session. The log has no failure, retry or flaky output.

## Why this is not release evidence
1. **Not staging.** Local stack only. A release verdict needs a full run on the staging preview with its commit SHA.
2. **The code under test is not what would ship.** The QA4-001 fix is an uncommitted local change, so the green blank-phone tests don't describe any deployed build. The contract decision is still open (see QA4-001).
3. **220 tests did not run** (unbuilt P2, PATCH, cancel, and Vercel-only). That includes the edit-path blank-phone rule (AC-008.4) and the PATCH permission probes. Those ACs have no evidence.
4. **Cleanup is still incomplete.** `users deleted 3 (already gone 2, failed 0); orgs deleted 0, kept 2`, with a 23503 foreign-key error on `team_members_org_id_fkey` (QA4-002, open). Each run leaves two orgs behind.

## Failed
None. The three tests that failed or were wrongly lenient in A/B (`NULLS malformed JSON…`, `SHAPE problems`, `SECURITY 3 problem+json…`) now run with Buffer bodies and show no failure or retry in run C. Run C is the evidence that the QA6 test fixes work.

## Flaky
None. The drill test (`zz-drill-flake`) is gone from the suite, so the total dropped from 402 to 401. It was never an app test.

## Skipped / fixme
220, the same known set as runs A and B. Nothing added or removed.

## Run history
| Run | Passed | Failed | Flaky | Skipped | Verdict |
|---|---|---|---|---|---|
| A (before QA4-001 fix) | 177 | 4 | 1 | 220 | FAIL |
| B (after fix) | 179 | 2 | 1 | 220 | FAIL |
| C (after test fixes) | 181 | 0 | 0 | 220 | PASS locally, not release evidence |

Details, triage and tickets: `.baseleap/reports/QA6.md`, `docs/qa-reports/tickets/`.
