import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import {
  button,
  control,
  dateKey,
  deviceClockAt,
  dontSee,
  exact,
  openTab,
  panel,
  reload,
  SCHEDULED_PANELS,
  type ScheduledPanel,
  screenText,
  scrollHomeToBottom,
  section,
  see,
  tab,
} from "../harness/app";
import { choice, openSchedule, saveAndClose } from "../harness/sheet";
import { db } from "../harness/db";

/**
 * Where a task lands, asserted on the screens rather than in the rules.
 *
 * The rules themselves are already covered twice over: LOGIC-24..30 test `bucketFor` and
 * `belongsOnHome` directly, and SHEET-20 walks every When x Repeat x Notify the sheet offers.
 * Neither proves what this file proves. LOGIC-* calls a pure function, so it stays green even
 * if a screen stopped calling it. SHEET-20, despite its name, only reads the task back from the
 * API - it never looks at Home or Scheduled at all.
 *
 * So the gap this closes is the one that matters to a user: a task they made is on the screen
 * they would go looking for it on, exactly once, and not on any other.
 *
 * Home is four lists and Scheduled is four panels, and they answer different questions. Home is
 * "what is mine to do now": TO DO (dated today, plus any routine that slipped), OVERDUE (one-offs
 * whose day has passed), ANYTIME (no day at all) and DONE. Scheduled is the index of everything
 * with a plan or without one: OVERDUE, RECURRING, UPCOMING and ANYTIME.
 *
 * Three rows carry most of the value, because each is easy to get wrong by reasoning:
 *
 *   - A *future repeating* task is on Recurring and nowhere else. Not Upcoming, where its date
 *     would suggest, and not Home, where "it's a routine" would suggest.
 *   - A *late repeating* task is in Home's TO DO and in Recurring, but is deliberately NOT in
 *     either Overdue list, because a routine that slipped is still today's routine and the
 *     Overdue badge must count exactly what its own panel lists.
 *   - An *undated* task is under ANYTIME on both screens. It used to sit in TO DO and be absent
 *     from Scheduled altogether, which is how a backlog buried the day's actual work.
 */

/** A one-off or routine that slipped: the API refuses past dates, so the day is set directly. */
async function slipped(api: Api, name: string, daysAgo: number, recurrenceRule?: string) {
  const t = await api.task({ name, taskType: "reminder", scheduledFor: dateKey(0), ...(recurrenceRule ? { recurrenceRule } : {}) });
  db.scheduledFor(t.id, dateKey(-daysAgo));
  return t;
}

/** Home's lists of unfinished work, in the order the screen draws them. */
const HOME_LISTS = ["TO DO", "OVERDUE", "ANYTIME"] as const;
type HomeList = (typeof HOME_LISTS)[number];

/**
 * One row of the matrix. `home` is the Home list it belongs in, or null for not on Home at all;
 * `where` is its panel on the Scheduled tab, or null for nowhere on that screen.
 */
interface Row {
  name: string;
  home: HomeList | null;
  where: ScheduledPanel | null;
}

const MATRIX: Row[] = [
  // When: none. Actionable any time, so it is on Home - but under its own heading, not today's.
  { name: "Undated one-off", home: "ANYTIME", where: "ANYTIME" },
  // When: today. A plain task for today is nobody's "schedule", so Scheduled leaves it out.
  { name: "Today one-off", home: "TO DO", where: null },
  { name: "Today daily", home: "TO DO", where: "RECURRING" },
  { name: "Today weekly", home: "TO DO", where: "RECURRING" },
  { name: "Today monthly", home: "TO DO", where: "RECURRING" },
  // When: past. A one-off that slipped is overdue on both screens; a routine that slipped is
  // still today's routine, so it stays in TO DO and is never counted as overdue.
  { name: "Missed one-off", home: "OVERDUE", where: "OVERDUE" },
  { name: "Missed daily", home: "TO DO", where: "RECURRING" },
  // When: future. None of these belongs on Home.
  { name: "Tomorrow one-off", home: null, where: "UPCOMING" },
  { name: "Next week one-off", home: null, where: "UPCOMING" },
  { name: "Tomorrow daily", home: null, where: "RECURRING" },
];

/** Seeds every row of the matrix into one account, so the panels are checked against each other. */
async function seedMatrix(api: Api) {
  await api.task({ name: "Undated one-off", taskType: "reminder" });
  await api.task({ name: "Today one-off", taskType: "reminder", scheduledFor: dateKey(0) });
  await api.task({ name: "Today daily", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
  await api.task({ name: "Today weekly", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  await api.task({ name: "Today monthly", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=MONTHLY" });
  await slipped(api, "Missed one-off", 2);
  await slipped(api, "Missed daily", 2, "FREQ=DAILY");
  await api.task({ name: "Tomorrow one-off", taskType: "reminder", scheduledFor: dateKey(1) });
  await api.task({ name: "Next week one-off", taskType: "reminder", scheduledFor: dateKey(7) });
  await api.task({ name: "Tomorrow daily", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
}

test.describe("the placement matrix, on the screens", () => {
  test("PLACE-01 · each Home list holds exactly its own, and no task is in two", async ({ app }) => {
    const { page, api } = app;
    await seedMatrix(api);
    await reload(page);
    // Home only draws what is near the screen, so the lower lists exist only once it is scrolled.
    await see(page, /TO DO \| 5 \|/);
    await scrollHomeToBottom(page);
    await see(page, /ANYTIME \| 1 \|/);

    const lists = {
      "TO DO": await section(page, "TO DO"),
      OVERDUE: await section(page, "OVERDUE"),
      ANYTIME: await section(page, "ANYTIME"),
    } as const;

    for (const row of MATRIX) {
      for (const label of HOME_LISTS) {
        const expected = row.home === label;
        expect(lists[label].includes(row.name), `${row.name} in Home's ${label}: expected ${expected}`).toBe(expected);
      }
    }
    // And each count agrees with its rows, rather than being computed from a different filter.
    expect(lists["TO DO"]).toMatch(/^5 \|/);
    expect(lists.OVERDUE).toMatch(/^1 \|/);
    expect(lists.ANYTIME).toMatch(/^1 \|/);
    // The tab's badge is the same one-off, counted once: the late routine is not in it.
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");
  });

  test("PLACE-02 · each Scheduled panel holds exactly its own, and nothing is in two", async ({ app }) => {
    const { page, api } = app;
    await seedMatrix(api);
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /OVERDUE[\s\S]*RECURRING[\s\S]*UPCOMING[\s\S]*ANYTIME/);

    const panels = {
      OVERDUE: await panel(page, "OVERDUE"),
      RECURRING: await panel(page, "RECURRING"),
      UPCOMING: await panel(page, "UPCOMING"),
      ANYTIME: await panel(page, "ANYTIME"),
    } as const;

    for (const row of MATRIX) {
      for (const label of SCHEDULED_PANELS) {
        const expected = row.where === label;
        expect(panels[label].includes(row.name), `${row.name} in ${label}: expected ${expected}`).toBe(expected);
      }
    }
  });

  /**
   * The rule that makes the Recurring panel worth having. A routine exists as exactly one live
   * occurrence, so listing it under its date as well would print the same row twice on one
   * screen - and a future routine would then read as a one-off that happens to come back.
   */
  test("PLACE-03 · a future routine is in Recurring, not Upcoming, and not on Home", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Starts tomorrow", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
    await api.task({ name: "Plain tomorrow", taskType: "reminder", scheduledFor: dateKey(1) });
    await reload(page);

    expect(await section(page, "TO DO")).not.toContain("Starts tomorrow");
    await openTab(page, "Scheduled");
    expect(await panel(page, "RECURRING")).toContain("Starts tomorrow");
    const upcoming = await panel(page, "UPCOMING");
    expect(upcoming).toContain("Plain tomorrow");
    expect(upcoming).not.toContain("Starts tomorrow");
    // Its date is still shown, so "not in Upcoming" doesn't mean "undated".
    expect(await panel(page, "RECURRING")).toMatch(/Starts tomorrow \| Reminder · Every day · next Tomorrow/);
  });

  /**
   * A badge that disagrees with its panel is worse than no badge. The Overdue panel lists only
   * one-off tasks, so counting late routines in it would print a number the user cannot
   * reconcile with the rows underneath it.
   */
  test("PLACE-04 · both Overdue lists count one-offs only, and a late routine stays in TO DO", async ({ app }) => {
    const { page, api } = app;
    await slipped(api, "Missed one-off", 1);
    await slipped(api, "Late routine A", 2, "FREQ=DAILY");
    await slipped(api, "Late routine B", 3, "FREQ=WEEKLY");
    await reload(page);
    await openTab(page, "Scheduled");

    expect(await panel(page, "OVERDUE")).toMatch(/^1 \|/);
    expect(await panel(page, "RECURRING")).toMatch(/^2 \| 2 late \|/);

    // Home draws the same line in the same place: the one-off under OVERDUE, and both routines
    // under TO DO, because a routine that slipped is still the thing to do today.
    await openTab(page, "Home");
    await see(page, /OVERDUE \| 1 \|/);
    const overdue = await section(page, "OVERDUE");
    const todo = await section(page, "TO DO");
    expect(overdue).toContain("Missed one-off");
    expect(todo).not.toContain("Missed one-off");
    for (const n of ["Late routine A", "Late routine B"]) {
      expect(todo).toContain(n);
      expect(overdue).not.toContain(n);
    }
  });

  test("PLACE-05 · an undated task is under ANYTIME on both screens, and in no dated panel", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "No date at all", taskType: "reminder" });
    await reload(page);
    await see(page, /ANYTIME \| 1 \|/);
    expect(await section(page, "ANYTIME")).toContain("No date at all");
    expect(await section(page, "TO DO")).not.toContain("No date at all");

    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 1 \|/);
    expect(await panel(page, "ANYTIME")).toContain("No date at all");
    // It is the only thing on the screen, so no other panel is drawn at all - and the screen
    // does not also claim to be empty above the one task it is showing.
    const text = await screenText(page);
    for (const label of ["OVERDUE |", "RECURRING |", "UPCOMING |", "Nothing scheduled"]) expect(text).not.toContain(label);
  });
});

/**
 * The same matrix, but built the way a person builds it.
 *
 * Everything above seeds through the API, which is the right way to set up a board but proves
 * nothing about the path a user actually takes. Capture decides the type, the schedule sheet
 * decides the date and the repeat, and a task that is stored correctly but lands on the wrong
 * screen is still a bug the user meets.
 */
test.describe("created through the UI, not seeded", () => {
  const field = (page: Page) => page.getByPlaceholder("Type a task…").locator("visible=true").last();

  /** Captures one reminder and returns on Home, with no schedule set. */
  async function captureReminder(page: Page, name: string) {
    await control(page, "Capture tasks").click();
    await see(page, "What’s on your mind?");
    await field(page).fill(name);
    await button(page, "Confirm & Organize (1)").click();
    await see(page, "Organize your tasks");
    await page.getByText("Reminder Task", { exact: true }).locator("visible=true").last().click();
    await button(page, "Confirm & Add 1 task").click();
    await see(page, /TO DO/);
  }

  test("PLACE-06 · one captured with no date is under ANYTIME on both screens immediately", async ({ app }) => {
    const { page } = app;
    await captureReminder(page, "Captured undated");
    await expect.poll(() => section(page, "ANYTIME")).toContain("Captured undated");
    expect(await section(page, "TO DO")).not.toContain("Captured undated");
    await openTab(page, "Scheduled");
    await expect.poll(() => panel(page, "ANYTIME")).toContain("Captured undated");
  });

  test("PLACE-07 · one given today stays on Home; one given tomorrow leaves it", async ({ app }) => {
    const { page } = app;
    await captureReminder(page, "For today");
    await captureReminder(page, "For tomorrow");

    await openSchedule(page, "For today");
    await choice(page, "Today").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    await openSchedule(page, "For tomorrow");
    await choice(page, "Tomorrow").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    await openTab(page, "Home");
    await expect.poll(() => section(page, "TO DO")).toContain("For today");
    expect(await section(page, "TO DO")).not.toContain("For tomorrow");

    // Dated now, so neither is an "anytime" task any more.
    const anytime = await section(page, "ANYTIME");
    for (const n of ["For today", "For tomorrow"]) expect(anytime).not.toContain(n);

    await openTab(page, "Scheduled");
    expect(await panel(page, "UPCOMING")).toContain("For tomorrow");
    expect(await screenText(page)).not.toContain("For today");
  });

  test("PLACE-08 · a repeat set in the sheet moves it into Recurring", async ({ app }) => {
    const { page } = app;
    await captureReminder(page, "New routine");

    await openSchedule(page, "New routine");
    await choice(page, "Today").click();
    await choice(page, "Daily").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    // Dated today, so it is on Home as well - the Recurring panel is an index, not a to-do list.
    await openTab(page, "Home");
    await expect.poll(() => section(page, "TO DO")).toContain("New routine");
    await openTab(page, "Scheduled");
    expect(await panel(page, "RECURRING")).toContain("New routine");
    expect(await panel(page, "UPCOMING")).not.toContain("New routine");
  });
});

test.describe("tasks moving between the screens on their own", () => {
  /**
   * SCHED-12 proves this for a one-off. A routine takes a different path through the same code
   * - it is filtered by recurrence before it is bucketed by date - so crossing midnight has to
   * put it on Home while leaving it in Recurring, rather than moving it between panels.
   */
  test("PLACE-09 · tomorrow's routine becomes today's work at midnight, and stays in Recurring", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Morning run", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
    await deviceClockAt(page, dateKey(0), "23:58");

    expect(await section(page, "TO DO")).not.toContain("Morning run");
    await page.clock.fastForward("03:00");
    await expect.poll(() => section(page, "TO DO")).toContain("Morning run");

    await openTab(page, "Scheduled");
    expect(await panel(page, "RECURRING")).toContain("Morning run");
    expect(await panel(page, "OVERDUE")).not.toContain("Morning run");
  });

  test("PLACE-10 · finishing an upcoming task takes it out of Upcoming", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Planned thing", taskType: "reminder", scheduledFor: dateKey(3) });
    await reload(page);
    await openTab(page, "Scheduled");
    expect(await panel(page, "UPCOMING")).toContain("Planned thing");

    await api.complete(t.id);
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, "Nothing scheduled");
  });

  /**
   * The occurrence that completion mints is a *different* task, and it has to be filed by its
   * own date rather than inheriting where its predecessor sat.
   */
  test("PLACE-11 · finishing today's occurrence moves the routine off Home and into Recurring alone", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Daily habit", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Daily habit");

    await control(page, "Done: Daily habit").click();
    await expect.poll(() => section(page, "DONE")).toContain("Daily habit");
    // The successor is tomorrow's, so Home is right to stop listing it as something to do.
    expect(await section(page, "TO DO")).not.toContain("Daily habit");

    await openTab(page, "Scheduled");
    expect(await panel(page, "RECURRING")).toMatch(/Daily habit \| Reminder · Every day · next Tomorrow/);
    expect(await panel(page, "UPCOMING")).not.toContain("Daily habit");
  });

  /**
   * SCHED-10 proves a task pulled forward leaves Upcoming for Home. The reverse - "not today,
   * I'll do it tomorrow" - is the commoner action of the two and went the other way through the
   * same code, so it gets its own row.
   */
  test("PLACE-12 · pushing today's task to tomorrow takes it off Home and into Upcoming", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Put it off", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Put it off");

    await openSchedule(page, "Put it off");
    await choice(page, "Tomorrow").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    await expect.poll(() => section(page, "TO DO")).not.toContain("Put it off");
    await openTab(page, "Scheduled");
    expect(await panel(page, "UPCOMING")).toContain("Put it off");
  });

  /**
   * Clearing a date is not the same as deleting the task. An undated task can be done any time,
   * so it has to come back to Home under ANYTIME and stay listed on Scheduled under the same
   * heading, rather than fall off both screens - which is exactly what a bucket of "upcoming
   * with no date" would have done.
   */
  test("PLACE-13 · clearing a future date moves the task to ANYTIME on both screens, not nowhere", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Someday", taskType: "reminder", scheduledFor: dateKey(5) });
    await reload(page);
    expect(await section(page, "TO DO")).not.toContain("Someday");

    await openTab(page, "Scheduled");
    await exact(page, "Someday").click();
    await openSchedule(page, "Someday");
    await choice(page, "No date").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    expect((await api.getTask(t.id)).scheduledFor).toBeNull();
    await openTab(page, "Home");
    await expect.poll(() => section(page, "ANYTIME")).toContain("Someday");
    expect(await section(page, "TO DO")).not.toContain("Someday");
    await openTab(page, "Scheduled");
    expect(await panel(page, "ANYTIME")).toContain("Someday");
    expect(await panel(page, "UPCOMING")).not.toContain("Someday");
  });

  /**
   * The other way an undated task leaves ANYTIME is by being finished. Undo then has to put it
   * back where it came from. It has no day, so "back" is ANYTIME - not TO DO, which is where a
   * reopened task would land if undo quietly treated it as today's.
   */
  test("PLACE-14 · finishing an undated task clears it from ANYTIME on both screens, and undo returns it there", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Loose end", taskType: "reminder" });
    await api.task({ name: "Stays loose", taskType: "reminder" });
    await reload(page);
    await see(page, /ANYTIME \| 2 \|/);

    await control(page, "Done: Loose end").click();
    await expect.poll(() => section(page, "DONE")).toContain("Loose end");
    expect(await section(page, "ANYTIME")).toMatch(/^1 \|/);
    expect(await section(page, "ANYTIME")).not.toContain("Loose end");

    // Undo is offered on the message that follows Done, so it is taken before leaving the screen.
    await button(page, "Undo").click();
    await expect.poll(() => section(page, "ANYTIME")).toContain("Loose end");
    expect(await section(page, "ANYTIME")).toMatch(/^2 \|/);
    expect(await section(page, "TO DO")).not.toContain("Loose end");
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 2 \|/);

    // And finished for good, it is gone from Scheduled's list as well as Home's.
    await openTab(page, "Home");
    await control(page, "Done: Stays loose").click();
    await expect.poll(() => section(page, "DONE")).toContain("Stays loose");
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 1 \|/);
    const anytime = await panel(page, "ANYTIME");
    expect(anytime).toContain("Loose end");
    expect(anytime).not.toContain("Stays loose");
  });

  /**
   * The way out of Overdue that is not "finish it" or "delete it": decide to do it today. It
   * has to leave both Overdue lists and the tab's badge together, because a task counted as
   * late on one screen and as today's on the other is the disagreement PLACE-04 guards against.
   */
  test("PLACE-15 · an overdue task given today's date returns to TO DO and leaves both Overdue lists", async ({ app }) => {
    const { page, api } = app;
    await slipped(api, "Finally today", 4);
    await slipped(api, "Still late", 2);
    await reload(page);
    await see(page, /OVERDUE \| 2 \|/);
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 2 overdue");

    await openSchedule(page, "Finally today");
    await choice(page, "Today").click();
    await saveAndClose(page);
    await control(page, "Back").click();

    await expect.poll(() => section(page, "TO DO")).toContain("Finally today");
    const overdue = await section(page, "OVERDUE");
    expect(overdue).toMatch(/^1 \|/);
    expect(overdue).not.toContain("Finally today");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");

    await openTab(page, "Scheduled");
    const late = await panel(page, "OVERDUE");
    expect(late).toMatch(/^1 \|/);
    expect(late).toContain("Still late");
    expect(late).not.toContain("Finally today");
  });

  /**
   * Finishing the last overdue task has to take the whole section away, heading included, and
   * the badge with it - an empty "OVERDUE 0" left on Home would be a small permanent accusation.
   */
  test("PLACE-16 · finishing the last overdue task removes the section and the badge", async ({ app }) => {
    const { page, api } = app;
    await slipped(api, "Last late thing", 3);
    await reload(page);
    await see(page, /OVERDUE \| 1 \|/);

    await control(page, "Done: Last late thing").click();
    await expect.poll(() => section(page, "DONE")).toContain("Last late thing");
    await dontSee(page, /OVERDUE \|/);
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
    await openTab(page, "Scheduled");
    await see(page, "Nothing scheduled");
  });
});
