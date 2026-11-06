import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { API, type Api } from "../harness/api";
import { background, button, control, markClocked, dateKey, exact, foreground, reload, screenText, section, see, stats } from "../harness/app";
import { db } from "../harness/db";

/**
 * Focus sessions — plan/07-focus-sessions.md.
 *
 * The part of the app that credits people for work, so both failure directions are real:
 * crediting time nobody spent, or losing time someone did.
 *
 * Two clocks are in play and the tests move both. The *countdown* is a deadline the phone sets
 * when the session starts, so the page's fake clock moves it. The *credit* is computed by the
 * server from when the session started, so the database back-dates that to match.
 */

/** Starts driving the page's clock from the real now, so it can be fast-forwarded. */
async function ownTheClock(page: Page) {
  markClocked(page);
  await page.clock.install({ time: new Date() });
  await reload(page);
}

/** Opens a focus task and starts its session from Task Detail. */
async function startFromDetail(page: Page, name: string) {
  await exact(page, name).click();
  await button(page, /^Start \d+ (min session|rounds?)$/).click();
  await see(page, /End Session/);
}

/** Back-dates the open session on the server, and moves the phone's clock by the same amount. */
async function spend(page: Page, api: Api, minutes: number) {
  const s = (await api.currentSession())!;
  db.sessionStartedAgo(s.id, `${minutes} minutes 2 seconds`);
  await page.clock.fastForward(minutes * 60_000);
  return s;
}

async function endEarly(page: Page) {
  await button(page, "End Session").click();
  // "End" is the dialog's confirm; "End Session" above is the screen's own button.
  await control(page, "End").click();
  await see(page, "Session complete");
}

/** "MM:SS" on the running timer, as seconds. */
async function timerSeconds(page: Page): Promise<number> {
  const m = /\| (\d+):(\d\d) \|/.exec(await screenText(page));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

test.describe("running one", () => {
  test("FOCUS-01 · a session counts down from the length chosen, with Ferne asleep", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Write" });
    await reload(page);
    await startFromDetail(page, "Write");
    await see(page, /Write \| 2[45]:\d\d \| 0% complete \| 25 min session/);
    await expect(page.getByRole("img", { name: "Foyg, asleep while you focus" })).toBeVisible();
  });

  /** A counter that froze when JS was suspended made a locked-phone session run 35 real minutes. */
  test("FOCUS-02 · the timer keeps real time while the app is hidden", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Locked phone" });
    await ownTheClock(page);
    await startFromDetail(page, "Locked phone");
    await background(page);
    await page.clock.fastForward("10:00");
    await foreground(page);
    await expect.poll(() => timerSeconds(page)).toBeLessThanOrEqual(15 * 60);
    expect(await timerSeconds(page)).toBeGreaterThan(14 * 60);
  });

  test("FOCUS-03 · pausing stops the countdown and resuming continues it", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Interrupted" });
    await ownTheClock(page);
    await startFromDetail(page, "Interrupted");
    await button(page, /Pause/).click();
    const before = await timerSeconds(page);
    await page.clock.fastForward("05:00");
    expect(await timerSeconds(page)).toBe(before);
    await button(page, /Resume/).click();
    await page.clock.fastForward("00:10");
    const after = await timerSeconds(page);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(12);
  });

  /** A tick and a foreground event can both see zero; the guard makes that one completion, not two. */
  test("FOCUS-04 · time running out ends the session by itself, once", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Run out" });
    await ownTheClock(page);
    const completions: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/focus-sessions\/[^/]+\/complete$/.test(r.url())) completions.push(r.url());
    });
    await startFromDetail(page, "Run out");
    await background(page);
    await page.clock.fastForward("25:02");
    await foreground(page);
    await see(page, "Session complete");
    await page.waitForTimeout(1_500);
    expect(completions).toHaveLength(1);
  });

  test("FOCUS-05 · ending early still credits the time spent", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Ten minutes" });
    await ownTheClock(page);
    await startFromDetail(page, "Ten minutes");
    await spend(page, api, 10);
    await endEarly(page);
    await see(page, /Session complete \| 10 min \| focused \| \+10 XP/);
    expect(await api.today()).toMatchObject({ focusMinutes: 10, pointsEarned: 10 });
  });

  test("FOCUS-06 · keeping the task open keeps it open, and keeps the credit", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Come back later" });
    await ownTheClock(page);
    await startFromDetail(page, "Come back later");
    await spend(page, api, 8);
    await endEarly(page);
    await button(page, "Keep task open").click();
    await expect.poll(() => section(page, "TO DO")).toContain("Come back later");
    expect(await screenText(page)).not.toContain("Session complete");
    expect(await screenText(page)).not.toContain("IN SESSION");
    await expect.poll(async () => (await stats(page)).minutes).toBe(8);
  });

  test("FOCUS-07 · marking the task complete from the prompt does both", async ({ app }) => {
    /*
     * `spend` fast-forwards the *device* clock twelve minutes. Run this close enough to
     * midnight and that crosses it: the task is completed at a real time the device now calls
     * yesterday, and DONE - which is today only, by design - is correctly empty. The app is
     * right either way; which outcome applies depends on the wall clock, not the code.
     */
    test.skip(
      Date.now() + 15 * 60_000 > new Date().setHours(24, 0, 0, 0),
      "fast-forwarding twelve minutes would cross midnight, and DONE is today only"
    );
    const { page, api } = app;
    await api.task({ name: "All done" });
    await ownTheClock(page);
    await startFromDetail(page, "All done");
    await spend(page, api, 12);
    await endEarly(page);
    await button(page, /Mark task complete/).click();
    await see(page, /Task complete \| \+12 XP/);
    await see(page, /12 min \| time spent/);
    await button(page, /Next task/).click();
    await expect.poll(() => section(page, "DONE")).toMatch(/All done \| Focus · [^|]+ \| \+12/);
    expect(await screenText(page)).not.toMatch(/Session complete|Task complete/);
    expect((await api.streak()).currentStreak).toBe(1);
    expect((await api.weekly()).tasksCompleted).toBe(1);
  });

  test("FOCUS-08 · a session under a minute earns nothing, and doesn't dress it up", async ({ app }) => {
    /*
     * Found 2026-09-18, fixed 2026-09-19: the prompt read "+0 XP" and the completion screen
     * "+0 XP — nice work." Now the prompt says "No XP · under a minute" and the completion
     * screen leaves the points out.
     */
    const { page, api } = app;
    await api.task({ name: "Barely started" });
    await reload(page);
    await startFromDetail(page, "Barely started");
    await endEarly(page);
    await see(page, /0 min \| focused \| No XP \| under a minute/);
    expect(await api.today()).toMatchObject({ focusMinutes: 0, pointsEarned: 0 });
    expect(await screenText(page)).not.toContain("+0");
    await button(page, /^Mark task complete/).click();
    await see(page, "Task complete");
    expect(await screenText(page)).not.toMatch(/\+0|XP/);
  });

  /** An uncapped session left open over a weekend once credited 4,320 minutes. */
  test("FOCUS-09 · a session left running is capped at exactly what was planned", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Forgotten" });
    await reload(page);
    await startFromDetail(page, "Forgotten");
    const s = (await api.currentSession())!;
    db.sessionStartedAgo(s.id, "9 hours");
    await endEarly(page);
    // The plan, with no grace on top: everything past the bell is the gap before someone
    // noticed, not work. Nine hours is worth 25 minutes.
    await see(page, /Session complete \| 25 min \| focused/);
    expect((await api.today()).focusMinutes).toBe(25);
  });
});

test.describe("leaving and coming back", () => {
  test("FOCUS-10 · leaving the session screen doesn't lose the session", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Wandered off" });
    await reload(page);
    await startFromDetail(page, "Wandered off");
    await page.goto("/");
    await see(page, /IN SESSION \| Wandered off \| 2[45]:\d\d \| left/);
  });

  /** Reopening used to hand back a fresh full-length timer. */
  test("FOCUS-11 · Resume continues the session; it doesn't restart it", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Pick up again" });
    const s = await api.startSession(t.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(s.id, "10 minutes");
    await reload(page);
    await see(page, /IN SESSION \| Pick up again \| 1[45]:\d\d \| left/);
    await control(page, "Open session").click();
    await see(page, /End Session/);
    const left = await timerSeconds(page);
    expect(left).toBeGreaterThan(14 * 60);
    expect(left).toBeLessThanOrEqual(15 * 60);
  });

  test("FOCUS-12 · a reload mid-session finds it again", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Survives reload" });
    await reload(page);
    await startFromDetail(page, "Survives reload");
    await reload(page);
    await see(page, /IN SESSION[\s\S]*Survives reload/);
    await control(page, "Open session").click();
    await see(page, /End Session/);
  });

  /**
   * The old "Time's up · Finish" prompt is gone. A session that has outlived everything it could
   * earn is now closed by `useAutoFinishStaleSession` as soon as Home looks at it, so the user
   * never has to clear up after themselves to start the next one. The figure is the same either
   * way: exactly the 25 minutes planned, and not a minute of the half hour beyond it.
   */
  test("FOCUS-13 · a session whose time ran out while away closes itself, crediting the cap", async ({ app }) => {
    /*
     * Back-dating thirty minutes lands on yesterday if this runs in the small hours, and a
     * session that crossed midnight is discarded rather than credited - deliberately, so that
     * yesterday's hours never land on today's totals or mark a streak day that cannot be taken
     * back. Both outcomes are correct; which applies depends on the clock.
     */
    test.skip(
      Date.now() - 31 * 60_000 < new Date().setHours(0, 0, 0, 0),
      "thirty minutes ago was yesterday, where an abandoned session is discarded, not credited"
    );
    const { page, api } = app;
    const t = await api.task({ name: "In my pocket" });
    const s = await api.startSession(t.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(s.id, "30 minutes");
    await reload(page);
    await expect.poll(() => api.currentSession()).toBeNull();
    expect(await screenText(page)).not.toContain("IN SESSION");
    await expect.poll(async () => (await api.today()).focusMinutes).toBe(25);
  });

  test("FOCUS-14 · a session with no recorded length says only what it knows", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Older build" });
    const s = await api.startSession(t.id, { plannedMinutes: 25 });
    db.sessionWithoutPlan(s.id);
    db.sessionStartedAgo(s.id, "7 minutes");
    await reload(page);
    // No planned length means no deadline, so the card shows a dash rather than inventing one.
    await see(page, /IN SESSION \| Older build \| - \| left/);
    expect(await screenText(page)).not.toMatch(/left of|Time's up/);
  });

  test("FOCUS-15 · starting a second session opens the one already running", async ({ app }) => {
    const { page, api } = app;
    const a = await api.task({ name: "Running one" });
    await api.task({ name: "Other one" });
    const s = await api.startSession(a.id, { plannedMinutes: 25 });
    await reload(page);
    await exact(page, "Other one").click();
    await button(page, /^Start \d+ min session$/).click();
    await see(page, /^Running one \|[\s\S]*End Session/);
    expect((await api.currentSession())!.id).toBe(s.id);
  });

  /**
   * FINDING (2026-09-18): the app has no way to discard a session that's running normally — the
   * only "Discard it" is inside the alert shown when a session can't be reached (DETAIL-17), and
   * ending a session always credits it. So a session started by mistake can only be ended, for
   * credit. This proves the discard itself behaves; the missing button is reported, not faked.
   */
  /** The server always allowed this; until 2026-09-19 the screen never offered it. */
  test("FOCUS-16 · discarding credits nothing and frees the slot", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Started by mistake" });
    await reload(page);
    await startFromDetail(page, "Started by mistake");
    db.sessionStartedAgo((await api.currentSession())!.id, "10 minutes");
    // Asking first, and "Keep going" really keeps it going.
    await button(page, "Discard session").click();
    await see(page, "None of this time will count - no minutes, no XP.");
    await control(page, "Keep going").click();
    expect(await api.currentSession()).not.toBeNull();
    await button(page, "Discard session").click();
    await control(page, "Discard").click();
    await see(page, "Session discarded - nothing was counted");
    await see(page, "TO DO");
    expect(await api.currentSession()).toBeNull();
    expect(await screenText(page)).not.toContain("IN SESSION");
    expect(await api.today()).toMatchObject({ focusMinutes: 0, pointsEarned: 0 });
    await startFromDetail(page, "Started by mistake");
  });
});

test.describe("pomodoro", () => {
  async function startPomodoro(page: Page, name: string) {
    await exact(page, name).click();
    await button(page, "Pomodoro").click();
    await see(page, /Start 2 rounds|rounds/);
    // Two rounds.
    for (let i = 0; i < 6 && !/Start 2 rounds/.test(await screenText(page)); i++) {
      const text = await screenText(page);
      const n = Number(/Start (\d+) rounds?/.exec(text)?.[1] ?? 0);
      await control(page, n > 2 ? "Decrease rounds" : "Increase rounds").click();
    }
    await button(page, "Start 2 rounds").click();
    await see(page, /Cycle 1 of 2/);
  }

  test("FOCUS-17 · cycles run in order, and a break never rolls into work on its own", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Two rounds" });
    await ownTheClock(page);
    await startPomodoro(page, "Two rounds");
    await page.clock.fastForward("25:02");
    await see(page, /Cycle 1 complete \| Break time - stretch, breathe, hydrate\./);
    await see(page, "cycle 2 will not start on its own");
    await page.clock.fastForward("30:00"); // well past the break
    await see(page, "Cycle 1 complete");
    await button(page, "Start Cycle 2").click();
    await see(page, /Cycle 2 of 2/);
  });

  test("FOCUS-18 · ending during a break credits the cycles finished, not the plan", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "One of two" });
    await ownTheClock(page);
    const sent: unknown[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/focus-sessions\/[^/]+\/complete$/.test(r.url())) sent.push(r.postDataJSON());
    });
    await startPomodoro(page, "One of two");
    await page.clock.fastForward("25:02");
    await see(page, "Cycle 1 complete");
    await button(page, "End session here").click();
    await control(page, "End").click();
    await see(page, "Session complete");
    expect(sent).toEqual([{ wasInterrupted: true, numPomodoroCycles: 1 }]);
  });

  /** The server stores the sitting's length, not the split — so the position genuinely isn't known. */
  test("FOCUS-19 · a resumed Pomodoro reopens at the start of a block", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Resumed rounds" });
    const s = await api.startSession(t.id, { plannedMinutes: 50, focusMode: "pomodoro", numPomodoroCycles: 2 });
    db.sessionStartedAgo(s.id, "10 minutes");
    await reload(page);
    await control(page, "Open session").click();
    await see(page, /End Session/);
    expect(await timerSeconds(page)).toBeGreaterThanOrEqual(24 * 60);
  });
});

test.describe("points and guards", () => {
  test("FOCUS-20 · session points reach today's totals once — finishing the task adds nothing more", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Twelve" });
    const s = await api.startSession(t.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(s.id, "12 minutes 2 seconds");
    await api.completeSession(s.id, { wasInterrupted: true });
    expect(await api.today()).toMatchObject({ focusMinutes: 12, pointsEarned: 12 });
    await api.complete(t.id);
    expect(await api.today()).toMatchObject({ focusMinutes: 12, pointsEarned: 12 });
    await reload(page);
    expect(await stats(page)).toMatchObject({ points: 12, minutes: 12 });
  });

  test("FOCUS-21 · a session can't be started on a reminder or a finished task", async ({ app }) => {
    const { page, api } = app;
    const reminder = await api.task({ name: "Just a reminder", taskType: "reminder" });
    const finished = await api.task({ name: "Already finished" });
    await api.complete(finished.id);
    await expect(api.startSession(reminder.id, { plannedMinutes: 25 })).rejects.toMatchObject({ status: expect.any(Number) });
    await expect(api.startSession(finished.id, { plannedMinutes: 25 })).rejects.toMatchObject({ status: expect.any(Number) });
    expect(await api.currentSession()).toBeNull();
    // And the app never offers it.
    await reload(page);
    await exact(page, "Just a reminder").click();
    await see(page, "Mark as done");
    expect(await screenText(page)).not.toMatch(/Start \d+ min session/);
    expect(dateKey(0)).toBeTruthy();
    expect(API).toContain("localhost");
  });
});
