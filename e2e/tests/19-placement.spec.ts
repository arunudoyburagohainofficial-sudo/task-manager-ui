import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { button, control, dateKey, deviceClockAt, exact, openTab, reload, screenText, section, see } from "../harness/app";
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
 * Two rows carry most of the value, because both are easy to get wrong by reasoning and neither
 * was asserted on screen anywhere before this file:
 *
 *   - A *future repeating* task is on Recurring and nowhere else. Not Upcoming, where its date
 *     would suggest, and not Home, where "it's a routine" would suggest.
 *   - A *late repeating* task is on Home and in Recurring, but is deliberately NOT counted in
 *     the Overdue badge, because that badge must count exactly what its own panel lists.
 */

/** A one-off or routine that slipped: the API refuses past dates, so the day is set directly. */
async function slipped(api: Api, name: string, daysAgo: number, recurrenceRule?: string) {
  const t = await api.task({ name, taskType: "reminder", scheduledFor: dateKey(0), ...(recurrenceRule ? { recurrenceRule } : {}) });
  db.scheduledFor(t.id, dateKey(-daysAgo));
  return t;
}

/** The text of one Scheduled panel, from its label to the next panel's. */
async function panel(page: Page, label: "OVERDUE" | "RECURRING" | "UPCOMING"): Promise<string> {
  const text = await screenText(page);
  const start = text.indexOf(`${label} |`);
  if (start < 0) return "";
  const rest = text.slice(start + label.length + 2);
  const ends = ["OVERDUE |", "RECURRING |", "UPCOMING |"].map((l) => rest.indexOf(l)).filter((i) => i > 0);
  return (ends.length ? rest.slice(0, Math.min(...ends)) : rest).trim();
}

/**
 * One row of the matrix. `home` is whether it belongs on Home; `section` is where it belongs on
 * the Scheduled tab, or null for nowhere on that screen.
 */
interface Row {
  name: string;
  home: boolean;
  where: "OVERDUE" | "RECURRING" | "UPCOMING" | null;
}

const MATRIX: Row[] = [
  // When: none. A backlog item is actionable now, so it reads as today and never files by date.
  { name: "Undated one-off", home: true, where: null },
  // When: today.
  { name: "Today one-off", home: true, where: null },
  { name: "Today daily", home: true, where: "RECURRING" },
  { name: "Today weekly", home: true, where: "RECURRING" },
  { name: "Today monthly", home: true, where: "RECURRING" },
  // When: past. Missed work stays on Home so it isn't silent *and* invisible.
  { name: "Missed one-off", home: true, where: "OVERDUE" },
  { name: "Missed daily", home: true, where: "RECURRING" },
  // When: future. Neither of these belongs on Home.
  { name: "Tomorrow one-off", home: false, where: "UPCOMING" },
  { name: "Next week one-off", home: false, where: "UPCOMING" },
  { name: "Tomorrow daily", home: false, where: "RECURRING" },
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
  test("PLACE-01 · Home holds exactly today's work, the undated, and the missed", async ({ app }) => {
    const { page, api } = app;
    await seedMatrix(api);
    await reload(page);

    const todo = await section(page, "TO DO");
    for (const row of MATRIX) {
      if (row.home) expect(todo, `${row.name} should be on Home`).toContain(row.name);
      else expect(todo, `${row.name} should NOT be on Home`).not.toContain(row.name);
    }
    // And the count agrees with the rows, rather than being computed from a different filter.
    expect(todo).toMatch(/^7 \|/);
  });

  test("PLACE-02 · each Scheduled panel holds exactly its own, and nothing is in two", async ({ app }) => {
    const { page, api } = app;
    await seedMatrix(api);
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /OVERDUE[\s\S]*RECURRING[\s\S]*UPCOMING/);

    const panels = {
      OVERDUE: await panel(page, "OVERDUE"),
      RECURRING: await panel(page, "RECURRING"),
      UPCOMING: await panel(page, "UPCOMING"),
    } as const;

    for (const row of MATRIX) {
      for (const label of ["OVERDUE", "RECURRING", "UPCOMING"] as const) {
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
  test("PLACE-04 · the Overdue badge counts one-offs only, and Recurring says 'late' separately", async ({ app }) => {
    const { page, api } = app;
    await slipped(api, "Missed one-off", 1);
    await slipped(api, "Late routine A", 2, "FREQ=DAILY");
    await slipped(api, "Late routine B", 3, "FREQ=WEEKLY");
    await reload(page);
    await openTab(page, "Scheduled");

    expect(await panel(page, "OVERDUE")).toMatch(/^1 \|/);
    expect(await panel(page, "RECURRING")).toMatch(/^2 \| 2 late \|/);
    // All three are still on Home, which is the point of keeping missed work there.
    await openTab(page, "Home");
    const todo = await section(page, "TO DO");
    for (const n of ["Missed one-off", "Late routine A", "Late routine B"]) expect(todo).toContain(n);
  });

  test("PLACE-05 · an undated task is on Home and nowhere on Scheduled at all", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "No date at all", taskType: "reminder" });
    await reload(page);
    expect(await section(page, "TO DO")).toContain("No date at all");
    await openTab(page, "Scheduled");
    // Not merely absent from the panels - the screen reads as empty, with no panel headers.
    await see(page, "Nothing scheduled");
    expect(await screenText(page)).not.toContain("No date at all");
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

  test("PLACE-06 · one captured with no date is on Home immediately", async ({ app }) => {
    const { page } = app;
    await captureReminder(page, "Captured undated");
    expect(await section(page, "TO DO")).toContain("Captured undated");
    await openTab(page, "Scheduled");
    await see(page, "Nothing scheduled");
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
   * Clearing a date is not the same as deleting the task. An undated task reads as today, so it
   * has to come back to Home rather than fall off both screens - which is exactly what a bucket
   * of "upcoming with no date" would have done.
   */
  test("PLACE-13 · clearing a future date brings the task back to Home, not nowhere", async ({ app }) => {
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
    await expect.poll(() => section(page, "TO DO")).toContain("Someday");
    await openTab(page, "Scheduled");
    await see(page, "Nothing scheduled");
  });
});
