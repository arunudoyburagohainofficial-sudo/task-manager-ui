import type { Response } from "@playwright/test";

import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { button, control, dateKey, exact, openTab, reload, screenText, section, see } from "../harness/app";
import { db } from "../harness/db";
import { choice, openSchedule, saveAndClose, seedAndOpen, sheetButton, storedNotifications } from "../harness/sheet";

/**
 * Recurrence through the UI — plan/06-recurrence.md.
 *
 * A repeating task is never expanded into a series: exactly one occurrence exists, and finishing
 * it mints the next. So every completion is also a creation and every undo also a deletion. The
 * grammar is proven by the API harnesses and `logic/`; these prove what the person sees.
 */

const pendingNamed = async (api: Api, name: string) => (await api.tasks("pending")).filter((t) => t.name === name);
const completedNamed = async (api: Api, name: string) => (await api.tasks("completed")).filter((t) => t.name === name);

/** "YYYY-MM-DD" arithmetic on plain calendar dates, no zones involved. */
function addDaysTo(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const dow = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
function nextDow(from: string, target: number): string {
  let k = addDaysTo(from, 1);
  while (dow(k) !== target) k = addDaysTo(k, 1);
  return k;
}
function nthWeekday(year: number, month: number, n: number, target: number): string {
  let k = `${year}-${String(month).padStart(2, "0")}-01`;
  while (dow(k) !== target) k = addDaysTo(k, 1);
  return addDaysTo(k, 7 * (n - 1));
}

/** Completes the one live occurrence and returns its successor (or null when the series ends). */
async function completeLive(api: Api, name: string) {
  const [live] = await pendingNamed(api, name);
  await api.complete(live.id);
  const next = await pendingNamed(api, name);
  expect(next.length, `${name}: more than one live occurrence`).toBeLessThanOrEqual(1);
  return next[0] ?? null;
}

test.describe("completion mints the next", () => {
  test("RECUR-01 · finishing today's occurrence brings tomorrow's, filed under Recurring", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Water plants", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await control(page, "Done: Water plants").click();
    await expect.poll(() => section(page, "DONE")).toContain("Water plants");
    expect(await section(page, "TO DO")).not.toContain("Water plants");

    /*
     * Poll the server rather than read it once. Home's Done is optimistic - the row moves into
     * DONE from onMutate, before the request has landed - and the successor is minted server
     * side, so right after the tap the original is still the one pending and still dated today.
     * Every sibling in this file already waits this way; this one was missed, and passed for
     * months on a quiet machine before a full run was slow enough to lose the race.
     */
    await expect.poll(async () => (await pendingNamed(api, "Water plants"))[0]?.scheduledFor).toBe(dateKey(1));
    await openTab(page, "Scheduled");
    await see(page, /RECURRING[\s\S]*Water plants \| Reminder · Every day · next Tomorrow/);
  });

  test("RECUR-02 · the next occurrence keeps the whole configuration", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Health", 20);
    const t = await api.task({
      name: "Vitamins",
      taskType: "focus",
      goalId: goal.id,
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=WEEKLY",
      notifications: [{ time: "08:00:00", daysBefore: 0 }, { time: "20:00:00", daysBefore: 1 }],
    });
    await reload(page);
    await api.complete(t.id);
    const [next] = await pendingNamed(api, "Vitamins");
    expect(next).toMatchObject({ taskType: "focus", goalId: goal.id, recurrenceRule: "FREQ=WEEKLY", scheduledFor: dateKey(7) });
    expect(await storedNotifications(api, next.id)).toEqual(["20:00/1", "08:00/0"]);
  });

  test("RECUR-03 · undo retracts the occurrence completion created", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Journal", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await control(page, "Done: Journal").click();
    await expect.poll(async () => (await pendingNamed(api, "Journal"))[0]?.scheduledFor).toBe(dateKey(1));

    await button(page, "Undo").click();
    await expect.poll(() => section(page, "TO DO")).toContain("Journal");
    const live = await pendingNamed(api, "Journal");
    expect(live).toHaveLength(1);
    expect(live[0].scheduledFor).toBe(dateKey(0));
  });

  test("RECUR-04 · undo keeps a successor that has already been dealt with", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Stretch", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await control(page, "Done: Stretch").click();
    // Wait for the successor itself — right after the tap the original is still the one pending.
    await expect.poll(async () => (await pendingNamed(api, "Stretch"))[0]?.scheduledFor).toBe(dateKey(1));
    const [tomorrow] = await pendingNamed(api, "Stretch");
    await api.complete(tomorrow.id);

    await button(page, "Undo").click();
    await expect.poll(async () => (await pendingNamed(api, "Stretch")).map((t) => t.scheduledFor)).toContain(dateKey(0));
    // Tomorrow's copy was finished — that's recorded work, and it survives.
    const done = await completedNamed(api, "Stretch");
    expect(done.map((t) => t.id)).toContain(tomorrow.id);
  });

  test("RECUR-05 · the last occurrence of a counted series ends it", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Last one", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY;COUNT=1" });
    await reload(page);
    await control(page, "Done: Last one").click();
    await expect.poll(() => section(page, "DONE")).toContain("Last one");
    await page.waitForTimeout(500);
    expect(await pendingNamed(api, "Last one")).toHaveLength(0);
    await openTab(page, "Scheduled");
    await see(page, "Nothing scheduled");
    expect((await screenText(page)).replace(/“Last one” done \| Undo/, "")).not.toContain("Last one");
  });

  test("RECUR-06 · the count visibly decrements across completions, then ends", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Course", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY;COUNT=3" });
    const second = await completeLive(api, "Course");
    expect(second!.recurrenceRule).toBe("FREQ=DAILY;COUNT=2");
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /Course \| Reminder · Every day · 2 left/);
    const third = await completeLive(api, "Course");
    expect(third!.recurrenceRule).toBe("FREQ=DAILY;COUNT=1");
    expect(await completeLive(api, "Course")).toBeNull();
  });
});

test.describe("where the next one lands", () => {
  /**
   * Jan 31 → Feb 28 → Mar 28 → forever was a real bug, and every step of it looks reasonable.
   *
   * The series starts next January so it is entirely ahead of today however long this test
   * lives. It used to start on a written-down 31 October and quietly began failing the day
   * that date went past — a test that expires is worse than no test, because it spends a
   * real run's attention on nothing.
   */
  test("RECUR-07 · month ends don't drift", async ({ app }) => {
    const { page, api } = app;
    const year = Number(dateKey(0).slice(0, 4)) + 1;
    const febLast = new Date(Date.UTC(year, 2, 0)).getUTCDate(); // 28, or 29 in a leap year
    await api.task({ name: "Month end", taskType: "reminder", scheduledFor: `${year}-01-31`, recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=31" });
    const landed: string[] = [];
    for (let i = 0; i < 5; i++) landed.push((await completeLive(api, "Month end"))!.scheduledFor!);
    expect(landed).toEqual([
      `${year}-02-${febLast}`, `${year}-03-31`, `${year}-04-30`, `${year}-05-31`, `${year}-06-30`,
    ]);
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /Month end \| Reminder · Every month on day 31/);
  });

  test("RECUR-08 · a weekday set lands on the next ticked day", async ({ app }) => {
    const { api } = app;
    const monday = nextDow(dateKey(0), 1);
    await api.task({ name: "MWF", taskType: "reminder", scheduledFor: monday, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
    const wed = await completeLive(api, "MWF");
    expect(wed!.scheduledFor).toBe(addDaysTo(monday, 2));
    const fri = await completeLive(api, "MWF");
    expect(fri!.scheduledFor).toBe(addDaysTo(monday, 4));
    const nextMon = await completeLive(api, "MWF");
    expect(nextMon!.scheduledFor).toBe(addDaysTo(monday, 7));
  });

  test("RECUR-09 · an nth-weekday rule lands in the right month, not four weeks later", async ({ app }) => {
    const { api } = app;
    let [y, m] = dateKey(0).split("-").map(Number);
    // Some months, four weeks after the third Tuesday *is* the next third Tuesday. Start from
    // one where it isn't, or the test can't tell the two answers apart.
    let first = "";
    let expected = "";
    for (let i = 0; i < 12; i++) {
      m = (m % 12) + 1;
      if (m === 1) y++;
      first = nthWeekday(y, m, 3, 2);
      expected = nthWeekday(m === 12 ? y + 1 : y, (m % 12) + 1, 3, 2);
      if (expected !== addDaysTo(first, 28)) break;
    }
    await api.task({ name: "Third Tuesday", taskType: "reminder", scheduledFor: first, recurrenceRule: "FREQ=MONTHLY;BYDAY=3TU" });
    const next = await completeLive(api, "Third Tuesday");
    expect(next!.scheduledFor).toBe(expected);
  });

  test("RECUR-10 · a missed routine stays on Home under Recurring, and finishing it still mints the next", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Meditate", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    db.scheduledFor(t.id, dateKey(-3));
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Meditate");
    await control(page, "Done: Meditate").click();
    await expect.poll(async () => (await pendingNamed(api, "Meditate"))[0]?.id ?? t.id).not.toBe(t.id);
    const [next] = await pendingNamed(api, "Meditate");
    // Not a successor already in the past — that would be overdue the moment it appeared.
    expect(next.scheduledFor! >= dateKey(0), `successor landed on ${next.scheduledFor}`).toBe(true);
  });

  test("RECUR-11 · two completions at once produce one successor", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Race", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    // A double tap, and a second device completing at the same moment.
    await Promise.all([
      control(page, "Done: Race").dblclick({ force: true }).catch(() => undefined),
      api.complete(t.id).catch(() => undefined),
    ]);
    await expect.poll(() => section(page, "DONE")).toContain("Race");
    await page.waitForTimeout(1_000);
    expect(await pendingNamed(api, "Race")).toHaveLength(1);
    expect(await completedNamed(api, "Race")).toHaveLength(1);
  });

  test("RECUR-12 · turning the repeat off leaves today's occurrence alone", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Habit I'm dropping", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await exact(page, "Habit I'm dropping").click();
    await openSchedule(page, "Habit I'm dropping");
    await choice(page, "Never").click();
    await saveAndClose(page);
    expect((await api.getTask(t.id)).scheduledFor).toBe(dateKey(0));
    await control(page, "Mark as done").click();
    await expect.poll(async () => (await completedNamed(api, "Habit I'm dropping")).length).toBe(1);
    expect(await pendingNamed(api, "Habit I'm dropping")).toHaveLength(0);
  });

  test("RECUR-13 · an interval repeat advances by its interval", async ({ app }) => {
    const { api } = app;
    await api.task({ name: "Every third day", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY;INTERVAL=3" });
    expect((await completeLive(api, "Every third day"))!.scheduledFor).toBe(dateKey(3));
  });

  test("RECUR-14 · a yearly routine on 29 February keeps its anchor through the short years", async ({ app }) => {
    /*
     * Found 2026-09-18, fixed 2026-09-19: the day was re-derived from the previous occurrence —
     * the 28th after the first short year — so the series stayed on the 28th for ever. A series
     * begun on the 29th now carries BYMONTHDAY=29, added by the server.
     */
    const { api } = app;
    const t = await api.task({ name: "Leap day", taskType: "reminder", scheduledFor: "2028-02-29", recurrenceRule: "FREQ=YEARLY" });
    expect(t.recurrenceRule).toBe("FREQ=YEARLY;BYMONTHDAY=29");
    const landed: string[] = [];
    for (let i = 0; i < 4; i++) landed.push((await completeLive(api, "Leap day"))!.scheduledFor!);
    // A real date every year — and back on the 29th when the calendar has one.
    expect(landed).toEqual(["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  test("RECUR-15 · a rule this build can't name still reads as repeating and still completes", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "From the future", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    db.rawRule(t.id, "FREQ=DAILY;BYHOUR=9");
    await reload(page);
    await openTab(page, "Scheduled");
    // "Repeats" on its own is what an unnameable rule reduces to - the row still says it
    // comes back without pretending to describe how.
    await see(page, /From the future \| Reminder · Repeats/);
    await openTab(page, "Home");
    await control(page, "Done: From the future").click();
    await expect.poll(() => section(page, "DONE")).toContain("From the future");
  });

  test("RECUR-16 · a repeat added to a dated task starts from that task's own date", async ({ app }) => {
    const { page, api } = app;
    const day = dateKey(4);
    const t = await api.task({ name: "Friday thing", taskType: "reminder", scheduledFor: day });
    await reload(page);
    await openTab(page, "Scheduled");
    await exact(page, "Friday thing").click();
    await openSchedule(page, "Friday thing");
    await choice(page, "Weekly").click();
    await saveAndClose(page);
    const after = await api.getTask(t.id);
    expect(after.scheduledFor).toBe(day);
    expect(after.recurrenceRule).toBe("FREQ=WEEKLY");
  });

  test("RECUR-17 · changing the rule on a live occurrence neither creates nor loses one", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Reshape", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await exact(page, "Reshape").click();
    await openSchedule(page, "Reshape");
    await choice(page, "Weekly").click();
    await saveAndClose(page);
    const live = await pendingNamed(api, "Reshape");
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ scheduledFor: dateKey(0), recurrenceRule: "FREQ=WEEKLY" });
  });

  /**
   * Found 2026-09-19 while fixing RECUR-14. The server re-anchors a monthly rule to the task's own
   * date on every save, so the 31st series sitting on 30 November — re-saved just to add a
   * notification — became a 30th series for good. A date that's where the anchor clamps to now
   * keeps the anchor.
   */
  test("RECUR-19 · re-saving a month-end occurrence in a short month keeps it on the last day", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Rent", scheduledFor: "2026-11-30", recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=31" });
    expect(t.recurrenceRule).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    await openSchedule(page, "Rent");
    await sheetButton(page, "Notify me").click();
    await saveAndClose(page);
    expect((await api.getTask(t.id)).recurrenceRule).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    expect(await storedNotifications(api, t.id)).toHaveLength(1);
    expect((await completeLive(api, "Rent"))!.scheduledFor).toBe("2026-12-31");
  });

  /** Moving a "3 more times" task by a day used to rebuild its rule as a bare FREQ=MONTHLY — for ever. */
  test("RECUR-20 · moving a repeating task's date keeps how many are left", async ({ app }) => {
    const { api } = app;
    const t = await api.task({ name: "Three more", taskType: "reminder", scheduledFor: dateKey(5), recurrenceRule: "FREQ=MONTHLY;INTERVAL=2;COUNT=3" });
    const moved = await api.update(t.id, { scheduledFor: dateKey(6) });
    const day = Number(dateKey(6).slice(8));
    expect(moved.recurrenceRule).toBe(`FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=${day};COUNT=3`);
  });

  /** A leap-day yearly task moved to another day stops pointing at the 29th. */
  test("RECUR-21 · moving a 29 February yearly task follows the move", async ({ app }) => {
    const { api } = app;
    const t = await api.task({ name: "Moved leap", taskType: "reminder", scheduledFor: "2028-02-29", recurrenceRule: "FREQ=YEARLY" });
    const moved = await api.update(t.id, { scheduledFor: "2028-03-10" });
    expect(moved.recurrenceRule).toBe("FREQ=YEARLY");
    expect((await completeLive(api, "Moved leap"))!.scheduledFor).toBe("2029-03-10");
  });

  test("RECUR-18 · a successor's notifications move with it, as offsets", async ({ app }) => {
    const { api } = app;
    await api.task({
      name: "Bin day",
      taskType: "reminder",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=WEEKLY",
      notifications: [{ time: "20:00:00", daysBefore: 1 }, { time: "07:00:00", daysBefore: 0 }],
    });
    const next = await completeLive(api, "Bin day");
    expect(next!.scheduledFor).toBe(dateKey(7));
    // Attached to the new occurrence, still as offsets — so the warning lands the evening before
    // *its* day, not before the old one.
    expect(await storedNotifications(api, next!.id)).toEqual(["20:00/1", "07:00/0"]);
    const oldOnes = (await api.reminders()).filter((r) => r.isActive && r.taskId !== next!.id);
    expect(oldOnes).toHaveLength(0);
  });
});

test.describe("a routine kept for a long time", () => {
  /**
   * Finishing an occurrence leaves that day's notifications on the server, switched off, so that
   * undo can switch them back on. Nothing removes them afterwards. The phone asks for the whole
   * list on every sync — each launch, each return to the app, each finish — and saves what it
   * gets, so if finished work is included the list grows by a few rows a day for every routine
   * for as long as the account exists. All of that to ring for the one occurrence still to do.
   */
  test("RECUR-22 · weeks of finishing a routine leave the phone with one occurrence's notifications, not all of them", async ({ app }) => {
    const { page, api } = app;
    const ROUNDS = 20;
    const first = await api.task({
      name: "Stretch",
      taskType: "reminder",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=DAILY",
      notifications: [
        { time: "07:00:00", daysBefore: 0 },
        { time: "12:00:00", daysBefore: 0 },
        { time: "21:00:00", daysBefore: 0 },
      ],
    });
    await api.nudgeWindow(first.id, "09:00:00", "11:00:00", 30);

    let live = first.id;
    let lastFinished = first.id;
    for (let i = 0; i < ROUNDS; i++) {
      lastFinished = live;
      live = (await completeLive(api, "Stretch"))!.id;
    }
    expect(await completedNamed(api, "Stretch")).toHaveLength(ROUNDS);

    // What the server hands over: the live occurrence's three, and its one nudge. Nothing else.
    expect((await api.reminders()).map((r) => r.taskId)).toEqual([live, live, live]);
    expect((await api.intervals()).map((i) => i.taskId)).toEqual([live]);

    // And that is what the app itself downloads when it opens.
    const downloaded: Record<string, number> = {};
    const count = async (r: Response) => {
      const which = /\/api\/(reminders|interval-reminders)$/.exec(r.url())?.[1];
      if (!which || r.request().method() !== "GET") return;
      downloaded[which] = ((await r.json().catch(() => [])) as unknown[]).length;
    };
    page.on("response", count);
    try {
      await reload(page);
      await expect.poll(() => downloaded).toEqual({ reminders: 3, "interval-reminders": 1 });
    } finally {
      page.off("response", count);
    }

    // The finished ones are kept for undo, so undo has to still find them: the occurrence
    // comes back with all three switched on, and the one made to replace it is withdrawn.
    await api.reopen(lastFinished);
    const back = await api.reminders();
    expect(back.map((r) => r.taskId)).toEqual([lastFinished, lastFinished, lastFinished]);
    expect(back.every((r) => r.isActive)).toBe(true);
    expect((await api.intervals()).map((i) => [i.taskId, i.isActive])).toEqual([[lastFinished, true]]);
  });
});
