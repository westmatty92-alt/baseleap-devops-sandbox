# Metrics Spec: Tech Job Board

## Primary metric
| Metric | Definition | Baseline | Target | Window | Owner |
|---|---|---|---|---|---|
| Technician board adoption | Of the (technician, day) pairs where the technician holds at least one non-cancelled job on that day, the share where that technician has at least one `board_viewed` with `is_today = true` on that day. Jobs per day are rebuilt from `job_created`, `job_reassigned` and `job_status_changed` (to cancelled). Events from test accounts are excluded. | Unknown — measure for the first 14 days after launch (the whiteboard produces no data; research record has no figures). Open Question OQ-2 | 80% (proposed by the PM, not evidence-based; Matthew confirms at Gate 1 or at the day-14 reading) | Days 1 to 14 set the baseline; the target is checked on days 15 to 30 after launch | Matthew (client review at day 30) |

## Guardrails
| Metric | Definition | Threshold | Window |
|---|---|---|---|
| Board load time | 75th percentile of `load_ms` on `board_viewed` | at or below 2000 ms | rolling 7 days |
| Board load failures | `board_load_failed` count divided by (`board_viewed` + `board_load_failed`) | at or below 1% | rolling 7 days |
| Sign-in completion | `signin_link_requested` with `listed = true` that is followed by `signin_completed` for the same `user_id` within 15 minutes | at or above 90% | rolling 7 days |

## Leading indicators
| Metric | Definition | Read when |
|---|---|---|
| Technicians who have signed in | Distinct `user_id` with role technician on `signin_completed` | day 3 (all 3 expected, which would mean the owner has added them and they got the mail) |
| Jobs entered per working day | `job_created` count per day by the owner | week 1 (zero on most days means the owner is still using the whiteboard) |

## Event inventory
| Event | Fires when (exactly) | Properties (name: type) | PII | Feeds metric |
|---|---|---|---|---|
| `signin_link_requested` | the server receives a sign-in link request, whether or not the email is listed | `listed: boolean`, `user_id: uuid or null` (null when not listed) | none (no email stored on the event) | Sign-in completion |
| `signin_completed` | the server accepts a sign-in link and starts a session | `user_id: uuid`, `role: enum(owner,technician)` | none | Sign-in completion |
| `board_viewed` | the job list for a day has been drawn on screen (client side), including an empty day | `user_id: uuid`, `role: enum(owner,technician)`, `board_date: date`, `is_today: boolean` (board_date equals the Toronto date when viewed), `job_count: int`, `load_ms: int` (navigation start to list drawn) | none | Technician board adoption |
| `board_load_failed` | the board request fails and the error message is shown (client side) | `user_id: uuid`, `board_date: date`, `error_kind: enum(network,server,auth)` | none | Board load failures |
| `job_created` | the job is **saved** (server side), not when Save is tapped | `job_id: uuid`, `created_by: uuid`, `assigned_tech_id: uuid`, `job_date: date`, `lead_days: int` (job_date minus creation date, negative for past dates) | none (no title, customer, phone, address or notes) | Jobs entered per working day |
| `job_status_changed` | a status change is saved (server side), including cancel and restore | `job_id: uuid`, `actor_id: uuid`, `actor_role: enum(owner,technician)`, `from_status: enum(scheduled,in_progress,done,cancelled)`, `to_status: enum(scheduled,in_progress,done,cancelled)` | none | Technician board adoption |
| `job_reassigned` | a change of assigned technician is saved (server side) | `job_id: uuid`, `actor_id: uuid`, `from_tech_id: uuid`, `to_tech_id: uuid` | none | Technician board adoption |

Notes on the table (secondary uses; each event is listed once, under the metric it primarily feeds):
- `board_viewed` also supplies `load_ms` to the Board load time guardrail (75th percentile).
- `job_created` also adds jobs to the primary metric's per-day job list (see its definition); `job_status_changed` to cancelled removes a job from that list, so cancelled jobs leave the denominator.
- `signin_completed` also gives the Technicians who have signed in leading indicator (distinct technician `user_id`).

## Audit events (not metric inputs)
These events are recorded for the audit trail and for QA. They feed no metric in this file, so they are deliberately not in the Event inventory. They follow the same rules as every other event (server side, `snake_case`, ids only, no PII, no double fire, test accounts identifiable).

| Event | Fires when (exactly) | Properties (name: type) | PII |
|---|---|---|---|
| `job_updated` | an edit to a job's fields or notes is saved (server side) | `job_id: uuid`, `actor_id: uuid`, `actor_role: enum(owner,technician)`, `fields_changed: array of enum(title,customer_name,customer_phone,address,start_time,job_date,notes)` | none (field names only, never values) |
| `team_member_added` | a team member is saved as new or made active again (server side) | `team_member_id: uuid`, `actor_id: uuid`, `reactivated: boolean` | none (no name or email) |
| `team_member_removed` | a team member's removal is saved (server side) | `team_member_id: uuid`, `actor_id: uuid` | none |

Rules for the developers:
- A double tap or retry must not fire a state-change event twice for one saved change (AC-003.6, AC-007.9, AC-009.5).
- State-change events fire from the server so they are recorded even if the phone closes mid-flow. Only `board_viewed` and `board_load_failed` are client side, because they describe what the screen showed.
- Events from the automated test accounts used by `npm run e2e` must be identifiable by `user_id` and are excluded from every metric above.

## Destinations
- All events → a Supabase `events` table (in-app product analytics). One source of truth for every metric above. Client users (owner and technicians) get no read access to it; Baseleap staff read it. The architect decides how the table is written to and protected.
- No GA4, Meta Pixel or GHL events in v1: the app has no marketing pages and GHL is untouched.

## Privacy & retention
- Default applied: ids only, no names, emails, phone numbers, addresses, job titles or notes in any event property.
- `user_id` and `job_id` are internal ids; they can be linked to a person only by someone with database access. That is the only link to personal data.
- Proposed retention for the `events` table: 13 months, then removed (a PM proposal; the architect and security agent confirm or change it, and it ties to OQ-11).
- No model input or output is logged; no feature uses a model.

## QA tracking checklist
- [ ] `signin_link_requested` — request a link for a listed email, then for an unlisted one; confirm two events, `listed = true` with that user's `user_id` and `listed = false` with null `user_id`, and no email address in either.
- [ ] `signin_completed` — open the emailed link as Tech A; confirm one event with Tech A's `user_id` and `role = technician`; open the same link again and confirm no second event.
- [ ] `board_viewed` — as Tech A, open today's board (3 jobs) and then tomorrow's (empty); confirm two events, the first with `is_today = true`, `job_count = 3` and a positive `load_ms`, the second with `is_today = false` and `job_count = 0`.
- [ ] `board_load_failed` — go offline, open the board; confirm one event with `error_kind = network` is recorded once the connection returns, or note it as unverifiable if the client cannot send while offline (architect decides how it is queued).
- [ ] `job_created` — as the owner, create a job for today for Tech A; confirm one event with the right `job_id`, `assigned_tech_id`, `job_date` and `lead_days = 0`; double-tap Save and confirm still one event.
- [ ] `job_created` for another date — as the owner, create a job for 2026-11-17 (P1); confirm `lead_days = 5` when created on 2026-11-12.
- [ ] `job_updated` — as the owner, change the start time; confirm one event with `fields_changed = [start_time]` and no values. As Tech A, save a note; confirm `actor_role = technician`, `fields_changed = [notes]`.
- [ ] `job_status_changed` — as Tech A, set In progress then Done; confirm two events with the right `from_status` and `to_status`. As the owner, cancel a job; confirm `to_status = cancelled`. Cancel it again from an old view and confirm no second event.
- [ ] `job_reassigned` — as the owner, reassign from Tech A to Tech B; confirm one event with both ids.
- [ ] `team_member_added` — as the owner, add Tech C; confirm `reactivated = false`. Remove and re-add Tech C; confirm `reactivated = true`.
- [ ] `team_member_removed` — as the owner, remove Tech C; confirm one event with Tech C's `team_member_id`.
- [ ] PII sweep — for every event above, confirm no property contains an email, a name, a phone number, an address, a title or a note.
- [ ] Test-account exclusion — run `npm run e2e` and confirm its events are identifiable and left out of the primary metric's calculation.
