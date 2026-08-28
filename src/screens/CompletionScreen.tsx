import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGoalsQuery } from "../api/queries/useGoals";
import { useStreakQuery, useWeeklyProgressQuery } from "../api/queries/useProgress";
import { useTaskQuery } from "../api/queries/useTasks";
import {
  Body,
  Button,
  Card,
  Ferne,
  H1,
  InfoTooltip,
  Meta,
  ProgressBar,
  ScreenContainer,
  StreakIconInline,
  XpIcon,
} from "../components";
import { useCompanion } from "../state/CompanionContext";
import { color, space, text as t, type as T } from "../theme";
import { celebrationLine } from "../theme/companionCopy";
import { formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";
import { Text } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "Completion">;

/**
 * Celebration after a task is completed.
 *
 * No confetti or spring animations: design §7 limits motion to progress fills, sheet
 * transitions and the segmented thumb — "no confetti, no bounce, no looping ambient
 * animation in v1". The moment is carried by copy and colour instead.
 */
export function CompletionScreen() {
  const { tone } = useCompanion();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  // Already invalidated by the completeTask mutation that navigated here, so these refetch
  // fresh automatically on mount rather than needing this screen to fetch them itself.
  const streak = useStreakQuery().data ?? null;
  const weekly = useWeeklyProgressQuery().data ?? null;
  const completedTask = useTaskQuery(params.taskId).data ?? null;
  const goals = useGoalsQuery().data ?? [];
  const goal = completedTask?.goalId ? goals.find((g) => g.id === completedTask.goalId) ?? null : null;

  function handleNext() {
    navigation.navigate("Main", { screen: "Home" });
  }

  const weeklyPercent = weekly ? Math.min(100, (weekly.tasksCompleted / Math.max(1, weekly.weeklyGoal)) * 100) : 0;

  return (
    <ScreenContainer>
      <Pressable style={styles.flex} onPress={handleNext} accessibilityRole="button" accessibilityLabel="Continue">
        <ScrollView contentContainerStyle={styles.content}>
          <Ferne size={88} state="celebrate" />
          <H1 style={styles.centered}>Task complete</H1>

          <View style={styles.pointsRow}>
            {/* The handoff's XP mark. This is the one screen with a real points figure to
                put it against — points are computed server-side per focus session, so
                nothing else in the app knows a number to show. */}
            <XpIcon size={26} />
            <Text style={t(T.timer, { fontSize: 40, letterSpacing: -1, color: color.success })}>
              +{params.pointsEarned} XP
            </Text>
            <InfoTooltip topic="xp" color={color.success} />
          </View>

          {streak ? (
            <Card style={styles.bubble}>
              <Meta style={{ color: color.textBody }}>
                {celebrationLine(tone, streak.currentStreak, params.pointsEarned)}
              </Meta>
            </Card>
          ) : null}

          {streak && streak.currentStreak > 0 ? (
            <View style={styles.streakRow}>
              <StreakIconInline size={14} />
              <Body style={{ fontWeight: "700", color: color.text }}>{streak.currentStreak}-day streak</Body>
              <InfoTooltip topic="streak" />
            </View>
          ) : null}

          {goal ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Meta>🎯 {goal.name}</Meta>
                <Meta style={{ fontWeight: "800", color: color.text }}>
                  {goal.totalDaysActive} of {goal.targetDays} days
                </Meta>
              </View>
              <ProgressBar
                pct={Math.min(100, (goal.totalDaysActive / Math.max(1, goal.targetDays)) * 100)}
                fill={goal.color ?? color.goal}
              />
            </View>
          ) : null}

          {weekly ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <View style={styles.progressLabel}>
                  <Meta>Weekly progress</Meta>
                  <InfoTooltip topic="weeklyProgress" />
                </View>
                <Meta style={{ fontWeight: "800", color: color.text }}>
                  {weekly.tasksCompleted} of {weekly.weeklyGoal} tasks
                </Meta>
              </View>
              <ProgressBar pct={weeklyPercent} />
            </View>
          ) : null}

          <Card style={styles.statsCard}>
            <View style={styles.statItem}>
              <Body style={{ fontWeight: "800", color: color.text }}>
                {formatMinutes(Math.round(params.durationSeconds / 60))}
              </Body>
              <Meta style={{ color: color.textFaint }}>time spent</Meta>
            </View>
            <View style={styles.statItem}>
              <Body style={{ fontWeight: "800", color: color.success }}>{params.pointsEarned}</Body>
              <Meta style={{ color: color.textFaint }}>points</Meta>
            </View>
            <View style={styles.statItem}>
              <Body style={{ fontWeight: "800", color: color.text }}>{weekly?.totalFocusTimeMinutes ?? 0}</Body>
              <Meta style={{ color: color.textFaint }}>focus min this week</Meta>
            </View>
          </Card>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Next task →" onPress={handleNext} />
        </View>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.lg,
    paddingBottom: space.base,
    alignItems: "center",
    gap: space.base,
  },
  centered: {
    textAlign: "center",
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  bubble: {
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressBlock: {
    width: "100%",
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  progressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statsCard: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  footer: {
    paddingHorizontal: space.gutter,
    paddingTop: space.base,
    paddingBottom: 18,
  },
});
