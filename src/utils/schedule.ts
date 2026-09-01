import type { TaskDto } from "../api/types";

/**
 * Single source of truth for which screen a task belongs on. Both screens derive their
 * lists from this rather than each filtering by hand, so the two can never disagree about
 * where a task lives and drop it from both — or show it twice.
 *
 * "today" is Home; "overdue" and "upcoming" both live on the Upcoming/Overdue tab, kept
 * as distinct buckets rather than one "scheduled" lump because that screen sections them
 * separately and Home's own boundary (see belongsOnHome) depends on the distinction.
 */
export type ScheduleBucket = "today" | "overdue" | "upcoming";

/**
 * "YYYY-MM-DD" from the device's *local* calendar day — never date.toISOString(), which
 * reads the UTC day and returns tomorrow's date for anyone west of UTC in the evening.
 * task-svc stores scheduled_for as a bare LocalDate with no timezone, so the client has
 * to derive its "today" the same wall-clock way for the two to agree.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Compared as strings on purpose: "YYYY-MM-DD" sorts lexicographically in true date
 * order, so this needs no Date parsing at all. Parsing would reintroduce the exact
 * timezone bug toDateKey exists to avoid — `new Date("2026-08-28")` is UTC midnight,
 * which is the 27th in every negative-offset timezone.
 *
 * Unscheduled (null) counts as "today", not upcoming: a task with no date is a backlog
 * item the user can act on right now, and filing it under a date it doesn't have would
 * strand it on a screen organised entirely by date.
 */
export function bucketFor(task: Pick<TaskDto, "scheduledFor">, today: string = todayKey()): ScheduleBucket {
  if (!task.scheduledFor) return "today";
  if (task.scheduledFor < today) return "overdue";
  if (task.scheduledFor > today) return "upcoming";
  return "today";
}

/**
 * Home shows unscheduled work, whatever is dated for today, and anything overdue — one-off
 * or repeating alike.
 *
 * Missed work used to be split: a repeating task that slipped stayed on Home (kept out of the
 * Overdue panel, deliberately, so a routine isn't listed twice — see RecurringRow), but a
 * one-off that slipped moved to the Overdue panel and off Home entirely. That meant a missed
 * dated reminder went both silent (a past notification never re-fires — see
 * localNotifications.ts) and out of sight, on the one screen most people actually look at
 * every day. A one-off task also stays listed in the Overdue panel — that's still the right
 * destination for acting on a backlog of missed items — this only stops it from disappearing
 * from Home in the meantime.
 */
export function belongsOnHome(
  task: Pick<TaskDto, "scheduledFor" | "recurrenceRule">,
  today: string = todayKey()
): boolean {
  const bucket = bucketFor(task, today);
  return bucket === "today" || bucket === "overdue";
}

/** True for a scheduled day already past — sectioned first on the Upcoming/Overdue tab. */
export function isOverdue(task: Pick<TaskDto, "scheduledFor">, today: string = todayKey()): boolean {
  return bucketFor(task, today) === "overdue";
}

/**
 * Groups upcoming tasks into dated sections, soonest first, for Upcoming's SectionList.
 * Sorting the keys as strings is safe for the same reason bucketFor's comparison is.
 */
export function groupByScheduledDate<T extends Pick<TaskDto, "scheduledFor">>(
  tasks: T[]
): { dateKey: string; tasks: T[] }[] {
  const byDate = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.scheduledFor) continue;
    const existing = byDate.get(task.scheduledFor);
    if (existing) existing.push(task);
    else byDate.set(task.scheduledFor, [task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, group]) => ({ dateKey, tasks: group }));
}

/**
 * "Tomorrow" / "Sat 29 Aug" / "12 Sep 2027" — relative wording only where it's genuinely
 * clearer than the date itself. Beyond a couple of days "in 5 days" is harder to act on
 * than a weekday name, and past the current year the year has to appear or the date is
 * ambiguous.
 */
export function formatScheduleDate(dateKey: string, today: string = todayKey()): string {
  if (dateKey === today) return "Today";
  if (dateKey === toDateKey(addDays(new Date(), 1))) return "Tomorrow";
  if (dateKey === toDateKey(addDays(new Date(), -1))) return "Yesterday";

  // "T00:00:00" keeps this parsed as local midnight rather than UTC — same reasoning as
  // toDateKey above, in the opposite direction.
  const date = new Date(`${dateKey}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: sameYear ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}
