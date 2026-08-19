// Mirrors task-svc's DTOs (src/main/java/com/hybridtask/dto/**).
// Ids are UUIDs — strings over the wire, never numbers.
// Request types carry no userId: the server derives the caller's identity from the
// Bearer token (see RequestAuthorization.currentUserId), so it cannot be spoofed by a
// client sending someone else's id.
// Date/time fields are ISO-8601 strings as serialized by Jackson (write-dates-as-timestamps: false):
//   LocalDate -> "2026-08-01", LocalTime -> "18:00:00", LocalDateTime -> "2026-08-01T18:00:00".

export type TaskType = "focus" | "reminder";
export type TaskStatus = "pending" | "completed" | "archived";
export type FocusMode = "regular" | "pomodoro";

export interface UserDto {
  id: string;
  /** Set for accounts created via Google sign-in — null for phone-only accounts. */
  email: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  weeklyGoal: number;
  /** Set for accounts created via phone sign-in — null for Google-only accounts. */
  phoneNumber: string | null;
}

/**
 * Establishes a session from any completed Firebase sign-in (phone via firebaseAuth.ts,
 * Google via firebaseWebAuth.ts) — idToken is what that SDK returns once sign-in
 * finishes on-device; the backend verifies it and reads identity (uid, phone number,
 * email) from the token itself, never from this request body. username/displayName are
 * only used the first time this account is seen (phone sign-in has no user-chosen
 * username, so this fills it in; Google sign-in doesn't need it — the backend falls back
 * to Google's own profile name) — ignored on every later call once the account exists.
 */
export interface FirebaseAuthRequest {
  idToken: string;
  username?: string;
  displayName?: string;
}

/** Partial update — only send the fields you're changing. */
export interface UpdateUserRequest {
  email?: string;
  username?: string;
  displayName?: string;
}

export interface CategoryDto {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  color?: string;
  icon?: string;
}

/** Partial update — only send the fields you're changing. */
export interface UpdateCategoryRequest {
  name?: string;
  color?: string;
  icon?: string;
}

export interface TaskDto {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  taskType: TaskType;
  status: TaskStatus;
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateTaskRequest {
  categoryId?: string;
  name: string;
  description?: string;
  taskType: TaskType;
}

/**
 * Partial update — only send the fields you're changing. categoryId sets a specific
 * category; pass clearCategory: true to unset it back to Uncategorized (a plain
 * categoryId of undefined is ambiguous between "don't touch this" and "clear it").
 */
export interface UpdateTaskRequest {
  name?: string;
  taskType?: TaskType;
  categoryId?: string;
  clearCategory?: boolean;
}

export interface ReminderDto {
  id: string;
  taskId: string;
  reminderTime: string;
  reminderDate: string | null;
  /** Whether the device should still schedule this — false once stopped/completed. */
  isActive: boolean;
  isSnoozed: boolean;
}

/**
 * Exactly one of (reminderTime[, reminderDate]) or remindInMinutes must be set —
 * "remind me at a clock time" vs. "remind me N minutes from now". Combining them,
 * or setting neither, is a 400 from the server.
 */
export type CreateReminderRequest =
  | { reminderTime: string; reminderDate?: string; remindInMinutes?: never }
  | { remindInMinutes: number; reminderTime?: never; reminderDate?: never };

/** Reschedules an existing reminder — same shape/rule as CreateReminderRequest. */
export type UpdateReminderRequest = CreateReminderRequest;

export interface CreateIntervalReminderRequest {
  startTime: string;
  endTime: string;
  /** Defaults to 30 server-side when omitted. */
  intervalMinutes?: number;
}

export interface IntervalReminderDto {
  id: string;
  taskId: string;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  isActive: boolean;
}

/** Partial update — only send the fields you're changing. */
export interface UpdateIntervalReminderRequest {
  startTime?: string;
  endTime?: string;
  intervalMinutes?: number;
  isActive?: boolean;
}

export interface NotificationResponse {
  success: boolean;
  message: string;
}

export interface FocusSessionDto {
  id: string;
  taskId: string;
  durationSeconds: number | null;
  focusMode: FocusMode;
  numPomodoroCycles: number | null;
  pointsEarned: number | null;
  startedAt: string;
  completedAt: string | null;
  wasInterrupted: boolean | null;
}

export interface StartFocusSessionRequest {
  /** Defaults to "regular" server-side when omitted. */
  focusMode?: FocusMode;
}

export interface CompleteFocusSessionRequest {
  /** Defaults to false server-side when omitted. */
  wasInterrupted?: boolean;
  numPomodoroCycles?: number;
}

export interface StreakDto {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodUsed: boolean;
}

export interface WeeklyProgressDto {
  weekStartDate: string;
  tasksCompleted: number;
  weeklyGoal: number;
  totalFocusTimeMinutes: number;
}

/** Summed across every week the user has a row for — only focus-type completions count. */
export interface AllTimeProgressDto {
  totalTasksCompleted: number;
  totalFocusTimeMinutes: number;
  weeksTracked: number;
}
