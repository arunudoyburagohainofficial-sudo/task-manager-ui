import { expect, test } from "@playwright/test";
import {
  belongsOnHome,
  bucketFor,
  formatScheduleDate,
  groupByScheduledDate,
  toDateKey,
} from "../../src/utils/schedule";
import { assertFixedZone, atMoment, middayOn } from "./zone";

/**
 * Which screen a task belongs on — plan/18-scheduling-logic.md §E.
 *
 * Not notifications, but the same arithmetic and the same class of bug: a task filed under the
 * wrong day is a task nobody sees. `bucketFor` is the single definition Home and Scheduled both
 * derive from, so that they can't disagree and drop a task from both.
 */
assertFixedZone();

const TODAY = "2026-09-09";
const task = (scheduledFor: string | null, recurrenceRule: string | null = null) => ({ scheduledFor, recurrenceRule });

test.describe("which screen a task belongs on", () => {
  test("LOGIC-24 · the four buckets are what the model says", () => {
    expect(bucketFor(task(null), TODAY)).toBe("today");
    expect(bucketFor(task("2026-09-08"), TODAY)).toBe("overdue");
    expect(bucketFor(task("2026-09-09"), TODAY)).toBe("today");
    expect(bucketFor(task("2026-09-10"), TODAY)).toBe("upcoming");
  });

  test("LOGIC-25 · undated counts as today, deliberately", () => {
    expect(bucketFor(task(null), TODAY)).toBe("today");
    expect(belongsOnHome(task(null), TODAY)).toBe(true);
  });

  test("LOGIC-26 · dates are compared as strings and never parsed", () => {
    // Across a month, a year, and a two-digit-month boundary.
    expect(bucketFor(task("2025-12-31"), "2026-01-01")).toBe("overdue");
    expect(bucketFor(task("2026-10-01"), "2026-09-30")).toBe("upcoming");
    expect(bucketFor(task("2026-09-30"), "2026-10-01")).toBe("overdue");

    // The trap the string comparison exists to avoid: in a zone behind UTC, parsing a date key
    // gives the *previous* day. Anything that parsed would file today's task as yesterday's.
    expect(new Date("2026-09-09").getDate()).toBe(8);
    expect(bucketFor(task("2026-09-09"), "2026-09-09")).toBe("today");
  });

  test("LOGIC-27 · Home keeps overdue work, one-off and repeating alike", () => {
    expect(belongsOnHome(task("2026-09-01"), TODAY)).toBe(true);
    expect(belongsOnHome(task("2026-09-01", "FREQ=DAILY"), TODAY)).toBe(true);
    expect(belongsOnHome(task("2026-09-09", "FREQ=WEEKLY"), TODAY)).toBe(true);
    expect(belongsOnHome(task("2026-09-10"), TODAY)).toBe(false);
    expect(belongsOnHome(task("2026-09-10", "FREQ=DAILY"), TODAY)).toBe(false);
  });

  test("LOGIC-28 · a date key is the local day, never the UTC day", () => {
    // 23:30 in Los Angeles is already 06:30 tomorrow in UTC.
    const lateEvening = new Date(2026, 8, 9, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-09-10"); // the trap
    expect(toDateKey(lateEvening)).toBe("2026-09-09");

    // And in a zone ahead of UTC: 00:30 in India is still yesterday in UTC.
    const zone = process.env.TZ;
    try {
      process.env.TZ = "Asia/Kolkata";
      const justAfterMidnight = new Date(2026, 8, 9, 0, 30);
      expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-09-08"); // the trap
      expect(toDateKey(justAfterMidnight)).toBe("2026-09-09");
    } finally {
      process.env.TZ = zone;
    }
  });

  test("LOGIC-29 · upcoming groups ascend by day, and undated rows are dropped", () => {
    const tasks = [
      { id: "a", scheduledFor: "2026-09-12" },
      { id: "b", scheduledFor: null },
      { id: "c", scheduledFor: "2026-09-10" },
      { id: "d", scheduledFor: "2026-09-12" },
      { id: "e", scheduledFor: "2026-10-01" },
    ];
    expect(groupByScheduledDate(tasks).map((g) => [g.dateKey, g.tasks.map((t) => t.id)])).toEqual([
      ["2026-09-10", ["c"]],
      ["2026-09-12", ["a", "d"]],
      ["2026-10-01", ["e"]],
    ]);
  });

  test("LOGIC-30 · relative words only where they're clearer than the date", () => {
    atMoment(middayOn(TODAY), () => {
      expect(formatScheduleDate("2026-09-09", TODAY)).toBe("Today");
      expect(formatScheduleDate("2026-09-10", TODAY)).toBe("Tomorrow");
      expect(formatScheduleDate("2026-09-08", TODAY)).toBe("Yesterday");

      // Later this year: weekday, day and month — and no year. (Locale decides the order, so
      // the parts are checked rather than the whole string.)
      const saturday = formatScheduleDate("2026-09-12", TODAY);
      for (const part of [/Sat/, /\b12\b/, /Sep/]) expect(saturday).toMatch(part);
      expect(saturday).not.toMatch(/2026/);

      // Another year: the year has to appear, or "12 Sep" is ambiguous.
      const nextYear = formatScheduleDate("2027-09-12", TODAY);
      expect(nextYear).toMatch(/2027/);
      expect(nextYear).toMatch(/Sep/);
    });
  });
});
