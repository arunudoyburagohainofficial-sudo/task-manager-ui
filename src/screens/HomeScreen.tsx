import React, { useMemo, useState } from "react";
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
import { useTasksQuery } from "../api/queries/useTasks";
import type { GoalDto, ReminderDto } from "../api/types";
import {
  AddGoalCard,
  Card,
  CompletedRow,
  Eyebrow,
  Ferne,
  GoalCard,
  GoalEditSheet,
  H1,
  InfoTooltip,
  Meta,
  ScreenContainer,
  SectionHeader,
  StreakIconInline,
  TaskRow,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { useCompanion } from "../state/CompanionContext";
import { useSession } from "../state/SessionContext";
import { color, radius, space, text as t, type as T } from "../theme";
import { homeLine } from "../theme/companionCopy";
import { formatClockTime, formatFirstName, formatGreetingDate, greetingForHour, isToday } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const { tone } = useCompanion();
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
  const goalsQuery = useGoalsQuery();
  const createGoalMutation = useCreateGoalMutation();
  const updateGoalMutation = useUpdateGoalMutation();
  const deleteGoalMutation = useDeleteGoalMutation();

  const [editingGoal, setEditingGoal] = useState<GoalDto | null>(null);
  const [creatingGoal, setCreatingGoal] = useState(false);

  const tasks = tasksQuery.data ?? [];
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
  const currentStreak = streakQuery.data?.currentStreak ?? 0;
  // Scoped to today deliberately: the "completed" query returns every task ever finished,
  // which would turn the done section into an ever-growing archive. Home is a today view —
  // the full history lives on Progress.
  const completedToday = useMemo(
    () => (completedTasksQuery.data ?? []).filter((t) => t.completedAt && isToday(t.completedAt)),
    [completedTasksQuery.data]
  );
  const doneTodayCount = completedToday.length;

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

  async function handleMarkReminderDone(taskId: string) {
    await markDoneMutation.mutateAsync(taskId);
    await syncReminders();
  }

  async function handleSaveGoal(fields: { name: string; color: string; targetDays: number }) {
    if (editingGoal) {
      await updateGoalMutation.mutateAsync({ goalId: editingGoal.id, request: fields });
    } else {
      await createGoalMutation.mutateAsync(fields);
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
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        // Headers scroll away with their section — sticking them would leave a label
        // pinned over the greeting and goals while those are still on screen.
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.greetingRow}>
              <View style={styles.greetingText}>
                <H1 numberOfLines={2}>
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

            {/* today strip */}
            <View style={styles.todayStrip}>
              <Text style={t(T.label, { fontWeight: "600", color: color.textBody, flex: 1 })}>
                <Text style={t(T.label, { color: color.success })}>{doneTodayCount}</Text> done today
              </Text>
              <View style={styles.stripDivider} />
              <View style={styles.stripRight}>
                <Text style={t(T.label, { fontWeight: "600", color: color.textBody })}>
                  <Text style={t(T.label, { color: color.success })}>{currentStreak}-day</Text> streak
                </Text>
                <StreakIconInline />
                <InfoTooltip topic="streak" />
              </View>
            </View>

            {hasLoaded ? (
              <View style={styles.bubbleWrap}>
                <Card style={styles.bubbleCard}>
                  <Meta style={{ color: color.textBody }}>{homeLine(tone, currentStreak, doneTodayCount)}</Meta>
                </Card>
              </View>
            ) : null}

            {/* capture — Ferne is the hero, tap opens capture */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Capture a task"
              onPress={() => navigation.navigate("Capture")}
              style={styles.capture}
            >
              <Ferne size={92} />
              <Text style={t(T.body, { fontWeight: "700", color: color.success })}>Tap to capture</Text>
            </Pressable>

            <View style={styles.goalsHeader}>
              <Eyebrow>GOALS</Eyebrow>
              <InfoTooltip topic="goals" />
            </View>
            {/* "+ Goal" leads rather than trails: it stays reachable without scrolling
                past every existing goal once the list grows. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalsRow}
            >
              <AddGoalCard onPress={() => setCreatingGoal(true)} />
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
            labelColor={section.key === "done" ? color.doneCheck : color.amberLabel}
            countStyle={
              section.key === "done"
                ? { bg: color.fill, fg: color.textMuted }
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
          return (
            <View style={styles.rowSpacing}>
              <TaskRow
                title={item.name}
                taskType={item.taskType}
                goalName={itemGoal?.name}
                goalColor={itemGoal?.color ?? undefined}
                subtitle={reminder ? `⏰ ${formatClockTime(reminder.reminderTime)}` : null}
                actionLabel={item.taskType === "focus" ? "Focus" : "Done"}
                onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
                onAction={() =>
                  item.taskType === "focus"
                    ? navigation.navigate("TaskDetail", { taskId: item.id })
                    : handleMarkReminderDone(item.id)
                }
              />
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
  date: {
    marginTop: 4,
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
  todayStrip: {
    marginTop: 16,
    backgroundColor: "#F7F1E6",
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stripDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#DED4C2",
  },
  stripRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  bubbleWrap: {
    alignItems: "center",
    marginTop: space.base,
  },
  bubbleCard: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  capture: {
    alignItems: "center",
    gap: space.md,
    marginTop: 16,
  },
  goalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.gutter,
    marginBottom: space.sm,
  },
  goalsRow: {
    flexDirection: "row",
    gap: space.md,
    paddingRight: space.xs,
  },
  rowSpacing: {
    marginBottom: 9,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
