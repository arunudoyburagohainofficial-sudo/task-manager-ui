/** Formats a LocalTime string ("18:00:00") as "6 PM" / "6:30 PM", matching the mockups' clock-time style. */
export function formatClockTime(time: string): string {
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

export function formatGreetingDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
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
