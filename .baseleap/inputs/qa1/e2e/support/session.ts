import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmPathFor } from './admin';

export const AUTH_DIR = 'tests/e2e/.auth';
export const stateFile = (role: Role) => `${AUTH_DIR}/${role}.json`;
export const IDS_FILE = `${AUTH_DIR}/ids.json`;

export type Role = 'owner' | 'techA' | 'techB';

export const emailOf = (role: Role): string => {
  const name = { owner: 'E2E_OWNER_EMAIL', techA: 'E2E_TECH_A_EMAIL', techB: 'E2E_TECH_B_EMAIL' }[role];
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} is not set`);
  return v;
};

/**
 * Signs `email` in the way a person does: opens the one-time link. GET /auth/confirm shows a "Sign in" button and the
 * POST starts the session (so email scanners can't use the token up). Lands on /board.
 */
export async function signInWithLink(page: Page, email: string): Promise<void> {
  const path = await confirmPathFor(email);
  await page.goto(path);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/board(\?.*)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** The one-time confirm path for an email, for tests that open a link twice (AC-001.6). */
export { confirmPathFor };

/**
 * The access token inside a saved session, for probing the Supabase Data API the way a signed-in technician could
 * (SECURITY_MODEL: "a signed-in technician can call PostgREST themselves"). Never logged or written anywhere.
 */
export function accessTokenFor(role: Role): string {
  const state = JSON.parse(readFileSync(stateFile(role), 'utf8')) as { cookies: { name: string; value: string }[] };
  const parts = state.cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (parts.length === 0) throw new Error(`e2e: no Supabase session cookie saved for ${role}`);
  let raw = decodeURIComponent(parts.map((p) => p.value).join(''));
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
  return JSON.parse(raw).access_token as string;
}

export async function newSignedInContext(browser: import('@playwright/test').Browser, role: Role, options: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...options, storageState: stateFile(role) });
}
