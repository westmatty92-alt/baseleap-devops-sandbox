import { test as base, expect } from '@playwright/test';
import { assertSafeTarget, isLocalRun } from './guard';
import { loadIds, type Ids } from './api';
import { CONSOLE_ALLOWLIST, resetSeen, takeSeen, watchContext } from './console';

// Every spec imports `test` from here. The auto fixture re-checks the target before any test body runs, so a spec
// run directly (`playwright test path/to/spec`) can't skip the guard in playwright.config.ts.
export const test = base.extend<{ guard: void; consoleGuard: void; ids: Ids }>({
  guard: [
    async ({}, provide) => {
      assertSafeTarget(process.env.BASE_URL, process.env);
      await provide();
    },
    { auto: true },
  ],
  // The default `context` (and so `page`) is watched. It needs no browser, so API-only tests never launch one.
  context: async ({ context }, provide) => {
    watchContext(context);
    await provide(context);
  },
  // Fails the test, listing every message, when a browser console error or page error happened. Runs for every
  // browser test, @smoke included. Checked after the body, so a failure in the body is still reported first.
  consoleGuard: [
    async ({}, provide) => {
      resetSeen();
      await provide();
      const bad = takeSeen().filter((s) => !CONSOLE_ALLOWLIST.some((a) => a.pattern.test(s)));
      expect(bad, `the browser reported ${bad.length} console/page error(s) while this test ran:\n  - ${bad.join('\n  - ')}`).toEqual([]);
    },
    { auto: true },
  ],
  // The callback is named `provide`, not Playwright's usual `use`, so eslint's react-hooks rule does not mistake it for a hook.
  ids: async ({}, provide) => provide(loadIds()),
});

export { expect };
export { CONSOLE_ALLOWLIST, watchContext, watchedContext } from './console';

/** True on the local stack. Used only for checks that cannot apply there (see support/unbuilt.ts `VERCEL_ONLY`). */
export const onLocalStack = () => isLocalRun(process.env);
