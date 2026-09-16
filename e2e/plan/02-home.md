# 02 · Home — `HOME`

**The risk:** Home is the screen people open every day, and it's the only screen that decides
*what is mine to do today*. Its rules are quiet ones — an undated task belongs here, a future one
doesn't, a missed one stays — and every one of them was arrived at after a bug. It also carries
three server-computed figures and a section that only exists while something is running.

Rebuilt 2026-09-16 from the Docked Ferne design; the visual side is in
[16-visual-regression](16-visual-regression.md), the behaviour is here.

## What belongs on the list

- [ ] **HOME-01 — An empty account reads as empty, not broken**
  - **Does:** fresh account with everything deleted; open Home.
  - **Proves:** "Nothing to do yet" in a row-shaped card, no DONE section, no closing line, the
    GOALS rule with its + and no cards under it.
  - **Why:** the design has no placeholder for absent sections, so the empty state has to carry
    the whole screen without looking like a failed load.

- [ ] **HOME-02 — An undated task appears on Home**
  - **Proves:** a task with no date is in TO DO and counted.
  - **Why:** "no date" is an ordinary choice in this app, not a missing value — a backlog item
    filed under a date it doesn't have would be stranded on a date-organised screen.

- [ ] **HOME-03 — A task dated today appears; one dated tomorrow does not**
  - **Proves:** today's task is in TO DO; tomorrow's is absent from Home and present under
    Upcoming on Scheduled.
  - **Why:** the Home/Scheduled split is the app's core organising rule (`belongsOnHome`).

- [ ] **HOME-04 — A missed one-off stays on Home *and* is listed as overdue**
  - **Proves:** a reminder dated yesterday is in TO DO on Home, and also under Overdue on
    Scheduled, with the tab badge counting it.
  - **Why:** it used to vanish from Home the moment it slipped — silent (a past notification
    never re-fires) and out of sight on the one screen people check. The double listing is
    deliberate; a test stops someone "fixing" it back.

- [ ] **HOME-05 — A missed routine stays on Home and is not double-listed as overdue**
  - **Proves:** an overdue *repeating* task is on Home and appears under Recurring, not Overdue.
  - **Why:** the mirror rule of HOME-04, and the reason the two are handled separately.

- [ ] **HOME-06 — The running task is lifted out of the list**
  - **Proves:** with a session running, its task is in RIGHT NOW and not in TO DO, and the TO DO
    count is one lower.
  - **Why:** the same task in two places invites finishing it twice.

## What a row says

- [ ] **HOME-07 — Each kind of row shows its own mark, wording and colour**
  - **Does:** seed one of each: focus, reminder with a time today, plain dated task, goal-attached.
  - **Proves:** bullseye/"Focus · 25 min", bell/"Reminder · 6 PM", envelope/"Task · today",
    tick/"Goal · Gym" — each in its own colour, with the right action word (Focus vs Done).
  - **Why:** the four kinds are how someone scans the list; picking the wrong one for a task is a
    silent mis-labelling that no error will ever report.

- [ ] **HOME-08 — A goal-attached task reads as a Goal row whichever type it is**
  - **Proves:** a focus task on a goal shows "Goal · name" with a Focus button; a reminder on a
    goal shows "Goal · name" with Done.
  - **Why:** the goal is the thing worth seeing at a glance; the action still follows the type.

- [ ] **HOME-09 — A reminder with only a lead-time notification is not a "Reminder" row**
  - **Does:** a task dated today whose only notification is "a day before".
  - **Proves:** it reads as "Task · today", not "Reminder · <time>".
  - **Why:** the row's time means "you'll hear about this today". A warning that already fired
    yesterday would be a lie in that slot.

- [ ] **HOME-10 — An undated plain task shows no trailing detail**
  - **Proves:** the meta line is "Task" alone — no invented "anytime" or empty separator.
  - **Why:** made-up words in a data slot are how a UI starts lying quietly.

- [ ] **HOME-11 — Points on a row match what finishing it will actually earn**
  - **Proves:** a focus row shows the default session length × 1; a reminder row shows +5; change
    the default duration in Settings and the focus row follows.
  - **Why:** the number is a promise the server has to honour on completion — see
    [07-focus-sessions](07-focus-sessions.md) and the points ledger in
    [10-progress-settings](10-progress-settings.md).

- [ ] **HOME-12 — A long task name wraps instead of pushing the button off**
  - **Does:** a 120-character name, and a name with no spaces.
  - **Proves:** the title wraps within the row, the action button keeps its size and stays on
    screen, the row grows rather than clipping.
  - **Why:** capture takes free text; the longest thing a user types is the layout's real input.

## Finishing, undoing, counting

- [ ] **HOME-13 — Finishing a reminder moves it, counts it and earns its points**
  - **Proves:** the row leaves TO DO, appears in DONE with its finish time and +5, both counts
    change, POINTS TODAY rises by 5, and a toast offers Undo.
  - **Why:** the whole loop in one tap — and the points half of it is new, so nothing else guards it.

- [ ] **HOME-14 — Undo puts the task back and takes the points back**
  - **Proves:** the row returns to TO DO, DONE shrinks, POINTS TODAY returns to its previous value.
  - **Why:** points are the one thing undo *does* reverse (streak and goal progress deliberately
    don't) — that asymmetry is easy to break by accident.

- [ ] **HOME-15 — A failed completion rolls back visibly**
  - **Does:** make the completion request fail, tap Done.
  - **Proves:** the row comes back and an error toast explains why; the counts and points are
    unchanged.
  - **Why:** the optimistic update used to roll back in silence — the task reappeared with no
    explanation, which reads as the app losing work.

- [ ] **HOME-16 — Double-tapping Done completes once**
  - **Proves:** one completion, one DONE row, points up by 5 not 10.
  - **Why:** the server's idempotency guard exists for exactly this; the UI shouldn't rely on it
    alone, and a repeating task double-completed once spawned two successors.

- [ ] **HOME-17 — Finished-today only, oldest first**
  - **Does:** seed completions from yesterday and today at 8:10 and 11:45.
  - **Proves:** yesterday's is absent; today's two are in chronological order with their times.
  - **Why:** DONE is a record of today, not an archive, and the order is how the day reads back.

- [ ] **HOME-18 — A task that earned nothing shows no points pill**
  - **Does:** a focus task finished without ever running a session, and an older reminder finished
    before reminders earned anything.
  - **Proves:** no "+0" pill, no empty pill — just the row.
  - **Why:** "+0" reads as a mistake; absent is honest.

## Sections, stats and the rest

- [ ] **HOME-19 — Collapsing a section hides its rows but not its count**
  - **Proves:** TO DO collapses to "Expand all", the count still reads the true number, DONE
    toggles Hide/Show independently, and the carets match the design (▾ open for TO DO, ▴ for DONE).
  - **Why:** a collapsed section that reports zero would claim the day is finished when it isn't.

- [ ] **HOME-20 — Collapse state is deliberately forgotten on reload**
  - **Proves:** after a reload both sections are open again.
  - **Why:** collapsing is a "get this out of my way now" gesture; a section still hidden tomorrow
    morning looks like missing data.

- [ ] **HOME-21 — The stat strip shows the server's figures, not the client's guesses**
  - **Proves:** streak, points today and minutes focused match the values the API returns, and a
    zero day shows 0 / 0 / 0 min rather than dashes or blanks.
  - **Why:** all three are computed server-side on purpose; a locally-derived number that
    disagrees with Progress is impossible to explain to a user.

- [ ] **HOME-22 — Points and minutes are genuinely different figures**
  - **Does:** finish two reminders and run one 10-minute session.
  - **Proves:** points today = 10 + 10, minutes focused = 10.
  - **Why:** the reason the strip has both. If they ever track each other exactly, the points rule
    has silently reverted to focus-only.

- [ ] **HOME-23 — Pull to refresh picks up work done elsewhere**
  - **Does:** change data through the API behind the app's back, pull down.
  - **Proves:** the list, counts and stats all update together.
  - **Why:** the same account on two devices is a normal Tuesday.

- [ ] **HOME-24 — The closing line appears only when there's something to close**
  - **Proves:** present when the list has any row, absent on a completely empty day.
  - **Why:** "That's everything for today" under an empty screen is a taunt, not a reassurance.

- [ ] **HOME-25 — The goals strip lays out for one, two and many**
  - **Proves:** one goal fills the row, two split it, three or more scroll sideways with the next
    card peeking; tapping one opens its editor.
  - **Why:** the design draws exactly two; the other counts are ours to get right, and a third
    goal hidden entirely off-screen is a goal the user forgets they set.

- [ ] **HOME-26 — The capture button can't be covered by the list**
  - **Does:** fill the day with twenty tasks and scroll to the bottom.
  - **Proves:** the last row's action button is reachable and Ferne doesn't sit over it.
  - **Why:** the docked button overlaps the list by design; the bottom padding is what keeps that
    from eating a tap target.

- [ ] **HOME-27 — The avatar opens Settings and a row opens its task**
  - **Proves:** both navigations land on the right screen with the right task.
  - **Why:** cheap, and they're the two ways off this screen that aren't the tab bar.

- [ ] **HOME-28 — Midnight rolls the day over with the app open**
  - **Does:** with Home open, move the clock past midnight.
  - **Proves:** yesterday's dated tasks move to overdue-on-Home, DONE empties, points today and
    minutes reset, the streak figure doesn't change on its own, and the date under the greeting
    updates.
  - **Why:** a phone left on a desk is the case `useTodayKey` exists for — without it Home keeps
    showing yesterday until something unrelated re-renders.

- [ ] **HOME-29 — The greeting follows the time of day**
  - **Does:** set the clock to 09:00, 14:00 and 20:00.
  - **Proves:** morning / afternoon / evening, and the date line reads "Wednesday 26 August" in
    that order regardless of locale.
  - **Why:** the date format is assembled by hand precisely so the phone's region can't reorder it.
