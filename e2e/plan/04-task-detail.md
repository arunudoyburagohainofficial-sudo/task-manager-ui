# 04 · Task Detail — `DETAIL`

**The risk:** everything about a task that isn't "finish it" happens here — its type, its goal,
its nudges, and the start of a focus session. It's also the screen that has to cope with a task
that no longer exists, and the one where changing the type changes what the rest of the screen
even offers.

The schedule sheet opened from here is large enough to have its own file:
[05-schedule-sheet](05-schedule-sheet.md).

- [ ] **DETAIL-01 — Opens with the task's real state**
  - **Does:** open a task that has a date, a repeat, a notification, a goal and a nudge window.
  - **Proves:** the schedule row's one-line summary names all three parts of the schedule, the
    goal row shows the goal and its day count, and the nudge row shows the window.
  - **Why:** this screen is the only place the whole configuration is visible at once; a row that
    describes it wrongly is worse than no row.

- [ ] **DETAIL-02 — Switching to focus reveals the session controls**
  - **Does:** on a reminder task, switch the type to focus.
  - **Proves:** the focus session card appears (mode, length, Do Not Disturb, Start), the
    streak/progress note appears, and "Mark as done" is replaced by the session as the primary
    action.
  - **Why:** the type is what decides whether a task counts toward streak, weekly progress and
    goals. The screen has to make that consequence visible, not just change a label.

- [ ] **DETAIL-03 — Switching back to reminder removes them again**
  - **Proves:** the session card is *absent*, not disabled, and "Mark as done" returns.
  - **Why:** the handoff calls this out explicitly — a disabled session control on a reminder
    implies a reminder could run one.

- [ ] **DETAIL-04 — The type change survives a reload**
  - **Proves:** after switching and reloading, the new type is still there and Home's row kind
    matches.
  - **Why:** the switch is optimistic; a failed write that only rolled back locally would leave
    the two screens disagreeing.

- [ ] **DETAIL-05 — Attaching, changing and clearing a goal**
  - **Proves:** each writes through, the row updates, Home's row kind follows, and clearing
    leaves the task itself intact.
  - **Why:** the goal is the one association a task can gain and lose freely; losing the task with
    it would be catastrophic and is exactly the kind of thing a clear-button gets wrong.

- [ ] **DETAIL-06 — "Mark as done" finishes a reminder and returns**
  - **Proves:** back on Home the task is in DONE with +5, and its notifications are stopped.
  - **Why:** the second of the two completion paths (Home's button is the other) — both must
    award the same and stop the same things.

- [ ] **DETAIL-07 — Deleting a task removes it everywhere**
  - **Does:** delete, then check Home, Scheduled and the notifications screen.
  - **Proves:** it's gone from all of them, and its queued notifications are gone too.
  - **Why:** a deleted task that keeps buzzing, and whose notification opens a task that no longer
    exists, was a real bug.

- [ ] **DETAIL-08 — A task deleted elsewhere says so**
  - **Does:** open the task, delete it through the API, then interact.
  - **Proves:** "This task is gone" with a way back — not an endless spinner.
  - **Why:** this screen is deep-linked from notifications, so it genuinely gets opened for tasks
    that no longer exist.

- [ ] **DETAIL-09 — A finished task is read-only where editing would be a lie**
  - **Does:** open a completed task.
  - **Proves:** the schedule row offers no change, the nudge rows are absent, and the history is
    still readable.
  - **Why:** a repeat set on a finished task can never fire and the server refuses it; offering
    the control promises something untrue.

- [ ] **DETAIL-10 — "Nudge me in…" sets today and a real time**
  - **Does:** pick a preset (e.g. 45 minutes) at a known clock time.
  - **Proves:** the task becomes dated today with a notification at now + 45 minutes, computed on
    the device's clock, and the row shows that time.
  - **Why:** resolving this server-side is what once made the reminder fire in the past for anyone
    not on UTC. The arithmetic must stay on the device.

- [ ] **DETAIL-11 — A nudge picked close to midnight lands on the right day**
  - **Does:** at 23:50, pick "in 45 minutes".
  - **Proves:** the task is dated *tomorrow* with a 00:35 notification, not today.
  - **Why:** the date is derived from the resolved instant rather than from "today" — a rule with
    exactly one chance to be right.

- [ ] **DETAIL-12 — Repeated nudges: set, show, change and stop**
  - **Proves:** a window (start, end, interval) saves; the row reads "Every 30 min · 9 AM–5 PM";
    editing it updates rather than creating a second; "Stop nudging" removes it.
  - **Why:** create and update are different endpoints server-side and a second create 409s — the
    sheet has to choose correctly, and nothing else in the app exercises that choice.

- [ ] **DETAIL-13 — A nudge window that crosses midnight is refused clearly**
  - **Does:** try 10 PM to 2 AM.
  - **Proves:** the user is told why, in the sheet, before or instead of a raw server error.
  - **Why:** the server refuses `startTime >= endTime`, and the client contains dead code that
    looks like it supports overnight windows. Until the product decides, the refusal must at
    least be legible.

- [ ] **DETAIL-14 — Starting a session uses the length actually chosen**
  - **Does:** step the session length to 45, start.
  - **Proves:** the session screen counts down from 45:00 and the server records 45 planned
    minutes (Home's Right Now says "of 45").
  - **Why:** the planned length is what caps the credit at completion; a session started with the
    wrong number quietly over- or under-pays.

- [ ] **DETAIL-15 — Pomodoro maths is what it says**
  - **Does:** 3 cycles × 25 min.
  - **Proves:** the line reads "3 × 25 min · 75 minutes total" and the session is started with 75
    planned minutes.
  - **Why:** the planned total, not one block, is what the server caps against — capping at a
    single block would clip a legitimate full session.

- [ ] **DETAIL-16 — Starting while another session runs offers the running one**
  - **Does:** start a session, leave the screen, open a different focus task, press Start.
  - **Proves:** the app opens the *running* session, continuing its countdown, rather than
    erroring.
  - **Why:** one session at a time is enforced by the database; the 409 must turn into a useful
    door rather than a dead end.

- [ ] **DETAIL-17 — A session that can't be reached can be discarded**
  - **Does:** force the "already running but not fetchable" state.
  - **Proves:** the alert offers to discard, discarding credits nothing, and a new session can
    then start.
  - **Why:** without it the only escape was completing a session that never happened, which
    credited focus time for work nobody did.

- [ ] **DETAIL-18 — Renaming a task** *(blocked: no control exists yet)*
  - **Why it's listed:** `TODOS.md` item 1 — the field round-trips on both ends and only the UI is
    missing, so the test should be written the moment the control lands. A typo currently costs
    the task's whole history.
