import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { failureHint } from "../api/client";
import {
  AppState,
  type AppStateStatus,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCreateGoalMutation,
  useDeleteGoalMutation,
  useGoalsQuery,
  useUpdateGoalMutation,
} from "../api/queries/useGoals";
import { useCurrentFocusSessionQuery } from "../api/queries/useFocusSessions";
import { focusSessionsApi, tasksApi } from "../api";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../api/queryKeys";
import { useStreakQuery, useTodayProgressQuery } from "../api/queries/useProgress";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useCreateTaskMutation, useReopenTaskMutation, useTasksQuery } from "../api/queries/useTasks";
import type { GoalDto, ReminderDto, TaskDto } from "../api/types";
import {
  GoalEditSheet,
  GoalRingCard,
  GoalsAddButton,
  HomeClosingLine,
  HomeDoneRow,
  HomeEmptyRow,
  HomeListHeader,
  HomeRuleHeader,
  HomeStatStrip,
  HomeTaskRow,
  type HomeRowKind,
  NotificationBlockBanner,
  FocusNowCard,
  ScreenContainer,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { usePreferences } from "../state/PreferencesContext";
import { useToast } from "../state/ToastContext";
import { useSession } from "../state/SessionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { px, textAtDesignSize as td, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import {
  formatAge,
  formatClockTime,
  formatFirstName,
  formatGreetingDate,
  formatInstantClock,
  greetingForHour,
  isToday,
} from "../utils/format";
import { readRunningSession, resumeSessionParams } from "../utils/focusSession";
import { forgetQuickFocusStub, isQuickFocusStub, markQuickFocusStub } from "../utils/quickFocusStubs";
import { setSessionPaused } from "../utils/sessionPause";
import { forgetSessionPosition, setSessionPosition } from "../utils/sessionPosition";
import { useAutoFinishStaleSession } from "../utils/useAutoFinishStaleSession";
import { useStartFocusSession } from "../utils/useStartFocusSession";
import { goalsRowLayout } from "../utils/goalsLayout";
import { POINTS_PER_MINUTE, REMINDER_POINTS } from "../utils/points";
import { belongsOnHome, formatScheduleDate, isOverdue, newestFirst } from "../utils/schedule";
import { useTodayKey } from "../utils/useTodayKey";
import type { RootStackParamList } from "../navigation/types";

/**
 * Named so the list ref can be typed. Left implicit, SectionList's ref falls back to its
 * default section shape, where `key` is optional — and every `section.key` read below then
 * has to cope with an undefined that never actually occurs.
 */
type HomeSection = { key: string; title: string; count: number; data: TaskDto[] };

/**
 * How many overdue rows Home shows before handing the rest to Scheduled.
 *
 * Three, against Scheduled's five: that screen is *for* the backlog and can give it a panel,
 * while here it sits under today's work and must not become the bulk of the screen. The number
 * is a cap on rows, never on the count in the header - a section that says "3" while twelve are
 * late would be worse than not showing it at all.
 */
const HOME_OVERDUE_PREVIEW = 3;

/**
 * How many undated rows Home shows before handing the rest to Scheduled.
 *
 * Five rather than overdue's three. These are not failures - they are things you meant to do
 * and simply have not dated - so a few more of them on the screen you work from is useful
 * rather than reproachful. The cap exists because Capture makes every task this way and
 * nothing ever ages one out, so without it this section quietly becomes the whole screen.
 */
const HOME_ANYTIME_PREVIEW = 5;

/**
 * How many times the walkthrough's last step may hop down the list towards its row before it
 * gives up and leaves the "find the task" card to do the job. Each hop is a quarter of a
 * second, so this is two and a half seconds at the outside.
 */
const TOUR_SCROLL_HOPS = 10;

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Gap between rows, and the space a section header leaves above itself. */
const ROW_GAP = 9;

/**
 * How often the running session's "15 min left" is recomputed. It reads the clock rather than
 * counting, so a slow tick only costs accuracy in the display, never in the count — and the
 * figure is in whole minutes anyway.
 */
const SESSION_TICK_MS = 15_000;

function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, intervalMs);
    // Timers don't fire reliably while the app is suspended, so a phone picked back up reads
    // the clock again rather than resuming from wherever the interval left off.
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [intervalMs, enabled]);
  return now;
}

export function HomeScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

  const tasksQuery = useTasksQuery("pending");
  // task-svc has no "completed today" endpoint — fetch completed tasks too and filter
  // client-side by completedAt's date.
  const completedTasksQuery = useTasksQuery("completed");
  const remindersQuery = useRemindersQuery();
  const streakQuery = useStreakQuery();
  const todayQuery = useTodayProgressQuery();
  const sessionQuery = useCurrentFocusSessionQuery();
  const markDoneMutation = useMarkTaskDoneMutation();
  const reopenTaskMutation = useReopenTaskMutation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const goalsQuery = useGoalsQuery();
  const createGoalMutation = useCreateGoalMutation();
  const updateGoalMutation = useUpdateGoalMutation();
  const deleteGoalMutation = useDeleteGoalMutation();

  const [finishingSession, setFinishingSession] = useState(false);
  /*
   * Quick focus makes the task *and* the session, two round trips, before the screen changes.
   * Without this the slider reset itself after the first frame and Home sat there looking as
   * though the slide had been refused.
   */
  const [creatingQuickFocus, setCreatingQuickFocus] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalDto | null>(null);
  const [creatingGoal, setCreatingGoal] = useState(false);
  /*
   * The goal the next quick sitting counts toward - for that one sitting, and no longer.
   *
   * Deliberately not remembered. Goal progress never decreases, so a sitting credited to the
   * wrong goal cannot be taken back, and a goal that quietly persisted from last Tuesday is
   * precisely how that happens: you slide without reading the chip and an hour of something
   * else lands on a goal you had forgotten was selected. Clearing it after each sitting makes
   * every credit something the user chose that time.
   *
   * It costs almost nothing to re-pick, because a goal counts *days*, not sittings - the
   * second sitting of a day toward the same goal moves it no further (GoalService.recordActivity
   * returns early once that day is already counted). So the choice only has to be made once on
   * any day it matters.
   */
  const [quickFocusGoalId, setQuickFocusGoalId] = useState<string | null>(null);

  // Home is strictly today: unscheduled tasks plus anything dated for today. Both future
  // work and missed work live on the Upcoming/Overdue tab — a task scheduled ahead lands
  // here on its own once its day arrives, and one that slips moves back off. The split is
  // owned by utils/schedule.ts so both screens read it identically; todayKey() is
  // evaluated once for the whole pass rather than per task.
  // Re-derived when the calendar day rolls over, not just when the data changes — an app left
  // open across midnight otherwise kept showing yesterday's Home.
  const today = useTodayKey();
  const session = sessionQuery.data ?? null;
  const tasks = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .filter((task) => belongsOnHome(task, today))
        // The running task is lifted out of the list into "Right now" — it shouldn't be in
        // both places, and the To do count follows it.
        .filter((task) => task.id !== session?.taskId),
    [tasksQuery.data, today, session?.taskId]
  );

  /**
   * Today's work and what slipped, told apart.
   *
   * Both belong on Home - a missed dated reminder has already gone silent, so dropping it here
   * too would lose it twice over - but mixed into one list they bury each other. Fifteen things
   * you did not do is a graveyard, and today's two actual tasks sit in the middle of it.
   *
   * Overdue is oldest first, so the thing that has waited longest is the one you see.
   *
   * A late *routine* deliberately stays with today's work rather than moving here. Scheduled
   * keeps repeating tasks out of its Overdue panel - they live under Recurring with an "N late"
   * note - so folding them in here would make this section count things the footer's "more in
   * Scheduled" leads to a panel that does not contain. It would also be the wrong advice: a
   * routine that slipped is still the thing to do today, and the next occurrence only exists
   * once this one is finished.
   */
  const isLooseAndLate = (task: TaskDto) => task.recurrenceRule == null && isOverdue(task, today);
  /*
   * Captured without a day. The app reads a null date as "today" on purpose - a thought you can
   * act on right now - but nothing ever ages one out, and Capture, the fastest way in, makes
   * every task this way. Left in with today's planned work they become the bulk of it.
   */
  const isUndated = (task: TaskDto) => task.scheduledFor == null;
  /*
   * Both newest first, and sorted here rather than left in the order the list happens to be
   * in (see newestFirst). For today's work that only stops a task put back by Undo from
   * reappearing at the bottom and then jumping to its place a moment later. For undated work
   * it is the difference between seeing what you just captured and not seeing it: only the
   * first five rows are drawn.
   */
  const todayTasks = useMemo(
    () => tasks.filter((task) => !isLooseAndLate(task) && !isUndated(task)).sort(newestFirst),
    [tasks, today]
  );
  const anytimeTasks = useMemo(() => tasks.filter(isUndated).sort(newestFirst), [tasks]);
  const overdueTasks = useMemo(
    () =>
      tasks
        .filter(isLooseAndLate)
        .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1)),
    [tasks, today]
  );
  const goals = goalsQuery.data ?? [];
  /*
   * Resolved against the live list rather than trusted from the id alone. The goal can be
   * deleted from this very screen while a pick is held, and sending a dead id would have the
   * server refuse the task - losing the sitting. An unresolvable id reads as no goal, which is
   * also what the card then says.
   */
  const quickFocusGoal = quickFocusGoalId ? goals.find((g) => g.id === quickFocusGoalId) ?? null : null;

  function handlePickQuickFocusGoal(goalId: string | null) {
    setQuickFocusGoalId(goalId);
  }

  const savingGoal = createGoalMutation.isPending || updateGoalMutation.isPending;
  /**
   * The notification each task fires on the day itself, if it has one — that's the time a row
   * shows. A week-before warning says nothing useful about today.
   *
   * isActive matters as much as the task id: the server keeps a stopped reminder's row rather
   * than deleting it, so an unfiltered map would still show a finished task's time.
   */
  const dayOfReminderByTaskId = useMemo(
    () =>
      new Map(
        (remindersQuery.data ?? [])
          .filter((r: ReminderDto) => r.isActive && r.reminderTime && (r.daysBefore ?? 0) === 0)
          .map((r: ReminderDto) => [r.taskId, r.reminderTime as string])
      ),
    [remindersQuery.data]
  );
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const { startIfNeeded, advance: advanceTour, activeStep: tourStep, tourTaskId, remeasure } = useTour();
  /**
   * Which row the walkthrough's last step points at: the task the user just made during the
   * tour. A task captured in the tour has no day, so it is the first row under ANYTIME (that
   * section is newest first). On a new account that is the first row on the screen; on an
   * account with a full day it is below TO DO and OVERDUE, which is why the last step scrolls
   * to it (see below).
   *
   * The fallback matters for a replayed tour, where the user may skip through without
   * creating anything: any focus task demonstrates the step, and focus over reminder
   * because the step's copy says to tap "Focus" while a reminder row's button reads "Done".
   */
  const tourRowId = useMemo(() => {
    const created = tourTaskId ? tasks.find((t) => t.id === tourTaskId) : undefined;
    return (created ?? tasks.find((t) => t.taskType === "focus") ?? tasks[0])?.id;
  }, [tasks, tourTaskId]);
  const currentStreak = streakQuery.data?.currentStreak ?? 0;
  const pointsToday = todayQuery.data?.pointsEarned ?? 0;
  const focusMinutesToday = todayQuery.data?.focusMinutes ?? 0;
  /**
   * Scoped to today deliberately: the "completed" query returns every task ever finished,
   * which would turn the done section into an ever-growing archive. Home is a today view —
   * the full history lives on Progress.
   *
   * Oldest first, the way the design lists them: the day reads as a sequence of things that
   * happened rather than as a stack with the most recent on top.
   */
  const completedToday = useMemo(
    () =>
      (completedTasksQuery.data ?? [])
        .filter((t) => t.completedAt && isToday(t.completedAt))
        .sort((a, b) => Date.parse(a.completedAt as string) - Date.parse(b.completedAt as string)),
    // `today` too: at midnight the list has to empty with the app open, and nothing else about
    // the data changes then — without it yesterday's finished work stayed under DONE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedTasksQuery.data, today]
  );

  /**
   * What a focus task is worth if its session runs the planned length — the server awards
   * POINTS_PER_MINUTE per full minute actually focused, so this is that rate applied to the
   * length the session will start at. A reminder is worth a flat amount whenever it's finished.
   */
  const {
    defaultFocusDurationMinutes,
    defaultFocusMode,
    defaultPomodoroCycles,
    dndDuringFocusEnabled,
    setDefaultFocusDurationMinutes,
    setDefaultFocusMode,
    setDefaultPomodoroCycles,
  } = usePreferences();
  const projectedFocusPoints = defaultFocusDurationMinutes * POINTS_PER_MINUTE;

  // Keyed rather than a boolean per section, so adding a third section later needs no new
  // state. Intentionally not persisted: collapsing is a "get this out of my way right now"
  // gesture, and a section still hidden tomorrow morning would just look like missing data.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // `count` is the real number of items and drives the header and the empty state; `data`
  // is what the list actually renders and goes empty when collapsed. Keeping them separate
  // is what stops a collapsed To do section from claiming there's nothing left to do.
  // The done section is omitted entirely rather than rendered empty.
  const sections = useMemo(
    () => [
      {
        key: "todo",
        title: "TO DO",
        count: todayTasks.length,
        data: collapsedSections.todo ? [] : todayTasks,
      },
      /*
       * Below today's work, and capped.
       *
       * Below, because today is what you came here to do; a backlog above it is a wall to climb
       * before reaching the point of the screen. Capped, because this is the one section that
       * grows without bound - nothing pushes a missed task off it the way a passing day moves an
       * upcoming one along - and three rows is three rows whether you are one behind or fifty.
       * The header still carries the real count, and the footer leads to Scheduled, where Move
       * all and Clear all live. Home should not grow bulk actions.
       */
      ...(overdueTasks.length > 0
        ? [
            {
              key: "overdue",
              title: "OVERDUE",
              count: overdueTasks.length,
              data: collapsedSections.overdue ? [] : overdueTasks.slice(0, HOME_OVERDUE_PREVIEW),
            },
          ]
        : []),
      /*
       * Below what slipped, because an undated task is not late - it never had a day to miss.
       * Newest first: the thing you just captured is the thing you most likely still mean to
       * do, and the age label is what speaks for the old ones.
       */
      ...(anytimeTasks.length > 0
        ? [
            {
              key: "anytime",
              title: "ANYTIME",
              count: anytimeTasks.length,
              data: collapsedSections.anytime ? [] : anytimeTasks.slice(0, HOME_ANYTIME_PREVIEW),
            },
          ]
        : []),
      ...(completedToday.length > 0
        ? [
            {
              key: "done",
              title: "DONE",
              count: completedToday.length,
              data: collapsedSections.done ? [] : completedToday,
            },
          ]
        : []),
    ],
    [todayTasks, overdueTasks, anytimeTasks, completedToday, collapsedSections]
  );

  const hasLoaded = tasksQuery.isSuccess && goalsQuery.isSuccess && remindersQuery.isSuccess && streakQuery.isSuccess;

  // Started from here rather than on sign-in: the first step points at a control on this
  // screen, so the tour must not begin until Home is actually rendered with real data and
  // that control can be measured.
  useEffect(() => {
    if (hasLoaded) startIfNeeded();
  }, [hasLoaded, startIfNeeded]);

  /**
   * Where the tour's row is in the list, in the terms scrollToLocation takes. A section's own
   * heading is its item 0, so the first task under it is item 1. Null when the row is not drawn
   * at all: its section is collapsed, it is past the section's limit, or there are no tasks.
   */
  const tourRowAt = useMemo(() => {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const at = sections[sectionIndex].data.findIndex((t) => t.id === tourRowId);
      if (at >= 0) return { sectionIndex, itemIndex: at + 1 };
    }
    return null;
  }, [sections, tourRowId]);
  // Read when the scroll fires rather than when it is scheduled - see the effect below.
  const tourRowAtRef = useRef(tourRowAt);
  tourRowAtRef.current = tourRowAt;

  /**
   * Put the tour's row on screen for the last step. Home is a tab that stays mounted, so its
   * list keeps whatever scroll position it had, and the row can be anywhere: a task made in
   * the tour sits under ANYTIME, below however much is due today and however much is late. Off
   * screen it reports no rect at all and the tour falls back to its "find the task" card.
   *
   * It used to scroll to the TO DO header, which was right while Home was one list with the
   * newest task as row one. With four sections that leaves the row below the fold as soon as
   * about eight things are due today (measured: on screen with 4, off it with 10).
   *
   * Once per row rather than once per step: the step begins the moment the task is saved,
   * which can be before the list has it, and until then the row is the stand-in (see
   * tourRowId). When the real one arrives this runs again and goes to that instead.
   */
  const listRef = useRef<SectionList<TaskDto, HomeSection>>(null);
  const scrolledForTourRow = useRef<TaskDto["id"] | "none" | null>(null);
  const tourScrollHops = useRef(0);
  const tourScrollTimers = useRef<{ retry?: ReturnType<typeof setTimeout>; measure?: ReturnType<typeof setTimeout> }>({});
  const scrollToTourRow = useCallback(() => {
    const at = tourRowAtRef.current;
    listRef.current?.scrollToLocation(
      at
        ? // A third of the way down: clear of the top edge, and with room underneath for the
          // tour's card, which is drawn below the row it points at when there is space.
          { ...at, viewPosition: 0.3, animated: true }
        : { sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: true }
    );
    // A programmatic animated scroll doesn't reliably fire onMomentumScrollEnd, so the
    // remeasure that keeps the spotlight glued to the row has to be triggered by hand.
    clearTimeout(tourScrollTimers.current.measure);
    tourScrollTimers.current.measure = setTimeout(remeasure, 550);
  }, [remeasure]);
  /**
   * The list can only scroll to a row it has already drawn, because until then it does not know
   * where the row is - and it draws a long list a screenful or so at a time. Asked for a row
   * further down than that, it calls this instead of scrolling (and with no handler at all, it
   * throws). So: go as far towards the row as the list can, which makes it draw the next
   * stretch, and ask again. A handful of hops reaches a row forty tasks down.
   *
   * Capped, so a list that never gets there cannot keep the screen moving. What is left then is
   * what there was before any of this: the tour's card saying to find the task.
   */
  const hopTowardsTourRow = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      if (tourScrollHops.current >= TOUR_SCROLL_HOPS) return;
      tourScrollHops.current += 1;
      listRef.current?.getScrollResponder()?.scrollTo({ y: index * averageItemLength, animated: false });
      clearTimeout(tourScrollTimers.current.retry);
      tourScrollTimers.current.retry = setTimeout(scrollToTourRow, 250);
    },
    [scrollToTourRow]
  );
  useEffect(() => {
    if (tourStep !== "start") {
      // Reset on the way out so stepping back and forward again scrolls afresh.
      scrolledForTourRow.current = null;
      return;
    }
    const row = tourRowId ?? "none";
    if (scrolledForTourRow.current === row) return;
    // Delayed because this fires while Home is still being navigated back to; a scroll
    // issued during the transition is dropped.
    const scrollTimer = setTimeout(() => {
      scrolledForTourRow.current = row;
      tourScrollHops.current = 0;
      scrollToTourRow();
    }, 350);
    return () => clearTimeout(scrollTimer);
  }, [tourStep, tourRowId, scrollToTourRow]);
  useEffect(() => {
    const timers = tourScrollTimers.current;
    return () => {
      clearTimeout(timers.retry);
      clearTimeout(timers.measure);
    };
  }, []);

  /* --------------------------------------------------------- right now */

  const now = useNow(SESSION_TICK_MS, !!session);
  const running = session ? readRunningSession(session, now) : null;
  const runningTask = useMemo(
    () => (session ? (tasksQuery.data ?? []).find((t) => t.id === session.taskId) ?? null : null),
    [session, tasksQuery.data]
  );

  // Closes a session that was started and never ended, once it can no longer earn anything.
  useAutoFinishStaleSession(session);

  const { start: startSession, starting: startingSession } = useStartFocusSession();
  const createTaskMutation = useCreateTaskMutation();

  /**
   * Slide-to-focus: make a task and start on it in one motion.
   *
   * A session has to belong to a task — that is how minutes, points, streak and goals are
   * credited — so "just start focusing" means creating one. It is named by the clock rather than
   * left blank, because a list of "Untitled" tells you nothing a week later.
   *
   * If the session is discarded the task goes with it (see useStartFocusSession): nothing was
   * credited, so nothing should be left behind.
   */
  async function handleQuickFocus() {
    if (creatingQuickFocus) return;
    setCreatingQuickFocus(true);
    try {
      const at = new Date();
      const task = await createTaskMutation.mutateAsync({
        name: `Quick focus · ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
        taskType: "focus",
        /*
         * The whole reason the chip exists. A goal only advances when a focus task is
         * *completed* carrying one, and a quick sitting of a minute or more does complete its
         * task - so this one field is what makes the ring below the slider move. A sitting
         * that is discarded, or runs under a minute, deletes the task instead and therefore
         * credits nothing, which needs no code here.
         */
        ...(quickFocusGoal ? { goalId: quickFocusGoal.id } : {}),
      });
      /*
       * Spent. The goal is on the task now, in the database, so the chip has nothing left to
       * describe except the *next* sitting - and that one starts from no goal, by design.
       *
       * Cleared here rather than when the session finishes, which is the same thing one step
       * later: the card shows the running timer instead of the chip for the whole sitting, so
       * there is no moment where a user could see the difference. Doing it here also means a
       * discarded sitting needs no cleanup of its own - the chip has already moved on.
       */
      setQuickFocusGoalId(null);
      await markQuickFocusStub(task.id);
      await startSession({
        taskId: task.id,
        focusMode: defaultFocusMode,
        blockMinutes: defaultFocusDurationMinutes,
        cycles: defaultFocusMode === "pomodoro" ? defaultPomodoroCycles : 1,
        createdTaskId: task.id,
      });
    } catch {
      showToast({ tone: "error", message: `Couldn't start - ${failureHint(null)}` });
    } finally {
      setCreatingQuickFocus(false);
    }
  }

  function handleResumeSession() {
    if (!session) return;
    navigation.navigate(
      "FocusSession",
      resumeSessionParams(session, defaultFocusDurationMinutes, dndDuringFocusEnabled)
    );
  }

  /**
   * Finishing a sitting from Home, once its clock has run out.
   *
   * The session screen owns the timer, so when it is not mounted nothing closes a block that
   * reached zero - the card sat at 00:00 and only auto-finish eventually tidied it up, five
   * minutes later. This is the same completion the session screen performs, minus the "keep the
   * task open?" question, which has no meaning here: the clock finished, so the sitting is done.
   *
   * `wasInterrupted` is false because it was not - the planned time ran out on its own.
   */
  async function handleFinishFromHome() {
    if (!session || finishingSession) return;
    setFinishingSession(true);
    const { id, taskId, focusMode: mode, numPomodoroCycles } = session;
    try {
      const completed = await focusSessionsApi.completeFocusSession(id, {
        wasInterrupted: false,
        ...(mode === "pomodoro" && numPomodoroCycles != null ? { numPomodoroCycles } : {}),
      });
      await setSessionPaused(id, false);
      forgetSessionPosition();

      // A quick focus exists only to carry the sitting, so it finishes with it rather than
      // lingering on Home as something still to do.
      if (await isQuickFocusStub(taskId)) {
        await forgetQuickFocusStub(taskId);
        await tasksApi.completeTask(taskId).catch(() => {});
      }

      queryClient.setQueryData(queryKeys.currentFocusSession(), null);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["todayProgress"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals() });

      // The figure the server credited, not one worked out here - the cap and the grace are
      // its rules, and a number from the phone would disagree with the stat strip beneath it.
      const minutes = Math.round((completed.durationSeconds ?? 0) / 60);
      showToast({ message: `Session done · +${completed.pointsEarned ?? 0} XP for ${minutes} min` });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't finish the session - ${failureHint(err)}` });
    } finally {
      setFinishingSession(false);
    }
  }

  /**
   * Moving a Pomodoro on to its next round without opening the session screen.
   *
   * Only the position moves; the session itself is untouched, because the server stores the
   * whole sitting and never hears about the rounds inside it. Straight into the work block
   * rather than through the break - tapping this is the user saying they are ready now, and a
   * break they have to sit through after asking to start would be the app arguing with them.
   */
  async function handleStartNextCycle(nextCycle: number, blockMs: number) {
    if (!session) return;
    setSessionPosition({
      sessionId: session.id,
      cycle: nextCycle,
      phase: "working",
      deadline: Date.now() + blockMs,
      pausedWithMsLeft: null,
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      tasksQuery.refetch(),
      completedTasksQuery.refetch(),
      goalsQuery.refetch(),
      remindersQuery.refetch(),
      streakQuery.refetch(),
      todayQuery.refetch(),
      sessionQuery.refetch(),
    ]);
    setRefreshing(false);
  }

  /**
   * Completing from Home, with a way back and a way to know when it didn't work.
   *
   * Both halves were missing. A failure here rolled the optimistic update back and the task
   * silently reappeared, with nothing on this screen able to say why — Home had no error
   * surface at all. And completing was irreversible, so a mis-tap on a one-tap button
   * destroyed the task outright.
   */
  async function handleMarkReminderDone(taskId: string, taskName: string) {
    try {
      await markDoneMutation.mutateAsync(taskId);
      await syncReminders();
      showToast({
        message: `“${taskName}” done`,
        action: { label: "Undo", onPress: () => handleUndo(taskId, taskName) },
      });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't complete “${taskName}” - ${failureHint(err)}` });
    }
  }

  async function handleUndo(taskId: string, taskName: string) {
    try {
      await reopenTaskMutation.mutateAsync(taskId);
      showToast({ message: `“${taskName}” put back` });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't undo - ${failureHint(err)}` });
    }
  }

  /*
   * Both used to let a failure escape as an unhandled rejection: the sheet sat there and nothing
   * was said. A toast draws beneath a sheet on a phone (the sheet is its own native window), so
   * on failure the sheet closes and the message shows on Home.
   */
  async function handleSaveGoal(fields: { name: string; color: string; targetDays: number }) {
    try {
      if (editingGoal) {
        await updateGoalMutation.mutateAsync({ goalId: editingGoal.id, request: fields });
      } else {
        await createGoalMutation.mutateAsync(fields);
        // Only a genuinely new goal completes the tour's first step — editing an existing
        // one isn't what was asked for.
        advanceTour("goal");
      }
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't save “${fields.name}” - ${failureHint(err)}` });
    }
    setEditingGoal(null);
    setCreatingGoal(false);
  }

  async function handleDeleteGoal() {
    if (!editingGoal) return;
    const goal = editingGoal;
    try {
      await deleteGoalMutation.mutateAsync(goal.id);
      showToast({ message: `“${goal.name}” deleted` });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't delete “${goal.name}” - ${failureHint(err)}` });
    }
    setEditingGoal(null);
  }

  if (!user) return null;

  const displayName = user.displayName || user.username;
  /*
   * Reset per account, not just per mount: the avatar is keyed on the signed-in user, and a
   * failure recorded for one account must not blank out the next one's picture after a
   * sign-out and sign-in on the same device.
   */
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [user.id]);
  const avatarUrl = avatarFailed ? null : user.avatarUrl;

  /**
   * What a row is. A task counting toward a goal shows as that first — it's the thing worth
   * seeing at a glance — then focus, then a reminder that actually notifies, and a plain task
   * for everything else.
   */
  function kindOf(task: TaskDto, goal: GoalDto | undefined, notifyTime: string | undefined): HomeRowKind {
    if (goal) return "goal";
    if (task.taskType === "focus") return "focus";
    return notifyTime ? "reminder" : "task";
  }

  /**
   * The line under a row's title - and for anything late, the day it slipped from.
   *
   * Home keeps overdue work deliberately (see utils/schedule.ts): a missed dated reminder has
   * already gone silent, because a notification whose moment has passed never fires again, so
   * dropping it from Home as well would lose it in both senses at once. But the row said only
   * "9 AM", which is what a task due *today* says - nine days late looked identical to due in
   * an hour, and the one fact that explained why it was still there was the one missing.
   *
   * The clock time gives way rather than being added to: once something is overdue, the hour
   * it would have buzzed at is the least useful thing on the row. Scheduled's Overdue panel
   * reached the same conclusion and words it the same way.
   */
  function detailOf(kind: HomeRowKind, task: TaskDto, goal: GoalDto | undefined, notifyTime: string | undefined) {
    if (isOverdue(task, today)) return `was due ${formatScheduleDate(task.scheduledFor!, today)}`;
    // What the row says about itself whatever its date: the goal it counts toward, how long
    // the session is, the hour it rings at.
    const own =
      kind === "goal"
        ? goal?.name ?? null
        : kind === "focus"
          ? `${defaultFocusDurationMinutes} min`
          : kind === "reminder"
            ? formatClockTime(notifyTime ?? null)
            : task.scheduledFor === today
              ? "today"
              : null;
    if (!isUndated(task)) return own;
    /*
     * How long an undated one has been waiting, once that is worth saying. A plain undated row
     * printed nothing at all under its title, so this morning's capture and a six-week-old one
     * looked identical - and because the list is newest-first, the old ones sink out of sight
     * rather than nagging. formatAge stays quiet for the first few days so the label means
     * something when it does appear.
     *
     * Added to what the row already says, never instead of it. When the age first arrived it
     * replaced the line outright, and every undated focus task lost its length, every goal task
     * lost its goal and every timed reminder lost its hour.
     */
    const age = formatAge(task.createdAt);
    return own && age ? `${own} · ${age}` : own ?? age;
  }

  /**
   * What TO DO says when nothing is planned for today.
   *
   * TO DO used to be the whole list, so "Nothing to do yet" under it was simply true. Now it is
   * one section of three, and it is empty far more often than the screen is: capture makes
   * every task undated, so most accounts have work in ANYTIME and none dated today. Printing
   * "Nothing to do yet - tap Foyg to capture something" directly above five things to do told
   * the user their captures had not counted.
   *
   * So the empty words are kept for when the screen really is empty, and otherwise the row says
   * only that nothing is *planned for today* and points at what is listed underneath.
   */
  const hasLate = overdueTasks.length > 0;
  const hasUndated = anytimeTasks.length > 0;
  const todoEmpty =
    !hasLate && !hasUndated
      ? {
          title: completedToday.length > 0 ? "All done for today" : "Nothing to do yet",
          body: "Tap Foyg below to capture something.",
        }
      : {
          title: completedToday.length > 0 ? "Nothing left for today" : "Nothing planned for today",
          body:
            hasLate && hasUndated
              ? "Overdue and anytime tasks are below."
              : hasLate
                ? "Your overdue tasks are below."
                : "Your anytime tasks are below.",
        };

  /**
   * True while a capped section is hiding rows. "That's everything for today" directly under
   * "12 more in Scheduled" is two lines disagreeing with each other, so the closing line waits
   * until everything there is can actually be seen from here.
   */
  const moreOnScheduled =
    overdueTasks.length > HOME_OVERDUE_PREVIEW || anytimeTasks.length > HOME_ANYTIME_PREVIEW;

  /**
   * Two goals fill the row exactly, as drawn. Beyond that they scroll, sized so the next one
   * shows at the edge — a third card hidden entirely behind the screen edge is a goal the user
   * has no reason to think exists.
   */
  const goalsInnerWidth = width - 2 * styles.listContent.paddingHorizontal;
  const { scroll: goalsScroll, cardWidth: scrollingGoalWidth } = goalsRowLayout(
    goalsInnerWidth,
    goals.length,
    ROW_GAP
  );

  const goalCards = goals.map((goal) => (
    <GoalRingCard
      key={goal.id}
      goal={goal}
      width={scrollingGoalWidth}
      onPress={() => setEditingGoal(goal)}
    />
  ));

  return (
    <ScreenContainer wash="home">
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        // Scrolling moves the tour's highlighted row without re-rendering it or firing
        // onLayout, so nothing else would tell the overlay its spotlight has gone stale.
        onMomentumScrollEnd={remeasure}
        onScrollEndDrag={remeasure}
        onScrollToIndexFailed={hopTowardsTourRow}
        // Headers scroll away with their section — sticking them would leave a label
        // pinned over the greeting and goals while those are still on screen.
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListHeaderComponent={
          <View>
            <View style={styles.greetingRow}>
              <View style={styles.greetingText}>
                <Text
                  numberOfLines={2}
                  style={td(T.h2, { fontSize: 22, letterSpacing: -0.44, lineHeight: 25, color: theme.color.text })}
                >
                  {greetingForHour()}, {formatFirstName(displayName)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={td(T.meta, { fontSize: 13, fontWeight: "400", color: theme.home.subtle, marginTop: 3 })}
                >
                  {formatGreetingDate()}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account"
                onPress={() => navigation.navigate("Main", { screen: "Settings" })}
                style={styles.avatar}
              >
                {/*
                  The Google account's own picture when there is one. It has been arriving all
                  along — the backend reads `picture` off the Firebase token at sign-up and
                  returns it as avatarUrl — and nothing ever rendered it.

                  The initial stays as the fallback, and it is a real one rather than a
                  placeholder: a phone-only account has no picture, Google doesn't always supply
                  one, and `avatarUrl` is only written when the account is first created, so any
                  account that predates its Google link still has none. `onError` falls back too,
                  because these URLs are hotlinked to Google's CDN and can start 404ing.
                */}
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                    accessibilityIgnoresInvertColors
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <Text style={td(T.body, { fontSize: 15, fontWeight: "800", color: theme.home.avatarInk })}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </Pressable>
            </View>

            <HomeStatStrip streak={currentStreak} points={pointsToday} focusMinutes={focusMinutesToday} />

            {/* Silent otherwise: nothing else on Home hints that a reminder won't arrive. */}
            <NotificationBlockBanner />

            {/*
              One card, two states: slide to start when nothing is running, the live timer when
              something is. It replaces the old "Right now" block, which only ever existed while a
              session was open — so starting one had no home on this screen at all.
            */}
            <View style={styles.focusNow}>
              <FocusNowCard
                minutes={defaultFocusDurationMinutes}
                mode={defaultFocusMode}
                cycles={defaultPomodoroCycles}
                onPick={(m, mode, c) => {
                  setDefaultFocusDurationMinutes(m);
                  setDefaultFocusMode(mode);
                  setDefaultPomodoroCycles(c);
                }}
                onStart={handleQuickFocus}
                starting={creatingQuickFocus || startingSession}
                /*
                 * Loud on an empty screen, an outline once there is a list. Every row carries
                 * its own Focus button, and those credit the sitting to the task you were
                 * actually working on; this one credits it to a task named after the clock.
                 * Whichever of the two is louder is the one people reach for.
                 */
                quiet={tasks.length > 0}
                goals={goals}
                goalId={quickFocusGoal?.id ?? null}
                onPickGoal={handlePickQuickFocusGoal}
                running={
                  session && running
                    ? {
                        sessionId: session.id,
                        taskName: runningTask?.name ?? "Focus session",
                        // Only the fallback now: the card prefers the position the session
                        // screen writes, which knows about breaks and pauses this cannot.
                        endsAt:
                          running.plannedMinutes != null
                            ? Date.parse(session.startedAt) + running.plannedMinutes * 60_000
                            : null,
                        plannedMs: running.plannedMinutes != null ? running.plannedMinutes * 60_000 : null,
                        cycles: session.focusMode === "pomodoro" ? session.numPomodoroCycles ?? 1 : 1,
                        onOpen: handleResumeSession,
                        onFinish: handleFinishFromHome,
                        onStartNextCycle: handleStartNextCycle,
                        finishing: finishingSession,
                      }
                    : null
                }
              />
            </View>

            <HomeRuleHeader
              label="GOALS"
              ink={theme.color.textLabel}
              style={styles.goalsHeader}
              trailing={
                <TourTarget step="goal">
                  <GoalsAddButton onPress={() => setCreatingGoal(true)} />
                </TourTarget>
              }
            />
            {goalsScroll ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalsRow}>
                {goalCards}
              </ScrollView>
            ) : goals.length > 0 ? (
              <View style={styles.goalsRow}>{goalCards}</View>
            ) : null}

          </View>
        }
        renderSectionHeader={({ section }) =>
          section.key === "anytime" ? (
            <HomeListHeader
              label={section.title}
              // The muted label, not today's amber and not overdue's red: nothing here is
              // urgent or failed, and colouring it either way would be a claim about work the
              // user has deliberately not committed to a day.
              ink={theme.color.textLabel}
              count={section.count}
              countBg={theme.home.countDoneBg}
              countInk={theme.home.countDoneInk}
              collapsed={!!collapsedSections.anytime}
              collapsedLabel="Show"
              expandedLabel="Hide"
              caret="up"
              onToggle={() => toggleSection("anytime")}
            />
          ) : section.key === "overdue" ? (
            <HomeListHeader
              label={section.title}
              ink={theme.color.danger}
              count={section.count}
              countBg={theme.schedulePanel.overdue.badgeBg}
              countInk={theme.schedulePanel.overdue.badgeFg}
              collapsed={!!collapsedSections.overdue}
              // "Hide" rather than "Collapse all": this section is one list, not the whole
              // screen, and it is the one people will want out of the way on a bad week.
              collapsedLabel="Show"
              expandedLabel="Hide"
              caret="up"
              onToggle={() => toggleSection("overdue")}
            />
          ) : section.key === "done" ? (
            <HomeListHeader
              label={section.title}
              ink={theme.color.textLabel}
              count={section.count}
              countBg={theme.home.countDoneBg}
              countInk={theme.home.countDoneInk}
              collapsed={!!collapsedSections.done}
              collapsedLabel="Show"
              expandedLabel="Hide"
              caret="up"
              onToggle={() => toggleSection("done")}
            />
          ) : (
            <HomeListHeader
              label={section.title}
              ink={theme.color.amberLabel}
              count={section.count}
              countBg={theme.home.countAmberBg}
              countInk={theme.home.countAmberInk}
              collapsed={!!collapsedSections.todo}
              collapsedLabel="Expand all"
              expandedLabel="Collapse all"
              caret="down"
              onToggle={section.count > 0 ? () => toggleSection("todo") : undefined}
            />
          )
        }
        // SectionList has no per-section empty state, and ListEmptyComponent only fires
        // when *every* section is empty — which would hide this the moment one task is
        // done. Rendering it as the To do section's footer keeps "nothing left to do"
        // correct even while the completed section below is full.
        renderSectionFooter={({ section }) =>
          /*
           * The overdue overflow, handed to the screen that can do something about it.
           *
           * Navigation, not an inline expansion like Scheduled's own "N more". Letting Home
           * grow to fifty overdue rows is the thing the cap exists to prevent, and the useful
           * next step when you are that far behind is Move all or Clear all - which live over
           * there. Nothing shows while the section is collapsed: an invitation to see more,
           * under a list you just hid, reads as a bug.
           */
          section.key === "anytime" ? (
            !collapsedSections.anytime && anytimeTasks.length > HOME_ANYTIME_PREVIEW ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See all ${anytimeTasks.length} undated tasks on Scheduled`}
                onPress={() => navigation.navigate("Main", { screen: "Scheduled" })}
                style={styles.overdueMore}
              >
                <Text style={td(T.meta, { fontSize: 13, fontWeight: "700", color: theme.color.textMuted })}>
                  {`${anytimeTasks.length - HOME_ANYTIME_PREVIEW} more in Scheduled`}
                </Text>
                <Text style={td(T.body, { color: theme.color.textMuted })}>›</Text>
              </Pressable>
            ) : null
          ) : section.key === "overdue" ? (
            !collapsedSections.overdue && overdueTasks.length > HOME_OVERDUE_PREVIEW ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See all ${overdueTasks.length} overdue tasks on Scheduled`}
                onPress={() => navigation.navigate("Main", { screen: "Scheduled" })}
                style={styles.overdueMore}
              >
                <Text style={td(T.meta, { fontSize: 13, fontWeight: "700", color: theme.color.danger })}>
                  {`${overdueTasks.length - HOME_OVERDUE_PREVIEW} more in Scheduled`}
                </Text>
                <Text style={td(T.body, { color: theme.color.danger })}>›</Text>
              </Pressable>
            ) : null
          ) : section.key === "todo" && section.count === 0 ? (
            <HomeEmptyRow title={todoEmpty.title} body={todoEmpty.body} />
          ) : null
        }
        renderItem={({ item, section }) => {
          const itemGoal = item.goalId ? goalsById.get(item.goalId) : undefined;
          const notifyTime = dayOfReminderByTaskId.get(item.id);
          const kind = kindOf(item, itemGoal, notifyTime);

          if (section.key === "done") {
            return (
              <HomeDoneRow
                kind={kind}
                title={item.name}
                detail={kind === "goal" ? itemGoal?.name ?? null : null}
                finishedAt={item.completedAt ? formatInstantClock(item.completedAt) : null}
                points={item.pointsEarned}
                onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
              />
            );
          }

          const isFocus = item.taskType === "focus";
          const row = (
            <HomeTaskRow
              kind={kind}
              title={item.name}
              detail={detailOf(kind, item, itemGoal, notifyTime)}
              /*
               * Red, unlike Scheduled's Overdue rows. Those sit inside a panel already titled
               * OVERDUE and tinted for it, so reddening each line as well would be a wall of
               * alarm. Home's TO DO is a neutral list, so a late row has to say so for itself -
               * which is exactly how Scheduled treats a late routine in its own neutral section.
               */
              detailTone={isOverdue(item, today) ? "danger" : "default"}
              points={isFocus ? projectedFocusPoints : REMINDER_POINTS}
              actionLabel={isFocus ? "Focus" : "Done"}
              // The whole row is inside the walkthrough's highlight, so opening the task by
              // tapping the row counts as completing the step just as much as the Focus
              // button does. Without this, that tap led away with the tour still running.
              onPress={() => {
                advanceTour("start");
                navigation.navigate("TaskDetail", { taskId: item.id });
              }}
              // Focus starts the session, rather than opening a screen to press Start on.
              // The settings that screen offers are the ones most people never change — the
              // length is already theirs, from Settings — so the middle step was a toll on
              // every sitting. Tapping the row still opens the task for the times it matters.
              onAction={() => {
                advanceTour("start");
                if (isFocus) void startSession({ taskId: item.id });
                else handleMarkReminderDone(item.id, item.name);
              }}
            />
          );

          return item.id === tourRowId ? (
            <TourTarget
              step="start"
              // The default copy names the Focus button, which a reminder row doesn't
              // have — it reads "Done" instead.
              body={
                isFocus
                  ? undefined
                  : "Tap Done when you’ve finished it. That’s the whole loop - capture, attach, done."
              }
            >
              {row}
            </TourTarget>
          ) : (
            row
          );
        }}
        ListFooterComponent={
          (tasks.length > 0 || completedToday.length > 0) && !moreOnScheduled ? (
            <HomeClosingLine>That’s everything for today</HomeClosingLine>
          ) : null
        }
      />

      <GoalEditSheet
        visible={!!editingGoal}
        goal={editingGoal}
        onClose={() => setEditingGoal(null)}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
        saving={savingGoal}
        deleting={deleteGoalMutation.isPending}
      />
      <GoalEditSheet
        visible={creatingGoal}
        onClose={() => setCreatingGoal(false)}
        onSave={handleSaveGoal}
        saving={savingGoal}
      />
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    focusNow: { paddingHorizontal: px(2), paddingTop: px(18), paddingBottom: px(10) },
    listContent: {
      paddingHorizontal: 18,
      paddingTop: 6,
      // Clears the capture button, which rides 40pt above the tab bar and would otherwise sit
      // over the last row.
      paddingBottom: 48,
    },
    greetingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    greetingText: {
      flex: 1,
    },
    avatar: {
      width: px(38),
      height: px(38),
      borderRadius: 12,
      backgroundColor: t.home.avatarBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      // So a photo can't paint over the rounded corners — Android ignores a parent's radius
      // when clipping a child unless the parent says to.
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    goalsHeader: {
      marginTop: 16,
      marginBottom: 9,
    },
    /** Reads as a link rather than a row: centred, no card, and the same red as the header. */
    overdueMore: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: px(4),
      minHeight: px(44),
      marginTop: px(2),
    },
    goalsRow: {
      flexDirection: "row",
      gap: ROW_GAP,
    },
    rowGap: {
      height: ROW_GAP,
    },
  });
