import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCreateGoalMutation,
  useDeleteGoalMutation,
  useGoalsQuery,
  useUpdateGoalMutation,
} from "../api/queries/useGoals";
import { useStreakQuery } from "../api/queries/useProgress";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useReopenTaskMutation, useTasksQuery } from "../api/queries/useTasks";
import type { GoalDto, ReminderDto, TaskDto } from "../api/types";
import {
  AddGoalCard,
  Card,
  CompletedRow,
  Eyebrow,
  Ferne,
  GoalCard,
  GoalEditSheet,
  H1,
  CaptureRing,
  DoneCheckIcon,
  GoalTargetIcon,
  InfoTooltip,
  Meta,
  ScreenContainer,
  SectionHeader,
  StatChip,
  StreakIconInline,
  TaskRow,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { usePreferences } from "../state/PreferencesContext";
import { useToast } from "../state/ToastContext";
import { useSession } from "../state/SessionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { color, radius, space, text as t, type as T } from "../theme";
import { formatClockTime, formatFirstName, formatGreetingDate, greetingForHour, isToday } from "../utils/format";
import { belongsOnHome } from "../utils/schedule";
import { useTodayKey } from "../utils/useTodayKey";
import type { RootStackParamList } from "../navigation/types";

/**
 * Named so the list ref can be typed. Left implicit, SectionList's ref falls back to its
 * default section shape, where `key` is optional — and every `section.key` read below then
 * has to cope with an undefined that never actually occurs.
 */
type HomeSection = { key: string; title: string; count: number; data: TaskDto[] };

/**
 * Mirrors FocusSessionService.POINTS_PER_MINUTE. Duplicated rather than fetched because
 * the server exposes no rate endpoint — if that constant ever changes, this is the one
 * place the client has to follow it.
 */
const POINTS_PER_MINUTE = 1;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);

  const tasksQuery = useTasksQuery("pending");
  // task-svc has no "completed today" endpoint — fetch completed tasks too and filter
  // client-side by completedAt's date.
  const completedTasksQuery = useTasksQuery("completed");
  const remindersQuery = useRemindersQuery();
  const streakQuery = useStreakQuery();
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
  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => belongsOnHome(task, today)),
    [tasksQuery.data, today]
  );
  const goals = goalsQuery.data ?? [];
  const savingGoal = createGoalMutation.isPending || updateGoalMutation.isPending;
  // Filtered to isActive for the same reason as TaskDetailScreen's lookup — the server
  // keeps a stopped reminder's row around rather than deleting it, so an unfiltered map
  // would still show its ⏰ time on the To do row it belongs to.
  const remindersByTaskId = useMemo(
    () =>
      new Map((remindersQuery.data ?? []).filter((r: ReminderDto) => r.isActive).map((r: ReminderDto) => [r.taskId, r])),
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
  // Scoped to today deliberately: the "completed" query returns every task ever finished,
  // which would turn the done section into an ever-growing archive. Home is a today view —
  // the full history lives on Progress.
  const completedToday = useMemo(
    () => (completedTasksQuery.data ?? []).filter((t) => t.completedAt && isToday(t.completedAt)),
    [completedTasksQuery.data]
  );
  const doneTodayCount = completedToday.length;
  const activeGoalCount = useMemo(() => goals.filter((g) => g.status === "active").length, [goals]);
  /** Drives the DONE TODAY chip's "N/M" fraction. */
  const todayTotal = tasks.length + doneTodayCount;

  /**
   * What a focus task is worth if its session runs the planned length. Not a stored value
   * — the server awards POINTS_PER_MINUTE (1) per full minute actually focused, so this is
   * that same rate applied to the length the session will start at. Reminder tasks earn no
   * points at all and get no tag rather than a made-up one.
   */
  const { defaultFocusDurationMinutes } = usePreferences();
  const projectedXp = defaultFocusDurationMinutes * POINTS_PER_MINUTE;

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
              title: "COMPLETED TODAY",
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

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      tasksQuery.refetch(),
      completedTasksQuery.refetch(),
      goalsQuery.refetch(),
      remindersQuery.refetch(),
      streakQuery.refetch(),
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
    } catch {
      showToast({ tone: "error", message: `Couldn't complete “${taskName}” — check your connection.` });
    }
  }

  async function handleUndo(taskId: string, taskName: string) {
    try {
      await reopenTaskMutation.mutateAsync(taskId);
      showToast({ message: `“${taskName}” put back` });
    } catch {
      showToast({ tone: "error", message: "Couldn't undo — check your connection." });
    }
  }

  async function handleSaveGoal(fields: { name: string; color: string; targetDays: number }) {
    if (editingGoal) {
      await updateGoalMutation.mutateAsync({ goalId: editingGoal.id, request: fields });
    } else {
      await createGoalMutation.mutateAsync(fields);
      // Only a genuinely new goal completes the tour's first step — editing an existing
      // one isn't what was asked for.
      advanceTour("goal");
    }
    setEditingGoal(null);
    setCreatingGoal(false);
  }

  async function handleDeleteGoal() {
    if (!editingGoal) return;
    await deleteGoalMutation.mutateAsync(editingGoal.id);
    setEditingGoal(null);
  }

  if (!user) return null;

  const displayName = user.displayName || user.username;

  return (
    <ScreenContainer>
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
        ListHeaderComponent={
          <View>
            <View style={styles.greetingRow}>
              <View style={styles.greetingText}>
                {/* H1 is sized for a single-word screen title ("Progress", "Settings") —
                    this is a full sentence, and a long name still wraps it to two lines at
                    that size, costing ~60pt right above a body that's now much denser. An
                    override here, not a change to H1 itself, since the single-word titles
                    elsewhere don't have this problem. */}
                <H1 numberOfLines={2} style={styles.greetingTitle}>
                  {greetingForHour()}, {formatFirstName(displayName)}
                </H1>
                <Meta style={styles.date} numberOfLines={1}>
                  {formatGreetingDate()}
                </Meta>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account"
                onPress={() => navigation.navigate("Main", { screen: "Settings" })}
                style={styles.avatar}
              >
                <Text style={t(T.body, { fontWeight: "800", color: "#6A4F6A" })}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </Pressable>
            </View>

            {/* One-word labels, measured rather than guessed: "DAY STREAK" and friends need
                108–116pt of the ~92pt a third of this row actually has, so they truncated on
                every screen size. The icon and number already say which stat this is, so the
                second word was the redundant part to drop. The streak keeps its tooltip —
                the explanation of the grace-day rule shouldn't vanish in a restyle. */}
            <View style={styles.statRow}>
              <StatChip
                tint="streak"
                icon={<StreakIconInline size={14} />}
                value={String(currentStreak)}
                label="STREAK"
                trailing={<InfoTooltip topic="streak" />}
              />
              <StatChip
                tint="done"
                icon={<DoneCheckIcon size={14} />}
                value={String(doneTodayCount)}
                // "2/4" rather than "2": the count alone can't tell you whether the day is
                // nearly finished or barely started.
                outOf={todayTotal > 0 ? String(todayTotal) : undefined}
                label="DONE"
              />
              <StatChip
                tint="goals"
                icon={<GoalTargetIcon size={14} />}
                value={String(activeGoalCount)}
                label="GOALS"
              />
            </View>

            {/* capture — Ferne is the hero, tap opens capture */}
            <TourTarget step="capture" style={styles.capture}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Capture tasks"
                onPress={() => {
                  advanceTour("capture");
                  navigation.navigate("Capture");
                }}
                style={styles.captureInner}
              >
                {/* The ring is a frame around Ferne, not a second control: it renders with
                    pointerEvents none inside the same Pressable, so the capture button is
                    still one tappable region and the walkthrough still measures one target. */}
                <CaptureRing size={104}>
                  {/* Ferne's face carries the same message the line below her does: a
                      broken streak gets the warm "come back" look rather than the neutral
                      resting one. */}
                  <Ferne size={84} state={currentStreak === 0 ? "nudge" : "idle"} />
                </CaptureRing>
                <Text style={t(T.body, { fontSize: 14, fontWeight: "800", color: color.success })}>Tap to capture tasks</Text>
              </Pressable>
            </TourTarget>

            <View style={styles.goalsHeader}>
              <Eyebrow>GOALS</Eyebrow>
              <InfoTooltip topic="goals" />
              {/* Trailing rule, matching the TO DO / COMPLETED headers below — without it
                  GOALS was the only section label on the screen left hanging. */}
              <View style={styles.goalsRule} />
            </View>
            {/* "+ Goal" leads rather than trails: it stays reachable without scrolling
                past every existing goal once the list grows. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalsRow}
            >
              <TourTarget step="goal" style={styles.goalTourTarget}>
                <AddGoalCard onPress={() => setCreatingGoal(true)} />
              </TourTarget>
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} width={150} onPress={() => setEditingGoal(goal)} />
              ))}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            label={section.title}
            count={section.count}
            collapsed={!!collapsedSections[section.key]}
            onToggle={() => toggleSection(section.key)}
            labelColor={section.key === "done" ? "#5F7226" : color.amberLabel}
            countStyle={
              section.key === "done"
                ? { bg: "#EAF0D8", fg: "#5F7226" }
                : { bg: color.amberFill, fg: "#8A6112" }
            }
          />
        )}
        // SectionList has no per-section empty state, and ListEmptyComponent only fires
        // when *every* section is empty — which would hide this the moment one task is
        // done. Rendering it as the To do section's footer keeps "nothing left to do"
        // correct even while the completed section below is full.
        renderSectionFooter={({ section }) =>
          section.key === "todo" && section.count === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={t(T.bodyLg, { color: color.text })}>
                {doneTodayCount > 0 ? "All done for today" : "No tasks yet"}
              </Text>
              <Meta style={{ marginTop: 4 }}>Tap Ferne above to capture something.</Meta>
            </Card>
          ) : null
        }
        renderItem={({ item, section }) => {
          if (section.key === "done") {
            return (
              <View style={styles.rowSpacing}>
                <CompletedRow
                  title={item.name}
                  taskType={item.taskType}
                  onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
                />
              </View>
            );
          }
          const reminder = remindersByTaskId.get(item.id);
          const itemGoal = item.goalId ? goalsById.get(item.goalId) : undefined;
          const isTourRow = item.id === tourRowId;
          const row = (
            <TaskRow
              title={item.name}
              taskType={item.taskType}
              goalName={itemGoal?.name}
              goalColor={itemGoal?.color ?? undefined}
              subtitle={
                reminder
                  ? formatClockTime(reminder.reminderTime)
                  : item.taskType === "focus"
                    ? `${defaultFocusDurationMinutes} min`
                    : null
              }
              xp={item.taskType === "focus" ? projectedXp : undefined}
              actionLabel={item.taskType === "focus" ? "Focus" : "Done"}
              // The whole row is inside the walkthrough's highlight, so opening the task by
              // tapping the row counts as completing the step just as much as the Focus
              // button does. Without this, that tap led away with the tour still running.
              onPress={() => {
                advanceTour("start");
                navigation.navigate("TaskDetail", { taskId: item.id });
              }}
              onAction={() => {
                advanceTour("start");
                if (item.taskType === "focus") navigation.navigate("TaskDetail", { taskId: item.id });
                else handleMarkReminderDone(item.id, item.name);
              }}
            />
          );
          return (
            <View style={styles.rowSpacing}>
              {isTourRow ? (
                <TourTarget
                  step="start"
                  // The default copy names the Focus button, which a reminder row doesn't
                  // have — it reads "Done" instead.
                  body={
                    item.taskType === "focus"
                      ? undefined
                      : "Tap Done when you’ve finished it. That’s the whole loop — capture, attach, done."
                  }
                >
                  {row}
                </TourTarget>
              ) : (
                row
              )}
            </View>
          );
        }}
      />

      <GoalEditSheet
        visible={!!editingGoal}
        goal={editingGoal}
        onClose={() => setEditingGoal(null)}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
        saving={savingGoal}
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

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: 24,
  },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.base,
  },
  greetingText: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 20,
    lineHeight: 24,
  },
  date: {
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    backgroundColor: "#F7F1E6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: space.sm,
  },
  capture: {
    marginTop: space.sm,
  },
  captureInner: {
    alignItems: "center",
    gap: space.sm,
  },
  goalsRule: {
    flex: 1,
    height: 1,
    backgroundColor: color.border,
    marginLeft: 2,
  },
  goalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.md,
    marginBottom: space.xs,
  },
  goalsRow: {
    flexDirection: "row",
    gap: space.md,
    paddingRight: space.xs,
  },
  /**
   * The tour wrapper sits between the goal strip and the "+ Goal" card, which has only a
   * minHeight and relied on being a direct child of the row to stretch to the height of
   * the real goal cards beside it. flexDirection:row makes this wrapper's cross axis
   * vertical, so its default alignItems:stretch passes that height back down to the card.
   */
  goalTourTarget: {
    flexDirection: "row",
  },
  rowSpacing: {
    marginBottom: 9,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
