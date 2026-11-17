import React, { useMemo, useState } from "react";
import { failureHint } from "../api/client";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useDeleteTaskMutation, useReopenTaskMutation, useTasksQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import type { GoalDto, ReminderDto, TaskDto } from "../api/types";
import { countUnfireable } from "../notifications/schedulingLogic";
import {
  Card,
  ConfirmModal,
  DateHeading,
  H1,
  Meta,
  ClearAllOverdueButton,
  MoveAllToTodayButton,
  NotificationBlockBanner,
  SchedulePanel,
  ScreenContainer,
  ShowMoreButton,
  HomeTaskRow,
  type HomeRowKind,
} from "../components";
import { RepeatIcon } from "../components/icons";
import { space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { syncReminders, withReminderSyncHeld } from "../notifications/useReminderSync";
import { useToast } from "../state/ToastContext";
import { usePreferences } from "../state/PreferencesContext";
import { useGoalsQuery } from "../api/queries/useGoals";
import { POINTS_PER_MINUTE, REMINDER_POINTS } from "../utils/points";
import { formatAge, formatClockTime } from "../utils/format";
import { recurrenceShortLabel } from "../utils/recurrence";
import { bucketFor, formatScheduleDate, groupByScheduledDate, newestFirst, todayKey } from "../utils/schedule";
import { useTodayKey } from "../utils/useTodayKey";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * How many overdue rows show before the panel folds the rest behind "N more".
 *
 * Overdue grows without bound — nothing pushes a missed task back off the list the way a
 * passing day moves an upcoming one along — so it needs a cap. Recurring is naturally bounded
 * by how many routines a person keeps, and Upcoming spreads itself across date headings rather
 * than piling up in one column.
 */
const OVERDUE_PREVIEW = 5;

/**
 * The same for Anytime, which is the other list here that only grows.
 *
 * An undated task has no day to arrive on, so it stays until somebody deals with it, and this
 * is a plain scrolling screen: every row shown is a row drawn. With the list unfolded, opening
 * the tab on a backlog of a thousand drew thirteen thousand page elements where Home, which
 * only draws what is near the screen, stays at about three hundred and fifty.
 *
 * Thirty rather than Overdue's five because this is where Home's "N more in Scheduled" leads:
 * somebody arriving from there has already seen five and came for the rest, so the fold has to
 * sit well past what they left. It is also the last thing on the screen, so a long list here
 * pushes nothing else down.
 */
const ANYTIME_PREVIEW = 30;

/**
 * Everything that isn't today's work: what slipped, what repeats, and what's booked ahead.
 *
 * Reads the same cached "pending" list Home does rather than fetching its own — one list,
 * split by utils/schedule.ts, so a task can never be missing from both screens or appear on
 * both at once.
 */
export function ScheduledScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [anytimeExpanded, setAnytimeExpanded] = useState(false);

  const tasksQuery = useTasksQuery("pending");
  const remindersQuery = useRemindersQuery();
  const markDoneMutation = useMarkTaskDoneMutation();
  const reopenTaskMutation = useReopenTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const deleteTaskMutation = useDeleteTaskMutation();
  const { showToast } = useToast();
  const [movingAll, setMovingAll] = useState(false);
  const [moveAllConfirm, setMoveAllConfirm] = useState(false);
  /** The upcoming task whose Cancel was tapped, held while the confirmation is open. */
  const [cancelTarget, setCancelTarget] = useState<TaskDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { defaultFocusDurationMinutes } = usePreferences();
  const goalsQuery = useGoalsQuery();
  const goalsById = useMemo(
    () => new Map((goalsQuery.data ?? []).map((g: GoalDto) => [g.id, g])),
    [goalsQuery.data]
  );
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

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
            } catch (err) {
              showToast({ tone: "error", message: `Couldn't undo - ${failureHint(err)}` });
            }
          },
        },
      });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't complete “${taskName}” - ${failureHint(err)}` });
    }
  }

  /**
   * Every active notification on a task, keyed by task — a list, not one row.
   *
   * This was `new Map(rows.map(r => [r.taskId, r]))`, which silently keeps only the *last* row
   * for a task while V018 allows three. Harmless for the two display call sites, which only
   * ever wanted one, but wrong for anything that has to reason about the whole set: the
   * move-all count below under-reported precisely the case it exists to catch, because
   * notifications arrive ordered by lead time descending, so the day-of one lands last, wins
   * the map, and is the one most likely to still be healthy. Verified live: a task with
   * week-before + day-before + day-of reported one stranded reminder where three were.
   */
  const remindersByTaskId = useMemo(() => {
    const byTask = new Map<string, ReminderDto[]>();
    for (const reminder of (remindersQuery.data ?? []).filter((r: ReminderDto) => r.isActive)) {
      const existing = byTask.get(reminder.taskId);
      if (existing) existing.push(reminder);
      else byTask.set(reminder.taskId, [reminder]);
    }
    return byTask;
  }, [remindersQuery.data]);

  /**
   * The single notification worth showing on a row: the one landing on the task's own day, or
   * failing that the closest to it. A row has space for one time, and the day-of is the one a
   * user reads as "when this pings me" — the lead times are warnings about it.
   */
  /**
   * Upcoming rows are Home's rows.
   *
   * They used to be a thinner thing of their own - a dot, a title and the word "Reminder" -
   * which made the same task look like two different kinds of object depending on which tab
   * you were on. Sharing HomeTaskRow means the mark, the meta line and the points pill are
   * decided in one place and cannot drift apart again.
   *
   * The action is the one real difference. Home offers Focus or Done, because today's work is
   * there to be done. Something scheduled for next week is not, so the only useful thing to
   * offer is calling it off.
   */
  function rowKindOf(task: TaskDto, goal: GoalDto | undefined): HomeRowKind {
    if (goal) return "goal";
    if (task.taskType === "focus") return "focus";
    /*
     * "reminder" even with no notification set, unlike Home.
     *
     * Home's fourth kind, "task", is for an undated scratch item - no day, no time, nothing to
     * announce. Nothing on this screen is that: every row here has a date. A dated reminder
     * with no time is still a reminder, and showing it as a plain task with an envelope said
     * the opposite of what the row was filed under.
     */
    return "reminder";
  }

  /**
   * "Every day · today" rather than "Repeats every day · next Today".
   *
   * The repeat glyph beside the title already says it repeats, so "Repeats" stutters against
   * it - recurrenceShortLabel exists for exactly this. And "next Today" is the kind of phrase
   * only a template writes. Both together were pushing every routine's meta onto two lines,
   * which made this section visibly taller than Upcoming when the point was to match it.
   */
  function routineDetail(task: TaskDto, late: boolean): string {
    const rule = recurrenceShortLabel(task.recurrenceRule);
    if (!task.scheduledFor) return [rule, "on Home"].filter(Boolean).join(" · ");
    const when = formatScheduleDate(task.scheduledFor, today);
    const next = task.scheduledFor === today ? "today" : late ? `was due ${when}` : `next ${when}`;
    return [rule, next].filter(Boolean).join(" · ");
  }

  function rowDetailOf(kind: HomeRowKind, goal: GoalDto | undefined, notifyTime: string | undefined) {
    if (kind === "goal") return goal?.name ?? null;
    if (kind === "focus") return `${defaultFocusDurationMinutes} min`;
    if (kind === "reminder") return formatClockTime(notifyTime ?? null);
    return null;
  }

  function displayReminder(taskId: string): ReminderDto | undefined {
    const list = remindersByTaskId.get(taskId);
    if (!list?.length) return undefined;
    return list.reduce((best, r) => ((r.daysBefore ?? 0) < (best.daysBefore ?? 0) ? r : best));
  }

  // One "today" for the whole pass, and re-derived when the day actually rolls over — so the
  // panels move a task from Upcoming to Overdue on their own rather than at the next refetch.
  const today = useTodayKey();
  const { overdue, recurring, lateRecurring, anytime, upcomingGroups, upcomingCount } = useMemo(() => {
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

    /*
     * Everything captured without a day.
     *
     * These had no home but Home: bucketFor reads a null date as "today", so they were in
     * neither Overdue nor Upcoming and this screen never showed them at all. That was tolerable
     * while Home listed every one of them, and stopped being so once Home capped the list -
     * "N more in Scheduled" has to lead somewhere that actually has them.
     *
     * Newest first, in the same order Home draws its five (see newestFirst), so the rows Home
     * shows are the top of this list and "N more" continues from where Home stopped. Each row
     * carries its own age so the old ones say so rather than just sinking.
     */
    const anytime = oneOff.filter((task) => task.scheduledFor == null).sort(newestFirst);

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
      anytime,
      upcomingGroups: groupByScheduledDate(upcoming),
      upcomingCount: upcoming.length,
    };
  }, [tasksQuery.data, today]);

  /**
   * Re-dates every overdue task to today, in one pass.
   *
   * Just the task's own scheduledFor — one field, one write. Notifications are offsets from the
   * task's day, so they follow it automatically and nothing here has to touch them.
   *
   * That automatic move is also the catch, and it's why this counts what it strands. Pulling a
   * task *forward* shortens its runway, and a lead time longer than what's left can no longer
   * fire — "a week before" on something now due today is a week ago. The schedule sheet warns
   * about that as you edit, but this changes dates with no sheet open, so without the count
   * below a bulk move would silence reminders and say only "Moved 5 tasks to today".
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
    let silenced = 0;
    try {
      // One sync for the whole move, after the last task, whether or not it got that far: a
      // move that failed half-way has still re-dated the first half, and their notifications
      // have to follow them.
      await withReminderSyncHeld(async () => {
        for (const task of overdue) {
          await updateTaskMutation.mutateAsync({
            taskId: task.id,
            request: { scheduledFor: targetDay },
          });
          moved += 1;
          // The whole set, judged against the day it just moved to rather than the day it came
          // from. Counted by the shared helper so this can't drift from how the sheet judges
          // the same thing.
          silenced += countUnfireable(remindersByTaskId.get(task.id) ?? [], targetDay);
        }
      });
      showToast({
        message:
          `Moved ${moved} task${moved === 1 ? "" : "s"} to today` +
          (silenced > 0
            ? ` · ${silenced} reminder${silenced === 1 ? "" : "s"} can't fire that soon - open ${
                silenced === 1 ? "it" : "them"
              } to pick a new time`
            : ""),
      });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't move everything - ${failureHint(err)}` });
    } finally {
      setMovingAll(false);
    }
  }

  /**
   * Deletes every overdue task.
   *
   * Deleted rather than completed, deliberately. Marking them done would credit points for work
   * that never happened and put rows in DONE claiming otherwise; the whole reason to reach for
   * this button is that these tasks stopped mattering, which is not the same as finishing them.
   *
   * Counted as it goes rather than from overdue.length up front, so a failure part-way through
   * reports what actually went instead of what was attempted - the same reasoning as the bulk
   * move above, and it matters more here because this cannot be undone.
   */
  async function handleClearAllOverdue() {
    setClearAllConfirm(false);
    setClearingAll(true);
    let removed = 0;
    try {
      /*
       * Their notifications go with them, and the device's queue is rebuilt from what is left -
       * once, at the end. Each delete asks for a rebuild of its own, which is right for one
       * task and was four requests per task here: sixty overdue tasks made about 240 requests,
       * and the server, which allows 200 a minute, began refusing the deletes themselves.
       */
      await withReminderSyncHeld(async () => {
        for (const task of overdue) {
          await deleteTaskMutation.mutateAsync(task.id);
          removed += 1;
        }
      });
      showToast({ message: `Deleted ${removed} overdue task${removed === 1 ? "" : "s"}` });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't delete everything - ${failureHint(err)}` });
    } finally {
      setClearingAll(false);
    }
  }

  /**
   * Calls one scheduled task off.
   *
   * Deleted rather than unscheduled, which is the same answer Clear all gives for the whole
   * panel - one row and the panel behave alike, so neither needs explaining in terms of the
   * other. Confirmed because it cannot be undone, and because a tap landing here by accident
   * would otherwise destroy a task rather than tick one off.
   */
  async function handleCancelTask() {
    const task = cancelTarget;
    if (!task) return;
    setCancelling(true);
    try {
      await deleteTaskMutation.mutateAsync(task.id);
      // Its notifications go with it, and the device's queue is rebuilt from what is left.
      await syncReminders();
      showToast({ message: task.recurrenceRule ? `“${task.name}” stopped` : `“${task.name}” cancelled` });
      setCancelTarget(null);
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't cancel “${task.name}” - ${failureHint(err)}` });
    } finally {
      setCancelling(false);
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

  const visibleOverdue = overdueExpanded ? overdue : overdue.slice(0, OVERDUE_PREVIEW);
  const hiddenOverdue = overdue.length - visibleOverdue.length;
  const visibleAnytime = anytimeExpanded ? anytime : anytime.slice(0, ANYTIME_PREVIEW);
  const hiddenAnytime = anytime.length - visibleAnytime.length;
  const isEmpty = overdue.length === 0 && recurring.length === 0 && upcomingCount === 0 && anytime.length === 0;

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <H1 style={styles.title}>Scheduled</H1>

        {/*
          Above everything, because it invalidates everything below it: every date and repeat on
          this screen implies a notification that isn't going to arrive.
        */}
        <NotificationBlockBanner />

        {isEmpty ? (
          <Card style={styles.emptyCard}>
            <Text style={t(T.bodyLg, { color: theme.color.text })}>Nothing scheduled</Text>
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
              /*
               * Both offered from a single overdue task. Move all used to appear only at two or
               * more, which left the commonest case - one thing missed - with no bulk action and
               * no obvious way to deal with it at all.
               */
              !movingAll && !clearingAll ? (
                <View style={styles.panelActions}>
                  <MoveAllToTodayButton count={overdue.length} onPress={() => setMoveAllConfirm(true)} />
                  <ClearAllOverdueButton count={overdue.length} onPress={() => setClearAllConfirm(true)} />
                </View>
              ) : null
            }
          >
            {visibleOverdue.map((task) => {
              const goal = task.goalId ? goalsById.get(task.goalId) : undefined;
              /*
               * The day it slipped from, and only that.
               *
               * Inside a flat panel there is no date heading above the row to carry it, unlike
               * the grouped upcoming ones. The clock time used to lead here too, but once
               * something is overdue the hour it would have buzzed at is the least useful fact
               * on the row - and carrying both pushed every line onto two, leaving this section
               * visibly bulkier than the two below it.
               */
              const detail = `was due ${formatScheduleDate(task.scheduledFor!)}`;
              return (
                <HomeTaskRow
                  key={task.id}
                  kind={rowKindOf(task, goal)}
                  title={task.name}
                  detail={detail}
                  /*
                   * Not "danger", unlike a late routine. That one sits in a neutral section
                   * and has to say so for itself; these are already inside a panel titled
                   * OVERDUE and tinted for it, and reddening every line as well turns a
                   * backlog into a wall of alarm.
                   */
                  showPoints={false}
                  // Focus and Done, not Cancel: this is the one section where the useful
                  // thing is catching up. Removing them in bulk is what Clear all is for.
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

        {/*
          No card around these any more. Overdue keeps one because it is a state you are meant
          to notice; Recurring and Upcoming are both just lists of what is coming, so they get
          the same plain heading and the same rows. A box around one and not the other made
          them look like different kinds of thing.
        */}
        {recurring.length > 0 ? (
          <View style={styles.panelSpacing}>
            <View style={styles.upcomingHeader}>
              <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: theme.color.textMuted })}>
                RECURRING
              </Text>
              <View style={styles.upcomingBadge}>
                <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.schedulePanel.neutral.badgeFg })}>
                  {recurring.length}
                </Text>
              </View>
              <View style={styles.upcomingRule} />
              {/* Says how many routines have slipped, where the rows themselves are — the
                  Overdue badge can't carry this without counting rows it doesn't list. */}
              {lateRecurring > 0 ? (
                <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.color.danger })}>
                  {`${lateRecurring} late`}
                </Text>
              ) : null}
            </View>
            <View style={styles.dateGroupRows}>
              {recurring.map((task) => {
                const late = task.scheduledFor != null && task.scheduledFor < today;
                const goal = task.goalId ? goalsById.get(task.goalId) : undefined;
                return (
                  <HomeTaskRow
                    key={task.id}
                    kind={rowKindOf(task, goal)}
                    title={task.name}
                    // The repeat glyph rides beside the title, so the tile stays free to say
                    // whether this is a focus task, a reminder or a goal.
                    titleAdornment={<RepeatIcon size={13} color={theme.color.textFaint} />}
                    detail={routineDetail(task, late)}
                    detailTone={late ? "danger" : "default"}
                    showPoints={false}
                    points={task.taskType === "focus" ? defaultFocusDurationMinutes * POINTS_PER_MINUTE : REMINDER_POINTS}
                    actionLabel="Cancel"
                    actionTone="quiet"
                    onPress={() => openTask(task.id)}
                    onAction={() => setCancelTarget(task)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {upcomingCount > 0 ? (
          <>
            {/* Not a panel: Upcoming is the screen's baseline content, and boxing it too
                would leave the whole screen as three competing containers with nothing
                sitting at rest between them. */}
            <View style={styles.upcomingHeader}>
              <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: theme.color.textMuted })}>UPCOMING</Text>
              <View style={styles.upcomingBadge}>
                <Text
                  style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.schedulePanel.neutral.badgeFg })}
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
                  {tasks.map((task) => {
                    const goal = task.goalId ? goalsById.get(task.goalId) : undefined;
                    const notifyTime = displayReminder(task.id)?.reminderTime ?? undefined;
                    const kind = rowKindOf(task, goal);
                    return (
                      <HomeTaskRow
                        key={task.id}
                        kind={kind}
                        title={task.name}
                        detail={rowDetailOf(kind, goal, notifyTime)}
                        points={task.taskType === "focus" ? defaultFocusDurationMinutes * POINTS_PER_MINUTE : REMINDER_POINTS}
                        showPoints={false}
                        actionLabel="Cancel"
                        actionTone="quiet"
                        onPress={() => openTask(task.id)}
                        onAction={() => setCancelTarget(task)}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/*
          Last, and unboxed like Upcoming.

          Last because nothing here is due: a task with no day cannot be late and cannot be
          next, so putting it above either would be claiming an urgency the user declined to
          give it. It is the pile you dip into, not the pile that is coming at you.

          Every row says how long it has been sitting, which is the whole reason this section
          is worth having - Home shows only the newest few, and the old ones were sinking out
          of sight with nothing to say for themselves.
        */}
        {anytime.length > 0 ? (
          <>
            <View style={styles.upcomingHeader}>
              <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: theme.color.textMuted })}>
                ANYTIME
              </Text>
              <View style={styles.upcomingBadge}>
                <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.schedulePanel.neutral.badgeFg })}>
                  {anytime.length}
                </Text>
              </View>
              <View style={styles.upcomingRule} />
            </View>
            <View style={styles.dateGroupRows}>
              {visibleAnytime.map((task) => {
                const goal = task.goalId ? goalsById.get(task.goalId) : undefined;
                const notifyTime = displayReminder(task.id)?.reminderTime ?? undefined;
                /*
                 * A plain "task" when it has no day and nothing to announce - the one kind
                 * rowKindOf never returns, because every other row on this screen has a date.
                 * These are the same rows Home lists under ANYTIME, and the same task reading
                 * "Task" there and "Reminder" here looked like two different things.
                 */
                const kind: HomeRowKind =
                  goal || task.taskType === "focus" || notifyTime ? rowKindOf(task, goal) : "task";
                // What the row says on Home, then how long it has waited: the goal, the
                // session length or the hour it rings at is still true without a day.
                const detail =
                  [rowDetailOf(kind, goal, notifyTime), formatAge(task.createdAt)].filter(Boolean).join(" · ") || null;
                return (
                  <HomeTaskRow
                    key={task.id}
                    kind={kind}
                    title={task.name}
                    detail={detail}
                    points={task.taskType === "focus" ? defaultFocusDurationMinutes * POINTS_PER_MINUTE : REMINDER_POINTS}
                    showPoints={false}
                    actionLabel="Cancel"
                    actionTone="quiet"
                    onPress={() => openTask(task.id)}
                    onAction={() => setCancelTarget(task)}
                  />
                );
              })}
            </View>
            {/* The heading above still counts all of them; this is only how many are drawn. */}
            {hiddenAnytime > 0 ? (
              <View style={styles.anytimeMore}>
                <ShowMoreButton
                  remaining={hiddenAnytime}
                  what="anytime tasks"
                  tone="neutral"
                  onPress={() => setAnytimeExpanded(true)}
                />
              </View>
            ) : null}
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

      {/*
        A routine gets its own wording. Only one occurrence of a repeating task exists at a
        time, so the row looks like a single item - but cancelling it ends the series, and
        there is no later copy to come back. Saying "this task" there would be true of what is
        on screen and wrong about what happens.
      */}
      <ConfirmModal
        visible={cancelTarget != null}
        title={cancelTarget?.recurrenceRule ? "Stop this routine?" : "Cancel this task?"}
        message={
          cancelTarget?.recurrenceRule
            ? `“${cancelTarget.name}” repeats, so this stops it for good - this occurrence and every one after it, along with their notifications. It won't be marked done and it won't count towards anything. This can't be undone.`
            : `“${cancelTarget?.name ?? ""}” will be removed, along with its notifications. It won't be marked done and it won't count towards anything. This can't be undone.`
        }
        confirmLabel={cancelTarget?.recurrenceRule ? "Stop it" : "Cancel it"}
        cancelLabel="Keep it"
        destructive
        loading={cancelling}
        onConfirm={handleCancelTask}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Spells out that nothing is kept and nothing comes back, because unlike every other
          bulk action on this screen this one destroys the tasks rather than moving them. */}
      <ConfirmModal
        visible={clearAllConfirm}
        title="Delete all overdue?"
        message={`${overdue.length} overdue task${
          overdue.length === 1 ? "" : "s"
        } will be removed, along with their notifications. They won't be marked done and they won't count towards anything. This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={clearingAll}
        onConfirm={handleClearAllOverdue}
        onCancel={() => setClearAllConfirm(false)}
      />
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: space.gutter,
      paddingTop: space.sm,
      paddingBottom: 24,
      flexGrow: 1,
    },
    /*
     * Room under the Anytime expander. It is centred and it is the last thing on the screen,
     * which is exactly where the docked mascot rises out of the tab bar: with only the page's
     * own bottom padding the pill came to rest touching her circle, on the one control the
     * reader had scrolled down here to press.
     */
    anytimeMore: {
      paddingBottom: 28,
    },
    title: {
      marginBottom: 12,
    },
    panelSpacing: {
      marginTop: 14,
    },
    /** Two bulk actions sit in the slot that used to hold one. */
    panelActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
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
      backgroundColor: t.schedulePanel.neutral.badgeBg,
    },
    upcomingRule: {
      flex: 1,
      height: 1,
      backgroundColor: t.color.border,
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
