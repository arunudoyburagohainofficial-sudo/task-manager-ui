import { defineConfig } from "@playwright/test";

/**
 * Two projects, because this suite tests at two very different heights.
 *
 * **logic** — the scheduling arithmetic (`plan/18-scheduling-logic.md`), called directly. No
 * browser, no server, no Metro; runs in seconds and can gate a commit.
 *
 * **app** — the real app: the Expo **web** build, the same JavaScript that ships to the phone,
 * talking to a local task-svc and Postgres. See README.md for what that can and can't prove.
 */

/*
 * Each project sets the zone its *test process* computes in, in its own setup rather than here:
 * `logic/zone.ts` (America/Los_Angeles, for its hand-computed dates) and `harness/fixtures.ts`
 * (Asia/Kolkata, matching the browser the app tests drive). A value set here would apply to both,
 * and one of them would silently compute in the wrong zone.
 */

export default defineConfig({
  // One at a time: task-svc allows 200 requests a minute per IP, shared by every worker, and a
  // 429 mid-run looks exactly like a failure while being the limiter doing its job.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  projects: [
    {
      name: "logic",
      testDir: "./logic",
      // No `use` block at all: nothing here requests a browser fixture, so nothing is launched.
      timeout: 15_000,
    },
    {
      /**
       * Refuses to run against anything but the local stack. The app defaults to the deployed
       * backend, so a suite that seeds and deletes freely is one env var away from wrecking
       * production — this is what stands between the two.
       */
      name: "guards",
      testDir: "./harness",
      testMatch: /stack\.setup\.ts/,
      timeout: 30_000,
    },
    {
      name: "app",
      testDir: "./tests",
      dependencies: ["guards"],
      // The dev bundle takes several seconds to boot, and sign-in crosses Firebase and the API.
      timeout: 120_000,
      expect: { timeout: 15_000 },
      use: {
        baseURL: "http://localhost:8081",
        // A control that isn't there should fail in seconds, not hang until the test timeout.
        actionTimeout: 10_000,
        navigationTimeout: 60_000,
        /**
         * Chromium comes from the installed Edge rather than Playwright's own download:
         * Playwright has no bundled build for this macOS version, and the channel browser is
         * the same engine. See HARNESS.md if it won't launch at all.
         */
        channel: "msedge",
        headless: true,
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        // Everything date-shaped in this app resolves through the device's zone, so the tests
        // pin one rather than inheriting the machine's.
        timezoneId: "Asia/Kolkata",
        trace: "retain-on-failure",
        screenshot: "on",
      },
    },
  ],
});
