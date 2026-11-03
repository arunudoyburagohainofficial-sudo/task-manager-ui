import { chromium, expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { api, tokenFor, uidOf, type Api } from "./api";
import { openApp, reload } from "./app";
import { db } from "./db";

/**
 * One signed-in account per worker, reset between tests.
 *
 * Signing in per test is the obvious shape and the wrong one: each sign-in costs a Firebase
 * round trip plus the app's ten-query prefetch. Signing in once per worker and clearing the
 * account between tests keeps the cost to the seeding each test needs.
 *
 * Tests that need a *fresh* account (AUTH-*, TOUR-*, anything about a first run) use
 * `freshAccount()` instead, which signs a new anonymous user into its own context.
 */
export interface App {
  page: Page;
  context: BrowserContext;
  /** Seeding and assertions against the API, as the signed-in user. */
  api: Api;
  token: string;
  /** users.id, for the SQL escape hatch. */
  userId: string;
}

interface Account {
  context: BrowserContext;
  page: Page;
  token: string;
  userId: string;
}

async function browserFor(launched: Browser): Promise<{ browser: Browser; attached: Browser | null }> {
  /**
   * E2E_CDP_URL attaches to an already-running browser instead of launching one — for a machine
   * where a directly launched Chromium can't start. See HARNESS.md.
   */
  const attached = process.env.E2E_CDP_URL ? await chromium.connectOverCDP(process.env.E2E_CDP_URL) : null;
  return { browser: attached ?? launched, attached };
}

/**
 * A browser context shaped like the phone, with production made unreachable.
 *
 * The app defaults to the deployed backend, and whether it's pointed at localhost depends on how
 * Metro happened to be started. Blocking the deployment here makes that irrelevant: a request to
 * it fails the test instead of seeding and deleting production data.
 */
export async function phoneContext(browser: Browser, timezoneId = "Asia/Kolkata", extra: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, timezoneId, ...extra });
  const hits: string[] = [];
  await context.route(/\.run\.app\//, (route) => {
    hits.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  return {
    context,
    assertLocal() {
      if (hits.length) {
        throw new Error(
          `The app tried to reach the deployed backend (${hits[0]}). Restart Metro with\n` +
            "  EXPO_PUBLIC_API_HOST=localhost npx expo start --web"
        );
      }
    },
  };
}

/** Signs a brand-new anonymous user into its own context. */
export async function freshAccount(browser: Browser, timezoneId = "Asia/Kolkata", opts: { keepTour?: boolean } = {}): Promise<Account & { close: () => Promise<void> }> {
  const { context, assertLocal } = await phoneContext(browser, timezoneId);
  if (opts.keepTour) await context.addInitScript(() => sessionStorage.setItem("e2e-keep-tour", "1"));
  const page = await context.newPage();
  await openApp(page);
  assertLocal();
  const token = await tokenFor(page);
  return { context, page, token, userId: db.userId(uidOf(token)), close: () => context.close() };
}

/**
 * The same signed-in account on a second "device" — its own browser context, optionally in
 * another timezone. The sign-in is copied across (Firebase keeps it in IndexedDB), so both
 * contexts act as one user, the way a phone and a tablet would.
 */
export async function sameAccountIn(app: App, timezoneId: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = app.context.browser()!;
  const storageState = await app.context.storageState({ indexedDB: true });
  const { context, assertLocal } = await phoneContext(browser, timezoneId, { storageState });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("TO DO").first()).toBeVisible({ timeout: 60_000 });
  assertLocal();
  return { page, close: () => context.close() };
}

export const test = base.extend<{ app: App }, { account: Account }>({
  account: [
    async ({ browser: launched }, use) => {
      const { browser, attached } = await browserFor(launched);
      const { context, assertLocal } = await phoneContext(browser);
      const page = await context.newPage();
      // A 429 is the limiter working, not a bug — but a test that hits one fails in a way that
      // looks like the app broke. Counted so the run can say so plainly.
      let throttled = 0;
      const failures: string[] = [];
      page.on("response", (res) => {
        if (res.status() === 429) throttled++;
        // Every response, not only the API's - Metro serves this page too, and a 500 from the
        // dev server used to be reported as an API failure with no way to tell them apart.
        else if (res.status() >= 500) failures.push(`${res.status()} ${res.url()}`);
      });
      await openApp(page);
      assertLocal();
      const token = await tokenFor(page);
      await use({ context, page, token, userId: db.userId(uidOf(token)) });
      if (throttled || failures.length) {
        const detail = failures.length ? `\n    ${failures.join("\n    ")}` : "";
        console.log(
          `\n  ⚠ responses during this worker: ${throttled} × 429 (rate limited), ${failures.length} × 5xx${detail}`
        );
      }
      await context.close();
      if (attached) await attached.close();
    },
    { scope: "worker" },
  ],

  app: async ({ account }, use) => {
    // The test process computes in the same zone as the browser it drives — see harness/queue.ts.
    process.env.TZ = "Asia/Kolkata";
    // Tokens last an hour and a worker can outlive one; re-read it per test.
    const token = await tokenFor(account.page);
    const client = api(token);
    // A known-empty account, so a test can assert on the whole screen rather than around
    // whatever a previous test left behind.
    await client.clear();
    db.resetProgress(account.userId);
    // Anything a previous test left behind — an interception, an offline switch, a moved clock —
    // must not leak into this one. A fake clock belongs to the whole context and can't be
    // uninstalled, so a context that had one is replaced, carrying the sign-in across.
    if ((account.context as BrowserContext & { __clocked?: boolean }).__clocked) {
      const storageState = await account.context.storageState({ indexedDB: true });
      // The sign-in comes across; the saved query cache doesn't. It was written under the fake
      // clock, so its entries are stamped hours in the future, and on the next launch that
      // makes stale cached data look newer than what the server just sent — the fresh fetch
      // loses. (A real phone whose clock ran fast and was then corrected would do the same.)
      for (const origin of storageState.origins) {
        origin.localStorage = origin.localStorage.filter((item) => item.name !== "task-app-query-cache-v1");
      }
      const browser = account.context.browser()!;
      await account.context.close();
      const fresh = await phoneContext(browser, "Asia/Kolkata", { storageState });
      account.context = fresh.context;
      account.page = await fresh.context.newPage();
    }
    await account.page.unrouteAll({ behavior: "ignoreErrors" });
    await account.context.setOffline(false);
    await account.page.setViewportSize({ width: 375, height: 812 });
    await account.page.emulateMedia({ reducedMotion: null });
    // Preferences are the account's too: a test that changed the focus length or the weekly goal
    // mustn't hand them to the next one. Device preferences live in storage; the goal on the server.
    await client.setWeeklyGoal(10).catch(() => undefined);
    await account.page
      .evaluate(() => {
        localStorage.removeItem("preferences-v1");
        // The appearance choice (System/Light/Dark) is a device setting, not account data, so it
        // deliberately survives a real sign-out — but that means it also survives between test
        // files sharing this one browser storage, and a test exercising the switch left every
        // test after it running in dark mode until something reset it (found 2026-09-21: SHEET-13
        // asserted the light theme's danger colour and got the dark theme's).
        localStorage.removeItem("appearance-v1");
        // The app keeps its own copy of the profile and never re-reads it (see SET-10), so the
        // server-side reset above has to be mirrored here or the next test sees the old goal.
        const raw = localStorage.getItem("session-user-v1");
        if (raw) localStorage.setItem("session-user-v1", JSON.stringify({ ...JSON.parse(raw), weeklyGoal: 10 }));
      })
      .catch(() => undefined);
    await account.page.goto("/");
    await reload(account.page);
    await use({ page: account.page, context: account.context, api: client, token, userId: account.userId });
  },
});

export { expect } from "@playwright/test";
