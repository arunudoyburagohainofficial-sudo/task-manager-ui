# 14 · Accessibility, motion and rendering — `A11Y`

**The risk:** this app is one person's daily companion, and the handoff calls its accessibility
requirements requirements rather than nice-to-haves. Two of them are also correctness issues in
disguise: the OS text-size setting changes layout, and Reduce Motion has to actually stop the
animations — the wash, Ferne, the pulse ring and the flame all loop forever otherwise.

- [ ] **A11Y-01 — Every interactive element has a name**
  - **Does:** crawl each screen and list controls without an accessible name.
  - **Proves:** none — every button, toggle, tab and row announces what it is.
  - **Why:** it's the handoff's stated rule, and it's also what makes this whole test suite
    possible to write without brittle selectors.

- [ ] **A11Y-02 — The tab bar announces which tab is selected**
  - **Proves:** the active tab reports its selected state, and Capture announces itself as a
    button rather than a fifth tab.
  - **Why:** Capture isn't a tab — it opens a sheet — and a screen reader shouldn't imply
    otherwise.

- [ ] **A11Y-03 — Reduce Motion stops everything that loops**
  - **Does:** emulate `prefers-reduced-motion: reduce` and take two screenshots a few seconds apart.
  - **Proves:** identical frames — the background blooms, Ferne, the capture rim and the streak
    flame are all still — and the layout is unchanged.
  - **Why:** the handoff allows ambient motion only on Home, and only when the user hasn't asked
    for stillness. It's also the difference between a calm app and a distracting one for someone
    with vestibular sensitivity.

- [ ] **A11Y-04 — Nothing depends on colour alone**
  - **Does:** render the four Home row kinds and the overdue/late markers in greyscale.
  - **Proves:** each is still distinguishable by its mark and its words.
  - **Why:** the row kinds are colour-coded by design; the icon and the label are what carry the
    meaning when colour can't.

- [ ] **A11Y-05 — Large text doesn't break the rows**
  - **Does:** raise the OS text scale to 1.3 (the app caps at 1.15).
  - **Proves:** row titles wrap rather than clip, the action buttons keep their labels, the stat
    strip's three columns still fit, and the tab labels don't collide.
  - **Why:** padding and icons don't scale with text; the cap exists because of that, and the
    cap itself needs proving.

- [ ] **A11Y-06 — The smallest and largest phones both work**
  - **Does:** 320×568 and 430×932.
  - **Proves:** no horizontal scrolling, no clipped controls, the goals row still legible, the
    tab bar intact, the docked button centred.
  - **Why:** the design is drawn at 375; everything either side of it is inference.

- [ ] **A11Y-07 — The known contrast gap is still the only one**
  - **Does:** measure contrast on every text-on-fill pair in the app.
  - **Proves:** the only failure is the documented white-on-interactive pair (3.15:1 against a
    4.5:1 target), and nothing new has joined it.
  - **Why:** it's a known open item with two proposed fixes in the theme file; a regression test
    keeps the list from growing while the decision waits.

- [ ] **A11Y-08 — Long content doesn't hide the primary action**
  - **Does:** a task with a very long name, a goal with a long name, twenty tasks on Home.
  - **Proves:** the Done/Focus button, the capture button and the tab bar all stay reachable.
  - **Why:** the docked button overlaps the list by design, which is exactly the kind of choice
    that eats a tap target when content grows.
