# DOC4 — install guide: the Baseleap dev team on a fresh machine (kind 3)

Agent: bl-docs · Skills: docs-install, docs-evidence, docs-sop · Not published. Not committed.

## What I wrote
- `docs/sops/3-install/dev-team.md` — from `.claude/skills/docs-install/templates/team-install.md`. Kit version named: `132833a` (the kit sync commit `1cae954`); installer v1.
- `docs/sops/evidence.md` — new section `dev-team`.
- `docs/sops/changelog.md` — one line (DOC4).
- `node scripts/sop-check.mjs docs/sops --kit` → 4 SOPs, **0 errors**, 21 unverified step(s) (18 in this guide, 3 in the older uptime SOP). No client names, no secret-looking strings.

## Status: written from evidence, NOT verified by a cold run
The guide says so in its header ("Verified: not yet"). Nobody has followed it on a clean machine. The only run behind it is the installer v1 container drill of 2026-11-15, which is reported in `.claude/skills/ops-machine/SKILL.md` (run 1 = 15 changes, run 2 = 0 changes, kit tests 134/134). The drill log is not in this repo. I did not re-run it: no clean container or machine was available in this step, and I did not execute the installer. I read `install.sh` and `container-drill.sh` line by line instead. I did not run a syntax check on them (the command needed approval).

## What the evidence backs
- All commands, messages, field names, timer times, heartbeat check names and paths come from `templates/install.sh`, `machine.example.json` and `container-drill.sh`.
- Production keys never on the machine: ops-machine SKILL.md §1, `bl-devops.md`, the template line.
- Each client uses their own accounts; no client details in the kit; no inbound ports; sudo only for apt; Ubuntu 24.04; refuses root.

## What is still unverified (`⚠ unverified:` in the guide)
1. How the `infra/machine` folder reaches a fresh machine (the drill copied it from a read-only mount).
2. Claude Code sign-in screens and button names.
3. Sleep prevention (SKILL.md says the machine never sleeps; the installer changes no power setting).
4. Disk encryption: required or not; how.
5. Behaviour without passwordless sudo (the installer uses `sudo -n`; the drill used a broad `NOPASSWD:ALL` rule).
6. `systemctl --user is-enabled …` printing `enabled` and `loginctl … Linger` printing `yes` on a real machine. The drill had no systemd user session.
7. The Baseleap-side Console / "Needs you" view of the heartbeat.
8. Which folder to start the team in, and the first small task (the start command itself is from the orchestrator's file).
9. Per-project account settings beyond `machine.json`.
10. Remote access (the template mentions it; nothing sets it up).
11. Token rotation and revocation; sign-out.
12. Removal: the disable command and the paths are worked out from what the installer creates. The installer has no remove mode. Wipe method.
13. Whether Baseleap ever logs in to the machine.

## Findings for the orchestrator (I did not fix any of these)
- **`infra/machine/` does not exist in this repo.** `ops-machine` says the installer ships as `infra/machine/install.sh`, and the drill expects it there. Only the templates are present. A person cannot follow the guide until the kit repo has that folder and the guide can name where to get it.
- **The runbook's setup/update/recovery/decommissioning section is missing.** `ops-machine` §2 promises it. `docs/runbook.md` is the app's runbook. That is why Removal is mostly unverified.
- **`build-specs` and the packaging decisions are not in this repo.** I made no price or package statements.
- **The `team-install.md` template has no `## Steps` or `## If it goes wrong` section**, which `sop-check` requires. I kept the template headings and added `## Steps` (a short ordered overview of the whole job) and `## If it goes wrong`. Suggest updating the template (it is not one of my files).
- **The drill grants `agent ALL=(ALL) NOPASSWD:ALL`.** The installer only needs passwordless `apt`. Someone should decide the narrowest rule for real machines, and the guide should then say it.
- **The installer's only post-install check is a printed command** (`. ~/.profile && claude`). Nothing checks sign-in later. The heartbeat's `claude-missing` check only tests that the binary exists.

## Exact commands a person would type, in order
`<path-to-kit>` is the kit folder on the machine (how it gets there is unverified). Run as the agent's normal user, not root.

Drill-only setup, as root, and only when no normal user exists. These are from `container-drill.sh`, not part of the guide:
```
useradd -m -s /bin/bash agent
echo 'agent ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/agent
chmod 440 /etc/sudoers.d/agent
```
The guide itself:
```
1.  mkdir -p ~/src
2.  cp -r <path-to-kit>/infra/machine ~/src/machine
3.  cp ~/src/machine/machine.example.json ~/machine.json
4.  (edit ~/machine.json in any text editor — human; replace every < > value)
5.  bash ~/src/machine/install.sh ~/machine.json
6.  . ~/.profile && claude                       # HUMAN ONLY: owner signs in with their own account
7.  cat ~/.baseleap/heartbeat.json
8.  git -C ~/baseleap-kit rev-parse HEAD
9.  cat ~/.baseleap/state/kit-tests
10. systemctl --user is-enabled baseleap-kit-update.timer baseleap-heartbeat.timer
11. loginctl show-user "$USER" -p Linger --value
12. bash ~/src/machine/install.sh ~/machine.json   # second run; expect "summary  0 changed"
13. claude --agent bl-orchestrator --permission-mode default    # first run; ⚠ unverified folder and task
```
Optional, from Support, Configure and "If it goes wrong":
```
bash ~/.baseleap/bin/install.sh ~/.baseleap/machine.json kit-update
bash ~/.baseleap/bin/install.sh ~/.baseleap/machine.json heartbeat
loginctl enable-linger $USER            # as root, only if the installer warns it could not enable linger
```
Removal (⚠ unverified, never run):
```
systemctl --user disable --now baseleap-kit-update.timer baseleap-heartbeat.timer
```
then delete `~/.baseleap`, `~/baseleap-kit`, `~/.config/systemd/user/baseleap-*` and the `# baseleap-machine: PATH` lines in `~/.profile` by hand.

Commands 1 and 3 are my wording of the drill's setup steps. Commands 5, 6 and 12 are copied from the drill and the installer's own printed text. Commands 7–11 come from the drill's checks and the commands the installer itself runs. Command 13 is from the orchestrator's agent file.

## Publish
Not published. When it is, it goes under the SOP hub as kind 3. Re-check it first once `infra/machine/` exists and someone has done a cold run.
