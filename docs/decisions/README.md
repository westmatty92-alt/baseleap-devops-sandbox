# Decision records

Numbered, never renumbered. `proposed` until Matthew approves Gate 2 (the orchestrator sets `locked`). A locked decision changes only through a new record that supersedes it.

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-stack.md) | Stack: the house stack, no deviations | proposed | 2026-11-14 |
| [0002](0002-sign-in.md) | Sign-in: one email with a link and a 6-digit code, pre-provisioned users, server-side gate | proposed | 2026-11-14 |
| [0003](0003-email-delivery.md) | Sign-in email delivery: custom SMTP on a free transactional plan (spend gate) | proposed | 2026-11-14 |
| [0004](0004-tenancy-and-test-isolation.md) | Tenancy, and keeping automated tests off the real board | proposed | 2026-11-14 |
| [0005](0005-write-rules-in-the-database.md) | Write rules, concurrency, idempotency and audit live in the database | proposed | 2026-11-14 |
| [0006](0006-job-date-and-time.md) | Job date and start time stored as Hamilton wall-clock values | proposed | 2026-11-14 |
| [0007](0007-no-platform-sync-v1.md) | Hybrid mode with no platform sync in v1 | proposed | 2026-11-14 |

**Note on numbering:** the PRD cites "decisions 0001 to 0004 (locked)" from intake (GHL untouched, assignment required, everyone sees the whole board, no native app). Those intake records are not in this repo. The records above are the architecture series. The intake decisions are honoured as PRD constraints: 0007 (GHL untouched), the `assigned_member_id not null` constraint (assignment required), the select policies (everyone sees the board) and 0001 (no native app).
