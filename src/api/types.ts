// Mirrors task-svc's DTOs (src/main/java/com/hybridtask/dto/**).
// Ids are UUIDs — strings over the wire, never numbers.
// Request types carry no userId: the server derives the caller's identity from the
// Bearer token (see RequestAuthorization.currentUserId), so it cannot be spoofed by a
// client sending someone else's id.
// Date/time fields are ISO-8601 strings as serialized by Jackson (write-dates-as-timestamps: false):
//   LocalDate -> "2026-08-01", LocalTime -> "18:00:00", LocalDateTime -> "2026-08-01T18:00:00".

export type TaskType = "focus" | "reminder";
/**
 * The two statuses a task can actually reach. The entity's own status column comment
 * ('pending', 'completed', 'archived') still names a third — no code anywhere ever writes it,
 * so it was dropped here rather than left implying an archive feature that doesn't exist.
 */
export type TaskStatus = "pending" | "completed";
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
/**
 * No email or phoneNumber: both are Firebase-owned identity, and the server's
 * UpdateUserRequest doesn't accept them either — changing one needs a real
 * re-verification flow, not a profile PATCH.
 */
export interface UpdateUserRequest {
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

/** A goal's lifecycle — entirely derived server-side from totalDaysActive vs targetDays. */
export type GoalStatus = "active" | "completed";

/**
 * A longer-horizon thing you're working toward, that focus tasks get logged against.
 *
 * Deliberately not a streak: totalDaysActive only ever climbs, so missing days costs
 * nothing but those days — there's no reset, and a gap can't destroy progress.
 */
export interface GoalDto {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  /** Days of activity needed to complete the goal. */
  targetDays: number;
  /** Distinct days with ≥1 focus task completed against this goal. Never decreases. */
  totalDaysActive: number;
  lastActivityDate: string | null;
  status: GoalStatus;
}

export interface CreateGoalRequest {
  name: string;
  color?: string;
  targetDays?: number;
}

/** Partial update — only send the fields you're changing. Status is never client-settable. */
export interface UpdateGoalRequest {
  name?: string;
  color?: string;
  targetDays?: number;
}

export interface TaskDto {
  id: string;
  userId: string;
  categoryId: string | null;
  goalId: string | null;
  name: string;
  description: string | null;
  taskType: TaskType;
  status: TaskStatus;
  /**
   * "YYYY-MM-DD", or null for unscheduled. Never parse this with `new Date(...)` — see
   * src/utils/schedule.ts, which owns every comparison against it.
   */
  scheduledFor: string | null;
  isRecurring: boolean;
  /**
   * An RRULE string, or null for a one-off task. The server only accepts and acts on the
   * three frequencies in RecurrenceRule below — typed as the wider `string` because a row
   * written by a future version could carry a rule this build doesn't know; read it through
   * src/utils/recurrence.ts, which handles that case rather than assuming.
   */
  recurrenceRule: string | null;
  /**
   * Instants with a "Z" (task-svc's ServerTimestamps). Before that they were server wall-clock
   * times with no zone, which the device read as its own local time — hours out on a UTC server.
   */
  createdAt: string;
  completedAt: string | null;
  /**
   * What finishing this task earned — a flat REMINDER_POINTS for a reminder, its sessions' total
   * for a focus task. Null while pending, after an undo, and on reminders finished before
   * reminders earned anything.
   */
  pointsEarned: number | null;
}

/**
 * An RRULE string. Not a union any more: the grammar now covers intervals, weekday sets,
 * nth-weekday-of-month and end conditions, which is far past what a literal union can express.
 * Build and read these through src/utils/recurrence.ts, which mirrors the server's accepted
 * subset exactly — never by hand.
 */
export type RecurrenceRule = string;

/**
 * A task's schedule is three independent settings, and they're all set here rather than
 * through a separate reminder resource:
 *
 *  - `scheduledFor` — the day (When). Omit for "no date yet", which is an ordinary choice.
 *  - `recurrenceRule` — whether it comes back (Repeat). Requires `scheduledFor`.
 *  - `notifyTime` — whether the phone buzzes (Notify). Independent of the other two.
 */
export interface CreateTaskRequest {
  categoryId?: string;
  goalId?: string;
  name: string;
  description?: string;
  taskType: TaskType;
  /** "YYYY-MM-DD". Omit for an undated task. */
  scheduledFor?: string;
  /** Requires scheduledFor — a repeat with no day to repeat from is a 400. */
  recurrenceRule?: RecurrenceRule;
  /** "HH:mm:ss". With a date, fires once that day; without one, daily until done. */
  notifyTime?: string;
  /**
   * Several notifications, for tasks wanting lead time — "a week before at 6pm" and "on the
   * day at 9am". Takes precedence over notifyTime when both are sent.
   */
  notifications?: NotificationSpec[];
}

/**
 * One notification: a time, and how many days before the task's own day it fires.
 * `daysBefore: 0` is the day itself.
 */
export interface NotificationSpec {
  /** "HH:mm:ss" */
  time: string;
  daysBefore: number;
}

/**
 * Partial update — only send the fields you're changing. categoryId sets a specific
 * category; pass clearCategory: true to unset it back to Uncategorized (a plain
 * categoryId of undefined is ambiguous between "don't touch this" and "clear it").
 * goalId/clearGoal, scheduledFor/clearScheduledFor and notifyTime/clearNotify all follow
 * the identical pattern.
 */
export interface UpdateTaskRequest {
  name?: string;
  taskType?: TaskType;
  categoryId?: string;
  clearCategory?: boolean;
  goalId?: string;
  clearGoal?: boolean;
  /** "YYYY-MM-DD" — the day this task is planned for. */
  scheduledFor?: string;
  /** Back to "no date". Refused while the task still repeats — clear both together. */
  clearScheduledFor?: boolean;
  /** Turns repeating on or changes the frequency. Stopping it is clearRecurrence, same null-ambiguity reason as goalId. */
  recurrenceRule?: RecurrenceRule;
  clearRecurrence?: boolean;
  /** "HH:mm:ss" — time of day to be notified. */
  notifyTime?: string;
  /**
   * The complete set of notifications — replaces whatever the task had. A whole-set replace
   * means the client never tracks reminder ids or diffs them.
   */
  notifications?: NotificationSpec[];
  /** Turns notifications off, leaving the schedule untouched. */
  clearNotify?: boolean;
}

/**
 * Notification config for a task. Created and removed through the task endpoints — this is
 * only ever read.
 *
 * A row exists only when the task should notify; "scheduled but silent" is the absence of a
 * row, not a row with nothing in it. There is deliberately no date here: the day a
 * notification fires on is the task's own `scheduledFor`, so the two can't disagree.
 */
export interface ReminderDto {
  id: string;
  taskId: string;
  /** "HH:mm:ss" — the time of day to fire. The day comes from the task. */
  reminderTime: string | null;
  /**
   * How many days before the task's scheduled day this fires; 0 is the day itself. An offset
   * rather than a date, so a notification follows the task automatically when its date moves.
   */
  daysBefore: number;
  /** Whether the device should still schedule this — false once stopped/completed. */
  isActive: boolean;
  isSnoozed: boolean;
  /** ISO timestamp a live snooze runs until; the device fires at this instead of the usual time. */
  snoozedUntil: string | null;
}

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
  /**
   * The length chosen when the session started — the whole sitting, so cycles × length for a
   * Pomodoro. Null only on sessions started by builds that didn't send it.
   */
  plannedMinutes: number | null;
  pointsEarned: number | null;
  /** An instant with a "Z" — safe to compare against the device clock. */
  startedAt: string;
  completedAt: string | null;
  wasInterrupted: boolean | null;
}

export interface StartFocusSessionRequest {
  /** Defaults to "regular" server-side when omitted. */
  focusMode?: FocusMode;
  /**
   * How long this sitting is meant to last. The server caps the credited duration at this
   * (plus a few minutes' grace) so a session left open overnight can't award hours of focus
   * time nobody spent — see FocusSessionService.creditedMinutes.
   */
  plannedMinutes?: number;
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

/**
 * Home's "points today" and "min focused", over the user's own calendar day. Points include
 * finished reminders; minutes are focus sessions only — which is why the two can differ.
 */
export interface TodayProgressDto {
  /** "YYYY-MM-DD" — the day these totals cover. */
  date: string;
  pointsEarned: number;
  focusMinutes: number;
}

/** Summed across every week the user has a row for — only focus-type completions count. */
export interface AllTimeProgressDto {
  totalTasksCompleted: number;
  totalFocusTimeMinutes: number;
  weeksTracked: number;
  /** Finished focus sessions. Progress divides the minutes by this to show an average session. */
  totalSessions: number;
}
