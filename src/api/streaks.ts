import { apiRequest } from "./client";
import type { StreakDto } from "./types";

/** Read-only — a streak only ever changes as a side effect of completing a focus-type task. */
export function getStreak(): Promise<StreakDto> {
  return apiRequest<StreakDto>("/streaks");
}
