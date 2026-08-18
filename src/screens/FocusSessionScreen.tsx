import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { useCategoriesQuery } from "../api/queries/useCategories";
import { useCompleteTaskMutation, useTaskQuery } from "../api/queries/useTasks";
import type { FocusSessionDto } from "../api/types";
import { Body, Button, CategoryTag, CompanionOrb, ConfirmModal, InfoTooltip, ProgressBar, ScreenContainer, Text } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { usePreferences } from "../state/PreferencesContext";
import { radii, spacing } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { restingLine } from "../theme/companionCopy";
import { formatMMSS, formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "FocusSession">;

// Pomodoro work blocks are always 25 min per the design handoff; Regular-mode length
// comes from the user's "Default focus duration" preference (client-only — task-svc has
// no field for a planned session length at all).
const POMODORO_WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

type Phase = "working" | "break" | "completePrompt";

export function FocusSessionScreen() {
  const { colors } = useAppearance();
  const { name } = useCompanion();
  const { defaultFocusDurationMinutes } = usePreferences();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { sessionId, taskId, focusMode, totalCycles } = params;
  const WORK_SECONDS = focusMode === "pomodoro" ? POMODORO_WORK_SECONDS : defaultFocusDurationMinutes * 60;

  // Almost always an instant cache hit: TaskDetailScreen (the only screen that navigates
  // here) already has this exact task cached under this exact key from viewing it right
  // before pressing "Start Focus Session".
  const taskQuery = useTaskQuery(taskId);
  const categoriesQuery = useCategoriesQuery();
  const completeTaskMutation = useCompleteTaskMutation();
  const task = taskQuery.data ?? null;
  const category = task?.categoryId ? categoriesQuery.data?.find((c) => c.id === task.categoryId) ?? null : null;
  const [phase, setPhase] = useState<Phase>("working");
  const [currentCycle, setCurrentCycle] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECONDS);
  const [paused, setPaused] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [completedSession, setCompletedSession] = useState<FocusSessionDto | null>(null);
  const [finishing, setFinishing] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cycleRef = useRef(currentCycle);
  cycleRef.current = currentCycle;

  const finishSession = useCallback(
    async (wasInterrupted: boolean) => {
      setFinishing(true);
      try {
        const completed = await focusSessionsApi.completeFocusSession(sessionId, {
          wasInterrupted,
          numPomodoroCycles: focusMode === "pomodoro" ? (wasInterrupted ? cycleRef.current - 1 : totalCycles) : undefined,
        });
        setCompletedSession(completed);
        setPhase("completePrompt");
      } finally {
        setFinishing(false);
      }
    },
    [sessionId, focusMode, totalCycles]
  );

  // Countdown ticks once per second while working or on a break; pausing only applies to work.
  useEffect(() => {
    if (phase === "completePrompt") return;
    if (phase === "working" && paused) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (phaseRef.current === "working") {
            if (focusMode === "pomodoro" && cycleRef.current < totalCycles) {
              setPhase("break");
              return BREAK_SECONDS;
            }
            finishSession(false);
            return 0;
          }
          // Break countdown reaching zero does NOT auto-start the next cycle — stays at 0.
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, paused, focusMode, totalCycles, finishSession]);

  function handleStartNextCycle() {
    setCurrentCycle((c) => c + 1);
    setSecondsLeft(WORK_SECONDS);
    setPhase("working");
  }

  function handleEndSessionConfirm() {
    setEndConfirmOpen(false);
    finishSession(true);
  }

  async function handleMarkTaskComplete() {
    if (!task || !completedSession) return;
    await completeTaskMutation.mutateAsync({ taskId, points: completedSession.pointsEarned ?? undefined });
    navigation.replace("Completion", {
      taskId,
      taskName: task.name,
      durationSeconds: completedSession.durationSeconds ?? 0,
      pointsEarned: completedSession.pointsEarned ?? 0,
    });
  }

  function handleKeepTaskOpen() {
    navigation.navigate("Main", { screen: "Home" });
  }

  if (!task) return null;

  if (phase === "break") {
    return (
      <ScreenContainer backgroundColor={colors.bgFocusSession} style={{ alignItems: "center", justifyContent: "space-between", paddingVertical: 32 }}>
        <View style={{ alignItems: "center", gap: 8, paddingTop: 20 }}>
          <Body weight="semiBold" color={colors.textMuted}>
            {task.name}
          </Body>
          <CategoryTag category={category} />
        </View>
        <View style={{ alignItems: "center", gap: 16, paddingHorizontal: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryTintBg, alignItems: "center", justifyContent: "center" }}>
            <Text size={32}>☕</Text>
          </View>
          <Text size={fontSize.xl} weight="extraBold">
            Cycle {currentCycle} complete!
          </Text>
          <Body color={colors.textMuted} style={{ textAlign: "center" }}>
            Break time — stretch, breathe, hydrate.
          </Body>
          <Text size={56} weight="extraBold" color={colors.textMuted} style={{ fontVariant: ["tabular-nums"] }}>
            {formatMMSS(secondsLeft)}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: totalCycles }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: i === currentCycle - 1 ? colors.secondary : colors.neutralFill,
                  borderWidth: i === currentCycle - 1 ? 0 : 1,
                  borderColor: colors.toggleOff,
                }}
              />
            ))}
          </View>
          <Body size={fontSize.caption} color={colors.textFaint} style={{ textAlign: "center" }}>
            Break countdown · cycle {currentCycle + 1} will <Text weight="bold" size={fontSize.caption}>not</Text> start on its own
          </Body>
        </View>
        <View style={{ width: "100%", paddingHorizontal: 16, gap: 10 }}>
          <Button label={`Start Cycle ${currentCycle + 1}`} large onPress={handleStartNextCycle} />
          <Button label="End session here" variant="secondary" onPress={() => setEndConfirmOpen(true)} />
        </View>
        <ConfirmModal
          visible={endConfirmOpen}
          title="End this session early?"
          message={`It still counts toward your total time.`}
          confirmLabel="End session"
          cancelLabel="Keep going"
          confirmVariant="destructive"
          onConfirm={handleEndSessionConfirm}
          onCancel={() => setEndConfirmOpen(false)}
        />
      </ScreenContainer>
    );
  }

  if (phase === "completePrompt" && completedSession) {
    const minutes = Math.round((completedSession.durationSeconds ?? 0) / 60);
    return (
      <ScreenContainer>
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: "rgba(26,26,26,.45)", justifyContent: "center" }}>
            <View style={{ marginHorizontal: 16, backgroundColor: colors.bgCard, borderRadius: radii.modal, padding: spacing.md, gap: 14, alignItems: "center" }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryTintBg, alignItems: "center", justifyContent: "center" }}>
                <Text size={28}>✓</Text>
              </View>
              <Text size={fontSize.xl} weight="bold">
                Session complete
              </Text>
              <View style={{ flexDirection: "row", gap: 20 }}>
                <View style={{ alignItems: "center" }}>
                  <Text size={fontSize.body} weight="bold">
                    {formatMinutes(minutes)}
                  </Text>
                  <Body size={fontSize.micro} color={colors.textFaint}>
                    focused
                  </Body>
                </View>
                <View style={{ alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text size={fontSize.body} weight="bold" color={colors.secondaryText}>
                      +{completedSession.pointsEarned ?? 0} XP
                    </Text>
                    <InfoTooltip topic="xp" color={colors.secondaryText} />
                  </View>
                  <Body size={fontSize.micro} color={colors.textFaint}>
                    earned
                  </Body>
                </View>
              </View>
              <Body color={colors.textMuted} style={{ textAlign: "center" }}>
                Is <Text weight="bold">{task.name}</Text> done, or will you come back to it?
              </Body>
              <View style={{ width: "100%", gap: 10 }}>
                <Button label="Mark task complete 🎉" onPress={handleMarkTaskComplete} loading={finishing} />
                <Button label="Keep task open" variant="secondary" onPress={handleKeepTaskOpen} />
              </View>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  const percent = ((WORK_SECONDS - secondsLeft) / WORK_SECONDS) * 100;

  return (
    <ScreenContainer backgroundColor={colors.bgFocusSession}>
      <View style={{ alignItems: "center", gap: 8, paddingTop: 8 }}>
        <Body weight="semiBold" color={colors.textMuted}>
          {task.name}
        </Body>
        <CategoryTag category={category} />
        {params.dndEnabled ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: colors.primaryTintBg,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: radii.pill,
            }}
          >
            <Text size={fontSize.tiny}>🔕</Text>
            <Body size={fontSize.tiny} weight="semiBold" color={colors.primaryTintText}>
              Do Not Disturb · preview
            </Body>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 28, paddingHorizontal: 32 }}>
        <Text size={fontSize.timer} weight="extraBold" style={{ fontVariant: ["tabular-nums"] }}>
          {formatMMSS(secondsLeft)}
        </Text>
        <View style={{ width: "100%", gap: 10 }}>
          <ProgressBar percent={percent} height={10} linear />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Body size={fontSize.caption} color={colors.textFaint}>
              {Math.round(percent)}% complete
            </Body>
            {focusMode === "pomodoro" ? (
              <Body size={fontSize.caption} color={colors.textFaint}>
                Cycle {currentCycle} of {totalCycles}
              </Body>
            ) : (
              <Body size={fontSize.caption} color={colors.textFaint}>
                25 min session
              </Body>
            )}
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 6 }}>
          <CompanionOrb state="resting" size={40} />
          <Body size={fontSize.micro} color={colors.textFaint}>
            {restingLine(name)}
          </Body>
        </View>
        {focusMode === "pomodoro" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: totalCycles }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: i < currentCycle ? colors.primary : colors.neutralFill,
                  borderWidth: i < currentCycle ? 0 : 1,
                  borderColor: colors.toggleOff,
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
        <Button
          label={paused ? "▶ Resume" : "❙❙ Pause"}
          variant="secondary"
          onPress={() => setPaused((p) => !p)}
          style={{ flex: 1.4 }}
        />
        <Button label="End Session" variant="destructive" onPress={() => setEndConfirmOpen(true)} style={{ flex: 1 }} />
      </View>
      <ConfirmModal
        visible={endConfirmOpen}
        title="End this session early?"
        message="It still counts toward your total time."
        confirmLabel="End session"
        cancelLabel="Keep going"
        confirmVariant="destructive"
        onConfirm={handleEndSessionConfirm}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}
