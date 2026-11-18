# SOP evidence

Each SOP step → what backs it. Run ids are from `docs/ops/pipeline-drills.md`.

## approve-a-release
File: `docs/sops/2-operator/approve-a-release.md`
- Steps 1–5 (email, **Review deployments → production → Approve and deploy**): `docs/runbook.md` "Deploy" step 2; `docs/ops/setup-for-matthew.md` 3.3 and "What you'll see at release time"; `release.yml` environment `production`. Matthew approved in drill 3 (runs 43993698910, 44219627968). The Actions tab link is built from the repo name in setup-for-matthew.md.
- Steps 6–7 (what the run does, Summary list): `release.yml` steps and "Release summary" step; runbook step 3.
- Steps 8–9 (health page, `version` = first 7 characters of the commit): runbook "At a glance"; `scripts/smoke.mjs`; drill 3 (health `7db3098`).
- "Re-run reuses approval": drill 3 attempt 1 lesson (ce08781).
- Red before deploy / missing setting: drill 3 attempts 1–3 (all failed safe).
- Automatic rollback: `release.yml` "Roll back" step; drill 4 run 44213878230.
- Not backed: the "wait two minutes" advice is from smoke retry timing (`smoke.mjs`, 120 s), not an observed manual check.

## restore-production
File: `docs/sops/2-operator/restore-production.md`
- Steps 1–3 (team **baseleap**, project): `docs/ops/setup-for-matthew.md` 1.1.
- Steps 4–6 (**Deployments**, last good production deployment, **Instant Rollback**): `docs/runbook.md` "Roll back"; `release.yml` Release summary line "Manual rollback"; drill 4 manual row (2026-11-17, Matthew restored `cadc497`).
- "Restore point" in the Summary: `release.yml` Release summary step.
- Steps 7–8 (health check): runbook; drill 4 ("health back to `cadc497` ok").
- Database not rolled back / PITR decision: runbook "Roll back — Database"; `release.yml` failure message ("Migrations stay applied").
- Domain note after Instant Rollback: drill 4 manual row; `release.yml` header comment.
- Not backed: the exact position of the **Instant Rollback** menu item and the confirm box. Evidence gives only the path name.
## pause-uptime-monitor
File: `docs/sops/2-operator/pause-uptime-monitor.md`
- Background (15-minute schedule, issue labelled `uptime`, comment on repeat, close on recovery, manual run allowed, missing `PRODUCTION_URL` opens no issue): `.github/workflows/uptime.yml`; drill 6 (run 44220381934, issue #7); `.baseleap/reports/OPS2.md`.
- Step 1 link: workflow file name `uptime.yml`; repo name from setup-for-matthew.md.
- Steps 2, 3, 6 (**Disable workflow**, **Enable workflow**): ⚠ no evidence. Nobody ran this. Marked unverified.
- Step 4–5, 7–9: step 5 uses runbook health URL; step 7 `workflow_dispatch` in uptime.yml; step 9 recovery logic in uptime.yml. The **Run workflow** button name is not in the evidence.
- "Do not change PRODUCTION_URL": drill 6 did this to trigger a false alert.
