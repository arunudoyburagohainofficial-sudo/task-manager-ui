import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCategoriesQuery } from "../api/queries/useCategories";
import { useMarkTaskDoneMutation, useRemindersQuery } from "../api/queries/useReminders";
import { useStreakQuery } from "../api/queries/useProgress";
import { useTasksQuery } from "../api/queries/useTasks";
import type { CategoryDto, ReminderDto } from "../api/types";
import { Body, Button, Card, CategoryTag, CompanionBubble, HeroGreeting, InfoTooltip, Label, ScreenContainer, SectionLabel, Text } from "../components";
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
  const categoriesQuery = useCategoriesQuery();
  const remindersQuery = useRemindersQuery();
  const streakQuery = useStreakQuery();
  const markDoneMutation = useMarkTaskDoneMutation();

  const tasks = tasksQuery.data ?? [];
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c: CategoryDto) => [c.id, c])),
    [categoriesQuery.data]
  );
  const remindersByTaskId = useMemo(
    () => new Map((remindersQuery.data ?? []).map((r: ReminderDto) => [r.taskId, r])),
    [remindersQuery.data]
  );
  const currentStreak = streakQuery.data?.currentStreak ?? 0;
  const doneTodayCount = useMemo(
    () => (completedTasksQuery.data ?? []).filter((t) => t.completedAt && isToday(t.completedAt)).length,
    [completedTasksQuery.data]
  );
  // Only true once every query has resolved at least once — same intent as the old
  // `data === null` check, so the greeting/companion bubble don't flash in before the
  // first real fetch completes.
  const hasLoaded = tasksQuery.isSuccess && categoriesQuery.isSuccess && remindersQuery.isSuccess && streakQuery.isSuccess;

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      tasksQuery.refetch(),
      completedTasksQuery.refetch(),
      categoriesQuery.refetch(),
      remindersQuery.refetch(),
      streakQuery.refetch(),
    ]);
    setRefreshing(false);
  }

  async function handleMarkReminderDone(taskId: string) {
    await markDoneMutation.mutateAsync(taskId);
    await syncReminders();
  }

  if (!user) return null;

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <HeroGreeting numberOfLines={2} ellipsizeMode="tail">
              {greetingForHour()}, {formatFirstName(user.displayName || user.username)}
            </HeroGreeting>
            <Body color={colors.textMuted} style={{ marginTop: 4 }} numberOfLines={1}>
              {formatGreetingDate()}
            </Body>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Main", { screen: "Settings" })}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primaryTintBg,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text weight="bold" color={colors.primaryTintText}>
              {(user.displayName || user.username).charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.primaryTintBg,
            borderRadius: radii.control,
            paddingVertical: 10,
            paddingHorizontal: 16,
            marginTop: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, flex: 1 }}>
            <Text weight="bold" color={colors.primary}>
              {doneTodayCount}
            </Text>
            <Label>done today</Label>
          </View>
          <View style={{ width: 1, height: 16, backgroundColor: colors.toggleOff, marginHorizontal: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, flex: 1 }}>
            <Text weight="bold" color={colors.secondaryText}>
              {currentStreak}-day
            </Text>
            <Label>streak 🔥</Label>
            <InfoTooltip topic="streak" color={colors.textFaint} />
          </View>
        </View>
      </View>

      <FlatList
        style={{ flex: 1, paddingHorizontal: 16 }}
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View>
            {hasLoaded ? (
              <View style={{ alignItems: "center", paddingHorizontal: 8, marginTop: 4 }}>
                <CompanionBubble text={homeLine(tone, currentStreak, doneTodayCount)} />
              </View>
            ) : null}
            <PulseCaptureButton onPress={() => navigation.navigate("Capture")} />
            <SectionLabel style={{ paddingHorizontal: 8, marginBottom: 8 }}>
              Today · {tasks.length} tasks
            </SectionLabel>
          </View>
        }
        ListFooterComponent={<View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
            <Body weight="semiBold">No tasks yet</Body>
            <Body color={colors.textMuted} style={{ textAlign: "center" }}>
              Capture something above to get started.
            </Body>
          </View>
        }
        contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
        renderItem={({ item }) => {
          const category = item.categoryId ? categoriesById.get(item.categoryId) ?? null : null;
          const reminder = remindersByTaskId.get(item.id);
          return (
            <Pressable onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Body weight="semiBold" size={fontSize.body}>
                    {item.name}
                  </Body>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <CategoryTag category={category} />
                    {reminder ? (
                      <Body size={fontSize.micro} color={colors.textFaint}>
                        ⏰ {formatClockTime(reminder.reminderTime)}
                      </Body>
                    ) : null}
                  </View>
                </View>
                {item.taskType === "focus" ? (
                  <Button
                    label="Focus"
                    onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
                    style={{ minHeight: 48, paddingHorizontal: 16 }}
                  />
                ) : (
                  <Button
                    label="Done"
                    variant="outlinePrimary"
                    onPress={() => handleMarkReminderDone(item.id)}
                    style={{ minHeight: 48, paddingHorizontal: 16 }}
                  />
                )}
              </Card>
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}
