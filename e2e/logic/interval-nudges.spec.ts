import { expect, test } from "@playwright/test";
import type { IntervalReminderDto } from "../../src/api/types";
import { INTERVAL_HORIZON_HOURS, intervalOccurrences } from "../../src/notifications/schedulingLogic";
import { assertFixedZone, atMoment, localStamp } from "./zone";

/**
 * When an interval nudge fires — plan/18-scheduling-logic.md §B.
 *
 * "Every 30 minutes from 9 to 5" is a promise about a count as much as a time. The window is a
 * daily repeat with only a 24-hour horizon, rolled forward by each foreground (useReminderSync),
 * so the edges — the first step after now, the last step of the window, and tomorrow's window —
 * are where it goes wrong.
 */
assertFixedZone();

function window(startTime: string, endTime: string, intervalMinutes: number): IntervalReminderDto {
  return { id: "w", taskId: "t", startTime, endTime, intervalMinutes, isActive: true };
}

const nudges = (now: Date, w: IntervalReminderDto) => atMoment(now, () => intervalOccurrences(w)).map(localStamp);
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);

test.describe("when an interval nudge fires", () => {
  test("LOGIC-11 · one firing per step, inside the window, none in the past", () => {
    const today = nudges(at(9, 12, 10), window("09:00", "17:00", 30)).filter((s) => s.startsWith("2026-09-09"));
    expect(today).toEqual([
      "2026-09-09 12:30",
      "2026-09-09 13:00",
      "2026-09-09 13:30",
      "2026-09-09 14:00",
      "2026-09-09 14:30",
      "2026-09-09 15:00",
      "2026-09-09 15:30",
      "2026-09-09 16:00",
      "2026-09-09 16:30",
      "2026-09-09 17:00",
    ]);
  });

  test("LOGIC-12 · the end of the window is included, and nothing passes it", () => {
    // A step that lands exactly on the end time is kept — the last nudge of the day.
    expect(nudges(at(9, 8), window("09:00", "10:00", 30))).toEqual([
      "2026-09-09 09:00",
      "2026-09-09 09:30",
      "2026-09-09 10:00",
    ]);
    // A step that would overshoot is not.
    expect(nudges(at(9, 8), window("09:00", "10:00", 25))).toEqual([
      "2026-09-09 09:00",
      "2026-09-09 09:25",
      "2026-09-09 09:50",
    ]);
  });

  test("LOGIC-13 · a zero or negative interval falls back to 30 minutes rather than looping forever", () => {
    const expected = ["2026-09-09 09:00", "2026-09-09 09:30", "2026-09-09 10:00"];
    expect(nudges(at(9, 8), window("09:00", "10:00", 0))).toEqual(expected);
    expect(nudges(at(9, 8), window("09:00", "10:00", -5))).toEqual(expected);
  });

  test("LOGIC-14 · once today's window has closed, tomorrow's is queued", () => {
    // Saved in the evening, after the window: the first nudge must be tomorrow morning, not
    // "nothing until the app is next opened".
    const stamps = nudges(at(9, 18), window("09:00", "17:00", 60));
    expect(stamps[0]).toBe("2026-09-10 09:00");
    expect(stamps.every((s) => s.startsWith("2026-09-10"))).toBe(true);
    expect(stamps).toHaveLength(9); // 09:00 … 17:00 on the hour
  });

  test("LOGIC-15 · nothing is queued beyond the 24-hour horizon", () => {
    const now = at(9, 12, 10);
    const firings = atMoment(now, () => intervalOccurrences(window("09:00", "17:00", 30)));
    const horizon = now.getTime() + INTERVAL_HORIZON_HOURS * 3_600_000;
    expect(firings.every((f) => f.getTime() <= horizon)).toBe(true);
    // Tomorrow's window is cut off at 12:10, not run to 17:00.
    expect(localStamp(firings[firings.length - 1])).toBe("2026-09-10 12:00");
    expect(firings).toHaveLength(10 + 7);
  });

  /**
   * DIVERGENCE, pinned deliberately — see plan DETAIL-13.
   *
   * The server refuses `startTime >= endTime`, so an overnight window can't be saved and nothing
   * below is reachable today. The client nonetheless carries support for one. This test records
   * what that support does, so if the product ever allows overnight windows the change starts
   * from a written-down behaviour rather than a discovery — including the gap below.
   */
  test("LOGIC-16 · an overnight window is produced by the client, though the server refuses it", () => {
    expect(nudges(at(9, 12), window("22:00", "02:00", 60))).toEqual([
      "2026-09-09 22:00",
      "2026-09-09 23:00",
      "2026-09-10 00:00",
      "2026-09-10 01:00",
      "2026-09-10 02:00",
    ]);

    // KNOWN GAP in that unreachable code: at 01:00 the window that opened last night is still
    // running, but only tonight's is walked — so the 01:00–02:00 tail is never queued. Harmless
    // while the server refuses these windows; a real bug the day it stops.
    expect(nudges(at(9, 1), window("22:00", "02:00", 60))[0]).toBe("2026-09-09 22:00");
  });
});
