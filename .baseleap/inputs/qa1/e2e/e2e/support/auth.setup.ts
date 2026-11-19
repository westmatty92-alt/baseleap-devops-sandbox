// Setup project: signs in the owner, Tech A and Tech B of the "Baseleap E2E" org (is_test, decision 0004) without
// reading email, saves each session, and records their member ids and the org's "today" for the other specs.
// A failure here is a setup failure (QA's), not an app bug, until the same step fails in AC-006.1.
import { test as setup, expect, request as pwRequest } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertSafeTarget, assertSafeSupabase, BYPASS_HEADER } from './guard';
import { AUTH_DIR, IDS_FILE, emailOf, signInWithLink, stateFile, type Role } from './session';

const roles: Role[] = ['owner', 'techA', 'techB'];

setup.beforeAll(() => {
  assertSafeTarget(process.env.BASE_URL, process.env);
  assertSafeSupabase(process.env);
  mkdirSync(AUTH_DIR, { recursive: true });
});

for (const role of roles) {
  setup(`setup: sign in ${role} by one-time link`, async ({ page }) => {
    await signInWithLink(page, emailOf(role));
    await page.context().storageState({ path: stateFile(role) });
  });
}

setup('setup: record member ids and the org date', async () => {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const api = await pwRequest.newContext({
    baseURL: process.env.BASE_URL,
    storageState: stateFile('owner'),
    extraHTTPHeaders: bypass ? { [BYPASS_HEADER]: bypass } : {},
  });
  const me = await api.get('/api/me');
  expect(me.status(), 'owner GET /api/me').toBe(200);
  const meBody = await me.json();
  expect(meBody.member.role).toBe('owner');

  const team = await api.get('/api/team?limit=100');
  expect(team.status(), 'owner GET /api/team').toBe(200);
  const members: { id: string; name: string; email: string; role: string; is_active: boolean }[] = (await team.json()).data;
  const find = (role: Role) => {
    const m = members.find((x) => x.email.toLowerCase() === emailOf(role).trim().toLowerCase());
    expect(m, `${role} is on the e2e team list`).toBeTruthy();
    expect(m!.is_active).toBe(true);
    return { id: m!.id, name: m!.name, email: m!.email };
  };
  const ids = { owner: find('owner'), techA: find('techA'), techB: find('techB'), orgId: meBody.org.id, today: meBody.org.today };
  expect(ids.owner.id).toBe(meBody.member.id);
  writeFileSync(IDS_FILE, JSON.stringify(ids));
  await api.dispose();
});
