import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCategoriesQuery } from "../api/queries/useCategories";
import { useAllTimeProgressQuery, useStreakQuery, useWeeklyHistoryQuery, useWeeklyProgressQuery } from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import type { CategoryDto, TaskDto } from "../api/types";
import { Body, Button, Card, InfoTooltip, ProgressBar, ScreenContainer, ScreenTitle, SectionLabel, Text } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { formatMinutes, formatShortDate, startOfIsoWeek } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = "week" | "month" | "allTime";

export function ProgressScreen() {
  const { colors } = useAppearance();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<Tab>("week");

  const streakQuery = useStreakQuery();
  const weeklyQuery = useWeeklyProgressQuery();
  const categoriesQuery = useCategoriesQuery();
  const completedTasksQuery = useTasksQuery("completed");
  const monthHistoryQuery = useWeeklyHistoryQuery(4);
  const allTimeQuery = useAllTimeProgressQuery();

  // Same single combined shape the old load() produced, just derived from the cache
  // instead of copied into it — only truthy once every source query has data, same
  // gating the JSX below already relies on.
  const data = useMemo(() => {
    const streak = streakQuery.data;
    const weekly = weeklyQuery.data;
    const categories = categoriesQuery.data;
    const completedTasks = completedTasksQuery.data;
    const monthHistory = monthHistoryQuery.data;
    const allTime = allTimeQuery.data;
    if (!streak || !weekly || !categories || !completedTasks || !monthHistory || !allTime) return null;

    const weekStart = startOfIsoWeek();
    const completedThisWeek = completedTasks.filter((t: TaskDto) => t.completedAt && new Date(t.completedAt) >= weekStart);
    const byCategory = new Map<string | null, number>();
    for (const t of completedThisWeek) {
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + 1);
    }
    const total = completedThisWeek.length || 1;
    const categoryBreakdown = Array.from(byCategory.entries())
      .map(([categoryId, count]) => ({
        category: categories.find((c: CategoryDto) => c.id === categoryId) ?? null,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.percent - a.percent);

    return { streak, weekly, categoryBreakdown, totalCompletedEver: completedTasks.length, monthHistory, allTime };
  }, [streakQuery.data, weeklyQuery.data, categoriesQuery.data, completedTasksQuery.data, monthHistoryQuery.data, allTimeQuery.data]);

  if (!user) return null;

  const hasAnyActivity = data && (data.weekly.tasksCompleted > 0 || data.streak.currentStreak > 0 || data.totalCompletedEver > 0);
  const weeklyPercent = data ? Math.min(100, (data.weekly.tasksCompleted / Math.max(1, data.weekly.weeklyGoal)) * 100) : 0;

  return (
    <ScreenContainer>
      <View style={{ padding: 24, paddingBottom: 8 }}>
        <ScreenTitle>Progress</ScreenTitle>
        <View style={{ flexDirection: "row", backgroundColor: colors.neutralFill, borderRadius: radii.control, padding: 4, gap: 4, marginTop: 14 }}>
          {(
            [
              { key: "week", label: "This week" },
              { key: "month", label: "This month" },
              { key: "allTime", label: "All time" },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: active ? colors.bgCard : "transparent" }}
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
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Card style={{ gap: 10 }}>
              <SectionLabel>
                Last {data.monthHistory.length} week{data.monthHistory.length === 1 ? "" : "s"}
              </SectionLabel>
              {data.monthHistory.map((week, i) => (
                <View
                  key={week.weekStartDate}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderBottomWidth: i === data.monthHistory.length - 1 ? 0 : 1,
                    borderBottomColor: colors.divider,
                  }}
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
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }}>
            <Body weight="semiBold">Nothing to chart yet</Body>
            <Body color={colors.textMuted} style={{ textAlign: "center" }}>
              A row appears here for every week you complete at least one focus task.
            </Body>
          </View>
        )
      ) : tab === "allTime" ? (
        data && data.allTime.weeksTracked > 0 ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "focus tasks completed", value: String(data.allTime.totalTasksCompleted), color: colors.primary },
                { label: "total focus time", value: formatMinutes(data.allTime.totalFocusTimeMinutes), color: colors.textDark },
                { label: "longest streak", value: `${data.streak.longestStreak} days`, color: colors.secondaryText },
                { label: "weeks active", value: String(data.allTime.weeksTracked), color: colors.textDark },
              ].map((stat) => (
                <Card key={stat.label} style={{ flexBasis: "47%", flexGrow: 1 }}>
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
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }}>
            <Body weight="semiBold">Nothing to chart yet</Body>
            <Body color={colors.textMuted} style={{ textAlign: "center" }}>
              Complete your first focus session and your all-time stats will start filling in here.
            </Body>
          </View>
        )
      ) : !hasAnyActivity ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
          <View style={{ width: "100%", height: 12, borderRadius: radii.pill, backgroundColor: colors.neutralFill }} />
          <Body weight="semiBold" size={fontSize.bodyLg}>
            Nothing to chart yet
          </Body>
          <Body color={colors.textMuted} style={{ textAlign: "center" }}>
            Complete your first focus session and your progress will start filling in here.
          </Body>
          <Button label="Capture a task" onPress={() => navigation.navigate("Capture")} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Body color={colors.textMuted}>Weekly goal</Body>
                <InfoTooltip topic="weeklyProgress" color={colors.textFaint} />
              </View>
              <Text weight="bold">
                {data!.weekly.tasksCompleted} of {data!.weekly.weeklyGoal} · {Math.round(weeklyPercent)}%
              </Text>
            </View>
            <ProgressBar percent={weeklyPercent} />
          </Card>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 2 }}>
            <SectionLabel>This week's stats</SectionLabel>
            <InfoTooltip topic="streak" color={colors.textFaint} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              { label: "current streak", value: `${data!.streak.currentStreak} days 🔥`, color: colors.secondaryText },
              { label: "focus time", value: formatMinutes(data!.weekly.totalFocusTimeMinutes), color: colors.textDark },
              { label: "tasks this week", value: String(data!.weekly.tasksCompleted), color: colors.textDark },
              { label: "longest streak", value: `${data!.streak.longestStreak} days`, color: colors.textDark },
              {
                label: "streak grace day",
                value: data!.streak.gracePeriodUsed ? "0 left" : "1 left ✓",
                color: colors.primary,
              },
            ].map((stat) => (
              <Card key={stat.label} style={{ flexBasis: "47%", flexGrow: 1 }}>
                <Text size={fontSize.lg} weight="bold" color={stat.color}>
                  {stat.value}
                </Text>
                <Body size={fontSize.micro} color={colors.textFaint}>
                  {stat.label}
                </Body>
              </Card>
            ))}
          </View>

          {data!.categoryBreakdown.length > 0 ? (
            <Card style={{ gap: 12 }}>
              <SectionLabel>By category</SectionLabel>
              <View style={{ gap: 10 }}>
                {data!.categoryBreakdown.map((entry, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Body size={fontSize.caption} style={{ width: 72 }}>
                      {entry.category?.name ?? "Uncategorized"}
                    </Body>
                    <View style={{ flex: 1 }}>
                      <ProgressBar percent={entry.percent} height={14} color={entry.category?.color ?? colors.textFaint} />
                    </View>
                    <Text size={fontSize.caption} weight="bold" style={{ width: 36, textAlign: "right" }}>
                      {entry.percent}%
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Card style={{ gap: 12 }}>
            <SectionLabel>Milestones</SectionLabel>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Body>100 tasks completed</Body>
                <Text weight="bold">{Math.min(data!.totalCompletedEver, 100)}/100</Text>
              </View>
              <ProgressBar percent={Math.min(100, data!.totalCompletedEver)} height={8} />
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Body>30-day streak</Body>
                <Text weight="bold">{Math.min(data!.streak.currentStreak, 30)}/30</Text>
              </View>
              <ProgressBar percent={Math.min(100, (data!.streak.currentStreak / 30) * 100)} height={8} color={colors.secondary} />
            </View>
          </Card>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
