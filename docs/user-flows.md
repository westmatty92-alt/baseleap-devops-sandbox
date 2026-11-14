# User flows: Northside Plumbing Tech Job Board

Brand: `DESIGN.md` (the Baseleap contract, used as is). Stories: `docs/user-stories.md`. Specs for every screen and state: `docs/design-specs.md`. Mockups: `design/mockups/`, screenshots: `docs/design/screens/`.

Two people use this: **technicians** on a phone at 390 px, **the owner** on a phone or a laptop at 1280 px. Times are Hamilton, ON.

## Screen inventory

| ID | Screen | Stories | Access | Conversion | Data needs |
|---|---|---|---|---|---|
| SCR-01 | Sign in | US-001, US-006 | public | yes | A typed email address. Whether it is on the active team list is never shown. Needs: "link sent" message, "wait a minute" message, "could not send" message. |
| SCR-02 | Link expired | US-001 | public | no | Nothing about a person. Shown when a sign-in link is older than 60 minutes or was already used. Offers a form for a new link. |
| SCR-03 | Day board | US-001, US-004, US-005, US-006, US-007, US-009, US-010 | signed-in | yes | For the chosen day (default today in Hamilton time), every job of every technician in time order, ties by earliest created. Each job: title, start time, address, customer name and phone if entered, notes if entered, assigned technician's name (with "(removed)" if they were removed), status. Who is signed in and their role (owner or technician) to decide which controls show. The count of jobs for the day. The Hamilton date for "Today". |
| SCR-04 | Job detail | US-007, US-008, US-009 | signed-in (owner-only controls) | no | One job with all its fields, its date, its status and a way to know if it changed since it was opened (for the "updated by someone else" message). The signed-in person's role and whether the job is assigned to them. |
| SCR-05 | Job form (create and edit) | US-003, US-006, US-008, US-010 | owner-only | yes | The list of active technicians (names only). For edit: the job's current values and status. Rules for each field (required, length, phone and date format). Whether the chosen technician is still on the team at save time. |
| SCR-06 | Team | US-002, US-011 | owner-only | no | Everyone on the team list: name, email, role, active or removed. The add form's rules (name 1 to 60 characters, valid email up to 254, no duplicates, re-adding a removed email makes that person active again). The owner's row cannot be removed. |
| SCR-07 | Offline | US-005 | public | no | No data. Shown by the installed app when it starts with no connection. |
| SCR-08 | Not allowed | US-002, US-003, US-007 | signed-in | no | Only the signed-in person's role. Shown when a technician opens an owner-only address. No job or team data is returned. |

US-012 (tap to call, tap for maps) and US-013 (live updates) are P2 and not part of the approved scope, so they have no screen in this set. The cards leave room for both. See `docs/design-specs.md`, "Criteria with no UI".

US-006 is the definition-of-done test, not a screen. It drives SCR-01 (sign in), SCR-05 (owner creates a job and assigns it) and SCR-03 (Tech A and Tech B see it at 390 px), so those three carry it. The health URL has no screen.

## Navigation

- **Signed out:** every address goes to SCR-01. A link from an email goes to the board if it is good, or to SCR-02 if it is expired or used.
- **Technician:** header with the app name, "Signed in: Tech A · Technician" and a **Sign out** button. One place to go: **Board** (SCR-03). From a card, **Open job and notes** goes to SCR-04. Technicians never see **Team** or **New job**.
- **Owner:** the same header plus **Board** and **Team** (SCR-06). On a phone these sit as two tabs under the app name. On a laptop they are a left side column. **New job** sits beside the job count on the board and opens SCR-05.
- **Installed app:** opens on today's board. With no connection it shows SCR-07.
- **Direct addresses:** a technician who opens the Team or New job address sees SCR-08.

## Flows

### F1 · Sign in (US-001)
1. SCR-01: type email, tap **Email me a link**.
2. SCR-01 shows "If this email is on the team, a link is on its way". It is the same words for a listed and an unlisted email.
3. The person opens the link from their email. A good link lands on SCR-03 (today). An old or used link lands on SCR-02.
4. SCR-02: type email, tap **Email me a new link**, back to step 2.

### F2 · Technician checks the day and updates a job (US-004, US-007)
1. Open the installed app or the web address. SCR-03 shows today.
2. Scan the jobs in time order. The technician's own jobs have a "Your job" tag and a status control.
3. Tap **In progress** or **Done** on an own job. The badge changes at once. The change is saved.
4. For notes: tap **Open job and notes** (SCR-04), type, tap **Save notes**.
5. Other technicians' jobs open read-only.

### F3 · Owner enters a job and assigns it (US-003, US-010)
1. SCR-03 (owner): tap **New job**.
2. SCR-05: fill job title, technician, date (starts on the day being viewed), start time, address, and optional customer details and notes. Tap **Save job**.
3. Back on SCR-03 for that day, the job appears in time order, Scheduled, with the technician's name.

### F4 · Owner changes a job (US-008, US-009)
1. SCR-03 (owner) or SCR-04: tap **Open job**, then **Edit job** (SCR-05, edit mode) to change fields or reassign. Tap **Save changes**.
2. To change only the status, use the status control on SCR-04.
3. To cancel: **Cancel job** on SCR-04, then confirm "Cancel this job?". The job stays on the board marked Cancelled.
4. To restore: open the cancelled job and pick a status.

### F5 · Owner manages the team (US-002, US-011)
1. SCR-03 or any owner page: **Team** (SCR-06).
2. Add: name and email, **Add team member**. The person appears under "On the team". No email is sent. They ask for their own link on SCR-01.
3. Remove: **Remove** beside a technician, then confirm "Remove Tech C?". The person moves to "Removed". Their name stays on past jobs with "(removed)".
4. Add back: type the removed person's email again. They return to "On the team".

### F6 · Look at another day (US-010)
1. SCR-03: **Previous day**, **Next day**, or the date button (opens the phone's date picker).
2. A **Today** button appears whenever the day is not today.

### F7 · Put the board on the home screen (US-005)
1. SCR-03 shows a small card with steps for iPhone and Android, with **Not now**. It is shown once per phone until dismissed, and never inside the installed app.
2. After install, the icon opens SCR-03 full screen. With no signal it opens SCR-07.

## Edge paths

| Case | Where it is designed |
|---|---|
| Unlisted or mixed-case or padded email (AC-001.3, AC-001.4) | SCR-01 sent state, identical for everyone |
| Second link within a minute (AC-001.5) | SCR-01 wait state |
| Expired or used link (AC-001.6) | SCR-02 |
| Signed-out visit to a board address (AC-001.7) | Goes to SCR-01, no job data |
| Email service down (AC-001.8) | SCR-01 failed state |
| Sign out (AC-001.9) | **Sign out** button in the header of every signed-in screen, returns to SCR-01 |
| Add person with bad, long, or duplicate details; dropped connection (AC-002.3, AC-002.4, AC-002.5, AC-002.7) | SCR-06 states |
| Technician opens an owner-only address (AC-002.6, AC-003.9) | SCR-08; no owner controls on SCR-03 or SCR-04 for technicians |
| Create job: missing, long or bad fields, double tap, removed technician, dropped connection (AC-003.3, AC-003.4, AC-003.5, AC-003.6, AC-003.10, AC-003.11) | SCR-05 states |
| Past time, markup in notes (AC-003.7, AC-003.8) | SCR-05 and SCR-03 states |
| Empty day, long text, 50 jobs, failed load, refresh (AC-004.5, AC-004.7, AC-004.9, AC-004.10, AC-004.11) | SCR-03 states |
| Install on iPhone, offline start (AC-005.3, AC-005.5) | SCR-03 install card, SCR-07 |
| Technician edits another's job, locked fields, cancelled job, any-to-any status, notes length, stale save, double tap, dropped connection (AC-007.3 to AC-007.10) | SCR-03 and SCR-04 states |
| Owner edit errors, removed technician not offered, stale save, dropped connection (AC-008.4 to AC-008.7) | SCR-05 and SCR-04 states |
| No delete, cancel confirm, restore, cancel twice, dropped connection (AC-009.2 to AC-009.6) | SCR-04 states |
| Today button, empty other day, bad date, failed load of another day (AC-010.4, AC-010.5, AC-010.6, AC-010.8) | SCR-03 and SCR-05 states |
| Remove technician: not offered after, own row, re-add, confirm No, dropped connection (AC-011.3 to AC-011.7) | SCR-06 and SCR-05 states |

## Conversion

The two goals that matter are "a technician opens the board" (the adoption metric) and "the owner enters a job" (what feeds the board). Sign-in is the gate to both. SCR-01, SCR-03 and SCR-05 are marked as conversion screens. The paths are in `docs/design-specs.md`, "Conversion path".
