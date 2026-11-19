# QA4-001: AC-003.5 says a blank phone is accepted; the contract rejects "" and whitespace-only

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
