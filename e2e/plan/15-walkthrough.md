# 15 · The first-run walkthrough — `TOUR`

**The risk:** the tour advances by watching real actions rather than by Next buttons, which makes
it genuinely good and genuinely fragile: it's coupled to five specific controls on four screens.
Move one — as the Home rebuild just moved capture into the tab bar — and the tour either points
at nothing or points at the wrong thing, on the very first screen a new user ever sees.

- [ ] **TOUR-01 — It starts by itself on a new account, once Home has real data**
  - **Proves:** step 1 of 5 appears after Home has loaded, not before.
  - **Why:** the first step points at a control that has to be measurable; starting at sign-in
    spotlights an empty screen.

- [ ] **TOUR-02 — Step 1 points at the + beside GOALS and completes when a goal is created**
  - **Proves:** the spotlight is on the + button, and creating a goal — not editing one —
    advances to step 2.
  - **Why:** the control moved in the redesign; the copy moved with it and both must stay in step.

- [ ] **TOUR-03 — Step 2 points at the docked Ferne and completes when capture opens**
  - **Proves:** the spotlight sits on the capture button in the tab bar, and opening capture
    advances.
  - **Why:** the tour target now lives inside the tab bar rather than inside a screen — a
    different measuring context, and the thing most likely to break silently.

- [ ] **TOUR-04 — Steps 3, 4 and 5 point at the right controls on their own screens**
  - **Proves:** naming the task on Capture, attaching a goal on Organize, and the finished task's
    row on Home each hold the spotlight and advance on the real action.
  - **Why:** one step spans two screens (attach a goal is reachable from both), and the copy
    differs per screen — step 5 says "Focus" on a focus row and "Done" on a reminder row.

- [ ] **TOUR-05 — The waiting state appears when the target isn't on screen**
  - **Does:** reach a step, then navigate to another tab or scroll the target out of view.
  - **Proves:** the spotlight disappears and the hint card explains where to go — it doesn't ring
    an unrelated strip of UI at the screen edge.
  - **Why:** a row scrolled below the fold still measures fine, just off-screen; the overlay used
    to clamp it back into view and spotlight the tab bar.

- [ ] **TOUR-06 — The spotlight follows a scrolling row**
  - **Does:** at step 5, scroll the list.
  - **Proves:** the ring stays on the row, or falls back to the hint once the row leaves the
    screen.
  - **Why:** scrolling moves the target without a re-render or a layout event — nothing else
    would tell the overlay its position is stale.

- [ ] **TOUR-07 — Back re-reads a step without undoing anything**
  - **Proves:** going back a step returns to the previous screen and copy; the goal created in
    step 1 still exists.
  - **Why:** it's a way to re-read, not an undo stack — and a tour that deleted a user's first
    goal would be memorable for the wrong reason.

- [ ] **TOUR-08 — Skip ends it for good**
  - **Proves:** the overlay goes, and a reload doesn't bring it back.
  - **Why:** a tour that reappears after being dismissed is the definition of nagging.

- [ ] **TOUR-09 — Replay restarts it from step 1**
  - **Does:** Settings → Replay walkthrough.
  - **Proves:** it navigates to Home and starts at step 1, even for an account that finished it
    long ago, and quitting halfway doesn't leave it armed for the next launch.
  - **Why:** the replay path deliberately clears the finished flag; leaving it set would ambush
    the user on their next cold start.

- [ ] **TOUR-10 — The tour doesn't block the app**
  - **Does:** with the tour active, use an unrelated control (open Settings, complete a task).
  - **Proves:** the app remains usable and the tour keeps its place or waits.
  - **Why:** an overlay that swallows taps turns a first run into a trap.
