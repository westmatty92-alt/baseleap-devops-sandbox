// Cleanup project: runs after every other project, even when setup or a spec failed. Removes only what the manifest lists
// (users and organisations this run created) and prints counts, never ids, emails or keys.
import { test as teardown } from '@playwright/test';
import { assertSafeSupabase } from './guard';
import { cleanupManifest } from './admin';

// "@smoke" in the title for the same reason as in auth.setup.ts: `--grep @smoke` filters the teardown project too.
teardown('cleanup @smoke: remove the users and organisations this run created', async ({}, info) => {
  assertSafeSupabase(process.env);
  const r = await cleanupManifest();
  info.annotations.push({
    type: 'cleanup',
    description: `users deleted ${r.usersDeleted}, failed ${r.usersFailed}; orgs deleted ${r.orgsDeleted}, kept ${r.orgsKept} (jobs cannot be deleted through the app, NG-6)`,
  });
  console.log(`cleanup: users deleted ${r.usersDeleted} (failed ${r.usersFailed}); orgs deleted ${r.orgsDeleted}, kept ${r.orgsKept}`);
});
