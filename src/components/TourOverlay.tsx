import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useIsFocused } from "@react-navigation/native";
import { TOUR_STEPS, useTour, type TargetRect, type TourStep } from "../state/TourContext";
import { color, radius, space, text as t, type as T } from "../theme";

/** Breathing room between the highlighted control and the ring drawn around it. */
const HALO = 8;
/** Gap between the highlight and the coaching card. */
const CARD_GAP = 14;
const CARD_ESTIMATED_HEIGHT = 170;

/**
 * `waiting` is shown while the step's own control isn't on screen yet — a step can become
 * active a screen or two before the thing it points at exists (attachGoal activates when
 * capture opens, but its control only appears on Confirm & Organize). Without it the card
 * would give an instruction for a control the user can't see.
 */
const COPY: Record<TourStep, { title: string; body: string; waiting?: string }> = {
  goal: {
    title: "Start with a goal",
    body: "A goal is something you show up for repeatedly. Tap “+ Goal” to make your first one.",
  },
  capture: {
    title: "Now capture a task",
    body: "Tap Ferne to jot down whatever you want to work on.",
  },
  describe: {
    title: "Name your task",
    body: "Type what you want to work on, then tap “Confirm & Organize”.",
    waiting: "Open capture from Home to name your task.",
  },
  attachGoal: {
    title: "Count it toward your goal",
    body: "Tap here to attach the task to your goal — finishing it will move that goal forward.",
    waiting: "Head to Confirm & Organize to attach a goal.",
  },
  start: {
    title: "Then just start",
    body: "Tap Focus to begin a session. That’s the whole loop — capture, attach, focus.",
    // True whether the user is on another tab or simply scrolled the row out of sight —
    // "head back to Home" read as nonsense to someone already standing on Home.
    waiting: "Find the task you just made on your Home list and tap Focus to start it.",
  },
};

/**
 * Derived rather than written into COPY. Hard-coding "3 of 4" beside each entry meant every
 * change to the step list silently left stale numbering behind — which is exactly how a
 * step ended up claiming the wrong position.
 */
function stepLabel(step: TourStep): string {
  return `${TOUR_STEPS.indexOf(step) + 1} of ${TOUR_STEPS.length}`;
}

function isLastStep(step: TourStep): boolean {
  return TOUR_STEPS.indexOf(step) === TOUR_STEPS.length - 1;
}

/**
 * No way back from the final step. By then the goal and the task both exist, and "← Back"
 * only re-reads a step — it undoes nothing — so offering it there invites the user to go
 * looking for an undo that isn't coming. Finish is the only thing left to do.
 *
 * Shared by all three cards rather than recomputed at each, so they can't disagree about
 * which steps have a back link.
 */
function canStepBack(step: TourStep): boolean {
  return TOUR_STEPS.indexOf(step) > 0 && !isLastStep(step);
}

/**
 * First-run walkthrough. Renders as a sibling of the navigator (see App.tsx) so it can
 * follow the user across screens and sit above the tab bar.
 *
 * Nothing here dims or covers the app. Every part of this overlay is either
 * pointerEvents="none" or sits inside a box-none container, so the only thing that ever
 * receives a touch is the card itself — the app stays completely usable while the tour
 * runs, and each step advances by the user performing the real action rather than by
 * pressing "Next".
 */
export function TourOverlay() {
  const { activeStep, targetRect, targetVariant, targetBody, skip, back, hasInlineSlot } = useTour();
  const { width, height } = useWindowDimensions();
  // This overlay covers the whole window, system bars included, so the card has to carry
  // the insets itself.
  const insets = useSafeAreaInsets();

  if (!activeStep) return null;
  const copy = COPY[activeStep];
  const canGoBack = canStepBack(activeStep);

  /**
   * The step's control isn't on screen — usually because the step activated a screen or
   * two before the thing it points at exists.
   *
   * If the current screen placed a TourInlineSlot, that renders the card in its own layout
   * and this floats nothing. The bottom-pinned version below is the fallback for screens
   * that haven't, and exists mainly so Skip is always reachable — without it a step whose
   * control never appears would leave the tour invisible but still running.
   */
  if (!targetRect) {
    if (hasInlineSlot) return null;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.card, { bottom: insets.bottom + 16 }]}>
          <CardBody
            step={activeStep}
            copy={{ ...copy, body: copy.waiting ?? copy.body }}
            onSkip={skip}
            onBack={canGoBack ? back : undefined}
          />
        </View>
      </View>
    );
  }

  const hole = inflate(targetRect, HALO, width, height);

  // Prefer placing the card below the highlight; flip above when there isn't room.
  const spaceBelow = height - (hole.y + hole.height);
  const below = spaceBelow > CARD_ESTIMATED_HEIGHT + CARD_GAP;
  const cardPosition = below
    ? { top: hole.y + hole.height + CARD_GAP }
    : { bottom: height - hole.y + CARD_GAP };

  const onLastStep = isLastStep(activeStep);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/*
        One SVG path for the whole scrim, not four rectangles around the hole. Four
        adjacent semi-transparent views show hairline seams where their edges meet —
        rounding leaves sub-pixel gaps and the overlapping alpha darkens the joins. A
        single path with an evenodd fill rule is one continuous shape with a hole punched
        in it, so there is nothing to seam. Purely visual: pointerEvents none, with the
        blockers below doing the actual input blocking.
      */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={width} height={height}>
          <Path d={scrimPath(hole, width, height)} fill="rgba(26,26,26,.55)" fillRule="evenodd" />
        </Svg>
      </View>

      {/*
        Invisible input blockers around the hole. These *are* four rectangles, but nothing
        is drawn in them so their seams can't be seen — and a hairline gap between two
        transparent blockers is harmless. Everything outside the highlighted control is
        inert; the hole itself is left uncovered so the control stays tappable.
      */}
      <Blocker style={{ top: 0, left: 0, right: 0, height: hole.y }} />
      <Blocker style={{ top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }} />
      <Blocker style={{ top: hole.y, left: 0, width: hole.x, height: hole.height }} />
      <Blocker style={{ top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }} />

      {/* Ring only for a single control. A region is a whole block of the screen kept
          live, and boxing it just reads as a stray border. pointerEvents none is
          essential — it sits over the control the user is asked to tap. */}
      {targetVariant === "control" ? (
        <View
          pointerEvents="none"
          style={[styles.ring, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
        />
      ) : null}

      {/* A screen that placed an inline slot renders the card itself, in its own layout. */}
      {hasInlineSlot ? null : (
        <View style={[styles.card, cardPosition]}>
          <CardBody
            step={activeStep}
            copy={{ ...copy, body: targetBody ?? copy.body }}
            onSkip={skip}
            onBack={canGoBack ? back : undefined}
            onFinish={onLastStep ? skip : undefined}
          />
        </View>
      )}
    </View>
  );
}

/** Transparent, blocks touches. */
function Blocker({ style }: { style: object }) {
  return <View style={[styles.blocker, style]} />;
}

/**
 * The scrim: the full screen as one subpath, the spotlight as a second, rounded subpath.
 * Filled with evenodd so the inner one becomes a hole rather than more fill.
 */
function scrimPath(hole: TargetRect, width: number, height: number): string {
  const { x, y, width: w, height: h } = hole;
  const r = Math.min(radius.card, w / 2, h / 2);

  const outer = `M0,0 H${width} V${height} H0 Z`;
  const inner =
    `M${x + r},${y} ` +
    `H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} ` +
    `V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} ` +
    `H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;

  return `${outer} ${inner}`;
}

/**
 * The waiting card, rendered in a screen's own layout rather than floating. Screens place
 * this exactly where the guidance belongs — on Capture, directly beneath the action row,
 * so it reads as part of the page instead of being pinned to the bottom of the window with
 * a gap of dead space above it.
 *
 * Renders nothing unless the tour is actually waiting, so it costs a screen nothing to
 * leave in place permanently.
 */
export function TourInlineSlot({
  style,
  body,
  always = false,
}: {
  style?: React.ComponentProps<typeof View>["style"];
  /**
   * Overrides the step's own wording. A step's copy describes the control it points at,
   * which is wrong on a screen the user is only passing through — "tap here to attach a
   * goal" makes no sense on Capture. The screen knows what it wants said, so it says it.
   */
  body?: string;
  /**
   * By default this only takes over while the tour is waiting (no control to point at).
   * When a step *does* have a target on this screen, the floating card is better — it sits
   * right beside the thing it's describing. Capture is the exception: its target is a whole
   * region containing this card, so it must render inline even then.
   */
  always?: boolean;
}) {
  const { activeStep, isWaiting, skip, back, registerInlineSlot } = useTour();
  // Same reasoning as TourTarget's focus guard: a screen left mounted underneath would
  // otherwise keep its slot registered and suppress the card on the screen in front.
  const isFocused = useIsFocused();
  const shows = Boolean(activeStep) && isFocused && (always || isWaiting);

  // Registering tells TourOverlay to stop floating its own copy — but only while this
  // slot is actually showing one, or the floating card would be suppressed with nothing
  // taking its place.
  useEffect(() => {
    if (!shows) return;
    return registerInlineSlot();
  }, [shows, registerInlineSlot]);

  if (!activeStep || !shows) return null;
  const copy = COPY[activeStep];
  const canGoBack = canStepBack(activeStep);
  const text = body ?? (isWaiting ? copy.waiting ?? copy.body : copy.body);

  return (
    <View style={[styles.inlineCard, style]}>
      <CardBody step={activeStep} copy={{ ...copy, body: text }} onSkip={skip} onBack={canGoBack ? back : undefined} />
    </View>
  );
}

function CardBody({
  step,
  copy,
  onSkip,
  onBack,
  onFinish,
}: {
  step: TourStep;
  copy: { title: string; body: string };
  onSkip: () => void;
  /** Omitted on the first step, where there is nowhere to go back to. */
  onBack?: () => void;
  /**
   * Last step only. The scrim blocks the rest of the screen, so there has to be an
   * explicit way out that isn't "Skip" — by this point the user has finished the tour
   * rather than abandoned it, and the wording should say so.
   */
  onFinish?: () => void;
}) {
  return (
    <>
      <Text style={t(T.meta, { fontWeight: "800", color: color.interactive })}>{stepLabel(step)}</Text>
      <Text style={t(T.h2, { fontSize: 20, color: color.text, marginTop: 2 })}>{copy.title}</Text>
      <Text style={t(T.body, { color: color.textBody, marginTop: 6, lineHeight: 21 })}>{copy.body}</Text>
      <Footer onSkip={onSkip} onBack={onBack} onFinish={onFinish} />
    </>
  );
}

function Footer({
  onSkip,
  onBack,
  onFinish,
}: {
  onSkip: () => void;
  onBack?: () => void;
  onFinish?: () => void;
}) {
  return (
    <View style={styles.footer}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10}>
          <Text style={t(T.meta, { fontWeight: "800", color: color.selectedText })}>← Back</Text>
        </Pressable>
      ) : (
        // Keeps the right-hand action hard right on step one too, rather than jumping sides.
        <View />
      )}
      {/* On the last step Finish replaces "Skip tour" rather than sitting beside it —
          offering both would ask the user to choose between two words for one action.
          Deliberately a small pill, not a full-width primary button: the card is guidance,
          and a big CTA inside it competes with the actual control being highlighted. */}
      {onFinish ? (
        <Pressable accessibilityRole="button" onPress={onFinish} style={styles.finish}>
          <Text style={t(T.meta, { fontWeight: "800", color: "#FFFFFF" })}>Finish</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10}>
          <Text style={t(T.meta, { fontWeight: "800", color: color.textFaint })}>Skip tour</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Grows the measured rect by `pad`, clamped so the ring can't spill off-screen. */
function inflate(rect: TargetRect, pad: number, width: number, height: number): TargetRect {
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x,
    y,
    width: Math.min(width - x, rect.width + pad * 2),
    height: Math.min(height - y, rect.height + pad * 2),
  };
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    borderRadius: radius.card,
    // Thicker than it would need to be over a dimmed backdrop: with the rest of the screen
    // at full brightness, the ring is the only thing marking the target.
    borderWidth: 3,
    borderColor: color.interactive,
  },
  card: {
    position: "absolute",
    left: space.gutter,
    right: space.gutter,
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 14,
    paddingHorizontal: space.card,
    // Lifts the card off the undimmed screen behind it.
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  // Same surface as the floating card, minus the absolute positioning — it sits in the
  // screen's normal flow.
  inlineCard: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 14,
    paddingHorizontal: space.card,
  },
  blocker: {
    position: "absolute",
    // No background: the SVG scrim above draws the dimming as one seamless shape. These
    // exist only to swallow touches.
  },
  finish: {
    backgroundColor: color.interactive,
    borderRadius: radius.control,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
});
