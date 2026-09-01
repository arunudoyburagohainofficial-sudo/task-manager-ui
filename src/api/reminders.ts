import { apiRequest } from "./client";
import type {
  CreateIntervalReminderRequest,
  IntervalReminderDto,
  NotificationResponse,
  ReminderDto,
  UpdateIntervalReminderRequest,
} from "./types";

/*
 * Creating, changing and removing a notification all happen through the task endpoints now
 * (tasksApi.updateTask with notifyTime / clearNotify) — a notification is a field on the
 * task, not a resource of its own. What's left here is reading them and acting on one that
 * has already fired.
 */

/**
 * Server ignores the created interval reminder's id in its response (fixed
 * `{success, message}` shape) — use getIntervalReminders (below) to find its id
 * afterward if you need to update/cancel it.
 */
export function createIntervalReminder(
  taskId: string,
  request: CreateIntervalReminderRequest
): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/tasks/${taskId}/interval-reminder`, {
    method: "POST",
    body: request,
  });
}

export function getIntervalReminders(): Promise<IntervalReminderDto[]> {
  return apiRequest<IntervalReminderDto[]>("/interval-reminders");
}

/** Partial update — window, nudge cadence, and/or active state. */
export function updateIntervalReminder(
  intervalReminderId: string,
  request: UpdateIntervalReminderRequest
): Promise<IntervalReminderDto> {
  return apiRequest<IntervalReminderDto>(`/interval-reminders/${intervalReminderId}`, {
    method: "PATCH",
    body: request,
  });
}

export function deleteIntervalReminder(intervalReminderId: string): Promise<void> {
  return apiRequest<void>(`/interval-reminders/${intervalReminderId}`, { method: "DELETE" });
}

export function getReminders(): Promise<ReminderDto[]> {
  return apiRequest<ReminderDto[]>("/reminders");
}

/** Keyed on the task — a notification isn't separately addressable any more. */
export function snoozeTaskReminder(
  taskId: string,
  minutes?: number
): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/tasks/${taskId}/snooze`, {
    method: "POST",
    query: { minutes },
  });
}

/**
 * The notification's "Done" action — completes the task and updates streak/weekly
 * progress the same way completeTask does, but unlike completeTask does NOT send a
 * celebration push or take a points param.
 */
export function markTaskDone(taskId: string): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/tasks/${taskId}/done`, { method: "POST" });
}

/** Stops nagging without completing the task. Silently no-ops if there were no reminders. */
export function stopReminders(taskId: string): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/tasks/${taskId}/reminders`, { method: "DELETE" });
}
