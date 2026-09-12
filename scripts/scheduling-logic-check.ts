/**
 * Unit checks for the scheduling decisions — no server, no device, no network.
 *
 *   npx tsx scripts/scheduling-logic-check.ts
 *
 * These guard the two warnings that are the *only* defence against a notification that is
 * stored, looks healthy, and can never fire:
 *
 *   1. a lead time longer than the days remaining ("a week before" on something due tomorrow)
 *   2. a repeat shorter than its own lead time (a daily task can never satisfy a week's warning)
 *
 * Both live in the frontend, and until this file existed the whole app had no automated tests —
 * so an edit could have removed either warning and every suite in the repo would still have gone
 * green. That is the gap this closes.
 *
 * `notificationHealth` takes an explicit `now`, so every case below is a fixed, hand-checkable
 * date rather than something that changes meaning depending on when it runs.
 */
import {
  notificationHealth,
  outpacedByRepeat,
  countUnfireable,
  notificationVerdict,
  repeatCycleDays,
  fireDayOf,
  type NotifyHealth,
} from "../src/notifications/schedulingLogic";
import { defaultPattern, type RecurrencePattern } from "../src/utils/recurrence";

let passed = 0;
let failed = 0;

function check(what: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL  ${what}\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  console.log(`  ok    ${what}`);
}

/** Midday on 2026-09-09, so "earlier today" and "later today" are both unambiguous. */
const NOW = new Date(2026, 8, 9, 12, 0, 0);

function health(dateKey: string | null, daysBefore: number, time = "09:00:00"): NotifyHealth {
  return notificationHealth(dateKey, daysBefore, time, NOW);
}

console.log("\nScheduling logic — pure checks, no server\n");

/* ── 1. Lead time against the runway ─────────────────────────────────────────── */
console.log("1. A lead time has to fit in the days remaining");
check('due in 3 days, "1 week before" → dead', health("2026-09-12", 7), "before-today");
check('due tomorrow, "1 week before" → dead', health("2026-09-10", 7), "before-today");
check('due today, "1 week before" → dead', health("2026-09-09", 7), "before-today");
check('due in 6 days, "1 week before" → dead', health("2026-09-15", 7), "before-today");
// Exactly 7 days out lands the warning on today — alive only if the clock time hasn't passed.
check('due in 7 days at 6pm, "1 week before" → fires', health("2026-09-16", 7, "18:00:00"), "ok");
check('due in 7 days at 9am, "1 week before" → already passed', health("2026-09-16", 7, "09:00:00"), "passed-today");
check('due in 8 days, "1 week before" → fires', health("2026-09-17", 7), "ok");
check('due today, "1 day before" → dead', health("2026-09-09", 1), "before-today");
check('due in 2 days, "1 day before" → fires', health("2026-09-11", 1), "ok");

/* ── 2. The same-day clock boundary ──────────────────────────────────────────── */
console.log("\n2. On the day itself, the time decides");
check("today at 6pm → fires", health("2026-09-09", 0, "18:00:00"), "ok");
check("today at 9am (now 12pm) → already passed", health("2026-09-09", 0, "09:00:00"), "passed-today");
check("today at exactly now → treated as passed", health("2026-09-09", 0, "12:00:00"), "passed-today");

/* ── 3. Undated tasks ────────────────────────────────────────────────────────── */
console.log("\n3. An undated task fires daily and can't be stranded");
check("no date, on the day → fires", health(null, 0), "ok");
check("no date, even with an offset → fires", health(null, 7), "ok");

/* ── 4. Month and year boundaries ────────────────────────────────────────────── */
console.log("\n4. Counting back across a month boundary");
check("2026-09-03 minus 7 days", fireDayOf("2026-09-03", 7), "2026-08-27");
check("2027-01-02 minus 7 days", fireDayOf("2027-01-02", 7), "2026-12-26");
check("2028-03-01 minus 1 day (leap year)", fireDayOf("2028-03-01", 1), "2028-02-29");
check("no date has no fire day", fireDayOf(null, 7), null);

/* ── 5. The shortest gap in a repeat ─────────────────────────────────────────── */
console.log("\n5. A repeat's tightest gap is what a lead time must fit inside");
const weekly = (byDay: string[]): RecurrencePattern =>
  ({ ...defaultPattern("WEEKLY"), byDay: byDay as RecurrencePattern["byDay"] });

check("daily", repeatCycleDays(defaultPattern("DAILY")), 1);
check("every 3 days", repeatCycleDays({ ...defaultPattern("DAILY"), interval: 3 }), 3);
check("weekly", repeatCycleDays(defaultPattern("WEEKLY")), 7);
check("every 2 weeks", repeatCycleDays({ ...defaultPattern("WEEKLY"), interval: 2 }), 14);
check("Mon/Wed/Fri → 2", repeatCycleDays(weekly(["MO", "WE", "FR"])), 2);
check("weekdays → 1", repeatCycleDays(weekly(["MO", "TU", "WE", "TH", "FR"])), 1);
check("Sat/Sun wraps the week → 1", repeatCycleDays(weekly(["SA", "SU"])), 1);
check("Mon only → 7", repeatCycleDays(weekly(["MO"])), 7);
check("Mon/Fri → 3", repeatCycleDays(weekly(["MO", "FR"])), 3);
check("monthly → 28 (February)", repeatCycleDays(defaultPattern("MONTHLY")), 28);
check("yearly → 365", repeatCycleDays(defaultPattern("YEARLY")), 365);

/* ── 6. A warning the repeat outruns ─────────────────────────────────────────── */
console.log("\n6. A warning set further ahead than the repeat can never land");
check("daily + week-before → outpaced", outpacedByRepeat(7, defaultPattern("DAILY")), true);
check("every 3 days + week-before → outpaced", outpacedByRepeat(7, { ...defaultPattern("DAILY"), interval: 3 }), true);
check("Mon/Wed/Fri + week-before → outpaced", outpacedByRepeat(7, weekly(["MO", "WE", "FR"])), true);
check("every 2 weeks + week-before → fine", outpacedByRepeat(7, { ...defaultPattern("WEEKLY"), interval: 2 }), false);
check("monthly + week-before → fine", outpacedByRepeat(7, defaultPattern("MONTHLY")), false);
check("daily + day-of → fine (no lead time to outrun)", outpacedByRepeat(0, defaultPattern("DAILY")), false);
check("no repeat → never outpaced", outpacedByRepeat(7, null), false);

/* ── 7. Counting across a whole task ─────────────────────────────────────────── */
console.log("\n7. Counting every stranded notification, not just one");

// The set a real task carries, in the order the API returns them: lead time descending.
const threeNotifications = [
  { daysBefore: 7, reminderTime: "09:00:00" },
  { daysBefore: 1, reminderTime: "09:00:00" },
  { daysBefore: 0, reminderTime: "18:00:00" },
];

// This is the regression that matters. A caller once grouped these into a Map keyed by task,
// keeping only the last row — the day-of one, which is the *least* likely to be stranded — and
// so reported none of the two that were. Verified live against the real API before the fix.
check(
  "moved to today: both lead times counted, day-of still fine",
  countUnfireable(threeNotifications, "2026-09-09", NOW),
  2
);
check(
  "moved to today with an early day-of time: all three counted",
  countUnfireable(
    [...threeNotifications.slice(0, 2), { daysBefore: 0, reminderTime: "09:00:00" }],
    "2026-09-09",
    NOW
  ),
  3
);
check("still 20 days out: nothing stranded", countUnfireable(threeNotifications, "2026-09-29", NOW), 0);
check("a silent task has nothing to strand", countUnfireable([], "2026-09-09", NOW), 0);
check(
  "a day-carrying row with no time is silent, not broken",
  countUnfireable([{ daysBefore: 7, reminderTime: null }], "2026-09-09", NOW),
  0
);
check("an undated task can never strand a notification", countUnfireable(threeNotifications, null, NOW), 0);

/* ── 8. What to actually tell the user ───────────────────────────────────────── */
console.log("\n8. Only a permanent loss is worth warning about");

const verdict = (
  dateKey: string | null,
  daysBefore: number,
  time: string,
  repeat: RecurrencePattern | null
) => notificationVerdict(dateKey, daysBefore, time, repeat, NOW);

const daily = defaultPattern("DAILY");
const weeklyTWT = weekly(["TU", "WE", "TH"]);
const monthly = defaultPattern("MONTHLY");

// The bug this section exists for: a repeating task whose time has passed today was being
// reported as "it won't fire", in red, when the next occurrence fires perfectly well.
check(
  "repeating, time passed today → informational, not an error",
  verdict("2026-09-09", 0, "09:00:00", weeklyTWT),
  "not-this-time"
);
check(
  "one-off, time passed today → genuinely never fires",
  verdict("2026-09-09", 0, "09:00:00", null),
  "never"
);
check(
  "repeating monthly, lead time misses this occurrence only",
  verdict("2026-09-12", 7, "09:00:00", monthly),
  "not-this-time"
);
check(
  "daily + week-before, dated today → can never fire, ever",
  verdict("2026-09-09", 7, "09:00:00", daily),
  "never"
);
check(
  "daily + week-before, dated far out → fires once, then never",
  verdict("2026-09-29", 7, "09:00:00", daily),
  "only-this-time"
);
check("one-off with room → fires", verdict("2026-09-29", 7, "09:00:00", null), "ok");
check("repeating with room → fires", verdict("2026-10-29", 7, "09:00:00", monthly), "ok");
check("undated → always fine", verdict(null, 0, "09:00:00", null), "ok");
check(
  "later today, repeating → no complaint at all",
  verdict("2026-09-09", 0, "18:00:00", weeklyTWT),
  "ok"
);

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
