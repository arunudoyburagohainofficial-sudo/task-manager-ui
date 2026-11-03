import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { button, control, dateKey, exact, openTab, reload, screenText, see, stats } from "../harness/app";
import { db } from "../harness/db";

/**
 * Progress, Settings and the points ledger — plan/10-progress-settings.md.
 *
 * Where the app's numbers are supposed to reconcile. If Home and Progress can disagree, neither is
 * believable. Settings matters because two of its preferences change behaviour elsewhere.
 */

/** A focus task finished today after a real `minutes`-minute session. */
async function focusedFor(api: Api, name: string, minutes: number, finish = true) {
  const t = await api.task({ name });
  const s = await api.startSession(t.id, { plannedMinutes: 60 });
  db.sessionStartedAgo(s.id, `${minutes} minutes 3 seconds`);
  await api.completeSession(s.id, { wasInterrupted: true });
  if (finish) await api.complete(t.id);
  return t;
}

async function progressTab(page: Page, name: "Week" | "Month" | "All time") {
  await page.getByRole("tab", { name, exact: true }).locator("visible=true").last().click();
}

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

test.describe("progress", () => {
  test("PROG-01 · Week, Month and All time each show their own figures", async ({ app }) => {
    const { page, api, userId } = app;
    await focusedFor(api, "This week", 15);
    const weekStart = (await api.weekly()).weekStartDate;
    db.weekRow(userId, addDays(weekStart, -7), 3, 90);
    await reload(page);
    await openTab(page, "Progress");

    await see(page, /WEEKLY GOAL \| ⓘ \| 1 \| of 10 · 10%/);
    await see(page, /15 min \| focus time/);

    await progressTab(page, "Month");
    await see(page, /Week of [A-Z][a-z]{2} \d+ \| 3 tasks · 1h 30m|Week of [A-Z][a-z]{2} \d+ \| 3 tasks · 90 min/);
    await see(page, /1 tasks · 15 min/);
    expect(await screenText(page)).not.toContain("focus time");

    await progressTab(page, "All time");
    const all = await api.allTime();
    await see(page, new RegExp(`FOCUS TASKS COMPLETED \\| ${all.totalTasksCompleted}`));
    expect(all.totalTasksCompleted).toBe(4);
    expect(await screenText(page)).not.toContain("WEEKLY GOAL");
  });

  /** Weekly progress counts focus completions only; points count everything. Both must be right. */
  test("PROG-02 · this week's figures agree with what Home counted today", async ({ app }) => {
    const { page, api } = app;
    await focusedFor(api, "Focus work", 12);
    await api.complete((await api.task({ name: "A reminder", taskType: "reminder" })).id);
    await reload(page);
    expect(await stats(page)).toMatchObject({ minutes: 12, points: 17 });
    await openTab(page, "Progress");
    await see(page, /12 min \| focus time/);
    await see(page, /1 \| of 10 · 10%/); // the reminder didn't count toward the week
  });

  test("PROG-03 · this week's target is fixed once the week has started", async ({ app }) => {
    const { page, api } = app;
    await focusedFor(api, "Locks the week", 5);
    await reload(page);
    await openTab(page, "Settings");
    await control(page, "Increase weekly goal").click();
    await control(page, "Increase weekly goal").click();
    await button(page, "Save preferences").click();
    await see(page, "12 tasks");
    await openTab(page, "Progress");
    await see(page, /1 \| of 10 · 10%/);
    expect((await api.weekly()).weeklyGoal).toBe(10);
  });

  test("PROG-04 · the streak and its grace day follow the rule", async ({ app }) => {
    const { page, api, userId } = app;
    // Five days in, yesterday missed, grace unspent: today's session bridges it and spends it.
    db.streak(userId, { current: 5, longest: 5, lastActivity: dateKey(-2), graceUsed: false });
    await focusedFor(api, "Bridges the gap", 5);
    expect(await api.streak()).toMatchObject({ currentStreak: 6, gracePeriodUsed: true });
    await reload(page);
    await openTab(page, "Progress");
    await see(page, /6 days \| current streak/);
    await see(page, /0 left[^|]* \| streak grace day/);

    // A second gap with the grace already spent: back to 1.
    db.streak(userId, { current: 6, longest: 6, lastActivity: dateKey(-2), graceUsed: true });
    await focusedFor(api, "Too late", 5);
    expect(await api.streak()).toMatchObject({ currentStreak: 1, longestStreak: 6, gracePeriodUsed: false });
  });

  /**
   * The stored count only changes when a focus task is finished, and it used to be shown as-is:
   * stop for a week and Home still said "12 DAY STREAK" until the next session reset it to 1.
   */
  test("PROG-08 · a streak that has lapsed reads as zero, not as what it once was", async ({ app }) => {
    const { page, api, userId } = app;
    db.streak(userId, { current: 12, longest: 12, lastActivity: dateKey(-7), graceUsed: false });
    // Some finished work, so Progress has something to show rather than its first-day state.
    await api.complete((await api.task({ name: "Earlier work", taskType: "reminder" })).id);
    await reload(page);
    expect((await stats(page)).streak).toBe(0);
    await openTab(page, "Progress");
    await see(page, /0 days \| current streak/);
    await see(page, /12 days \| longest streak/);
    // Still alive with one missed day and the grace unspent.
    db.streak(userId, { current: 4, longest: 12, lastActivity: dateKey(-2), graceUsed: false });
    expect((await api.streak()).currentStreak).toBe(4);
  });

  test("PROG-05 · undo doesn't take the streak back", async ({ app }) => {
    const { api } = app;
    const t = await focusedFor(api, "Undone", 5);
    expect((await api.streak()).currentStreak).toBe(1);
    await api.reopen(t.id);
    expect((await api.streak()).currentStreak).toBe(1);
  });

  test("PROG-06 · undo does take the week's count back, and never below zero", async ({ app }) => {
    const { page, api } = app;
    const t = await focusedFor(api, "Counted then not", 5);
    expect((await api.weekly()).tasksCompleted).toBe(1);
    await api.reopen(t.id);
    expect((await api.weekly()).tasksCompleted).toBe(0);
    // Undoing something finished last week leaves this week at zero, not minus one.
    const old = await api.task({ name: "Last week's" });
    await api.complete(old.id);
    db.completedAt(old.id, { ago: "8 days" });
    const { sql } = await import("../harness/db");
    sql(`UPDATE weekly_progress SET tasks_completed = 0 WHERE week_start_date = '${(await api.weekly()).weekStartDate}'`);
    await api.reopen(old.id);
    expect((await api.weekly()).tasksCompleted).toBe(0);
    await reload(page);
  });

  test("PROG-07 · a new account's Progress offers the way in, not a wall of zeros", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Progress");
    // An honest zero that says what would move it, rather than a wall of them.
    await see(page, /WEEKLY GOAL \| ⓘ \| 0 \| of 10 · 0%/);
    await see(page, "Finish a focus session and it lands here.");
    await see(page, "No goals yet - create one from Home.");
    // And the way in is where it always is.
    await control(page, "Capture tasks").click();
    await see(page, "What’s on your mind?");
  });
});

test.describe("settings", () => {
  test("SET-01 · the default focus length changes what a session starts at, everywhere", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Uses the default" });
    await reload(page);
    await openTab(page, "Settings");
    await button(page, /Default focus duration/).click(); // 25 → 45
    await see(page, /Default focus duration \| 45 min/);
    await button(page, "Save preferences").click();
    await openTab(page, "Home");
    await see(page, "Uses the default | Focus · 45 min | +45");
    await exact(page, "Uses the default").click();
    await see(page, "Start 45 min session");
    await button(page, "Start 45 min session").click();
    await see(page, "End Session");
    expect((await api.currentSession())!.plannedMinutes).toBe(45);
  });

  test("SET-02 · preferences save only when saved, and then survive a reload", async ({ app }) => {
    const { page, api } = app;
    await openTab(page, "Settings");
    expect(await screenText(page)).not.toContain("Save preferences");
    await control(page, "Increase weekly goal").click();
    await see(page, "Save preferences");
    // Walk away without saving: nothing changed.
    await openTab(page, "Home");
    await reload(page);
    await openTab(page, "Settings");
    await see(page, "10 tasks");
    expect((await api.weekly()).weeklyGoal).toBe(10);

    await control(page, "Increase weekly goal").click();
    await button(page, "Save preferences").click();
    await expect(button(page, "Save preferences")).toBeHidden();
    await reload(page);
    await openTab(page, "Settings");
    await see(page, "11 tasks");
  });

  /**
   * The switch was stored and never read: turning it off changed nothing, and reminders kept
   * arriving. What reaches the OS is device-only; what the browser can prove is that the choice
   * sticks, and that saving it re-syncs the queue at once (the queue then honours it — LOGIC-37).
   */
  test("SET-03 · turning reminder notifications off sticks, and re-syncs straight away", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    const toggle = page.getByRole("switch", { name: "Reminder notifications" }).locator("visible=true").last();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    const synced = page.waitForResponse((r) => /\/api\/reminders$/.test(r.url()), { timeout: 5_000 });
    await button(page, "Save preferences").click();
    await synced;
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("preferences-v1") ?? "{}").notificationsEnabled)).toBe(false);
    await reload(page);
    await openTab(page, "Settings");
    await expect(page.getByRole("switch", { name: "Reminder notifications" }).locator("visible=true").last()).toHaveAttribute("aria-checked", "false");
  });

  /** Saving two preferences at once used to keep only the second. */
  test("SET-03b · two preferences saved together both stick", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    await page.getByRole("switch", { name: "Reminder notifications" }).locator("visible=true").last().click();
    await button(page, /Default focus duration/).click();
    await button(page, "Save preferences").click();
    await expect(button(page, "Save preferences")).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("preferences-v1") ?? "{}"));
    expect(saved).toMatchObject({ notificationsEnabled: false, defaultFocusDurationMinutes: 45 });
  });

  /*
   * This used to read "SOON". The Focus Shield is built now, but it is Android-only by
   * construction - there is no iOS equivalent of PACKAGE_USAGE_STATS - so on any other platform
   * the row has to say where it works rather than pretend the switch does nothing.
   */
  test("SET-04 · Do Not Disturb says where it actually works", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    await see(page, /Do Not Disturb during focus \| ANDROID/);
    await see(page, "Silences your phone while a session runs. Available on Android - your choice is saved and will apply there.");
  });

  /**
   * The footer used to read "Support & feedback" and do nothing at all - text shaped like a
   * link, with no address behind it and nothing to tap. A beta with no route back from the
   * person using it is a beta that only hears from people who already know where to write.
   */
  test("SET-04b · the feedback row opens a mail draft addressed to support", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    await see(page, "FEEDBACK");
    await see(page, "Opens your email, addressed to hello@mactora.com.");
    // Said once in full, so a broken address is a failing test rather than a quiet dead end.
    await see(page, "Version 1.0.0 · hello@mactora.com");

    /*
     * react-native-web's Linking sends everything except tel: through window.open, so that is
     * what has to be watched - a route handler never sees it, and no navigation happens.
     */
    await page.evaluate(() => {
      (window as unknown as { __mailto: string[] }).__mailto = [];
      const real = window.open.bind(window);
      window.open = (url?: string | URL, ...rest: unknown[]) => {
        const href = typeof url === "string" ? url : url?.toString() ?? "";
        if (href.startsWith("mailto:")) {
          (window as unknown as { __mailto: string[] }).__mailto.push(href);
          return null;
        }
        return (real as (...a: unknown[]) => Window | null)(url, ...rest);
      };
    });
    const drafts = () => page.evaluate(() => (window as unknown as { __mailto: string[] }).__mailto);

    await control(page, "Report a bug or suggest an idea").click();
    await expect
      .poll(async () => (await drafts()).join(" "), { message: "the row never opened a mail draft" })
      .toContain("mailto:hello@mactora.com?subject=FOYG%20feedback");
    // The two things every bug report needs and nobody remembers to include.
    const draft = (await drafts()).join(" ");
    expect(draft).toContain("App%20version%3A%201.0.0");
    expect(draft).toContain("Platform%3A%20web");
  });

  test("SET-05 · Replay walkthrough goes Home and starts at step 1", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    await button(page, /Replay walkthrough/).click();
    await see(page, /1 of 5/);
    await see(page, "Start with a goal");
    await button(page, /^Skip/).click();
    await see(page, "GOALS"); // it brought us Home, where the step's target is
  });

  /**
   * Email opens the same sheet the name does. It still cannot be edited there — but a row
   * that looks like every other row and does nothing when tapped reads as broken rather than
   * as read-only, so the sheet is where the app gets to say why.
   */
  test("SET-06 · email and name both open the profile sheet, which says why neither can be typed into", async ({ app }) => {
    const { page } = app;
    await openTab(page, "Settings");
    // Phone is drawn only for an account that has a number; this one signed in without one,
    // and a row reading "Phone -" for every Google user is a row that exists to say nothing.
    await expect(page.getByRole("button", { name: /^Phone/ }).locator("visible=true")).toHaveCount(0);
    await button(page, /^Email/).click();
    await see(page, "Edit profile");
    // The sheet names only what the account actually has — this one signed in without a
    // phone number, so the sentence about one would be explaining a field that is not there.
    await see(page, "Your email comes from how you signed in and can’t be changed here.");
    await reload(page);
    await openTab(page, "Settings");
    await button(page, /^Name/).click();
    await see(page, "Edit profile");
  });
});

test("SET-10 · a weekly goal changed on another device reaches this one", async ({ app }) => {
  /*
   * Found 2026-09-18, fixed 2026-09-19: the profile was saved at sign-in and never read again,
   * and the API had no GET for it. The app now re-reads GET /users/me at launch and whenever it
   * comes back to the front.
   */
  const { page, api } = app;
  await api.setWeeklyGoal(14); // "the other device"
  await reload(page);
  await openTab(page, "Settings");
  await see(page, "14 tasks", 5_000);
});

test.describe("the points ledger", () => {
  test("SET-07 · a day's points add up from both sources, counting a session once", async ({ app }) => {
    const { page, api } = app;
    for (const n of ["R1", "R2"]) await api.complete((await api.task({ name: n, taskType: "reminder" })).id);
    await focusedFor(api, "Focused then finished", 12); // session 12, then the task completed
    expect(await api.today()).toMatchObject({ pointsEarned: 22, focusMinutes: 12 });
    await reload(page);
    expect(await stats(page)).toMatchObject({ points: 22, minutes: 12 });
  });

  test("SET-08 · the figures after a reload are the figures before it", async ({ app }) => {
    const { page, api } = app;
    await api.complete((await api.task({ name: "One", taskType: "reminder" })).id);
    await focusedFor(api, "Two", 7, false);
    await reload(page);
    const before = await stats(page);
    await reload(page);
    expect(await stats(page)).toEqual(before);
    expect(before).toMatchObject({ points: 12, minutes: 7 });
  });

  test("SET-09 · a reminder finished before reminders earned anything isn't given five points now", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Before the rule", taskType: "reminder" });
    await api.complete(t.id);
    db.setPoints(t.id, null);
    await reload(page);
    expect((await api.today()).pointsEarned).toBe(0);
    expect((await stats(page)).points).toBe(0);
  });
});
