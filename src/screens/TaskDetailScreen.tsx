import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { ApiError } from "../api/client";
import { useGoalsQuery } from "../api/queries/useGoals";
import {
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useMarkTaskDoneMutation,
  useRemindersQuery,
  useUpdateReminderMutation,
} from "../api/queries/useReminders";
import { useDeleteTaskMutation, useTaskQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import type { CreateReminderRequest, FocusMode, TaskType } from "../api/types";
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
  ReminderTimeSheet,
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
  /** Status tag shown beside the title — the reminder row uses it for where the task sits. */
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
  const createReminderMutation = useCreateReminderMutation();
  const updateReminderMutation = useUpdateReminderMutation();
  const deleteReminderMutation = useDeleteReminderMutation();
  const markDoneMutation = useMarkTaskDoneMutation();

  const task = taskQuery.data ?? null;
  const goals = goalsQuery.data ?? [];
  const goal = task?.goalId ? goals.find((g) => g.id === task.goalId) ?? null : null;
  // isActive matters here, not just taskId: the server never deletes a stopped reminder
  // row (see ReminderService.stopReminders), so a completed task's now-inactive reminder
  // would otherwise still match and render as a live, editable card.
  const reminder = remindersQuery.data?.find((r) => r.taskId === params.taskId && r.isActive) ?? null;

  const [focusMode, setFocusMode] = useState<FocusMode>("regular");
  const [pomodoroCycles, setPomodoroCycles] = useState(3);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(DEFAULT_POMODORO_MINUTES);
  // Seeds from the global Settings preference but is overridable per session, same as
  // sessionDndEnabled below — this is "today's session," not a rewrite of the default.
  const [regularMinutes, setRegularMinutes] = useState(defaultFocusDurationMinutes);
  // Seeds from the global Settings preference but is overridable per session.
  const [sessionDndEnabled, setSessionDndEnabled] = useState(dndDuringFocusEnabled);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setSessionDndEnabled(dndDuringFocusEnabled);
  }, [dndDuringFocusEnabled]);

  useEffect(() => {
    setRegularMinutes(defaultFocusDurationMinutes);
  }, [defaultFocusDurationMinutes]);

  async function handleSaveReminder(request: CreateReminderRequest) {
    try {
      // createReminder 409s on any existing row for the task (even a stopped one), so an
      // existing reminder means we're editing — reschedule it in place instead.
      if (reminder) {
        await updateReminderMutation.mutateAsync({ reminderId: reminder.id, request });
      } else {
        await createReminderMutation.mutateAsync({ taskId: params.taskId, request });
      }
      // syncReminders is deliberately not awaited: it's three API calls plus scheduleAll,
      // which can sit on a notification permission prompt indefinitely.
      setReminderSheetOpen(false);
      void syncReminders();
    } catch (e) {
      Alert.alert("Couldn't save reminder", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  async function handleDeleteReminder() {
    if (!reminder) return;
    // Hard delete (not stopReminders) — that only sets isActive false, leaving the row in
    // place so createReminder keeps 409ing.
    await deleteReminderMutation.mutateAsync(reminder.id);
    void syncReminders();
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
    try {
      const session = await focusSessionsApi.startFocusSession(params.taskId, { focusMode });
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
          Alert.alert(
            "A session is already running",
            "Finish or end your other session before starting a new one — one focus at a time."
          );
        }
      } else {
        Alert.alert("Couldn't start session", "Try again.");
      }
    } finally {
      setStarting(false);
    }
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
            title={
              reminder
                ? `${formatClockTime(reminder.reminderTime)}${
                    reminder.reminderDate ? ` · ${formatScheduleDate(reminder.reminderDate)}` : " · every day"
                  }`
                : "Reminder"
            }
            badge={
              reminder ? (
                task.scheduledFor ? (
                  isOverdue(task) ? <Badge label="OVERDUE" tone="danger" /> : <Badge label="SCHEDULED" />
                ) : (
                  <Badge label="ON HOME" />
                )
              ) : null
            }
            /* The reminder's date is also the task's schedule — there's deliberately no
               separate control that could contradict it. Saying where the task is sitting
               is what makes it vanishing from Home read as a consequence, not a bug. */
            subtitle={
              !reminder
                ? "None set"
                : task.scheduledFor
                  ? isOverdue(task)
                    ? `Was due ${formatScheduleDate(task.scheduledFor)} — waiting under Overdue`
                    : `Waiting under ${formatScheduleDate(task.scheduledFor)} until that day`
                  : "Stays on Home"
            }
            subtitleColor={reminder && isOverdue(task) ? color.danger : undefined}
            action={reminder ? "Change" : "Add"}
            onPress={() => setReminderSheetOpen(true)}
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

      <ReminderTimeSheet
        visible={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
        onSubmit={handleSaveReminder}
        submitting={createReminderMutation.isPending || updateReminderMutation.isPending}
        initialReminderTime={reminder?.reminderTime}
        initialReminderDate={reminder?.reminderDate}
        onDelete={async () => {
          setReminderSheetOpen(false);
          await handleDeleteReminder();
        }}
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
        title="Delete this task?"
        message={`"${task.name}" will be removed. This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
