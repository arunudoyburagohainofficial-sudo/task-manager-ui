import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useIsFocused } from "@react-navigation/native";
import { TOUR_STEPS, useTour, type TargetRect, type TargetShape, type TourStep } from "../state/TourContext";
import { radius, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

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
    body: "A goal is something you show up for repeatedly. Tap + beside Goals to make your first one.",
    // Both of the first two steps live on Home, so it's tempting to assume they're always
    // looking at it — but any screen reachable from Home (a task, Settings, Progress) leaves
    // the step running with nothing to point at, and the card then told people to tap a "+"
    // that wasn't in front of them. Seen on a device, 2026-09-26, on Task Detail.
    waiting: "Head back to Home to make your first goal.",
  },
  capture: {
    title: "Now capture a task",
    body: "Tap Ferne to jot down whatever you want to work on.",
    waiting: "Head back to Home and tap Ferne at the bottom of the screen.",
  },
  describe: {
    title: "Name your task",
    body: "Type what you want to work on, then tap “Confirm & Organize”.",
    waiting: "Tap Ferne at the bottom of the screen to name your task.",
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
  const styles = useThemedStyles(makeStyles);
  const { activeStep, targetRect, targetVariant, targetBody, targetBlocking, targetShape, ringRect, nextAction, skip, back, hasInlineSlot } = useTour();
  const { width, height } = useWindowDimensions();
  // This overlay covers the whole window, system bars included, so the card has to carry
  // the insets itself.
  const insets = useSafeAreaInsets();

  /**
   * Where this overlay's own top-left sits in window coordinates.
   *
   * Targets are measured with `measureInWindow`, but the ring is drawn with absolute
   * positioning *inside this view* — two different origins. They only agree if the overlay
   * starts exactly at the window's top-left, and on Android it doesn't: the root view sits
   * under the status bar, so the ring landed a status-bar's height away from the control it
   * was pointing at. On a phone that put step 1's ring over the stat strip while the + it
   * describes sat visibly below it (seen on an emulator, 2026-09-26).
   *
   * Measured rather than assumed — subtracting `insets.top` would fix Android today and break
   * whenever the app goes edge-to-edge, or on a platform where the two origins already match.
   * Reconciling the systems directly is right in every case, including zero.
   */
  const overlayRef = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const measureOrigin = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y) => {
      setOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
    });
  }, []);

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
      <View ref={overlayRef} onLayout={measureOrigin} style={StyleSheet.absoluteFill} pointerEvents="box-none">
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

  // Into this view's own coordinates before anything is drawn — see `origin` above.
  const localRect = {
    ...targetRect,
    x: targetRect.x - origin.x,
    y: targetRect.y - origin.y,
  };
  const hole = inflate(localRect, HALO, width, height);

  /*
   * What to draw the ring around. A "control" rings its own hole; a "region" rings only the
   * control it nominated, and nothing when it nominated none.
   */
  const ringSource =
    targetVariant === "control" ? targetRect : ringRect;
  const ring = ringSource
    ? inflate(
        { ...ringSource, x: ringSource.x - origin.x, y: ringSource.y - origin.y },
        HALO,
        width,
        height
      )
    : null;

  // Prefer placing the card below the highlight; flip above when there isn't room.
  const spaceBelow = height - (hole.y + hole.height);
  const below = spaceBelow > CARD_ESTIMATED_HEIGHT + CARD_GAP;
  const cardPosition = below
    ? { top: hole.y + hole.height + CARD_GAP }
    : { bottom: height - hole.y + CARD_GAP };

  const onLastStep = isLastStep(activeStep);

  return (
    <View ref={overlayRef} onLayout={measureOrigin} style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
          <Path d={scrimPath(hole, width, height, targetShape)} fill="rgba(26,26,26,.55)" fillRule="evenodd" />
        </Svg>
      </View>

      {/*
        Invisible input blockers around the hole. These *are* four rectangles, but nothing
        is drawn in them so their seams can't be seen — and a hairline gap between two
        transparent blockers is harmless. Everything outside the highlighted control is
        inert; the hole itself is left uncovered so the control stays tappable.
      */}
      {/* The scrim above is drawn either way; only the touch-swallowing is optional. A step
          that spotlights its "continue" control still needs what came before it editable —
          see targetBlocking. */}
      {targetBlocking ? (
        <>
          <Blocker style={{ top: 0, left: 0, right: 0, height: hole.y }} />
          <Blocker style={{ top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }} />
          <Blocker style={{ top: hole.y, left: 0, width: hole.x, height: hole.height }} />
          <Blocker style={{ top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }} />
        </>
      ) : null}

      {/* Ring only for a single control. A region is a whole block of the screen kept
          live, and boxing it just reads as a stray border. pointerEvents none is
          essential — it sits over the control the user is asked to tap.

          A region may still nominate one control to ring (see TourRing): the step keeps the
          whole screen interactive, but the user is shown where to start. */}
      {ring ? (
        <View
          pointerEvents="none"
          style={[
            styles.ring,
            { top: ring.y, left: ring.x, width: ring.width, height: ring.height },
            // A round control needs a round ring; the default 12px corner clipped the docked
            // Ferne's ears. Half the shorter side is a circle for a square target.
            targetShape === "circle" ? { borderRadius: Math.min(ring.width, ring.height) / 2 } : null,
          ]}
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
            onNext={nextAction}
          />
        </View>
      )}
    </View>
  );
}

/** Transparent, blocks touches. */
function Blocker({ style }: { style: object }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.blocker, style]} />;
}

/**
 * The scrim: the full screen as one subpath, the spotlight as a second, rounded subpath.
 * Filled with evenodd so the inner one becomes a hole rather than more fill.
 */
function scrimPath(hole: TargetRect, width: number, height: number, shape: TargetShape = "rounded"): string {
  const { x, y, width: w, height: h } = hole;
  // Matches the ring drawn over it — a rounded-rect hole behind a circular ring shows the
  // undimmed corners poking out past it.
  const r = shape === "circle" ? Math.min(w, h) / 2 : Math.min(radius.card, w / 2, h / 2);

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
  const styles = useThemedStyles(makeStyles);
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
  onNext,
}: {
  step: TourStep;
  copy: { title: string; body: string };
  onSkip: () => void;
  /**
   * Offered by the screen when one action of a multi-part step is done — see nextAction.
   * Sits where Skip would, because by then moving on is the likelier intent.
   */
  onNext?: (() => void) | null;
  /** Omitted on the first step, where there is nowhere to go back to. */
  onBack?: () => void;
  /**
   * Last step only. The scrim blocks the rest of the screen, so there has to be an
   * explicit way out that isn't "Skip" — by this point the user has finished the tour
   * rather than abandoned it, and the wording should say so.
   */
  onFinish?: () => void;
}) {
  const theme = useTheme();
  return (
    <>
      <Text style={t(T.meta, { fontWeight: "800", color: theme.color.interactive })}>{stepLabel(step)}</Text>
      <Text style={t(T.h2, { fontSize: 20, color: theme.color.text, marginTop: 2 })}>{copy.title}</Text>
      <Text style={t(T.body, { color: theme.color.textBody, marginTop: 6, lineHeight: 21 })}>{copy.body}</Text>
      <Footer onSkip={onSkip} onBack={onBack} onFinish={onFinish} onNext={onNext} />
    </>
  );
}

function Footer({
  onSkip,
  onBack,
  onFinish,
  onNext,
}: {
  onSkip: () => void;
  onBack?: () => void;
  onFinish?: () => void;
  onNext?: (() => void) | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.footer}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10}>
          <Text style={t(T.meta, { fontWeight: "800", color: theme.color.selectedText })}>← Back</Text>
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
      ) : onNext ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={onNext} style={styles.finish}>
          <Text style={t(T.meta, { fontWeight: "800", color: "#FFFFFF" })}>Next →</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10}>
          <Text style={t(T.meta, { fontWeight: "800", color: theme.color.textFaint })}>Skip tour</Text>
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

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    ring: {
      position: "absolute",
      borderRadius: radius.card,
      // Thicker than it would need to be over a dimmed backdrop: with the rest of the screen
      // at full brightness, the ring is the only thing marking the target.
      borderWidth: 3,
      borderColor: t.color.interactive,
    },
    card: {
      position: "absolute",
      left: space.gutter,
      right: space.gutter,
      backgroundColor: t.color.card,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: t.color.border,
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
      backgroundColor: t.color.card,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingVertical: 14,
      paddingHorizontal: space.card,
    },
    blocker: {
      position: "absolute",
      // No background: the SVG scrim above draws the dimming as one seamless shape. These
      // exist only to swallow touches.
    },
    finish: {
      backgroundColor: t.color.interactive,
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
