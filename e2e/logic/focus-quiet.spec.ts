import { expect, test } from "@playwright/test";
import type { FocusSessionDto, IntervalReminderDto, ReminderDto, TaskDto } from "../../src/api/types";
import { FOCUS_QUIET_CEILING_MINUTES, focusWindow, planQueue } from "../../src/notifications/schedulingLogic";
import { atMoment, localClock, localStamp } from "./zone";

/**
 * A task's reminders stay quiet while someone is focusing on it - plan/18-scheduling-logic.md §G.
 *
 * "Time to focus" in the middle of a focus session on that very task is noise, and the session has
 * Do Not Disturb on, so it would only have landed silently in the shade. planQueue drops the
 * focused task's reminders and nudges that fall inside the session's window, and nothing else.
 */

const TODAY = "2026-09-10";
const at = (h: number, m = 0, day = 10) => new Date(2026, 8, day, h, m);

const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto =>
  ({ id, name: id, status: "pending", taskType: "focus", scheduledFor: TODAY, ...extra }) as TaskDto;
const reminder = (taskId: string, time: string, extra: Partial<ReminderDto> = {}): ReminderDto =>
  ({ id: `r-${taskId}-${time}`, taskId, reminderTime: time, daysBefore: 0, isActive: true, isSnoozed: false, snoozedUntil: null, ...extra }) as ReminderDto;
const nudges = (taskId: string, startTime: string, endTime: string, intervalMinutes: number): IntervalReminderDto => ({
  id: `n-${taskId}`,
  taskId,
  startTime,
  endTime,
  intervalMinutes,
  isActive: true,
});
const session = (taskId: string, startedAt: Date, extra: Partial<FocusSessionDto> = {}): FocusSessionDto =>
  ({
    id: `s-${taskId}`,
    taskId,
    durationSeconds: null,
    focusMode: "regular",
    numPomodoroCycles: null,
    plannedMinutes: 25,
    pointsEarned: null,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    wasInterrupted: null,
    ...extra,
  }) as FocusSessionDto;

/** "taskId @ HH:mm" for every queued entry - enough to see which survived. */
const queued = (planned: ReturnType<typeof planQueue>) => planned.map((s) => `${s.taskId} @ ${localClock(s.at)}`);

test.describe("quiet while focusing", () => {
  test("LOGIC-39 · the focused task's reminder in the session is dropped; another task's isn't", () => {
    const planned = atMoment(at(10, 30), () =>
      planQueue(
        [reminder("deep", "12:00:00"), reminder("other", "12:00:00")],
        [],
        [task("deep"), task("other")],
        50,
        true,
        focusWindow(session("deep", at(10, 0)))
      )
    );
    expect(queued(planned)).toEqual(["other @ 12:00"]);
  });

  test("LOGIC-40 · only the window is quiet: later the same day, and the days after, still ring", () => {
    // Started 10:00, so quiet until the 4-hour ceiling at 14:00.
    const window = focusWindow(session("deep", at(10, 0)))!;
    expect(localStamp(window.until)).toBe(`${TODAY} 14:00`);

    const sameDay = atMoment(at(10, 30), () =>
      planQueue([reminder("deep", "12:00:00"), reminder("deep", "15:00:00")], [], [task("deep")], 50, true, window)
    );
    expect(queued(sameDay)).toEqual(["deep @ 15:00"]);

    // An undated task's reminder rings every day: today's 12:00 is in the session, tomorrow's isn't.
    const daily = atMoment(at(10, 30), () =>
      planQueue([reminder("anytime", "12:00:00")], [], [task("anytime", { scheduledFor: null })], 50, true, focusWindow(session("anytime", at(10, 0))))
    );
    expect(daily.map((s) => localStamp(s.at))[0]).toBe("2026-09-11 12:00");
    expect(daily.some((s) => localStamp(s.at) === `${TODAY} 12:00`)).toBe(false);
  });

  test("LOGIC-41 · the focused task's nudges are quiet in the session; another task's keep coming", () => {
    const planned = atMoment(at(10, 30), () =>
      planQueue(
        [],
        [nudges("deep", "11:00:00", "16:00:00", 60), nudges("other", "11:00:00", "12:00:00", 60)],
        [task("deep"), task("other")],
        50,
        true,
        focusWindow(session("deep", at(10, 0)))
      )
    );
    const today = planned.filter((s) => localStamp(s.at).startsWith(TODAY));
    expect(today.filter((s) => s.taskId === "other").map((s) => localClock(s.at))).toEqual(["11:00", "12:00"]);
    // 11:00, 12:00 and 13:00 fall in the session (until 14:00); 14:00 onwards rings as usual.
    expect(today.filter((s) => s.taskId === "deep").map((s) => localClock(s.at))).toEqual(["14:00", "15:00", "16:00"]);
  });

  test("LOGIC-42 · no session, or one that has finished, silences nothing", () => {
    expect(focusWindow(null)).toBeNull();
    expect(focusWindow(undefined)).toBeNull();
    expect(focusWindow(session("deep", at(10, 0), { completedAt: at(10, 25).toISOString() }))).toBeNull();
    expect(focusWindow(session("deep", at(10, 0), { startedAt: "not a time" }))).toBeNull();

    const plain = atMoment(at(10, 30), () => planQueue([reminder("deep", "12:00:00")], [], [task("deep")]));
    const withNone = atMoment(at(10, 30), () => planQueue([reminder("deep", "12:00:00")], [], [task("deep")], 50, true, null));
    expect(queued(withNone)).toEqual(queued(plain));
    expect(queued(plain)).toEqual(["deep @ 12:00"]);
  });

  test("LOGIC-43 · a session left open can't silence the task for ever", () => {
    // The window ends at the server's own crediting ceiling after the start, whatever happens.
    const window = focusWindow(session("deep", at(10, 0)))!;
    expect(window.until.getTime() - at(10, 0).getTime()).toBe(FOCUS_QUIET_CEILING_MINUTES * 60_000);
    // Six hours on, the session is still "open" (the app was killed) - and the reminder rings.
    const later = atMoment(at(16, 0), () => planQueue([reminder("deep", "17:00:00")], [], [task("deep")], 50, true, window));
    expect(queued(later)).toEqual(["deep @ 17:00"]);
  });
});
