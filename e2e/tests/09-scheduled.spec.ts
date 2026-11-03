import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { control, dateKey, deviceClockAt, dontSee, exact, openTab, reload, screenText, section, see, tab } from "../harness/app";
import { db } from "../harness/db";
import { choice, openSchedule, saveAndClose } from "../harness/sheet";

/**
 * The Scheduled screen — plan/09-scheduled-screen.md.
 *
 * Where work that isn't for today lives: the missed, the repeating and the planned. A task that
 * falls between its three panels is a task nobody sees again.
 */

/** A one-off that slipped `daysAgo` days — the API refuses past dates, so the day is set directly. */
async function overdue(api: Api, name: string, daysAgo = 1, extra: Parameters<Api["task"]>[0] = { name }) {
  const t = await api.task({ ...extra, name, taskType: "reminder", scheduledFor: dateKey(0) });
  db.scheduledFor(t.id, dateKey(-daysAgo));
  return t;
}

/** The text of one panel, from its label to the next panel's. */
async function panel(page: import("@playwright/test").Page, label: "OVERDUE" | "RECURRING" | "UPCOMING"): Promise<string> {
  const text = await screenText(page);
  const start = text.indexOf(`${label} |`);
  if (start < 0) return "";
  const rest = text.slice(start + label.length + 2);
  const ends = ["OVERDUE |", "RECURRING |", "UPCOMING |"].map((l) => rest.indexOf(l)).filter((i) => i > 0);
  return (ends.length ? rest.slice(0, Math.min(...ends)) : rest).trim();
}

test("SCHED-01 · three panels, in order, each holding exactly its own tasks", async ({ app }) => {
  const { page, api } = app;
  await overdue(api, "Missed A");
  await overdue(api, "Missed B", 3);
  await api.task({ name: "Routine", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
  await api.task({ name: "Planned", taskType: "reminder", scheduledFor: dateKey(4) });
  await api.task({ name: "Today's", taskType: "reminder", scheduledFor: dateKey(0) });
  await reload(page);
  await openTab(page, "Scheduled");
  await see(page, /OVERDUE \| 2 \|[\s\S]*RECURRING \| 1 \|[\s\S]*UPCOMING \| 1 \|/);
  const [o, r, u] = await Promise.all([panel(page, "OVERDUE"), panel(page, "RECURRING"), panel(page, "UPCOMING")]);
  expect(o).toMatch(/Missed A[\s\S]*Missed B|Missed B[\s\S]*Missed A/);
  expect(o).not.toMatch(/Routine|Planned/);
  expect(r).toContain("Routine");
  expect(r).not.toMatch(/Missed|Planned/);
  expect(u).toContain("Planned");
  expect(await screenText(page)).not.toContain("Today's"); // today's work is Home's
});

test("SCHED-02 · nothing scheduled reads as calm, not broken", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Undated", taskType: "reminder" });
  await reload(page);
  await openTab(page, "Scheduled");
  await see(page, "Nothing scheduled");
  expect(await screenText(page)).not.toMatch(/OVERDUE|RECURRING|UPCOMING/);
});

test("SCHED-03 · Upcoming is grouped by day, soonest first", async ({ app }) => {
  const { page, api } = app;
  for (const [name, days] of [["In five", 5], ["In two", 2], ["In nine", 9], ["Tomorrow A", 1], ["Tomorrow B", 1]] as const) {
    await api.task({ name, taskType: "reminder", scheduledFor: dateKey(days) });
  }
  await reload(page);
  await openTab(page, "Scheduled");
  const u = await panel(page, "UPCOMING");
  expect(u).toMatch(/^5 \|/);
  // One heading per day, days ascending, each task under its own day.
  const headings = u.match(/TOMORROW|[A-Z]{3}, [A-Z]{3} \d+/g)!;
  expect(headings).toHaveLength(4);
  expect(headings[0]).toBe("TOMORROW");
  const at = (x: string) => u.indexOf(x);
  expect(at("Tomorrow A")).toBeLessThan(at(headings[1]));
  expect(at("Tomorrow B")).toBeLessThan(at(headings[1]));
  expect(at(headings[1])).toBeLessThan(at("In two"));
  expect(at("In two")).toBeLessThan(at(headings[2]));
  expect(at(headings[2])).toBeLessThan(at("In five"));
  expect(at("In five")).toBeLessThan(at(headings[3]));
  expect(at(headings[3])).toBeLessThan(at("In nine"));
});

test("SCHED-04 · Overdue folds past five and expands", async ({ app }) => {
  const { page, api } = app;
  for (let i = 1; i <= 8; i++) await overdue(api, `Late ${i}`, i);
  await reload(page);
  await openTab(page, "Scheduled");
  await see(page, /OVERDUE \| 8 \|/);
  const folded = await panel(page, "OVERDUE");
  expect(folded.match(/Late \d/g)).toHaveLength(5);
  await exact(page, "3 more").click();
  await expect.poll(async () => (await panel(page, "OVERDUE")).match(/Late \d/g)?.length).toBe(8);
});

test("SCHED-05 · each overdue row says how late it is, with nothing printed as 'null'", async ({ app }) => {
  const { page, api } = app;
  await overdue(api, "Yesterday's", 1);
  await overdue(api, "Older", 3);
  await overdue(api, "With a time", 2, { name: "With a time", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
  await reload(page);
  await openTab(page, "Scheduled");
  const o = await panel(page, "OVERDUE");
  expect(o).toMatch(/Yesterday's \| [^|]*was due Yesterday/);
  expect(o).toMatch(/Older \| [^|]*was due [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+/);
  expect(o).not.toMatch(/null|undefined|NaN/);
});

test("SCHED-06 · 'Move all to today' does what it says, once confirmed", async ({ app }) => {
  const { page, api } = app;
  const ids = [(await overdue(api, "Old 1", 1)).id, (await overdue(api, "Old 2", 2)).id, (await overdue(api, "Old 3", 5)).id];
  await reload(page);
  await openTab(page, "Scheduled");
  await control(page, "Move all 3 overdue tasks to today").click();
  await control(page, "Move all").click();
  await see(page, "Moved 3 tasks to today");
  for (const id of ids) expect((await api.getTask(id)).scheduledFor).toBe(dateKey(0));
  await dontSee(page, "OVERDUE");
  await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
  await openTab(page, "Home");
  for (const n of ["Old 1", "Old 2", "Old 3"]) expect(await section(page, "TO DO")).toContain(n);
});

/**
 * The two answers to a backlog.
 *
 * Move all says "I'll still do these"; Clear all says "these stopped mattering". Only the first
 * had a bulk action, so working through a list of things you had already decided against meant
 * one screen per task - the exact punishment Move all exists to remove.
 *
 * Deleted rather than completed, deliberately: marking them done would credit points for work
 * that never happened and leave rows in DONE claiming otherwise.
 */
test("SCHED-13 · 'Clear all' deletes every overdue task and credits nothing", async ({ app }) => {
  const { page, api } = app;
  const ids = [(await overdue(api, "Gone 1", 1)).id, (await overdue(api, "Gone 2", 3)).id];
  await api.task({ name: "Still here", taskType: "reminder", scheduledFor: dateKey(2) });
  await reload(page);
  await openTab(page, "Scheduled");

  await control(page, "Delete all 2 overdue tasks").click();
  await see(page, "Delete all overdue?");
  await see(page, "This can't be undone.");
  await control(page, "Delete").click();
  await see(page, "Deleted 2 overdue tasks");

  for (const id of ids) await expect(api.getTask(id)).rejects.toMatchObject({ status: 404 });
  // Not completed: nothing in DONE, no points, and the streak untouched.
  expect((await api.tasks("completed")).filter((t) => /^Gone /.test(t.name))).toHaveLength(0);
  expect(await api.today()).toMatchObject({ pointsEarned: 0 });
  await dontSee(page, "OVERDUE");
  await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
  // Scoped to overdue - a future task is not part of "all overdue".
  expect(await screenText(page)).toContain("Still here");
});

test("SCHED-14 · cancelling 'Clear all' leaves every task alone", async ({ app }) => {
  const { page, api } = app;
  const id = (await overdue(api, "Spared", 1)).id;
  await reload(page);
  await openTab(page, "Scheduled");
  await control(page, "Delete all 1 overdue task").click();
  await see(page, "Delete all overdue?");
  await control(page, "Cancel").click();
  expect((await api.getTask(id)).status).toBe("pending");
  await see(page, /OVERDUE \| 1 \|/);
});

/**
 * Both bulk actions used to appear only at two or more overdue tasks, which left the commonest
 * case - one thing missed - with no bulk action and nothing to tap but the row itself.
 */
test("SCHED-15 · both bulk actions are offered from a single overdue task", async ({ app }) => {
  const { page, api } = app;
  await overdue(api, "Just the one", 1);
  await reload(page);
  await openTab(page, "Scheduled");
  await expect(control(page, "Move all 1 overdue tasks to today")).toBeVisible();
  await expect(control(page, "Delete all 1 overdue task")).toBeVisible();
});

/**
 * Upcoming rows are Home's rows now.
 *
 * They used to be a thinner thing of their own - a dot, a title and the word "Reminder" - so
 * the same task looked like two different kinds of object depending on the tab. Sharing
 * HomeTaskRow means the mark, the meta line and the points pill are decided once.
 */
test("SCHED-16 · an upcoming row reads like its Home row, with Cancel as the action", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Learn Something New", 20);
  await api.task({ name: "Read one chapter", scheduledFor: dateKey(1), goalId: goal.id });
  await api.task({ name: "Submit timesheet", taskType: "reminder", scheduledFor: dateKey(1), notifications: [{ time: "09:00:00", daysBefore: 0 }] });
  await reload(page);
  await openTab(page, "Scheduled");

  // The same mark and meta line Home shows - but no points pill: what finishing earns is
  // motivating next to today's work and merely noisy next to something due next week.
  await see(page, /Read one chapter \| Goal · Learn Something New \| Cancel/);
  await see(page, /Submit timesheet \| Reminder · 9 AM \| Cancel/);
  expect(await screenText(page)).not.toMatch(/Read one chapter \| [^|]*\| \+\d/);
  // Cancel, not Focus or Done: a task due next week is not something to do now.
  await expect(control(page, "Cancel: Read one chapter")).toBeVisible();
  expect(await screenText(page)).not.toMatch(/Focus: Read one chapter|Done: Submit timesheet/);
});

test("SCHED-17 · Cancel deletes the task, once confirmed, and credits nothing", async ({ app }) => {
  const { page, api } = app;
  const doomed = await api.task({ name: "Dentist Tuesday", taskType: "reminder", scheduledFor: dateKey(2) });
  await api.task({ name: "Pay rent", taskType: "reminder", scheduledFor: dateKey(4) });
  await reload(page);
  await openTab(page, "Scheduled");

  await control(page, "Cancel: Dentist Tuesday").click();
  await see(page, "Cancel this task?");
  await see(page, "This can't be undone.");
  await control(page, "Cancel it").click();
  await see(page, "“Dentist Tuesday” cancelled");

  await expect(api.getTask(doomed.id)).rejects.toMatchObject({ status: 404 });
  // Deleted, not completed: nothing in DONE and no points for work that never happened.
  expect((await api.tasks("completed")).filter((t) => t.name === "Dentist Tuesday")).toHaveLength(0);
  expect(await api.today()).toMatchObject({ pointsEarned: 0 });
  // Scoped to the one row.
  expect(await screenText(page)).toContain("Pay rent");
});

test("SCHED-18 · keeping it changes nothing", async ({ app }) => {
  const { page, api } = app;
  const kept = await api.task({ name: "Spared task", taskType: "reminder", scheduledFor: dateKey(3) });
  await reload(page);
  await openTab(page, "Scheduled");
  await control(page, "Cancel: Spared task").click();
  await see(page, "Cancel this task?");
  await control(page, "Keep it").click();
  expect((await api.getTask(kept.id)).status).toBe("pending");
  await see(page, /UPCOMING \| 1 \|/);
});

test("SCHED-07 · cancelling the bulk move changes nothing", async ({ app }) => {
  const { page, api } = app;
  const a = await overdue(api, "Keep A", 1);
  const b = await overdue(api, "Keep B", 2);
  await reload(page);
  await openTab(page, "Scheduled");
  await control(page, "Move all 2 overdue tasks to today").click();
  await control(page, "Cancel").click();
  await page.waitForTimeout(800);
  expect((await api.getTask(a.id)).scheduledFor).toBe(dateKey(-1));
  expect((await api.getTask(b.id)).scheduledFor).toBe(dateKey(-2));
  await see(page, /OVERDUE \| 2 \|/);
});

test("SCHED-08 · recurring rows show the rule and the next date, and a late one says so", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Fortnightly", taskType: "reminder", scheduledFor: dateKey(3), recurrenceRule: "FREQ=WEEKLY;INTERVAL=2" });
  const late = await api.task({ name: "Slipped", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
  db.scheduledFor(late.id, dateKey(-2));
  await reload(page);
  await openTab(page, "Scheduled");
  const r = await panel(page, "RECURRING");
  expect(r).toMatch(/^2 \| 1 late \|/);
  expect(r).toMatch(/Fortnightly \| Reminder · Every 2 weeks · next [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+/);
  expect(r).toMatch(/Slipped \| Reminder · Every day · was due [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+/);
});

/** A badge that disagrees with its panel was a real regression — see HOME-05. */
test("SCHED-09 · the tab badge counts exactly what Overdue lists, and goes at zero", async ({ app }) => {
  const { page, api } = app;
  const a = await overdue(api, "One-off A");
  const b = await overdue(api, "One-off B", 2);
  const routine = await api.task({ name: "Late routine", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
  db.scheduledFor(routine.id, dateKey(-2));
  await reload(page);
  await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 2 overdue");
  await openTab(page, "Scheduled");
  await see(page, /OVERDUE \| 2 \|/);

  await api.complete(a.id);
  await api.complete(b.id);
  await reload(page);
  await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
});

test("SCHED-10 · a task moved to today leaves Upcoming and appears on Home without a refresh", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Pulled forward", taskType: "reminder", scheduledFor: dateKey(3) });
  await reload(page);
  await openTab(page, "Scheduled");
  await exact(page, "Pulled forward").click();
  await openSchedule(page, "Pulled forward");
  await choice(page, "Today").click();
  await saveAndClose(page);
  await control(page, "Back").click();
  await see(page, "Nothing scheduled");
  await openTab(page, "Home");
  await expect.poll(() => section(page, "TO DO")).toContain("Pulled forward");
});

test("SCHED-11 · a row in each panel opens its own task", async ({ app }) => {
  const { page, api } = app;
  await overdue(api, "Overdue row");
  await api.task({ name: "Recurring row", taskType: "reminder", scheduledFor: dateKey(2), recurrenceRule: "FREQ=WEEKLY" });
  await api.task({ name: "Upcoming row", taskType: "reminder", scheduledFor: dateKey(4) });
  await reload(page);
  for (const name of ["Overdue row", "Recurring row", "Upcoming row"]) {
    await openTab(page, "Scheduled");
    await exact(page, name).click();
    await see(page, new RegExp(`^${name} \\| Focus \\| Reminder`));
    await control(page, "Back").click();
  }
});

test("SCHED-12 · the day rolls over on this screen too", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Tomorrow's", taskType: "reminder", scheduledFor: dateKey(1) });
  await api.task({ name: "Today's, unfinished", taskType: "reminder", scheduledFor: dateKey(0) });
  await deviceClockAt(page, dateKey(0), "23:58");
  await openTab(page, "Scheduled");
  await see(page, /UPCOMING[\s\S]*Tomorrow's/);
  expect(await screenText(page)).not.toContain("OVERDUE");

  await page.clock.fastForward("03:00");
  // Tomorrow is today now — it leaves Scheduled for Home — and today's slipped into Overdue.
  await see(page, /OVERDUE \| 1 \|[\s\S]*Today's, unfinished/);
  expect(await screenText(page)).not.toContain("Tomorrow's");
  await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");
});
