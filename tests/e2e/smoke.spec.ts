// Browser smoke: the public screens answer and render a heading. Needs no session, so it runs in the staging @smoke job
// (`playwright test --grep @smoke`) as soon as the app is up. Not tied to an acceptance criterion: it only proves the deployed
// pages are served by this build (the screens themselves are tested in signin.spec.ts and pwa.spec.ts once built).
import { test, expect } from './support/fixtures';

for (const path of ['/sign-in', '/link-expired', '/offline']) {
  test(`smoke @smoke ${path} is served and has a level-1 heading`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

test('smoke @smoke the root address sends a signed-out visitor to a page, not an error', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
