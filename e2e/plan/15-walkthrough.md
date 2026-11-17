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

- [ ] **TOUR-05 — A full day doesn't hide the task, and scrolled away from it the card says where to go**
  - **Does:** sixteen things due today; go through the tour to its last step; then scroll back
    to the top of the list.
  - **Proves:** the last step brings the new task up - wholly on screen, above the tab bar,
    with the ring around it and the card saying to tap Focus. Scrolled away, the ring goes and
    the hint card explains where to look - it doesn't ring an unrelated strip of UI at the
    screen edge.
  - **Why:** a task made in the tour has no day, so it sits under ANYTIME, below everything
    due today. The last step used to scroll to the top of the list, which was right while Home
    was one list with the newest task first; with four sections it left the task below the
    fold and the tour pointing at nothing (measured: on screen with 4 due today, off it with
    10). And a row scrolled below the fold still measures fine, just off-screen; the overlay
    used to clamp it back into view and spotlight the tab bar.
  - **Note:** the fillers have to be dated today. Undated ones sit *below* the tour's task
    (ANYTIME is newest first and shows five), so they never push it anywhere - which is how
    this test came to fail when the four sections arrived.

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

- [ ] **TOUR-11 — Reopening the app picks the tour up where it was left**
  - **Does:** finish step 1 and reload; then open capture (step 3) and reload again.
  - **Proves:** both times the tour resumes at step 2, "Now capture a task", and never goes back
    to step 1 to ask for a goal that already exists.
  - **Why:** the tour's place used to live only in memory. The capture steps cannot be picked up
    where they were, because the half-written task was never saved, so they resume at "open
    capture".
