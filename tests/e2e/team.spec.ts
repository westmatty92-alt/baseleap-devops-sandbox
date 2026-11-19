// US-002 and US-011 on screen (SCR-06 Team, SCR-08 Not allowed). API-level rules are in api/team-audit-events.spec.ts.
// QA3: fixme. SCR-06 and SCR-08 are placeholders, there are no browser sessions yet, and /api/team is not built.
import { test, expect } from './support/fixtures';
import { addTechnician, apiAs } from './support/api';
import { addTeamMember, dropWrites, restoreWrites } from './support/ui';
import { chars, emailOfLength, uniqueEmail } from './support/data';
import { UNBUILT } from './support/unbuilt';

test.fixme(true, `${UNBUILT.screen}; ${UNBUILT.signin}; ${UNBUILT.team}`);

test.describe('owner', () => {
  test.use({ storageState: 'tests/e2e/.auth/owner.json' });

  test.beforeEach(async ({ page }) => { await page.goto('/team'); await expect(page.getByRole('heading', { level: 1, name: /team/i })).toBeVisible(); });

  test('AC-002.1 owner adds "Tech A" and it appears with the Technician role and in the technician choices', async ({ page }) => {
    const email = uniqueEmail('ui-add');
    await addTeamMember(page, 'Tech UI Add', email);
    await expect(page.getByText(/tech ui add added to the team/i)).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: email });
    await expect(row).toContainText(/technician/i);
    await page.goto('/jobs/new');
    await expect(page.getByLabel(/technician/i).locator('option', { hasText: 'Tech UI Add' })).toHaveCount(1);
  });

  test('AC-002.2 a technician the owner just added signs in by link and sees today\'s board', async ({ page, browser }) => {
    const email = uniqueEmail('ui-signin');
    await addTeamMember(page, 'Tech UI Signin', email);
    await expect(page.getByText(/added to the team/i)).toBeVisible();
    const { signInWithLink } = await import('./support/session');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx.newPage();
    await signInWithLink(p2, email);
    await expect(p2).toHaveURL(/\/board/);
    await expect(p2.getByText(/signed in:.*technician/i)).toBeVisible();
    await ctx.close();
  });

  test('AC-002.3 adding the same email in other case shows "That email is already on the team", one entry only', async ({ page }) => {
    const email = uniqueEmail('ui-dup');
    await addTeamMember(page, 'Tech UI Dup', email);
    await expect(page.getByText(/added to the team/i)).toBeVisible();
    await addTeamMember(page, 'Tech UI Dup', email.toUpperCase());
    await expect(page.getByText('That email is already on the team')).toBeVisible();
    await expect(page.getByText(new RegExp(email, 'i'))).toHaveCount(1);
  });

  test('AC-002.4 empty name and "tech.a@" show errors beside the fields and save nothing', async ({ page }) => {
    await addTeamMember(page, '', uniqueEmail('ui-empty'));
    await expect(page.getByText(/enter a name/i)).toBeVisible();
    await addTeamMember(page, 'Tech Bad Email', 'tech.a@');
    await expect(page.getByText(/enter a valid email address/i)).toBeVisible();
    await expect(page.getByText('Tech Bad Email')).toHaveCount(0);
  });

  test('AC-002.5 name of 61 and email of 255 show length errors; 60 and 254 are accepted', async ({ page }) => {
    await addTeamMember(page, chars(61, 'N'), uniqueEmail('ui-n61'));
    await expect(page.getByText(/names can be up to 60 characters/i)).toBeVisible();
    await addTeamMember(page, 'Long Email Person', emailOfLength(255));
    await expect(page.getByText(/emails can be up to 254 characters/i)).toBeVisible();
    await addTeamMember(page, chars(60, 'M'), emailOfLength(254));
    await expect(page.getByText(/added to the team/i)).toBeVisible();
  });

  test('AC-002.7 a dropped connection shows "Not saved. Try again", keeps the typed values and creates no entry', async ({ page }) => {
    const email = uniqueEmail('ui-drop');
    await dropWrites(page);
    await addTeamMember(page, 'Tech UI Drop', email);
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await expect(page.getByLabel(/^name/i)).toHaveValue('Tech UI Drop');
    await expect(page.getByLabel(/^email/i)).toHaveValue(email);
    await restoreWrites(page);
    const team = await (await (await apiAs('owner')).get('/api/team?limit=100')).json();
    expect(team.data.map((m: { email: string }) => m.email)).not.toContain(email);
  });

  test('AC-011.4 the owner\'s own row has no Remove control', async ({ page }) => {
    const mine = page.getByRole('listitem').filter({ hasText: /\byou\b/i }).first();
    await expect(mine).toBeVisible();
    await expect(mine.getByRole('button', { name: /remove/i })).toHaveCount(0);
  });

  test('AC-011.6 choosing "No, keep" in the Remove dialog leaves the technician active', async ({ page }) => {
    const email = uniqueEmail('ui-keep');
    await addTechnician(await apiAs('owner'), 'Tech UI Keep', email);
    await page.reload();
    const row = page.getByRole('listitem').filter({ hasText: email });
    await row.getByRole('button', { name: /remove/i }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Remove Tech UI Keep?');
    await page.getByRole('button', { name: /no, keep tech ui keep/i }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: email })).toContainText(/technician/i);
  });

  test('AC-011.1 confirming Remove moves the technician to "Removed"; AC-011.5 adding the email again brings them back, no duplicate', async ({ page }) => {
    const email = uniqueEmail('ui-rm');
    await addTechnician(await apiAs('owner'), 'Tech UI Rm', email);
    await page.reload();
    await page.getByRole('listitem').filter({ hasText: email }).getByRole('button', { name: /remove/i }).click();
    await page.getByRole('button', { name: /yes, remove tech ui rm/i }).click();
    await expect(page.getByRole('heading', { name: /removed/i })).toBeVisible();
    await addTeamMember(page, 'Tech UI Rm', email);
    await expect(page.getByText(/added back to the team/i)).toBeVisible();
    await expect(page.getByText(new RegExp(email, 'i'))).toHaveCount(1);
  });

  test('AC-011.7 a dropped connection after confirming Remove shows "Not saved. Try again" and the technician stays active', async ({ page }) => {
    const email = uniqueEmail('ui-rmdrop');
    const m = await addTechnician(await apiAs('owner'), 'Tech UI RmDrop', email);
    await page.reload();
    await page.getByRole('listitem').filter({ hasText: email }).getByRole('button', { name: /remove/i }).click();
    await dropWrites(page);
    await page.getByRole('button', { name: /yes, remove/i }).click();
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await restoreWrites(page);
    const team = await (await (await apiAs('owner')).get('/api/team?limit=100')).json();
    expect(team.data.find((x: { id: string }) => x.id === m.id).is_active).toBe(true);
  });
});

test.describe('technician', () => {
  test.use({ storageState: 'tests/e2e/.auth/techA.json' });

  test('AC-002.6 Tech A opening the Team address sees "Not allowed" and no team data; the header has no Team link', async ({ page }) => {
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: /not allowed/i })).toBeVisible();
    await expect(page.getByText(/@example\.test/)).toHaveCount(0);
    await page.getByRole('link', { name: /back to the board/i }).click();
    await expect(page).toHaveURL(/\/board/);
    await expect(page.getByRole('link', { name: /^team$/i })).toHaveCount(0);
  });
});
