import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmPathFor } from './admin';
import { watchContext } from './console';

export const AUTH_DIR = 'tests/e2e/.auth';
/** Browser storage state per role. Written by the setup project once the sign-in route (/auth/confirm) is built; not yet. */
export const stateFile = (role: Role) => `${AUTH_DIR}/${role}.json`;
export const IDS_FILE = `${AUTH_DIR}/ids.json`;
export const TOKENS_FILE = `${AUTH_DIR}/tokens.json`;

export type Role = 'owner' | 'techA' | 'techB';

/** The access token the setup project got for a role (bearerAuth in docs/openapi.yaml). Never logged or printed. */
export function accessTokenFor(role: Role): string {
  const tokens = JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as Record<Role, string>;
  if (!tokens[role]) throw new Error(`e2e: no session saved for ${role}; did the setup project run?`);
  return tokens[role];
}

/**
 * Signs `email` in the way a person does: opens the one-time link. GET /auth/confirm shows a "Sign in" button and the
 * POST starts the session (so email scanners can't use the token up). Lands on /board.
 * NOT BUILT YET: src/app has no /auth/confirm. Only the fixme'd UI specs call this.
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

/** The e2e account's email for the UI specs (they sign in by link). Emails come from the manifest of this run's tenant. */
export const emailOf = (role: Role): string => {
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8')) as Record<'owner' | 'techA' | 'techB', { email: string }>;
  return ids[role].email;
};

export async function newSignedInContext(browser: import('@playwright/test').Browser, role: Role, options: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  return watchContext(await browser.newContext({ ...options, storageState: stateFile(role) }));
}
