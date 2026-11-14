# Design specs: Northside Plumbing Tech Job Board

Source of truth for look: `DESIGN.md` (Baseleap contract, used as is, no colours added). Tokens: `src/app/theme.css`, `docs/tokens.json`. Screens and flows: `docs/user-flows.md`. Mockups: `design/mockups/SCR-NN-*.html`. Screenshots at 390 px and 1280 px: `docs/design/screens/`. Mockup file names ending in `--name` are states of the same screen.

## Brand and tokens in use

- Page and header: Midnight (`surface`). Forms, empty states, dialogs' backdrop panels: Depth (`surface-raised`). Job cards, dialogs and the job detail panels: Canvas (`surface-light`) with Depth text. Canvas cards read well in sunlight, and the brand's 60 · 20 · 10 split holds.
- Volt (`accent`): primary buttons only, the active tab underline, the "Your job" strip on a card. Run (`secondary-action`): the Today button and "Show latest".
- Status always has an icon and a word. Scheduled: clock, outlined badge. In progress: half circle, Warning badge. Done: check, Success badge. Cancelled: cross, Error badge with Depth text, title struck through.
- Errors: White text with an Error icon and an Error border (never small Error-coloured text). Delete-like actions: Error outline with plain text.
- Type: Garet for titles (`h2`, `h3`, `h4` styles), Inter for everything else. Mockups can't load fonts without a network, so screenshots show the system fallback. The frontend loads Garet and Inter.
- **Size floor.** AC-004.13 needs 16 px body text and 44 px controls. So on phones every control label and all text is 16 px (`body`), with the Medium weight from `ui-label`. The 14 px `ui-label`, `body-sm` and 12 px `caption` sizes are not used. This is a use of existing tokens, not a new value.
- Spacing: only the `spacing` scale. Control height 44 px (from `button-primary`). Borders 1 to 4 px.

## Components

| Component | Where | Notes |
|---|---|---|
| App header | all signed-in screens | Phone: app name, **Sign out** (44 px), tabs and who-is-signed-in under it. Laptop: left column 240 px with the same items. |
| Day bar | SCR-03 | Title ("Today" or weekday), full date, Previous day, date button, Next day, Today (only when not today), Refresh. |
| Job card | SCR-03 | Time, status badge, title, address, customer line, notes, assigned technician, optional "Your job" tag, actions. Phone: one column. Laptop: time, details, status and actions in three columns. |
| Status control | SCR-03, SCR-04 | Three connected buttons. The current one is filled Midnight with a check. Shown only where the person may change status. |
| Button: primary / secondary / ghost / danger | all | Volt / Run / outlined / Error outline. 44 px high at least. Disabled looks dashed with the label changed ("Saving…"). |
| Field | SCR-01, 02, 04, 05, 06 | Label above, "(required)" marker in words, help text, error line with icon below. |
| Message | all | Left bar and icon: info, warning, error, success. White text on Midnight. |
| Dialog | SCR-04, SCR-06 | Canvas card over a Midnight scrim. The safe choice is the Volt button and comes first. The destructive one is an Error outline. |
| Panel | SCR-03, 07, 08 | Centered icon, one line of title, one line of help, one button. Used for empty, failed and offline. |
| People row | SCR-06 | Name, email, role, action. Phone: stacked. Laptop: one row. |

## Layout and responsive

- **390 px (technicians, owner on phone):** one column, 16 px side padding, no sideways scroll. Long titles and addresses wrap (`overflow-wrap`). Job cards stack. Buttons in forms and dialogs are full width.
- **1024 px and up (owner on a laptop):** the header becomes a 240 px side column. Content max width 960 px. Job cards use three columns. Forms use two columns for short fields. Dialogs buttons sit in a row.
- Breakpoints from `DESIGN.md`: 640 / 1024 / 1280. Nothing special is needed at 640.
- The board is a single scrolling list. 50 jobs a day is just a longer list, with no paging.
- No GHL embed in v1, so no embed width.

## Accessibility

- Contrast: all text pairs are from the measured list in `DESIGN.md` (White on Midnight, Depth on Canvas, Midnight on Volt, Midnight on Success and Warning, Depth on Error).
- Focus: 3 px Volt ring on dark, 3 px Midnight ring on Canvas. A "Skip to content" link is first on every page.
- Targets: every control is at least 44 by 44 px. Status buttons are 44 px high and share the width of a card.
- Landmarks: header, main nav ("Main"), main. One `h1` per page. Job cards are articles with an `h2` title.
- Forms: every field has a label and an error is tied to it with `aria-describedby` and `aria-invalid`. Errors and "Not saved" use `role="alert"`; counts and "4 jobs" use `role="status"`.
- Status buttons use `aria-pressed`. A disabled status control is announced as disabled.
- Dialogs: `role="alertdialog"`, focus moves to the safe button, Escape means No, focus returns to the button that opened it.
- Motion: 120 to 200 ms ease-out for state changes, off under `prefers-reduced-motion`. No skeleton shimmer.
- Never colour alone: status has icon and word, errors have icon and text, "Your job" has a tag as well as the Volt strip.
- Notes and other typed text are shown as plain text with line breaks kept, never as markup.

## Screens

### SCR-01 · Sign in

Centered card on Midnight. App name, "Sign in", one line of help, email field, **Email me a link**, one line saying only team members can sign in. The email field uses the email keyboard, no auto-capitalise. Mockups: `SCR-01-sign-in.html`, `--sent`, `--failed`.

| State | Design | AC |
|---|---|---|
| Empty | Empty email field, **Email me a link** active. | |
| Loading | Button reads "Sending…", dashed and disabled, field read-only. | |
| Error | Error message above the form: "We couldn't send the link. Try again in a few minutes". Typed email kept, button reads **Try again** (`--failed`). The failure is recorded for Baseleap. | AC-001.8 |
| Success | Whole card swaps to "Check your email" with "If this email is on the team, a link is on its way". Same words and layout for a listed, unlisted, mixed-case or space-padded email. Offers **Send another link** and **Use a different email** (`--sent`). | AC-001.3, AC-001.4 |
| Disabled | Button disabled while a request is in flight, so a double tap sends once. | |
| Too soon | Warning message above the form: "Wait a minute before asking for another link". Email kept, nothing is sent. | AC-001.5 |
| Not valid | Error beside the field: "Enter a valid email address, like name@example.com". Nothing is sent. | |
| Signed-out visit | Any board address sends the person here. No job data is loaded first. | AC-001.7 |
| After sign out | **Sign out** in the header ends the session and lands here. | AC-001.9 |

### SCR-02 · Link expired

Same card as SCR-01. Clock icon, "This link has expired or was already used", one line of why, email field, **Email me a new link**. Mockup: `SCR-02-link-expired.html`.

| State | Design | AC |
|---|---|---|
| Empty | The screen as shown, email empty. | AC-001.6 |
| Loading | Button reads "Sending…", dashed and disabled. | |
| Error | Same messages as SCR-01 (could not send, wait a minute) above the form. | AC-001.8, AC-001.5 |
| Success | Swaps to the SCR-01 "Check your email" card. | |
| Disabled | Button disabled while sending. | |

### SCR-03 · Day board

The screen everyone lives in. Header, day bar, job count, list of job cards. The owner also sees **Team** in the header and **New job** beside the count. Technicians never see **New job**, on any day. Mockups: `SCR-03-board.html` (technician), `--owner`, `--empty`, `--loading`, `--error`, `--other-day`, `--card-errors`, `--install`.

Card rules: the technician's own jobs get a "Your job" tag, a Volt strip and a status control. Other people's jobs show no status or notes control (a technician can still open them, read only). Cancelled jobs show "Cancelled" in the same position, a struck-through title and the line "This job was cancelled. Only the owner can change it." Removed technicians show as "Tech D (removed)". Notes keep their line breaks and show exactly as typed.

| State | Design | AC |
|---|---|---|
| Empty | Panel: "No jobs today" with a line of help. Owner also gets **New job** in the panel (`--empty`). On another day: "No jobs on" and the full date, for example "No jobs on Friday, November 13, 2026". It's an information screen, not an error. | AC-004.5, AC-010.5 |
| Loading | Three skeleton cards with "Loading jobs…" in the count line. The day bar stays usable (`--loading`). | |
| Error | Panel with alert icon: "Can't load the board. Check your connection", **Retry**. The chosen day stays on screen. No job data shown (`--error`). | AC-004.11, AC-010.8 |
| Success | Cards in time order, for example 09:00 Tech A, 11:00 Tech B, 13:00 Tech B, 15:30 Tech A. Everyone sees everyone's jobs. Two jobs at one time: the earlier-created is first (no visible difference). | AC-004.6 |
| Disabled | Status control on a job that cannot be changed (cancelled, or waiting on a save) is disabled and says why (`--card-errors`). Technicians have no other disabled controls. They simply don't see owner controls. | AC-007.3, AC-007.5, AC-003.9 |
| Own job status change | Tap a status: the badge changes, the save runs. Double tap records once. | AC-007.9 |
| Status change not saved | Message inside the card: "Not saved. Try again" with **Try again**. The control goes back to the saved status. | AC-007.10 |
| Stale card | Message inside the card: "This job was updated by someone else. Review the latest version" with **Show latest**. The other person's change is kept. | AC-007.8 |
| Cancelled card | As described above. Technician has no control. Owner can open it and restore it (SCR-04). | AC-007.5, AC-009.1 |
| Another day | **Today** appears next to the date button. Technicians see that day's jobs and notes and no **New job** (`--other-day`). | AC-010.3, AC-010.4 |
| Refresh | A visible **Refresh** button (installed iPhone apps have no browser reload, so a pull gesture alone is not enough). Pull to refresh is a bonus. A new job shows after refresh. | AC-004.9 |
| Long text and many jobs | Titles up to 100 and addresses up to 200 characters wrap in the card. Nothing scrolls sideways. 50 jobs is a longer scroll with no paging. | AC-004.7, AC-004.10 |
| Typed markup | Notes are plain text. `<script>` shows as text, with the line breaks kept. | AC-003.8 |
| Install card | Once per phone, in a browser tab only: "Add the job board to your home screen". Steps for iPhone (Share, Add to Home Screen) and Android (Install app). **Not now** hides it. Never inside the installed app (`--install`). | AC-005.3 |

### SCR-04 · Job detail

One job in full. Phone: details panel, then the update panel. Laptop: the two panels side by side. Technician on an own job: status control, notes box, **Save notes**. Owner: the same plus **Edit job** and **Cancel job**. Everyone else: read only with a line saying who can change it. There is no delete anywhere. Mockups: `SCR-04-job-detail.html` (own job), `--others`, `--owner`, `--confirm-cancel`, `--cancelled`.

| State | Design | AC |
|---|---|---|
| Empty | A job without customer name, phone or notes shows "Not entered" and "No notes yet." | |
| Loading | Details panel shows three skeleton lines and "Loading job…", no controls yet. | |
| Error | Same "Can't load" panel as the board, with **Retry**. | AC-004.11 |
| Success | After a status change the badge updates. After **Save notes** a message "Notes saved" appears and the box keeps the text. | |
| Disabled | **Save notes** is disabled while saving and when nothing changed. Status control disabled while saving. | AC-007.9 |
| Not mine | A technician opening another's job sees an info line: "This job is assigned to Tech B. Only Tech B and the owner can change it." No status or notes controls (`--others`). | AC-007.3 |
| Locked fields | Title, address, start time, customer details and technician are plain text for technicians. There is nothing to edit. | AC-007.4 |
| Cancelled | Technician: read only, "This job was cancelled". Owner: warning line and the status control with nothing selected, labelled "Restore with status". Choosing any status restores it and technicians can change it again (`--cancelled`). | AC-007.5, AC-009.4 |
| Any status | The three statuses can be picked from any other, including after Done. | AC-007.6 |
| Notes too long | Counter reads "2001 / 2000" and an error: "Notes can be up to 2000 characters. Shorten them to save." Nothing is saved. The typed text is kept. | AC-007.7 |
| Notes not saved | "Not saved. Try again" message, the typed note stays in the box. | AC-007.10 |
| Stale | "This job was updated by someone else. Review the latest version" with **Show latest**. The panel then shows the newest values. | AC-007.8, AC-008.6 |
| Double tap | The control disables on the first tap, so one change is recorded. | AC-007.9 |
| No delete | There is no delete control on any screen, for any role. | AC-009.2 |
| Confirm cancel | Dialog "Cancel this job?" with **No, keep the job** (default) and **Yes, cancel job**. **No** leaves the job unchanged (`--confirm-cancel`). | AC-009.3 |
| Already cancelled | If the job was cancelled by the time the owner confirms, the dialog closes and an info line says "This job is already cancelled". It stays Cancelled and nothing is recorded twice. | AC-009.5 |
| Cancel not saved | After confirming, a dropped connection shows "Not saved. Try again". The job stays active. | AC-009.6 |

### SCR-05 · Job form (create and edit)

Owner only. One form for both. Fields in order: job title, technician (only active technicians), date, start time, address, customer name, customer phone, notes. Edit mode adds a status choice (Scheduled, In progress, Done; cancel is done from SCR-04). The date starts on the day the owner was viewing. In the P0 build the date is fixed to today and shown as plain text. The date picker arrives with P1 (US-010). Buttons: **Save job** or **Save changes**, and **Back without saving**. Mockups: `SCR-05-job-form.html`, `--errors`, `--failed`, `--edit`. Note: `--edit` shows edit mode in its stale-save state, and `--failed` shows two separate outcomes together for review (a dropped connection, and a technician removed meanwhile).

| State | Design | AC |
|---|---|---|
| Empty | Blank form with the date filled. Required fields are marked "(required)". Past start times raise no warning. | AC-003.7 |
| Loading | While the technician list loads, the technician field shows "Loading technicians…" and **Save job** is disabled. | |
| Error | Summary line "Nothing was saved. Fix the 5 fields marked below." and an error beside each field: "Enter a job title", "Choose a technician", "Enter a start time", "Enter an address", "Enter a valid phone number". Nothing is saved (`--errors`). | AC-003.3, AC-003.5, AC-008.4 |
| Success | Back to the board for that day, with a message "Job saved" and the job in time order with the technician's name. Saved text matches what was typed. | AC-003.8 |
| Disabled | While saving, **Save job** reads "Saving…", dashed and disabled. A second tap does nothing, so one job is created. | AC-003.6 |
| Too long | Beside the field: "Up to 100 characters" (title, customer name), "Up to 200 characters" (address), "Up to 2000 characters" (notes). Exactly at the limit is accepted. | AC-003.4 |
| Bad date | "Enter a valid date" beside the date, for a year outside 2020 to 2100 or a day that doesn't exist. | AC-010.6 |
| Technician removed | Field error and message: "That technician is no longer on the team". Everything else is kept (`--failed`). | AC-003.10 |
| Not saved | Message at the top: "Not saved. Try again" and "Everything you typed is still here." Saving again creates one job (`--failed`). | AC-003.11, AC-008.7 |
| Stale edit | Warning: "This job was updated by someone else. Review the latest version". The form now shows the latest values. The other change is kept (`--edit`). | AC-008.6 |
| Technician choices | Only active technicians are listed. A removed technician is not offered when creating or reassigning. | AC-008.5, AC-011.3 |

### SCR-06 · Team

Owner only. Title, add form (name and email), "On the team" list, "Removed" list. The owner's row has a "You" tag and no **Remove**. Adding sends no email, and the screen says so. Mockups: `SCR-06-team.html`, `--errors`, `--confirm-remove`.

| State | Design | AC |
|---|---|---|
| Empty | A team with only the owner shows a line under "On the team": "Add your technicians above so you can assign jobs." The "Removed" list is hidden when empty. | |
| Loading | Three skeleton rows and "Loading the team…". | |
| Error | Message: "Can't load the team. Check your connection" with **Retry**. | AC-002.7 |
| Success | Message: "Tech A added to the team. They can request a sign-in link now." The person appears in the list. Adding a removed person's email shows "Tech D added back to the team" and moves them out of "Removed" with no duplicate row. | AC-002.1, AC-011.5 |
| Disabled | **Add team member** reads "Adding…" and is disabled while saving. **Remove** is disabled while its request runs. | |
| Form errors | "Enter a name". "Enter a valid email address, like name@example.com". Nothing is saved (`--errors`). | AC-002.4 |
| Too long | Names over 60 characters: "Names can be up to 60 characters". Emails over 254: "Emails can be up to 254 characters". Exactly at the limit is accepted (`--errors`). | AC-002.5 |
| Duplicate | "That email is already on the team", matching without caring about case. No second entry (`--errors`). | AC-002.3 |
| Not saved | "Not saved. Try again". Name and email stay in the form. | AC-002.7, AC-011.7 |
| Confirm remove | Dialog "Remove Tech C?" with **No, keep Tech C** (default) and **Yes, remove Tech C**. **No** leaves them active (`--confirm-remove`). | AC-011.6 |
| Own row | The owner's row has no **Remove** control. | AC-011.4 |

### SCR-07 · Offline

Shown full screen by the installed app when it starts without a connection. App name, a no-signal icon, "You're offline", one line of help, **Retry**. No job data. Mockup: `SCR-07-offline.html`.

| State | Design | AC |
|---|---|---|
| Empty | N/A — the screen is the empty state itself. | AC-005.5 |
| Loading | **Retry** shows "Trying…" and is disabled while it checks. | |
| Error | The screen stays and the line "Still no connection" is added above **Retry**. | AC-005.5 |
| Success | When the connection returns, **Retry** opens today's board (SCR-03). | |
| Disabled | **Retry** is disabled only while it checks. | |

### SCR-08 · Not allowed

Shown when a technician opens an owner-only address, or a request is refused. App header, "Not allowed", "This page is for the owner. Nothing was changed.", **Back to the board**. Mockup: `SCR-08-not-allowed.html`.

| State | Design | AC |
|---|---|---|
| Empty | N/A — the screen is a fixed message with no data. | |
| Loading | N/A — no data to load, the role is already known. | |
| Error | N/A — the screen is itself the refusal. If the role can't be checked the person goes to SCR-01. | |
| Success | **Back to the board** opens SCR-03. | AC-002.6, AC-003.9 |
| Disabled | N/A — no controls other than the one link. | |
| Direct requests | A refused change on a job shows "Not allowed" as a message in place, and the job is unchanged. | AC-007.3 |

## Conversion path

Plain version of conversion for an internal tool: get the person to the thing they came for with the fewest taps.

- **SCR-01 · Sign in → SCR-03.** Goal: sign in once and stay in for 30 days. Friction cut: no password, one field, email keyboard, the same words for everybody so nobody is stuck wondering. The sent screen says to open the link on the same phone and how long it lasts. Anxiety answered: "It works once and expires after 60 minutes", spam-folder hint, **Send another link**. Honest limit: the page never says whether an email is on the team.
- **SCR-03 · Day board.** Goal: a technician sees today's jobs. Friction cut: board opens on today, the next job is the first thing after the date, one tap to **In progress** or **Done**, no hunting for "my jobs" because everything is on one list with own jobs marked. Anxiety answered: "Not saved" never loses a tap silently, and stale changes are explained, not hidden. The install card shortens the route to one tap from the home screen.
- **SCR-05 · Job form → SCR-03.** Goal: the owner enters and assigns a job in under a minute. Friction cut: only four required fields, date and technician defaulted sensibly, phone and notes optional, times in the past accepted, form values kept on any failure. Anxiety answered: the technician list shows only people who can see the job, and the saved job appears on the board straight away.

No dark patterns. There is no marketing consent anywhere in this product, so no checkbox exists to pre-check.

## Criteria with no UI

| AC | Reason |
|---|---|
| AC-004.8 | The Toronto date is chosen by the server. The screen only shows the date it is given, so nothing differs visually. |
| AC-010.7 | Ordering on the clock-change day is data, not layout. The board shows the order it is given. |
| AC-005.4 | iPhone sign-in inside the installed app depends on the method the architect picks (OQ-10). No separate screen is designed. See the contract question below. |
| AC-006.4 | The test runner's exit code and output have no screen. |
| AC-006.5 | A repeatable test run has no screen. |
| AC-006.6 | Keeping test jobs off the real board is a data matter. No screen. |
| AC-012.3 | US-012 (tap to call or maps) is P2 and outside the approved P0 and P1 scope. Not designed in D1. Phone and address are plain text now, with room to become links. |
| AC-012.4 | Same: P2, not designed in D1. |
| AC-013.2 | US-013 (live updates) is P2 and outside the approved scope. Not designed in D1. |
| AC-013.3 | Same: P2. The "Live updates paused" notice would use the existing info message. |

## Contract questions and flags

1. **iPhone installed-app sign-in (OQ-10, architect).** SCR-01 shows "Check your email" only. If the method the architect picks needs the person to type a code inside the installed app, SCR-01 needs one more step after "sent". Tell the designer and it will be added before Gate 2 closes.
2. **Changed since opened (architect).** The stale-save messages (AC-007.8, AC-008.6) need the job to carry a version or last-changed marker the screen can send back with a save. Plain words only here. The architect decides how.
3. **App icon.** `DESIGN.md` has no logo and the research record has none for the client. The home-screen icon (192 and 512 px) and the Apple touch icon need an image. Matthew to supply one, or confirm a plain Midnight tile with a Volt initial built from the brand's colours.
4. **Date field in P0.** The date field in SCR-05 is shown as plain "Today" until P1 stories are built.
5. **Install card memory.** "Not now" is remembered on the phone only. No server data.
6. **Fonts.** Garet and Inter are named in `DESIGN.md` but no font files exist in the repo. The frontend needs them (Garet is a licensed face).
