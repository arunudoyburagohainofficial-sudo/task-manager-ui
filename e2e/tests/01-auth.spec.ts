import type { Page } from "@playwright/test";
import { expect, freshAccount, phoneContext, test } from "../harness/fixtures";
import { API, api as apiFor, uidOf, tokenFor } from "../harness/api";
import { button, control, openTab, screenText, see, signIn, skipFirstRun, stats } from "../harness/app";
import { db } from "../harness/db";

/**
 * Sign-in and the session — plan/01-auth-session.md.
 *
 * Everything else is behind this. If a session doesn't restore, or one account's data survives
 * into the next sign-in, nothing further matters. Each test here uses its own brand-new account:
 * these are the tests that sign in, sign out and delete.
 */

async function signOut(page: Page) {
  await openTab(page, "Settings");
  await button(page, "Sign out").click();
  const confirm = page.getByRole("button", { name: /^Sign out$/ }).locator("visible=true");
  if ((await confirm.count()) > 1) await confirm.last().click();
  await see(page, "Continue as test user");
}

test("AUTH-01 · a new account lands on Home with its starter content, and nothing left loading", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page } = acct;
    await see(page, /GOALS \| 0% \| Learn Something New \| 0 of 20 days/);
    await see(page, "Try scheduling something");
    await see(page, "Try a focus session");
    expect(await stats(page)).toEqual({ streak: 0, points: 0, minutes: 0 });
    expect(await screenText(page)).not.toMatch(/Couldn|error|Loading/i);
  } finally {
    await acct.close();
  }
});

/** The session is restored from storage before Firebase restores its own — a gap that once showed the sign-in screen to a signed-in user. */
test("AUTH-02 · a reload goes straight back to Home, with every request signed", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page } = acct;
    await page.addInitScript(() => {
      (window as unknown as { __sawAuth: boolean }).__sawAuth = false;
      new MutationObserver(() => {
        if (document.body?.innerText.includes("Continue as test user")) (window as unknown as { __sawAuth: boolean }).__sawAuth = true;
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    const unsigned: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(API) && !r.headers()["authorization"]) unsigned.push(r.url());
    });
    await page.reload();
    await see(page, "Try a focus session");
    expect(await page.evaluate(() => (window as unknown as { __sawAuth: boolean }).__sawAuth)).toBe(false);
    expect(unsigned).toEqual([]);
  } finally {
    await acct.close();
  }
});

/** The query cache is persisted. A cache outliving a sign-out shows one person another's tasks. */
test("AUTH-03 · signing out leaves nothing of the previous account behind", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page, token } = acct;
    await apiFor(token).task({ name: "Only A has this", taskType: "reminder" });
    await page.reload();
    await see(page, "Only A has this");
    await signOut(page);
    await signIn(page);
    await see(page, "TO DO");
    const text = await screenText(page);
    expect(text).not.toContain("Only A has this");
    expect(uidOf(await tokenFor(page))).not.toBe(uidOf(token));
    expect(await page.evaluate(() => localStorage.getItem("task-app-query-cache-v1") ?? "")).not.toContain("Only A has this");
  } finally {
    await acct.close();
  }
});

test("AUTH-04 · an hour-old token is refreshed, not a reason to sign out", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page, token } = acct;
    await apiFor(token).task({ name: "After an hour", taskType: "reminder" });
    await page.clock.install({ time: new Date() });
    await page.reload();
    await see(page, "After an hour");
    const refused: string[] = [];
    page.on("response", (r) => {
      if (r.url().startsWith(API) && r.status() === 401) refused.push(r.url());
    });
    await page.clock.fastForward("01:10:00");
    await control(page, "Done: After an hour").click();
    await see(page, "“After an hour” done");
    expect(refused).toEqual([]);
    expect(await screenText(page)).not.toContain("Continue as test user");
  } finally {
    await acct.close();
  }
});

/** Revoked credentials and deleted accounts both look like this; the app must say something. */
test("AUTH-05 · a 401 doesn't strand the user in silence", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page } = acct;
    await page.route(/\/api\/tasks\/[^/]+\/(complete|done)$/, (r) => r.fulfill({ status: 401, body: "{}" }));
    await control(page, "Done: Try scheduling something").click();
    await see(page, "Couldn't complete “Try scheduling something” - check your connection.");
    await expect.poll(async () => screenText(page)).toContain("Try scheduling something");
  } finally {
    await acct.close();
  }
});

/**
 * Phone sign-in is native-only, and on web it used to be offered anyway (fixed 2026-09-19).
 * Google stays on: the web build uses the browser's own OAuth flow, which is a real one.
 */
test("AUTH-06 · the sign-in options this build can't do explain themselves", async ({ browser }) => {
  const { context } = await phoneContext(browser);
  try {
    const page = await context.newPage();
    // Onboarding comes before the sign-in screen on a fresh install; ONBOARD-* covers it.
    await skipFirstRun(page);
    await page.goto("/");
    await see(page, "Continue as test user");
    const phone = page.getByRole("button", { name: "Continue with phone" }).locator("visible=true").last();
    await expect(phone).toHaveAttribute("aria-disabled", "true", { timeout: 2_000 });
    await see(page, "Phone sign-in works in the app, not in a browser.");
  } finally {
    await context.close();
  }
});

/** A provider's "ARUNUDOY BURAGOHAIN" mustn't shout from the top of Home. */
test("AUTH-07 · a new name shows in the greeting, properly cased, and on the avatar", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page } = acct;
    await openTab(page, "Settings");
    await button(page, /^Name/).click();
    await page.locator("input").locator("visible=true").last().fill("ARUNUDOY BURAGOHAIN");
    await button(page, "Save changes").click();
    await openTab(page, "Home");
    await see(page, /^Good (morning|afternoon|evening), Arunudoy \|/);
    await expect(control(page, "Account")).toHaveText("A");
  } finally {
    await acct.close();
  }
});

test("AUTH-08 · deleting the account really deletes it", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page, token, userId } = acct;
    await apiFor(token).task({ name: "Gone with the account", taskType: "reminder" });
    await openTab(page, "Settings");
    await button(page, "Delete my account").click();
    await see(page, "This permanently deletes your account and everything in it");
    // "Delete", not "Delete account": the dialog's title already names what is going, and the
    // longer label was the one that would not fit beside Cancel. SettingsScreen says so too.
    await control(page, "Delete").click();
    await see(page, "Continue as test user");
    expect(db.userId(uidOf(token))).toBeUndefined();
    await signIn(page);
    await see(page, "TO DO");
    expect(await screenText(page)).not.toContain("Gone with the account");
    expect(db.userId(uidOf(await tokenFor(page)))).not.toBe(userId);
  } finally {
    await acct.close();
  }
});

test("AUTH-09 · cancelling the delete changes nothing", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page, token } = acct;
    await openTab(page, "Settings");
    await button(page, "Delete my account").click();
    await control(page, "Cancel").click();
    await page.reload();
    await see(page, "TO DO");
    expect(db.userId(uidOf(token))).toBeTruthy();
    expect((await apiFor(token).tasks("pending")).length).toBe(2);
  } finally {
    await acct.close();
  }
});

/**
 * On a phone the app's own code is on the device; only the server is out of reach. The browser
 * equivalent is serving the app but refusing every API call — a reload that also refused the
 * page itself would be testing the browser, not the app.
 */
test("AUTH-10 · a cold start with no network shows the last known screen", async ({ browser }) => {
  const acct = await freshAccount(browser);
  try {
    const { page } = acct;
    await see(page, "Try a focus session");
    await page.waitForTimeout(1_500); // let the cache reach storage
    await page.route(/localhost:8080\/api\//, (r) => r.abort("internetdisconnected"));
    await page.route(/googleapis\.com|firebase/, (r) => r.abort("internetdisconnected"));
    await page.reload();
    await see(page, "Try a focus session", 20_000);
    await see(page, "Learn Something New");
    expect(await screenText(page)).not.toContain("Continue as test user");
    await control(page, "Done: Try scheduling something").click();
    await see(page, /Couldn't complete/);
  } finally {
    await acct.close();
  }
});
