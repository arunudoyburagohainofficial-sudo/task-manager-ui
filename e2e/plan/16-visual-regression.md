# 16 · Visual regression — `VIS`

**The risk:** this app's design is the product, and its surfaces are built from gradients, inset
shadows, derived colours and hand-transcribed geometry. None of that is covered by a typecheck
and most of it is invisible to a behavioural test — a ring drawn at the wrong radius, a gradient
raking across a chip instead of lighting it from above, a shadow that silently stopped rendering.
The platform traps in `MD/engineering-notes.md` are all of this kind.

**How these work:** a stored screenshot per target, compared with a small pixel tolerance,
with dynamic text masked (names, times, counts) so a passing test means "it still looks right",
not "the data didn't change". Reduce Motion is forced on for every visual test so animated
surfaces produce a stable frame.

- [ ] **VIS-01 — Home, nothing running, against the design**
  - **Does:** seed the design's own content, render at 375×812, compare against the reference
    rendered from the design HTML.
  - **Proves:** within tolerance, the screen is the design — spacing, type, colour and the whole
    vertical rhythm.
  - **Why:** this comparison was done by hand during the rebuild and matched within ~2px. The
    only way that stays true is if a machine keeps checking.

- [ ] **VIS-02 — Home, session running, against the design**
  - **Proves:** the RIGHT NOW header and card, the countdown ring's geometry, and the shortened
    list below it.
  - **Why:** the second of the two states the design specifies, and the one with the most
    derived geometry (the ring is drawn from elapsed time).

- [ ] **VIS-03 — The docked tab bar**
  - **Proves:** the bar's height and border, the five slots, the raised capture disc with its
    gradient, rim and shadow, Ferne's size and position, and the active/inactive label styles.
  - **Why:** it's on every screen, it's the most intricate piece of drawing in the app, and its
    negative-margin overlap is fragile.

- [ ] **VIS-04 — The row family**
  - **Does:** component shots of all four open row kinds, a finished row, and an empty-state row.
  - **Proves:** tile colours, mark geometry, meta colours, the points pill and the action button.
  - **Why:** four kinds sharing one component is where a colour quietly gets used twice.

- [ ] **VIS-05 — The goal card across the palette**
  - **Does:** one card per preset colour plus the default, at 0%, 57% and 100%.
  - **Proves:** the ring track and ink derived from each colour stay legible and the arc starts
    at twelve o'clock.
  - **Why:** the derivation is arithmetic on lightness; a colour outside the two the design drew
    has never been looked at.

- [ ] **VIS-06 — The stat strip**
  - **Proves:** the three columns, their dividers, the flame and bolt marks, and the baseline
    alignment of "50" and "min".
  - **Why:** baseline alignment in a flex row renders differently per platform, and the strip is
    the first thing on the screen.

- [ ] **VIS-07 — The background wash, in both variants**
  - **Proves:** Home's variant (five layers, no closing overlay) and the ambient variant used
    everywhere else, each stable and correctly positioned at three screen sizes.
  - **Why:** the wash is transcribed CSS with two documented traps — gradient angles distorting
    with aspect ratio, and radial gradients defaulting to farthest-corner. Both produce a
    plausible-looking wrong result.

- [ ] **VIS-08 — Lifted surfaces still look lifted**
  - **Does:** the goal tiles, the Right Now card and the segmented control's thumb.
  - **Proves:** the rim, floor and drop shadows are all present.
  - **Why:** inset shadows render *below* a gradient on Android, which is why `InnerShading`
    exists as its own layer; a refactor that merges them flattens every surface at once.

- [ ] **VIS-09 — Three widths, one layout**
  - **Does:** 320, 375 and 430 wide.
  - **Proves:** no clipping, no overflow, the goals row and tab bar adapting as intended.
  - **Why:** cheap insurance on the assumption that everything scales from a 375 design.

- [ ] **VIS-10 — The other screens hold their shape**
  - **Does:** Scheduled with all three panels, Progress on each tab, Settings, Capture, Organize,
    Task Detail (focus and reminder), the session screen and the completion screen.
  - **Proves:** a baseline for each, so an unrelated theme or component change can't quietly
    reshape a screen nobody was looking at.
  - **Why:** the Home rebuild touched shared components — the theme, the icons, the wash, the
    container. Everything downstream of those needs a baseline.
