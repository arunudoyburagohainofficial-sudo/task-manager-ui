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

/** Marks the task completed, sends a celebration push, and (for focus-type tasks) updates streak + weekly progress. */
export function completeTask(taskId: string, points?: number): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}/complete`, {
    method: "POST",
    query: { points },
  });
}

/** Partial update — name, taskType, and/or category (see UpdateTaskRequest for clearing it). */
export function updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}`, { method: "PATCH", body: request });
}

export function deleteTask(taskId: string): Promise<void> {
  return apiRequest<void>(`/tasks/${taskId}`, { method: "DELETE" });
}
