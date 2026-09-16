# 08 · Goals — `GOAL`

**The risk:** a goal is the longest-running thing in the app — a 20-day commitment is twenty
days of trust in one number. The rules behind that number are narrow and easy to misread: only
focused work moves it, only once a day, and it never goes backwards.

- [ ] **GOAL-01 — Creating a goal from the + on Home**
  - **Does:** name, colour, target days, save.
  - **Proves:** it appears immediately with a 0% ring in its own colour and "0 of N days".
  - **Why:** the + replaced the old "+ Goal" card in the strip; it's now the only way in from Home.

- [ ] **GOAL-02 — Editing name, colour and target**
  - **Proves:** the ring, the percentage, the text and every screen showing the goal follow —
    including a task's Goal row and Progress.
  - **Why:** the goal's colour is user-chosen and is derived into a ring track and ink at render
    time; a change has to flow through that derivation everywhere.

- [ ] **GOAL-03 — Deleting a goal keeps the tasks**
  - **Proves:** the goal disappears from Home, Progress and the picker; tasks that pointed at it
    survive and simply stop showing as Goal rows.
  - **Why:** deleting a category of work must never delete the work.

- [ ] **GOAL-04 — Finishing a focus task on a goal advances it by a day**
  - **Does:** complete a focus task attached to a 20-day goal.
  - **Proves:** the ring moves one day, on both Home and Progress.
  - **Why:** this is the entire feedback loop the goal exists for.

- [ ] **GOAL-05 — Two focus tasks on the same goal in one day count once**
  - **Proves:** the day count rises by one, not two.
  - **Why:** it counts *days you showed up*, not tasks; otherwise a busy morning finishes a
    20-day goal.

- [ ] **GOAL-06 — Finishing a reminder on a goal does not advance it**
  - **Proves:** the day count is unchanged, and nothing in the UI implied it would move.
  - **Why:** goals track focused work only — the same rule as streak and weekly progress. This is
    also the most surprising rule in the app, so the row and the detail screen must not overstate
    what finishing will do.

- [ ] **GOAL-07 — Goal progress survives an undo**
  - **Does:** complete a focus task on a goal, then undo it.
  - **Proves:** the day count stays where it was.
  - **Why:** documented as "never decreases" — undoing one completion doesn't prove the day
    didn't happen, and guessing wrong erases something real.

- [ ] **GOAL-08 — A finished goal reads as finished**
  - **Does:** drive a goal to its target.
  - **Proves:** 100%, the completed marker, and nothing that looks like an error or an overflow
    past 100%.
  - **Why:** the end of a twenty-day commitment should look like an ending.

- [ ] **GOAL-09 — Every palette colour produces a legible ring**
  - **Does:** one goal per preset colour, plus the default.
  - **Proves:** the ring's track, its fill and the percentage text are distinguishable for each —
    checked as a visual snapshot.
  - **Why:** the track and ink are derived from the goal's own colour by lightness, not picked by
    hand; a dark colour's track could vanish into the fill.

- [ ] **GOAL-10 — A long goal name doesn't break the card**
  - **Does:** a 40-character name, with and without spaces.
  - **Proves:** it wraps to two lines, the cards in a row stay the same height, the ring keeps
    its size.
  - **Why:** two cards side by side are the design's default layout, and uneven heights are the
    first thing that looks broken.

- [ ] **GOAL-11 — The goal picker reflects and changes a task's goal**
  - **Does:** from Task Detail, attach, change and clear.
  - **Proves:** the sheet shows the current goal as selected and each change writes through.
  - **Why:** the picker is shared by Task Detail and the Organize screen, so both paths have to
    agree about the current value.

- [ ] **GOAL-12 — The goals strip and Progress agree**
  - **Proves:** the same goals, the same day counts, the same order on both screens after a change.
  - **Why:** two screens reading one server figure through different components is exactly where
    a stale cache shows up.
