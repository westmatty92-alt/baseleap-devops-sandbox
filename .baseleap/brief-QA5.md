# STEP QA5 — close the gaps the planted-bug drill found

Agent: bl-qa · Skills: qa-e2e, qa-probe, qa-report

## Context
Claude planted five bugs in the app, one at a time, and ran your suite (local stack) after each. Your suite caught 1 of 5.
You don't get the code changes; you get the classes that slipped through. Each must now make at least one test fail,
with a message that says what is wrong.

| # | Class | Caught? |
|---|---|---|
| 1 | A read ignores the caller's organisation (tenant isolation) | ✅ yes (cross-organisation board test) |
| 2 | The API accepts a field and silently doesn't save it (the job comes back without it, on create or on later reads) | ❌ |
| 3 | An explicit `null` in an optional request field causes a 500 | ❌ |
| 4 | A response carries a field the contract doesn't define | ❌ |
| 5 | A screen logs an error to the browser console on load | ❌ |

## Do
1. **Round-trip:** for every built write endpoint, send every writable field with a distinct value and assert the
   response *and* a fresh read (board) return each one as sent (or normalised as the contract says).
2. **Nulls and 5xx:** for every built endpoint, send `null` for each optional field (and an empty body, wrong types).
   Any 5xx fails the test. Expected answers come from the contract (accepted, or 422 with the field named).
3. **Strict shapes:** validate every response body of the built endpoints against the contract with no extra
   properties allowed (use the generated zod schemas in `src/lib/api/generated/` with `.strict()`, or the OpenAPI
   schema directly). Name the extra/missing field in the failure.
4. **Console errors:** a shared fixture collects `console` errors and `pageerror` for every browser test (including
   `@smoke`) and fails the test when there are any, listing them. Allow-list nothing without a written reason.
5. Keep everything that already passes passing (only QA4-001's two phone tests fail today). Update `docs/test-plan.md`
   and `.baseleap/reports/QA5.md` (what you added, per class). Run `npx tsc --noEmit -p tsconfig.json` yourself.

## Owned files
playwright.config.ts · tests/e2e/** · docs/test-plan.md · docs/qa-reports/** · .baseleap/reports/QA5.md
Don't change app code. One plain command per Bash call. Commit with `git add tests/e2e docs/test-plan.md docs/qa-reports .baseleap/reports/QA5.md`
then `git commit -m "STEP QA5: drill gaps"`. Don't push.
