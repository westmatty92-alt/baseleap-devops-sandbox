---
product: Tech Job Board
client: Northside Plumbing (TEST)
version: v1
status: draft
build_mode: hybrid
ai_output: false
---

# PRD: Tech Job Board

## Overview

### Problem
When job requests arrive by phone and the website form during the day, the owner of Northside Plumbing struggles to get each job's details to the 3 technicians who are out on the road, because the only shared record is a whiteboard in the shop (research record). That costs the technicians time phoning or visiting for details and risks a missed or wrong job. The size of that cost is not recorded anywhere (the research record has no figures). Today the owner writes jobs on the whiteboard.

Severity: the pain recurs every working day (jobs are entered daily). How bad each instance is, is unknown. The brief states the need ("so the client's 3 technicians can see today's jobs on their phones") but gives no measurements.

### Job to be done
When I am out on the road between jobs, I want to see today's jobs, where they are and who to call, so I can get to the next job without phoning the shop.

Owner's side: when a job request comes in, I want to put it in one place where the assigned technician and the others see it straight away, so I do not have to relay it by phone.

### Personas
| Persona | Who they are | Evidence |
|---|---|---|
| Owner | One person. Takes job requests by phone and the website form, writes them on the shop whiteboard, and decides who does which job. Signs in on a phone or a computer. | Research record (notes line); intake decision 1; Matthew's answers 6 and 7 |
| Technician | Three people who do the jobs away from the shop and need to see them on their phones. | Brief; research record (build_decision reason); decision 0003; Matthew's answers 3 and 4 |

No further personas are included. The research record has no detail on how the technicians work today beyond the above, so none is invented.

### Why now
Matthew asked for the board as the first build for this client, with the owner's reason on record: "owner wants one board the 3 techs can see on their phones; keeps the GHL site and email list" (research record). Nothing in the evidence gives a deadline or a measured cost of waiting.

## Goals & Success Metrics
- **Primary metric:** Technician board adoption: of the days on which a technician has at least one job assigned, the share on which that technician opened that day's board. Baseline unknown (the whiteboard produces no data), so it is measured for the first 14 days; proposed target 80% for days 15 to 30 after launch, to be confirmed by Matthew (OQ-2). Full definition in `docs/metrics-spec.md`.
- **Guardrails:** board visible within 2 s at the 75th percentile of loads; board load failures at or below 1% of loads; sign-in completion at or above 90% of link requests from listed emails within 15 minutes.

## Scope

### Release tiers
| Tier | Meaning | Stories |
|---|---|---|
| **P0** (Must) | The smallest set that meets the definition of done. Gates the first release. | US-001, US-002, US-003, US-004, US-005, US-006 |
| **P1** (Should) | Behaviour Matthew chose in discovery (status, tech notes, edit and reassign, cancel, other days, remove a tech). Built after the P0 loop is green. First to cut if the run is long. | US-007, US-008, US-009, US-010, US-011 |
| **P2** (Could) | Only if the architect says it is nearly free. | US-012, US-013 |

6 Must of 13 stories (46%, under the 60% cap). Whether v1 releases with P0 only or P0 and P1 is Matthew's call (OQ-5). Recommended: P0 and P1, because P0 alone cannot fix a typo in a job, cancel one, or let a technician record what happened.

### Definition of done (P0, checkable)
`npm run e2e` passes on the staging preview when (1) the owner signs in, creates a job for today and assigns it to a technician; (2) the assigned technician signs in at 390px width and sees the job on today's board; (3) a second technician sees the same board. The same suite passes on production after release, and the health URL returns 200. Criteria: AC-006.1 to AC-006.6.

### In scope (v1)
- Sign in by emailed link; only listed emails get in; roles Owner and Technician — US-001
- Owner manages the team list (add; remove is P1) — US-002, US-011
- Owner creates a job (title, customer name, customer phone, address, start time, notes) and assigns it to a technician — US-003
- One shared board for the day, in time order, visible to everyone, at 390px on a phone — US-004
- Installable to the phone's home screen — US-005
- Verified loop on staging and production, with a health URL — US-006
- Statuses Scheduled, In progress, Done; the assigned technician changes status and notes on their own jobs only — US-007
- Owner edits any field, reassigns, sets any status — US-008
- Owner cancels; cancelled jobs stay on the board; no permanent delete — US-009
- Board opens on today; anyone steps to any day; the owner creates jobs for any date — US-010
- Tap to call and tap for maps; live updates (P2) — US-012, US-013

### Non-goals
- **NG-1** No GoHighLevel form to app intake, and no unassigned or "request" jobs — decisions 0001 and 0002 keep GHL untouched and require the owner to assign — first thing to revisit after v1 (intake called it the P1 candidate). It needs an "unassigned" state and the architect's integration contract.
- **NG-2** No Google Calendar sync, read or write — Calendar does not hold every job (decision 0002) — revisit only if the owner asks to mirror jobs.
- **NG-3** No QuickBooks link, invoicing, quotes, prices or payments — nothing in the brief needs them and QuickBooks must not be changed — revisit after 30 days of use.
- **NG-4** No import of existing jobs, customers or whiteboard content — intake says nothing is imported; the board starts empty — revisit only on request.
- **NG-5** No customer records, contact list or CRM, and nothing shared with GHL contacts — customer details live only on the job; GHL keeps the email list — revisit if the owner wants repeat-customer history.
- **NG-6** No permanent delete of jobs — Matthew's answer 6; cancelled jobs stay marked — not planned.
- **NG-7** No scheduling extras: end time or duration, overlap warnings, routing or travel time, map view, extra statuses (such as "On the way"), week or month calendar — Matthew's answers 2 and 3 chose one start time and three statuses — revisit after 30 days of use.
- **NG-8** No notifications to anyone (push, SMS, email) other than the sign-in email — $0 spend and nothing in the brief needs them — likely the first add-on after v1.
- **NG-9** No offline data. The app shows an offline message but not job data without a connection — adds sync and conflict rules — revisit if technicians report dead zones.
- **NG-10** No job extras: photos or attachments, job type, price estimate, parts list — Matthew's answer 1 chose six fields — revisit on request.
- **NG-11** No recurring or repeat jobs — not asked for — revisit on request.
- **NG-12** No passwords, social sign-in, self-signup, second owner or roles beyond Owner and Technician — Matthew's answer 7 — revisit if staff grows beyond 1 owner and 3 technicians.
- **NG-13** No native or App Store app and no custom domain — decision 0004 — not planned.
- **NG-14** No reports, dashboards or export for the owner — nothing in the brief needs them — revisit after 30 days of use.

## Functional Requirements
- **FR-1** A person signs in by entering their email and opening an emailed link. Only emails on the active team list can sign in. The response to an unlisted email is identical to the response for a listed one and sends nothing. Emails match regardless of case and surrounding spaces. A link works once and expires after 60 minutes. Only one link per email per 60 seconds. Sessions last 30 days unless the person signs out. Serves: US-001
- **FR-2** Access is enforced by the system, not only hidden in screens. Nobody who is signed out sees any job or team data. A technician cannot create jobs, edit another technician's job, edit any field other than status and notes, set Cancelled, manage the team, or delete anything. A removed team member loses access within 1 minute. Serves: US-001, US-002, US-003, US-007, US-009, US-011
- **FR-3** The owner can add a team member as a technician by entering a name (1 to 60 characters) and an email (valid address, up to 254 characters). Duplicate emails are refused. One owner exists from setup. Adding a person sends no email. Serves: US-002
- **FR-4** A job holds: title (required, up to 100 characters), customer name (optional, up to 100), customer phone (optional, 7 to 20 characters of digits, spaces, plus, hyphen and brackets), address (required, up to 200), date, start time (required), notes (optional, up to 2000), assigned technician (required, an active technician), status. All text is stored and shown as plain text, never interpreted as markup, with line breaks kept. Serves: US-003, US-008
- **FR-5** The owner can create a job and must assign it to an active technician in the same save. In P0 the date is today; in P1 the owner can pick any date (FR-12). One save creates exactly one job. A start time earlier than now is accepted. Serves: US-003, US-010
- **FR-6** The board for a day lists every job of that day for every technician, ordered by start time, with ties broken by earliest created. Each job shows title, start time, address, customer name and phone when present, notes when present, assigned technician and status. Cancelled jobs show a "Cancelled" mark in the same position. An empty day shows a message. The layout fits a 390px-wide phone with no sideways scrolling and holds at least 50 jobs a day. Serves: US-004, US-009
- **FR-7** The board always loads current data when opened or reloaded. "Today" is the date in Hamilton, ON (America/Toronto), whatever the phone's clock says. If loading fails, the user sees a message with a Retry button. The board is visible within 2 seconds on simulated 4G with 30 jobs. Tappable controls are at least 44 by 44 CSS pixels and body text at least 16 CSS pixels. Serves: US-004, US-010
- **FR-8** The app can be added to a phone's home screen and then opens full-screen on today's board with the app's own name and icon, on Android and iPhone. Signing in works inside the installed app on iPhone. With no connection the installed app shows an offline message. Serves: US-005
- **FR-9** A job has status Scheduled, In progress, Done or Cancelled; new jobs start as Scheduled. The assigned technician can set any of the first three on their own jobs and can edit the notes on their own jobs. Serves: US-007
- **FR-10** The owner can edit any field of any job, reassign it to another active technician, and set any status. Serves: US-008
- **FR-11** The owner can cancel a job after confirming. A cancelled job stays on the board marked Cancelled and cannot be changed by technicians. The owner can restore it by setting another status. No one can delete a job. Serves: US-009
- **FR-12** The board opens on today. Any signed-in user can step to the previous or next day, pick a date, and return to today. The owner can create jobs for any date between 2020 and 2100. Serves: US-010
- **FR-13** The owner can remove a technician from the team after confirming. Removal stops sign-in and new assignments but keeps the technician's name on past jobs, marked "(removed)". The owner cannot remove themselves. Adding a removed person's email makes the existing entry active again. Serves: US-011
- **FR-14** If a job was changed by someone else after the user opened it, saving is refused with a message, the latest values are shown, and the other person's change is kept. Serves: US-007, US-008
- **FR-15** `npm run e2e` runs the three-step loop of the definition of done on any environment it is pointed at, exits non-zero naming the failing step, passes on repeat runs, and leaves nothing visible on the client's real board. A health URL on each environment returns HTTP 200. Serves: US-006
- **FR-16** The customer phone is tappable to call and the address is tappable to open the phone's maps app, shown only when the value exists. Serves: US-012
- **FR-17** An open board shows new and changed jobs within 10 seconds without a reload, and shows a notice if live updates are unavailable. Serves: US-013
- **FR-18** Every team change, job creation, edit, reassignment, status change and cancellation records who did it and when. The tracking events in `docs/metrics-spec.md` are recorded on the server when the change is saved. Serves: US-002, US-003, US-007, US-008, US-009, US-011

## Edge Cases
| Case | Expected behaviour | Covered by |
|---|---|---|
| Unlisted email requests a link | Same message as a listed email; no email sent; no access | AC-001.3 |
| Link expired or reused | Clear message; request a new link; no session | AC-001.6 |
| Email service down | Message to user; failure recorded; nothing lost | AC-001.8 |
| Signed-out visit to a board address | Redirected to sign-in; no job data returned | AC-001.7 |
| Double tap on Save, Done or similar | One job created, one status change recorded | AC-003.6, AC-007.9 |
| Required field empty, text over limit, bad phone | Error beside the field; nothing saved | AC-002.4, AC-002.5, AC-003.3 to AC-003.5, AC-008.4, AC-010.6 |
| Text with markup or emoji in notes | Shown exactly as typed; nothing runs | AC-003.8 |
| Technician tries owner-only or other-technician actions | No control shown; direct requests refused; data unchanged | AC-002.6, AC-003.9, AC-007.3 to AC-007.5, AC-009.2 |
| Assigned technician removed between opening the form and saving | Save refused with message; form kept | AC-003.10 |
| Two people change the same job | Second save refused; latest shown; first change kept | AC-007.8, AC-008.6 |
| Network drops during a save | "Not saved. Try again"; typed values kept; no partial record | AC-002.7, AC-003.11, AC-007.10, AC-008.7, AC-009.6, AC-011.7 |
| Network drops while loading the board | Message and Retry button | AC-004.11, AC-010.8 |
| Installed app opened with no connection | Branded offline screen with Retry | AC-005.5 |
| Empty day | "No jobs" message, not an error | AC-004.5, AC-010.5 |
| Two jobs at the same time | Earliest created first | AC-004.6 |
| Phone clock in another time zone, daylight saving day | Toronto date used; order kept on 2027-03-14 | AC-004.8, AC-010.7 |
| Job entered for a time already past | Accepted | AC-003.7 |
| Cancelled job | Stays visible, marked; technicians cannot change it; owner can restore; no delete | AC-009.1 to AC-009.5, AC-007.5 |
| Removed technician's past jobs | Stay on boards marked "(removed)" | AC-011.2 |
| Removed person is added again | Existing entry reactivated; no duplicate | AC-011.5 |
| iPhone installed app sign-in | Ends up signed in inside the installed app | AC-005.4 |
| Test run on production | Leaves nothing visible to real team accounts; can run twice | AC-006.5, AC-006.6 |

## AI Behaviour and Evaluation
Not applicable — no feature output comes from a model.

## Technical Considerations
- **System of record:** the new app. It holds the team list, jobs, assignments and statuses.
- **Platform roles:** GoHighLevel: website hosting, forms and email marketing, untouched in v1. Google Calendar and QuickBooks: not touched. Build mode is hybrid; the reason on record is "owner wants one board the 3 techs can see on their phones; keeps the GHL site and email list".
- **Data:** nothing exists to migrate and nothing is imported. The data to be created: the team list (name, email, role, active flag), jobs, and the change history in FR-18. Planning assumption, not evidence: 1 owner, 3 technicians, up to 30 jobs a day (the board must still show 50), under 10,000 jobs in total. The research record has no volumes. Hamilton, ON is the time zone source (OQ-7).
- **Roles & permissions:** Owner (1) and Technician (up to 3 today). Everyone signed in reads every job and the team list (decision 0003). Writes: the owner can do everything except permanent delete; a technician can change only status and notes on jobs assigned to them and cannot touch cancelled jobs. All of it must be enforced on the server and in the database, not only in screens. Single client for v1, so no cross-client data, but the architect should keep the tenant boundary in the data model.
- **Integrations:** none in v1. The architect writes `docs/integration-contract.md` stating "no sync in v1" and noting the GHL form to app path as the later option (NG-1). A transactional email account is needed for sign-in mail, at $0 (free tier), behind the `spend_approval` gate (OQ-3).
- **Personal data:** jobs hold customers' names, phone numbers and addresses; the team list holds staff names and emails. Only active team members may read them. Analytics events carry ids, never names, emails, phones, addresses or notes. The jobs are never deleted in v1 (NG-6), so retention is open (OQ-11).
- **Money:** none.
- **AI:** none.
- **Constraints:** phone-first at 390px width; installable web app; Next.js on Vercel with Supabase Postgres (row-level security on every table) and Supabase Auth (magic link as the default; the architect may refine); the `*.vercel.app` address; $0 new spend. Automated tests must be able to sign in as the owner and two technicians on staging and production without a person reading email; the mechanism is the architect's call and must not give real users a way around sign-in on production. Signing in inside the installed app on iPhone is a known weak spot because a link opened from email lands in the browser, not in the installed app (OQ-10).

## Agent Execution Contract
- **Authoritative sources (highest first):** this PRD → `docs/decisions/` (0001 to 0004, locked) → `docs/openapi.yaml` + migrations → `docs/design-specs.md`
- **Do not touch:** the GoHighLevel website, forms, contacts and email list; Google Calendar; QuickBooks; any client credentials (none are needed); no import of any data; no custom domain; no new paid service. Decisions 0001 to 0004 and Matthew's discovery answers 1 to 7 are locked.
- **Verification map:** FR-1 → AC-001.1 to AC-001.10 · FR-2 → AC-001.7, AC-002.6, AC-003.9, AC-007.3, AC-007.4, AC-007.5, AC-009.2, AC-011.1, AC-011.4 · FR-3 → AC-002.1 to AC-002.5, AC-002.7 · FR-4 → AC-003.2, AC-003.4, AC-003.5, AC-003.8, AC-008.4 · FR-5 → AC-003.1, AC-003.3, AC-003.6, AC-003.7, AC-003.10, AC-003.11, AC-010.2 · FR-6 → AC-004.1 to AC-004.7, AC-004.10, AC-009.1 · FR-7 → AC-004.8, AC-004.9, AC-004.11, AC-004.12, AC-004.13, AC-010.8 · FR-8 → AC-005.1 to AC-005.5 · FR-9 → AC-007.1, AC-007.2, AC-007.6, AC-007.7, AC-007.9, AC-007.10 · FR-10 → AC-008.1 to AC-008.5, AC-008.7 · FR-11 → AC-009.1 to AC-009.6 · FR-12 → AC-010.1 to AC-010.7 · FR-13 → AC-011.1 to AC-011.7 · FR-14 → AC-007.8, AC-008.6 · FR-15 → AC-006.1 to AC-006.6 · FR-16 → AC-012.1 to AC-012.4 · FR-17 → AC-013.1 to AC-013.3 · FR-18 → AC-002.8, AC-003.12, AC-007.11, AC-008.8 and the QA tracking checklist in `docs/metrics-spec.md`. QA writes one test per AC. The P0 definition of done is AC-006.1 to AC-006.3.
- **Stop and escalate (raise a contract question, don't decide):** any unassigned or "request" job state; any permanent delete; any change to who can see which jobs (everyone sees the whole board) or to what a technician can edit; any new personal-data field on a job or team member; any write to or read from GHL, Google Calendar or QuickBooks; any new paid service or dependency with a cost; any sign-in shortcut that exists on production for real users; any change to the event list's PII rules; any change to the P0 definition of done.

## Dependencies & Risks
| Item | Type | Owner | Mitigation |
|---|---|---|---|
| Owner's email address, plus the 3 technicians' names and emails, before release | dependency | Matthew (from the client) | Needed to seed the owner and add the technicians. Staging uses test addresses only |
| Transactional email account for sign-in mail (free tier) | dependency | Matthew (`spend_approval` gate) | Nothing can sign in on production until it exists. Staging can use a test mailbox (OQ-3) |
| Existing Baseleap Vercel team and Supabase org | dependency | bl-devops | Already available per intake decision 6 |
| iPhone sign-in lands in Safari, not the installed app | risk | bl-architect | AC-005.4 on a real iPhone before release; architect may refine the sign-in method (OQ-10) |
| `npm run e2e` on production adds test jobs to a real board | risk | bl-architect, bl-qa | AC-006.6; test accounts and data kept apart from the client's real team (OQ-9). The client is a TEST client today |
| Owners stay on the whiteboard out of habit, so technicians find an empty board | risk | Matthew, owner | The primary metric (adoption) will show it; P0 is kept to the minimum so it is quick to enter jobs. Adoption is not in our control |
| Magic-link mail goes to spam or is slow | risk | bl-devops | Use the transactional account, not a personal mailbox; guardrail on sign-in completion |
| Jobs are never deleted, so a customer's request to remove their details needs a manual fix | risk | Matthew | Baseleap removes them on request until retention is decided (OQ-11) |
| Volumes are assumed, not evidenced | risk | bl-architect | Design for 50 jobs a day as the tested ceiling; recheck against the first 14 days of data |

## Open Questions
| # | Question | Options (recommended first) | Owner |
|---|---|---|---|
| OQ-1 | Must every job be assigned to a technician when it is created? (Assumed so, from decision 0002.) | A (rec): yes, no unassigned jobs in v1 / B: allow unassigned jobs, which adds a state and a way to assign later | Matthew |
| OQ-2 | What is the success target for technician board adoption, given there is no baseline? | A (rec): measure the first 14 days, then confirm 80% (proposed) at the day-30 review / B: set a number now without a baseline | Matthew |
| OQ-3 | Approve a free-tier transactional email account for sign-in mail before release? (`spend_approval`) | A (rec): approve a free-tier account / B: use the default mail built into Supabase Auth if the architect confirms its sending limits are enough for 4 people | Matthew (architect advises on B) |
| OQ-4 | Which job fields are required? | A (rec): title, address, start time and technician required; customer name, phone and notes optional / B: also require customer name and phone | Matthew |
| OQ-5 | Does v1 release with P0 only, or P0 and P1? | A (rec): P0 and P1, with P0 built first and gating staging / B: release P0 only and add P1 afterwards | Matthew |
| OQ-6 | Can the owner remove a technician's access? (Not covered in discovery; assumed yes.) | A (rec): yes, US-011 / B: no, Baseleap removes people on request | Matthew |
| OQ-7 | Is Hamilton, ON time (America/Toronto) the right "today" for every user? | A (rec): yes / B: another zone | Matthew |
| OQ-8 | Can the owner assign a job to themselves? (Assumed no; the owner is not a technician.) | A (rec): technicians only / B: the owner can be assigned too | Matthew |
| OQ-9 | How does the production test run avoid the client's real board, and how do tests sign in without reading email? | A (rec): separate test accounts and data that real users never see / B: test jobs on the real board, cancelled afterwards (they would stay visible, NG-6) | bl-architect, bl-qa |
| OQ-10 | How does sign-in work inside the installed app on iPhone? | A (rec): the architect proposes a method that completes inside the installed app, still by email and at $0 / B: accept signing in through Safari and installing afterwards | bl-architect |
| OQ-11 | How long are job records, with customer details, kept? | A (rec): kept until the owner asks Baseleap to remove them / B: removed automatically after a set number of months | Matthew |

## Appendix
- Sources: research record (`.baseleap/inputs/client-research.md`); brief (`.baseleap/inputs/brief.md`); intake decisions (`.baseleap/intake-decisions.md`); `docs/decisions/0001` to `0004`; Matthew's discovery answers 1 to 7 (`.baseleap/inputs/discovery-answers.md`) to `docs/discovery-questions.md`. No web research was done; no competitor facts are cited.
- Revision history: v1 2026-11-12 — first pass needs-answers (discovery questions); v1 2026-11-12 — full draft after Matthew's answers 1A to 7A
