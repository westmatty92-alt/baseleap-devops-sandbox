# Integration Contract: Tech Job Board (Northside Plumbing)

**Status:** proposed (locked at Gate 2) · **Build mode:** hybrid · **Implemented by:** nobody in v1: there is no sync (decision 0007). `bl-integration` is not dispatched. · **Platform docs:** HighLevel Webhook Integration Guide https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide (read 2026-11-14; only for the deferred NG-1 path)

**In one line:** in v1 the app and GoHighLevel don't talk to each other. The app owns the team and the jobs. GHL owns the website, its forms and the email list. Google Calendar and QuickBooks are not touched. The only outside service the app uses is the SMTP provider for sign-in email.

## Systems and roles
| System | Role | Owner of the setup |
|---|---|---|
| Tech Job Board (Next.js + Supabase) | System of record for the team list, jobs, assignments, statuses, notes and their history | dev team |
| GoHighLevel sub-account (Northside Plumbing) | Website hosting, website forms, email marketing list. Untouched in v1 | CRM Automation (nothing to do in v1) |
| Google Calendar | Owner's existing calendar. Not touched; not a source of jobs (NG-2) | client |
| QuickBooks | Invoicing. Not touched (NG-3) | client |
| SMTP provider (free tier, decision 0003) | Delivers Supabase Auth sign-in emails. Holds no app data beyond the message | devops |

## Record ownership
One system of record per record type. No record type is shared in v1, so nothing is copied.
| Record | System of record | Copy kept in | Link key |
|---|---|---|---|
| Team member (name, email, role, active) | Tech Job Board | none | none |
| Job (incl. customer name, phone, address, notes) | Tech Job Board | none (NG-5: no customer records or GHL contacts) | none |
| Website form submission / lead | GoHighLevel | none in v1. NG-1 later: a job *request* in the app | GHL submission id (later, below) |
| Marketing contact / email list | GoHighLevel | none | none |
| Calendar events | Google Calendar | none | none |
| Invoices | QuickBooks | none | none |

## Field mapping
**No field is mapped or synced in v1.** The rows below are the deferred NG-1 design (GHL website form → job request in the app), recorded so the later option is designed rather than improvised. They are **not built in v1** and need Matthew's approval, plus an "unassigned / request" job state, which the PRD lists as stop-and-escalate.

Direction: `in` (platform → our app) · `out` (our app → platform) · `both` (only with a conflict rule below) · `read-only` (we read on demand, never store).
| Record | Our field | Platform field | Direction | Transform / notes |
|---|---|---|---|---|
| Job request (NG-1, not in v1) | `job_requests.customer_name` | form field "Full name" | in | trimmed, max 100; empty → null |
| Job request (NG-1, not in v1) | `job_requests.customer_phone` | form field "Phone" | in | kept only if it matches the job phone rule (7–20 of digits, space, + - ( )), else null |
| Job request (NG-1, not in v1) | `job_requests.address` | form field "Address" | in | trimmed, max 200 |
| Job request (NG-1, not in v1) | `job_requests.notes` | form field "Message" | in | plain text, max 2000, never rendered as HTML |
| Job request (NG-1, not in v1) | `job_requests.ghl_submission_id` | submission / event id | in | idempotency key, unique |

## Events and webhooks
| Trigger | Direction | Endpoint / call | Idempotency key | Signature check |
|---|---|---|---|---|
| None in v1 | none | none | none | none |
| (NG-1, not in v1) GHL form submitted | in | `POST /api/webhooks/ghl/form-submitted` (to be added to `docs/openapi.yaml` by amendment) | GHL submission / webhook id, stored unique in `integration_events` | `X-GHL-Signature` (Ed25519, HighLevel public key) verified on the raw body before parsing; the legacy `X-WH-Signature` was deprecated on 2026-09-01. Re-check the guide at build time |

## Sync jobs
| Job | Schedule | Cursor | Batch size | What it reconciles |
|---|---|---|---|---|
| none | none | none | none | Nothing is synced in v1 |

## Conflicts
No field syncs both ways, in v1 or in the deferred NG-1 design. The app is the system of record for jobs, and a GHL submission only ever creates a new request. It never updates a job. If a `both` field is ever proposed, it needs a superseding decision record with its conflict rule first.

## When the platform is down
| Situation | What users see | What the system does |
|---|---|---|
| GoHighLevel is down | Nothing changes in the app | Nothing. v1 makes no GHL calls |
| Google Calendar or QuickBooks is down | Nothing changes in the app | Nothing. Not connected |
| SMTP provider down or rejecting | SCR-01: "We couldn't send the link. Try again in a few minutes" (AC-001.8). Already signed-in people are unaffected (30-day sessions) | `signin_send_failed` logged (no email in the log); no retry queue, the person retries; devops alerted through the sign-in completion guardrail |
| SMTP credentials revoked or wrong | Same as above, for every request | Same, until devops fixes the Supabase Auth SMTP settings |
| (NG-1, later) GHL webhook missed or our endpoint down | Owner doesn't see that request in the app; it's still in GHL | To be designed with NG-1: a reconcile job reads recent submissions from the GHL API |

## Credentials and scopes
| System | Auth | Scopes | Stored as |
|---|---|---|---|
| GoHighLevel | none in v1 | none | none. No client credentials are needed or held (PRD Agent Execution Contract) |
| Google Calendar, QuickBooks | none | none | none |
| SMTP provider | SMTP username + API-key password | send only | Supabase Auth → SMTP settings (set by devops); not an app env var |
| (NG-1, later) GoHighLevel | Private Integration Token for the sub-account | read-only scopes for forms and submissions; confirm the exact scope names in the HighLevel docs at build time | Supabase Vault; env var name only |

## Setup the platform side must do (handoff to CRM Automation)
- None for v1. The GHL website, forms, contacts and email list stay exactly as they are.
- For NG-1, when approved: a workflow "Form submitted → send webhook" to the app's endpoint, or a marketplace-app webhook subscription. The field labels in the mapping above must be confirmed against the live form.
