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
import { View } from "react-native";
import { goBackIfPossible } from "../navigation/navigationRef";

const STORAGE_KEY = "tour-v1";

/**
 * The first-run walkthrough, in order. Each step names a real thing the user does — the
 * tour advances by watching those actions happen, never by a "Next" button, so it can't
 * get out of step with what's actually on screen.
 */
export const TOUR_STEPS = ["goal", "capture", "attachGoal", "start"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourContextValue {
  activeStep: TourStep | null;
  /** Where the active step's highlighted element sits on screen; null until measured. */
  targetRect: TargetRect | null;
  /** Called once Home has real data — no-op if the tour was already finished or skipped. */
  startIfNeeded: () => void;
  /**
   * Moves past `from`, but only if it's the step actually showing. Screens fire these from
   * their normal handlers, and those handlers run on later visits too — the guard is what
   * stops a user who finished the tour from silently re-advancing a tour that isn't running.
   */
  advance: (from: TourStep) => void;
  /**
   * Steps back one. Deliberately does not undo anything the user already did — a goal they
   * created stays created. This is a way to re-read a step, not an undo stack.
   */
  back: () => void;
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
  /** Runs the walkthrough again from step one, regardless of it having been finished before. */
  restart: () => void;
  reportTarget: (step: TourStep, rect: TargetRect | null) => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeStep, setActiveStep] = useState<TourStep | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [inlineSlots, setInlineSlots] = useState(0);
  const [loaded, setLoaded] = useState(false);

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

  const finish = useCallback(() => {
    finishedRef.current = true;
    activeStepRef.current = null;
    setActiveStep(null);
    setTargetRect(null);
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

  const back = useCallback(() => {
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
    goBackIfPossible();
  }, []);

  const restart = useCallback(() => {
    // Clears the finished flag too, so quitting halfway through a replay doesn't leave the
    // tour armed to reappear on the next launch.
    finishedRef.current = false;
    activeStepRef.current = TOUR_STEPS[0];
    setTargetRect(null);
    setActiveStep(TOUR_STEPS[0]);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ finished: false })).catch(() => {});
  }, []);

  const reportTarget = useCallback((step: TourStep, rect: TargetRect | null) => {
    // Only the active step may move the spotlight — a screen still mounted underneath
    // (Home, while Capture sits on top of it) otherwise fights for it.
    if (activeStepRef.current !== step) return;
    setTargetRect(rect);
  }, []);

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
      startIfNeeded,
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
      startIfNeeded,
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
}: {
  step: TourStep;
  children: React.ReactNode;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  const { activeStep, reportTarget } = useTour();
  const ref = useRef<View>(null);
  const isActive = activeStep === step;

  const measure = useCallback(() => {
    if (!isActive) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) reportTarget(step, { x, y, width, height });
    });
  }, [isActive, step, reportTarget]);

  useEffect(() => {
    if (!isActive) return;
    // Two passes: one for the common case, one after any entrance animation or list
    // layout has settled. Measuring too early is the usual cause of a misplaced spotlight.
    measure();
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
  }, [isActive, measure]);

  return (
    <View ref={ref} collapsable={false} onLayout={measure} style={style}>
      {children}
    </View>
  );
}
