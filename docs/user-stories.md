# User Stories: Northside Plumbing Tech Job Board

Personas: Owner, Technician (defined in `docs/PRD.md` → Overview)
Tags: `[happy]` main path · `[edge]` boundary or unusual input · `[error]` failure and recovery · `[nfr]` performance, accessibility, security, audit

Priority mapping used across the PRD set: **Must = P0** (the smallest set that meets the definition of done; gates the first release), **Should = P1** (answered by Matthew in discovery, built after the P0 loop is green, first to cut), **Could = P2** (only if the architect says it is nearly free). Won't items are PRD non-goals, not stories.

Test data in the examples ("Tech A", "tech.a@example.test") are fixtures, not real people. Times are Hamilton, ON local time (America/Toronto). The reference "today" in examples is Thursday 2026-11-12.

---

### US-001: A listed team member signs in by emailed link
Priority: Must · Persona: Technician · Serves FR: FR-1, FR-2

As a technician, I want to sign in on my phone with a link sent to my email, so that I can reach the board without remembering a password and nobody outside the team can see customer details.

The same sign-in serves the owner. The owner is a listed team member with the Owner role.

**Acceptance criteria**
- **AC-001.1** [happy] Given the owner's email is on the team list, when the owner enters it on the sign-in page and opens the emailed link, then the owner lands on today's board signed in with the Owner role.
- **AC-001.2** [happy] Given Tech A's email is on the team list and the browser viewport is 390px wide, when Tech A enters it and opens the emailed link, then Tech A lands on today's board signed in with the Technician role.
- **AC-001.3** [edge] Given `nobody@example.test` is not on the team list, when that address is submitted on the sign-in page, then the page shows the same "If this email is on the team, a link is on its way" message as for a listed address, and no email is sent.
- **AC-001.4** [edge] Given `tech.a@example.test` is on the team list, when ` Tech.A@Example.test ` (mixed case, leading and trailing spaces) is submitted, then it matches the listed entry and a link is sent.
- **AC-001.5** [edge] Given a link was requested for `tech.a@example.test` 20 seconds ago, when another link is requested for the same address, then the page says "Wait a minute before asking for another link" and no second email is sent.
- **AC-001.6** [error] Given a sign-in link that is 61 minutes old, or one that has already been used once, when it is opened, then the user sees "This link has expired or was already used" with a form to request a new link, and no session is started.
- **AC-001.7** [edge] Given nobody is signed in, when the board address for today is opened directly, then the user is sent to the sign-in page and no job data is in the response.
- **AC-001.8** [error] Given the email service is unavailable, when a listed address is submitted, then the user sees "We couldn't send the link. Try again in a few minutes", no session is started, and the failure is recorded for Baseleap.
- **AC-001.9** [edge] Given a signed-in user, when they choose Sign out, then they return to the sign-in page and opening the board address on that device sends them to sign-in again.
- **AC-001.10** [nfr] Given a user signed in 29 days ago on a phone who has not signed out, when they open the app, then they see the board without signing in again.

**Notes:** A person on the list can request a link at any time. There is no password. "Listed" means active on the team list (US-002, US-011).
**Out of scope:** passwords, social sign-in, self-signup (NG-12).

---

### US-002: Owner adds a technician to the team list
Priority: Must · Persona: Owner · Serves FR: FR-3, FR-18

As the owner, I want to add each technician's name and email in the app, so that only the people I list can sign in and I can assign jobs to them.

**Acceptance criteria**
- **AC-002.1** [happy] Given the owner is on the Team screen, when the owner adds the name "Tech A" and the email `tech.a@example.test`, then Tech A appears in the team list with the Technician role and in the technician choices when assigning a job.
- **AC-002.2** [happy] Given the owner has just added `tech.a@example.test`, when Tech A requests a sign-in link and opens it, then Tech A sees today's board.
- **AC-002.3** [edge] Given `tech.a@example.test` is already on the list, when the owner adds `TECH.A@example.test`, then the owner sees "That email is already on the team" and no second entry is created.
- **AC-002.4** [edge] Given the owner is adding a person, when the name is empty or the email is `tech.a@` (not a valid address), then the form shows an error beside the field and nothing is saved.
- **AC-002.5** [edge] Given the owner is adding a person, when the name is 61 characters or the email is 255 characters, then the form shows a length error and nothing is saved. Names of exactly 60 characters and emails of exactly 254 characters are accepted.
- **AC-002.6** [edge] Given Tech A is signed in, when Tech A opens the Team screen address directly or sends an add request, then Tech A sees "Not allowed", and the team list is unchanged.
- **AC-002.7** [error] Given the connection drops after the owner taps Add, when the save fails, then the owner sees "Not saved. Try again", the typed name and email stay in the form, and no entry exists in the list.
- **AC-002.8** [nfr] Given the owner adds a team member, when the save succeeds, then the record keeps who added them and when.

**Notes:** Adding a person does not send them an email. They request their own link on the sign-in page. One owner exists from setup; the owner's email is supplied by Matthew before release (Dependencies). The owner cannot add a second owner (NG-12).
**Out of scope:** invitation emails, changing someone's role, removing someone (US-011).

---

### US-003: Owner creates a job for today and assigns it to a technician
Priority: Must · Persona: Owner · Serves FR: FR-4, FR-5, FR-2, FR-18

As the owner, I want to enter a job with the customer details and pick the technician who will do it, so that the technician has everything they need on their phone instead of reading it off the shop whiteboard.

In P0 the job's date is today (Toronto date). Choosing another date is US-010.

**Acceptance criteria**
- **AC-003.1** [happy] Given the owner is signed in at 14:00 and Tech A is on the team, when the owner enters the title "Leaking kitchen faucet", the address "45 Main St W, Hamilton", the start time 15:30 and chooses Tech A, then taps Save, then today's board shows that job at 15:30 assigned to Tech A with status Scheduled.
- **AC-003.2** [happy] Given the owner is creating a job, when the owner also enters customer name "Pat Example", customer phone "(905) 555-0123" and notes "Key under mat", then the saved job shows all three on its card.
- **AC-003.3** [edge] Given the owner is creating a job, when Save is tapped with the title empty, or the address empty, or no start time, or no technician chosen, then an error appears beside each missing field and no job is saved.
- **AC-003.4** [edge] Given the owner is creating a job, when the title is 101 characters, the customer name 101, the address 201 or the notes 2001, then a length error shows on that field and nothing is saved. Values at exactly 100, 100, 200 and 2000 characters are accepted.
- **AC-003.5** [edge] Given the owner is creating a job, when the customer phone is "call me" or has fewer than 7 or more than 20 characters, then the form shows "Enter a valid phone number" and nothing is saved. A blank phone is accepted.
- **AC-003.6** [edge] Given the owner is creating a job, when Save is tapped twice within one second, then exactly one job is created.
- **AC-003.7** [edge] Given it is 14:00, when the owner saves a job with start time 09:00 today, then the job is saved and shown on today's board in time order, not rejected.
- **AC-003.8** [edge] Given the owner saves notes containing `<script>alert(1)</script>`, an ampersand, an emoji and two line breaks, when any user opens the board, then the text appears exactly as typed, with line breaks kept, and nothing runs.
- **AC-003.9** [edge] Given Tech A is signed in, when Tech A looks for a way to create a job or sends a create request directly, then no Create control is shown, the request is refused with "Not allowed", and no job is created.
- **AC-003.10** [edge] Given the owner opened the create form while Tech C was active, when Tech C is removed from the team before the owner taps Save, then the save is refused with "That technician is no longer on the team", the form keeps its values, and no job is created.
- **AC-003.11** [error] Given the connection drops after the owner taps Save, when the save fails, then the owner sees "Not saved. Try again", the form keeps every value, and tapping Save again creates exactly one job once the connection returns.
- **AC-003.12** [nfr] Given a job is created, when the save succeeds, then the record keeps who created it and when.

**Notes:** Assignment is required at creation; there is no unassigned job (OQ-1). Required fields are title, address, start time and technician; customer name, customer phone and notes are optional (OQ-4). Only active technicians can be chosen. The owner cannot assign a job to themselves in v1 (OQ-8).
**Out of scope:** end time or duration, price, job type, photos (NG-7, NG-10), jobs for other dates (US-010).

---

### US-004: Everyone sees the whole day's board on their phone
Priority: Must · Persona: Technician · Serves FR: FR-6, FR-7

As a technician, I want to open one board on my phone that lists every job for today in time order, so that I know where to go next without phoning the owner or visiting the shop.

Everyone signed in (owner and all technicians) sees every job for the day, whoever it is assigned to (decision 0003).

**Acceptance criteria**
- **AC-004.1** [happy] Given today has three jobs, 09:00 for Tech A, 11:00 for Tech B and 15:30 for Tech A, when Tech A signs in with a 390px-wide viewport, then today's board lists all three jobs in that order, including Tech B's job.
- **AC-004.2** [happy] Given the same three jobs, when Tech B signs in on a separate device, then Tech B sees the same three jobs in the same order.
- **AC-004.3** [happy] Given the same three jobs, when the owner signs in, then the owner sees the same three jobs in the same order.
- **AC-004.4** [happy] Given a job card, when it is shown on the board, then it shows the title, start time, address, customer name (if entered), customer phone (if entered), notes (if entered), the assigned technician's name and the status.
- **AC-004.5** [edge] Given today has no jobs, when any user opens the board, then the board shows "No jobs today" and no error.
- **AC-004.6** [edge] Given two jobs share the start time 10:00, when the board is shown, then the job created first is listed first.
- **AC-004.7** [edge] Given 50 jobs exist for today, when the board is opened, then all 50 are reachable by scrolling, none are cut off, and no "page 2" is needed.
- **AC-004.8** [edge] Given a phone whose clock is set to Pacific time at 22:00 Pacific (01:00 the next day in Toronto), when the board opens, then it shows the board for the Toronto date.
- **AC-004.9** [edge] Given Tech A has the board open, when the owner creates a new job for today and Tech A then reloads or pulls to refresh, then the new job appears on Tech A's board.
- **AC-004.10** [edge] Given a 390px-wide viewport and a card with a 100-character title and a 200-character address, when the board is shown, then the page does not scroll sideways and all the text is readable by wrapping.
- **AC-004.11** [error] Given the connection is lost, when the board fails to load, then the user sees "Can't load the board. Check your connection" with a Retry button, and tapping Retry once the connection returns shows the board.
- **AC-004.12** [nfr] Given a phone on simulated 4G (1.6 Mbps down, 150 ms round trip) and 30 jobs today, when a signed-in user opens the board, then the jobs are visible within 2 seconds.
- **AC-004.13** [nfr] Given any screen of the app on a 390px-wide viewport, when its buttons and links are measured, then each tappable control is at least 44 by 44 CSS pixels and body text is at least 16 CSS pixels.

**Notes:** The board is read-only in this story. Status and notes changes are US-007. Cancelled jobs on the board are US-009. Opening the board shows data current at that moment; live updates without reload are US-013.
**Out of scope:** filtering to "my jobs" (everyone sees everything, decision 0003), map view (NG-7).

---

### US-005: The app installs to a phone's home screen
Priority: Must · Persona: Technician · Serves FR: FR-8

As a technician, I want to put the board on my phone's home screen, so that I open it in one tap like an app instead of finding a web address each morning.

**Acceptance criteria**
- **AC-005.1** [happy] Given the staging or production address, when an installability check (Lighthouse or equivalent) is run, then it reports the app as installable, with a name, 192px and 512px icons, standalone display mode and a start address that opens today's board.
- **AC-005.2** [happy] Given a signed-in technician who added the app to the home screen, when they tap the home-screen icon, then the app opens full-screen, without browser address bar, on today's board.
- **AC-005.3** [edge] Given an iPhone with Safari, when the technician uses Share then Add to Home Screen, then the icon and name are the app's own (an Apple touch icon is provided), and the app opens full-screen.
- **AC-005.4** [edge] Given an iPhone technician who installed the app and requests a sign-in link from inside the installed app, when they open the emailed link, then they end up signed in inside the installed app, not only in Safari. Checked by hand on a real iPhone; not covered by `npm run e2e`.
- **AC-005.5** [error] Given the installed app is opened with no connection, when it starts, then the user sees an app-branded "You're offline" screen with a Retry button instead of a browser error page.

**Notes:** AC-005.4 is the likeliest place for sign-in to fail on iPhone (see Dependencies & Risks). Whether an install prompt is shown is the designer's call; the criteria do not require one.
**Out of scope:** App Store or Play Store apps (NG-13), offline data (NG-9), push notifications (NG-8).

---

### US-006: The core loop is verified on staging and production
Priority: Must · Persona: Owner · Serves FR: FR-15

As the owner, I want proof that the live board works end to end after every release, so that my technicians are never sent to a broken board on a job day.

This story is the definition of done from intake (decision log item 3).

**Acceptance criteria**
- **AC-006.1** [happy] Given the staging preview built from the release branch, when `npm run e2e` runs against it, then it passes with these three steps: the owner signs in, creates a job for today and assigns it to Tech A; Tech A signs in with a 390px-wide viewport and sees that job on today's board; Tech B signs in and sees the same job on the same board.
- **AC-006.2** [happy] Given the release has been deployed to production, when the same `npm run e2e` suite runs against the production address, then it passes.
- **AC-006.3** [happy] Given staging and production, when the health URL is requested on each, then it returns HTTP 200.
- **AC-006.4** [error] Given any one of the three steps in AC-006.1 fails, when `npm run e2e` finishes, then it exits with a non-zero code and its output names the failing step.
- **AC-006.5** [edge] Given the suite has just passed once, when it is run again the same day against the same environment, then it passes again.
- **AC-006.6** [edge] Given the suite has run on production, when it finishes, then no job created by the suite remains visible to the client's real team accounts.

**Notes:** The architect and QA decide how the suite signs in without a person reading email, and how production runs avoid the client's real board (OQ-9). Any sign-in shortcut must not be usable by real users on production. The health URL path is set by the architect and recorded in `docs/runbook.md`.
**Out of scope:** load testing, tests of P1 and P2 stories (QA covers them from their own criteria).

---

### US-007: Technician updates the status and notes on their own job
Priority: Should · Persona: Technician · Serves FR: FR-9, FR-14, FR-2, FR-18

As a technician, I want to mark my job In progress or Done and write what happened, so that the owner can see progress and site notes without phoning me.

**Acceptance criteria**
- **AC-007.1** [happy] Given job J is assigned to Tech A with status Scheduled and Tech A is signed in, when Tech A taps In progress, then J shows In progress on Tech A's board, and the owner and Tech B see In progress after they reload.
- **AC-007.2** [happy] Given job J is assigned to Tech A, when Tech A saves the note "Replaced washer, customer wants a quote for the tap", then every signed-in user sees that note on J after they reload.
- **AC-007.3** [edge] Given job K is assigned to Tech B, when Tech A looks for a way to change K or sends a change request for K directly, then no status or notes control is shown on K for Tech A, the request is refused with "Not allowed", and K is unchanged.
- **AC-007.4** [edge] Given job J is assigned to Tech A, when Tech A tries to change the title, address, start time, customer details or technician on J (in the screen or by a direct request), then the change is refused and J is unchanged.
- **AC-007.5** [edge] Given job J is Cancelled, when Tech A tries to change its status or notes, then the change is refused and J is unchanged. Tech A cannot set a job to Cancelled.
- **AC-007.6** [edge] Given J is Done, when Tech A taps In progress, then J shows In progress. Any of the three statuses can be chosen from any other, to undo a mistaken tap.
- **AC-007.7** [edge] Given Tech A is typing notes, when the text is 2001 characters, then a length error shows and nothing is saved. Notes of exactly 2000 characters are saved.
- **AC-007.8** [edge] Given Tech A opened J, and the owner then changed J's start time, when Tech A saves a status change from the old view, then the save is refused with "This job was updated by someone else. Review the latest version", the latest values are shown, and the owner's change is kept.
- **AC-007.9** [edge] Given Tech A taps Done twice within one second, when both taps arrive, then J has status Done and exactly one status change is recorded.
- **AC-007.10** [error] Given Tech A has typed a note and the connection drops, when the save fails, then Tech A sees "Not saved. Try again" and the typed note stays in the field.
- **AC-007.11** [nfr] Given a status or notes change is saved, when the save succeeds, then the record keeps who made it, when, and the old and new status.

**Notes:** Notes are one shared text field: the owner and the assigned technician can both edit it. Past and future days follow the same rules as today.
**Out of scope:** extra statuses such as "On the way" (NG-7), photos (NG-10).

---

### US-008: Owner edits a job, reassigns it, and sets any status
Priority: Should · Persona: Owner · Serves FR: FR-10, FR-4, FR-14, FR-18

As the owner, I want to fix a job's details, move it to another technician, and change its status, so that plans that change during the day are reflected on every phone.

**Acceptance criteria**
- **AC-008.1** [happy] Given a job at 15:30 for Tech A, when the owner changes the start time to 16:00 and saves, then the board shows 16:00 and orders the job by the new time, for every user after they reload.
- **AC-008.2** [happy] Given a job assigned to Tech A, when the owner reassigns it to Tech B, then the board shows Tech B on it, Tech B can now change its status and notes, and Tech A can no longer do so.
- **AC-008.3** [happy] Given a job assigned to Tech A, when the owner sets its status to Done, then every user sees Done after they reload.
- **AC-008.4** [edge] Given the owner is editing a job, when a required field is emptied, or a value is over its length limit or an invalid phone, then the same errors as AC-003.3 to AC-003.5 appear and the job is unchanged.
- **AC-008.5** [edge] Given Tech C has been removed from the team, when the owner opens the reassign choices, then Tech C is not offered.
- **AC-008.6** [edge] Given the owner opened a job and Tech A then changed its status, when the owner saves an edit from the old view, then the save is refused with "This job was updated by someone else. Review the latest version" and Tech A's change is kept.
- **AC-008.7** [error] Given the connection drops after the owner taps Save on an edit, when the save fails, then the owner sees "Not saved. Try again", the edited values stay in the form, and the job is unchanged.
- **AC-008.8** [nfr] Given an edit, reassignment or status change is saved, when it succeeds, then the record keeps who made it, when, and which fields changed.

**Notes:** The owner can edit jobs on any day.
**Out of scope:** bulk edits, drag-and-drop reordering (start time decides order).

---

### US-009: Owner cancels a job and it stays on the board
Priority: Should · Persona: Owner · Serves FR: FR-11, FR-6, FR-2, FR-18

As the owner, I want to cancel a job without deleting it, so that everyone sees it was cancelled and I keep a record of what happened.

**Acceptance criteria**
- **AC-009.1** [happy] Given a Scheduled job for Tech A at 15:30, when the owner confirms Cancel, then the job stays in its time position on the board, marked "Cancelled", for every user after they reload.
- **AC-009.2** [edge] Given any screen of the app, when the owner or Tech A looks for a delete option or sends a delete request directly, then none is shown, the request is refused, and the job still exists.
- **AC-009.3** [edge] Given the owner taps Cancel on a job, when the confirmation "Cancel this job?" appears and the owner chooses No, then the job is unchanged.
- **AC-009.4** [edge] Given a Cancelled job, when the owner sets its status to Scheduled, then the job is shown as Scheduled again and Tech A can again change its status and notes.
- **AC-009.5** [edge] Given a job is already Cancelled, when the owner cancels it again from an old view, then the job stays Cancelled and only one cancellation is recorded.
- **AC-009.6** [error] Given the connection drops after the owner confirms Cancel, when the save fails, then the owner sees "Not saved. Try again" and the job is still active.

**Notes:** Cancelled is a fourth state that only the owner can set. Cancelled jobs are never removed in v1 (NG-6).
**Out of scope:** permanent delete (NG-6), notifying the customer or technician (NG-8).

---

### US-010: Owner plans other days and everyone can view them
Priority: Should · Persona: Owner · Serves FR: FR-12, FR-5, FR-7

As the owner, I want to create jobs for tomorrow or next week, and as a technician I want to look at another day, so that I can plan ahead and check what happened yesterday.

**Acceptance criteria**
- **AC-010.1** [happy] Given it is Thursday 2026-11-12, when a signed-in user opens the board, then it shows 2026-11-12 with Previous day and Next day controls and a date picker, and tapping Next day shows 2026-11-13's jobs.
- **AC-010.2** [happy] Given the owner is creating a job, when the owner picks the date 2026-11-17 and saves, then the job appears on the 2026-11-17 board and not on today's board.
- **AC-010.3** [happy] Given Tech A is viewing 2026-11-11, when Tech A steps Previous day from today, then Tech A sees that day's jobs and their notes, and no create control.
- **AC-010.4** [edge] Given the user is on another day, when they tap Today, then the board returns to the current Toronto date.
- **AC-010.5** [edge] Given a day with no jobs, when it is opened, then the board shows "No jobs on" followed by that date.
- **AC-010.6** [edge] Given the owner is creating a job, when the date year is outside 2020 to 2100 or the date is not a real calendar date, then the form shows "Enter a valid date" and nothing is saved.
- **AC-010.7** [edge] Given 2027-03-14 is the day clocks move forward in Ontario, when the owner saves jobs at 08:00 and 09:00 that day, then the board shows 08:00 then 09:00.
- **AC-010.8** [error] Given the connection is lost, when another day fails to load, then the user sees "Can't load the board. Check your connection" with Retry, and the selected date stays on screen.

**Notes:** Only the owner can create or edit jobs on any day. The owner may create jobs in the past (for record keeping).
**Out of scope:** week or month calendar views (NG-7), recurring jobs (NG-11).

---

### US-011: Owner removes a technician's access
Priority: Should · Persona: Owner · Serves FR: FR-13, FR-2, FR-18

As the owner, I want to stop a former technician from signing in, so that they cannot keep seeing customer names, phone numbers and addresses after they leave.

**Acceptance criteria**
- **AC-011.1** [happy] Given Tech C is on the team and signed in on a phone, when the owner confirms Remove on Tech C, then within 1 minute Tech C's next board load shows the sign-in page, and requesting a link for Tech C's email sends no email.
- **AC-011.2** [happy] Given Tech C had jobs assigned in the past, when the owner removes Tech C, then those jobs stay on their days' boards showing "Tech C (removed)".
- **AC-011.3** [edge] Given Tech C was removed, when the owner opens the technician choices for a new job, then Tech C is not offered.
- **AC-011.4** [edge] Given the team list, when the owner looks at their own row, then there is no Remove control, and a direct request to remove the owner is refused.
- **AC-011.5** [edge] Given Tech C was removed, when the owner adds Tech C's email again, then the existing entry is made active again and no duplicate entry appears.
- **AC-011.6** [edge] Given the owner taps Remove, when the confirmation "Remove Tech C?" appears and the owner chooses No, then Tech C stays active.
- **AC-011.7** [error] Given the connection drops after the owner confirms Remove, when the save fails, then the owner sees "Not saved. Try again" and Tech C remains active.

**Notes:** Removal is deactivation, not deletion, so job history keeps the technician's name. Not covered by Matthew's answers, so it is a Should and an Open Question (OQ-6).
**Out of scope:** deleting a person's record, changing roles.

---

### US-012: Technician taps a phone number or address to call or navigate
Priority: Could · Persona: Technician · Serves FR: FR-16

As a technician, I want to tap the customer's phone number to call and the address to open maps, so that I do not retype details while driving to the job.

**Acceptance criteria**
- **AC-012.1** [happy] Given a job card with customer phone "(905) 555-0123", when a technician taps the number on a phone, then the phone's dialer opens with that number.
- **AC-012.2** [happy] Given a job card with the address "45 Main St W, Hamilton", when a technician taps the address, then the phone's maps app opens searching for that address.
- **AC-012.3** [edge] Given a job card with no customer phone, when the card is shown, then no phone link or empty label appears.
- **AC-012.4** [edge] Given an address containing "#" and "&" such as "12 King St E #4 & 6, Hamilton", when the address is tapped, then the maps search contains the whole address.

**Notes:** Nearly free if the architect confirms; otherwise cut.
**Out of scope:** routing, travel time, distance (NG-7).

---

### US-013: The board updates without a reload
Priority: Could · Persona: Technician · Serves FR: FR-17

As a technician, I want new and changed jobs to appear on my open board by themselves, so that I do not miss a change while the app sits open in my van.

**Acceptance criteria**
- **AC-013.1** [happy] Given Tech B has today's board open, when the owner creates a job for Tech B, then the job appears on Tech B's board within 10 seconds with no reload.
- **AC-013.2** [edge] Given a phone that was offline for 5 minutes with the board open, when the connection returns, then the board refreshes to current data within 10 seconds.
- **AC-013.3** [error] Given the live connection cannot be made, when the board is open, then a "Live updates paused" notice shows and pulling to refresh still loads current data.

**Notes:** Nearly free only if the architect says so; otherwise cut. Reloading always works (AC-004.9).
**Out of scope:** push notifications and sounds (NG-8).

---

## Suggested build order
1. US-001 — sign in; every other story needs a signed-in user and a role.
2. US-002 — team list, so techs can sign in and be assigned (the e2e loop needs two techs).
3. US-003 — owner creates and assigns a job for today (loop step 1).
4. US-004 — everyone sees the day's board at 390px (loop steps 2 and 3). After this the loop is demonstrable.
5. US-006 — wire `npm run e2e` and the health URL on staging, then production (the definition of done). Write the loop test as soon as US-004 lands.
6. US-005 — installable app; verify AC-005.4 on a real iPhone before release.
7. US-007 — technician status and notes (P1).
8. US-008 — owner edit, reassign, status override (P1). Build with US-007 because they share the concurrent-edit rule.
9. US-009 — cancel (P1).
10. US-010 — other days (P1).
11. US-011 — remove a technician (P1).
12. US-012, US-013 — only if the architect says they are nearly free (P2).
