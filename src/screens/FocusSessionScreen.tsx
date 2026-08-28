import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { focusSessionsApi } from "../api";
import { useCompleteTaskMutation, useTaskQuery } from "../api/queries/useTasks";
import type { FocusSessionDto } from "../api/types";
import {
  Body,
  Button,
  ConfirmModal,
  DoNotDisturbIcon,
  Ferne,
  H2,
  InfoTooltip,
  Meta,
  ProgressBar,
  ScreenContainer,
  Timer,
} from "../components";
import { useCompanion } from "../state/CompanionContext";
import { color, FONT_SCALE_CORRECTION, radius, space, text as t, type as T } from "../theme";
import { restingLine } from "../theme/companionCopy";
import { formatMMSS, formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "FocusSession">;

const BREAK_SECONDS = 5 * 60;

type Phase = "working" | "break" | "completePrompt";

export function FocusSessionScreen() {
  const { name } = useCompanion();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { sessionId, taskId, focusMode, totalCycles, sessionMinutes } = params;
  const WORK_SECONDS = sessionMinutes * 60;

  // Almost always an instant cache hit: TaskDetailScreen (the only screen that navigates
  // here) already has this exact task cached under this exact key.
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
          numPomodoroCycles:
            focusMode === "pomodoro" ? (wasInterrupted ? cycleRef.current - 1 : totalCycles) : undefined,
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

  const cycleDots = (filled: (i: number) => boolean) => (
    <View style={styles.dotsRow}>
      {Array.from({ length: totalCycles }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            filled(i)
              ? { backgroundColor: color.interactive }
              : { backgroundColor: color.fill, borderWidth: 1, borderColor: color.border },
          ]}
        />
      ))}
    </View>
  );

  if (phase === "break") {
    return (
      <ScreenContainer>
        <View style={styles.breakContainer}>
          <Meta style={styles.centerText}>{task.name}</Meta>

          <View style={styles.breakContent}>
            <View style={styles.breakIcon}>
              <Text style={{ fontSize: 32 }}>☕</Text>
            </View>
            <H2>Cycle {currentCycle} complete</H2>
            <Meta style={styles.centerText}>Break time — stretch, breathe, hydrate.</Meta>
            <Text style={t(T.timer, { fontSize: 56, color: color.textMuted, textAlign: "center" })}>
              {formatMMSS(secondsLeft)}
            </Text>
            {cycleDots((i) => i === currentCycle - 1)}
            <Meta style={[styles.centerText, { color: color.textFaint }]}>
              Break countdown · cycle {currentCycle + 1} will not start on its own
            </Meta>
          </View>

          <View style={styles.bottomStack}>
            <Button label={`Start Cycle ${currentCycle + 1}`} onPress={handleStartNextCycle} />
            <Button label="End session here" variant="secondary" onPress={() => setEndConfirmOpen(true)} />
          </View>
        </View>

        <ConfirmModal
          visible={endConfirmOpen}
          title="End this session early?"
          message="It still counts toward your total time."
          confirmLabel="End session"
          cancelLabel="Keep going"
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
            <View style={styles.modalCard}>
              <View style={styles.completeIcon}>
                <Text style={{ fontSize: 28 }}>✓</Text>
              </View>
              <H2>Session complete</H2>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Body style={{ fontWeight: "800", color: color.text }}>{formatMinutes(minutes)}</Body>
                  <Meta style={{ color: color.textFaint }}>focused</Meta>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.xpRow}>
                    <Body style={{ fontWeight: "800", color: color.success }}>
                      +{completedSession.pointsEarned ?? 0} XP
                    </Body>
                    <InfoTooltip topic="xp" color={color.success} />
                  </View>
                  <Meta style={{ color: color.textFaint }}>earned</Meta>
                </View>
              </View>

              <Meta style={styles.centerText}>Is “{task.name}” done, or will you come back to it?</Meta>

              <View style={styles.modalActions}>
                <Button label="Mark task complete 🎉" loading={finishing} onPress={handleMarkTaskComplete} />
                <Button label="Keep task open" variant="secondary" onPress={handleKeepTaskOpen} />
              </View>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  const percent = ((WORK_SECONDS - secondsLeft) / WORK_SECONDS) * 100;
  const minutesLeft = Math.floor(secondsLeft / 60);

  return (
    <ScreenContainer>
      <View style={styles.sessionContainer}>
        <Meta style={[styles.centerText, { fontWeight: "800", color: color.text }]}>{task.name}</Meta>

        {params.dndEnabled ? (
          <View style={styles.dndPillWrap}>
            <View style={styles.dndPill}>
              <DoNotDisturbIcon size={18} />
              <Meta style={{ fontWeight: "800", color: color.success }}>Do Not Disturb · preview</Meta>
            </View>
          </View>
        ) : null}

        <View style={styles.timerBlock}>
          <Timer
            accessibilityLabel={`${minutesLeft} minutes remaining`}
            style={styles.timerText}
          >
            {formatMMSS(secondsLeft)}
          </Timer>

          <View style={styles.progressSection}>
            <ProgressBar pct={percent} height={7} />
            <View style={styles.progressFooter}>
              <Meta>{Math.round(percent)}% complete</Meta>
              <Meta>
                {focusMode === "pomodoro" ? `Cycle ${currentCycle} of ${totalCycles}` : `${sessionMinutes} min session`}
              </Meta>
            </View>
          </View>

          <View style={styles.restingSection}>
            <Ferne size={54} state="asleep" />
            <Meta>{restingLine(name)}</Meta>
          </View>

          {focusMode === "pomodoro" ? cycleDots((i) => i < currentCycle) : null}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Button
          label={paused ? "▶ Resume" : "❙❙ Pause"}
          variant="secondary"
          onPress={() => setPaused((p) => !p)}
          style={styles.bottomButton}
        />
        <Button
          label="End Session"
          variant="destructive"
          onPress={() => setEndConfirmOpen(true)}
          style={styles.bottomButton}
        />
      </View>

      <ConfirmModal
        visible={endConfirmOpen}
        title="End this session early?"
        message="It still counts toward your total time."
        confirmLabel="End session"
        cancelLabel="Keep going"
        onConfirm={handleEndSessionConfirm}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sessionContainer: {
    flex: 1,
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
  },
  centerText: {
    textAlign: "center",
  },
  dndPillWrap: {
    alignItems: "center",
    marginTop: space.sm,
  },
  dndPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.successBorder,
    backgroundColor: color.successFill,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  timerBlock: {
    flex: 1,
    justifyContent: "center",
  },
  timerText: {
    textAlign: "center",
    // Set on this style prop rather than merged into Timer's own t(T.timer, ...) call —
    // the Timer component only accepts a style override, not an `extra` to merge into the
    // token — so it never saw TYPE_SCALE's correction on its own. Multiplying by the same
    // factor t() applies internally keeps it in sync with the digits beside it.
    lineHeight: 76 * FONT_SCALE_CORRECTION,
    fontVariant: ["tabular-nums"],
  },
  progressSection: {
    marginTop: 26,
  },
  progressFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.sm,
  },
  restingSection: {
    alignItems: "center",
    gap: 9,
    marginTop: 26,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm,
    marginTop: 16,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  bottomRow: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.gutter,
    paddingTop: space.base,
    paddingBottom: 18,
  },
  bottomButton: {
    flex: 1,
  },
  breakContainer: {
    flex: 1,
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
  },
  breakContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.base,
  },
  breakIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.successFill,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomStack: {
    gap: space.md,
    paddingBottom: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,26,.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.gutter,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: color.card,
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    gap: space.base,
  },
  completeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.successFill,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: space.lg,
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  modalActions: {
    width: "100%",
    gap: space.md,
    marginTop: space.xs,
  },
});
