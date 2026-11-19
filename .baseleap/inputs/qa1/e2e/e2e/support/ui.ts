// Screen helpers. Locators follow docs/design-specs.md (labels, button words, roles) so a copy change is fixed in
// one place. Semantics only: no CSS classes, no test ids the PRD does not promise.
import { expect, type Locator, type Page } from '@playwright/test';

export const card = (page: Page, title: string): Locator =>
  page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

export async function gotoBoard(page: Page, date?: string) {
  await page.goto('/board');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (date) {
    // the date button opens the phone's date picker (design-specs SCR-03); a native date input is filled directly
    const input = page.locator('input[type="date"]');
    await input.fill(date);
    await input.dispatchEvent('change');
  }
}

export type JobForm = {
  title?: string; technician?: string; startTime?: string; address?: string;
  customerName?: string; customerPhone?: string; notes?: string; date?: string;
};

export async function fillJobForm(page: Page, f: JobForm) {
  if (f.title !== undefined) await page.getByLabel(/job title/i).fill(f.title);
  if (f.technician !== undefined) await page.getByLabel(/technician/i).selectOption({ label: f.technician });
  if (f.date !== undefined) await page.getByLabel(/^date/i).fill(f.date);
  if (f.startTime !== undefined) await page.getByLabel(/start time/i).fill(f.startTime);
  if (f.address !== undefined) await page.getByLabel(/address/i).fill(f.address);
  if (f.customerName !== undefined) await page.getByLabel(/customer name/i).fill(f.customerName);
  if (f.customerPhone !== undefined) await page.getByLabel(/customer phone/i).fill(f.customerPhone);
  if (f.notes !== undefined) await page.getByLabel(/^notes/i).fill(f.notes);
}

export async function openNewJob(page: Page) {
  await page.goto('/board');
  await page.getByRole('link', { name: /new job/i }).first().click();
  await expect(page.getByRole('button', { name: /save job/i })).toBeVisible();
}

export const saveJob = (page: Page) => page.getByRole('button', { name: /^save job$/i }).click();
export const fieldError = (page: Page, label: RegExp) => page.getByLabel(label).locator('xpath=ancestor-or-self::*[self::div or self::label or self::fieldset][1]');

export const statusButton = (c: Locator, status: 'Scheduled' | 'In progress' | 'Done') => c.getByRole('button', { name: new RegExp(`^${status}$`, 'i') });

/** Team screen */
export async function addTeamMember(page: Page, name: string, email: string) {
  await page.getByLabel(/^name/i).fill(name);
  await page.getByLabel(/^email/i).fill(email);
  await page.getByRole('button', { name: /add team member/i }).click();
}

/** Simulates a dropped connection for every write (POST, PUT, PATCH) so "Not saved. Try again" can be asserted. */
export async function dropWrites(page: Page) {
  await page.route('**/*', (route) => {
    const m = route.request().method();
    return m === 'POST' || m === 'PUT' || m === 'PATCH' ? route.abort('internetdisconnected') : route.continue();
  });
}
export async function restoreWrites(page: Page) {
  await page.unroute('**/*');
}
