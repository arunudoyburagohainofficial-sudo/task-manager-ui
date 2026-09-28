import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useStreakQuery, useTodayProgressQuery } from "../api/queries/useProgress";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useReopenTaskMutation, useTasksQuery } from "../api/queries/useTasks";
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
  RightNowCard,
  RightNowHeader,
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
  formatClockTime,
  formatFirstName,
  formatGreetingDate,
  formatInstantClock,
  greetingForHour,
  isToday,
} from "../utils/format";
import { readRunningSession, resumeSessionParams } from "../utils/focusSession";
import { goalsRowLayout } from "../utils/goalsLayout";
import { POINTS_PER_MINUTE, REMINDER_POINTS } from "../utils/points";
import { belongsOnHome } from "../utils/schedule";
import { useTodayKey } from "../utils/useTodayKey";
import type { RootStackParamList } from "../navigation/types";

/**
 * Named so the list ref can be typed. Left implicit, SectionList's ref falls back to its
 * default section shape, where `key` is optional — and every `section.key` read below then
 * has to cope with an undefined that never actually occurs.
 */
type HomeSection = { key: string; title: string; count: number; data: TaskDto[] };

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
  const goalsQuery = useGoalsQuery();
  const createGoalMutation = useCreateGoalMutation();
  const updateGoalMutation = useUpdateGoalMutation();
  const deleteGoalMutation = useDeleteGoalMutation();

  const [editingGoal, setEditingGoal] = useState<GoalDto | null>(null);
  const [creatingGoal, setCreatingGoal] = useState(false);

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
  const goals = goalsQuery.data ?? [];
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
   * tour. It needs no scrolling to reach — the server returns pending tasks newest-first
   * (TaskService.getTasksForUser), so a just-created task is row one.
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
  const { defaultFocusDurationMinutes, dndDuringFocusEnabled } = usePreferences();
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
        count: tasks.length,
        data: collapsedSections.todo ? [] : tasks,
      },
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
    [tasks, completedToday, collapsedSections]
  );

  const hasLoaded = tasksQuery.isSuccess && goalsQuery.isSuccess && remindersQuery.isSuccess && streakQuery.isSuccess;

  // Started from here rather than on sign-in: the first step points at a control on this
  // screen, so the tour must not begin until Home is actually rendered with real data and
  // that control can be measured.
  useEffect(() => {
    if (hasLoaded) startIfNeeded();
  }, [hasLoaded, startIfNeeded]);

  /**
   * Put the tour's row back on screen for the last step. Home is a tab that stays mounted,
   * so its list keeps whatever scroll position it had — arriving at step 5 with the list
   * halfway down leaves the target (row one, since tasks come back newest-first) off the
   * top edge, where it reports no rect at all and the tour falls back to its hint card.
   *
   * Anchored to the TO DO header rather than to the row by index: index 0 of section 0 is
   * always measured, so this can't miss the way scrollToLocation on an unmeasured row can,
   * and it puts the row just below the top edge on any screen size.
   */
  const listRef = useRef<SectionList<TaskDto, HomeSection>>(null);
  const scrolledForTour = useRef(false);
  useEffect(() => {
    if (tourStep !== "start") {
      // Reset on the way out so stepping back and forward again scrolls afresh.
      scrolledForTour.current = false;
      return;
    }
    if (scrolledForTour.current) return;
    scrolledForTour.current = true;
    // Delayed because this fires while Home is still being navigated back to; a scroll
    // issued during the transition is dropped.
    const scrollTimer = setTimeout(() => {
      listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: true });
    }, 350);
    // A programmatic animated scroll doesn't reliably fire onMomentumScrollEnd, so the
    // remeasure that keeps the spotlight glued to the row has to be triggered by hand.
    const measureTimer = setTimeout(remeasure, 900);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(measureTimer);
    };
  }, [tourStep, remeasure]);

  /* --------------------------------------------------------- right now */

  const now = useNow(SESSION_TICK_MS, !!session);
  const running = session ? readRunningSession(session, now) : null;
  const runningTask = useMemo(
    () => (session ? (tasksQuery.data ?? []).find((t) => t.id === session.taskId) ?? null : null),
    [session, tasksQuery.data]
  );

  function handleResumeSession() {
    if (!session) return;
    navigation.navigate(
      "FocusSession",
      resumeSessionParams(session, defaultFocusDurationMinutes, dndDuringFocusEnabled)
    );
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
      showToast({ tone: "error", message: `Couldn't complete “${taskName}” — ${failureHint(err)}` });
    }
  }

  async function handleUndo(taskId: string, taskName: string) {
    try {
      await reopenTaskMutation.mutateAsync(taskId);
      showToast({ message: `“${taskName}” put back` });
    } catch (err) {
      showToast({ tone: "error", message: `Couldn't undo — ${failureHint(err)}` });
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
      showToast({ tone: "error", message: `Couldn't save “${fields.name}” — ${failureHint(err)}` });
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
      showToast({ tone: "error", message: `Couldn't delete “${goal.name}” — ${failureHint(err)}` });
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

  function detailOf(kind: HomeRowKind, task: TaskDto, goal: GoalDto | undefined, notifyTime: string | undefined) {
    if (kind === "goal") return goal?.name ?? null;
    if (kind === "focus") return `${defaultFocusDurationMinutes} min`;
    if (kind === "reminder") return formatClockTime(notifyTime ?? null);
    return task.scheduledFor === today ? "today" : null;
  }

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

            {/* Exists only while something is running — there's no empty version of it, so with
                nothing running the list simply starts higher. */}
            {session && running ? (
              <>
                <RightNowHeader />
                <RightNowCard
                  title={runningTask?.name ?? "Focus session"}
                  minutesLeft={running.minutesLeft}
                  minutesElapsed={running.minutesElapsed}
                  plannedMinutes={running.plannedMinutes}
                  fractionLeft={running.fractionLeft}
                  onResume={handleResumeSession}
                />
              </>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.key === "done" ? (
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
          section.key === "todo" && section.count === 0 ? (
            <HomeEmptyRow
              title={completedToday.length > 0 ? "All done for today" : "Nothing to do yet"}
              body="Tap Ferne below to capture something."
            />
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
              points={isFocus ? projectedFocusPoints : REMINDER_POINTS}
              actionLabel={isFocus ? "Focus" : "Done"}
              // The whole row is inside the walkthrough's highlight, so opening the task by
              // tapping the row counts as completing the step just as much as the Focus
              // button does. Without this, that tap led away with the tour still running.
              onPress={() => {
                advanceTour("start");
                navigation.navigate("TaskDetail", { taskId: item.id });
              }}
              onAction={() => {
                advanceTour("start");
                if (isFocus) navigation.navigate("TaskDetail", { taskId: item.id });
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
                  : "Tap Done when you’ve finished it. That’s the whole loop — capture, attach, done."
              }
            >
              {row}
            </TourTarget>
          ) : (
            row
          );
        }}
        ListFooterComponent={
          tasks.length > 0 || completedToday.length > 0 ? (
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
    goalsRow: {
      flexDirection: "row",
      gap: ROW_GAP,
    },
    rowGap: {
      height: ROW_GAP,
    },
  });
