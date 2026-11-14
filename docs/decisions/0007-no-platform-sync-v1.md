# 0007 — Hybrid mode with no platform sync in v1

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** PRD build_mode `hybrid`, Technical Considerations (System of record, Platform roles, Integrations) · NG-1, NG-2, NG-3, NG-5 · Agent Execution Contract "Do not touch"
**Implemented in:** `docs/integration-contract.md` · (no code, no credentials, no webhook routes)

## Context
The research record sets build mode `hybrid`. The new app is the system of record for the team list, jobs, assignments and statuses. GoHighLevel keeps the website, forms and email marketing. Google Calendar and QuickBooks are not touched. The PRD asks for an integration contract that says "no sync in v1" and records GHL form → app intake as the later option (NG-1).

## Decision
v1 has no integration with GHL, Google Calendar or QuickBooks: no API calls, no webhooks, no stored credentials, no shared records. `docs/integration-contract.md` records ownership, the deferred NG-1 design (GHL form submission → job request), and outage behaviour for the one outside service v1 does use: the sign-in email provider. No `integration_events` or `sync_state` tables are created until NG-1 is approved.

## Alternatives considered
### Build the GHL form → app intake now (NG-1)
- **Pros:** removes the owner's retyping of web-form requests.
- **Cons:** needs an "unassigned / request" job state (stop-and-escalate in the PRD), a webhook route, a GHL credential and setup by CRM Automation.
- **Why not:** out of scope by Matthew's decision. It is the first thing to revisit after v1.

### Mirror jobs to Google Calendar
- **Why not:** NG-2; Calendar does not hold every job.

## Consequences
- **Easier:** no third-party failure modes in the job flow; nothing to secure on the GHL side.
- **Harder:** the owner still retypes web-form requests (known, accepted).
- **Cost:** none.
- **Risks:** someone adds a GHL call "while they're there" → the PRD's stop-and-escalate list and `docs/SECURITY_MODEL.md` invariant 10 forbid it.

## Sources
- HighLevel webhook signing (for the deferred NG-1 path; `X-GHL-Signature`, Ed25519; legacy `X-WH-Signature` deprecated 2026-09-01): https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide (read 2026-11-14)
