import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import {
  useAllTimeProgressQuery,
  useStreakQuery,
  useWeeklyHistoryQuery,
  useWeeklyProgressQuery,
} from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  GoalCard,
  H1,
  InfoTooltip,
  Meta,
  ProgressBar,
  ScreenContainer,
  Segmented,
  StatCard,
  StreakIconInline,
} from "../components";
import { color, space } from "../theme";
import { formatMinutes, formatShortDate } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Period = "week" | "month" | "all";

export function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const [period, setPeriod] = useState<Period>("week");

  const streakQuery = useStreakQuery();
  const weeklyQuery = useWeeklyProgressQuery();
  const completedTasksQuery = useTasksQuery("completed");
  const monthHistoryQuery = useWeeklyHistoryQuery(4);
  const allTimeQuery = useAllTimeProgressQuery();
  const goalsQuery = useGoalsQuery();

  const goals = goalsQuery.data ?? [];

  // Only truthy once every source query has data — the same gating the JSX below relies on.
  const data = useMemo(() => {
    const streak = streakQuery.data;
    const weekly = weeklyQuery.data;
    const completedTasks = completedTasksQuery.data;
    const monthHistory = monthHistoryQuery.data;
    const allTime = allTimeQuery.data;
    if (!streak || !weekly || !completedTasks || !monthHistory || !allTime) return null;
    return { streak, weekly, totalCompletedEver: completedTasks.length, monthHistory, allTime };
  }, [streakQuery.data, weeklyQuery.data, completedTasksQuery.data, monthHistoryQuery.data, allTimeQuery.data]);

  const hasAnyActivity =
    data && (data.weekly.tasksCompleted > 0 || data.streak.currentStreak > 0 || data.totalCompletedEver > 0);
  const weeklyPercent = data
    ? Math.min(100, (data.weekly.tasksCompleted / Math.max(1, data.weekly.weeklyGoal)) * 100)
    : 0;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <H1>Progress</H1>

        {/* Above the period tabs, not inside one: a goal isn't scoped to a week or a month
            the way every tab below is, so it stays visible whichever period is selected.
            Read-only here — Home is the one place goals are created and edited. */}
        <View style={styles.goalsHeader}>
          <Eyebrow>GOALS</Eyebrow>
          <InfoTooltip topic="goals" />
        </View>
        {goals.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalsRow}>
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} width={150} />
            ))}
          </ScrollView>
        ) : (
          <Meta style={{ color: color.textFaint }}>No goals yet — create one from Home.</Meta>
        )}

        <View style={styles.segmented}>
          <Segmented<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "all", label: "All time" },
            ]}
          />
        </View>

        {period === "week" ? (
          !hasAnyActivity ? (
            <Card style={styles.emptyCard}>
              <Body style={{ fontWeight: "700", color: color.text }}>Nothing to chart yet</Body>
              <Meta style={styles.emptyText}>
                Complete your first focus session and your progress will start filling in here.
              </Meta>
              <Button label="Capture a task" onPress={() => navigation.navigate("Capture")} style={styles.emptyButton} />
            </Card>
          ) : (
            <>
              <Card style={styles.weeklyCard}>
                <View style={styles.weeklyRow}>
                  <View style={styles.weeklyLabel}>
                    <Body>Weekly goal</Body>
                    <InfoTooltip topic="weeklyProgress" />
                  </View>
                  <Body style={{ fontWeight: "800", color: color.text }}>
                    {data!.weekly.tasksCompleted} of {data!.weekly.weeklyGoal} · {Math.round(weeklyPercent)}%
                  </Body>
                </View>
                <View style={styles.weeklyBar}>
                  <ProgressBar pct={weeklyPercent} />
                </View>
              </Card>

              <View style={styles.statsHeader}>
                <Eyebrow>THIS WEEK&rsquo;S STATS</Eyebrow>
                <InfoTooltip topic="streak" />
              </View>
              <View style={styles.statGrid}>
                <View style={styles.statRow}>
                  <StatCard
                    value={`${data!.streak.currentStreak} days`}
                    label="current streak"
                    accent
                    trailing={<StreakIconInline />}
                  />
                  <StatCard value={formatMinutes(data!.weekly.totalFocusTimeMinutes)} label="focus time" />
                </View>
                <View style={styles.statRow}>
                  <StatCard value={`${data!.streak.longestStreak} days`} label="longest streak" />
                  <StatCard
                    value={data!.streak.gracePeriodUsed ? "0 left" : "1 left ✓"}
                    label="streak grace day"
                    accent={!data!.streak.gracePeriodUsed}
                  />
                </View>
              </View>
            </>
          )
        ) : period === "month" ? (
          data && data.monthHistory.length > 0 ? (
            <Card style={styles.weeklyCard}>
              <View style={styles.historyHeader}>
                <Eyebrow>
                  LAST {data.monthHistory.length} WEEK{data.monthHistory.length === 1 ? "" : "S"}
                </Eyebrow>
              </View>
              {data.monthHistory.map((week, i) => (
                <View
                  key={week.weekStartDate}
                  style={[
                    styles.historyRow,
                    i < data.monthHistory.length - 1 && styles.historyRowDivider,
                  ]}
                >
                  <Body>Week of {formatShortDate(week.weekStartDate)}</Body>
                  <Body style={{ fontWeight: "800", color: color.text }}>
                    {week.tasksCompleted} tasks · {formatMinutes(week.totalFocusTimeMinutes)}
                  </Body>
                </View>
              ))}
            </Card>
          ) : (
            <Card style={styles.emptyCard}>
              <Body style={{ fontWeight: "700", color: color.text }}>Nothing to chart yet</Body>
              <Meta style={styles.emptyText}>
                A row appears here for every week you complete at least one focus task.
              </Meta>
            </Card>
          )
        ) : data && data.allTime.weeksTracked > 0 ? (
          <View style={styles.statGrid}>
            <View style={styles.statRow}>
              <StatCard value={String(data.allTime.totalTasksCompleted)} label="focus tasks completed" accent />
              <StatCard value={formatMinutes(data.allTime.totalFocusTimeMinutes)} label="total focus time" />
            </View>
            <View style={styles.statRow}>
              <StatCard value={`${data.streak.longestStreak} days`} label="longest streak" accent />
              <StatCard value={String(data.allTime.weeksTracked)} label="weeks active" />
            </View>
          </View>
        ) : (
          <Card style={styles.emptyCard}>
            <Body style={{ fontWeight: "700", color: color.text }}>Nothing to chart yet</Body>
            <Meta style={styles.emptyText}>
              Complete your first focus session and your all-time stats will start filling in here.
            </Meta>
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: 24,
  },
  goalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    marginBottom: space.sm,
  },
  goalsRow: {
    flexDirection: "row",
    gap: space.md,
    paddingRight: space.xs,
  },
  segmented: {
    marginTop: 18,
  },
  weeklyCard: {
    marginTop: 18,
  },
  weeklyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  weeklyLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  weeklyBar: {
    marginTop: space.base,
  },
  statsHeader: {
    marginTop: space.gutter,
    marginBottom: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statGrid: {
    marginTop: 18,
    gap: space.md,
  },
  statRow: {
    flexDirection: "row",
    gap: space.md,
  },
  historyHeader: {
    marginBottom: space.base,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.base,
    gap: space.sm,
  },
  historyRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  emptyCard: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 28,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 16,
    alignSelf: "stretch",
  },
});
