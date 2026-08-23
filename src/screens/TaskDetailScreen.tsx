import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { ApiError } from "../api/client";
import { useGoalsQuery } from "../api/queries/useGoals";
import {
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useMarkTaskDoneMutation,
  useUpdateReminderMutation,
} from "../api/queries/useReminders";
import { useDeleteTaskMutation, useTaskQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import { useRemindersQuery } from "../api/queries/useReminders";
import type { CreateReminderRequest, FocusMode, TaskType } from "../api/types";
import { syncReminders } from "../notifications/useReminderSync";
import {
  Body,
  Button,
  Card,
  ConfirmModal,
  ReminderTimeSheet,
  ScreenContainer,
  SectionLabel,
  TaskDetailTitle,
  TaskTypeBadge,
  Text,
  Toggle,
} from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { usePreferences } from "../state/PreferencesContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { formatClockTime, formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "TaskDetail">;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  topSection: {
    paddingHorizontal: 8,
  },
  title: {
    marginTop: 12,
  },
  typeBadge: {
    marginTop: 10,
  },
  reminderCard: {
    gap: 10,
  },
  reminderHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reminderActionsRow: {
    flexDirection: "row",
    gap: 20,
  },
  progressCard: {
    gap: 8,
  },
  progressTintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.control,
    padding: 12,
  },
  sessionCard: {
    gap: 12,
  },
  modeTabRow: {
    flexDirection: "row",
    borderRadius: radii.control,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  cyclesSection: {
    gap: 6,
  },
  cyclesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cyclesCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dndRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.control,
    padding: 12,
  },
  dndLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  dndTextFlex: {
    flex: 1,
  },
  centerCaption: {
    textAlign: "center",
  },
  dashedCard: {
    borderStyle: "dashed",
  },
  deleteSection: {
    alignItems: "center",
    paddingVertical: 8,
  },
});

export function TaskDetailScreen() {
  const { colors } = useAppearance();
  const { user } = useSession();
  const { defaultFocusDurationMinutes, dndDuringFocusEnabled } = usePreferences();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  // Cache-backed (see src/api/queries/) — taskQuery seeds instantly from whatever tasks
  // list Home already fetched (see useTaskQuery's own doc comment), so this screen no
  // longer blocks on its own round trip in the common case of navigating here from Home.
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
  const reminder = remindersQuery.data?.find((r) => r.taskId === params.taskId) ?? null;

  const [focusMode, setFocusMode] = useState<FocusMode>("regular");
  const [pomodoroCycles, setPomodoroCycles] = useState(3);
  // Seeds from the global Settings preference but is overridable per session — synced
  // whenever the global default changes (e.g. once AsyncStorage finishes loading it).
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
      // Closed the moment the reminder is actually saved. syncReminders is deliberately not
      // awaited: it's three API calls plus scheduleAll, which can sit on a notification
      // permission prompt indefinitely — awaiting it left the sheet open long after the save
      // had succeeded, which read as the save having silently failed. It never throws, so
      // there's nothing here that needs its result.
      setReminderSheetOpen(false);
      void syncReminders();
    } catch (e) {
      Alert.alert("Couldn't save reminder", e instanceof ApiError ? e.message : "Try again.");
    }
  }

  async function handleDeleteReminder() {
    if (!reminder) return;
    // Hard delete (not stopReminders) — that only sets isActive false, leaving the row in
    // place so createReminder keeps 409ing. This actually frees the task up.
    await deleteReminderMutation.mutateAsync(reminder.id);
    void syncReminders();
  }

  // Optimistic update (instant toggle, rolled back on failure) now lives inside
  // useUpdateTaskMutation itself — see its onMutate/onError — reusable by any future
  // caller instead of being hand-rolled local state just for this one screen.
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
    // Same reasoning as handleSaveReminder: leaving the user on a task they've already
    // marked done, waiting on notification bookkeeping, is the lag — not the mutation.
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
          // numPomodoroCycles is only ever recorded when a session completes, so it's
          // still null on one that's already in progress — fall back to a sane default
          // rather than guessing wrong.
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

  // Was `return null` — that skips mounting ScreenContainer entirely, so the screen
  // showed nothing at all (not even the themed background) for as long as the initial
  // load() took, reading as a jarring blank white flash rather than a transition. Mounting
  // the real container immediately, with just a spinner in place of content, means the
  // background/chrome appears instantly and only the data itself visibly loads in.
  if (!task) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topSection}>
          <Pressable onPress={() => navigation.goBack()}>
            <Body weight="semiBold" color={colors.primary}>
              ← Back
            </Body>
          </Pressable>
          <TaskDetailTitle style={styles.title}>{task.name}</TaskDetailTitle>
          <View style={styles.typeBadge}>
            <TaskTypeBadge value={task.taskType} onChange={handleTaskTypeChange} />
          </View>
        </View>

        <Card style={styles.reminderCard}>
          <SectionLabel>Reminder</SectionLabel>
          {reminder ? (
            <>
              <View style={styles.reminderHeaderRow}>
                <Text weight="semiBold">⏰ {formatClockTime(reminder.reminderTime)}</Text>
              </View>
              <View style={styles.reminderActionsRow}>
                <Pressable onPress={() => setReminderSheetOpen(true)} hitSlop={8}>
                  <Body size={fontSize.caption} weight="semiBold" color={colors.primary}>
                    Edit time
                  </Body>
                </Pressable>
                <Pressable onPress={handleDeleteReminder} hitSlop={8}>
                  <Body size={fontSize.caption} color={colors.destructive}>
                    Delete reminder
                  </Body>
                </Pressable>
              </View>
            </>
          ) : (
            <Button label="Set a reminder" variant="secondary" onPress={() => setReminderSheetOpen(true)} />
          )}
        </Card>

        {task.taskType === "focus" ? (
          <>
            <Card style={styles.progressCard}>
              <SectionLabel>Progress tracking</SectionLabel>
              <View style={[styles.progressTintRow, { backgroundColor: colors.primaryTintBg }]}>
                <Text>🔥</Text>
                <View>
                  <Body size={fontSize.caption} weight="semiBold" color={colors.primaryTintText}>
                    Counts toward your streak &amp; weekly progress
                  </Body>
                  <Body size={fontSize.tiny} color={colors.primaryTintText}>
                    Automatic for focus tasks
                  </Body>
                </View>
              </View>
              {/* Read-only: a task's goal is chosen at capture time (Confirm & Organize).
                  Shown here so it's visible where the work actually happens. */}
              {goal ? (
                <View style={[styles.progressTintRow, { backgroundColor: colors.neutralFill }]}>
                  <Text>🎯</Text>
                  <View>
                    <Body size={fontSize.caption} weight="semiBold">
                      {goal.name}
                    </Body>
                    <Body size={fontSize.tiny} color={colors.textFaint}>
                      {goal.totalDaysActive} of {goal.targetDays} days · finishing this today adds one
                    </Body>
                  </View>
                </View>
              ) : null}
            </Card>

            <Card style={styles.sessionCard}>
              <SectionLabel>Focus session</SectionLabel>
              <View style={[styles.modeTabRow, { backgroundColor: colors.neutralFill }]}>
                {(["regular", "pomodoro"] as const).map((mode) => {
                  const active = focusMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setFocusMode(mode)}
                      style={[styles.modeTab, { backgroundColor: active ? colors.bgCard : "transparent" }]}
                    >
                      <Text size={fontSize.label} weight={active ? "bold" : "semiBold"} color={active ? colors.textDark : colors.textMuted}>
                        {mode === "regular" ? `Regular · ${formatMinutes(defaultFocusDurationMinutes)}` : "Pomodoro"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {focusMode === "pomodoro" ? (
                <View style={styles.cyclesSection}>
                  <View style={styles.cyclesRow}>
                    <Body size={fontSize.caption} color={colors.textMuted}>
                      Cycles
                    </Body>
                    <View style={styles.cyclesCounterRow}>
                      <Pressable onPress={() => setPomodoroCycles((c) => Math.max(1, c - 1))} hitSlop={8}>
                        <Text size={fontSize.lg} weight="bold">
                          −
                        </Text>
                      </Pressable>
                      <Text weight="bold">{pomodoroCycles}</Text>
                      <Pressable onPress={() => setPomodoroCycles((c) => Math.min(10, c + 1))} hitSlop={8}>
                        <Text size={fontSize.lg} weight="bold">
                          +
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <Body size={fontSize.micro} color={colors.textFaint}>
                    {pomodoroCycles} cycles × 25 min = {pomodoroCycles * 25} minutes total
                  </Body>
                </View>
              ) : null}

              <View
                style={[styles.dndRow, { backgroundColor: sessionDndEnabled ? colors.primaryTintBg : colors.neutralFill }]}
              >
                <View style={styles.dndLeft}>
                  <Text>🔕</Text>
                  <View style={styles.dndTextFlex}>
                    <Body size={fontSize.caption} weight="semiBold" color={sessionDndEnabled ? colors.primaryTintText : colors.textMuted}>
                      Do Not Disturb
                    </Body>
                    <Body size={fontSize.tiny} color={sessionDndEnabled ? colors.primaryTintText : colors.textFaint}>
                      Silences your phone for this session · coming soon
                    </Body>
                  </View>
                </View>
                <Toggle value={sessionDndEnabled} onChange={setSessionDndEnabled} />
              </View>

              <Button label="Start Focus Session" large loading={starting} onPress={handleStartSession} />
              <Body size={fontSize.micro} color={colors.textFaint} style={styles.centerCaption}>
                Starts only when you tap — never automatic
              </Body>
            </Card>
          </>
        ) : (
          <>
            <Card style={styles.dashedCard}>
              <Body size={fontSize.micro} color={colors.textFaint}>
                Reminder tasks don&rsquo;t count toward streak or weekly progress — those track focused work only.
              </Body>
            </Card>
            <Button label="Mark as done ✓" large onPress={handleMarkDone} />
          </>
        )}

        <View style={styles.deleteSection}>
          <Pressable onPress={() => setDeleteConfirmOpen(true)} hitSlop={8}>
            <Body weight="semiBold" color={colors.destructive}>
              Delete task
            </Body>
          </Pressable>
        </View>
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
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}
