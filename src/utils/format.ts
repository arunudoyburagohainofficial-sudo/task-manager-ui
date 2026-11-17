/** Formats a LocalTime string ("18:00:00") as "6 PM" / "6:30 PM", matching the mockups' clock-time style. */
/**
 * "6 PM" / "6:30 PM", or null when there's no time to show.
 *
 * Accepts null because a reminder may be silent — carrying a date with no notification time
 * (see ReminderDto.reminderTime). Handling that here keeps every caller from repeating the
 * same guard, and makes "no time" render as nothing rather than as "NaN PM".
 */
export function formatClockTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${displayHour} ${period}` : `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

/** True if the given ISO LocalDateTime string ("2026-08-01T09:14:00") falls on today's local date. */
export function isToday(isoDateTime: string): boolean {
  const date = new Date(isoDateTime);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * "Wednesday 26 August" — the line under Home's greeting, in the design's own order.
 *
 * Assembled from the locale's own names rather than handed to toLocaleDateString whole: that
 * puts the month first in some locales and adds a comma in others, so the one line this screen
 * is measured against would render differently depending on the phone's region.
 */
export function formatGreetingDate(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const day = date.toLocaleDateString(undefined, { day: "numeric" });
  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${weekday} ${day} ${month}`;
}

/**
 * "8:10 AM" from an instant — the time a finished task was finished.
 *
 * Built by hand for the same reason formatClockTime is: the design's clock is 12-hour with an
 * uppercase meridiem, which a locale-formatted time only sometimes is.
 */
export function formatInstantClock(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getHours();
  const minute = date.getMinutes();
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

/** "Jul 27" — used for weekly-progress-history rows. */
export function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "arunudoy BURAGOHAIN" -> "Arunudoy" — first word only, normalized to proper case regardless of source casing (Google profile names, typed-in display names, etc. arrive in whatever case the user set). */
export function formatFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function greetingForHour(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "25 min" from a minutes count; used for focus-session lengths and durations. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Start (midnight) of the current ISO week (Monday) — mirrors task-svc's WeeklyProgressService week boundary. */
export function startOfIsoWeek(date: Date = new Date()): Date {
  const result = new Date(date);
  const day = result.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function formatMMSS(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "added 3 weeks ago" — how long an undated task has been sitting there, once that is worth
 * saying.
 *
 * Undated tasks are the one kind nothing ages out. A null date is read as "today" on purpose,
 * because a captured thought is something you can act on right now; the catch is that "right
 * now" lasts for ever, and the list is ordered newest-first, so last month's debris sinks
 * quietly to the bottom where nobody looks. A row showed nothing at all under its title, which
 * made a six-week-old capture and this morning's identical.
 *
 * Null for the first few days, deliberately. Something captured this morning is not stale and
 * labelling it would be noise on every fresh row - the label has to mean something when it
 * appears, or it stops being read at all.
 *
 * Rounded down, and never more precise than the unit it is using: "3 weeks" rather than
 * "23 days", because nobody acts differently on 23 versus 24.
 */
export function formatAge(createdAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!createdAt) return null;
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return null;

  const days = Math.floor((now.getTime() - made) / 86_400_000);
  // Negative means a clock disagreement rather than a task from the future; say nothing.
  if (days < AGE_QUIET_DAYS) return null;
  if (days < 14) return `added ${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `added ${weeks} week${weeks === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  return `added ${months} month${months === 1 ? "" : "s"} ago`;
}

/** Below this an undated task is simply recent, and saying so would be noise on every row. */
export const AGE_QUIET_DAYS = 3;
