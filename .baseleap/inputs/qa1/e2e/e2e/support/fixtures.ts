import { test as base, expect } from '@playwright/test';
import { assertSafeTarget } from './guard';
import { loadIds, type Ids } from './api';

// Every spec imports `test` from here. The auto fixture re-checks the target before any test body runs, so a spec
// run directly (`playwright test path/to/spec`) can't skip the guard in playwright.config.ts.
export const test = base.extend<{ guard: void; ids: Ids }>({
  guard: [
    async ({}, use) => {
      assertSafeTarget(process.env.BASE_URL, process.env);
      await use();
    },
    { auto: true },
  ],
  ids: async ({}, use) => use(loadIds()),
});

export { expect };
