import { expect, test } from "@playwright/test";
import { DAILY_HORIZON_DAYS, reminderOccurrences } from "../../src/notifications/schedulingLogic";
import { assertFixedZone, atMoment, localClock, localStamp, middayOn } from "./zone";

/**
 * When one reminder fires — plan/18-scheduling-logic.md §A.
 *
 * `reminderOccurrences` is the single most important function in the product: every screen that
 * says "Reminder · 6 PM" is displaying a promise this function either keeps or breaks. It reads
 * the process clock, so every case runs at a frozen moment — Wednesday 9 September 2026, midday,
 * America/Los_Angeles — and every expectation is written out by hand as a local wall-clock time.
 */
assertFixedZone();

const NOW = middayOn("2026-09-09");
const fire = (...args: Parameters<typeof reminderOccurrences>) =>
  atMoment(NOW, () => reminderOccurrences(...args)).map(localStamp);

test.describe("when one reminder fires", () => {
  test("LOGIC-01 · a reminder with a date but no time produces nothing", () => {
    // Carries the task's day, not an alarm. Reading the absent time as 00:00 would wake people.
    expect(fire(null, "2026-09-10")).toEqual([]);
    expect(fire(null, null)).toEqual([]);
  });

  test("LOGIC-02 · a dated reminder fires once, at its local wall-clock time", () => {
    const [only, ...rest] = atMoment(NOW, () => reminderOccurrences("09:00:00", "2026-09-10"));
    expect(rest).toEqual([]);
    expect(localStamp(only)).toBe("2026-09-10 09:00");
    // The same moment as an instant: 09:00 PDT is 16:00 UTC. A refactor that parsed the pair as
    // UTC would still print a plausible "09:00" somewhere — this pins which 09:00.
    expect(only.toISOString()).toBe("2026-09-10T16:00:00.000Z");
  });

  test("LOGIC-03 · a dated reminder already in the past produces nothing", () => {
    expect(fire("09:00:00", "2026-09-09")).toEqual([]); // earlier today
    expect(fire("12:00:00", "2026-09-09")).toEqual([]); // exactly now — not "in the future"
    expect(fire("18:00:00", "2026-09-01")).toEqual([]); // last week
    // …while later today is still fine.
    expect(fire("18:00:00", "2026-09-09")).toEqual(["2026-09-09 18:00"]);
  });

  test("LOGIC-04 · a lead time is subtracted from the task's day, not from now", () => {
    // Due in ten days, a week's warning: fires in three days, at the configured time.
    expect(fire("09:00:00", "2026-09-19", null, 7)).toEqual(["2026-09-12 09:00"]);
    expect(fire("09:00:00", "2026-09-19", null, 1)).toEqual(["2026-09-18 09:00"]);
    // A lead time across a month boundary.
    expect(fire("09:00:00", "2026-10-03", null, 7)).toEqual(["2026-09-26 09:00"]);
  });

  test("LOGIC-05 · a lead time landing before today produces nothing — not a late firing", () => {
    expect(fire("09:00:00", "2026-09-12", null, 7)).toEqual([]); // due in 3 days, week's warning
    expect(fire("09:00:00", "2026-09-10", null, 7)).toEqual([]); // due tomorrow
    // Lands on today, but the time has already gone — same answer.
    expect(fire("09:00:00", "2026-09-16", null, 7)).toEqual([]);
    // Lands on today, later on — fires.
    expect(fire("18:00:00", "2026-09-16", null, 7)).toEqual(["2026-09-09 18:00"]);
  });

  test("LOGIC-06 · an undated reminder queues a week, one a day, all at the same time", () => {
    const stamps = fire("18:00:00", null);
    expect(DAILY_HORIZON_DAYS).toBe(7);
    expect(stamps).toEqual([
      "2026-09-09 18:00", // today's slot is still ahead of midday, so it's the first
      "2026-09-10 18:00",
      "2026-09-11 18:00",
      "2026-09-12 18:00",
      "2026-09-13 18:00",
      "2026-09-14 18:00",
      "2026-09-15 18:00",
    ]);
  });

  test("LOGIC-07 · an undated reminder whose time has passed starts tomorrow, still seven", () => {
    const stamps = fire("09:00:00", null);
    expect(stamps).toHaveLength(7);
    expect(stamps[0]).toBe("2026-09-10 09:00");
    expect(stamps[6]).toBe("2026-09-16 09:00");
    // Exactly now counts as passed — it must not fire the instant the reminder is saved.
    expect(fire("12:00:00", null)[0]).toBe("2026-09-10 12:00");
  });

  test("LOGIC-08 · a daily 9am stays 9am across both DST transitions", () => {
    for (const [label, now, jump] of [
      // Clocks go back an hour overnight 31 Oct → 1 Nov: that night's gap is 25 hours.
      ["fall back", middayOn("2026-10-29"), 25],
      // Clocks go forward overnight 7 → 8 Mar: that night's gap is 23 hours.
      ["spring forward", middayOn("2026-03-05"), 23],
    ] as const) {
      const firings = atMoment(now, () => reminderOccurrences("09:00:00", null));
      expect(firings.map(localClock), label).toEqual(Array(7).fill("09:00"));

      // Proves the transition really is inside the horizon, so the assertion above isn't vacuous.
      const gaps = firings.slice(1).map((at, i) => (at.getTime() - firings[i].getTime()) / 3_600_000);
      expect(gaps.filter((h) => h !== 24), label).toEqual([jump]);
    }

    // A lead time across the transition keeps its clock time too.
    expect(
      atMoment(middayOn("2026-10-20"), () => reminderOccurrences("09:00:00", "2026-11-02", null, 7)).map(localStamp)
    ).toEqual(["2026-10-26 09:00"]);
  });

  test("LOGIC-09 · a live snooze replaces the schedule and fires exactly once", () => {
    const snoozedUntil = new Date(2026, 8, 9, 12, 15).toISOString();
    // A dated reminder later today: only the snooze, not the 18:00 as well.
    expect(fire("18:00:00", "2026-09-09", snoozedUntil)).toEqual(["2026-09-09 12:15"]);
    // A daily one: the snooze stands in for all seven until it expires.
    expect(fire("18:00:00", null, snoozedUntil)).toEqual(["2026-09-09 12:15"]);
  });

  test("LOGIC-10 · an expired snooze is ignored and the ordinary schedule returns", () => {
    const expired = new Date(2026, 8, 9, 11, 0).toISOString();
    expect(fire("18:00:00", "2026-09-09", expired)).toEqual(["2026-09-09 18:00"]);
    expect(fire("18:00:00", null, expired)).toHaveLength(7);
  });
});
