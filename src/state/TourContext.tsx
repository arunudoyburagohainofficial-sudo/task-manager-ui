import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dimensions, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { goBackIfPossible } from "../navigation/navigationRef";

const STORAGE_KEY = "tour-v1";

/**
 * The first-run walkthrough, in order. Each step names a real thing the user does — the
 * tour advances by watching those actions happen, never by a "Next" button, so it can't
 * get out of step with what's actually on screen.
 *
 * One step per screen-action, deliberately. Letting a single step span two screens meant
 * its number showed up twice in a row with different wording each time, which reads like
 * the tour has lost its place.
 */
export const TOUR_STEPS = ["goal", "capture", "describe", "attachGoal", "start"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * "control" is a single thing to tap, and gets a ring drawn round it. "region" is a whole
 * interactive block to keep live — used where a step needs several controls at once (the
 * Capture screen needs its text field *and* its buttons), where a ring around the lot
 * would just look like a box.
 */
export type TargetVariant = "control" | "region";

interface TourContextValue {
  activeStep: TourStep | null;
  /** Where the active step's highlighted element sits on screen; null until measured. */
  targetRect: TargetRect | null;
  targetVariant: TargetVariant;
  /**
   * Copy supplied by whichever screen owns the current target, overriding the step's own.
   * A step can be reached on more than one screen with a different thing to do on each —
   * step 4 is "tap Confirm & Add" here and "tap Focus" on Home — and only the screen
   * holding the target knows which.
   */
  targetBody: string | null;
  /**
   * The step as it is *right now*, not as it was when the caller last rendered. Screens
   * check this from unmount cleanups, where a captured value (or even a ref written during
   * render) can be one step stale — which is enough to make a screen "helpfully" step the
   * tour back a second time after the user already did.
   */
  getActiveStep: () => TourStep | null;
  /** Called once Home has real data — no-op if the tour was already finished or skipped. */
  startIfNeeded: () => void;
  /**
   * The task the user actually created during the walkthrough, so the last step can point
   * at *that* row rather than whichever task happens to sit at the top of the list. Set by
   * the screen that creates it; null outside a tour.
   */
  tourTaskId: string | null;
  setTourTaskId: (taskId: string | null) => void;
  /**
   * Re-measures every active target. Needed because a target can move without re-rendering
   * or re-laying out — scrolling a list is the case that matters here, and neither onLayout
   * nor a render fires for it, so the rect would otherwise stay at its pre-scroll position.
   */
  remeasure: () => void;
  /** Bumped by remeasure(); TourTarget watches it. Not meant to be read by screens. */
  measureNonce: number;
  /**
   * Moves past `from`, but only if it's the step actually showing. Screens fire these from
   * their normal handlers, and those handlers run on later visits too — the guard is what
   * stops a user who finished the tour from silently re-advancing a tour that isn't running.
   */
  advance: (from: TourStep) => void;
  /**
   * Steps back one. Deliberately does not undo anything the user already did — a goal they
   * created stays created. This is a way to re-read a step, not an undo stack.
   *
   * Pops the screen too by default, since consecutive steps usually live on different
   * ones. Pass navigate: false when the screen is already going away on its own — leaving
   * a step stranded on a screen the user just left is what puts a stale card on Home.
   */
  back: (options?: { navigate?: boolean }) => void;
  skip: () => void;
  /** True while a step is active but its control isn't on screen to point at. */
  isWaiting: boolean;
  /**
   * Whether some screen has placed a TourInlineSlot for the waiting card. When one has,
   * the overlay stops floating its own copy — the screen's slot puts the card exactly
   * where it belongs in that layout instead of pinned to the bottom of the window.
   */
  hasInlineSlot: boolean;
  registerInlineSlot: () => () => void;
  reportTarget: (
    step: TourStep,
    rect: TargetRect | null,
    variant?: TargetVariant,
    body?: string | null
  ) => void;
  /** Runs the walkthrough again from step one, regardless of it having been finished before. */
  restart: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeStep, setActiveStep] = useState<TourStep | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetVariant, setTargetVariant] = useState<TargetVariant>("control");
  const [targetBody, setTargetBody] = useState<string | null>(null);
  const [inlineSlots, setInlineSlots] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tourTaskId, setTourTaskId] = useState<string | null>(null);
  const [measureNonce, setMeasureNonce] = useState(0);

  /**
   * The current step is mirrored into a ref so the callbacks below can read it without
   * listing it as a dependency (which would give every screen a new `advance` identity on
   * each step and re-run their effects). Reading it from a ref also keeps the state
   * updaters pure — doing this check *inside* a setState updater would mean firing storage
   * writes from a function React is free to call twice.
   */
  const activeStepRef = useRef<TourStep | null>(null);
  const finishedRef = useRef(true); // assume finished until storage says otherwise

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        finishedRef.current = stored ? Boolean(JSON.parse(stored).finished) : false;
      })
      .catch(() => {
        // Unreadable storage shouldn't trap someone in a tour forever — treat it as done.
        finishedRef.current = true;
      })
      .finally(() => setLoaded(true));
  }, []);

  const remeasure = useCallback(() => setMeasureNonce((n) => n + 1), []);

  const finish = useCallback(() => {
    finishedRef.current = true;
    activeStepRef.current = null;
    setActiveStep(null);
    setTargetRect(null);
    setTourTaskId(null);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ finished: true })).catch(() => {});
  }, []);

  const startIfNeeded = useCallback(() => {
    if (!loaded || finishedRef.current || activeStepRef.current) return;
    activeStepRef.current = TOUR_STEPS[0];
    setActiveStep(TOUR_STEPS[0]);
  }, [loaded]);

  const advance = useCallback(
    (from: TourStep) => {
      if (activeStepRef.current !== from) return;
      const next = TOUR_STEPS[TOUR_STEPS.indexOf(from) + 1];
      if (!next) {
        finish();
        return;
      }
      activeStepRef.current = next;
      setActiveStep(next);
      // The new step's element hasn't been measured yet; clearing avoids a frame where the
      // spotlight still sits on the previous step's position.
      setTargetRect(null);
    },
    [finish]
  );

  const back = useCallback((options?: { navigate?: boolean }) => {
    const current = activeStepRef.current;
    if (!current) return;
    const previous = TOUR_STEPS[TOUR_STEPS.indexOf(current) - 1];
    if (!previous) return;
    activeStepRef.current = previous;
    setTargetRect(null);
    setActiveStep(previous);
    // Steps mostly live on different screens, so going back a step usually means going
    // back a screen too (step 3 sits on Capture, step 2 on Home). A no-op when there's
    // nothing to pop, which is exactly right for two steps on the same screen.
    if (options?.navigate !== false) goBackIfPossible();
  }, []);

  const getActiveStep = useCallback(() => activeStepRef.current, []);

  const restart = useCallback(() => {
    // Clears the finished flag too, so quitting halfway through a replay doesn't leave the
    // tour armed to reappear on the next launch.
    finishedRef.current = false;
    activeStepRef.current = TOUR_STEPS[0];
    setTargetRect(null);
    // A replay creates its own task; last run's would otherwise be pointed at again.
    setTourTaskId(null);
    setActiveStep(TOUR_STEPS[0]);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ finished: false })).catch(() => {});
  }, []);

  const reportTarget = useCallback(
    (
      step: TourStep,
      rect: TargetRect | null,
      variant: TargetVariant = "control",
      body: string | null = null
    ) => {
      // Only the active step may move the spotlight — a screen still mounted underneath
      // (Home, while Capture sits on top of it) otherwise fights for it.
      if (activeStepRef.current !== step) return;
      setTargetRect(rect);
      setTargetVariant(variant);
      setTargetBody(rect ? body : null);
    },
    []
  );

  // Counted rather than a boolean: screens mount and unmount in overlapping order during a
  // navigation transition, and a plain flag would be cleared by the outgoing screen after
  // the incoming one already set it.
  const registerInlineSlot = useCallback(() => {
    setInlineSlots((n) => n + 1);
    return () => setInlineSlots((n) => Math.max(0, n - 1));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      activeStep,
      targetRect,
      targetVariant,
      targetBody,
      getActiveStep,
      startIfNeeded,
      tourTaskId,
      setTourTaskId,
      remeasure,
      measureNonce,
      advance,
      back,
      skip: finish,
      restart,
      reportTarget,
      isWaiting: Boolean(activeStep) && !targetRect,
      hasInlineSlot: inlineSlots > 0,
      registerInlineSlot,
    }),
    [
      activeStep,
      targetRect,
      targetVariant,
      targetBody,
      getActiveStep,
      startIfNeeded,
      tourTaskId,
      remeasure,
      measureNonce,
      advance,
      back,
      finish,
      restart,
      reportTarget,
      inlineSlots,
      registerInlineSlot,
    ]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}

/**
 * Wraps whatever the tour should point at. Measures in window coordinates, which is what
 * the overlay needs — it renders as a sibling of the whole navigator, not inside the
 * screen, so screen-relative coordinates would be wrong.
 *
 * collapsable={false} is required, not cosmetic: Android flattens plain Views out of the
 * native hierarchy as an optimisation, and a flattened View measures as zero.
 */
export function TourTarget({
  step,
  children,
  style,
  variant = "control",
  body,
}: {
  step: TourStep;
  children: React.ReactNode;
  style?: React.ComponentProps<typeof View>["style"];
  variant?: TargetVariant;
  /** Overrides the step's copy — see targetBody. Needed where one step has a different action per screen. */
  body?: string;
}) {
  const { activeStep, reportTarget, measureNonce } = useTour();
  const ref = useRef<View>(null);
  /**
   * Focus matters as much as the step does. Two screens can hold a target for the same
   * step (Capture and Confirm & Organize both do for "attachGoal"), and the one underneath
   * stays mounted — without this it would keep re-reporting its own rect and steal the
   * spotlight from the screen actually in front of the user.
   */
  const isFocused = useIsFocused();
  const isActive = activeStep === step && isFocused;

  const measure = useCallback(() => {
    if (!isActive) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      /**
       * Reject targets that aren't actually visible. A row scrolled below the fold still
       * measures fine — it just reports coordinates outside the window — and the overlay
       * used to clamp that back into view, drawing the spotlight over whatever happened to
       * sit at the screen edge (the tab bar). Reporting null instead falls back to the
       * hint card, which is honest about there being nothing to point at.
       */
      const screen = Dimensions.get("window");
      const fullyOffScreen = y + height <= 0 || y >= screen.height || x + width <= 0 || x >= screen.width;
      reportTarget(step, fullyOffScreen ? null : { x, y, width, height }, variant, body ?? null);
    });
  }, [isActive, step, reportTarget, variant, body]);

  useEffect(() => {
    if (!isActive) return;
    // Two passes: one for the common case, one after any entrance animation or list
    // layout has settled. Measuring too early is the usual cause of a misplaced spotlight.
    measure();
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
    // measureNonce re-runs this when something moved the target without re-rendering it
    // (a list scroll), which neither onLayout nor a re-render would catch.
  }, [isActive, measure, measureNonce]);

  /**
   * Drop the rect as soon as this target stops being the live one — the screen was pushed
   * behind another, or unmounted.
   *
   * Without this the last reported rect simply persists, and the overlay keeps drawing a
   * spotlight at those coordinates over whatever screen is now in front, ringing an
   * unrelated strip of UI. Clearing it instead puts the tour in its waiting state, which
   * correctly says "head back to Home".
   */
  useEffect(() => {
    if (isActive) return;
    reportTarget(step, null, variant);
  }, [isActive, step, variant, reportTarget]);

  return (
    <View ref={ref} collapsable={false} onLayout={measure} style={style}>
      {children}
    </View>
  );
}
