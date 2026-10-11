import { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import type { FocusMode } from "../api/types";
import { px, textAtDesignSize as ds, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { BottomSheet } from "./BottomSheet";

/** The lengths the chip offers. Anything else is still reachable from Task Detail. */
export const FOCUS_LENGTHS = [15, 25, 50, 90] as const;

/** Rounds a Pomodoro sitting can run. Beyond six it stops being a sitting. */
export const POMODORO_CYCLES = [2, 3, 4, 5] as const;

/** How far across the track the knob must travel before the slide counts. */
const COMMIT_FRACTION = 0.72;

function PlayMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l11-6.5z" fill={color} />
    </Svg>
  );
}

function PauseMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="8" y="5.5" width="3" height="13" rx="1" fill={color} />
      <Rect x="13" y="5.5" width="3" height="13" rx="1" fill={color} />
    </Svg>
  );
}

function StopMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="7" y="7" width="10" height="10" rx="2" fill={color} />
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
  // Read inside the responder, which is created once and would otherwise close over width 0.
  const travelRef = useRef(0);

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
            onCommit();
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
  taskName,
  endsAt,
  plannedMs,
  onPause,
  onStop,
}: {
  taskName: string;
  endsAt: number | null;
  plannedMs: number | null;
  onPause: () => void;
  onStop: () => void;
}) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const leftMs = endsAt == null ? null : Math.max(0, endsAt - now);
  const seconds = leftMs == null ? null : Math.ceil(leftMs / 1000);
  const clock =
    seconds == null
      ? "-"
      : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const filled = leftMs == null || !plannedMs ? 0 : Math.max(0, Math.min(1, 1 - leftMs / plannedMs));

  return (
    <View style={s.card}>
      <View style={s.runHead}>
        <View style={s.runDot} />
        <Text style={ds(T.eyebrow, { letterSpacing: 1, color: t.color.success })}>IN SESSION</Text>
      </View>
      <Text numberOfLines={1} style={ds(T.bodyLg, { fontSize: 17, fontWeight: "800", color: t.color.text })}>
        {taskName}
      </Text>

      <View style={s.runRow}>
        <View style={s.runClockRow}>
          <Text style={ds(T.timer, { fontSize: 42, letterSpacing: -1.6, color: t.color.text })}>{clock}</Text>
          <Text style={ds(T.meta, { fontSize: 14, color: t.color.textMuted })}>left</Text>
        </View>
        <View style={s.runControls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open session" onPress={onPause} style={s.runButton}>
            <PauseMark size={px(16)} color={t.color.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="End session" onPress={onStop} style={s.runButton}>
            <StopMark size={px(14)} color={t.color.text} />
          </Pressable>
        </View>
      </View>

      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${filled * 100}%` }]} />
      </View>
    </View>
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
    taskName: string;
    /** When the planned time is up, epoch ms. Null for an open-ended session. */
    endsAt: number | null;
    /** The whole planned length in ms, for the progress bar. */
    plannedMs: number | null;
    onPause: () => void;
    onStop: () => void;
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
        taskName={running.taskName}
        endsAt={running.endsAt}
        plannedMs={running.plannedMs}
        onPause={running.onPause}
        onStop={running.onStop}
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
    runRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    runClockRow: { flexDirection: "row", alignItems: "baseline", gap: px(7) },
    runControls: { flexDirection: "row", gap: px(8) },
    runButton: {
      width: px(44),
      height: px(44),
      borderRadius: px(14),
      backgroundColor: t.surface.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    progressTrack: { height: px(6), borderRadius: 99, backgroundColor: t.surface.segTrack, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 99, backgroundColor: t.surface.primary },
  });
