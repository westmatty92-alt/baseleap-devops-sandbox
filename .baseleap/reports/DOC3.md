# DOC3 — republish "Approve a production release"

**Result: NOT PUBLISHED. Stopped on a hand edit. Needs Matthew's decision.**

Nothing was written to Notion. `docs/sops/.published/approve-a-release.md` is unchanged.

## What I did
1. Read the updated SOP (`docs/sops/2-operator/approve-a-release.md`), the last published copy (`docs/sops/.published/approve-a-release.md`) and the docs-publish skill.
2. Ran `node scripts/sop-check.mjs docs/sops`. It passed with 0 errors. The 3 unverified steps are in `pause-uptime-monitor.md`, not in this SOP. This SOP has no `⚠ unverified` steps.
3. Fetched the Notion page (id `41c6d6be-0d41-815e-acad-e3bae33fb6ef`, "Approve a production release (DevOps sandbox)", last edited 2026-11-18T18:27:50Z).
4. Compared the live page with the last published copy.

## Why I stopped
The live page is not the same as what I last published. It has one extra line at the end, after the Changelog:

> **Matthew's note (drill — hand edit):** I approve from the GitHub app on my phone; the email link works there too.

Everything else on the page matches the last published version. docs-publish says a page a person changed is never overwritten. Replacing the page body would delete his note.

## Diff the update would make (repo SOP vs. what is live)
- **Step 6:** "The run takes a few minutes." becomes "The run takes about 5 minutes." (evidence: release drills)
- **"If it goes wrong", rollback failed or skipped:** the plain-text mention "not yet published in this hub, so ask Baseleap for it" becomes a link, [Restore production after a failed release](restore-production.md). This change isn't mentioned in the task. It is in the repo file, so it would go live too.
- **Changelog:** adds "2026-11-18 — Step 6: the run takes about 5 minutes (release drills) — DOC3".
- **Not in the repo SOP:** Matthew's phone note. It exists only in Notion.

## Findings for the orchestrator
- **Decision for Matthew:** keep his note, merge it, or replace the page. My suggestion is to merge: apply the changes above and keep his note as a line under Steps or at the end. This is his wording and his call.
- **Restore link:** `restore-production.md` exists in the repo, but I haven't confirmed it is published in the hub. The relative link `restore-production.md` won't work in Notion. If the restore SOP isn't published yet, the old wording ("not yet published in this hub, so ask Baseleap") is still correct for the hub copy. This needs deciding before a publish.
- **Phone note:** the claim that the GitHub app and email link work on a phone is not backed by evidence in the repo. I haven't added it to the SOP. If Matthew wants it in, it needs a source or an `⚠ unverified:` marker.

## Next step
Once Matthew answers, rerun docs-publish. I will then update the page, save the new copy to `.published/approve-a-release.md` and keep or merge his note as he decides.

Nothing committed.
