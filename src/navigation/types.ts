import type { NavigatorScreenParams } from "@react-navigation/native";
import type { CreateReminderRequest } from "../api/types";

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
   * Which longer-term goal this task counts toward, chosen at capture time. Only focus
   * tasks actually move a goal forward server-side, but the association is allowed on
   * either type — changing the type later shouldn't silently discard the choice.
   */
  goalId: string | null;
  /**
   * Chosen while organizing, but not sent anywhere until the task itself exists — reminders
   * are created against a real taskId, which a draft doesn't have yet. Held here so the
   * whole decision can be made in one pass at capture time rather than forcing a second
   * trip into Task Detail afterwards. Applies to focus tasks too, not just reminder-type
   * ones: Task Detail has always offered reminders for both.
   */
  reminder: CreateReminderRequest | null;
}
