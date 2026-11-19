# Approve a production release

**Purpose:** Let a finished, tested version go live on production, and confirm it worked.
**Who:** Matthew · **When:** GitHub emails you "Review pending deployments" · **Kind:** 2 operator
**Evidence:** see `docs/sops/evidence.md#approve-a-release`

## Before you start
- You are signed in to GitHub as the reviewer for the `production` environment (`westmatty92-alt`).
- You have approved Gate 3. Baseleap then merges the `staging` branch into `main`. That merge starts the release.
- Nothing reaches production until you approve. This is your second yes.

## Steps
1. Open the email **Review pending deployments** from GitHub. Or open the repo's **Actions** tab: https://github.com/westmatty92-alt/baseleap-devops-sandbox/actions
2. Click the run named **release** that is waiting (yellow). Check that the commit shown is the one you expect.
3. Click **Review deployments**.
4. Tick **production**.
5. Click **Approve and deploy**.
6. Wait. The run takes a few minutes. It updates the database, deploys, then checks the live site.
7. When the run finishes, open the run's **Summary** page and read the "Release" list.
8. Open https://baseleap-devops-sandbox.vercel.app/api/health. Check that `status` says `ok`.
9. Check that `version` matches the first 7 characters of the release commit shown in the run title.

## What you should see
- The run turns green.
- The Summary says "Promoted to production: success" and "Smoke: success".
- The health page shows `"status":"ok"` and the new 7-character version.
- Baseleap writes a release-log entry afterwards.

## If it goes wrong
- **The run turns red and the Summary says "Rollback … success":** the new version failed its live check. The system put the previous version back by itself. You do nothing. Tell Baseleap. Production is on the old version; check the health page to confirm. (Drill: run 44213878230.)
- **The run turns red before anything deploys (for example "Configuration is complete" or the environment check):** nothing changed on production. Send Baseleap a screenshot of the red step. In earlier drills this was a missing setting; Baseleap fixes it (drill attempts 2026-11-17).
- **You re-run a failed run and it does not ask for approval again:** this is expected. GitHub reuses the approval for the same commit. Check the commit is the one you want before re-running.
- **The run is red and the Summary says rollback failed or was skipped:** production may be on a broken version. Follow `restore-production.md` now: [Restore production after a failed release](restore-production.md).
- **The check that `version` matches fails by hand but the run is green:** wait two minutes and reload. The site can take a moment to switch. If it persists, ask Baseleap.
- Deeper detail: `docs/runbook.md` ("Deploy (normal release)").

## Changelog
- 2026-11-18 — New SOP — written from release.yml, runbook, setup guide and drills 3 and 4 (step DOC1)
