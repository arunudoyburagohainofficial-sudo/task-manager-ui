import { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { FocusMode } from "../api/types";
import { px, textAtDesignSize as ds, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { BottomSheet } from "./BottomSheet";
import { hydrateSessionPosition, isSessionPositionHydrated, useSessionPosition } from "../utils/sessionPosition";

/** The lengths the chip offers. Anything else is still reachable from Task Detail. */
export const FOCUS_LENGTHS = [15, 25, 50, 90] as const;

/** Rounds a Pomodoro sitting can run. Beyond six it stops being a sitting. */
export const POMODORO_CYCLES = [2, 3, 4, 5] as const;

/** How far across the track the knob must travel before the slide counts. */
const COMMIT_FRACTION = 0.72;

/** One rest between rounds, mirroring FocusSessionScreen.BREAK_SECONDS. */
const BREAK_MS = 5 * 60_000;

function PlayMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l11-6.5z" fill={color} />
    </Svg>
  );
}

/**
 * Slide to start, rather than tap.
 *
 * Home is a scrolling list with a tappable control every few rows, and starting a session is the
 * one action here that writes to the server and takes over the screen. A slide cannot be fired by
 * a stray tap on the way past, and still costs one motion.
 */
function SlideToStart({ label, onCommit }: { label: string; onCommit: () => void }) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  // Both read through refs because the responder is built once, on first render, and would
  // otherwise close over that render's values forever. Width would be stuck at 0; onCommit was
  // stuck on the first one, so picking Pomodoro and sliding still started a regular session.
  const travelRef = useRef(0);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const knob = px(46);
  travelRef.current = Math.max(0, trackWidth - knob - px(8));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(travelRef.current, g.dx))),
      onPanResponderRelease: (_, g) => {
        const travel = travelRef.current;
        if (travel > 0 && g.dx >= travel * COMMIT_FRACTION && !committed.current) {
          committed.current = true;
          // Snap to the end so the control looks resolved while the session is created.
          Animated.timing(x, { toValue: travel, duration: 90, useNativeDriver: true }).start(() => {
            commitRef.current();
            committed.current = false;
            x.setValue(0);
          });
          return;
        }
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <View
      style={s.slideTrack}
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Slide right to start focusing"
      // A slide is unreachable with a screen reader, so the same control activates the ordinary
      // way too.
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={onCommit}
    >
      <Text style={[ds(T.button, { fontSize: 16, color: t.surface.primaryInk }), s.slideLabel]}>{label}</Text>
      <Text style={[ds(T.button, { fontSize: 15, color: t.surface.primaryInk }), s.slideChevrons]}>›››</Text>
      <Animated.View
        style={[s.slideKnob, { width: knob, height: knob, transform: [{ translateX: x }] }]}
        {...pan.panHandlers}
      >
        <PlayMark size={px(20)} color={t.surface.primary} />
      </Animated.View>
    </View>
  );
}

/**
 * The live half of the card, with its own one-second clock.
 *
 * Separate so the tick stays here: Home is a SectionList, and re-rendering the whole screen every
 * second to move a colon was never worth it. The countdown is read off an instant rather than
 * counted down, so a phone picked back up shows where the clock actually is.
 */
function RunningSession({
  sessionId,
  taskName,
  endsAt,
  plannedMs,
  cycles,
  onOpen,
  onFinish,
  onStartNextCycle,
  finishing,
}: {
  sessionId: string;
  taskName: string;
  endsAt: number | null;
  plannedMs: number | null;
  /** Work blocks in the sitting; 1 for a regular session. */
  cycles: number;
  onOpen: () => void;
  onFinish: () => void;
  onStartNextCycle: (nextCycle: number, blockMs: number) => Promise<void>;
  finishing: boolean;
}) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());

  /*
   * Subscribed, not copied.
   *
   * Home used to work its own deadline out as `startedAt + plannedMinutes`, which is the whole
   * sitting. For a regular session that is right. For a Pomodoro it is a number that matches
   * nothing the user can see: plannedMinutes counts work and excludes breaks, so a 2 x 15 made
   * Home count down from 30:00 while the session screen counted the current 15-minute block.
   *
   * Reading the session screen's position fixed the arithmetic but not the ownership - each
   * screen still kept its own copy, so a pause on one left the other counting a deadline that
   * had already been suspended. There is one value now, in `sessionPosition`, and this
   * subscribes to it: a write there re-renders this card in the same tick.
   */
  const position = useSessionPosition(sessionId);
  const [positionRead, setPositionRead] = useState(() => isSessionPositionHydrated());
  useEffect(() => {
    // Only does anything after a cold start; served from memory every time after that.
    void hydrateSessionPosition().then(() => setPositionRead(true));
  }, []);

  const paused = position?.pausedWithMsLeft != null;
  const onBreak = position?.phase === "break";
  // A paused block holds its remaining time; otherwise count to whichever deadline is known.
  const target = position ? position.deadline : endsAt;

  useEffect(() => {
    if (paused || target == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target, paused]);

  const leftMs = paused
    ? position?.pausedWithMsLeft ?? null
    : target == null
      ? null
      : Math.max(0, target - now);
  const seconds = leftMs == null ? null : Math.ceil(leftMs / 1000);
  const clock =
    seconds == null
      ? "-"
      : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  /*
   * What the number under the clock actually means. Saying "left" over a break, or over a
   * paused block, would be three different claims wearing the same word.
   */
  const clockLabel = paused ? "paused" : onBreak ? "break left" : "left";
  // Only a session whose shape Home can see gets a round counter; a regular one has one block.
  const roundLine =
    cycles > 1 && position ? `Round ${Math.min(position.cycle, cycles)} of ${cycles}` : null;

  // Against the current block when one is known, so the bar and the clock agree.
  const blockMs = position && plannedMs && cycles > 0 ? plannedMs / cycles : plannedMs;
  const barBasis = onBreak ? BREAK_MS : blockMs;
  const filled = leftMs == null || !barBasis ? 0 : Math.max(0, Math.min(1, 1 - leftMs / barBasis));

  /*
   * The block has run out and nothing is going to move it on.
   *
   * The session screen finishes a regular block itself and rolls a Pomodoro into its break, but
   * only while it is mounted - it owns the timer. From Home the sitting simply sat at 00:00 with
   * no way to act on it, and the only thing that eventually closed it was auto-finish, five
   * minutes later. So the card offers the one action that moves things forward.
   */
  /*
   * Gated on the read, not just on the clock. Until the position answers, `target` falls back
   * to startedAt + the whole sitting - which for a Pomodoro is a different number from the
   * block the user is actually in, and offering Done against it would end a sitting that still
   * had rounds to run.
   */
  const atZero = positionRead && !paused && leftMs === 0;
  const currentCycle = position ? Math.min(position.cycle, cycles) : 1;
  const moreCyclesToGo = cycles > 1 && currentCycle < cycles;

  return (
    /*
     * The whole card opens the session.
     *
     * It used to carry two icon buttons, an expand and a stop. The expand duplicated what
     * tapping the card should obviously do, and the stop offered the one decision that should
     * not be a single tap on a screen that cannot show what the session is worth - ending it
     * belongs where the credit, the cycle and the confirmation live.
     */
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open session"
      onPress={onOpen}
      style={({ pressed }) => [s.card, pressed && s.cardPressed]}
    >
      <View style={s.runHead}>
        <View style={s.runDot} />
        <Text style={ds(T.eyebrow, { letterSpacing: 1, color: t.color.success })}>IN SESSION</Text>
      </View>
      <Text numberOfLines={1} style={ds(T.bodyLg, { fontSize: 17, fontWeight: "800", color: t.color.text })}>
        {taskName}
      </Text>

      {roundLine ? (
        <Text style={ds(T.meta, { fontSize: 13, color: t.color.textMuted, marginTop: 1 })}>
          {onBreak ? `${roundLine} · on a break` : roundLine}
        </Text>
      ) : null}

      <View style={s.runRow}>
        <View style={s.runClockRow}>
          <Text style={ds(T.timer, { fontSize: 42, letterSpacing: -1.6, color: t.color.text })}>{clock}</Text>
          <Text style={ds(T.meta, { fontSize: 14, color: t.color.textMuted })}>{clockLabel}</Text>
        </View>

        {atZero ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={moreCyclesToGo ? "Start next cycle" : "Done"}
            disabled={finishing}
            onPress={async () => {
              if (!moreCyclesToGo) return onFinish();
              await onStartNextCycle(currentCycle + 1, (plannedMs ?? 0) / Math.max(1, cycles));
              // No re-read: writing the position notifies this card, which is the whole point
              // of there being one value rather than two.
              setNow(Date.now());
            }}
            style={({ pressed }) => [s.zeroAction, pressed && s.cardPressed, finishing && s.zeroActionBusy]}
          >
            <Text style={ds(T.label, { fontSize: 15, fontWeight: "800", color: t.surface.actionInk })}>
              {moreCyclesToGo ? "Start next cycle" : "Done"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${filled * 100}%` }]} />
      </View>
    </Pressable>
  );
}

export interface FocusNowCardProps {
  /** Minutes per block, as the chip currently reads. */
  minutes: number;
  mode: FocusMode;
  /** Work blocks per sitting; only meaningful in Pomodoro. */
  cycles: number;
  onPick: (minutes: number, mode: FocusMode, cycles: number) => void;
  onStart: () => void;
  /** Present while a session is running — the card becomes that session's timer. */
  running?: {
    sessionId: string;
    taskName: string;
    /** When the planned time is up, epoch ms. Null for an open-ended session. */
    endsAt: number | null;
    /** The whole planned length in ms, for the progress bar. */
    plannedMs: number | null;
    /** Work blocks in the sitting; 1 for a regular session. */
    cycles: number;
    onOpen: () => void;
    /** The sitting is over: credit it and hand the card back to the slider. */
    onFinish: () => void;
    onStartNextCycle: (nextCycle: number, blockMs: number) => Promise<void>;
    finishing: boolean;
  } | null;
}

/**
 * Home's one place to start focusing, and the live timer once something is running.
 *
 * One card rather than two: the thing you start and the thing you watch occupy the same spot.
 */
export function FocusNowCard({ minutes, mode, cycles, onPick, onStart, running }: FocusNowCardProps) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);

  if (running) {
    return (
      <RunningSession
        sessionId={running.sessionId}
        taskName={running.taskName}
        endsAt={running.endsAt}
        plannedMs={running.plannedMs}
        cycles={running.cycles}
        onOpen={running.onOpen}
        onFinish={running.onFinish}
        onStartNextCycle={running.onStartNextCycle}
        finishing={running.finishing}
      />
    );
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={ds(T.eyebrow, { letterSpacing: 1, color: t.color.textLabel })}>FOCUS NOW</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Session length and mode, ${minutes} minutes ${mode}. ${open ? "Collapse" : "Change"}`}
          onPress={() => setOpen((v) => !v)}
          style={[s.chip, open && s.chipOpen]}
        >
          <Text
            style={ds(T.meta, {
              fontSize: 13.5,
              fontWeight: "700",
              color: open ? t.surface.primary : t.color.textBody,
            })}
          >
            {mode === "pomodoro" ? `${cycles} × ${minutes} min` : `${minutes} min`} ·{" "}
            {mode === "pomodoro" ? "Pomodoro" : "Regular"}
          </Text>
          <Text style={ds(T.meta, { fontSize: 12, color: open ? t.surface.primary : t.color.textMuted })}>
            {open ? "⌃" : "⌄"}
          </Text>
        </Pressable>
      </View>

      <SlideToStart label={slideLabel(minutes, mode, cycles)} onCommit={onStart} />

      {/*
        The picker was inline, and with rounds added it grew to three chip rows plus an
        explainer — half the screen, pushing Goals below the fold, for something touched once a
        week. A sheet gives it room without taking a permanent place on Home.
      */}
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={s.sheetBody}>
          <Text style={ds(T.h2, { fontSize: 20, letterSpacing: -0.4, color: t.color.text })}>How long?</Text>

          <View style={s.pickRow}>
            {FOCUS_LENGTHS.map((m) => (
              <PickChip key={m} label={`${m} min`} a11y={`${m} minutes`} on={m === minutes} onPress={() => onPick(m, mode, cycles)} />
            ))}
          </View>

          <View style={s.pickRow}>
            {(["regular", "pomodoro"] as const).map((m) => (
              <PickChip
                key={m}
                label={m === "pomodoro" ? "Pomodoro" : "Regular"}
                on={m === mode}
                onPress={() => onPick(minutes, m, cycles)}
              />
            ))}
          </View>

          {mode === "pomodoro" ? (
            <View style={s.pickRow}>
              {POMODORO_CYCLES.map((c) => (
                <PickChip key={c} label={`${c} rounds`} on={c === cycles} onPress={() => onPick(minutes, mode, c)} />
              ))}
            </View>
          ) : null}

          <Text style={ds(T.meta, { fontSize: 13, color: t.color.textMuted })}>
            {mode === "pomodoro"
              ? `${cycles * minutes} min of focus, with breaks between rounds`
              : `One unbroken stretch of ${minutes} min`}
          </Text>

          {/* Adjust and go, without closing the sheet first. */}
          <SlideToStart
            label={slideLabel(minutes, mode, cycles)}
            onCommit={() => {
              setOpen(false);
              onStart();
            }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function slideLabel(minutes: number, mode: FocusMode, cycles: number): string {
  // A Pomodoro sitting is cycles x minutes, so naming one block would understate it.
  return `Slide to focus · ${mode === "pomodoro" ? cycles * minutes : minutes} min`;
}

/** One boxed single choice. Three rows of these share a shape, so they share a component. */
function PickChip({ label, a11y, on, onPress }: { label: string; a11y?: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={[s.pickChip, on && s.pickChipOn]}
    >
      <Text style={ds(T.meta, { fontSize: 14, fontWeight: on ? "800" : "600", color: on ? t.surface.chipSelInk : t.surface.chipInk })}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface.card,
      borderWidth: 1,
      borderColor: t.surface.cardBorder,
      borderRadius: px(18),
      padding: px(14),
      gap: px(10),
    },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: px(7),
      backgroundColor: t.surface.chipBg,
      borderWidth: 1,
      borderColor: t.surface.chipBorder,
      borderRadius: px(10),
      paddingHorizontal: px(12),
      paddingVertical: px(8),
    },
    chipOpen: { borderColor: t.surface.primary, backgroundColor: t.surface.chipSelBg },

    sheetBody: { gap: px(12) },
    pickRow: { flexDirection: "row", gap: px(8) },
    totalLine: { paddingHorizontal: px(2), marginTop: px(-2) },
    // The chip family, not the segmented one: these are single-choice boxes, and `segActive` is
    // near-white — on a white card the selected chip read as the *unfilled* one.
    pickChip: {
      flex: 1,
      alignItems: "center",
      paddingVertical: px(11),
      borderRadius: px(10),
      borderWidth: 1,
      borderColor: t.surface.chipBorder,
      backgroundColor: t.surface.chipBg,
    },
    pickChipOn: { backgroundColor: t.surface.chipSelBg, borderColor: t.surface.chipSelBorder },

    slideTrack: {
      height: px(62),
      borderRadius: px(31),
      backgroundColor: t.surface.primary,
      justifyContent: "center",
      paddingHorizontal: px(8),
      overflow: "hidden",
    },
    slideLabel: { position: "absolute", left: px(68), fontWeight: "800" },
    slideChevrons: { position: "absolute", right: px(20), opacity: 0.65, fontWeight: "800" },
    slideKnob: {
      borderRadius: px(23),
      backgroundColor: t.surface.primaryInk,
      alignItems: "center",
      justifyContent: "center",
    },

    runHead: { flexDirection: "row", alignItems: "center", gap: px(7) },
    runDot: { width: px(8), height: px(8), borderRadius: px(4), backgroundColor: t.color.success },
    runRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: px(10) },
    runClockRow: { flexDirection: "row", alignItems: "baseline", gap: px(7) },
    /** The one thing to do once the clock has run out, so it reads as the obvious next tap. */
    zeroAction: {
      backgroundColor: t.surface.action,
      borderRadius: px(12),
      paddingVertical: px(11),
      paddingHorizontal: px(16),
    },
    zeroActionBusy: { opacity: 0.5 },
    // The only affordance left on a running card, so it has to read as tappable on touch.
    cardPressed: { opacity: 0.7 },
    progressTrack: { height: px(6), borderRadius: 99, backgroundColor: t.surface.segTrack, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 99, backgroundColor: t.surface.primary },
  });
