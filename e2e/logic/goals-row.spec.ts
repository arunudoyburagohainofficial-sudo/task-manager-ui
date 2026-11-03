import { expect, test } from "@playwright/test";
import { goalsRowLayout, MIN_GOAL_CARD_WIDTH } from "../../src/utils/goalsLayout";

/**
 * How a row of goal cards is sized.
 *
 * From a real one, seen on a device on 2026-09-22: four goals on Progress drew four cards
 * sharing the screen width, about 70px each. The ring survived, the goal's name disappeared
 * entirely, and "0 of 20 days" wrapped to one character per line. Home was correct throughout,
 * because it had this arithmetic and Progress had none — so these checks are against the shared
 * definition both screens now use.
 */

const GAP = 9;
/** The design's own width: 375 wide, 20pt gutters. */
const PHONE = 375 - 2 * 20;
/** The narrowest phone worth supporting. */
const SMALL = 320 - 2 * 20;

test.describe("goals row layout", () => {
  test("GOALROW-01 one goal fills the row without scrolling", () => {
    const { scroll, cardWidth } = goalsRowLayout(PHONE, 1, GAP);
    expect(scroll).toBe(false);
    // undefined means the card falls back to flex: 1 and takes the row.
    expect(cardWidth).toBeUndefined();
  });

  test("GOALROW-02 two goals split the row exactly, as drawn", () => {
    expect(goalsRowLayout(PHONE, 2, GAP)).toEqual({ scroll: false, cardWidth: undefined });
  });

  test("GOALROW-03 three goals scroll", () => {
    expect(goalsRowLayout(PHONE, 3, GAP).scroll).toBe(true);
  });

  test("GOALROW-04 four goals scroll rather than shrink — the bug this fixes", () => {
    const { scroll, cardWidth } = goalsRowLayout(PHONE, 4, GAP);
    expect(scroll).toBe(true);
    /*
     * The failure was ~70px a card: ring intact, name gone, "0 of 20 days" one character per
     * line. Asserted as "roughly half the row" rather than against MIN_GOAL_CARD_WIDTH, because
     * on a 375-wide phone this is 150 — the peek factor is applied after the floor, and the
     * floor only engages once a *pair* would fall below it. That's deliberate: at this width
     * raising the card to 160 would leave a 3px sliver of the next one, which is no peek at all.
     * 150 is what Home has rendered correctly all along.
     */
    expect(cardWidth!).toBeGreaterThan(140);
  });

  test("GOALROW-05 a card never shrinks as more goals are added", () => {
    // The whole defect was width divided by count. Past the point where the row scrolls, the
    // card size must stop depending on how many there are.
    const widths = [3, 4, 5, 8, 20].map((n) => goalsRowLayout(PHONE, n, GAP).cardWidth);
    expect(new Set(widths).size).toBe(1);
  });

  test("GOALROW-06 a scrolling card leaves the next one peeking at the edge", () => {
    // Narrower than half the row, so the following card is partly visible — otherwise nothing
    // on screen says the row scrolls at all.
    const { cardWidth } = goalsRowLayout(PHONE, 3, GAP);
    expect(cardWidth!).toBeLessThan((PHONE - GAP) / 2);
  });

  test("GOALROW-07 on a narrow phone even two goals scroll", () => {
    // 320 wide splits two cards at ~140, where a single word like "Interview" broke mid-word.
    expect(goalsRowLayout(SMALL, 2, GAP).scroll).toBe(true);
    expect(goalsRowLayout(SMALL, 2, GAP).cardWidth).toBe(MIN_GOAL_CARD_WIDTH);
  });

  test("GOALROW-08 a narrow phone's cards still respect the minimum", () => {
    for (const count of [2, 3, 4, 6]) {
      expect(goalsRowLayout(SMALL, count, GAP).cardWidth!, `${count} goals`).toBeGreaterThanOrEqual(
        MIN_GOAL_CARD_WIDTH
      );
    }
  });

  test("GOALROW-09 no goals asks for no scrolling", () => {
    expect(goalsRowLayout(PHONE, 0, GAP).scroll).toBe(false);
  });

  test("GOALROW-10 a tablet-width row keeps two goals side by side", () => {
    expect(goalsRowLayout(1024 - 40, 2, GAP).scroll).toBe(false);
  });
});
