import { apiRequest } from "./client";
import type {
  CreateIntervalReminderRequest,
  CreateReminderRequest,
  IntervalReminderDto,
  NotificationResponse,
  ReminderDto,
  UpdateIntervalReminderRequest,
  UpdateReminderRequest,
} from "./types";

/** One reminder per task max — server returns 409 if the task already has one. */
export function createReminder(
  taskId: string,
  request: CreateReminderRequest
): Promise<ReminderDto> {
  return apiRequest<ReminderDto>(`/tasks/${taskId}/reminder`, {
    method: "POST",
    body: request,
  });
}

/**
 * Reschedules an existing reminder — createReminder 409s on any existing row for the
 * task (even a stopped one, since stopReminders only sets isActive false), so this is the
 * only way to change a reminder's time once set.
 */
export function updateReminder(
  reminderId: string,
  request: UpdateReminderRequest
): Promise<ReminderDto> {
  return apiRequest<ReminderDto>(`/reminders/${reminderId}`, {
    method: "PATCH",
    body: request,
  });
}

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

export function snoozeReminder(
  reminderId: string,
  minutes?: number
): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/reminders/${reminderId}/snooze`, {
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

/**
 * Hard-deletes a single reminder — unlike stopReminders (soft, leaves the row so
 * createReminder keeps 409ing), this actually removes it and frees the task up for a
 * brand new reminder.
 */
export function deleteReminder(reminderId: string): Promise<void> {
  return apiRequest<void>(`/reminders/${reminderId}`, { method: "DELETE" });
}
