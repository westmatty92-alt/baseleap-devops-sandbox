# QA6: verdicts, a flaky result, and the reopened run

Source: `.baseleap/inputs/qa6/runA.{log,json}` and `runB.{log,json}`. Local stack, `--retries=1`, 402 listed tests each. I read the logs; I could not run the JSON summary script in this session, so the counts are the Playwright summary lines (they add up: A 177+4+1+220 = 402, B 179+2+1+220 = 402). Not a staging run, so these are local evidence only.

Flake policy applied: a test that fails and then passes on retry is **FLAKY**, not a pass. It is listed on its own, and a run with a flaky test is not a clean pass.

## 1. Verdicts

### Run A (before the QA4-001 fix): **FAIL**
passed 177 · failed 4 · flaky 1 · skipped/fixme 220

| Result | Test | Line |
|---|---|---|
| failed | contract › AC-003.5 customer_phone `""` accepted | 422 instead of 201 on attempt 1 and on retry: real failure (QA4-001). |
| failed | contract › AC-003.5 customer_phone `"   "` accepted | Same cause and ticket. |
| failed | nulls › NULLS malformed JSON, wrong content types | Both attempts: truncated JSON got 422, expected 400. **Test defect** (section 3). |
| failed | shapes › SHAPE problems | Both attempts: malformed JSON got 422, expected 400. **Test defect**, same cause. |
| flaky | zz-drill-flake › board refresh returns the same job count twice | Failed attempt 1 (49 vs 50), passed on retry. Not a pass (section 4). |

### Run B (after the local fix): **FAIL**
passed 179 · failed 2 · flaky 1 · skipped/fixme 220

| Result | Test | Line |
|---|---|---|
| failed | nulls › NULLS malformed JSON, wrong content types | Same as run A. Test defect. |
| failed | shapes › SHAPE problems | Same as run A. Test defect. |
| flaky | zz-drill-flake › board refresh returns the same job count twice | Same as run A: failed attempt 1, passed on retry. |

The 220 skipped are the known `fixme` / Vercel-only / unbuilt (P2, PATCH, cancel) tests from QA4; none were added or removed.
Cleanup, both runs: `users deleted 3 (already gone 2, failed 0); orgs deleted 0, kept 2`. The org line is still QA4-002 (restrict FKs plus append-only audit), a minor ticket for bl-backend. The QA4 guess about the users was right.

No permission boundary was crossed in either run (the permissions spec passed both times).

## 2. QA4-001 reopened

Run B shows the fix working. `contract.spec.ts` › `customer_phone ""` and `"   "` both passed on the **first attempt** (no retry line for them in `runB.log`; in run A both failed twice). The `null`, valid-phone and invalid-phone cases and the two UI AC-003.5 tests (mobile, desktop) were green on the first attempt in both runs.

The ticket is **not closed**. Status changed to *reopened, fix verified locally*. It stays open because:
1. The architect has not decided. The fix (in `POST /api/jobs`, blank phone becomes null before validation) means the server now accepts what `docs/openapi.yaml` and the generated zod still reject. Option (a) change the contract, or (b) keep it and amend AC-003.5, in which case the route change goes and I retarget the two tests to 422.
2. The change is uncommitted and local, not on the staging preview. A close needs a staging run.
3. The edit path (AC-008.4) has no blank-phone test run and the fix covers only POST.

Ticket: `docs/qa-reports/tickets/QA4-001-blank-phone-contract-vs-ac.md` (updated).

## 3. The two tests that failed in both runs: **test defect, fixed**

Not an app defect.

- **What my test sent.** `nulls.spec.ts` (`raw()`) and `shapes.spec.ts` passed a string as Playwright's `data` with `content-type: application/json`. In `playwright-core` (`coreBundle.js`, around line 61287), a string body with a JSON content type is sent as-is only if `JSON.parse` accepts it; otherwise Playwright does `JSON.stringify(string)`. So `{"title":` went out as the valid JSON string `"{\"title\":"`, not as truncated JSON.
- **What the route does.** `readJson` in `src/lib/server/http.ts` returns 400 `bad_request` only when `req.json()` throws. A valid JSON string parses, so it reaches zod, which rejects a non-object body with 422 `validation_failed`, field `body`, `invalid_format`. That is exactly what both logs show (`"field":"body","code":"invalid_format"`). The app behaved correctly for the bytes it received.
- **Fix.** The raw body is now sent as a `Buffer`, which Playwright sends unchanged: `raw()` in `nulls.spec.ts` and the malformed-JSON call in `shapes.spec.ts`. The expectations (400 `bad_request`) are unchanged, so nothing was weakened.
- **Same flaw found in a passing test.** `contract.spec.ts` › `SECURITY 3 problem+json errors never leak…` sent `'{not json'` the same way and passed only because it accepted 400 or 422. It also never sent malformed JSON. Now a Buffer, and it expects exactly 400.
- **Not yet re-run.** `npx tsc --noEmit -p tsconfig.json` is clean. Expected on the next run: these 3 tests pass on the first attempt. If one still gets 422, send me the log; then `readJson` or the route order would need a look. Run: `bash tests/e2e/run-local.sh --project=api -g "NULLS malformed|SHAPE problems|SECURITY 3"`.

## 4. `board refresh returns the same job count twice`

- **Kind of result:** FLAKY (failed attempt 1, passed on retry #1), in both runs. Counted as flaky, never as passed.
- **What it really is:** `zz-drill-flake.spec.ts` (the file is no longer in `tests/e2e/api/`). From the log's source excerpt, it contacts no app at all. It writes `/tmp/qa-flake-marker` on the first attempt and runs `expect(49).toBe(50)`; if the marker already exists it asserts nothing. So it fails exactly once per marker and "passes" on retry, whatever the app does. Its title claims a board check it does not make, and it is not tied to any AC. In run B it flaked again, so the marker was removed between runs.
- **In a real run:** I would not retry it away or count it green. A real test with this signature (board job count 49 on one refresh, 50 on the next) points to a consistency or race problem with the board, potentially AC-004.7 (50 jobs, none cut off), so it would get a ticket: severity Important, owner bl-backend, suggested signature `board:job_count-unstable-on-refresh`, with traces from both attempts and `--repeat-each=20` to get a failure rate. The run verdict would carry the FLAKY line until it is fixed or explained. Here, since it is not an app test, the action is: take it out of the suite (done, it is not in my files) and tell the orchestrator that whoever added it should not leave `zz-*` drill files or `/tmp` marker state in a run that goes into a report. Both verdicts above still include it as flaky because the run files do.

## Files changed
- `tests/e2e/api/nulls.spec.ts`, `tests/e2e/api/shapes.spec.ts`, `tests/e2e/api/contract.spec.ts` (Buffer bodies; one assertion tightened to 400)
- `docs/qa-reports/tickets/QA4-001-blank-phone-contract-vs-ac.md` (status and re-test)
- `docs/qa-reports/latest-run.md` (run B), `.baseleap/reports/QA6.md`
- App code untouched. `src/app/api/jobs/route.ts` is the uncommitted local fix and is not part of this commit.

## Tickets
| Id | Severity | Owner | Status |
|---|---|---|---|
| QA4-001 | Important | bl-architect | Reopened; fix green locally (run B, first attempt); open on contract decision, staging proof, edit path |
| QA4-002 | Minor | bl-backend | Open (orgs kept 2 in both runs) |
