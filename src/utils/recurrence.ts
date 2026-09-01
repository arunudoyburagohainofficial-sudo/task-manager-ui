import type { RecurrenceRule, TaskDto } from "../api/types";

/**
 * Reading, writing and describing the recurrence rule, in one place.
 *
 * The stored value is an RRULE string (RFC 5545), and this module mirrors exactly the subset
 * `Recurrence.java` accepts — the two grammars have to agree, so any change here needs the
 * same change there. Screens deal in patterns and labels and never touch the string.
 *
 *   FREQ=DAILY   [;INTERVAL=n]                    [;COUNT=n | ;UNTIL=yyyymmdd]
 *   FREQ=WEEKLY  [;INTERVAL=n] [;BYDAY=MO,WE,FR]  [;COUNT=n | ;UNTIL=yyyymmdd]
 *   FREQ=MONTHLY [;INTERVAL=n] [;BYMONTHDAY=n | ;BYDAY=3TU]  [;COUNT=n | ;UNTIL=yyyymmdd]
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** Monday-first, matching RRULE's own order and the day picker's layout. */
export const WEEKDAYS: { code: Weekday; short: string; letter: string }[] = [
  { code: "MO", short: "Mon", letter: "M" },
  { code: "TU", short: "Tue", letter: "T" },
  { code: "WE", short: "Wed", letter: "W" },
  { code: "TH", short: "Thu", letter: "T" },
  { code: "FR", short: "Fri", letter: "F" },
  { code: "SA", short: "Sat", letter: "S" },
  { code: "SU", short: "Sun", letter: "S" },
];

/** A parsed rule. `null` fields mean "this form isn't in use", not "unset". */
export interface RecurrencePattern {
  freq: Frequency;
  /** 1 = every day/week/month. Always at least 1. */
  interval: number;
  /** Weekly only. Empty means "the weekday the series started on". */
  byDay: Weekday[];
  /** Monthly nth-weekday: week 1–4, or -1 for last. */
  nth: { week: number; day: Weekday } | null;
  /** Monthly by date: 1–31. */
  byMonthDay: number | null;
  /** Occurrences remaining, including the live one. */
  count: number | null;
  /** "YYYY-MM-DD" — the last date the series may land on. */
  until: string | null;
}

/** The starting point for a fresh selection — plain "every day", nothing else set. */
export function defaultPattern(freq: Frequency = "DAILY"): RecurrencePattern {
  return { freq, interval: 1, byDay: [], nth: null, byMonthDay: null, count: null, until: null };
}

const FREQUENCIES: Frequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const DAY_CODES = WEEKDAYS.map((d) => d.code);

/**
 * Parses a stored rule, or returns null if it's one this build can't represent.
 *
 * Null is not the same as "doesn't repeat" — a row could carry a rule written by a newer
 * version. Callers that need to tell those apart should also check `isRecurringTask`.
 */
export function parseRecurrence(rule: string | null | undefined): RecurrencePattern | null {
  if (!rule) return null;

  const pattern = defaultPattern();
  let sawFreq = false;

  for (const part of rule.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (!value) return null;

    switch (key) {
      case "FREQ": {
        if (!FREQUENCIES.includes(value as Frequency)) return null;
        pattern.freq = value as Frequency;
        sawFreq = true;
        break;
      }
      case "INTERVAL": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 366) return null;
        pattern.interval = n;
        break;
      }
      case "BYDAY": {
        // Two meanings depending on frequency: a weekday set, or one ordinal weekday (3TU).
        const ordinal = /^(-?\d)([A-Z]{2})$/.exec(value);
        if (ordinal) {
          const week = Number(ordinal[1]);
          const day = ordinal[2] as Weekday;
          if (!DAY_CODES.includes(day)) return null;
          if (!(week === -1 || (week >= 1 && week <= 4))) return null;
          pattern.nth = { week, day };
        } else {
          const days = value.split(",") as Weekday[];
          if (days.some((d) => !DAY_CODES.includes(d))) return null;
          // Re-sorted into week order so the picker always renders the same way.
          pattern.byDay = DAY_CODES.filter((d) => days.includes(d));
        }
        break;
      }
      case "BYMONTHDAY": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 31) return null;
        pattern.byMonthDay = n;
        break;
      }
      case "COUNT": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
        pattern.count = n;
        break;
      }
      case "UNTIL": {
        const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
        if (!m) return null;
        pattern.until = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
      default:
        return null; // unknown token refused rather than ignored, same as the server
    }
  }

  if (!sawFreq) return null;
  if (pattern.count != null && pattern.until != null) return null;
  if (pattern.freq === "WEEKLY" && pattern.byDay.length > 0 && pattern.interval !== 1) return null;
  if (pattern.freq !== "MONTHLY" && pattern.nth) return null;
  if (pattern.freq === "MONTHLY" && pattern.byDay.length > 0) return null;
  // Yearly takes its month and day from the task's own date — a day-set or day-of-month would
  // be a second, competing answer to the same question.
  if (pattern.freq === "YEARLY" && (pattern.byDay.length > 0 || pattern.byMonthDay != null)) return null;
  if (pattern.byMonthDay != null && pattern.nth) return null;

  return pattern;
}

/** Serialises a pattern in the same canonical field order the server uses. */
export function buildRecurrence(pattern: RecurrencePattern): RecurrenceRule {
  let rule = `FREQ=${pattern.freq}`;
  if (pattern.interval > 1) rule += `;INTERVAL=${pattern.interval}`;
  if (pattern.freq === "WEEKLY" && pattern.byDay.length > 0) {
    rule += `;BYDAY=${DAY_CODES.filter((d) => pattern.byDay.includes(d)).join(",")}`;
  }
  if (pattern.freq === "MONTHLY" && pattern.nth) {
    rule += `;BYDAY=${pattern.nth.week}${pattern.nth.day}`;
  }
  if (pattern.freq === "MONTHLY" && pattern.byMonthDay != null && !pattern.nth) {
    rule += `;BYMONTHDAY=${pattern.byMonthDay}`;
  }
  if (pattern.count != null) rule += `;COUNT=${pattern.count}`;
  if (pattern.until != null) rule += `;UNTIL=${pattern.until.replace(/-/g, "")}`;
  return rule;
}

const ORDINALS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

/** "Every 2 weeks on Mon, Wed" — the full sentence, for a row subtitle. */
export function describeRecurrence(rule: string | null | undefined): string | null {
  const p = parseRecurrence(rule);
  // Honest fallback rather than silence: the task genuinely repeats, this build just doesn't
  // have words for how often.
  if (!p) return rule != null ? "Repeats" : null;

  const unit =
    p.freq === "DAILY" ? "day" : p.freq === "WEEKLY" ? "week" : p.freq === "MONTHLY" ? "month" : "year";
  let text = p.interval === 1 ? `Every ${unit}` : `Every ${p.interval} ${unit}s`;

  if (p.freq === "WEEKLY" && p.byDay.length > 0) {
    const names = WEEKDAYS.filter((d) => p.byDay.includes(d.code)).map((d) => d.short);
    // "Every weekday" beats listing five days; a 7-day set is just "Every day".
    if (p.byDay.length === 7) text = "Every day";
    else if (p.byDay.length === 5 && !p.byDay.includes("SA") && !p.byDay.includes("SU")) text = "Every weekday";
    else text = `${p.interval === 1 ? "Weekly" : `Every ${p.interval} weeks`} on ${names.join(", ")}`;
  }
  if (p.freq === "MONTHLY" && p.nth) {
    const dayName = WEEKDAYS.find((d) => d.code === p.nth!.day)?.short ?? p.nth.day;
    text += ` on the ${ORDINALS[p.nth.week] ?? p.nth.week} ${dayName}`;
  } else if (p.freq === "MONTHLY" && p.byMonthDay != null) {
    text += ` on day ${p.byMonthDay}`;
  }

  if (p.count != null) text += ` · ${p.count} left`;
  if (p.until != null) text += ` · until ${p.until}`;
  return text;
}

/** The frequencies offered as top-level choices, in the order they're shown. */
export const RECURRENCE_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

/** True whenever the task repeats at all, including on a rule this build can't name. */
export function isRecurringTask(task: Pick<TaskDto, "recurrenceRule">): boolean {
  return task.recurrenceRule != null;
}

/** "Repeats every 2 weeks" — the row subtitle wording used on Scheduled and Task Detail. */
export function recurrenceLabel(rule: string | null | undefined): string | null {
  const described = describeRecurrence(rule);
  if (!described) return null;
  return described === "Repeats" ? "Repeats" : `Repeats ${described.charAt(0).toLowerCase()}${described.slice(1)}`;
}

/** "Every 2 weeks" — for a current-selection line, where "Repeats ..." would stutter. */
export function recurrenceShortLabel(rule: string | null | undefined): string | null {
  return describeRecurrence(rule);
}

/**
 * Narrows a stored rule to one of the three top-level frequencies.
 *
 * Kept because several screens only need "which of the three tabs is this" and shouldn't have
 * to care about intervals or day-sets.
 */
export function asKnownRule(rule: string | null | undefined): Frequency | null {
  return parseRecurrence(rule)?.freq ?? null;
}
