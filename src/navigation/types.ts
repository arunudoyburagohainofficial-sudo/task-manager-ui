import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Auth: undefined;
  PhoneSignIn: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  TaskDetail: { taskId: string };
  FocusSession: {
    sessionId: string;
    taskId: string;
    focusMode: "regular" | "pomodoro";
    totalCycles: number;
    /** Minutes per work block, chosen on Task Detail — a pomodoro cycle's length in that mode, the whole session's length in Regular mode. */
    sessionMinutes: number;
    dndEnabled: boolean;
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
   * Time of day to be notified, or null for silent. "HH:mm:ss".
   *
   * Held on the draft rather than sent separately: all three settings go out with the task
   * itself in one request now, so there's no longer a second call that can fail on its own
   * and leave a saved task whose schedule silently didn't apply.
   */
  notifyTime: string | null;
}
