import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCreateGoalMutation,
  useDeleteGoalMutation,
  useGoalsQuery,
  useUpdateGoalMutation,
} from "../api/queries/useGoals";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useStreakQuery } from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import type { GoalDto, ReminderDto } from "../api/types";
import { Body, Button, Card, CompanionBubble, GoalEditSheet, GoalStrip, HeroGreeting, InfoTooltip, Label, ScreenContainer, SectionLabel, Text } from "../components";
import { PulseCaptureButton } from "../components/PulseCaptureButton";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { homeLine } from "../theme/companionCopy";
import { formatClockTime, formatFirstName, formatGreetingDate, greetingForHour, isToday } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";
import { syncReminders } from "../notifications/useReminderSync";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greetingText: {
    flex: 1,
    marginRight: 12,
  },
  dateText: {
    marginTop: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.control,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 14,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    gap: 10,
    paddingBottom: 16,
  },
  bubbleWrapper: {
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    // Taller than the label needs, to give the whole row a comfortable tap target
    // rather than asking for a precise hit on ~13px of text.
    minHeight: 36,
  },
  goalsSection: {
    marginBottom: 4,
  },
  goalsSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  footerSpacer: {
    height: 8,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
    gap: 8,
  },
  emptyBody: {
    textAlign: "center",
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskCardDone: {
    // Recedes the finished pile without hiding it — the live list stays the brighter one.
    opacity: 0.7,
  },
  taskName: {
    flex: 1,
  },
  taskNameDone: {
    textDecorationLine: "line-through",
  },
  taskTagRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
  },
  taskButton: {
    minHeight: 48,
    paddingHorizontal: 16,
  },
});

export function HomeScreen() {
  const { colors } = useAppearance();
  const { tone } = useCompanion();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);

  // Cache-backed now (see src/api/queries/) instead of one local useState blob filled by
  // a hand-written Promise.all — every query here is shared with every other screen that
  // reads the same data, so e.g. navigating to Task Detail no longer re-fetches what Home
  // just fetched seconds earlier.
  const tasksQuery = useTasksQuery("pending");
  // task-svc has no "completed today" endpoint — fetch completed tasks too and filter
  // client-side by completedAt's date for the "done today" stat card.
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
  const remindersByTaskId = useMemo(
    () => new Map((remindersQuery.data ?? []).map((r: ReminderDto) => [r.taskId, r])),
    [remindersQuery.data]
  );
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
  // The done section is omitted entirely rather than rendered empty — an empty
  // "Completed · 0" is noise on a fresh day.
  const sections = useMemo(
    () => [
      {
        key: "todo",
        title: `To do · ${tasks.length}`,
        count: tasks.length,
        data: collapsedSections.todo ? [] : tasks,
      },
      ...(completedToday.length > 0
        ? [
            {
              key: "done",
              title: `Completed today · ${completedToday.length}`,
              count: completedToday.length,
              data: collapsedSections.done ? [] : completedToday,
            },
          ]
        : []),
    ],
    [tasks, completedToday, collapsedSections]
  );
  // Only true once every query has resolved at least once — same intent as the old
  // `data === null` check, so the greeting/companion bubble don't flash in before the
  // first real fetch completes.
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

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <HeroGreeting numberOfLines={2} ellipsizeMode="tail">
              {greetingForHour()}, {formatFirstName(user.displayName || user.username)}
            </HeroGreeting>
            <Body color={colors.textMuted} style={styles.dateText} numberOfLines={1}>
              {formatGreetingDate()}
            </Body>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Main", { screen: "Settings" })}
            style={[styles.avatar, { backgroundColor: colors.primaryTintBg }]}
          >
            <Text weight="bold" color={colors.primaryTintText}>
              {(user.displayName || user.username).charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.statsRow, { backgroundColor: colors.primaryTintBg }]}>
          <View style={styles.statItem}>
            <Text weight="bold" color={colors.primary}>
              {doneTodayCount}
            </Text>
            <Label>done today</Label>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.toggleOff }]} />
          <View style={styles.statItem}>
            <Text weight="bold" color={colors.secondaryText}>
              {currentStreak}-day
            </Text>
            <Label>streak 🔥</Label>
            <InfoTooltip topic="streak" color={colors.textFaint} />
          </View>
        </View>
      </View>

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        // Headers scroll away with their section — sticking them would leave a label
        // pinned over the greeting and goals while those are still on screen.
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            {hasLoaded ? (
              <View style={styles.bubbleWrapper}>
                <CompanionBubble text={homeLine(tone, currentStreak, doneTodayCount)} />
              </View>
            ) : null}
            <PulseCaptureButton onPress={() => navigation.navigate("Capture")} />

            <View style={styles.goalsSection}>
              <View style={styles.goalsSectionHeaderRow}>
                <SectionLabel>Goals</SectionLabel>
              </View>
              <GoalStrip goals={goals} onSelectGoal={setEditingGoal} onCreateGoal={() => setCreatingGoal(true)} />
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const isCollapsed = !!collapsedSections[section.key];
          return (
            <Pressable
              onPress={() => toggleSection(section.key)}
              style={styles.sectionHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded: !isCollapsed }}
              accessibilityLabel={`${section.title}, ${isCollapsed ? "collapsed" : "expanded"}`}
            >
              <SectionLabel>{section.title}</SectionLabel>
              <Body size={fontSize.micro} color={colors.textFaint}>
                {isCollapsed ? "▸" : "▾"}
              </Body>
            </Pressable>
          );
        }}
        // SectionList has no per-section empty state, and ListEmptyComponent only fires
        // when *every* section is empty — which would hide this the moment one task is
        // done. Rendering it as the To do section's footer keeps "nothing left to do"
        // correct even while the completed section below is full.
        renderSectionFooter={({ section }) =>
          section.key === "todo" && section.count === 0 ? (
            <View style={styles.emptyState}>
              <Body weight="semiBold">{doneTodayCount > 0 ? "All done for today 🎉" : "No tasks yet"}</Body>
              <Body color={colors.textMuted} style={styles.emptyBody}>
                Capture something above to get started.
              </Body>
            </View>
          ) : null
        }
        ListFooterComponent={<View style={styles.footerSpacer} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, section }) => {
          const done = section.key === "done";
          const reminder = remindersByTaskId.get(item.id);
          return (
            <Pressable onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}>
              <Card style={[styles.taskCard, done ? styles.taskCardDone : null]}>
                <View style={styles.taskName}>
                  <Body
                    weight="semiBold"
                    size={fontSize.body}
                    color={done ? colors.textMuted : undefined}
                    style={done ? styles.taskNameDone : undefined}
                  >
                    {item.name}
                  </Body>
                  {/* A reminder on a finished task is spent — showing its time would read
                      as something still scheduled. */}
                  {reminder && !done ? (
                    <View style={styles.taskTagRow}>
                      <Body size={fontSize.micro} color={colors.textFaint}>
                        ⏰ {formatClockTime(reminder.reminderTime)}
                      </Body>
                    </View>
                  ) : null}
                </View>
                {done ? (
                  <Text size={fontSize.bodyLg} color={colors.primary}>
                    ✓
                  </Text>
                ) : item.taskType === "focus" ? (
                  <Button
                    label="Focus"
                    onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
                    style={styles.taskButton}
                  />
                ) : (
                  <Button
                    label="Done"
                    variant="outlinePrimary"
                    onPress={() => handleMarkReminderDone(item.id)}
                    style={styles.taskButton}
                  />
                )}
              </Card>
            </Pressable>
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
