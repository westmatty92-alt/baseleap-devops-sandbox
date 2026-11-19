# QA4-001: AC-003.5 says a blank phone is accepted; the contract rejects "" and whitespace-only

- **Status: REOPENED, fix verified locally (run B), NOT closed.** The two regression tests are green on the first attempt against an uncommitted local change in `src/app/api/jobs/route.ts`. Open: the contract decision (below), and the fix is not committed or on staging. See "Re-test (QA6)" at the bottom.
- **Severity:** Important (an AC fails at the API; the form may hide it)
- **Class:** spec gap (story and contract disagree)
- **Owner agent:** bl-architect (owns `docs/openapi.yaml`). Follow-up for bl-backend / bl-frontend depends on the decision.
- **AC:** AC-003.5, AC-008.4 (same phone rule on edit)
- **Tests (live, currently failing, left unchanged):** `tests/e2e/api/contract.spec.ts` › `AC-003.5 customer_phone "" is accepted (blank means not entered)` and `… "   " is accepted …`
- **Signature suggestion:** `contract-vs-ac:customer_phone-blank-pattern`

## Steps to reproduce
1. Sign in as the owner of a fresh e2e tenant and take its access token (`$OWNER_TOKEN`).
2. `curl -sS -X POST "$BASE_URL/api/jobs" -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' -d '{"client_request_id":"<new uuid>","title":"t","address":"1 Main St","job_date":"<today>","start_time":"10:00","assigned_member_id":"<active technician id>","customer_phone":""}'`
3. Repeat with `"customer_phone":"   "`.

## Expected
AC-003.5: "A blank phone is accepted." Job saved (201), `customer_phone` null.

## Actual
422 `validation_failed` for both. `docs/openapi.yaml` (JobCreate, JobUpdate, Job) and the generated `CreateJobBody` allow only `null`, omission, or `^[0-9 +()-]{7,20}$`. `""` and `"   "` fail the pattern before the service runs. The service (`blankToNull(input.customer_phone, true)`) clearly intends to treat them as blank, so code and story agree and the contract is the odd one out. `null` and omitted phones pass (those tests are green).

## Decision needed
Either (a) change the pattern to allow blank: `^$|^[0-9 +()-]{7,20}$` plus trimming for whitespace-only, so the API matches AC-003.5; or (b) keep the contract and amend AC-003.5 to say the form sends `null` for a blank phone, and tell bl-frontend. QA will then keep or retarget the two tests; they are not weakened in the meantime.

## Evidence
`.baseleap/inputs/qa3-local-run.log` failures 2) and 3); traces `test-results/api-contract-create-job-va-815fb-*/trace.zip` (not committed).

## Re-test (QA7, run C)
- Run C (`--retries=1`, local, same uncommitted fix, drill file gone): both blank-phone tests (`""`, `"   "`) and the `null`, valid and invalid-phone cases show no failure and no retry in `.baseleap/inputs/qa6/runC.log`. 181 passed, 0 failed, 0 flaky. Second green run in a row on the local fix.
- Status unchanged: **REOPENED, not closed.** All four open points below still stand: no contract decision, the fix is uncommitted and not on staging, and the edit path (AC-008.4) is still untested. A green local run does not close it.

## Re-test (QA6)
- **Run A** (before the fix, `--retries=1`): `contract.spec.ts` › `customer_phone ""` and `"   "` failed on the first attempt and on retry #1 (422, expected 201). Genuine failures, not flaky.
- **Run B** (after the local fix): both tests passed on the **first attempt** (no retry line in the log). The `null` and valid-phone cases and the two UI tests (`jobs.spec.ts` AC-003.5, mobile and desktop) were green in both runs, first attempt.
- **What the fix is:** `POST /api/jobs` turns a blank or whitespace-only `customer_phone` into `null` before validating. It works, but it is a working-tree change only, and `docs/openapi.yaml` and the generated zod still say the phone must match `^[0-9 +()-]{7,20}$` or be null, so the code now accepts what the contract forbids.
- **Still open, before this can close:**
  1. bl-architect decides (a) change the contract to allow blank, or (b) keep the contract and amend AC-003.5. If (b), the route change should be removed and the two tests retargeted to expect 422, which I will do only on that decision.
  2. The route change is uncommitted and not on the staging preview. Evidence is local only; a close needs a run on staging.
  3. AC-008.4 / edit (JobUpdate): the same blank-phone rule was not tested on the edit path in run B, and the fix touches only POST. Needs a test once PATCH is built.
  4. The two tests stay unchanged until the decision.
