# Restore production after a failed release

**Purpose:** Put production back on the last good version from the Vercel dashboard when the automatic rollback did not do it.
**Who:** Matthew · **When:** A release went live but the site is broken, and the release run did not restore it · **Kind:** 2 operator
**Evidence:** see `docs/sops/evidence.md#restore-production`

## Before you start
- You can sign in to Vercel and see the **baseleap** team.
- First check whether the system already restored production. A failed release rolls back by itself. See "What you should see" in [Approve a production release](approve-a-release.md). Only continue if it did not.
- You know which version was the last good one. The release run's **Summary** lists the "Restore point": the deployment that was live before the release, with its commit.
- This restores the app only. It does not undo database changes. Database changes are built so the old app still works on them.

## Steps
1. Go to **vercel.com** and sign in.
2. At the top left, click the team name and choose **baseleap**.
3. Click the project **baseleap-devops-sandbox**.
4. Click **Deployments** in the top menu.
5. Find the last good production deployment. Match it to the "Restore point" commit (7 characters) from the release Summary.
6. Open that deployment's menu and click **Instant Rollback**. If a confirm box appears, confirm it.
7. Open https://baseleap-devops-sandbox.vercel.app/api/health.
8. Check that `status` is `ok` and `version` matches the 7 characters of the last good commit.
9. Tell Baseleap that production was restored by hand, and send the failed run link.

## What you should see
- The deployment you picked is now labelled as the current production deployment.
- The health page shows `"status":"ok"` and the old version.

## If it goes wrong
- **Health still shows the broken version:** wait two minutes, then reload. If it does not change, send Baseleap a screenshot of the Deployments page.
- **The version is right but the site still looks broken:** the cause may be the database or a setting, not the app. Stop and call Baseleap. Do not restore the database yourself. Database restores need a decision about the restore point first (`docs/runbook.md`, "Roll back").
- **A page says "Upgrade" or shows a price:** stop. That is a spending decision. Do not click it.
- **A button or menu is not where this SOP says:** stop and send a screenshot. Do not guess.
- **After you restore, the next release does not seem to update the live site:** this is expected to be handled. After an Instant Rollback, Vercel stops moving the production domain to new deployments by itself. The release workflow promotes its new deployment explicitly, so it still works. Mention it to Baseleap anyway.
- **The broken code is still on `main`:** restoring does not remove it. Baseleap ships a fix through the normal flow. Do not ask for edits straight to `main`.
- Deeper detail: `docs/runbook.md` ("Roll back", "Incidents").

## Changelog
- 2026-11-18 — New SOP — written from the manual rollback in drills (2026-11-17), release.yml rollback steps and the runbook (step DOC1)
