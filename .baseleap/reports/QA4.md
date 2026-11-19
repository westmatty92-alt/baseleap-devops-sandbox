# QA4: triage of the first local run

Branch: current. Not pushed. **Not re-run:** QA has no local keys. Claude reruns with the commands at the bottom.

First run (`.baseleap/inputs/qa3-local-run.log`): smoke 22 passed; full 110 passed, 220 skipped (fixme / Vercel-only), 4 failed; cleanup `users deleted 3 (failed 2); orgs deleted 0, kept 2`.

## Triage

| # | Test | Verdict | Why (one line) | Action |
|---|---|---|---|---|
| 1 | contract › AC-004.7 50 jobs, none cut off | **Test defect** | The test made jobs 48 and 49 start at 00:00 and 00:30, the same as 0 and 1; the board sorts by start time then creation (AC-004.6) and returned exactly that, the test expected plain creation order. | Fixed: expected order is now the stable sort by start time, then creation. Still asserts 50 jobs, `truncated` false and every id in the right place. |
| 2 | contract › AC-003.5 customer_phone `""` accepted | **Spec gap** | AC-003.5 says a blank phone is accepted, but `openapi.yaml` and the generated zod allow only null, omitted or `^[0-9 +()-]{7,20}$`, so `""` gets 422 before the service's blank-to-null step. | Ticket QA4-001 to bl-architect. Test unchanged and still failing. |
| 3 | contract › AC-003.5 customer_phone `"   "` accepted | **Spec gap** | Same cause: three spaces fail the 7 to 20 character pattern. | Same ticket, same test, unchanged. |
| 4 | events › `job_created` fires once per saved job | **Test defect** | The 5 events had 5 different `job_id`s: the filter (owner, Tech A, time window) also caught jobs other specs created in parallel; the double submit made one job. | Fixed: both responses must be the same job, then events are filtered by that `job_id` and exactly 1 is expected. |

No failure was an app defect. Nothing was weakened: the phone tests are untouched and the other two assert the same behaviour as before, with the expectation corrected.

## Cleanup

| | Cause | Change |
|---|---|---|
| Users, failed 2 | **Unconfirmed.** Likely the 2 foreign-org users: 3 + 2 = 5 users in the manifest, and `permissions.spec.ts` already deletes the foreign users in `afterAll` (`dropForeignTenant`), so cleanup deleted them a second time. | `cleanupManifest()` now de-duplicates ids, treats `user_not_found` / HTTP 404 as **already gone** (own counter), and logs `cleanup problem: user <status> <code>: <message>` for any other failure (ids and emails stripped). The teardown test now fails if a user cannot be deleted. The log will show whether the guess was right. |
| Orgs, kept 2 | **Cannot be fixed in tests.** `jobs.org_id` and `team_members.org_id` are `on delete restrict`; the cascade into `audit_log` hits the append-only trigger (BLA06). Every org with a team member has audit rows. The service role does not bypass FKs or triggers. | Ticket QA4-002 to bl-backend: a service-role-only purge function for `is_test` orgs named `E2E …`. Until it exists the run reports orgs kept, with the database's error code on a `cleanup problem: org …` line, and does not fail on it. Once the function exists QA calls it and asserts 0 kept. |

So after this change a clean run should print `users deleted 3 (already gone 2, failed 0)` if the guess is right, but `orgs kept 2` stays until QA4-002 ships. The brief's "0 failed / 0 kept" is met for users only.

## Files changed

- `tests/e2e/api/contract.spec.ts` (AC-004.7 expectation)
- `tests/e2e/api/team-audit-events.spec.ts` (`job_created` filter by job id)
- `tests/e2e/support/admin.ts` (`cleanupManifest`)
- `tests/e2e/support/auth.teardown.ts` (new counts, problem lines, user failures fail the run)
- `docs/qa-reports/tickets/QA4-001-blank-phone-contract-vs-ac.md`, `QA4-002-test-org-purge.md`
- `.baseleap/reports/QA4.md`

## Tickets

| Id | Severity | Owner | Summary |
|---|---|---|---|
| QA4-001 | Important | bl-architect | AC-003.5 (blank phone accepted) vs the contract pattern that rejects `""` and whitespace |
| QA4-002 | Minor | bl-backend | No way to delete test orgs (restrict FKs plus append-only audit): purge function needed |

## Expected result of the rerun

Failing: only the two AC-003.5 blank-phone tests (QA4-001). Everything else that passed should still pass; if AC-004.7 or the `job_created` test still fails, send the output and I will look again.

## Commands to rerun

The setup is the same as QA3 (`.baseleap/reports/QA3.md`, steps 0 to 2: Playwright browser, `npx supabase start`, dev server with `tests/e2e/local-env.sh`, `PRODUCTION_HOSTS` set).

```bash
bash tests/e2e/run-local.sh --project=api
bash tests/e2e/run-local.sh -g "AC-004.7|job_created|AC-003.5"
bash tests/e2e/run-local.sh
```

Send back the pass/fail lines, the `cleanup:` line and any `cleanup problem:` lines (they hold no ids, emails or keys). Do not paste `tests/e2e/.auth/*`.
