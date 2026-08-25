import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
const COPY: Record<TourStep, { step: string; title: string; body: string; waiting?: string }> = {
  goal: {
    step: "1 of 4",
    title: "Start with a goal",
    body: "A goal is something you show up for repeatedly. Tap “+ Goal” to make your first one.",
  },
  capture: {
    step: "2 of 4",
    title: "Now capture a task",
    body: "Tap Ferne to jot down whatever you want to work on. You can add several at once.",
  },
  attachGoal: {
    step: "3 of 4",
    title: "Count it toward your goal",
    body: "Tap here to attach the task to your goal — finishing it will move that goal forward.",
    waiting: "Type your task, then tap “Confirm & Organize” to keep going.",
  },
  start: {
    step: "4 of 4",
    title: "Then just start",
    body: "Tap Focus to begin a session. That’s the whole loop — capture, attach, focus.",
    waiting: "Head back to Home to start the task you just made.",
  },
};

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
  const { activeStep, targetRect, skip, back, hasInlineSlot } = useTour();
  const { width, height } = useWindowDimensions();
  // This overlay covers the whole window, system bars included, so the card has to carry
  // the insets itself.
  const insets = useSafeAreaInsets();

  if (!activeStep) return null;
  const copy = COPY[activeStep];
  const canGoBack = TOUR_STEPS.indexOf(activeStep) > 0;

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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Ring around the target. pointerEvents none is essential — it sits directly over
          the control the user is being asked to tap, and must never intercept that tap. */}
      <View
        pointerEvents="none"
        style={[styles.ring, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
      />

      <View style={[styles.card, cardPosition]}>
        <CardBody copy={copy} onSkip={skip} onBack={canGoBack ? back : undefined} />
      </View>
    </View>
  );
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
export function TourInlineSlot({ style }: { style?: React.ComponentProps<typeof View>["style"] }) {
  const { activeStep, isWaiting, skip, back, registerInlineSlot } = useTour();

  // Registering tells TourOverlay to stop floating its own copy while this is mounted.
  useEffect(() => registerInlineSlot(), [registerInlineSlot]);

  if (!activeStep || !isWaiting) return null;
  const copy = COPY[activeStep];
  const canGoBack = TOUR_STEPS.indexOf(activeStep) > 0;

  return (
    <View style={[styles.inlineCard, style]}>
      <CardBody
        copy={{ ...copy, body: copy.waiting ?? copy.body }}
        onSkip={skip}
        onBack={canGoBack ? back : undefined}
      />
    </View>
  );
}

function CardBody({
  copy,
  onSkip,
  onBack,
}: {
  copy: { step: string; title: string; body: string };
  onSkip: () => void;
  /** Omitted on the first step, where there is nowhere to go back to. */
  onBack?: () => void;
}) {
  return (
    <>
      <Text style={t(T.meta, { fontWeight: "800", color: color.interactive })}>{copy.step}</Text>
      <Text style={t(T.h2, { fontSize: 20, color: color.text, marginTop: 2 })}>{copy.title}</Text>
      <Text style={t(T.body, { color: color.textBody, marginTop: 6, lineHeight: 21 })}>{copy.body}</Text>
      <Footer onSkip={onSkip} onBack={onBack} />
    </>
  );
}

function Footer({ onSkip, onBack }: { onSkip: () => void; onBack?: () => void }) {
  return (
    <View style={styles.footer}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10}>
          <Text style={t(T.meta, { fontWeight: "800", color: color.selectedText })}>← Back</Text>
        </Pressable>
      ) : (
        // Keeps "Skip tour" hard right on step one too, rather than jumping sides.
        <View />
      )}
      <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10}>
        <Text style={t(T.meta, { fontWeight: "800", color: color.textFaint })}>Skip tour</Text>
      </Pressable>
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
});
