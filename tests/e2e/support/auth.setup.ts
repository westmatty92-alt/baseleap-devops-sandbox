// Setup project: creates this run's own e2e organisation (is_test, decision 0004) with an owner, Tech A and Tech B using the
// service role, signs them in without email, and records member ids, tokens and the org's "today" for the other specs.
// It touches only rows it creates, and lists them in the manifest for the cleanup project.
// A failure here is a setup failure (QA's), not an app bug, until the same step fails in a spec.
import { test as setup, expect, request as pwRequest } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertSafeTarget, assertSafeSupabase, BYPASS_HEADER, isLocalRun } from './guard';
import { createE2eTenant, resetManifest } from './admin';
import { AUTH_DIR, IDS_FILE, TOKENS_FILE } from './session';

// "@smoke" is in the title on purpose: `--grep @smoke` filters dependency projects too, and without it the smoke run would
// skip setup and find no tenant.
setup('setup @smoke: create the e2e tenant, sign in owner, Tech A and Tech B, record ids and the org date', async () => {
  assertSafeTarget(process.env.BASE_URL, process.env);
  assertSafeSupabase(process.env);
  mkdirSync(AUTH_DIR, { recursive: true });
  resetManifest();

  const tag = randomUUID().slice(0, 8);
  const t = await createE2eTenant(tag);
  writeFileSync(TOKENS_FILE, JSON.stringify({ owner: t.owner.accessToken, techA: t.techA.accessToken, techB: t.techB.accessToken }));

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const api = await pwRequest.newContext({
    baseURL: process.env.BASE_URL,
    extraHTTPHeaders: {
      authorization: `Bearer ${t.owner.accessToken}`,
      ...(bypass && !isLocalRun(process.env) ? { [BYPASS_HEADER]: bypass } : {}),
    },
  });
  const me = await api.get('/api/me');
  expect(me.status(), 'owner GET /api/me').toBe(200);
  const meBody = await me.json();
  expect(meBody.member.role).toBe('owner');
  expect(meBody.member.id).toBe(t.owner.id);
  expect(meBody.org.id).toBe(t.orgId);
  await api.dispose();

  const pick = (m: { id: string; name: string; email: string }) => ({ id: m.id, name: m.name, email: m.email });
  writeFileSync(
    IDS_FILE,
    JSON.stringify({ owner: pick(t.owner), techA: pick(t.techA), techB: pick(t.techB), orgId: t.orgId, today: meBody.org.today }),
  );
});
