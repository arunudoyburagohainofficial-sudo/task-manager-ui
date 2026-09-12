import type { IntervalReminderDto } from "../api/types";
import { WEEKDAYS, type RecurrencePattern } from "../utils/recurrence";

/**
 * The pure arithmetic behind local notification scheduling — which instants a reminder or
 * interval nudge fires at, and which of those survive the pending-notification budget.
 *
 * Deliberately free of every device API (no `expo-notifications`, no `react-native`): this
 * is the part of scheduling that's just dates and numbers, and keeping it that way is what
 * lets it be driven directly and verified against real inputs — see
 * MD/notification-placement-audit.md — instead of only being reachable through a live
 * device. `localNotifications.ts` is the thin, side-effecting shell around this: it calls
 * these functions and then actually talks to the OS.
 */

/**
 * iOS hard limit is 64 pending local notifications app-wide; stay under it so we never
 * silently lose the tail of the queue. See allocateFairly for how the budget is spent.
 */
export const MAX_PENDING = 50;

/** How far ahead repeating interval reminders are materialised. */
export const INTERVAL_HORIZON_HOURS = 24;

/**
 * How many days of a repeating daily reminder are queued at once. Previously only the very
 * next one was, which meant a daily reminder stopped firing entirely if the app wasn't
 * opened between two firings — nothing re-arms it except a foreground (see useReminderSync).
 * A week of headroom means the app has to go unopened for seven days before that happens.
 */
export const DAILY_HORIZON_DAYS = 7;

/**
 * Every upcoming firing time for a single reminder, soonest first.
 *
 * A dated reminder yields at most one; a daily one (no date) yields DAILY_HORIZON_DAYS of
 * them. Built by copying the first slot and stepping the *date* rather than adding 24h of
 * milliseconds, so a daily 9am reminder stays 9am across a DST change instead of drifting
 * to 8am or 10am.
 */
export function reminderOccurrences(
  time: string | null,
  date: string | null,
  snoozedUntil?: string | null,
  daysBefore: number = 0
): Date[] {
  // A reminder with a date but no time is deliberately silent: it exists to carry the task's
  // day, not to interrupt anyone. Nothing to schedule, so it produces no firing times at all.
  if (!time) return [];

  const [hours, minutes] = time.split(":").map(Number);

  /**
   * A live snooze replaces the reminder's own schedule until it expires.
   *
   * Previously this function never saw `snoozedUntil` at all, so snoozing wrote a value the
   * server stored and the device then completely ignored — the notification came back at
   * its original time regardless, which is the one thing a snooze must not do.
   */
  if (snoozedUntil) {
    const until = new Date(snoozedUntil);
    if (until.getTime() > Date.now()) return [until];
  }

  if (date) {
    const at = new Date(`${date}T${time}`);
    // Offsets are subtracted here rather than stored as dates, so "a week before" follows the
    // task automatically when its day moves — see V018. setDate handles month and year
    // boundaries, and DST is unaffected because the clock time is re-applied by the string.
    if (daysBefore > 0) at.setDate(at.getDate() - daysBefore);
    // A one-off in the past never fires again. That covers a lead-time notification whose
    // offset lands before today — a task created two days out with a week-before warning
    // simply doesn't get that one, rather than firing it late.
    return at.getTime() > Date.now() ? [at] : [];
  }

  // No date means "every day at this time" — start at today's slot, or tomorrow's if it passed.
  const first = new Date();
  first.setHours(hours, minutes, 0, 0);
  if (first.getTime() <= Date.now()) first.setDate(first.getDate() + 1);

  const occurrences: Date[] = [];
  for (let dayOffset = 0; dayOffset < DAILY_HORIZON_DAYS; dayOffset++) {
    const at = new Date(first);
    at.setDate(at.getDate() + dayOffset);
    occurrences.push(at);
  }
  return occurrences;
}

/* ────────────────────────── Can this notification ever fire? ──────────────────────────
 *
 * A notification is stored as a time plus a lead time in days. Both of the ways it can end
 * up in the past are silent — the device simply schedules nothing — so anything that changes
 * a task's date or its repeat needs to be able to ask this question.
 *
 * It lives here, beside the code that decides firing times, rather than inside the schedule
 * sheet where it started. It was local to that component, which is exactly why moving a task's
 * date from anywhere else (see ScheduledScreen's "move all to today") could strand a
 * notification with nothing to notice.
 */

export type NotifyHealth =
  /** Will fire. */
  | "ok"
  /** Right day, but the clock time is behind us — only possible when it lands today. */
  | "passed-today"
  /** The day itself is gone: the lead time is longer than the runway. No time can rescue it. */
  | "before-today";

/** "YYYY-MM-DD" for a Date, from its *local* calendar day. */
function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The day a notification actually lands on — the task's day, less its lead time — as
 * "YYYY-MM-DD". Null for an undated task, which has no day to count back from.
 */
export function fireDayOf(taskDateKey: string | null, daysBefore: number): string | null {
  if (!taskDateKey) return null;
  const [y, m, d] = taskDateKey.split("-").map(Number);
  const fires = new Date(y, m - 1, d);
  fires.setDate(fires.getDate() - daysBefore);
  return dateKeyOf(fires);
}

/**
 * Whether one notification can still fire, and if not, which way it failed.
 *
 * An undated task is always "ok": it means "every day until it's done", so there is always a
 * next slot and it can't be stranded the way a dated one can.
 */
export function notificationHealth(
  taskDateKey: string | null,
  daysBefore: number,
  time: string,
  now: Date = new Date()
): NotifyHealth {
  if (!taskDateKey) return "ok";

  const fireDay = fireDayOf(taskDateKey, daysBefore)!;
  const todayKey = dateKeyOf(now);
  // "YYYY-MM-DD" sorts lexicographically in true date order, so this needs no parsing —
  // and parsing would reintroduce the UTC-vs-local bug the string form exists to avoid.
  if (fireDay < todayKey) return "before-today";
  if (fireDay > todayKey) return "ok";

  const [h, m] = time.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at.getTime() <= now.getTime() ? "passed-today" : "ok";
}

/**
 * Shortest gap, in days, between two consecutive occurrences of a repeat.
 *
 * Shortest rather than average because a lead time has to fit inside the *tightest* gap to
 * survive every cycle: a Mon/Wed/Fri task is two days apart at its narrowest, so a warning set
 * further ahead than that is already in the past by the time the occurrence exists.
 */
export function repeatCycleDays(p: RecurrencePattern): number {
  switch (p.freq) {
    case "DAILY":
      return p.interval;
    case "WEEKLY": {
      if (p.byDay.length === 0) return 7 * p.interval;
      const picked = WEEKDAYS.map((d, i) => (p.byDay.includes(d.code) ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      if (picked.length < 2) return 7;
      // Includes the wrap from the last selected day back round to the first.
      let smallest = 7 - picked[picked.length - 1] + picked[0];
      for (let i = 1; i < picked.length; i++) smallest = Math.min(smallest, picked[i] - picked[i - 1]);
      return smallest;
    }
    case "MONTHLY":
      return 28 * p.interval; // February — the shortest a month can be
    case "YEARLY":
      return 365 * p.interval;
  }
}

/**
 * True when a lead time can never survive a repeat, however healthy the occurrence in front of
 * you looks. A daily task's next copy is always one day away, so a week's warning lands six days
 * before it exists — dead on every occurrence, forever.
 */
export function outpacedByRepeat(daysBefore: number, repeat: RecurrencePattern | null): boolean {
  return repeat != null && daysBefore > 0 && daysBefore >= repeatCycleDays(repeat);
}

export type NotifyVerdict =
  /** Fires, now and on every future occurrence. */
  | "ok"
  /** Can never fire — the user has permanently lost something and should be told. */
  | "never"
  /** Misses the occurrence in front of it, then works. Information, not a problem. */
  | "not-this-time"
  /** Fires this once, then never again, because the repeat outruns the lead time. */
  | "only-this-time";

/**
 * What a notification will actually do, taking the repeat into account.
 *
 * `notificationHealth` answers a narrower question — can *this* occurrence's notification fire —
 * and on its own that misleads on a repeating task. A weekly task whose 9am has already passed
 * today is completely fine: the next occurrence fires normally. Reporting that as "it won't
 * fire" is crying wolf, and a warning users learn to ignore is worse than no warning at all.
 *
 * So the distinction that matters isn't "is it dead", it's **"is anything permanently lost"**:
 *
 *   never          nothing follows that can rescue it            → warn
 *   only-this-time works once, then the repeat outruns it        → warn
 *   not-this-time  the next occurrence fixes it by itself        → say so quietly, or not at all
 */
export function notificationVerdict(
  taskDateKey: string | null,
  daysBefore: number,
  time: string,
  repeat: RecurrencePattern | null,
  now: Date = new Date()
): NotifyVerdict {
  const outpaced = outpacedByRepeat(daysBefore, repeat);

  if (notificationHealth(taskDateKey, daysBefore, time, now) === "ok") {
    return outpaced ? "only-this-time" : "ok";
  }
  // This occurrence can't fire. Whether that matters depends entirely on what comes after it.
  if (repeat == null) return "never";
  return outpaced ? "never" : "not-this-time";
}

/** The shape of a stored notification, as both the reminder rows and the sheet's specs supply it. */
type NotificationLike = { daysBefore?: number | null; reminderTime?: string | null; time?: string | null };

/**
 * How many of a task's notifications could not fire if its day were `taskDateKey`.
 *
 * Takes the whole set on purpose. Anything moving a task's date has to reason about *every*
 * notification on it, and the first attempt at this counted only one — a caller had grouped
 * reminders into a `Map<taskId, row>`, which silently keeps the last row per task while a task
 * may carry three. Rows arrive ordered by lead time descending, so the survivor was the day-of
 * one, the least likely to be stranded: a bulk move could kill two lead-time reminders and
 * report none. Counting here, once, is what stops the next caller repeating that.
 */
export function countUnfireable(
  notifications: NotificationLike[],
  taskDateKey: string | null,
  now: Date = new Date()
): number {
  return notifications.filter((n) => {
    const time = n.reminderTime ?? n.time;
    // A notification with no time is deliberately silent — it carries a day, not an alarm —
    // so it isn't something that failed to fire.
    if (!time) return false;
    return notificationHealth(taskDateKey, n.daysBefore ?? 0, time, now) !== "ok";
  }).length;
}

/** Every firing time for an interval reminder within the horizon, soonest first. */
export function intervalOccurrences(interval: IntervalReminderDto): Date[] {
  const [startHour, startMinute] = interval.startTime.split(":").map(Number);
  const [endHour, endMinute] = interval.endTime.split(":").map(Number);
  const stepMinutes = interval.intervalMinutes > 0 ? interval.intervalMinutes : 30;

  const occurrences: Date[] = [];
  const horizon = Date.now() + INTERVAL_HORIZON_HOURS * 60 * 60 * 1000;

  // Walk today's window, then tomorrow's, until the horizon is reached.
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const cursor = new Date();
    cursor.setDate(cursor.getDate() + dayOffset);
    cursor.setHours(startHour, startMinute, 0, 0);

    const windowEnd = new Date(cursor);
    windowEnd.setHours(endHour, endMinute, 0, 0);
    // An end time at or before the start means the window crosses midnight ("22:00 to
    // 02:00"). Without this the loop below never runs and such a reminder silently
    // produces nothing at all.
    if (windowEnd <= cursor) windowEnd.setDate(windowEnd.getDate() + 1);

    while (cursor <= windowEnd) {
      const at = cursor.getTime();
      if (at > Date.now() && at <= horizon) occurrences.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
    }
  }
  return occurrences;
}

export type Scheduled = { at: Date; title: string; body: string; taskId: string; reminderId?: string };

/**
 * The notification body, which has to say *when* the task is actually due when the
 * notification is firing ahead of time.
 *
 * Without this a week-before warning and the day-of nudge are word-for-word identical, so the
 * early one reads as "this is due now" and the user either acts a week early or learns to
 * ignore both.
 */
export function leadIn(daysBefore: number, name: string | undefined, focus: boolean): string {
  const task = name ?? (focus ? "your task" : "Your task");
  if (daysBefore <= 0) return focus ? `You planned to work on: ${task}` : task;
  if (daysBefore === 1) return `${task} — due tomorrow`;
  if (daysBefore === 7) return `${task} — due in a week`;
  return `${task} — due in ${daysBefore} days`;
}

/**
 * Picks which occurrences fit inside a pending-notification budget, fairly, by taking one
 * from every source before taking a second from any of them.
 *
 * A plain "sort everything by time, truncate" is what a single busy source needs to starve
 * every other one: an interval reminder nudging every 15 minutes from 9am to 9pm generates
 * ~49 occurrences, all sooner than tomorrow morning's daily reminders, so it would consume
 * the entire budget and silently drop every other task's reminder. Round-robin guarantees
 * each source's *next* firing is scheduled before any source's second one — so no task
 * ever goes completely silent because another task is noisy.
 *
 * `groups` must each already be sorted soonest-first.
 */
export function allocateFairly(groups: Scheduled[][], budget: number): Scheduled[] {
  const picked: Scheduled[] = [];
  const deepest = groups.reduce((max, group) => Math.max(max, group.length), 0);

  for (let round = 0; round < deepest && picked.length < budget; round++) {
    for (const group of groups) {
      if (round >= group.length) continue;
      picked.push(group[round]);
      if (picked.length >= budget) break;
    }
  }
  return picked;
}
