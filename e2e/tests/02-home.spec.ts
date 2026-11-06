import { expect, test } from "../harness/fixtures";
import {
  button,
  control,
  dateKey,
  deviceClockAt,
  dontSee,
  exact,
  expectNoSidewaysScroll,
  foreground,
  hourNow,
  openTab,
  reload,
  screenText,
  section,
  see,
  stats,
  tab,
} from "../harness/app";
import { db } from "../harness/db";

/**
 * Home — plan/02-home.md.
 *
 * The screen people open every day, and the only one that decides what is theirs to do today.
 * Every rule here was arrived at after a bug; the comments say which.
 */

test.describe("what belongs on the list", () => {
  test("HOME-01 · an empty account reads as empty, not broken", async ({ app }) => {
    const { page } = app;
    await see(page, "Nothing to do yet");
    await see(page, "GOALS");
    await expect(control(page, "Create a new goal")).toBeVisible();
    const text = await screenText(page);
    expect(text).not.toContain("| DONE |");
    expect(text).not.toContain("That’s everything");
    expect(text).not.toMatch(/of \d+ days/); // no goal cards
  });

  test("HOME-02 · an undated task is on Home and counted", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Someday", taskType: "reminder" });
    await reload(page);
    await see(page, /TO DO \| 1 \|/);
    expect(await section(page, "TO DO")).toContain("Someday");
  });

  test("HOME-03 · today's task is here; tomorrow's is on Scheduled instead", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "For today", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.task({ name: "For tomorrow", taskType: "reminder", scheduledFor: dateKey(1) });
    await reload(page);
    await see(page, "For today");
    expect(await screenText(page)).not.toContain("For tomorrow");

    await openTab(page, "Scheduled");
    await see(page, /UPCOMING[\s\S]*For tomorrow/);
  });

  /**
   * A missed dated reminder used to vanish from Home the moment it slipped — silent (a past
   * notification never re-fires) and out of sight on the one screen people check.
   */
  test("HOME-04 · a missed one-off stays on Home and is also listed as overdue", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Missed it", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(t.id, dateKey(-1));
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Missed it");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");

    await openTab(page, "Scheduled");
    await see(page, /OVERDUE[\s\S]*Missed it/);
  });

  test("HOME-05 · a missed routine stays on Home and isn't double-listed as overdue", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Daily walk", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    db.scheduledFor(t.id, dateKey(-3));
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Daily walk");

    await openTab(page, "Scheduled");
    await see(page, /RECURRING[\s\S]*Daily walk/);
    expect(await screenText(page)).not.toContain("OVERDUE");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
  });

  test("HOME-06 · the running task is lifted out of TO DO", async ({ app }) => {
    const { page, api } = app;
    const running = await api.task({ name: "In progress" });
    await api.task({ name: "Waiting", taskType: "reminder" });
    await api.startSession(running.id, { plannedMinutes: 25 });
    await reload(page);
    await see(page, /IN SESSION[\s\S]*In progress/);
    const todo = await section(page, "TO DO");
    expect(todo).not.toContain("In progress");
    expect(todo).toMatch(/^1 \|/); // one fewer than there are pending tasks
  });
});

test.describe("what a row says", () => {
  test("HOME-07 · each kind of row shows its own wording and action", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Reading", 20);
    await api.task({ name: "A focus task" });
    await api.task({ name: "A reminder", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "23:30:00", daysBefore: 0 }] });
    await api.task({ name: "A plain task", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.task({ name: "A goal task", taskType: "reminder", goalId: goal.id });
    await reload(page);

    await see(page, /A focus task \| Focus · 25 min/);
    await see(page, "A reminder | Reminder · 11:30 PM");
    await see(page, "A plain task | Task · today");
    await see(page, "A goal task | Goal · Reading");
    await expect(control(page, "Focus: A focus task")).toBeVisible();
    await expect(control(page, "Done: A reminder")).toBeVisible();
  });

  test("HOME-08 · a goal row keeps the action its type needs", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Fitness", 20);
    await api.task({ name: "Run", goalId: goal.id });
    await api.task({ name: "Stretch", taskType: "reminder", goalId: goal.id });
    await reload(page);
    await see(page, "Run | Goal · Fitness");
    await see(page, "Stretch | Goal · Fitness");
    await expect(control(page, "Focus: Run")).toBeVisible();
    await expect(control(page, "Done: Stretch")).toBeVisible();
  });

  /** The row's time means "you'll hear about this today". A warning that fired yesterday would be a lie there. */
  test("HOME-09 · a task whose only notification is a day early isn't a Reminder row", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Early warning", taskType: "reminder", scheduledFor: dateKey(1), notifications: [{ time: "09:00:00", daysBefore: 1 }] });
    const t = await api.task({ name: "Warned yesterday", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "09:00:00", daysBefore: 1 }] });
    await reload(page);
    await see(page, "Warned yesterday | Task · today");
    expect(await screenText(page)).not.toMatch(/Warned yesterday \| Reminder/);
    expect(t.id).toBeTruthy();
  });

  test("HOME-10 · an undated plain task shows no invented detail", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Bare", taskType: "reminder" });
    await reload(page);
    await see(page, "Bare | Task | +5 | Done");
    expect(await screenText(page)).not.toMatch(/Bare \| Task · /);
  });

  test("HOME-11 · a row's points are what finishing it will earn, and follow the default length", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Focus row" });
    await api.task({ name: "Reminder row", taskType: "reminder" });
    await reload(page);
    await see(page, "Focus row | Focus · 25 min | +25");
    await see(page, "Reminder row | Task | +5");

    await openTab(page, "Settings");
    try {
      await button(page, /Default focus duration/).click();
      await see(page, /Default focus duration \| 45 min/);
      await button(page, "Save preferences").click();
      await openTab(page, "Home");
      await see(page, "Focus row | Focus · 45 min | +45");
    } finally {
      // The account outlives this test; put the preference back.
      await openTab(page, "Settings");
      for (let i = 0; i < 6 && !/Default focus duration \| 25 min/.test(await screenText(page)); i++) {
        await button(page, /Default focus duration/).click();
      }
      if (await button(page, "Save preferences").isVisible()) await button(page, "Save preferences").click();
    }
  });

  test("HOME-12 · a long name wraps instead of pushing the button off", async ({ app }) => {
    const { page, api } = app;
    const long = "Write the quarterly review for the team and make sure every section has numbers that the finance people will actually accept";
    const unbroken = "Supercalifragilisticexpialidocious".repeat(4);
    await api.task({ name: "Short", taskType: "reminder" });
    await api.task({ name: long, taskType: "reminder" });
    await api.task({ name: unbroken, taskType: "reminder" });
    await reload(page);
    await see(page, "Short");

    const ref = (await control(page, "Done: Short").boundingBox())!;
    for (const name of [long, unbroken]) {
      const box = (await control(page, `Done: ${name}`).boundingBox())!;
      expect(box.x + box.width, `${name.slice(0, 20)}…'s button is off screen`).toBeLessThanOrEqual(375);
      expect(Math.round(box.width)).toBe(Math.round(ref.width));
      expect(Math.round(box.height)).toBe(Math.round(ref.height));
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe("finishing, undoing, counting", () => {
  test("HOME-13 · finishing a reminder moves it, counts it and earns its points", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Pay the bill", taskType: "reminder" });
    await api.task({ name: "Something else", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);

    await control(page, "Done: Pay the bill").click();
    await see(page, "“Pay the bill” done");
    await expect(button(page, "Undo")).toBeVisible();
    await see(page, /DONE \| 1 \|/);
    expect(await section(page, "DONE")).toMatch(/Pay the bill \| Task · \d{1,2}:\d{2} [AP]M \| \+5/);
    expect(await section(page, "TO DO")).not.toContain("Pay the bill");
    await see(page, /TO DO \| 1 \|/);
    await expect.poll(async () => (await stats(page)).points).toBe(before.points + 5);
    expect((await api.today()).pointsEarned).toBe(before.points + 5);
  });

  /** Points are the one thing undo reverses — streak and goal progress deliberately don't. */
  test("HOME-14 · undo puts the task back and takes the points back", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Changed my mind", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);

    await control(page, "Done: Changed my mind").click();
    await expect.poll(async () => (await stats(page)).points).toBe(before.points + 5);
    await button(page, "Undo").click();
    await see(page, "“Changed my mind” put back");
    await expect.poll(() => section(page, "TO DO")).toContain("Changed my mind");
    await dontSee(page, /\| DONE \|/);
    await expect.poll(async () => (await stats(page)).points).toBe(before.points);
    expect((await api.today()).pointsEarned).toBe(before.points);
  });

  test("HOME-15 · a completion that fails comes back with a reason", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Won't save", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);
    // Reminders finish through /done (the same endpoint as the notification's button); focus tasks through /complete.
    await page.route(/\/api\/tasks\/[^/]+\/(complete|done)$/, (r) => r.fulfill({ status: 500, body: "{}" }));

    await control(page, "Done: Won't save").click();
    await see(page, "Couldn't complete “Won't save” - check your connection.");
    await expect.poll(() => section(page, "TO DO")).toContain("Won't save");
    expect(await screenText(page)).not.toContain("| DONE |");
    expect((await stats(page)).points).toBe(before.points);
    expect((await api.tasks("completed")).length).toBe(0);
  });

  test("HOME-16 · a double tap on Done completes once", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Tap tap", taskType: "reminder" });
    await reload(page);
    const done = control(page, "Done: Tap tap");
    await done.dblclick({ force: true }).catch(() => undefined);
    await see(page, /DONE \| 1 \|/);
    await page.waitForTimeout(1_000);
    expect((await api.tasks("completed")).length).toBe(1);
    expect((await api.today()).pointsEarned).toBe(5);
  });

  test("HOME-17 · DONE is today only, oldest first", async ({ app }) => {
    test.skip(hourNow() < 2, "needs two completion times earlier today");
    const { page, api } = app;
    const late = await api.task({ name: "Finished later", taskType: "reminder" });
    const early = await api.task({ name: "Finished earlier", taskType: "reminder" });
    const old = await api.task({ name: "Finished yesterday", taskType: "reminder" });
    for (const t of [late, early, old]) await api.complete(t.id);
    db.completedAt(late.id, { ago: "20 minutes" });
    db.completedAt(early.id, { ago: "80 minutes" });
    db.completedAt(old.id, { ago: "1 day" });
    await reload(page);

    const done = await section(page, "DONE");
    expect(done).not.toContain("Finished yesterday");
    expect(done.indexOf("Finished earlier")).toBeGreaterThanOrEqual(0);
    expect(done.indexOf("Finished earlier")).toBeLessThan(done.indexOf("Finished later"));
    expect(done).toMatch(/^2 \|/);
  });

  test("HOME-18 · a task that earned nothing shows no points pill", async ({ app }) => {
    const { page, api } = app;
    const focus = await api.task({ name: "Never ran a session" });
    const legacy = await api.task({ name: "Finished before points", taskType: "reminder" });
    await api.complete(focus.id);
    await api.complete(legacy.id);
    db.setPoints(legacy.id, null);
    await reload(page);
    const done = await section(page, "DONE");
    expect(done).toMatch(/^2 \|/);
    expect(done).toContain("Never ran a session");
    expect(done).toContain("Finished before points");
    // No pill at all — neither "+0" nor an empty one.
    expect(done).not.toContain("+");
  });
});

test.describe("sections, stats and the rest", () => {
  test("HOME-19 · a collapsed section hides its rows but not its count", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Still counted", taskType: "reminder" });
    const f = await api.task({ name: "Already done", taskType: "reminder" });
    await api.complete(f.id);
    await reload(page);
    await see(page, /TO DO \| 1 \| Collapse all \| ▾/);
    await see(page, /DONE \| 1 \| Hide \| ▴/);

    await control(page, "TO DO, 1 items, expanded").click();
    await see(page, /TO DO \| 1 \| Expand all/);
    expect(await section(page, "TO DO")).not.toContain("Still counted");
    // DONE is independent of TO DO.
    expect(await section(page, "DONE")).toContain("Already done");

    await button(page, "Hide").click();
    await see(page, /DONE \| 1 \| Show/);
    await dontSee(page, "Already done");

    await button(page, "Expand all").click();
    await see(page, "Still counted");
  });

  test("HOME-20 · collapse state is forgotten on reload", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Folded", taskType: "reminder" });
    await reload(page);
    await control(page, "TO DO, 1 items, expanded").click();
    await dontSee(page, "Folded");
    await reload(page);
    await see(page, "Folded");
  });

  test("HOME-21 · the stat strip shows the server's figures, and a zero day shows zeros", async ({ app }) => {
    const { page, api } = app;
    expect(await stats(page)).toEqual({ streak: 0, points: 0, minutes: 0 });

    const t = await api.task({ name: "Counted", taskType: "reminder" });
    await api.complete(t.id);
    await reload(page);
    const [today, streak] = await Promise.all([api.today(), api.streak()]);
    expect(await stats(page)).toEqual({ streak: streak.currentStreak, points: today.pointsEarned, minutes: today.focusMinutes });
  });

  /** If these ever track each other exactly, the points rule has quietly reverted to focus-only. */
  test("HOME-22 · points and minutes are different figures", async ({ app }) => {
    const { page, api } = app;
    for (const name of ["Reminder one", "Reminder two"]) await api.complete((await api.task({ name, taskType: "reminder" })).id);
    const focus = await api.task({ name: "Ten minutes" });
    const session = await api.startSession(focus.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(session.id, "10 minutes 5 seconds");
    await api.completeSession(session.id, { wasInterrupted: true });
    await reload(page);
    expect(await stats(page)).toMatchObject({ points: 20, minutes: 10 });
  });

  /**
   * On a phone this is pull-to-refresh, which react-native-web doesn't render — that gesture is
   * device-only. What the web build does have is the foreground re-sync (useReminderSync), which
   * is the path that picks up another device's work without the user doing anything.
   */
  test("HOME-23 · work done on another device appears when you come back to the app", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Here already", taskType: "reminder" });
    await reload(page);
    await see(page, "Here already");
    await api.task({ name: "Added elsewhere", taskType: "reminder" });
    await page.waitForTimeout(500);
    expect(await screenText(page)).not.toContain("Added elsewhere");

    await foreground(page);
    await see(page, "Added elsewhere");
    await see(page, /TO DO \| 2 \|/);
  });

  test("HOME-24 · the closing line appears only when there's something to close", async ({ app }) => {
    const { page, api } = app;
    await see(page, "Nothing to do yet");
    expect(await screenText(page)).not.toContain("That’s everything");
    await api.task({ name: "One thing", taskType: "reminder" });
    await reload(page);
    await see(page, "That’s everything for today");
  });

  test("HOME-25 · the goals strip lays out for one, two and many", async ({ app }) => {
    const { page, api } = app;
    const cardBoxes = async () => {
      const cards = page.getByRole("button", { name: /, \d+ of \d+ days$/ }).locator("visible=true");
      const n = await cards.count();
      return Promise.all([...Array(n)].map((_, i) => cards.nth(i).boundingBox()));
    };

    await api.goal("Alpha", 20);
    await reload(page);
    const [one] = await cardBoxes();
    expect(one!.width).toBeGreaterThan(300);

    await api.goal("Beta", 20);
    await reload(page);
    const two = await cardBoxes();
    expect(two).toHaveLength(2);
    expect(Math.abs(two[0]!.width - two[1]!.width)).toBeLessThan(2);
    expect(two[0]!.width).toBeLessThan(200);

    await api.goal("Gamma", 20);
    await reload(page);
    const three = await cardBoxes();
    expect(three).toHaveLength(3);
    // The third peeks in from the right rather than being hidden or squeezed.
    expect(three[2]!.x).toBeLessThan(375);
    expect(three[2]!.x + three[2]!.width).toBeGreaterThan(375);
    await expectNoSidewaysScroll(page);

    await control(page, "Alpha, 0 of 20 days").click();
    await see(page, "Edit goal");
  });

  test("HOME-26 · the last row's button can't be covered by the docked capture button", async ({ app }) => {
    const { page, api } = app;
    for (let i = 1; i <= 20; i++) await api.task({ name: `Task ${String(i).padStart(2, "0")}`, taskType: "reminder" });
    await reload(page);
    await see(page, /TO DO \| 20 \|/);
    /*
     * Scrolled to the bottom first, and only then asked which row is last.
     *
     * This used to measure the last *rendered* row, then wheel a fixed 5,000px. Home is a
     * virtualised list, so the row it had measured could end up above the fold once the window
     * moved — and `elementFromPoint` then hit nothing at all, at a negative y, which reads
     * exactly like "something is covering the button". Shortening the Focus Now card was enough
     * to push it over that line. The distance was always a guess; the bottom is a fact.
     */
    await page.mouse.move(187, 400);
    let previous = -1;
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 1_200);
        const offset = await page.evaluate(() => {
          const scroller = Array.from(document.querySelectorAll("div")).find(
            (d) => d.scrollHeight > d.clientHeight + 40
          );
          return scroller ? scroller.scrollTop : window.scrollY;
        });
        const settled = Math.abs(offset - previous) < 1;
        previous = offset;
        return settled;
      }, { timeout: 20_000 })
      .toBe(true);

    const lastButton = page.getByRole("button", { name: /^Done: Task \d\d$/ }).locator("visible=true").last();
    const lastName = (await lastButton.getAttribute("aria-label"))!;
    const target = control(page, lastName);
    const box = (await target.boundingBox())!;
    // Guards the guard: a row above the fold would make the hit test meaningless either way.
    expect(box.y, `${lastName} is off-screen, so this proves nothing`).toBeGreaterThan(0);
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("[aria-label]")?.getAttribute("aria-label") ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
    expect(hit, "something sits on top of the last row's button").toBe(lastName);
  });

  test("HOME-27 · the avatar opens Settings and a row opens its task", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Open me", taskType: "reminder" });
    await reload(page);
    await control(page, "Account").click();
    await see(page, /Settings \| ACCOUNT \| Name/);
    await openTab(page, "Home");
    await exact(page, "Open me").click();
    await see(page, /^Open me \| Focus \| Reminder \| /);
  });

  /**
   * Only the device's clock moves here — the server keeps real time — so this asserts what the
   * phone decides on its own at midnight, which is exactly what `useTodayKey` exists for.
   */
  test("HOME-28 · midnight rolls the day over with the app open", async ({ app }) => {
    const { page, api } = app;
    const today = dateKey(0);
    await api.task({ name: "Due today", taskType: "reminder", scheduledFor: today });
    await api.complete((await api.task({ name: "Done today", taskType: "reminder" })).id);
    await deviceClockAt(page, today, "23:59");
    const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    await see(page, weekday(today));
    await see(page, "Done today");

    await page.clock.fastForward("02:00");
    await see(page, weekday(dateKey(1)));
    // Yesterday's finished work leaves DONE; yesterday's unfinished task stays, now overdue.
    await dontSee(page, "Done today");
    expect(await section(page, "TO DO")).toContain("Due today");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");
  });

  test("HOME-29 · the greeting follows the time of day and the date reads day-first", async ({ app }) => {
    const { page } = app;
    const today = dateKey(0);
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const expected = `${date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${d} ${date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`;
    for (const [hhmm, greeting] of [["09:00", "Good morning"], ["14:00", "Good afternoon"], ["20:00", "Good evening"]] as const) {
      await deviceClockAt(page, today, hhmm);
      await see(page, new RegExp(`^${greeting}, `));
      await see(page, expected);
    }
  });
});
