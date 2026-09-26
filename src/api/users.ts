import { apiRequest } from "./client";
import type { UpdateUserRequest, UserDto } from "./types";

/** The account as the server has it — a name or goal changed on another device included. */
export function getMe(): Promise<UserDto> {
  return apiRequest<UserDto>(`/users/me`);
}

export function updateWeeklyGoal(goal: number): Promise<UserDto> {
  return apiRequest<UserDto>(`/users/me/weekly-goal`, {
    method: "PATCH",
    query: { goal },
  });
}

/** Partial update — email/username/displayName. */
export function updateProfile(request: UpdateUserRequest): Promise<UserDto> {
  return apiRequest<UserDto>(`/users/me`, { method: "PATCH", body: request });
}

export function deleteUser(): Promise<void> {
  return apiRequest<void>(`/users/me`, { method: "DELETE" });
}
