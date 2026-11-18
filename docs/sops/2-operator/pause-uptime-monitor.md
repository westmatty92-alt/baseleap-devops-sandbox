# Pause the uptime monitor during planned maintenance

**Purpose:** Stop the uptime check from raising a false "Production is down" alert while you work on production, then turn it back on.
**Who:** Matthew · **When:** Before planned maintenance that will take production offline · **Kind:** 2 operator
**Evidence:** see `docs/sops/evidence.md#pause-uptime-monitor`

## Before you start
- You can open the repo's **Actions** tab on GitHub.
- The monitor is the **uptime** workflow. It checks production every 15 minutes. If a check fails, it opens one GitHub issue labelled `uptime` titled "Production is down". Later failures add comments to that issue. When a check passes again, it closes the issue.
- Nobody has tried pausing this workflow in a drill. The pause and resume steps below are marked unverified. Read them before relying on them.

## Steps
1. Open the **uptime** workflow: https://github.com/westmatty92-alt/baseleap-devops-sandbox/actions/workflows/uptime.yml
2. ⚠ unverified: pause the workflow. Click the **…** menu at the top right of the workflow page, then **Disable workflow**. Would be verified by doing this once in the sandbox and recording the exact button names.
3. ⚠ unverified: check that the page now says the workflow is disabled, and note the time. Would be verified by the same sandbox test.
4. Do your maintenance.
5. When production is back, check https://baseleap-devops-sandbox.vercel.app/api/health. Check that `status` is `ok`.
6. ⚠ unverified: turn the monitor back on. On the same workflow page, click **Enable workflow**. Would be verified by the same sandbox test.
7. Click **Run workflow** to run a check now, if the page offers it. The workflow allows manual runs.
8. Open the run. Check that it finishes green.
9. Open the repo's **Issues** tab and filter by the `uptime` label. If an issue is still open from before the pause, the next passing check closes it. Check this happens.

## What you should see
- While paused: no new uptime runs and no new "Production is down" issues.
- After resuming: a green uptime run, and no open issue labelled `uptime`.

## If it goes wrong
- **You forgot to resume:** nothing watches production. An outage would raise no alert. Resume as soon as you notice. Put a reminder in your calendar when you pause.
- **A "Production is down" issue opened anyway:** a check ran before the pause. Do nothing. It closes itself on the first passing check after maintenance. Do not close it by hand unless the site is up.
- **The issue stays open after you resume and the site is up:** the check may be failing for another reason. Open the latest uptime run and send Baseleap a screenshot. Each failing check takes about 2 minutes because it retries (drill 6).
- **The run fails with "PRODUCTION_URL is not set":** that is a setup problem, not an outage, and no issue is opened. Ask Baseleap to check the repository variable.
- **A button is not where this SOP says:** stop and send a screenshot. Do not guess.
- Do not change the `PRODUCTION_URL` variable to pause the monitor. A wrong address makes checks fail and opens a false outage issue (drill 6 did this on purpose).
- Deeper detail: `docs/runbook.md` ("At a glance", "Incidents").

## Changelog
- 2026-11-18 — New SOP, with the pause and resume steps unverified — written from uptime.yml and drill 6; no pause drill exists (step DOC1)
