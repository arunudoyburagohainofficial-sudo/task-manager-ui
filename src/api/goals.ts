import { apiRequest } from "./client";
import type { CreateGoalRequest, GoalDto, UpdateGoalRequest } from "./types";

export function createGoal(request: CreateGoalRequest): Promise<GoalDto> {
  return apiRequest<GoalDto>("/goals", { method: "POST", body: request });
}

export function getGoals(): Promise<GoalDto[]> {
  return apiRequest<GoalDto[]>("/goals");
}

export function getGoal(goalId: string): Promise<GoalDto> {
  return apiRequest<GoalDto>(`/goals/${goalId}`);
}

/** Partial update — only send the fields you're changing. */
export function updateGoal(goalId: string, request: UpdateGoalRequest): Promise<GoalDto> {
  return apiRequest<GoalDto>(`/goals/${goalId}`, { method: "PATCH", body: request });
}

/** Tasks logged against this goal keep existing (goalId: null) — they're not deleted with it. */
export function deleteGoal(goalId: string): Promise<void> {
  return apiRequest<void>(`/goals/${goalId}`, { method: "DELETE" });
}
