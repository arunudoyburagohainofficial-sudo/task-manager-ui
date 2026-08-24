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
  Body,
  Button,
  Card,
  ConfirmModal,
  DoNotDisturbIcon,
  Eyebrow,
  FocusIcon,
  InfoCard,
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
import { color, radius, space, text as t, type as T } from "../theme";
import { formatClockTime, formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "TaskDetail">;

const POMODORO_MINUTES = 25;

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
  // Seeds from the global Settings preference but is overridable per session.
  const [sessionDndEnabled, setSessionDndEnabled] = useState(dndDuringFocusEnabled);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setSessionDndEnabled(dndDuringFocusEnabled);
  }, [dndDuringFocusEnabled]);

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
        dndEnabled: sessionDndEnabled,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = user ? await focusSessionsApi.getCurrentSession() : null;
        if (current) {
          // numPomodoroCycles is only recorded when a session completes, so it's still
          // null on one in progress — fall back to a sane default rather than guessing.
          navigation.navigate("FocusSession", {
            sessionId: current.id,
            taskId: current.taskId,
            focusMode: current.focusMode,
            totalCycles: current.numPomodoroCycles ?? 4,
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
            { value: "focus", label: "Focus Task", icon: <FocusIcon size={18} /> },
            { value: "reminder", label: "Reminder Task", icon: <ReminderIcon size={18} /> },
          ]}
        />

        <Card>
          <View style={styles.cardHeader}>
            <Eyebrow>REMINDER</Eyebrow>
          </View>
          {reminder ? (
            <>
              <Body style={{ fontWeight: "700", color: color.text }}>⏰ {formatClockTime(reminder.reminderTime)}</Body>
              <View style={styles.reminderActions}>
                <Pressable accessibilityRole="button" onPress={() => setReminderSheetOpen(true)} hitSlop={8}>
                  <Meta style={{ color: color.selectedText, fontWeight: "800" }}>Edit time</Meta>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={handleDeleteReminder} hitSlop={8}>
                  <Meta style={{ color: color.danger, fontWeight: "800" }}>Delete reminder</Meta>
                </Pressable>
              </View>
            </>
          ) : (
            <Button label="Set a reminder" variant="secondary" onPress={() => setReminderSheetOpen(true)} />
          )}
        </Card>

        {isFocus ? (
          <>
            <Card>
              <View style={styles.cardHeader}>
                <Eyebrow>PROGRESS TRACKING</Eyebrow>
              </View>
              {/* Non-interactive indicator — determined by task type, no per-task opt-out.
                  The design is explicit that this must never render as a Switch. */}
              <InfoCard icon={<StreakIconInline />}>
                <Label style={{ color: color.success }}>Counts toward your streak &amp; weekly progress</Label>
                <Meta style={{ marginTop: 2 }}>Automatic for focus tasks</Meta>
              </InfoCard>

              {/* Read-only: a task's goal is chosen at capture time. Shown here so it's
                  visible where the work actually happens. */}
              {goal ? (
                <View style={styles.goalRow}>
                  <View style={[styles.goalSwatch, { backgroundColor: goal.color ?? color.goal }]} />
                  <View style={styles.goalText}>
                    <Label>{goal.name}</Label>
                    <Meta style={{ marginTop: 2 }}>
                      {goal.totalDaysActive} of {goal.targetDays} days · finishing this today adds one
                    </Meta>
                  </View>
                </View>
              ) : null}
            </Card>

            <Card>
              <View style={styles.cardHeader}>
                <Eyebrow>FOCUS SESSION</Eyebrow>
              </View>
              <Segmented<FocusMode>
                value={focusMode}
                onChange={setFocusMode}
                options={[
                  { value: "regular", label: `Regular · ${formatMinutes(defaultFocusDurationMinutes)}` },
                  { value: "pomodoro", label: "Pomodoro" },
                ]}
              />

              {/* Pomodoro-only — absent in regular mode, not disabled (design §3). */}
              {focusMode === "pomodoro" ? (
                <>
                  <View style={styles.cyclesRow}>
                    <Body style={{ fontWeight: "700" }}>Cycles</Body>
                    <Stepper value={pomodoroCycles} onChange={setPomodoroCycles} min={1} max={10} label="cycles" />
                  </View>
                  <Meta style={{ color: color.textFaint, marginTop: 4 }}>
                    {pomodoroCycles} cycles × {POMODORO_MINUTES} min = {pomodoroCycles * POMODORO_MINUTES} minutes total
                  </Meta>
                </>
              ) : null}

              <View style={styles.dndRow}>
                <DoNotDisturbIcon />
                <View style={styles.dndText}>
                  <Label style={{ color: color.success }}>Do Not Disturb</Label>
                  <Meta style={{ marginTop: 2 }}>Silences your phone for this session · coming soon</Meta>
                </View>
                <Toggle
                  value={sessionDndEnabled}
                  onChange={setSessionDndEnabled}
                  label="Do Not Disturb for this session"
                />
              </View>

              <Button
                label="Start Focus Session"
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
  reminderActions: {
    flexDirection: "row",
    gap: space.gutter,
    marginTop: space.md,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: 11,
    backgroundColor: color.track,
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  goalSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  goalText: {
    flex: 1,
  },
  cyclesRow: {
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
