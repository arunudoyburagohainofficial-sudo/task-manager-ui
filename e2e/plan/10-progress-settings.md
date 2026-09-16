# 10 · Progress, Settings and the points ledger — `PROG` / `SET`

**The risk:** these two screens are where the app's numbers are supposed to reconcile. Home says
you earned 15 points today and focused 50 minutes; Progress says this week you completed 4 tasks
and focused 200 minutes. If those can disagree, neither is believable — and a scoreboard nobody
believes is worse than no scoreboard.

Settings matters for a different reason: two of its preferences change behaviour elsewhere
(default focus length, reminder notifications), so a preference that doesn't stick changes what
the rest of the app does.

## Progress

- [ ] **PROG-01 — Week, Month and All time each show their own figures**
  - **Does:** seed completions and sessions across this week and previous weeks.
  - **Proves:** each tab's numbers match what was seeded, and switching tabs doesn't carry a
    figure over.
  - **Why:** three periods reading from three different endpoints into one layout.

- [ ] **PROG-02 — This week's figures agree with what Home counted today**
  - **Does:** finish a focus task and a reminder, run a session, then compare.
  - **Proves:** Home's "minutes focused" for today is part of Progress's weekly focus time, and
    the weekly task count moved only for the focus completion.
  - **Why:** the one cross-screen arithmetic in the app. Weekly progress counts focus-type
    completions only; points count everything. Both are true and they must be individually right.

- [ ] **PROG-03 — The weekly goal is locked in at the week's start**
  - **Does:** complete something, then change the weekly goal in Settings.
  - **Proves:** this week's target is unchanged; the new one applies to a week that hasn't
    started.
  - **Why:** otherwise a bad week can be rewritten into a good one, which makes the metric
    meaningless.

- [ ] **PROG-04 — The streak and its grace day read correctly**
  - **Does:** seed a streak, then a missed day, then another.
  - **Proves:** the current streak, longest streak and "grace day left" cards reflect the rule —
    one grace day per streak, two misses resets to 1.
  - **Why:** the grace rule is generous and invisible; a user who thinks they lost a streak they
    still have will stop trusting it.

- [ ] **PROG-05 — Undo doesn't reverse the streak**
  - **Does:** complete a focus task (streak moves), undo it.
  - **Proves:** the streak stays.
  - **Why:** deliberate — one undo doesn't prove the day didn't happen. Paired with GOAL-07 and
    HOME-14 this pins all three undo behaviours: streak no, goal no, points yes, weekly count yes.

- [ ] **PROG-06 — Weekly progress *is* reversed by undo**
  - **Proves:** undoing a focus completion decrements this week's count, floored at zero.
  - **Why:** the one counter with an unambiguous answer, and the floor matters when undoing
    something completed last week.

- [ ] **PROG-07 — The empty state offers the way out**
  - **Proves:** a new account sees the empty Progress state with "Capture a task" rather than
    zeros everywhere.
  - **Why:** zeros on every card read as a broken screen on day one.

## Settings

- [ ] **SET-01 — The default focus duration changes what a session starts at**
  - **Does:** cycle the default to 45, open a focus task.
  - **Proves:** the session length starts at 45, Home's focus rows show +45, and a started
    session records 45 planned minutes.
  - **Why:** the preference feeds three places; the row's points are a promise the session then
    has to keep.

- [ ] **SET-02 — Preferences save only when saved, and persist**
  - **Does:** change the weekly goal, note the Save button appearing, save, reload.
  - **Proves:** the button appears only when something changed, the value survives the reload,
    and abandoning without saving keeps the old value.
  - **Why:** a half-saved preferences screen is how a user's weekly goal silently resets.

- [ ] **SET-03 — Turning reminder notifications off is respected**
  - **Does:** toggle off, then set a notification on a task.
  - **Proves:** the preference persists and the app stops queueing notifications (asserted
    through the Upcoming notifications screen; actual delivery is device-only).
  - **Why:** a "do not disturb me" switch that doesn't is the fastest way to lose a user.

- [ ] **SET-04 — Do Not Disturb is honest about not being ready**
  - **Proves:** the SOON badge and the caption explaining the Android permission and the iOS gap
    are present, and the toggle doesn't claim to have done anything.
  - **Why:** it ships visible on purpose; without the caption it reads as a broken feature.

- [ ] **SET-05 — Replay walkthrough restarts the tour on Home**
  - **Proves:** the app navigates to Home and step 1 of 5 appears, spotlighting the + beside GOALS.
  - **Why:** the tour's first step points at a control on Home; restarting from Settings without
    navigating would leave the overlay with nothing to point at.

- [ ] **SET-06 — Email and phone are shown but not editable**
  - **Proves:** neither offers a tap target; Name does.
  - **Why:** a tap target that opens nothing promises an editor that doesn't exist.

## The points ledger *(cross-screen)*

- [ ] **SET-07 — A day's points add up from both sources**
  - **Does:** in one day: two reminders finished, one 12-minute session, one focus task completed
    after that session.
  - **Proves:** points today = 5 + 5 + 12 — the session's points counted once, the focus task's
    completion adding nothing on top — and minutes focused = 12.
  - **Why:** this is the exact arithmetic the new `GET /progress/today` performs, and the one
    place double counting could hide.

- [ ] **SET-08 — Points survive a reload and match a fresh fetch**
  - **Proves:** the figures after a reload equal the figures before.
  - **Why:** they're server-computed and cached; a stale cache would show yesterday's total as
    today's after midnight.

- [ ] **SET-09 — Points earned before the rule existed aren't invented**
  - **Does:** a reminder finished before reminders earned anything (seeded with no stored points).
  - **Proves:** its row shows no points pill, and today's total doesn't include a made-up 5.
  - **Why:** the figure is stored at completion precisely so history can't be rewritten by a
    later change to the rate.
