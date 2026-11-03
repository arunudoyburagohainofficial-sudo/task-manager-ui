import { expect, test } from "@playwright/test";
import {
  buildRecurrence,
  defaultPattern,
  describeRecurrence,
  isRecurringTask,
  parseRecurrence,
  recurrenceLabel,
  type RecurrencePattern,
} from "../../src/utils/recurrence";

/**
 * The client's mirror of the server's RRULE grammar — plan/18-scheduling-logic.md §F.
 *
 * `Recurrence.java` is the definition; `utils/recurrence.ts` is a hand-written copy of it. The
 * API harness `rrule-probe` proves the server's half. Nothing proved the client's — and the
 * client's half is the one that decides whether reopening a task's schedule shows the user their
 * routine, or quietly shows "doesn't repeat" and removes it on the next save.
 */
const p = (over: Partial<RecurrencePattern>): RecurrencePattern => ({ ...defaultPattern(over.freq), ...over });

/** Every shape the schedule sheet can build. */
const BUILDABLE: [string, RecurrencePattern][] = [
  ["daily", p({ freq: "DAILY" })],
  ["every 3 days", p({ freq: "DAILY", interval: 3 })],
  ["weekly", p({ freq: "WEEKLY" })],
  ["every 2 weeks", p({ freq: "WEEKLY", interval: 2 })],
  ["Mon/Wed/Fri", p({ freq: "WEEKLY", byDay: ["MO", "WE", "FR"] })],
  ["every weekday", p({ freq: "WEEKLY", byDay: ["MO", "TU", "WE", "TH", "FR"] })],
  ["monthly on the 10th", p({ freq: "MONTHLY", byMonthDay: 10 })],
  ["monthly on the 31st", p({ freq: "MONTHLY", byMonthDay: 31 })],
  ["every 2 months on the 31st", p({ freq: "MONTHLY", interval: 2, byMonthDay: 31 })],
  ["third Tuesday", p({ freq: "MONTHLY", nth: { week: 3, day: "TU" } })],
  ["last Friday", p({ freq: "MONTHLY", nth: { week: -1, day: "FR" } })],
  ["yearly", p({ freq: "YEARLY" })],
  ["yearly from 29 February", p({ freq: "YEARLY", byMonthDay: 29 })], // the server adds it; the sheet keeps it
  ["daily, 3 times", p({ freq: "DAILY", count: 3 })],
  ["weekly on Mon, once", p({ freq: "WEEKLY", byDay: ["MO"], count: 1 })],
];

test.describe("the RRULE mirror", () => {
  test("LOGIC-31 · every rule the app can build reads back as itself", () => {
    for (const [name, pattern] of BUILDABLE) {
      expect(parseRecurrence(buildRecurrence(pattern)), name).toEqual(pattern);
    }
  });

  test("LOGIC-32 · the canonical string is the one the server writes", () => {
    expect(buildRecurrence(p({ freq: "DAILY" }))).toBe("FREQ=DAILY"); // no INTERVAL=1
    // Week order, whatever order the days were tapped in.
    expect(buildRecurrence(p({ freq: "WEEKLY", byDay: ["FR", "MO", "WE"] }))).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    // Field order matches Recurrence.java's serialiser: FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT.
    expect(buildRecurrence(p({ freq: "MONTHLY", interval: 2, byMonthDay: 10, count: 3 }))).toBe(
      "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=10;COUNT=3"
    );
    expect(buildRecurrence(p({ freq: "MONTHLY", nth: { week: -1, day: "FR" } }))).toBe("FREQ=MONTHLY;BYDAY=-1FR");
    // Parsing is order-tolerant, so a server string in any order still reads — and re-serialises
    // canonically.
    expect(buildRecurrence(parseRecurrence("BYDAY=WE,MO;FREQ=WEEKLY")!)).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });

  test("LOGIC-33 · unknown tokens and bad values are refused, not ignored", () => {
    for (const rule of [
      "FREQ=DAILY;BYHOUR=9", // unknown key
      "FREQ=DAILY;X", // no '='
      "FREQ=", // empty value
      "=DAILY", // empty key
      "FREQ=HOURLY", // unknown frequency
      "FREQ=DAILY;INTERVAL=0",
      "FREQ=DAILY;INTERVAL=400",
      "FREQ=DAILY;INTERVAL=1.5",
      "FREQ=MONTHLY;BYMONTHDAY=0",
      "FREQ=MONTHLY;BYMONTHDAY=32",
      "FREQ=DAILY;COUNT=0",
      "FREQ=WEEKLY;BYDAY=MO,XX", // bad weekday
      "FREQ=MONTHLY;BYDAY=5TU", // there is no fifth-week ordinal
      "FREQ=DAILY;UNTIL=2026-12-31", // wrong UNTIL format
    ]) {
      expect(parseRecurrence(rule), rule).toBeNull();
    }
  });

  test("LOGIC-34 · every contradiction the server rejects is rejected here too", () => {
    for (const rule of [
      "INTERVAL=2", // no FREQ at all
      "FREQ=DAILY;COUNT=3;UNTIL=20261231", // two end conditions
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", // weekly day-set needs INTERVAL=1
      "FREQ=WEEKLY;BYDAY=3TU", // nth weekday outside monthly
      "FREQ=MONTHLY;BYDAY=MO,WE", // monthly with a weekday set
      "FREQ=YEARLY;BYDAY=MO", // yearly takes its day from the task's date
      "FREQ=YEARLY;BYMONTHDAY=10", // only 29 — the leap-day anchor — has a meaning on yearly
      "FREQ=MONTHLY;BYMONTHDAY=10;BYDAY=3TU", // two monthly anchors
    ]) {
      expect(parseRecurrence(rule), rule).toBeNull();
    }
  });

  test("LOGIC-35 · a rule this build can't represent still reads as repeating", () => {
    const fromTheFuture = { recurrenceRule: "FREQ=HOURLY;INTERVAL=4" };
    expect(parseRecurrence(fromTheFuture.recurrenceRule)).toBeNull();
    expect(isRecurringTask(fromTheFuture)).toBe(true);
    expect(describeRecurrence(fromTheFuture.recurrenceRule)).toBe("Repeats");
    expect(recurrenceLabel(fromTheFuture.recurrenceRule)).toBe("Repeats");
    // …while a task that genuinely doesn't repeat says nothing at all.
    expect(isRecurringTask({ recurrenceRule: null })).toBe(false);
    expect(describeRecurrence(null)).toBeNull();
  });

  test("LOGIC-36 · the plain-words summary is the one a person can act on", () => {
    const says: [string, string][] = [
      ["FREQ=DAILY", "Every day"],
      ["FREQ=DAILY;INTERVAL=3", "Every 3 days"],
      ["FREQ=WEEKLY;INTERVAL=2", "Every 2 weeks"],
      ["FREQ=WEEKLY;BYDAY=MO,WE", "Weekly on Mon, Wed"],
      ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
      ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU", "Every day"],
      ["FREQ=MONTHLY;BYMONTHDAY=31", "Every month on day 31"],
      ["FREQ=MONTHLY;BYDAY=3TU", "Every month on the third Tue"],
      ["FREQ=MONTHLY;BYDAY=-1FR", "Every month on the last Fri"],
      ["FREQ=YEARLY", "Every year"],
      ["FREQ=DAILY;COUNT=3", "Every day · 3 left"],
    ];
    for (const [rule, sentence] of says) expect(describeRecurrence(rule), rule).toBe(sentence);
    expect(recurrenceLabel("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("Repeats weekly on Mon, Wed");
  });
});
