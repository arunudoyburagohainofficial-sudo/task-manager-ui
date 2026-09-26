import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Auth: undefined;
  PhoneSignIn: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  TaskDetail: { taskId: string };
  ScheduledNotifications: undefined;
  BlockedApps: undefined;
  FocusSession: {
    sessionId: string;
    taskId: string;
    focusMode: "regular" | "pomodoro";
    totalCycles: number;
    /** Minutes per work block, chosen on Task Detail — a pomodoro cycle's length in that mode, the whole session's length in Regular mode. */
    sessionMinutes: number;
    dndEnabled: boolean;
    /**
     * When the session actually began, for one already running (resumed from Home's "Right now",
     * or after a 409). The countdown is anchored to it so reopening the screen continues the
     * session instead of starting its clock again. Absent when the session starts here.
     */
    startedAt?: string;
  };
  Completion: { taskId: string; taskName: string; durationSeconds: number; pointsEarned: number };
  Capture: undefined;
  ConfirmOrganize: { drafts: CapturedTaskDraft[] };
};

export type MainTabParamList = {
  Home: undefined;
  Scheduled: undefined;
  Progress: undefined;
  Settings: undefined;
};

/** Local-only shape for a task captured but not yet submitted to the API — see Capture flow. */
export interface CapturedTaskDraft {
  localId: string;
  name: string;
  taskType: "focus" | "reminder";
  /**
   * Set here so a routine can be created in one pass. Recurrence used to be reachable only
   * from Task Detail, which meant "add a daily habit" — the most common reason to repeat
   * anything — cost a save, a hunt for the task, and a second screen.
   */
  recurrenceRule: import("../api/types").RecurrenceRule | null;
  /**
   * Which longer-term goal this task counts toward, chosen at capture time. Only focus
   * tasks actually move a goal forward server-side, but the association is allowed on
   * either type — changing the type later shouldn't silently discard the choice.
   */
  goalId: string | null;
  /**
   * The day this task is planned for, chosen while organizing. "YYYY-MM-DD", or null for
   * no date — an ordinary choice, not a failure to decide.
   */
  scheduledFor: string | null;
  /**
   * Every notification the task will have — empty for silent. The same list the schedule sheet
   * edits, so what's chosen here is exactly what gets saved.
   *
   * Held on the draft rather than sent separately: all three settings go out with the task
   * itself in one request, so there's no second call that can fail on its own and leave a saved
   * task whose schedule silently didn't apply. It used to be a single time, which the sheet's
   * lead-time options didn't fit — only the first entry was kept, as a plain on-the-day time.
   */
  notifications: import("../api/types").NotificationSpec[];
}
