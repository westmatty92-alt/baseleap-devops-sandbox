# QA run report

**Verdict: FAIL** (run B, the latest). 179 passed, 2 failed, 1 flaky, 220 skipped/fixme (402 listed).

- Step: QA6. Target: local stack (not staging), `--retries=1`. Evidence: `.baseleap/inputs/qa6/runB.{log,json}`. Commit SHA: working tree on top of the branch head, with an uncommitted local change in `src/app/api/jobs/route.ts` (the QA4-001 fix).
- Crossed permission boundaries: none.

## Failed (both are test defects, fixed after this run, not yet re-run)
| Test | Why |
|---|---|
| nulls › NULLS malformed JSON, wrong content types | The test's "truncated JSON" reached the server as a valid JSON string (Playwright JSON-stringifies unparsable string `data` under a JSON content type), so the app correctly said 422. Now sent as a Buffer. |
| shapes › SHAPE problems | Same cause, same fix. |

## Flaky (not a pass)
| Test | Why |
|---|---|
| zz-drill-flake › board refresh returns the same job count twice | Failed attempt 1 (49 vs 50), passed on retry. The test touches no app code and uses a `/tmp` marker; it is no longer in the suite. See `.baseleap/reports/QA6.md`. |

## Skipped / fixme
220: the known unbuilt (P2, PATCH, cancel) and Vercel-only tests from QA4; nothing added or removed.

## Compared with run A (before the QA4-001 fix)
Run A: 177 passed, 4 failed, 1 flaky, 220 skipped, FAIL. The two AC-003.5 blank-phone API tests failed on both attempts in A and passed on the first attempt in B. QA4-001 is reopened, not closed: the contract decision is open and the fix is local only.

## Cleanup
`users deleted 3 (already gone 2, failed 0); orgs deleted 0, kept 2` (QA4-002 open).

Details, triage and tickets: `.baseleap/reports/QA6.md`, `docs/qa-reports/tickets/`.
