# Install the Baseleap dev team on a new machine

**Purpose:** A working Baseleap dev team on an always-on Ubuntu machine that the owner controls (Baseleap's own mini PC, or a client's), kept up to date from the kit and reporting its health to Baseleap.
**Who:** The machine's owner or operator, with Baseleap on hand for the sign-ins and the settings Baseleap supplies · **When:** A new machine, a replaced machine, or a full reinstall · **Kind:** 3 install
**Kit version:** `132833a` (kit sync commit); installer v1 · **Verified:** not yet. Installer v1 was drilled in a clean Ubuntu 24.04 container on 2026-11-15 (see `docs/sops/evidence.md#dev-team`). Nobody has followed this guide cold on a clean machine.
**Evidence:** see `docs/sops/evidence.md#dev-team`

Steps marked `⚠ unverified` have nothing behind them yet. Do not rely on them until someone has run them.

## What the client gets
- A set of AI agents that build software in stages, run from Claude Code on this machine. Each one does one job:
  - **bl-orchestrator** leads the team and plans the build.
  - **bl-pm** writes the requirements.
  - **bl-designer** designs the screens.
  - **bl-architect** designs the system and sets up the project skeleton.
  - **bl-frontend** builds the screens.
  - **bl-backend** builds the server side and the database.
  - **bl-integration** connects to other systems.
  - **bl-devops** sets up environments, checks and releases.
  - **bl-qa** tests what was built.
  - **bl-security** checks for security problems.
  - **bl-reviewer** reviews the work.
  - **bl-docs** writes the instructions to run what was built.
- A machine that looks after itself: it checks for a new kit version every day, installs it only if the kit's own tests pass, and sends a health report every 15 minutes.
- Nothing is sent in. The machine opens no inbound ports. It only reports out.

## Steps
This is the whole job in order. Each part has its own section below.
1. Get the machine ready (**Before you start**).
2. Copy the installer onto the machine and fill in the machine settings (**Install**, steps 1 to 3).
3. Run the installer (**Install**, step 4).
4. Sign in to Claude Code by hand (**Install**, step 5). Only a person can do this.
5. Check the result and run the installer a second time to prove it changes nothing (**Install**, steps 6 and 7).
6. Start the team and check the first run (**First run**).

## Before you start
- **Machine:** an always-on mini PC or similar, running **Ubuntu 24.04**. The installer is written for Ubuntu 24.04 only (`install.sh` header). Intel/AMD (x86_64) and ARM (aarch64) are both handled.
- **Always on:** the machine must never go to sleep, and its scheduled jobs must survive a reboot. The installer handles the jobs. ⚠ unverified: how to stop the machine sleeping — would be verified by a power-settings step run on a real machine. The installer does not change power settings.
- **Disk encryption:** ⚠ unverified: whether it is required, and how to turn it on. No decision is written down in the kit.
- **A normal user.** Run everything as the agent's normal user, never as root. The installer refuses to run as root.
- **Passwordless sudo for that user.** The installer uses `sudo` only to install packages (`apt`), and it runs it without asking for a password. In the drill, the test user had a rule that allowed this. ⚠ unverified: what you see on a machine without passwordless sudo, and the narrowest rule that works. Ask Baseleap before changing sudo settings.
- **Internet access** to Ubuntu's package servers, `nodejs.org`, the npm registry and the kit source.
- **The kit, as a folder on this machine.** You need the `infra/machine` folder from the Baseleap kit. It holds `install.sh` and `machine.example.json`. ⚠ unverified: how Baseleap hands you this folder (copy from a USB stick, `scp`, or a download). The drill copied it from a read-only mount. Ask Baseleap which way to use.
- **Settings Baseleap gives you** for the machine file (see **Install**, step 3): the machine id, the kit source, the kit tag, and the heartbeat address.
- **Accounts the owner owns.** Each client uses their own accounts: their own Claude account or API key, their own GitHub, their own providers. Never Baseleap's.
- **Who signs in:** the owner signs in to Claude Code, by hand, on this machine. Nobody else signs in for them.
- **Production keys never go on this machine.** The team never holds production credentials. Production releases go out only through the approved release workflow, after a person approves. Do not type, copy or save a production key here. ⚠ unverified: which accounts the team will need beyond Claude Code (for example GitHub). The machine installer does not ask for them, and no packaging decision in the kit lists them.

## Install
1. Make a place for the installer, and copy the `machine` folder into it. In these commands, `<path-to-kit>` is where you put the kit folder from "Before you start". Replace it with the real path.
   ```
   mkdir -p ~/src
   cp -r <path-to-kit>/infra/machine ~/src/machine
   ```
   You should now have `~/src/machine/install.sh` and `~/src/machine/machine.example.json`.
2. Copy the example settings file. The installer never reads the example. It reads your copy.
   ```
   cp ~/src/machine/machine.example.json ~/machine.json
   ```
3. Open `~/machine.json` in a text editor and replace every value in angle brackets `< >`. (The installer will refuse placeholders.) Keep the quotes and commas. The fields:

   | Field | What to put |
   |---|---|
   | `machine_id` | A short name for this machine, such as `mini-pc-01`. Only letters, digits, `.`, `_` and `-`. |
   | `operator` | Who approves things on this machine. |
   | `client_id` | The Baseleap client id for a client machine, or `baseleap` for Baseleap's own. |
   | `teams` | Leave as `["dev"]` for the dev team. |
   | `timezone` | A timezone name such as `America/Toronto`. This is the example's value. |
   | `kit_channel` | `stable` (follows a tag or commit; the default) or `edge` (may follow a branch). Use `stable` unless Baseleap says otherwise. |
   | `kit_source` | Where the kit comes from: the full path to a kit git bundle on this machine, or an `https`, `ssh` or `git` address. Never put a password or token in the address. |
   | `kit_ref` | The kit tag or commit to run. With `stable` it must be a tag or commit, not a branch. |
   | `heartbeat_url` | The health-report address Baseleap gives you (starts with `https://`). Leave it as `""` to turn the report off. |

   - Do not add passwords, tokens or keys to this file. The installer stops if a field name looks like one.
   - The `heartbeat_url` may contain a private part. Do not paste it into chats, tickets or other files.
   - This file stays on this machine. Never commit it.
4. Run the installer.
   ```
   bash ~/src/machine/install.sh ~/machine.json
   ```
   - It prints one line per check: `ok` (nothing to do), `changed` (it did something), `info`, `skip` or `warn`.
   - It installs a few base packages, a checked copy of Node.js, Claude Code (a fixed version), the kit, and the scheduled jobs. A first run on a clean container made 15 changes.
   - It never asks for, stores or prints a secret.
   - At the end it prints `summary  N changed` and the next step. If any line starts with `FAILED`, stop and go to "If it goes wrong".
5. **Human only: sign in to Claude Code.** The installer never signs in. As the owner, type:
   ```
   . ~/.profile && claude
   ```
   Then sign in with the owner's own account when Claude Code asks. ⚠ unverified: the exact sign-in screens and button names. They were not captured in any run. Write them down the first time a person does this.
6. Check the install. Each command should print what is described.
   ```
   cat ~/.baseleap/heartbeat.json
   git -C ~/baseleap-kit rev-parse HEAD
   cat ~/.baseleap/state/kit-tests
   systemctl --user is-enabled baseleap-kit-update.timer baseleap-heartbeat.timer
   loginctl show-user "$USER" -p Linger --value
   ```
   - The first shows your `machine_id` and `client_id`, `kit_commit`, and `"failing_checks": []`.
   - The second shows the kit commit the machine is running. It should be the commit your `kit_ref` points to.
   - The third shows `pass` followed by the same commit.
   - The fourth prints `enabled` twice.
   - The fifth prints `yes`.
7. Run the installer a second time. It must change nothing.
   ```
   bash ~/src/machine/install.sh ~/machine.json
   ```
   The last line before "Next step" should read `summary  0 changed`. This is how you know the install is stable.
8. Confirm the machine is visible to Baseleap. Ask Baseleap to confirm it can see the machine in the "Needs you" feed, with the right `machine_id` and kit commit. ⚠ unverified: what the Console shows and how long it takes. The installer only writes the report and sends it (a `heartbeat POSTed (HTTP 2xx)` line means the address accepted it). No run has confirmed it on the Baseleap side.

## Configure
1. Everything this machine needs is in `~/machine.json`. Change a value there, then run the installer again (**Install**, step 4's command). The installer copies the file to `~/.baseleap/machine.json`, and the scheduled jobs use that copy.
2. To change which kit version the machine runs, change `kit_ref` and run the installer again. It tests the new version first and switches only if the tests pass.
3. ⚠ unverified: the team's per-client settings beyond the machine file (for example which accounts the team connects to for a project). They are set per project, outside this machine file. No evidence yet shows how.

## First run
1. Start the team. The orchestrator runs as the main session:
   ```
   claude --agent bl-orchestrator --permission-mode default
   ```
   ⚠ unverified: which folder to start it in, and the first small task to give it. The command is the one in the orchestrator's own file. Nobody has run it on an installed machine. It would be verified by a person giving the team a small task on a clean machine and recording what happens.
2. Until that is verified, "first run" means the checks in **Install**, steps 6 and 7.

## Handoff
- **The client's people:** keep the machine powered on and online. Keep it away from other uses. Sign in to Claude Code with the owner's account. Approve releases when asked (the approval is a person's click in GitHub; the machine cannot approve for them). Do not put production keys on the machine.
- **Baseleap:** supplies the kit, the machine settings and the heartbeat address. Publishes new kit versions. Watches the health report. ⚠ unverified: whether Baseleap ever logs in to the machine; no remote access is set up by the installer.
- ⚠ unverified: who holds remote access and how it is set up. The installer opens no inbound ports. The template mentions "remote access" and no step in the kit sets it up.

## Support
- **Updates are automatic.** Every day at about 03:30 (machine time, with up to 30 minutes of random delay) the machine fetches the kit, tests it, and switches only if the tests pass. If the tests fail, it stays on the old version and says so. To check or force one by hand:
  ```
  bash ~/.baseleap/bin/install.sh ~/.baseleap/machine.json kit-update
  ```
- **Health report.** Every 15 minutes, starting 2 minutes after boot, the machine writes `~/.baseleap/heartbeat.json` and sends it to Baseleap. To write it now:
  ```
  bash ~/.baseleap/bin/install.sh ~/.baseleap/machine.json heartbeat
  ```
- **The report names its own problems** in `failing_checks`: `node-missing`, `claude-missing`, `kit-missing`, `kit-tests-failing`, `units-missing`, `disk-low` (under 10% free disk). A heartbeat with an empty list is healthy.
- **If the heartbeat goes quiet at Baseleap:** check the machine is on and online, then run the `heartbeat` command above and read the last lines. A `warn  heartbeat POST failed` line means the machine could not reach the address; it retries on the next run.
- **Logs:** `~/.baseleap/logs/`. Kit test logs are named `kit-test-<commit>.log`.
- **Rotating sign-ins:** ⚠ unverified: the steps to rotate or revoke the owner's Claude Code sign-in and any other token. No procedure is written down yet.

## Removal
Use this when the machine is retired, replaced or returned.
1. ⚠ unverified: sign out of Claude Code, and revoke any token the owner created for this machine, in the owner's own account pages. Would be verified by following the steps on a test machine and recording the exact buttons.
2. ⚠ unverified: stop the scheduled jobs and remove the kit:
   ```
   systemctl --user disable --now baseleap-kit-update.timer baseleap-heartbeat.timer
   ```
   Then delete `~/.baseleap`, `~/baseleap-kit`, `~/.config/systemd/user/baseleap-*` and the `# baseleap-machine: PATH` lines in `~/.profile`. The installer has no remove mode. These steps are worked out from what it creates, and nobody has run them.
3. ⚠ unverified: confirm in the "Needs you" feed that the heartbeat has stopped. Ask Baseleap to check.
4. If the hardware is returned or sold, wipe the disk. ⚠ unverified: the wipe method. No procedure is written down.

## If it goes wrong
- **`machine.json missing or placeholder required field(s): …`** The installer lists the fields. Open `~/machine.json`, replace each placeholder (anything in `< >`), and run it again. Nothing has been installed beyond `jq` at this point.
- **`machine.json has a key that looks like a secret`** A field name contains `key`, `token`, `secret` or `passw`. Remove it. Credentials never go in this file.
- **`kit_source must not embed credentials`** Take the user name and password out of the address. Use the owner's own git sign-in or a deploy key.
- **`kit_ref '…' is a branch; channel 'stable' needs a tag or commit`** Use a tag or commit, or ask Baseleap about the `edge` channel.
- **`kit_ref '…' not found in the kit source`** The tag or commit is not in the kit source. Check the spelling with Baseleap.
- **`kit_source path does not exist`** or **`fetch from kit source failed`** The machine can't reach the kit. Check the path, or the network and the owner's git access.
- **`kit tests failed … NOT switching`** The new kit version did not pass its tests, so the machine stayed where it was. Send Baseleap the log named in the message (in `~/.baseleap/logs/`). Do not edit the kit by hand.
- **`… exists and is not a kit checkout; move it aside`** Something else already uses `~/baseleap-kit`. Rename it, then run the installer again.
- **`run as the agent's normal user, not root`** Log in as the normal user and run it again.
- **A `sudo` or `apt` error on the first run.** ⚠ unverified: the exact message when passwordless sudo is missing. Ask Baseleap.
- **`warn  could not enable linger`** Run `loginctl enable-linger $USER` as root once. Without it, the jobs stop after a reboot with nobody logged in.
- **`skip  no systemd user session here`** The machine has no user session (normal inside a container, not on a real machine). The installer printed the commands it would have run. On a real machine, log in properly (not just `su`) and run the installer again.
- **`kit-tests-failing` or `disk-low` in the heartbeat.** See "Support".
- **A screen asks you to pay or upgrade** at any account, or something looks different from this guide: stop and send Baseleap a screenshot. Do not guess.
- **The installer fails part-way.** It is safe to run again. Every step checks first and only does what is missing.

## Changelog
- 2026-11-18 — New guide, written from the ops-machine installer v1 templates and the container drill (kit `132833a`). Not yet run on a clean machine; sign-in, remote access, first task and removal steps are unverified (step DOC4)
