import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { ApiError } from "../api/client";
import { useGoalsQuery } from "../api/queries/useGoals";
import {
  useDeleteIntervalReminderMutation,
  useIntervalRemindersQuery,
  useMarkTaskDoneMutation,
  useRemindersQuery,
  useSetIntervalReminderMutation,
} from "../api/queries/useReminders";
import { useDeleteTaskMutation, useTaskQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import type { FocusMode, TaskType } from "../api/types";
import {
  BackLink,
  Badge,
  Body,
  Button,
  Card,
  ConfirmModal,
  DoNotDisturbIcon,
  Eyebrow,
  FocusIcon,
  GoalPickerSheet,
  Label,
  Meta,
  ReminderIcon,
  NudgeSheet,
  type NudgeSelection,
  QuickReminderSheet,
  type QuickReminderChoice,
  ScheduleSheet,
  type ScheduleSelection,
  ScreenContainer,
  Segmented,
  Stepper,
  StreakIconInline,
  Toggle,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { color, radius, size, space, text as t, type as T } from "../theme";
import { formatClockTime, formatMinutes } from "../utils/format";
import { recurrenceShortLabel } from "../utils/recurrence";
import { formatScheduleDate, isOverdue } from "../utils/schedule";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "TaskDetail">;

const DEFAULT_POMODORO_MINUTES = 25;

/**
 * Icon · title/subtitle · action row. Reminder and goal are the same shape of thing — an
 * optional attachment with one way to change it — so they share one row component rather
 * than each inventing its own layout.
 *
 * The whole row is the tap target, with the action word doubling as the affordance; a
 * text-sized hit area on the right alone is too small to aim at comfortably.
 */
function DetailRow({
  icon,
  title,
  badge,
  subtitle,
  subtitleColor,
  action,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  /** Status tag shown beside the title — the schedule row uses it for where the task sits. */
  badge?: React.ReactNode;
  subtitle: string;
  subtitleColor?: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${action}`}
      onPress={onPress}
      style={styles.detailRow}
    >
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailText}>
        <View style={styles.detailTitleRow}>
          <Label numberOfLines={1} style={styles.detailTitle}>
            {title}
          </Label>
          {badge}
        </View>
        <Meta style={{ marginTop: 2, color: subtitleColor ?? color.textFaint }}>{subtitle}</Meta>
      </View>
      <Meta style={{ color: color.selectedText, fontWeight: "800" }}>{action}</Meta>
      <Meta style={{ color: color.textFaint, marginLeft: 4 }}>›</Meta>
    </Pressable>
  );
}

export function TaskDetailScreen() {
  const { user } = useSession();
  const { defaultFocusDurationMinutes, dndDuringFocusEnabled } = usePreferences();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const taskQuery = useTaskQuery(params.taskId);
  const remindersQuery = useRemindersQuery();
  const goalsQuery = useGoalsQuery();
  const updateTaskMutation = useUpdateTaskMutation();
  const deleteTaskMutation = useDeleteTaskMutation();
  const markDoneMutation = useMarkTaskDoneMutation();
  const intervalRemindersQuery = useIntervalRemindersQuery();
  const setNudgeMutation = useSetIntervalReminderMutation();
  const deleteNudgeMutation = useDeleteIntervalReminderMutation();

  const task = taskQuery.data ?? null;
  const goals = goalsQuery.data ?? [];
  const goal = task?.goalId ? goals.find((g) => g.id === task.goalId) ?? null : null;
  // isActive matters here, not just taskId: the server never deletes a stopped reminder
  // row (see ReminderService.stopReminders), so a completed task's now-inactive reminder
  // would otherwise still match and render as a live, editable card.
  const reminder = remindersQuery.data?.find((r) => r.taskId === params.taskId && r.isActive) ?? null;
  /**
   * Every live notification on this task, earliest warning first.
   *
   * isActive matters as much as taskId: the server keeps a stopped reminder's row rather than
   * deleting it, so an unfiltered list would show a completed task's notifications as live.
   */
  const taskNotifications = useMemo(
    () =>
      (remindersQuery.data ?? [])
        .filter((r) => r.taskId === params.taskId && r.isActive && r.reminderTime)
        .map((r) => ({ time: r.reminderTime as string, daysBefore: r.daysBefore ?? 0 }))
        .sort((a, b) => b.daysBefore - a.daysBefore),
    [remindersQuery.data, params.taskId]
  );

  const [focusMode, setFocusMode] = useState<FocusMode>("regular");
  const [pomodoroCycles, setPomodoroCycles] = useState(3);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(DEFAULT_POMODORO_MINUTES);
  // Seeds from the global Settings preference but is overridable per session, same as
  // sessionDndEnabled below — this is "today's session," not a rewrite of the default.
  const [regularMinutes, setRegularMinutes] = useState(defaultFocusDurationMinutes);
  // Seeds from the global Settings preference but is overridable per session.
  const [sessionDndEnabled, setSessionDndEnabled] = useState(dndDuringFocusEnabled);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [nudgeSheetOpen, setNudgeSheetOpen] = useState(false);
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setSessionDndEnabled(dndDuringFocusEnabled);
  }, [dndDuringFocusEnabled]);

  useEffect(() => {
    setRegularMinutes(defaultFocusDurationMinutes);
  }, [defaultFocusDurationMinutes]);

  /**
   * Schedule, repeat and notify in one write.
   *
   * Replaces three separate handlers (save reminder, delete reminder, set recurrence), each
   * of which was its own request with its own way of failing — and two of which had no error
   * path at all. One call means one outcome to report, and no way to end up half-applied.
   */
  async function handleSaveSchedule(selection: ScheduleSelection) {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: params.taskId,
        request: {
          ...(selection.scheduledFor
            ? { scheduledFor: selection.scheduledFor }
            : { clearScheduledFor: true }),
          ...(selection.recurrenceRule
            ? { recurrenceRule: selection.recurrenceRule }
            : { clearRecurrence: true }),
          // The whole set every time — an empty list is as complete a statement as a full one,
          // so there's no separate "clear" case to get wrong.
          ...(selection.notifications.length > 0
            ? { notifications: selection.notifications }
            : { clearNotify: true }),
        },
      });
      setScheduleSheetOpen(false);
    } catch (e) {
      Alert.alert("Couldn't save schedule", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  /** Back to an undated, non-repeating, silent task — all three cleared together, which is
   *  also the only way the server accepts losing the date while a repeat is set. */
  async function handleClearSchedule() {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: params.taskId,
        request: { clearScheduledFor: true, clearRecurrence: true, clearNotify: true },
      });
      setScheduleSheetOpen(false);
    } catch (e) {
      Alert.alert("Couldn't clear schedule", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  /**
   * "Nudge me in 45 minutes" — one write that sets the day and the notification together.
   *
   * The time arrives already resolved by the device, in the device's own timezone. That's the
   * whole point: resolving it server-side is what previously made this fire at the wrong
   * moment (a UTC server storing a bare wall-clock time the phone then read as local), and it
   * is why the feature is expressed as an ordinary schedule rather than a special mode.
   */
  async function handleQuickReminder(choice: QuickReminderChoice) {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: params.taskId,
        request: {
          scheduledFor: choice.scheduledFor,
          notifications: [{ time: choice.time, daysBefore: 0 }],
        },
      });
      setQuickSheetOpen(false);
    } catch (e) {
      Alert.alert("Couldn't set that nudge", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  /** The task's repeated-nudge window, if it has one. */
  const nudge = intervalRemindersQuery.data?.find((r) => r.taskId === params.taskId && r.isActive) ?? null;

  async function handleSaveNudge(selection: NudgeSelection) {
    try {
      await setNudgeMutation.mutateAsync({
        taskId: params.taskId,
        existingId: nudge?.id,
        request: selection,
      });
      setNudgeSheetOpen(false);
    } catch (e) {
      Alert.alert("Couldn't save nudges", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  async function handleRemoveNudge() {
    if (!nudge) return;
    try {
      await deleteNudgeMutation.mutateAsync(nudge.id);
      setNudgeSheetOpen(false);
    } catch (e) {
      Alert.alert("Couldn't stop nudges", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  async function handleSelectGoal(goalId: string | null) {
    try {
      await updateTaskMutation.mutateAsync({
        taskId: params.taskId,
        request: goalId ? { goalId } : { clearGoal: true },
      });
    } catch (e) {
      Alert.alert("Couldn't update goal", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  // Optimistic update lives inside useUpdateTaskMutation itself — see its onMutate/onError.
  async function handleTaskTypeChange(next: TaskType) {
    if (!task || task.taskType === next) return;
    try {
      await updateTaskMutation.mutateAsync({ taskId: params.taskId, request: { taskType: next } });
    } catch (e) {
      Alert.alert("Couldn't change task type", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  async function handleMarkDone() {
    await markDoneMutation.mutateAsync(params.taskId);
    void syncReminders();
    navigation.goBack();
  }

  async function handleDelete() {
    await deleteTaskMutation.mutateAsync(params.taskId);
    setDeleteConfirmOpen(false);
    navigation.goBack();
  }

  async function handleStartSession() {
    setStarting(true);
    // The whole sitting, not one cycle: a Pomodoro session runs `pomodoroCycles` work
    // blocks, and capping at a single block's length would clip a legitimate full session.
    const plannedMinutes =
      focusMode === "pomodoro" ? pomodoroMinutes * pomodoroCycles : regularMinutes;
    try {
      const session = await focusSessionsApi.startFocusSession(params.taskId, {
        focusMode,
        plannedMinutes,
      });
      navigation.navigate("FocusSession", {
        sessionId: session.id,
        taskId: params.taskId,
        focusMode,
        totalCycles: pomodoroCycles,
        sessionMinutes: focusMode === "pomodoro" ? pomodoroMinutes : regularMinutes,
        dndEnabled: sessionDndEnabled,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = user ? await focusSessionsApi.getCurrentSession() : null;
        if (current) {
          // numPomodoroCycles is only recorded when a session completes, so it's still
          // null on one in progress — fall back to a sane default rather than guessing.
          // Same reasoning for the session length: task-svc has no field for it at all
          // (see FocusSessionScreen), so a resumed session can't recover whatever was
          // chosen when it was originally started.
          navigation.navigate("FocusSession", {
            sessionId: current.id,
            taskId: current.taskId,
            focusMode: current.focusMode,
            totalCycles: current.numPomodoroCycles ?? 4,
            sessionMinutes: current.focusMode === "pomodoro" ? DEFAULT_POMODORO_MINUTES : defaultFocusDurationMinutes,
            dndEnabled: sessionDndEnabled,
          });
        } else {
          /*
           * A session is open but we can't reach it to resume — so the user is blocked with
           * nowhere to go. Discarding is offered here rather than only "try again", because
           * the alternative used to be completing a session they never ran, which credited
           * focus time for work that didn't happen just to unblock themselves.
           */
          Alert.alert(
            "A session is already running",
            "One focus at a time. If you've lost track of it, you can discard it — nothing will be credited.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Discard it",
                style: "destructive",
                onPress: async () => {
                  try {
                    const stuck = await focusSessionsApi.getCurrentSession();
                    if (stuck) await focusSessionsApi.abandonFocusSession(stuck.id);
                  } catch {
                    Alert.alert("Couldn't discard it", "Check your connection and try again.");
                  }
                },
              },
            ]
          );
        }
      } else {
        Alert.alert("Couldn't start session", "Try again.");
      }
    } finally {
      setStarting(false);
    }
  }

  /**
   * A task that can't be loaded at all — deleted here, on another device, or reached from a
   * notification for something that no longer exists.
   *
   * Distinguished from "still loading" deliberately: this screen used to render a spinner
   * for any falsy task, so a 404 spun forever with no way forward but the OS back gesture.
   * That became easy to hit once notifications could deep-link into a task.
   */
  if (!task && taskQuery.isError) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <BackLink onPress={() => navigation.goBack()} />
          <Card style={styles.missingCard}>
            <Text style={t(T.bodyLg, { color: color.text })}>This task is gone</Text>
            <Meta style={styles.missingText}>
              It was deleted, here or on another device. Nothing further to do with it.
            </Meta>
            <Button label="Back" onPress={() => navigation.goBack()} style={styles.missingButton} />
          </Card>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Mounting the real container immediately, with a spinner in place of content, means the
  // background and chrome appear instantly and only the data itself visibly loads in.
  if (!task) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <ActivityIndicator color={color.interactive} />
        </View>
      </ScreenContainer>
    );
  }

  const isFocus = task.taskType === "focus";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <BackLink onPress={() => navigation.goBack()} />
        <Text style={t(T.h1, { fontSize: 27, color: color.text })}>{task.name}</Text>

        <Segmented<TaskType>
          value={task.taskType}
          onChange={handleTaskTypeChange}
          options={[
            { value: "focus", label: "Focus", icon: <FocusIcon size={18} /> },
            { value: "reminder", label: "Reminder", icon: <ReminderIcon size={18} /> },
          ]}
        />

        {/* Reminder and goal are one card of rows rather than two headed cards: they're the
            same kind of thing — an optional attachment with a single action — and heading
            each one separately made the screen read as four sections before the actual
            controls. */}
        <Card style={styles.rowCard}>
          <DetailRow
            icon={<ReminderIcon size={20} />}
            /*
               One row for the whole schedule: the day, whether it repeats, and whether it
               notifies. These used to be two rows that could contradict each other; the
               summary reads as one sentence because it now describes one setting.
             */
            title={
              task.scheduledFor
                ? [
                    formatScheduleDate(task.scheduledFor),
                    recurrenceShortLabel(task.recurrenceRule),
                    formatClockTime(reminder?.reminderTime ?? null),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : reminder
                  ? `${formatClockTime(reminder.reminderTime) ?? ""} · every day until done`.trim()
                  : "Schedule"
            }
            badge={
              // Only a dated task gets a tag — OVERDUE/SCHEDULED add a short-form status the
              // sentence below doesn't. An undated task's badge would just repeat "Stays on
              // Home" in fewer words.
              task.scheduledFor ? (
                isOverdue(task) ? <Badge label="OVERDUE" tone="danger" /> : <Badge label="SCHEDULED" />
              ) : null
            }
            /* Saying where the task is sitting is what makes it vanishing from Home read as
               a consequence of the date, not a bug. */
            subtitle={
              !task.scheduledFor && !reminder
                ? "No date — stays on Home"
                : !task.scheduledFor
                  ? "Stays on Home until it's done"
                  : isOverdue(task)
                    ? `Was due ${formatScheduleDate(task.scheduledFor)} — waiting under Overdue`
                    : `Waiting under ${formatScheduleDate(task.scheduledFor)} until that day`
            }
            subtitleColor={task.scheduledFor && isOverdue(task) ? color.danger : undefined}
            /* Read-only once the task is finished. Rescheduling something already done can't
               change anything — a repeat set here could never fire (the server refuses it),
               and a notification would be stopped on arrival. Showing the row keeps the
               history readable; offering to edit it would promise something that isn't true. */
            action={task.status === "completed" ? "" : task.scheduledFor || reminder ? "Change" : "Add"}
            onPress={() => {
              if (task.status !== "completed") setScheduleSheetOpen(true);
            }}
          />

          <View style={styles.rowDivider} />

          <DetailRow
            icon={
              goal ? (
                <View style={[styles.goalSwatch, { backgroundColor: goal.color ?? color.goal }]} />
              ) : (
                <View style={styles.goalSwatchEmpty} />
              )
            }
            title={goal ? goal.name : "Goal"}
            subtitle={
              goal
                ? `${goal.totalDaysActive} of ${goal.targetDays} days${isFocus ? " · today adds one" : ""}`
                : "Not attached — optional"
            }
            action={goal ? "Change" : "Attach"}
            onPress={() => setGoalSheetOpen(true)}
          />

          {/* Only for outstanding work: nudges are about chasing something today, which a
              finished task doesn't need. */}
          {task.status === "completed" ? null : (
            <>
              <View style={styles.rowDivider} />
              <DetailRow
                icon={<ReminderIcon size={20} />}
                title="Nudge me in…"
                subtitle="A one-off, counted from right now"
                action="Pick"
                onPress={() => setQuickSheetOpen(true)}
              />

              <View style={styles.rowDivider} />

              <DetailRow
                icon={<ReminderIcon size={20} />}
                title={
                  nudge
                    ? `Every ${nudge.intervalMinutes} min · ${formatClockTime(nudge.startTime)}–${formatClockTime(nudge.endTime)}`
                    : "Repeated nudges"
                }
                subtitle={
                  nudge
                    ? "Buzzes on a loop inside that window"
                    : "Optional — for something that needs chasing today"
                }
                action={nudge ? "Change" : "Add"}
                onPress={() => setNudgeSheetOpen(true)}
              />
            </>
          )}

        </Card>

        {isFocus ? (
          <>
            {/* A plain line, not a card: this is a statement of fact about focus tasks, and
                dressing it as a panel gave it the same weight as the controls around it.
                "goal or not" only when unattached — it answers the question the empty goal
                row above has just raised. */}
            <View style={styles.trackingNote}>
              <StreakIconInline size={14} />
              <Meta style={styles.trackingText}>
                Counts toward your streak and weekly progress{goal ? "" : ", goal or not"} — automatic for focus
                tasks.
              </Meta>
            </View>

            <Card>
              <View style={styles.cardHeader}>
                <Eyebrow>FOCUS SESSION</Eyebrow>
              </View>
              <Segmented<FocusMode>
                value={focusMode}
                onChange={setFocusMode}
                options={[
                  { value: "regular", label: `Regular · ${formatMinutes(regularMinutes)}` },
                  { value: "pomodoro", label: "Pomodoro" },
                ]}
              />

              {focusMode === "regular" ? (
                <View style={styles.settingRow}>
                  <Body style={{ fontWeight: "700" }}>Session length</Body>
                  <Stepper
                    value={regularMinutes}
                    onChange={setRegularMinutes}
                    min={5}
                    max={90}
                    step={5}
                    suffix="min"
                    label="session length"
                  />
                </View>
              ) : null}

              {/* Pomodoro-only — absent in regular mode, not disabled (design §3). */}
              {focusMode === "pomodoro" ? (
                <>
                  <View style={styles.settingRow}>
                    <Body style={{ fontWeight: "700" }}>Cycles</Body>
                    <Stepper value={pomodoroCycles} onChange={setPomodoroCycles} min={1} max={10} label="cycles" />
                  </View>
                  <View style={styles.settingRow}>
                    <Body style={{ fontWeight: "700" }}>Session length</Body>
                    <Stepper
                      value={pomodoroMinutes}
                      onChange={setPomodoroMinutes}
                      min={5}
                      max={60}
                      step={5}
                      suffix="min"
                      label="pomodoro session length"
                    />
                  </View>
                  <Meta style={{ color: color.textFaint }}>
                    {pomodoroCycles} × {pomodoroMinutes} min · {pomodoroCycles * pomodoroMinutes} minutes total
                  </Meta>
                </>
              ) : null}

              <View style={styles.rowDivider} />

              <View style={styles.dndRow}>
                {/* 18, matching FocusSessionScreen's DND pill — the two screens show the
                    same "Do Not Disturb" concept and should read at the same size. */}
                <DoNotDisturbIcon size={18} />
                <View style={styles.dndText}>
                  <Label>Do Not Disturb</Label>
                  <Meta style={{ marginTop: 2 }}>Silences your phone for this session · coming soon</Meta>
                </View>
                <Toggle
                  value={sessionDndEnabled}
                  onChange={setSessionDndEnabled}
                  label="Do Not Disturb for this session"
                />
              </View>

              <Button
                label="Start focus session"
                loading={starting}
                onPress={handleStartSession}
                style={styles.startButton}
              />
              <Meta style={styles.startCaption}>Starts only when you tap — never automatic</Meta>
            </Card>
          </>
        ) : (
          <>
            <View style={styles.dashedNote}>
              <Meta style={{ lineHeight: 21 }}>
                Reminder tasks don&rsquo;t count toward streak or weekly progress — those track focused work only.
              </Meta>
            </View>
            <Button label="Mark as done ✓" onPress={handleMarkDone} />
          </>
        )}

        <Button
          label="Delete task"
          variant="destructiveText"
          onPress={() => setDeleteConfirmOpen(true)}
          style={styles.deleteButton}
        />
      </ScrollView>

      <ScheduleSheet
        visible={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        onSubmit={handleSaveSchedule}
        submitting={updateTaskMutation.isPending}
        initial={{
          scheduledFor: task.scheduledFor,
          // The stored rule, not just its frequency — the sheet reads intervals, weekday sets
          // and end conditions out of it.
          recurrenceRule: task.recurrenceRule,
          notifications: taskNotifications,
        }}
        // Offered only when there's something to clear. No blockedReason equivalent is
        // needed any more: the sheet can't express a combination the server would refuse.
        onClear={task.scheduledFor || reminder ? handleClearSchedule : undefined}
      />
      <QuickReminderSheet
        visible={quickSheetOpen}
        onClose={() => setQuickSheetOpen(false)}
        onPick={handleQuickReminder}
        submitting={updateTaskMutation.isPending}
      />
      <NudgeSheet
        visible={nudgeSheetOpen}
        onClose={() => setNudgeSheetOpen(false)}
        onSubmit={handleSaveNudge}
        onRemove={nudge ? handleRemoveNudge : undefined}
        submitting={setNudgeMutation.isPending || deleteNudgeMutation.isPending}
        existing={nudge}
      />
      <GoalPickerSheet
        visible={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        goals={goals}
        selectedGoalId={task.goalId}
        onSelect={handleSelectGoal}
      />
      <ConfirmModal
        visible={deleteConfirmOpen}
        title={task.recurrenceRule ? "Delete this repeating task?" : "Delete this task?"}
        /* A repeating task's delete ends the whole routine, not just today's copy — nothing
           will regenerate it, because regeneration only happens on completion. Saying only
           "will be removed" read as removing one occurrence. */
        message={
          task.recurrenceRule
            ? `"${task.name}" will stop repeating and be removed. No future ones will be created. This can't be undone.`
            : `"${task.name}" will be removed. This can't be undone.`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  missingCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 20,
  },
  missingText: {
    marginTop: 4,
    textAlign: "center",
  },
  missingButton: {
    marginTop: 16,
    alignSelf: "stretch",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
    paddingBottom: 24,
    gap: space.base,
  },
  cardHeader: {
    marginBottom: space.md,
  },
  // Rows carry their own padding so the divider between them can run edge to edge.
  rowCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.card,
    minHeight: size.minTouch,
  },
  detailIcon: {
    width: 22,
    alignItems: "center",
  },
  detailText: {
    flex: 1,
  },
  detailTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  // Shrinks so a long goal name yields to the tag beside it rather than pushing it away.
  detailTitle: {
    flexShrink: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: color.divider,
  },
  trackingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: 2,
  },
  trackingText: {
    flex: 1,
    lineHeight: 20,
  },
  goalSwatchEmpty: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.textFaint,
  },
  goalSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  goalText: {
    flex: 1,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
  },
  dndRow: {
    borderWidth: 1,
    borderColor: color.successBorder,
    backgroundColor: color.successFill,
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: 11,
  },
  dndText: {
    flex: 1,
  },
  startButton: {
    marginTop: space.base,
  },
  startCaption: {
    color: color.textFaint,
    textAlign: "center",
    marginTop: 9,
  },
  dashedNote: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: space.card,
  },
  deleteButton: {
    marginTop: space.gutter,
  },
});
