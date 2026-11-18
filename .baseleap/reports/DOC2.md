# DOC2 — first publish: Approve a production release

**Result:** published.
**Page:** https://app.notion.com/p/41c6d6be0d41815eacade3bae33fb6ef?pvs=204
(id `41c6d6be-0d41-815e-acad-e3bae33fb6ef`, child of 📚 Baseleap SOP Hub, title "Approve a production release (DevOps sandbox)")

## What I did
- Ran `sop-check` on `docs/sops`: 0 errors. The 3 unverified steps are in `pause-uptime-monitor.md`, not in this SOP.
- Fetched the hub: no existing child page for this SOP, so this was a first publish with nothing to diff.
- Created one page under the hub. Nothing else in Notion was created, edited or deleted. The hub page itself is untouched.
- Saved the published text to `docs/sops/.published/approve-a-release.md`, with the page id as an HTML comment on line 1.

## Differences between the repo SOP and the published page
- The top heading is left out, because Notion shows the title.
- The relative link to `restore-production.md` would be dead in Notion, and that SOP is not published yet. I replaced it with plain text saying so. The repo SOP is unchanged.
  - When `restore-production` is published, update this page to link to it.

## For the orchestrator
- The hub's "2. Operator SOPs" list does not mention the new page. I did not edit the hub, as instructed. Matthew or a later step needs to add it.
- Nothing committed.
