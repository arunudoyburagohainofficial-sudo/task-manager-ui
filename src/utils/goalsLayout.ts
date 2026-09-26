/**
 * How a row of goal cards is laid out for a given screen width and number of goals.
 *
 * Two goals fill the row exactly, as drawn. Beyond that they scroll, sized so the next one
 * shows at the edge — a third card hidden entirely behind the screen edge is a goal the user
 * has no reason to think exists.
 *
 * Extracted from HomeScreen because Progress drew the same row without any of this and simply
 * divided the width by the number of goals. At four goals that gives each card about 70px: the
 * ring survives, the name disappears completely, and "0 of 20 days" wraps to one character per
 * line (seen on a device, 2026-09-22). Home was fine the whole time, which is exactly why it
 * went unnoticed — the two screens had no shared definition to disagree about.
 */

/**
 * The narrowest card a goal's name still fits in beside its ring. Two cards split a 375-wide row
 * at ~167 each, comfortably above it — but on a 320-wide phone they split at ~140 and a single
 * word like "Interview" broke mid-word. Below this, two goals scroll like three do, and every
 * scrolling card keeps at least this width. At the design's own width nothing changes.
 */
export const MIN_GOAL_CARD_WIDTH = 160;

export interface GoalsRowLayout {
  /** Whether the row needs to scroll horizontally rather than share the width out. */
  scroll: boolean;
  /**
   * The width each card should be given, or undefined when they should divide the row between
   * them (`GoalRingCard` falls back to `flex: 1`). Only meaningful when `scroll` is true.
   */
  cardWidth: number | undefined;
}

export function goalsRowLayout(innerWidth: number, count: number, gap: number): GoalsRowLayout {
  const pairWidth = (innerWidth - gap) / 2;
  const narrow = pairWidth < MIN_GOAL_CARD_WIDTH;
  const scroll = count > 2 || (count === 2 && narrow);
  if (!scroll) return { scroll: false, cardWidth: undefined };
  // 0.92 leaves a sliver of the next card visible at the right edge, which is what tells the
  // reader the row scrolls at all.
  return {
    scroll: true,
    cardWidth: Math.max(Math.round(pairWidth * 0.92), narrow ? MIN_GOAL_CARD_WIDTH : 0),
  };
}
