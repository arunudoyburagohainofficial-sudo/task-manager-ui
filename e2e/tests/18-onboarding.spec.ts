import type { Browser, Page } from "@playwright/test";
import { expect, phoneContext, test } from "../harness/fixtures";
import { button, control, screenText, see, signIn, skipFirstRun } from "../harness/app";

/**
 * First-run onboarding.
 *
 * Four screens that only a brand-new install ever sees, which is exactly why they had no cover
 * before this file: the rest of the suite marks every browser as a returning user so the two
 * first-run flows stand aside, and the result was that onboarding shipped untested. Each test
 * here starts from a context with no storage at all and walks the real screens.
 *
 * Onboarding straddles the sign-in gate on purpose. Welcome comes before an account exists; the
 * three steps after it need one, because the apps a person picks are saved against their
 * preferences. `RootNavigator` switches branch on `finished`, so "did it end" is always asked of
 * the screen that replaces it rather than of a flag.
 *
 * What a browser cannot decide: the three Android permissions themselves. `isShieldSupported` is
 * false on web, so the permission step lists all three as outstanding and its Allow buttons have
 * nothing to open. That the list is honest about them is still worth asserting; whether a grant
 * sticks belongs in MD/device-test-plan.md.
 */

/** A browser that has genuinely never met the app: no tour flag, no onboarding flag, no cache. */
async function freshInstall(browser: Browser, body: (page: Page) => Promise<void>) {
  const { context, assertLocal } = await phoneContext(browser);
  try {
    const page = await context.newPage();
    await page.goto("/");
    await body(page);
    assertLocal();
  } finally {
    await context.close();
  }
}

/** Signs in and lands on the first post-account onboarding step. */
async function toScreenTime(page: Page) {
  await button(page, "Get started").click();
  await signIn(page);
  await see(page, "How long are you on your phone each day?");
}

/**
 * Leaves the permissions step.
 *
 * Deliberately the Skip link rather than Continue: `current` is the first permission still
 * outstanding, and on web `isShieldSupported` is false so nothing can ever be granted. The
 * "everything allowed, here is Continue" branch is therefore unreachable in a browser, and
 * belongs to MD/device-test-plan.md rather than here.
 */
async function leavePermissions(page: Page) {
  await control(page, /^Skip for now · app pausing stays off$/).click();
  await see(page, "Here’s where your time went");
}

/**
 * Finishing onboarding does not land on Home. It lands on the walkthrough, because a brand-new
 * account has both first-run flows to get through and they are separate things: onboarding is
 * about the phone, the tour is about the app. Asserting Home here would have quietly skipped
 * over a whole screen the user actually meets.
 */
async function finishOnboarding(page: Page) {
  await button(page, "Skip for now").click();
  await see(page, /1 of 5 \| Start with a goal/, 60_000);
}

test.describe("before an account exists", () => {
  test("ONBOARD-01 · a new install opens on Ferne's welcome, not the sign-in screen", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await see(page, "Hi, I’m Fern. I’ll help you focus and keep your phone away.");
      await see(page, "Get started");
      await see(page, "I already have an account");
      // The sign-in screen is behind it, not instead of it.
      expect(await screenText(page)).not.toContain("Continue as test user");
    });
  });

  test("ONBOARD-02 · both ways off the welcome screen reach sign-in", async ({ browser }) => {
    for (const label of ["Get started", "I already have an account"]) {
      await freshInstall(browser, async (page) => {
        await button(page, label).click();
        await see(page, "Continue as test user");
      });
    }
  });

  /*
   * An install from before onboarding existed holds none of its flags but plenty of other state.
   * Sending those people through a new-user tour would be a worse bug than never showing it, so
   * `OnboardingContext` reads any older key as proof of prior use.
   */
  test("ONBOARD-03 · an existing install is never sent through onboarding", async ({ browser }) => {
    const { context } = await phoneContext(browser);
    try {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem("preferences-v1", JSON.stringify({ notificationsEnabled: true })));
      await page.goto("/");
      await see(page, "Continue as test user");
      expect(await screenText(page)).not.toContain("Get started");
    } finally {
      await context.close();
    }
  });
});

test.describe("the three steps after signing in", () => {
  test("ONBOARD-04 · the screen-time step opens at five hours and does the arithmetic", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      // 5 h x 365 / 24, rounded - and one hour a day won back is 15 days of the year.
      await see(page, "5 | hours | on a typical day");
      await see(page, "76 | days a year on your phone");
      await see(page, "15 days a year");
      await expect(control(page, /^Screen time, 5 hours a day$/)).toBeVisible();
    });
  });

  test("ONBOARD-05 · the permission step names all three and what each is for", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await see(page, "3 QUICK STEPS");
      for (const [title, why] of [
        ["Usage access", "Finds your distracting apps"],
        ["Do Not Disturb", "Silences your phone while you focus"],
        ["Display over other apps", "Shows the pause screen"],
      ]) {
        await see(page, `${title} | ${why}`);
      }
      // The promise that makes the usage permission acceptable to grant.
      await see(page, "Ferne sees how long apps are open, never what’s inside them.");
    });
  });

  test("ONBOARD-06 · 'Why these permissions?' explains itself without leaving the step", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await control(page, "Why these permissions?").click();
      await see(page, /Usage access[\s\S]*Do Not Disturb/);
      expect(await screenText(page)).toContain("3 QUICK STEPS");
    });
  });

  test("ONBOARD-07 · the app-picking step is honest when it has no usage to show", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await leavePermissions(page);
      await see(page, "Average per day, last 7 days.");
      // A browser has no usage figures, so nothing is preselected and the action says so.
      await see(page, "Skip for now");
      expect(await screenText(page)).not.toMatch(/Pause \d+ apps? during focus/);
    });
  });
});

test.describe("getting out of it, and staying out", () => {
  test("ONBOARD-08 · walking the whole flow ends on Home", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await leavePermissions(page);
      await finishOnboarding(page);
      expect(await screenText(page)).not.toContain("3 QUICK STEPS");
      await button(page, "Skip tour").click();
      await see(page, "TO DO", 60_000);
    });
  });

  /** Skipping the permissions must not strand anyone before Home. */
  test("ONBOARD-09 · skipping the permissions still reaches Home", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await leavePermissions(page);
      await finishOnboarding(page);
      await button(page, "Skip tour").click();
      await see(page, "TO DO", 60_000);
    });
  });

  /** The flag is written on the way out, so a reload must not start it again. */
  test("ONBOARD-10 · onboarding does not come back on reload", async ({ browser }) => {
    await freshInstall(browser, async (page) => {
      await toScreenTime(page);
      await button(page, "Continue").click();
      await leavePermissions(page);
      await finishOnboarding(page);
      await button(page, "Skip tour").click();
      await see(page, "TO DO", 60_000);
      await page.reload();
      await see(page, "TO DO", 60_000);
      expect(await screenText(page)).not.toContain("How long are you on your phone each day?");
    });
  });

  /** The suite's own bypass is load-bearing for 290-odd other tests; it gets its own check. */
  test("ONBOARD-11 · the harness bypass really skips both first-run flows", async ({ browser }) => {
    const { context } = await phoneContext(browser);
    try {
      const page = await context.newPage();
      await skipFirstRun(page);
      await page.goto("/");
      await signIn(page);
      await see(page, "TO DO", 60_000);
      const text = await screenText(page);
      expect(text).not.toContain("How long are you on your phone each day?");
      expect(text).not.toContain("Start with a goal");
    } finally {
      await context.close();
    }
  });
});
