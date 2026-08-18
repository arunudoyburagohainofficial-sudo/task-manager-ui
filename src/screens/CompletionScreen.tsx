import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useStreakQuery, useWeeklyProgressQuery } from "../api/queries/useProgress";
import { Body, Button, Card, CompanionBubble, CompanionOrb, InfoTooltip, ProgressBar, ScreenContainer, Text } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { fontSize } from "../theme/typography";
import { celebrationLine } from "../theme/companionCopy";
import { formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "Completion">;

const CONFETTI = [
  { left: 30, color: "gold", delay: 0, duration: 2800 },
  { left: 110, color: "primary", delay: 600, duration: 3400 },
  { left: 190, color: "gold", delay: 1100, duration: 3000 },
  { left: 260, color: "primary", delay: 300, duration: 2600 },
  { left: 330, color: "gold", delay: 1500, duration: 3200 },
] as const;

function ConfettiPiece({ left, color, delay, duration }: (typeof CONFETTI)[number]) {
  const { colors } = useAppearance();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [progress, duration, delay]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left,
        width: 8,
        height: 8,
        borderRadius: 2,
        backgroundColor: color === "gold" ? colors.secondary : colors.primary,
        opacity: progress.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-20, 320] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "260deg"] }) },
        ],
      }}
    />
  );
}

export function CompletionScreen() {
  const { colors } = useAppearance();
  const { tone } = useCompanion();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  // Already invalidated by the completeTask mutation that navigated here (see
  // useCompleteTaskMutation), so these refetch fresh automatically on mount rather than
  // needing this screen to fetch them itself.
  const streak = useStreakQuery().data ?? null;
  const weekly = useWeeklyProgressQuery().data ?? null;

  const pointsScale = useRef(new Animated.Value(0.5)).current;
  const streakBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pointsScale, { toValue: 1, duration: 350, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.spring(streakBounce, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }, [pointsScale, streakBounce]);

  function handleNext() {
    navigation.navigate("Main", { screen: "Home" });
  }

  const weeklyPercent = weekly ? Math.min(100, (weekly.tasksCompleted / Math.max(1, weekly.weeklyGoal)) * 100) : 0;

  return (
    <ScreenContainer>
      <Pressable style={{ flex: 1 }} onPress={handleNext}>
        {CONFETTI.map((piece, i) => (
          <ConfettiPiece key={i} {...piece} />
        ))}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 }}>
          <CompanionOrb state="celebrating" size={88} />
          <Text size={30} weight="extraBold">
            Task complete!
          </Text>
          <Animated.View style={{ transform: [{ scale: pointsScale }], flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text size={40} weight="extraBold" color={colors.secondaryText}>
              +{params.pointsEarned} XP
            </Text>
            <InfoTooltip topic="xp" color={colors.secondaryText} />
          </Animated.View>
          {streak ? (
            <CompanionBubble text={celebrationLine(tone, streak.currentStreak, params.pointsEarned)} />
          ) : null}
          {streak && streak.currentStreak > 0 ? (
            <Animated.View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                transform: [{ scale: streakBounce.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.15, 1] }) }],
              }}
            >
              <Text weight="semiBold">
                {streak.currentStreak}-day streak! 🔥
              </Text>
              <InfoTooltip topic="streak" color={colors.textFaint} />
            </Animated.View>
          ) : null}

          {weekly ? (
            <View style={{ width: "100%", gap: 8, marginTop: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Body size={fontSize.caption} color={colors.textMuted}>
                    Weekly progress
                  </Body>
                  <InfoTooltip topic="weeklyProgress" color={colors.textFaint} />
                </View>
                <Body size={fontSize.caption} weight="bold">
                  {weekly.tasksCompleted} of {weekly.weeklyGoal} tasks
                </Body>
              </View>
              <ProgressBar percent={weeklyPercent} />
            </View>
          ) : null}

          <Card style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 8 }}>
            <View style={{ alignItems: "center" }}>
              <Text weight="bold">{formatMinutes(Math.round(params.durationSeconds / 60))}</Text>
              <Body size={fontSize.micro} color={colors.textFaint}>
                time spent
              </Body>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text weight="bold" color={colors.secondaryText}>
                {params.pointsEarned}
              </Text>
              <Body size={fontSize.micro} color={colors.textFaint}>
                points
              </Body>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text weight="bold">{weekly?.totalFocusTimeMinutes ?? 0}</Text>
              <Body size={fontSize.micro} color={colors.textFaint}>
                focus min this week
              </Body>
            </View>
          </Card>
        </View>
        <View style={{ padding: 16 }}>
          <Button label="Next task →" large onPress={handleNext} />
          <Body size={fontSize.micro} color={colors.textFaint} style={{ textAlign: "center", marginTop: 10 }}>
            Tap anywhere to skip animation
          </Body>
        </View>
      </Pressable>
    </ScreenContainer>
  );
}
