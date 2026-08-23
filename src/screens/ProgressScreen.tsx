import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useAllTimeProgressQuery, useStreakQuery, useWeeklyHistoryQuery, useWeeklyProgressQuery } from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import { Body, Button, Card, GoalStrip, InfoTooltip, ProgressBar, ScreenContainer, ScreenTitle, SectionLabel, Text } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { formatMinutes, formatShortDate } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = "week" | "month" | "allTime";

const styles = StyleSheet.create({
  header: {
    padding: 24,
    paddingBottom: 8,
  },
  goalsSection: {
    marginTop: 16,
  },
  // 8 to sit flush with the strip's own content padding, matching how Home aligns the
  // same label over the same chips.
  goalsSectionLabel: {
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: "row",
    borderRadius: radii.control,
    padding: 4,
    gap: 4,
    marginTop: 14,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  cardGap10: {
    gap: 10,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  centeredEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  centeredEmptyStateWide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
  },
  centeredText: {
    textAlign: "center",
  },
  emptyBar: {
    width: "100%",
    height: 12,
    borderRadius: radii.pill,
  },
  statsScrollContent: {
    padding: 16,
    gap: 10,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  rowSpaceBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowGap5: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
});

export function ProgressScreen() {
  const { colors } = useAppearance();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<Tab>("week");

  const streakQuery = useStreakQuery();
  const weeklyQuery = useWeeklyProgressQuery();
  const completedTasksQuery = useTasksQuery("completed");
  const monthHistoryQuery = useWeeklyHistoryQuery(4);
  const allTimeQuery = useAllTimeProgressQuery();
  const goalsQuery = useGoalsQuery();

  const goals = goalsQuery.data ?? [];

  // Same single combined shape the old load() produced, just derived from the cache
  // instead of copied into it — only truthy once every source query has data, same
  // gating the JSX below already relies on.
  const data = useMemo(() => {
    const streak = streakQuery.data;
    const weekly = weeklyQuery.data;
    const completedTasks = completedTasksQuery.data;
    const monthHistory = monthHistoryQuery.data;
    const allTime = allTimeQuery.data;
    if (!streak || !weekly || !completedTasks || !monthHistory || !allTime) return null;

    return { streak, weekly, totalCompletedEver: completedTasks.length, monthHistory, allTime };
  }, [streakQuery.data, weeklyQuery.data, completedTasksQuery.data, monthHistoryQuery.data, allTimeQuery.data]);

  if (!user) return null;

  const hasAnyActivity = data && (data.weekly.tasksCompleted > 0 || data.streak.currentStreak > 0 || data.totalCompletedEver > 0);
  const weeklyPercent = data ? Math.min(100, (data.weekly.tasksCompleted / Math.max(1, data.weekly.weeklyGoal)) * 100) : 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <ScreenTitle>Progress</ScreenTitle>

        {/* Above the tabs, not inside one: a goal isn't scoped to a week or a month the
            way every tab below is, so it stays visible whichever tab is selected.
            Read-only by design — Home is the one place goals are created and edited. */}
        <View style={styles.goalsSection}>
          <SectionLabel style={styles.goalsSectionLabel}>Goals</SectionLabel>
          <GoalStrip goals={goals} emptyHint="No goals yet — create one from Home." />
        </View>

        <View style={[styles.tabRow, { backgroundColor: colors.neutralFill }]}>
          {(
            [
              { key: "week", label: "Week" },
              { key: "month", label: "Month" },
              { key: "allTime", label: "All time" },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, { backgroundColor: active ? colors.bgCard : "transparent" }]}
              >
                <Text size={fontSize.caption} weight={active ? "bold" : "semiBold"} color={active ? colors.textDark : colors.textMuted}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === "month" ? (
        data && data.monthHistory.length > 0 ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Card style={styles.cardGap10}>
              <SectionLabel>
                Last {data.monthHistory.length} week{data.monthHistory.length === 1 ? "" : "s"}
              </SectionLabel>
              {data.monthHistory.map((week, i) => (
                <View
                  key={week.weekStartDate}
                  style={[
                    styles.weekRow,
                    {
                      borderBottomWidth: i === data.monthHistory.length - 1 ? 0 : 1,
                      borderBottomColor: colors.divider,
                    },
                  ]}
                >
                  <Body size={fontSize.caption} color={colors.textMuted}>
                    Week of {formatShortDate(week.weekStartDate)}
                  </Body>
                  <Text size={fontSize.caption} weight="bold">
                    {week.tasksCompleted} tasks · {formatMinutes(week.totalFocusTimeMinutes)}
                  </Text>
                </View>
              ))}
            </Card>
          </ScrollView>
        ) : (
          <View style={styles.centeredEmptyState}>
            <Body weight="semiBold">Nothing to chart yet</Body>
            <Body color={colors.textMuted} style={styles.centeredText}>
              A row appears here for every week you complete at least one focus task.
            </Body>
          </View>
        )
      ) : tab === "allTime" ? (
        data && data.allTime.weeksTracked > 0 ? (
          <ScrollView contentContainerStyle={styles.statsScrollContent}>
            <View style={styles.statsGrid}>
              {[
                { label: "focus tasks completed", value: String(data.allTime.totalTasksCompleted), color: colors.primary },
                { label: "total focus time", value: formatMinutes(data.allTime.totalFocusTimeMinutes), color: colors.textDark },
                { label: "longest streak", value: `${data.streak.longestStreak} days`, color: colors.secondaryText },
                { label: "weeks active", value: String(data.allTime.weeksTracked), color: colors.textDark },
              ].map((stat) => (
                <Card key={stat.label} style={styles.statCard}>
                  <Text size={fontSize.lg} weight="bold" color={stat.color}>
                    {stat.value}
                  </Text>
                  <Body size={fontSize.micro} color={colors.textFaint}>
                    {stat.label}
                  </Body>
                </Card>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.centeredEmptyState}>
            <Body weight="semiBold">Nothing to chart yet</Body>
            <Body color={colors.textMuted} style={styles.centeredText}>
              Complete your first focus session and your all-time stats will start filling in here.
            </Body>
          </View>
        )
      ) : !hasAnyActivity ? (
        <View style={styles.centeredEmptyStateWide}>
          <View style={[styles.emptyBar, { backgroundColor: colors.neutralFill }]} />
          <Body weight="semiBold" size={fontSize.bodyLg}>
            Nothing to chart yet
          </Body>
          <Body color={colors.textMuted} style={styles.centeredText}>
            Complete your first focus session and your progress will start filling in here.
          </Body>
          <Button label="Capture a task" onPress={() => navigation.navigate("Capture")} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.cardGap10}>
            <View style={styles.rowSpaceBetween}>
              <View style={styles.rowGap5}>
                <Body color={colors.textMuted}>Weekly goal</Body>
                <InfoTooltip topic="weeklyProgress" color={colors.textFaint} />
              </View>
              <Text weight="bold">
                {data!.weekly.tasksCompleted} of {data!.weekly.weeklyGoal} · {Math.round(weeklyPercent)}%
              </Text>
            </View>
            <ProgressBar percent={weeklyPercent} />
          </Card>

          <View style={styles.sectionHeaderRow}>
            <SectionLabel>This week's stats</SectionLabel>
            <InfoTooltip topic="streak" color={colors.textFaint} />
          </View>
          <View style={styles.statsGrid}>
            {[
              // No "tasks this week" tile — the Weekly goal card above already shows that
              // number, with the target and percentage around it.
              { label: "current streak", value: `${data!.streak.currentStreak} days 🔥`, color: colors.secondaryText },
              { label: "focus time", value: formatMinutes(data!.weekly.totalFocusTimeMinutes), color: colors.textDark },
              { label: "longest streak", value: `${data!.streak.longestStreak} days`, color: colors.textDark },
              {
                label: "streak grace day",
                value: data!.streak.gracePeriodUsed ? "0 left" : "1 left ✓",
                color: colors.primary,
              },
            ].map((stat) => (
              <Card key={stat.label} style={styles.statCard}>
                <Text size={fontSize.lg} weight="bold" color={stat.color}>
                  {stat.value}
                </Text>
                <Body size={fontSize.micro} color={colors.textFaint}>
                  {stat.label}
                </Body>
              </Card>
            ))}
          </View>

        </ScrollView>
      )}
    </ScreenContainer>
  );
}
