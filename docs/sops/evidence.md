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

## dev-team
File: `docs/sops/3-install/dev-team.md` (kind 3; kit `132833a` = the kit sync commit `1cae954`; installer v1)
- Header, "Before you start" (Ubuntu 24.04, normal user not root, sudo only for apt, never sleeps, no inbound ports, each client uses their own accounts, no client details in the kit): `.claude/skills/ops-machine/SKILL.md` §1; `install.sh` header and `main()` (refuses root). Production keys never on the machine: `ops-machine` SKILL.md §1 ("No secrets"), `.claude/agents/bl-devops.md` ("you hold no production credentials"), the `team-install.md` template line.
- "What the client gets" (agent list): `.claude/agents/*.md` descriptions. Daily update and 15-minute heartbeat: `install.sh` `ensure_units` (03:30 with up to 30 min random delay; 2 min after boot, then every 15 min).
- Install steps 1–3: `container-drill.sh` (copies `infra/machine` to a `src/machine` folder, writes `machine.json`); `machine.example.json`; `install.sh` `validate_config` (required fields, placeholder rule, key-name rule, stable needs a tag or commit, no credentials in kit_source, https heartbeat or empty). `mkdir -p ~/src` and `cp … ~/machine.json` are the writer's wording of the drill's setup.
- Install step 4 (command, ok/changed lines, 15 changes): `container-drill.sh` RUN 1; `ops-machine` SKILL.md §2 ("run 1 = 15 changes").
- Install step 5 (`. ~/.profile && claude`): printed by `install.sh` `main()`. Sign-in screens: ⚠ no evidence.
- Install step 6 (heartbeat file, kit HEAD, kit-tests state): `container-drill.sh` HEARTBEAT, KIT HEAD, KIT TEST STATE sections; `write_heartbeat`, `write_test_state`. The `is-enabled` and `show-user … Linger` commands are the ones `ensure_units` runs itself. The drill ran in a container with no systemd user session, so nobody has seen them print `enabled` / `yes`.
- Install step 7 (second run changes nothing): `container-drill.sh` RUN 2; SKILL.md §2 ("run 2 = 0 changes, kit tests 134/134 inside").
- Install step 8 (Console sees the machine): ⚠ no evidence. Installer side only: `post_heartbeat`.
- Configure 1–2: `ensure_local_copies`, `kit_sync`, `resolve_target`. Configure 3: ⚠ no evidence.
- First run command: `.claude/agents/bl-orchestrator.md` description (`claude --agent bl-orchestrator --permission-mode default`). The folder and the task: ⚠ no evidence.
- Support (kit-update and heartbeat commands, failing_checks names, disk-low at 10%, logs, timer times): `install.sh` usage text, `write_heartbeat`, `kit_sync`, `ensure_units`. Rotation: ⚠ no evidence.
- Removal 2: the disable command mirrors the installer's `systemctl --user enable --now`; the paths are what the installer creates. The installer has no remove mode and the runbook's decommissioning section is not in this repo. ⚠ never run. Removal 1, 3, 4: ⚠ no evidence.
- "If it goes wrong" messages: exact strings from `install.sh` (`validate_config`, `kit_sync`, `ensure_units`, `main`). The missing-sudo message: ⚠ not seen.
- Not backed: disk encryption, sleep settings, how the installer folder reaches the machine, remote access, the Baseleap-side Console view. The packaging decisions and the `build-specs` ops-machine notes are not in this repo, so the guide makes no price or package statement.
- Not run: nobody followed this guide cold. The 2026-11-15 container drill is reported in `ops-machine` SKILL.md only; its log is not in this repo. bl-docs did not re-run it (no clean machine or container in this step).
