import React, { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useTasksQuery } from "../api/queries/useTasks";
import type { ReminderDto } from "../api/types";
import { Card, H1, Meta, ScreenContainer, SectionHeader, TaskRow } from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { color, space, text as t, type as T } from "../theme";
import { formatClockTime } from "../utils/format";
import { bucketFor, formatScheduleDate, groupByScheduledDate, todayKey } from "../utils/schedule";
import type { RootStackParamList } from "../navigation/types";
import { Text } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Everything scheduled past today, grouped by day. Reads the same cached "pending" list
 * Home does rather than fetching its own — one list, split by utils/schedule.ts, so a
 * task can never be missing from both screens or appear on both at once. It also means a
 * reschedule made here shows up on Home instantly off the same optimistic cache patch.
 */
export function ScheduledScreen() {
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);

  const tasksQuery = useTasksQuery("pending");
  const remindersQuery = useRemindersQuery();
  const goalsQuery = useGoalsQuery();
  const markDoneMutation = useMarkTaskDoneMutation();

  // Mirrors HomeScreen's handler — completing a reminder task has to resync the device's
  // scheduled notifications, or a stopped reminder keeps its pending local notification.
  async function handleMarkDone(taskId: string) {
    await markDoneMutation.mutateAsync(taskId);
    await syncReminders();
  }

  const goals = goalsQuery.data ?? [];
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const remindersByTaskId = useMemo(
    () =>
      new Map((remindersQuery.data ?? []).filter((r: ReminderDto) => r.isActive).map((r: ReminderDto) => [r.taskId, r])),
    [remindersQuery.data]
  );

  // todayKey() is read once per render rather than per task, so every task in a single
  // pass is bucketed against the same "today" even if the render straddles midnight.
  const { sections, overdueCount, upcomingCount } = useMemo(() => {
    const today = todayKey();
    const pending = tasksQuery.data ?? [];

    // Overdue is one flat, newest-miss-first section rather than a day-per-group: the
    // point is "these slipped, deal with them", and splitting three missed tasks across
    // three date headers buries that under structure nobody needs.
    const overdue = pending
      .filter((task) => bucketFor(task, today) === "overdue")
      .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? 1 : -1));
    const upcoming = pending.filter((task) => bucketFor(task, today) === "upcoming");

    const overdueSection = overdue.length
      ? [{ key: "overdue", title: "OVERDUE", count: overdue.length, data: overdue, overdue: true }]
      : [];
    const upcomingSections = groupByScheduledDate(upcoming).map(({ dateKey, tasks }) => ({
      key: dateKey,
      title: formatScheduleDate(dateKey, today).toUpperCase(),
      count: tasks.length,
      data: tasks,
      overdue: false,
    }));

    return {
      sections: [...overdueSection, ...upcomingSections],
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
    };
  }, [tasksQuery.data]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([tasksQuery.refetch(), remindersQuery.refetch(), goalsQuery.refetch()]);
    setRefreshing(false);
  }

  return (
    <ScreenContainer>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <H1>Scheduled</H1>
            <Meta style={styles.subtitle}>
              {overdueCount > 0 ? (
                <>
                  <Text style={t(T.meta, { color: color.danger, fontWeight: "800" })}>
                    {overdueCount} overdue
                  </Text>
                  {upcomingCount > 0 ? ` · ${upcomingCount} coming up` : ""}
                </>
              ) : upcomingCount > 0 ? (
                `${upcomingCount} coming up`
              ) : (
                "Nothing scheduled"
              )}
            </Meta>
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Text style={t(T.bodyLg, { color: color.text })}>Nothing scheduled</Text>
            <Meta style={{ marginTop: 4, textAlign: "center" }}>
              Open a task and set a date to plan it for a later day.
            </Meta>
          </Card>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            label={section.title}
            count={section.count}
            labelColor={section.overdue ? color.danger : color.textMuted}
            countStyle={
              section.overdue
                ? { bg: color.dangerFill, fg: color.danger }
                : { bg: color.fill, fg: color.textMuted }
            }
          />
        )}
        renderItem={({ item, section }) => {
          const reminder = remindersByTaskId.get(item.id);
          const itemGoal = item.goalId ? goalsById.get(item.goalId) : undefined;
          const reminderLine = reminder ? `⏰ ${formatClockTime(reminder.reminderTime)}` : null;
          // Overdue rows say which day they slipped from — inside a flat OVERDUE section
          // there's no date header to carry that, unlike the grouped upcoming ones.
          const missedLine = section.overdue ? `Was due ${formatScheduleDate(item.scheduledFor!)}` : null;
          return (
            <View style={styles.rowSpacing}>
              <TaskRow
                title={item.name}
                taskType={item.taskType}
                goalName={itemGoal?.name}
                goalColor={itemGoal?.color ?? undefined}
                subtitle={[missedLine, reminderLine].filter(Boolean).join(" · ") || null}
                // Overdue tasks are actionable right now — they were meant to be done
                // already, so they get the same one-tap Focus/Done as Home. Genuinely
                // upcoming ones only get "Open": completing something days early would
                // quietly undo the point of having scheduled it.
                actionLabel={section.overdue ? (item.taskType === "focus" ? "Focus" : "Done") : "Open"}
                onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
                onAction={() =>
                  section.overdue && item.taskType === "reminder"
                    ? handleMarkDone(item.id)
                    : navigation.navigate("TaskDetail", { taskId: item.id })
                }
              />
            </View>
          );
        }}
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
  subtitle: {
    marginTop: 4,
  },
  rowSpacing: {
    marginBottom: 9,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 20,
  },
});
