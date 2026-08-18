import type { NavigatorScreenParams } from "@react-navigation/native";
import type { CreateReminderRequest } from "../api/types";

export type RootStackParamList = {
  Auth: undefined;
  PhoneSignIn: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  TaskDetail: { taskId: string };
  FocusSession: { sessionId: string; taskId: string; focusMode: "regular" | "pomodoro"; totalCycles: number; dndEnabled: boolean };
  Completion: { taskId: string; taskName: string; durationSeconds: number; pointsEarned: number };
  Capture: undefined;
  ConfirmOrganize: { drafts: CapturedTaskDraft[] };
  Categories: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Progress: undefined;
  Settings: undefined;
};

/** Local-only shape for a task captured but not yet submitted to the API — see Capture flow. */
export interface CapturedTaskDraft {
  localId: string;
  name: string;
  taskType: "focus" | "reminder";
  categoryId: string | null;
  /**
   * Chosen while organizing, but not sent anywhere until the task itself exists — reminders
   * are created against a real taskId, which a draft doesn't have yet. Held here so the
   * whole decision can be made in one pass at capture time rather than forcing a second
   * trip into Task Detail afterwards. Applies to focus tasks too, not just reminder-type
   * ones: Task Detail has always offered reminders for both.
   */
  reminder: CreateReminderRequest | null;
}
