import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { control, dateKey, deviceClockAt, dontSee, exact, expectWhollyTappable, openTab, panel, reload, screenText, section, see, tab } from "../harness/app";
import { db } from "../harness/db";
import { choice, openSchedule, saveAndClose } from "../harness/sheet";

/**
 * The Scheduled screen — plan/09-scheduled-screen.md.
 *
 * Where work that isn't for today lives: the missed, the repeating, the planned, and the work
 * with no day at all. A task that falls between its four panels is a task nobody sees again.
 */

/** A one-off that slipped `daysAgo` days — the API refuses past dates, so the day is set directly. */
async function overdue(api: Api, name: string, daysAgo = 1, extra: Parameters<Api["task"]>[0] = { name }) {
  const t = await api.task({ ...extra, name, taskType: "reminder", scheduledFor: dateKey(0) });
  db.scheduledFor(t.id, dateKey(-daysAgo));
  return t;
}

test("SCHED-01 · four panels, in order, each holding exactly its own tasks", async ({ app }) => {
  const { page, api } = app;
  await overdue(api, "Missed A");
  await overdue(api, "Missed B", 3);
  await api.task({ name: "Routine", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
  await api.task({ name: "Planned", taskType: "reminder", scheduledFor: dateKey(4) });
  await api.task({ name: "Whenever", taskType: "reminder" });
  await api.task({ name: "Today's", taskType: "reminder", scheduledFor: dateKey(0) });
  await reload(page);
  await openTab(page, "Scheduled");
  await see(page, /OVERDUE \| 2 \|[\s\S]*RECURRING \| 1 \|[\s\S]*UPCOMING \| 1 \|[\s\S]*ANYTIME \| 1 \|/);
  const [o, r, u, a] = await Promise.all([panel(page, "OVERDUE"), panel(page, "RECURRING"), panel(page, "UPCOMING"), panel(page, "ANYTIME")]);
  expect(o).toMatch(/Missed A[\s\S]*Missed B|Missed B[\s\S]*Missed A/);
  expect(o).not.toMatch(/Routine|Planned|Whenever/);
  expect(r).toContain("Routine");
  expect(r).not.toMatch(/Missed|Planned|Whenever/);
  expect(u).toContain("Planned");
  expect(u).not.toMatch(/Missed|Routine|Whenever/);
  expect(a).toContain("Whenever");
  expect(a).not.toMatch(/Missed|Routine|Planned/);
  expect(await screenText(page)).not.toContain("Today's"); // today's work is Home's
});

test("SCHED-02 · nothing scheduled reads as calm, not broken", async ({ app }) => {
  const { page, api } = app;
  // A plain task for today is Home's alone, so with only that the screen has nothing to list.
  await api.task({ name: "Only today", taskType: "reminder", scheduledFor: dateKey(0) });
  await reload(page);
  await openTab(page, "Scheduled");
  await see(page, "Nothing scheduled");
  expect(await screenText(page)).not.toMatch(/OVERDUE|RECURRING|UPCOMING|ANYTIME|Only today/);
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
 * The two bulk actions at the size they exist for.
 *
 * SCHED-06 and SCHED-13 prove each one does the right thing to two or three tasks. Neither can
 * see what the action costs, and the cost is what broke: every delete used to ask for the whole
 * notification queue to be rebuilt, which is three more requests per task. Sixty overdue tasks
 * made about 240 requests in a few seconds; production allows 200 a minute from one address, so
 * the server began refusing the deletes themselves half-way through, and "Clear all" left an
 * arbitrary part of the list behind with an error.
 *
 * So these count requests. One change per task is the floor - there is no bulk endpoint - and
 * everything else has to be a handful, however long the list is.
 */
/** Requests a bulk action may make beyond one per task: two rebuilds of the queue, three each. */
const BULK_OVERHEAD = 6;

function countingRequests(page: import("@playwright/test").Page) {
  const seen: { method: string; path: string }[] = [];
  page.on("request", (r) => {
    const at = r.url().indexOf("/api/");
    if (at >= 0 && r.url().includes("localhost:8080")) seen.push({ method: r.method(), path: r.url().slice(at) });
  });
  return {
    of: (method: string, path: RegExp) => seen.filter((s) => s.method === method && path.test(s.path)).length,
    all: () => seen.length,
    reset: () => void (seen.length = 0),
  };
}

test("SCHED-19 · 'Clear all' on sixty overdue tasks deletes each once and rebuilds notifications once", async ({ app }) => {
  test.setTimeout(240_000);
  const { page, api, userId } = app;
  db.bulkOverdue(userId, 60, "Pile", dateKey(-3));
  try {
    await api.task({ name: "Booked ahead", taskType: "reminder", scheduledFor: dateKey(2) });
    await api.task({ name: "No day", taskType: "reminder" });
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /OVERDUE \| 60 \|/, 60_000);
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 60 overdue");

    const requests = countingRequests(page);
    await control(page, "Delete all 60 overdue tasks").click();
    await see(page, "Delete all overdue?");
    await control(page, "Delete").click();
    await see(page, "Deleted 60 overdue tasks", 120_000);
    await page.waitForTimeout(2_000); // anything still on its way after the message

    expect(requests.of("DELETE", /^\/api\/tasks\//)).toBe(60);
    // Sixty deletes and one rebuild of the notification queue, which is three requests. The
    // ceiling leaves room for a second rebuild and nothing like room for one per task.
    expect(requests.all(), "requests made by one Clear all").toBeLessThanOrEqual(BULK_OVERHEAD + 60);

    // The database agrees with the message: the sixty are gone and the other two are not.
    expect(db.countTasks(userId, "pending")).toBe(2);
    expect(db.countTasks(userId, "completed")).toBe(0);
    await dontSee(page, /OVERDUE \|/);
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
    expect(await panel(page, "UPCOMING")).toContain("Booked ahead");
    expect(await panel(page, "ANYTIME")).toContain("No day");
  } finally {
    db.removeBulk(userId, "Pile");
  }
});

test("SCHED-20 · 'Move all to today' on sixty overdue tasks changes each once and lands them all on Home", async ({ app }) => {
  test.setTimeout(240_000);
  const { page, api, userId } = app;
  db.bulkOverdue(userId, 60, "Backlog", dateKey(-5));
  try {
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /OVERDUE \| 60 \|/, 60_000);

    const requests = countingRequests(page);
    await control(page, "Move all 60 overdue tasks to today").click();
    await control(page, "Move all").click();
    await see(page, "Moved 60 tasks to today", 120_000);
    await page.waitForTimeout(2_000);

    expect(requests.of("PATCH", /^\/api\/tasks\//)).toBe(60);
    expect(requests.all(), "requests made by one Move all").toBeLessThanOrEqual(BULK_OVERHEAD + 60);

    await dontSee(page, /OVERDUE \|/);
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
    await openTab(page, "Home");
    await see(page, /TO DO \| 60 \|/);
    // Asked of the server rather than read off the screen: all sixty, each on today, none lost.
    const moved = (await api.tasks("pending")).filter((task) => task.name.startsWith("Backlog "));
    expect(moved).toHaveLength(60);
    expect(moved.every((task) => task.scheduledFor === dateKey(0))).toBe(true);
  } finally {
    db.removeBulk(userId, "Backlog");
  }
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

/**
 * ANYTIME is the one list here that only ever grows by itself. A missed task can be cleared in
 * bulk and a booked one eventually arrives, but an undated one has no day to arrive on, so it
 * stays until somebody deals with it. Home shows the newest five and sends the reader here for
 * the rest - and this screen used to draw every one of them the moment the tab opened, however
 * many there were: a little over a thousand rows took the screen to thirteen thousand page
 * elements, where Home stays at about three hundred and fifty whatever the account holds.
 *
 * So it folds, the way Overdue does. The count in the heading stays the whole number, since
 * that is how many there are; the rows stop at thirty, and one press on a button that names the
 * remainder brings the rest, oldest included.
 */
test("SCHED-21 · Anytime shows the newest thirty and keeps the rest behind one press", async ({ app }) => {
  test.setTimeout(120_000);
  const { page, userId } = app;
  const rows = async () => (await panel(page, "ANYTIME")).match(/Loose \d+ \|/g) ?? [];

  // "Loose 1" is the newest and "Loose 75" the oldest: created_at is staggered a minute apart.
  db.bulkTasks(userId, 75, "Loose");
  try {
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 75 \|/, 60_000);

    // Thirty rows, the newest thirty, in order - and the heading still counts all of them.
    expect(await rows()).toEqual(Array.from({ length: 30 }, (_, i) => `Loose ${i + 1} |`));
    await dontSee(page, "Loose 75 |");

    // The pill is the last thing on the screen, which is where the tab bar's mascot rises over
    // the list. Scrolled as far down as the screen goes, all of it has to be clear of her - a
    // click only ever tries the middle, and the middle was never the part she covered.
    const more = "Show 45 more anytime tasks";
    await control(page, more).evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) {
          p.scrollTop = p.scrollHeight;
          break;
        }
      }
    });
    await expectWhollyTappable(page, more);

    await control(page, more).click();
    await expect.poll(async () => (await rows()).length).toBe(75);
    await see(page, "Loose 75 |");
    // Nothing left to reveal, so nothing offering to.
    expect(await panel(page, "ANYTIME")).not.toMatch(/\d+ more/);
    await see(page, /ANYTIME \| 75 \|/);
  } finally {
    db.removeBulk(userId, "Loose");
  }

  // Exactly thirty is a full list with nothing behind it, so there is no button to press.
  db.bulkTasks(userId, 30, "Loose");
  try {
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 30 \|/, 60_000);
    expect(await rows()).toHaveLength(30);
    expect(await panel(page, "ANYTIME")).not.toMatch(/\d+ more/);
  } finally {
    db.removeBulk(userId, "Loose");
  }
});
