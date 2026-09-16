import { apiRequest } from "./client";
import type { CreateTaskRequest, TaskDto, TaskStatus, UpdateTaskRequest } from "./types";

export function createTask(request: CreateTaskRequest): Promise<TaskDto> {
  return apiRequest<TaskDto>("/tasks", { method: "POST", body: request });
}

export function getTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}`);
}

export function getTasks(status?: TaskStatus): Promise<TaskDto[]> {
  return apiRequest<TaskDto[]>("/tasks", { query: { status } });
}

/**
 * Marks the task completed, sends a celebration push, and (for focus-type tasks) updates streak +
 * weekly progress. What it earned comes back as pointsEarned — decided by the server, so nothing
 * is sent for it.
 */
export function completeTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}/complete`, { method: "POST" });
}

/** Partial update — name, taskType, and/or category (see UpdateTaskRequest for clearing it). */
export function updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}`, { method: "PATCH", body: request });
}

/** Undo a completion — see task-svc's TaskService.reopenTask for what is and isn't reversed. */
export function reopenTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}/reopen`, { method: "POST" });
}

export function deleteTask(taskId: string): Promise<void> {
  return apiRequest<void>(`/tasks/${taskId}`, { method: "DELETE" });
}
