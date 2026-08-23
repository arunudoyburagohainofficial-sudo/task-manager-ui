import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { useCompleteTaskMutation, useTaskQuery } from "../api/queries/useTasks";
import type { FocusSessionDto } from "../api/types";
import { Body, Button, CompanionOrb, ConfirmModal, InfoTooltip, ProgressBar, ScreenContainer, Text } from "../components";
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

const styles = StyleSheet.create({
  breakContainer: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 32,
  },
  breakHeader: {
    alignItems: "center",
    gap: 8,
    paddingTop: 20,
  },
  breakContent: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  iconCircle72: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tabularNums: {
    fontVariant: ["tabular-nums"],
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  centerText: {
    textAlign: "center",
  },
  bottomButtons: {
    width: "100%",
    paddingHorizontal: 16,
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,26,.45)",
    justifyContent: "center",
  },
  modalCard: {
    marginHorizontal: 16,
    borderRadius: radii.modal,
    padding: spacing.md,
    gap: 14,
    alignItems: "center",
  },
  iconCircle64: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
  },
  statItem: {
    alignItems: "center",
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modalActions: {
    width: "100%",
    gap: 10,
  },
  workingHeader: {
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  dndPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 32,
  },
  progressSection: {
    width: "100%",
    gap: 10,
  },
  progressFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  restingSection: {
    alignItems: "center",
    gap: 6,
  },
  bottomActionRow: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  pauseButton: {
    flex: 1.4,
  },
  endButton: {
    flex: 1,
  },
});

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
  const completeTaskMutation = useCompleteTaskMutation();
  const task = taskQuery.data ?? null;
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
      <ScreenContainer backgroundColor={colors.bgFocusSession} style={styles.breakContainer}>
        <View style={styles.breakHeader}>
          <Body weight="semiBold" color={colors.textMuted}>
            {task.name}
          </Body>
        </View>
        <View style={styles.breakContent}>
          <View style={[styles.iconCircle72, { backgroundColor: colors.primaryTintBg }]}>
            <Text size={32}>☕</Text>
          </View>
          <Text size={fontSize.xl} weight="extraBold">
            Cycle {currentCycle} complete!
          </Text>
          <Body color={colors.textMuted} style={styles.centerText}>
            Break time — stretch, breathe, hydrate.
          </Body>
          <Text size={56} weight="extraBold" color={colors.textMuted} style={styles.tabularNums}>
            {formatMMSS(secondsLeft)}
          </Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: totalCycles }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === currentCycle - 1 ? colors.secondary : colors.neutralFill,
                    borderWidth: i === currentCycle - 1 ? 0 : 1,
                    borderColor: colors.toggleOff,
                  },
                ]}
              />
            ))}
          </View>
          <Body size={fontSize.caption} color={colors.textFaint} style={styles.centerText}>
            Break countdown · cycle {currentCycle + 1} will <Text weight="bold" size={fontSize.caption}>not</Text> start on its own
          </Body>
        </View>
        <View style={styles.bottomButtons}>
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
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.bgCard }]}>
              <View style={[styles.iconCircle64, { backgroundColor: colors.primaryTintBg }]}>
                <Text size={28}>✓</Text>
              </View>
              <Text size={fontSize.xl} weight="bold">
                Session complete
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text size={fontSize.body} weight="bold">
                    {formatMinutes(minutes)}
                  </Text>
                  <Body size={fontSize.micro} color={colors.textFaint}>
                    focused
                  </Body>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.xpRow}>
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
              <Body color={colors.textMuted} style={styles.centerText}>
                Is <Text weight="bold">{task.name}</Text> done, or will you come back to it?
              </Body>
              <View style={styles.modalActions}>
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
      <View style={styles.workingHeader}>
        <Body weight="semiBold" color={colors.textMuted}>
          {task.name}
        </Body>
        {params.dndEnabled ? (
          <View style={[styles.dndPill, { backgroundColor: colors.primaryTintBg }]}>
            <Text size={fontSize.tiny}>🔕</Text>
            <Body size={fontSize.tiny} weight="semiBold" color={colors.primaryTintText}>
              Do Not Disturb · preview
            </Body>
          </View>
        ) : null}
      </View>
      <View style={styles.centerContent}>
        <Text size={fontSize.timer} weight="extraBold" style={styles.tabularNums}>
          {formatMMSS(secondsLeft)}
        </Text>
        <View style={styles.progressSection}>
          <ProgressBar percent={percent} height={10} linear />
          <View style={styles.progressFooterRow}>
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
        <View style={styles.restingSection}>
          <CompanionOrb state="resting" size={40} />
          <Body size={fontSize.micro} color={colors.textFaint}>
            {restingLine(name)}
          </Body>
        </View>
        {focusMode === "pomodoro" ? (
          <View style={styles.dotsRow}>
            {Array.from({ length: totalCycles }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i < currentCycle ? colors.primary : colors.neutralFill,
                    borderWidth: i < currentCycle ? 0 : 1,
                    borderColor: colors.toggleOff,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.bottomActionRow}>
        <Button
          label={paused ? "▶ Resume" : "❙❙ Pause"}
          variant="secondary"
          onPress={() => setPaused((p) => !p)}
          style={styles.pauseButton}
        />
        <Button label="End Session" variant="destructive" onPress={() => setEndConfirmOpen(true)} style={styles.endButton} />
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
