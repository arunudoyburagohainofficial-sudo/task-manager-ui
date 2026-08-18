import { apiRequest } from "./client";
import type { AllTimeProgressDto, WeeklyProgressDto } from "./types";

/** Read-only — current ISO week (Monday start). */
export function getCurrentWeekProgress(): Promise<WeeklyProgressDto> {
  return apiRequest<WeeklyProgressDto>("/weekly-progress");
}

/** Most recent N weeks (default 4), newest first — powers the "This month" tab. */
export function getHistory(weeks = 4): Promise<WeeklyProgressDto[]> {
  return apiRequest<WeeklyProgressDto[]>("/weekly-progress/history", { query: { weeks } });
}

/** Summed across every week the user has a row for — powers the "All time" tab. */
export function getAllTimeStats(): Promise<AllTimeProgressDto> {
  return apiRequest<AllTimeProgressDto>("/weekly-progress/all-time");
}
