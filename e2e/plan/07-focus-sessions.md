# 07 · Focus sessions — `FOCUS`

**The risk:** this is the part of the app that credits people for work, so both failure
directions are real: crediting time nobody spent, or losing time someone did. It's also the
longest-lived state in the app — a session outlives the screen, the tab and the app itself —
which is exactly what Home's "Right now" section exists to expose.

Timer behaviour is anchored to a wall-clock deadline rather than a tick count, so these tests use
the clock mock rather than waiting.

## Running one

- [ ] **FOCUS-01 — A session counts down from the length chosen**
  - **Proves:** the timer starts at the chosen length, the progress bar and percentage agree with
    it, and Ferne is in her asleep state.
  - **Why:** the resting companion is a deliberate signal that nothing is demanding attention;
    the numbers are the promise being tracked.

- [ ] **FOCUS-02 — The timer keeps real time while the tab is hidden**
  - **Does:** start 25 minutes, hide the tab / suspend timers, advance the clock ten minutes,
    come back.
  - **Proves:** roughly fifteen minutes remain — not twenty-five.
  - **Why:** the original implementation decremented a counter and froze whenever JS was
    suspended, so locking the phone — the most natural thing to do during a focus session — made
    a 25-minute session run 35 real minutes.

- [ ] **FOCUS-03 — Pausing stops the countdown and resuming continues it**
  - **Does:** pause, advance five minutes, resume.
  - **Proves:** the remaining time didn't drop while paused.
  - **Why:** the client honours pauses by pushing the deadline out; a pause that keeps counting
    makes the button a lie.

- [ ] **FOCUS-04 — Time running out ends the session by itself**
  - **Does:** advance past the deadline, including while the tab is hidden.
  - **Proves:** the session completes once — not twice — and the completion prompt appears.
  - **Why:** a tick and a foreground event can both observe zero before React re-renders; the
    idempotency guard around that is invisible until it isn't.

- [ ] **FOCUS-05 — Ending early still credits the time spent**
  - **Does:** run ten minutes of twenty-five, End Session, confirm.
  - **Proves:** the summary shows ~10 minutes and ~10 points, and Progress and Home's stat strip
    agree.
  - **Why:** "it still counts toward your total time" is what the confirmation promises.

- [ ] **FOCUS-06 — Keeping the task open keeps it open**
  - **Does:** finish a session, choose "Keep task open".
  - **Proves:** the task is still in TO DO, the minutes and points are still credited, and Right
    Now is gone.
  - **Why:** completing a session and completing a task are deliberately separate; conflating
    them would finish tasks people meant to come back to.

- [ ] **FOCUS-07 — Marking the task complete from the prompt does both**
  - **Proves:** the Completion screen shows the minutes and points earned; Home lists the task in
    DONE with those points; streak and weekly progress move.
  - **Why:** the one path where a focus task's points and its completion meet — and where the
    points on the finished row come from its sessions rather than a flat amount.

- [ ] **FOCUS-08 — A session shorter than a minute earns nothing, and says so**
  - **Does:** start and end within a minute.
  - **Proves:** 0 minutes, 0 points, and no "+0" dressed up as a reward.
  - **Why:** credited minutes are whole minutes; the honest zero is better than a rounded-up one.

- [ ] **FOCUS-09 — A session left running is capped at what was planned**
  - **Does:** start a 25-minute session, advance nine hours, end it.
  - **Proves:** it credits at most 30 minutes (planned + 5 grace), not 540.
  - **Why:** an uncapped session once credited 4,320 minutes and points from a forgotten weekend,
    straight into weekly focus time.

## Leaving and coming back

- [ ] **FOCUS-10 — Leaving the session screen doesn't lose the session**
  - **Does:** start one, navigate back to Home.
  - **Proves:** RIGHT NOW shows the task with the correct remaining time and a Resume button.
  - **Why:** the whole point of the section. Before it existed, a session you backed out of was
    invisible and blocked every attempt to start another.

- [ ] **FOCUS-11 — Resume continues; it doesn't restart**
  - **Does:** with ten minutes elapsed of twenty-five, tap Resume.
  - **Proves:** the timer opens at ~15:00.
  - **Why:** reopening used to hand back a fresh full-length timer, so the session ran far longer
    than planned and the server's credit and the screen disagreed.

- [ ] **FOCUS-12 — A reload mid-session finds the session again**
  - **Does:** start, reload the page.
  - **Proves:** Home shows Right Now with the right remaining time; resuming still works.
  - **Why:** the session lives on the server, so an app restart — or a crash — must not orphan it.

- [ ] **FOCUS-13 — A session whose time has run out while away offers to finish**
  - **Does:** start 25, advance 30 minutes with the app on Home.
  - **Proves:** the card reads "Time's up · 25 min" and the button says Finish; finishing credits
    the capped amount.
  - **Why:** the design only draws the mid-session state; this is the state a phone left in a
    pocket actually produces.

- [ ] **FOCUS-14 — A session with no recorded length says what it can**
  - **Does:** a session row without planned minutes (started by an older build).
  - **Proves:** the card reads "Running · N min so far" and the ring shows no false target.
  - **Why:** the honest fallback. Guessing a target would make up a number the user never chose.

- [ ] **FOCUS-15 — Only one session at a time, and the second attempt is useful**
  - **Does:** with one running, start another from a different task.
  - **Proves:** the running one opens, still counting; no duplicate is created.
  - **Why:** the database enforces it (V019) after two concurrent starts once left an account
    unable to start, resume *or* discard.

- [ ] **FOCUS-16 — Discarding credits nothing**
  - **Does:** discard a running session.
  - **Proves:** Right Now disappears, no minutes or points are added, and a new session can start.
  - **Why:** the alternative was "completing" a session that never happened just to unblock
    yourself.

## Pomodoro

- [ ] **FOCUS-17 — Cycles run in order with breaks between them**
  - **Does:** 2 cycles × 25 min; let the first elapse.
  - **Proves:** the break screen appears with its own countdown and "cycle 2 will not start on
    its own"; starting cycle 2 works.
  - **Why:** nothing in this app auto-starts; a break that rolls into work would break that
    promise at the worst moment.

- [ ] **FOCUS-18 — Ending during a break credits the cycles completed**
  - **Proves:** the summary counts the finished cycles, not the whole plan.
  - **Why:** the interrupted count is client-reported — only the client knows — so it has to be
    right.

- [ ] **FOCUS-19 — A resumed Pomodoro is honest about where it restarts**
  - **Does:** leave a Pomodoro mid-cycle, resume from Home.
  - **Proves:** it reopens at the start of a block rather than silently claiming a position it
    can't know.
  - **Why:** the server stores the sitting's total length, not the split, and a break never
    auto-advances — so the position genuinely isn't recoverable. Documented limitation, pinned so
    it doesn't quietly become a wrong number.

## Points and guards

- [ ] **FOCUS-20 — Session points reach today's totals once, at the right time**
  - **Does:** finish a 12-minute session, don't complete the task.
  - **Proves:** points today +12 and minutes focused +12 immediately; completing the task later
    doesn't add them a second time.
  - **Why:** the totals add session points and finished-reminder points from separate sources; a
    focus task's own row records its sessions' total for display only. Double counting here would
    be invisible without a test.

- [ ] **FOCUS-21 — A session can't be started on the wrong kind of task**
  - **Does:** attempt a session on a reminder task and on an already-finished task (API level —
    the UI doesn't offer it).
  - **Proves:** refused, with the UI never offering the control in the first place.
  - **Why:** the guards exist in both places on purpose; a direct call would otherwise credit
    focus minutes for work the rest of the app deliberately doesn't track.
