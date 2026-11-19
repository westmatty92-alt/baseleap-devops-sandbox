# STEP QA6 — verdicts, a flaky result, and a reopened run

Agent: bl-qa · Skills: qa-regression, qa-report

## Context
Claude ran the suite twice more on the local stack, with `--retries=1` (as CI does). Logs and JSON reports:
`.baseleap/inputs/qa6/runA.*` and `runB.*`. Between run A and run B, a fix for QA4-001 (blank phone) was deployed to
the local app (`src/app/api/jobs/route.ts`, not committed; the architect still owns the contract decision).

## Do
1. **Verdicts.** For run A and run B separately, write the verdict the way `qa-report` says (PASS / FAIL), with the
   counts (passed, failed, flaky, skipped/fixme), and one line per non-pass explaining it. Apply the flake policy exactly.
2. **Reopen QA4-001.** Say whether run B shows the fix working (which tests, green on first attempt or only on retry),
   and update the ticket's status accordingly. Don't close it while the contract question is open; say what remains.
3. **Triage the 2 tests that fail in both runs** (`nulls.spec.ts` malformed JSON, `shapes.spec.ts` problems): app defect
   or test defect? Check exactly what bytes your test sends (Playwright's `data` with a string) and what the route does
   with invalid JSON (`src/lib/server/http.ts` `readJson`). Fix your test if it's yours; ticket it if it's the app's.
4. Anything you find about the test named `board refresh returns the same job count twice`: what kind of result it was,
   and what you would do with it in a real run (it isn't in your files any more).
5. Write all of it to `.baseleap/reports/QA6.md` and `docs/qa-reports/latest-run.md` (run B is the latest).
   Run `npx tsc --noEmit -p tsconfig.json`.

## Owned files
tests/e2e/** · docs/test-plan.md · docs/qa-reports/** · .baseleap/reports/QA6.md
Don't change app code. One plain command per Bash call. Commit with `git add tests/e2e docs/test-plan.md docs/qa-reports .baseleap/reports/QA6.md`
then `git commit -m "STEP QA6: verdicts and reopened run"`. Don't push.
