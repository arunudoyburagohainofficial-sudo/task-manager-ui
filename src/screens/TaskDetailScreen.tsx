import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api";
import { ApiError } from "../api/client";
import { queryKeys } from "../api/queryKeys";
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
  Button,
  Card,
  ConfirmModal,
  DeleteTaskLink,
  DetailCard,
  DetailFooter,
  DetailHeader,
  DetailSection,
  DetailTitle,
  GoalAttachmentCard,
  GoalPickerSheet,
  Meta,
  NudgeSheet,
  type NudgeSelection,
  PomodoroPlan,
  QuickReminderSheet,
  type QuickReminderChoice,
  ScheduleSheet,
  type ScheduleSelection,
  ScreenContainer,
  SessionLength,
  SessionModeSwitch,
  StreakNote,
  TaskTypeSwitch,
  TimingAlarmIcon,
  TimingCalendarIcon,
  TimingRepeatIcon,
  TimingRow,
  WhyNoGoalCard,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { space, textAtDesignSize as td, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { formatClockTime } from "../utils/format";
import { DEFAULT_POMODORO_MINUTES, resumeSessionParams } from "../utils/focusSession";
import { describeRecurrence } from "../utils/recurrence";
import { formatScheduleDate, todayKey } from "../utils/schedule";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "TaskDetail">;

/** Minutes of rest between Pomodoro rounds — mirrors FocusSessionScreen's BREAK_SECONDS. */
const POMODORO_BREAK_MINUTES = 5;

export function TaskDetailScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
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
  const queryClient = useQueryClient();
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
      // Home's "Right now" reads this cache entry, so it's written here rather than left for
      // Home's next refetch — otherwise backing out of a session shows no sign of it running.
      queryClient.setQueryData(queryKeys.currentFocusSession(), session);
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
          queryClient.setQueryData(queryKeys.currentFocusSession(), current);
          // The session's own planned length and start now come back with it, so a regular
          // session picks up where it actually is — see resumeSessionParams for why a Pomodoro
          // can only reopen at the start of a block.
          navigation.navigate("FocusSession", resumeSessionParams(current, defaultFocusDurationMinutes, sessionDndEnabled));
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
                    queryClient.setQueryData(queryKeys.currentFocusSession(), null);
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
   * Distinguished from "still loading" deliberately: this screen used to render a spinner for
   * any falsy task, so a 404 spun forever with no way forward but the OS back gesture.
   */
  // A 404 from the re-check means gone, even though an older copy is still cached — the cached
  // copy is exactly what would otherwise keep a deleted task on screen, editable.
  const gone = taskQuery.error instanceof ApiError && taskQuery.error.status === 404;
  if ((!task && taskQuery.isError) || gone) {
    return (
      <ScreenContainer wash="home">
        <ScrollView contentContainerStyle={styles.missingContent}>
          <BackLink onPress={() => navigation.goBack()} />
          <Card style={styles.missingCard}>
            <Text style={td(T.bodyLg, { color: theme.detail.ink })}>This task is gone</Text>
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
      <ScreenContainer wash="home">
        <View style={styles.loading}>
          <ActivityIndicator color={theme.detail.action} />
        </View>
      </ScreenContainer>
    );
  }

  const isFocus = task.taskType === "focus";
  const finished = task.status === "completed";
  const today = todayKey();

  /**
   * The whole schedule as one line. A repeating task leads with the time and lets the rule
   * carry the day — "6:00 PM · every day" — because the rule already names which days it
   * lands on. A one-off leads with its date, which is the fact that matters for it.
   */
  const notifyTime = formatClockTime(reminder?.reminderTime ?? null);
  const repeatLabel = describeRecurrence(task.recurrenceRule);
  const scheduleValue = task.recurrenceRule
    ? [notifyTime, repeatLabel ? repeatLabel.charAt(0).toLowerCase() + repeatLabel.slice(1) : null]
        .filter(Boolean)
        .join(" · ")
    : task.scheduledFor
      ? [formatScheduleDate(task.scheduledFor), notifyTime].filter(Boolean).join(" · ")
      : notifyTime
        ? `${notifyTime} · every day until done`
        : "No date";

  /**
   * The next buzz, as a countdown rather than a clock time — that's what makes it read as a
   * nudge. Only today's notification qualifies: one that has already fired, or belongs to a
   * later day, says nothing about now.
   */
  const nudgeValue = (() => {
    const time = reminder?.reminderTime;
    if (!time || task.scheduledFor !== today) return "Not set";
    const [h, m] = time.split(":").map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    const minutes = Math.round((at.getTime() - Date.now()) / 60_000);
    if (minutes < 0) return "Not set";
    if (minutes < 1) return "Any moment now";
    if (minutes < 60) return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `At ${formatClockTime(time)}`;
  })();

  const keepNudgingValue = nudge
    ? `Every ${nudge.intervalMinutes} min · ${formatClockTime(nudge.startTime)}–${formatClockTime(nudge.endTime)}`
    : "Off";

  const footerLabel = isFocus
    ? focusMode === "pomodoro"
      ? `Start ${pomodoroCycles} round${pomodoroCycles === 1 ? "" : "s"}`
      : `Start ${regularMinutes} min session`
    : "Mark as done";

  return (
    <ScreenContainer wash="home">
      {/* The dots carry Delete as well as the link at the foot of the page: one for someone
          scanning the header, one for someone reading down. */}
      <DetailHeader
        onBack={() => navigation.goBack()}
        onMenu={() => setDeleteConfirmOpen(true)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <DetailTitle>{task.name}</DetailTitle>
          {/* A finished task's type is history — switching it couldn't change what already
              counted toward streak and progress. */}
          {finished ? null : <TaskTypeSwitch value={task.taskType} onChange={handleTaskTypeChange} />}
        </View>

        {isFocus && !finished ? (
          <DetailSection label="SESSION">
            <DetailCard style={styles.sessionCard}>
              {focusMode === "regular" ? (
                <SessionLength minutes={regularMinutes} onChange={setRegularMinutes} />
              ) : (
                <PomodoroPlan
                  minutes={pomodoroMinutes}
                  rounds={pomodoroCycles}
                  breakMinutes={POMODORO_BREAK_MINUTES}
                  onMinutes={setPomodoroMinutes}
                  onRounds={setPomodoroCycles}
                />
              )}
              <SessionModeSwitch value={focusMode} onChange={setFocusMode} />
            </DetailCard>
          </DetailSection>
        ) : null}

        {isFocus ? (
          <DetailSection label="GOAL">
            <GoalAttachmentCard
              goalName={goal?.name ?? null}
              daysDone={goal?.totalDaysActive ?? 0}
              targetDays={goal?.targetDays ?? 0}
              // Only when today hasn't already been counted — a goal moves once a day, however
              // many focus tasks you finish against it.
              todayCounts={!finished && !!goal && goal.lastActivityDate !== today}
              onPress={() => setGoalSheetOpen(true)}
            />
          </DetailSection>
        ) : null}

        <DetailSection label="TIMING">
          <DetailCard style={styles.timingCard}>
            <TimingRow
              first
              icon={<TimingCalendarIcon />}
              label="SCHEDULED"
              value={scheduleValue}
              /* Read-only once the task is finished: a repeat set here could never fire, and a
                 notification would be stopped on arrival. */
              action={finished ? undefined : task.scheduledFor || reminder ? "Change" : "Add"}
              onPress={finished ? undefined : () => setScheduleSheetOpen(true)}
            />
            {finished ? null : (
              <>
                <TimingRow
                  icon={<TimingAlarmIcon />}
                  label="ONE NUDGE"
                  value={nudgeValue}
                  action={nudgeValue === "Not set" ? "Pick" : "Edit"}
                  onPress={() => setQuickSheetOpen(true)}
                />
                <TimingRow
                  icon={<TimingRepeatIcon />}
                  label="KEEP NUDGING"
                  value={keepNudgingValue}
                  action={nudge ? "Edit" : "Add"}
                  onPress={() => setNudgeSheetOpen(true)}
                />
              </>
            )}
          </DetailCard>
        </DetailSection>

        {isFocus ? (
          <StreakNote>
            {`Finishing a session counts toward your streak and weekly progress${goal ? "" : " — goal or not"}.`}
          </StreakNote>
        ) : (
          <WhyNoGoalCard />
        )}

        {/* The reminder screen has less to say, so the design lets the page breathe and drops
            Delete to the bottom rather than leaving it floating under the last card. */}
        {isFocus ? null : <View style={styles.spacer} />}

        <DeleteTaskLink onPress={() => setDeleteConfirmOpen(true)} />
      </ScrollView>

      {finished ? null : (
        <DetailFooter
          label={footerLabel}
          tone={isFocus ? "start" : "done"}
          onPress={isFocus ? handleStartSession : handleMarkDone}
          disabled={starting}
        />
      )}

      <ScheduleSheet
        visible={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        onSubmit={handleSaveSchedule}
        submitting={updateTaskMutation.isPending}
        taskName={task.name}
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

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: {
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 13,
      // So the reminder screen's spacer has somewhere to push Delete down to.
      flexGrow: 1,
    },
    sessionCard: {
      paddingBottom: 15,
    },
    // Rows carry their own padding so the dividers between them run edge to edge.
    timingCard: {
      paddingVertical: 2,
    },
    spacer: {
      flex: 1,
    },
    missingContent: {
      paddingHorizontal: space.gutter,
      paddingTop: space.md,
      paddingBottom: 24,
    },
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
  });
