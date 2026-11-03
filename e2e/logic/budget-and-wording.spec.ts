import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { ReminderDto, TaskDto } from "../../src/api/types";
import { allocateFairly, leadIn, MAX_PENDING, planQueue, type Scheduled } from "../../src/notifications/schedulingLogic";

/**
 * The budget the Upcoming notifications screen reports, read from its source. That module imports
 * `expo-notifications`, which can't load outside the app, and the point is only that the two
 * numbers - what's scheduled and what the screen says is schedulable - are the same.
 */
const NOTIFICATION_BUDGET = Number(
  /export const NOTIFICATION_BUDGET = (\d+);/.exec(
    readFileSync(join(__dirname, "../../src/notifications/scheduledInspector.ts"), "utf8")
  )?.[1]
);

/**
 * The pending-notification budget and what a notification says —
 * plan/18-scheduling-logic.md §C and §D.
 *
 * iOS holds at most 64 pending notifications for the whole app and drops the rest without an
 * error. The budget decides *which* reminders survive that; the wording decides whether the one
 * that does arrive is understood.
 */

/**
 * A source of `n` firings, labelled `${id}0`, `${id}1`, … in soonest-first order, starting on
 * `day` of September.
 */
function source(id: string, n: number, day = 9): Scheduled[] {
  return Array.from({ length: n }, (_, i) => ({
    at: new Date(2026, 8, day, 9, i),
    title: "Reminder",
    body: id,
    taskId: `${id}${i}`,
  }));
}
const ids = (picked: Scheduled[]) => picked.map((s) => s.taskId);

test.describe("the pending-notification budget", () => {
  test("LOGIC-17 · one noisy source cannot starve the quiet ones", () => {
    // A 15-minute nudge window (49 firings, today) against ten tasks with one reminder each,
    // tomorrow morning. The quiet ones must be *later* than every nudge: that's the real shape,
    // and the only one where sort-by-time-and-truncate starves them. (An earlier version of this
    // test timed them alongside the nudges and passed even with the fairness removed.)
    const noisy = source("noisy", 49, 9);
    const quiet = Array.from({ length: 10 }, (_, i) => source(`quiet${i}-`, 1, 10));
    const picked = allocateFairly([noisy, ...quiet], MAX_PENDING);

    expect(picked).toHaveLength(MAX_PENDING);
    for (let i = 0; i < 10; i++) expect(ids(picked)).toContain(`quiet${i}-0`);
    expect(picked.filter((s) => s.body === "noisy")).toHaveLength(40);
  });

  test("LOGIC-18 · the budget is never exceeded", () => {
    const groups = [source("a", 49), ...Array.from({ length: 10 }, (_, i) => source(`q${i}-`, 1))]; // 59
    expect(allocateFairly(groups, 0)).toHaveLength(0);
    expect(allocateFairly(groups, 1)).toHaveLength(1);
    expect(allocateFairly(groups, 50)).toHaveLength(50);
    expect(allocateFairly(groups, 1000)).toHaveLength(59);
    // The budget sits under the platform's 64, and the inspector screen reports the same figure.
    expect(MAX_PENDING).toBeLessThan(64);
    expect(NOTIFICATION_BUDGET).toBe(MAX_PENDING);
  });

  test("LOGIC-19 · uneven sources leave no holes and no duplicates", () => {
    const picked = ids(allocateFairly([source("a", 1), source("b", 5), source("c", 2)], 100));
    expect(picked).toHaveLength(8);
    expect(new Set(picked).size).toBe(8);
    // The deepest source's tail - a daily reminder's seventh day - is the one an off-by-one drops.
    expect(picked).toContain("b4");
  });

  test("LOGIC-20 · picks go round by round, one from each source before any second", () => {
    const groups = [source("a", 3), source("b", 1), source("c", 2)];
    expect(ids(allocateFairly(groups, 100))).toEqual(["a0", "b0", "c0", "a1", "c1", "a2"]);
    expect(ids(allocateFairly(groups, 4))).toEqual(["a0", "b0", "c0", "a1"]);
    expect(allocateFairly([], 50)).toEqual([]);
  });
});

test.describe("what a notification says", () => {
  test("LOGIC-21 · a day-of notification names the task; a lead-time one says when it's due", () => {
    expect(leadIn(0, "Call the dentist", false)).toBe("Call the dentist");
    expect(leadIn(0, "Deep work", true)).toBe("You planned to work on: Deep work");
    expect(leadIn(1, "Call the dentist", false)).toBe("Call the dentist - due tomorrow");
    // The early one must never read like the day-of one.
    expect(leadIn(1, "Deep work", true)).not.toBe(leadIn(0, "Deep work", true));
    expect(leadIn(1, "Deep work", true)).toBe("Deep work - due tomorrow");
  });

  test("LOGIC-22 · offsets read naturally: tomorrow, a week, N days", () => {
    expect(leadIn(1, "Rent", false)).toBe("Rent - due tomorrow");
    expect(leadIn(7, "Rent", false)).toBe("Rent - due in a week");
    expect(leadIn(3, "Rent", false)).toBe("Rent - due in 3 days");
    expect(leadIn(2, "Rent", false)).toBe("Rent - due in 2 days");
  });

  test("LOGIC-23 · a missing task name still makes a sentence", () => {
    expect(leadIn(0, undefined, true)).toBe("You planned to work on: your task");
    expect(leadIn(0, undefined, false)).toBe("Your task");
    // At the start of the line it's capitalised, whichever kind of task it is.
    expect(leadIn(1, undefined, false)).toBe("Your task - due tomorrow");
    expect(leadIn(1, undefined, true)).toBe("Your task - due tomorrow");
  });
});

test.describe("the whole queue - planQueue", () => {
  const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto =>
    ({ id, name: id, status: "pending", taskType: "reminder", scheduledFor: null, ...extra }) as TaskDto;
  const reminder = (taskId: string, extra: Partial<ReminderDto> = {}): ReminderDto =>
    ({ id: `r-${taskId}`, taskId, reminderTime: "09:00:00", daysBefore: 0, isActive: true, isSnoozed: false, snoozedUntil: null, ...extra }) as ReminderDto;

  test("LOGIC-37 · reminders switched off in Settings queue nothing at all", () => {
    const planned = planQueue([reminder("a")], [], [task("a")], 50, false);
    expect(planned).toEqual([]);
    // …and on, the same data does queue.
    expect(planQueue([reminder("a")], [], [task("a")], 50, true).length).toBeGreaterThan(0);
  });

  test("LOGIC-38 · only live reminders on unfinished tasks are queued, soonest first, named for their task", () => {
    const planned = planQueue(
      [reminder("open"), reminder("stopped", { isActive: false }), reminder("done"), reminder("focus", { reminderTime: "07:00:00" })],
      [],
      [task("open"), task("stopped"), task("done", { status: "completed" }), task("focus", { taskType: "focus" })]
    );
    const tasks = new Set(planned.map((s) => s.taskId));
    expect(tasks).toEqual(new Set(["open", "focus"]));
    const times = planned.map((s) => s.at.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(planned.find((s) => s.taskId === "focus")!.title).toBe("Time to focus");
    expect(planned.find((s) => s.taskId === "open")!.title).toBe("Reminder");
  });
});
