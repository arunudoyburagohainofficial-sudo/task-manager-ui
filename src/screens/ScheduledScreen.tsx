import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useReopenTaskMutation, useTasksQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import type { ReminderDto, TaskDto } from "../api/types";
import {
  Card,
  ConfirmModal,
  DateHeading,
  H1,
  Meta,
  MoveAllToTodayButton,
  OverdueRow,
  RecurringRow,
  SchedulePanel,
  ScreenContainer,
  ShowMoreButton,
  UpcomingRow,
} from "../components";
import { color, schedulePanel, space, text as t, type as T } from "../theme";
import { syncReminders } from "../notifications/useReminderSync";
import { useToast } from "../state/ToastContext";
import { formatClockTime } from "../utils/format";
import { recurrenceLabel } from "../utils/recurrence";
import { bucketFor, formatScheduleDate, groupByScheduledDate, todayKey } from "../utils/schedule";
import { useTodayKey } from "../utils/useTodayKey";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * How many overdue rows show before the panel folds the rest behind "N more".
 *
 * Overdue is the one section here that grows without bound — nothing pushes a missed task
 * back off the list the way a passing day moves an upcoming one along — so it's the only
 * one that needs a cap. Recurring is naturally bounded by how many routines a person keeps,
 * and Upcoming spreads itself across date headings rather than piling up in one column.
 */
const OVERDUE_PREVIEW = 5;

/**
 * Everything that isn't today's work: what slipped, what repeats, and what's booked ahead.
 *
 * Reads the same cached "pending" list Home does rather than fetching its own — one list,
 * split by utils/schedule.ts, so a task can never be missing from both screens or appear on
 * both at once.
 */
export function ScheduledScreen() {
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);
  const [overdueExpanded, setOverdueExpanded] = useState(false);

  const tasksQuery = useTasksQuery("pending");
  const remindersQuery = useRemindersQuery();
  const markDoneMutation = useMarkTaskDoneMutation();
  const reopenTaskMutation = useReopenTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const { showToast } = useToast();
  const [movingAll, setMovingAll] = useState(false);
  const [moveAllConfirm, setMoveAllConfirm] = useState(false);

  // Mirrors Home's handler — completing a reminder task has to resync the device's
  // scheduled notifications, or a stopped reminder keeps its pending local notification,
  // and it needs the same undo and the same failure feedback.
  async function handleMarkDone(taskId: string, taskName: string) {
    try {
      await markDoneMutation.mutateAsync(taskId);
      await syncReminders();
      showToast({
        message: `“${taskName}” done`,
        action: {
          label: "Undo",
          onPress: async () => {
            try {
              await reopenTaskMutation.mutateAsync(taskId);
              showToast({ message: `“${taskName}” put back` });
            } catch {
              showToast({ tone: "error", message: "Couldn't undo — check your connection." });
            }
          },
        },
      });
    } catch {
      showToast({ tone: "error", message: `Couldn't complete “${taskName}” — check your connection.` });
    }
  }

  const remindersByTaskId = useMemo(
    () =>
      new Map((remindersQuery.data ?? []).filter((r: ReminderDto) => r.isActive).map((r: ReminderDto) => [r.taskId, r])),
    [remindersQuery.data]
  );

  // One "today" for the whole pass, and re-derived when the day actually rolls over — so the
  // panels move a task from Upcoming to Overdue on their own rather than at the next refetch.
  const today = useTodayKey();
  const { overdue, recurring, lateRecurring, upcomingGroups, upcomingCount } = useMemo(() => {
    const pending = tasksQuery.data ?? [];

    /**
     * A recurring task appears in the Recurring panel and nowhere else on this screen.
     *
     * Only one occurrence of it exists at a time (see RecurrenceService), so listing it
     * under its date as well would print the same row twice on one screen — the exact
     * duplication a separate panel exists to avoid. Home is unaffected: a recurring task
     * due today still shows there, because that's where today's work is acted on, and this
     * panel is a standing index of routines rather than a second to-do list.
     */
    const repeats = pending.filter((task) => task.recurrenceRule != null);
    const oneOff = pending.filter((task) => task.recurrenceRule == null);

    const overdueTasks = oneOff
      .filter((task) => bucketFor(task, today) === "overdue")
      .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? 1 : -1));

    const upcoming = oneOff.filter((task) => bucketFor(task, today) === "upcoming");

    // Soonest next occurrence first — the routine you'll hit again first reads first.
    const repeatsSorted = [...repeats].sort((a, b) => {
      if (!a.scheduledFor) return 1;
      if (!b.scheduledFor) return -1;
      return a.scheduledFor < b.scheduledFor ? -1 : a.scheduledFor > b.scheduledFor ? 1 : 0;
    });

    /**
     * Late routines are surfaced in the Recurring panel, not folded into the Overdue count.
     *
     * Adding them to that badge was worse than leaving them out: the Overdue panel only ever
     * lists one-off tasks, so a badge reading 15 above 12 expandable rows is a number the
     * user can't reconcile with what's in front of them. A badge must count exactly what its
     * own panel contains; "you're also behind on these routines" belongs on the panel that
     * actually shows them.
     */
    const lateRecurring = repeats.filter((task) => bucketFor(task, today) === "overdue").length;

    return {
      overdue: overdueTasks,
      recurring: repeatsSorted,
      lateRecurring,
      upcomingGroups: groupByScheduledDate(upcoming),
      upcomingCount: upcoming.length,
    };
  }, [tasksQuery.data, today]);

  /**
   * Re-dates every overdue task to today, in one pass.
   *
   * Just the task's own scheduledFor now — one field, one write. Any notification time the
   * task has is untouched and carries over automatically, since the two are independent.
   */
  async function handleMoveAllToToday() {
    setMoveAllConfirm(false);
    setMovingAll(true);
    // Read fresh at press time rather than reusing the render-time value: this is a write,
    // and if the day rolled over between render and tap, the tasks should land on the real
    // today rather than on the date the screen happened to be showing.
    const targetDay = todayKey();
    // Still counted as we go rather than taken from overdue.length up front, so a failure
    // part-way through reports what actually moved instead of what was attempted.
    let moved = 0;
    try {
      for (const task of overdue) {
        await updateTaskMutation.mutateAsync({
          taskId: task.id,
          request: { scheduledFor: targetDay },
        });
        moved += 1;
      }
      await syncReminders();
      showToast({ message: `Moved ${moved} task${moved === 1 ? "" : "s"} to today` });
    } catch {
      showToast({ tone: "error", message: "Couldn't move everything — check your connection." });
    } finally {
      setMovingAll(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([tasksQuery.refetch(), remindersQuery.refetch()]);
    setRefreshing(false);
  }

  function openTask(taskId: string) {
    navigation.navigate("TaskDetail", { taskId });
  }

  /**
   * The reminder's clock time if it has one, otherwise the task type — one trailing word.
   * A silent reminder (date, no time) has nothing to show, so it falls through to the type
   * rather than printing an empty slot.
   */
  function trailingFor(task: TaskDto): string {
    const reminder = remindersByTaskId.get(task.id);
    const time = reminder ? formatClockTime(reminder.reminderTime) : null;
    if (time) return time;
    return task.taskType === "focus" ? "Focus" : "Reminder";
  }

  const visibleOverdue = overdueExpanded ? overdue : overdue.slice(0, OVERDUE_PREVIEW);
  const hiddenOverdue = overdue.length - visibleOverdue.length;
  const isEmpty = overdue.length === 0 && recurring.length === 0 && upcomingCount === 0;

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <H1 style={styles.title}>Scheduled</H1>

        {isEmpty ? (
          <Card style={styles.emptyCard}>
            <Text style={t(T.bodyLg, { color: color.text })}>Nothing scheduled</Text>
            <Meta style={styles.emptyText}>
              Open a task and set a date to plan it for a later day, or set it to repeat.
            </Meta>
          </Card>
        ) : null}

        {overdue.length > 0 ? (
          <SchedulePanel
            label="OVERDUE"
            count={overdue.length}
            tone="overdue"
            action={
              overdue.length > 1 && !movingAll ? (
                <MoveAllToTodayButton count={overdue.length} onPress={() => setMoveAllConfirm(true)} />
              ) : null
            }
          >
            {visibleOverdue.map((task) => {
              const reminder = remindersByTaskId.get(task.id);
              // Falls back to the task type when there's no clock time to show — a silent
              // schedule (date, no notification) has none, and the old form interpolated that
              // null into the subtitle as the literal word "null". Same rule as trailingFor
              // above, which this had drifted away from.
              const detail =
                (reminder ? formatClockTime(reminder.reminderTime) : null) ??
                (task.taskType === "focus" ? "Focus" : "Reminder");
              return (
                <OverdueRow
                  key={task.id}
                  title={task.name}
                  taskType={task.taskType}
                  // The day it slipped from — inside a flat panel there's no date heading
                  // above the row to carry that, unlike the grouped upcoming ones.
                  subtitle={`${detail} · was due ${formatScheduleDate(task.scheduledFor!)}`}
                  // A reminder task can be finished outright from here; a focus task opens
                  // its detail screen, where a session is actually started.
                  actionLabel={task.taskType === "focus" ? "Focus" : "Done"}
                  onAction={() =>
                    task.taskType === "focus" ? openTask(task.id) : handleMarkDone(task.id, task.name)
                  }
                  onPress={() => openTask(task.id)}
                />
              );
            })}
            {hiddenOverdue > 0 ? (
              <ShowMoreButton remaining={hiddenOverdue} onPress={() => setOverdueExpanded(true)} />
            ) : null}
          </SchedulePanel>
        ) : null}

        {recurring.length > 0 ? (
          <View style={styles.panelSpacing}>
            <SchedulePanel
              label="RECURRING"
              count={recurring.length}
              tone="neutral"
              // Says how many routines have slipped, where the rows themselves are — the
              // Overdue badge can't carry this without counting rows it doesn't list.
              note={lateRecurring > 0 ? `${lateRecurring} late` : undefined}
            >
              {recurring.map((task) => {
                const late = task.scheduledFor != null && task.scheduledFor < today;
                const next = task.scheduledFor
                  ? `${late ? "was due" : "next"} ${formatScheduleDate(task.scheduledFor, today)}`
                  : "on Home";
                return (
                  <RecurringRow
                    key={task.id}
                    title={task.name}
                    subtitle={[recurrenceLabel(task.recurrenceRule), next].filter(Boolean).join(" · ")}
                    subtitleColor={late ? color.danger : undefined}
                    onPress={() => openTask(task.id)}
                  />
                );
              })}
            </SchedulePanel>
          </View>
        ) : null}

        {upcomingCount > 0 ? (
          <>
            {/* Not a panel: Upcoming is the screen's baseline content, and boxing it too
                would leave the whole screen as three competing containers with nothing
                sitting at rest between them. */}
            <View style={styles.upcomingHeader}>
              <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: color.textMuted })}>UPCOMING</Text>
              <View style={styles.upcomingBadge}>
                <Text
                  style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: schedulePanel.neutral.badgeFg })}
                >
                  {upcomingCount}
                </Text>
              </View>
              <View style={styles.upcomingRule} />
            </View>
            {upcomingGroups.map(({ dateKey, tasks }) => (
              <View key={dateKey} style={styles.dateGroup}>
                <DateHeading label={formatScheduleDate(dateKey).toUpperCase()} />
                <View style={styles.dateGroupRows}>
                  {tasks.map((task) => (
                    <UpcomingRow
                      key={task.id}
                      title={task.name}
                      taskType={task.taskType}
                      trailing={trailingFor(task)}
                      onPress={() => openTask(task.id)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <ConfirmModal
        visible={moveAllConfirm}
        title="Move all to today?"
        message={`${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} will be rescheduled for today, keeping their times.`}
        confirmLabel="Move all"
        cancelLabel="Cancel"
        onConfirm={handleMoveAllToToday}
        onCancel={() => setMoveAllConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: 24,
    flexGrow: 1,
  },
  title: {
    marginBottom: 12,
  },
  panelSpacing: {
    marginTop: 14,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 22,
    marginBottom: 12,
  },
  upcomingBadge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: schedulePanel.neutral.badgeBg,
  },
  upcomingRule: {
    flex: 1,
    height: 1,
    backgroundColor: color.border,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateGroupRows: {
    gap: 8,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 20,
  },
  emptyText: {
    marginTop: 4,
    textAlign: "center",
  },
});
