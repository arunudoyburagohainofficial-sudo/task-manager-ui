import type { Page } from "@playwright/test";
import type {
  CreateTaskRequest,
  FocusSessionDto,
  GoalDto,
  IntervalReminderDto,
  ReminderDto,
  StreakDto,
  TaskDto,
  TodayProgressDto,
  UpdateTaskRequest,
  WeeklyProgressDto,
} from "../../src/api/types";

/**
 * Setting a test's state through the API rather than by clicking through the UI.
 *
 * Clicking is how a fixture becomes slow, and how one broken screen fails fifty tests that
 * weren't about it. The token comes from the Web SDK's own store, so these calls are made as
 * the signed-in user, with the same timezone header the app sends.
 *
 * The request types are the app's own (`src/api/types.ts`), so a seeded task is exactly what the
 * app could have built — the compiler refuses a field the app doesn't know about.
 */
export const API = "http://localhost:8080/api";

/** The zone every app test runs in — matches `timezoneId` in playwright.config.ts. */
export const ZONE = "Asia/Kolkata";

export async function tokenFor(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("firebaseLocalStorageDb");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const request = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = rows.find((r) => r.value?.stsTokenManager);
    if (!row) throw new Error("no signed-in user — openApp() first");
    return row.value.stsTokenManager.accessToken as string;
  });
}

/** The Firebase uid inside a token — how SQL finds this test's user row. */
export function uidOf(token: string): string {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).user_id;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string
  ) {
    super(`${method} ${path} → ${status} ${body}`);
  }
}

async function call<T = any>(
  token: string,
  zone: string,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const qs = Object.entries(init.query ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const method = init.method ?? "GET";
  const res = await fetch(API + path + (qs ? `?${qs}` : ""), {
    method,
    headers: { Authorization: `Bearer ${token}`, "X-Timezone": zone, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, method, path, text);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A task as a test writes it: only the name is required, and it defaults to a focus task. */
export type SeedTask = Partial<CreateTaskRequest> & { name: string };

export function api(token: string, zone: string = ZONE) {
  const c = <T = any>(path: string, init?: Parameters<typeof call>[3]) => call<T>(token, zone, path, init);

  const self = {
    /** Same account, a different device zone — for the timezone tests. */
    inZone: (other: string) => api(token, other),

    task: (task: SeedTask) => c<TaskDto>("/tasks", { method: "POST", body: { taskType: "focus", ...task } }),
    getTask: (id: string) => c<TaskDto>(`/tasks/${id}`),
    tasks: (status: "pending" | "completed") => c<TaskDto[]>("/tasks", { query: { status } }),
    update: (id: string, patch: UpdateTaskRequest) => c<TaskDto>(`/tasks/${id}`, { method: "PATCH", body: patch }),
    complete: (id: string) => c<TaskDto>(`/tasks/${id}/complete`, { method: "POST" }),
    reopen: (id: string) => c<TaskDto>(`/tasks/${id}/reopen`, { method: "POST" }),
    remove: (id: string) => c<void>(`/tasks/${id}`, { method: "DELETE" }),

    reminders: () => c<ReminderDto[]>("/reminders"),
    snooze: (taskId: string, minutes: number) => c(`/tasks/${taskId}/snooze`, { method: "POST", query: { minutes } }),
    intervals: () => c<IntervalReminderDto[]>("/interval-reminders"),
    nudgeWindow: (taskId: string, startTime: string, endTime: string, intervalMinutes = 30) =>
      c(`/tasks/${taskId}/interval-reminder`, { method: "POST", body: { startTime, endTime, intervalMinutes } }),

    goal: (name: string, targetDays = 20, color = "#8DA6CC") =>
      c<GoalDto>("/goals", { method: "POST", body: { name, targetDays, color } }),
    goals: () => c<GoalDto[]>("/goals"),
    updateGoal: (id: string, patch: { name?: string; color?: string; targetDays?: number }) =>
      c<GoalDto>(`/goals/${id}`, { method: "PATCH", body: patch }),
    removeGoal: (id: string) => c<void>(`/goals/${id}`, { method: "DELETE" }),

    currentSession: async () => (await c<FocusSessionDto | undefined>("/focus-sessions/current")) ?? null,
    startSession: (taskId: string, body: { plannedMinutes?: number; focusMode?: "regular" | "pomodoro"; numPomodoroCycles?: number } = {}) =>
      c<FocusSessionDto>(`/tasks/${taskId}/focus-sessions`, { method: "POST", body }),
    completeSession: (id: string, body: { wasInterrupted?: boolean; numPomodoroCycles?: number } = {}) =>
      c<FocusSessionDto>(`/focus-sessions/${id}/complete`, { method: "POST", body }),
    discardSession: (id: string) => c<void>(`/focus-sessions/${id}`, { method: "DELETE" }),

    today: () => c<TodayProgressDto>("/progress/today"),
    streak: () => c<StreakDto>("/streaks"),
    weekly: () => c<WeeklyProgressDto>("/weekly-progress"),
    allTime: () => c("/weekly-progress/all-time"),
    setWeeklyGoal: (goal: number) => c("/users/me/weekly-goal", { method: "PATCH", query: { goal } }),
    updateMe: (patch: { displayName?: string; username?: string }) => c("/users/me", { method: "PATCH", body: patch }),

    /**
     * Leaves the account empty — tasks (with their reminders and nudges), goals, and any open
     * session. A test can then assert on the whole screen rather than around leftovers.
     *
     * The open session goes first: the server allows one per user, so a session left by a failed
     * test would otherwise make the next test's Start open *that* session instead.
     */
    clear: async () => {
      const open = await self.currentSession();
      if (open) await self.discardSession(open.id).catch(() => undefined);
      for (const status of ["pending", "completed"] as const) {
        for (const task of await self.tasks(status)) await self.remove(task.id).catch(() => undefined);
      }
      for (const goal of await self.goals()) await self.removeGoal(goal.id).catch(() => undefined);
    },
  };
  return self;
}

export type Api = ReturnType<typeof api>;
