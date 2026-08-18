import type { TaskStatus } from "./types";

/**
 * Central key factory — every query/mutation in src/api/queries/ imports from here rather
 * than writing array literals inline, so a screen invalidating "the pending tasks list"
 * and a hook fetching "the pending tasks list" can't drift into two different keys by typo.
 */
export const queryKeys = {
  tasks: (status?: TaskStatus) => ["tasks", status ?? "all"] as const,
  task: (taskId: string) => ["task", taskId] as const,
  categories: () => ["categories"] as const,
  reminders: () => ["reminders"] as const,
  intervalReminders: () => ["intervalReminders"] as const,
  streak: () => ["streak"] as const,
  weeklyProgressCurrent: () => ["weeklyProgress", "current"] as const,
  weeklyProgressHistory: (weeks: number) => ["weeklyProgress", "history", weeks] as const,
  weeklyProgressAllTime: () => ["weeklyProgress", "allTime"] as const,
};
