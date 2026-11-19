// Cleanup project: runs after every other project, even when setup or a spec failed. Removes only what the manifest lists
// (users and organisations this run created) and prints counts and error codes, never ids, emails or keys.
import { test as teardown, expect } from '@playwright/test';
import { assertSafeSupabase } from './guard';
import { cleanupManifest } from './admin';

// "@smoke" in the title for the same reason as in auth.setup.ts: `--grep @smoke` filters the teardown project too.
teardown('cleanup @smoke: remove the users and organisations this run created', async ({}, info) => {
  assertSafeSupabase(process.env);
  const r = await cleanupManifest();
  info.annotations.push({
    type: 'cleanup',
    description: `users deleted ${r.usersDeleted}, already gone ${r.usersAlreadyGone}, failed ${r.usersFailed}; orgs deleted ${r.orgsDeleted}, kept ${r.orgsKept}`,
  });
  console.log(`cleanup: users deleted ${r.usersDeleted} (already gone ${r.usersAlreadyGone}, failed ${r.usersFailed}); orgs deleted ${r.orgsDeleted}, kept ${r.orgsKept}`);
  for (const p of r.problems) console.log(`cleanup problem: ${p}`);
  // A user that cannot be deleted is a real problem and fails the run. Kept orgs are reported, not failed: see
  // docs/qa-reports/tickets/QA4-002 (no way to delete a tenant that has audit rows).
  expect(r.usersFailed, 'users the cleanup could not delete (see "cleanup problem" lines)').toBe(0);
});
