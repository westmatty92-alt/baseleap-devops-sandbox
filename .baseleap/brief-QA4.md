# STEP QA4 — triage the first local run

Agent: bl-qa · Skills: qa-e2e, qa-report

## Context
Claude ran your QA3 suite on the local stack (log: `.baseleap/inputs/qa3-local-run.log`).
Smoke: 22 passed. Full: 110 passed, 220 skipped (fixme/Vercel-only), 4 failed. Cleanup printed
`users deleted 3 (failed 2); orgs deleted 0, kept 2` on both runs.

## Do
1. Triage each of the 4 failures: app defect, test defect, or spec gap. Read the code, `docs/openapi.yaml`,
   `docs/user-stories.md`, and the generated zod in `src/lib/api/generated/` to decide. Say why in one line each.
2. Fix the test defects in your owned files only. Don't weaken an assertion to make it pass: a test must still fail
   if the app is wrong.
3. For each app defect or spec gap, write a ticket in `docs/qa-reports/tickets/` using the qa-report ticket format
   (id, severity, AC, owner agent, steps to reproduce, expected, actual, evidence). Route to the agent that owns the fix.
4. Fix the cleanup so it removes everything the run created (users and orgs), or explain exactly why it can't
   (e.g. a foreign key or trigger blocks it) and file a ticket. Cleanup must report 0 failed / 0 kept on a clean run.
5. Update `.baseleap/reports/QA4.md`: the triage table, what you changed, tickets filed, and the commands to rerun.
   You can't run the suite yourself (no local keys); Claude will rerun it.

## Owned files
playwright.config.ts · tests/e2e/** · docs/test-plan.md · docs/qa-reports/** · .baseleap/reports/QA4.md
Don't change app code, migrations, docs/openapi.yaml or package.json.
Commit with one plain command per call (`git add <owned paths>`, then `git commit -m "STEP QA4: triage first local run"`). Don't push.
