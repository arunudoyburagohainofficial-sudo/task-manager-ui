# 06 · Recurrence through the UI — `RECUR`

**The risk:** a repeating task is never expanded into a series — exactly one occurrence exists,
and finishing it mints the next. That means every completion is also a creation, and every undo
is also a deletion. Get it wrong and a user either loses a routine silently or ends up with two
live copies and no way to tell which is real.

The grammar itself is covered by the API harnesses (`rrule-probe`, `recurrence-e2e`). These cover
what the person sees.

- [ ] **RECUR-01 — Finishing today's occurrence brings tomorrow's**
  - **Does:** complete a daily task from Home.
  - **Proves:** it moves to DONE, and the next occurrence exists dated tomorrow — visible under
    Recurring on Scheduled, not on today's list.
  - **Why:** the successor is created server-side and can't be described by the completion's own
    response; without the refetch it stays invisible, which reads as the routine having ended.

- [ ] **RECUR-02 — The successor keeps the whole configuration**
  - **Proves:** the next occurrence carries the same notifications, goal, type and rule.
  - **Why:** a routine that loses its reminder after one completion is a routine that stops
    happening, quietly.

- [ ] **RECUR-03 — Undo retracts the occurrence that completion created**
  - **Does:** complete, then Undo from the toast.
  - **Proves:** the original is back on today's list and tomorrow's copy is gone.
  - **Why:** without the retraction the user has two live copies of the same routine.

- [ ] **RECUR-04 — Undo keeps a successor that's already been dealt with**
  - **Does:** complete today's, complete tomorrow's, then undo today's.
  - **Proves:** the completed successor survives.
  - **Why:** that's real recorded progress; deleting it to tidy up would destroy history.

- [ ] **RECUR-05 — The last occurrence of a counted series ends it**
  - **Does:** a task with "after 1 time" remaining; complete it.
  - **Proves:** no successor appears anywhere, and the series is finished.
  - **Why:** `COUNT=1` means the live one is the last; minting one more is the classic off-by-one
    and produces an unwanted task the user has to delete by hand.

- [ ] **RECUR-06 — The count visibly decrements across completions**
  - **Does:** "after 3 times" → complete → open the successor's schedule.
  - **Proves:** it now reads 2 to go, then 1, then the series ends.
  - **Why:** the number is the user's only way to know how much of the commitment is left.

- [ ] **RECUR-07 — Month ends don't drift**
  - **Does:** a monthly task anchored to the 31st; complete it through February and March.
  - **Proves:** it lands on the last valid day of each month and returns to the 31st where the
    month has one — it does not walk backwards.
  - **Why:** Jan 31 → Feb 28 → Mar 28 → forever was a real bug, and a silent one: every
    individual step looks reasonable.

- [ ] **RECUR-08 — Weekday sets land on the next ticked day**
  - **Does:** Mon/Wed/Fri, completed on Monday.
  - **Proves:** the successor is Wednesday.
  - **Why:** the most common shape of a real habit, and the one where an off-by-one costs a
    streak.

- [ ] **RECUR-09 — An nth-weekday rule lands in the right month**
  - **Does:** "3rd Tuesday", completed.
  - **Proves:** the successor is next month's third Tuesday, not four weeks later.
  - **Why:** the two are different dates most months, and the distinction is the whole reason the
    rule exists.

- [ ] **RECUR-10 — A missed routine stays on today's list**
  - **Does:** a daily task last dated three days ago.
  - **Proves:** it's on Home, listed under Recurring rather than Overdue, and completing it still
    mints the next occurrence.
  - **Why:** routines shouldn't accumulate a backlog of guilt in the Overdue panel; that's a
    deliberate product choice worth pinning.

- [ ] **RECUR-11 — Two fast completions produce one successor**
  - **Does:** double-tap Done on a recurring task; and complete the same task from two browser
    contexts at once.
  - **Proves:** exactly one successor exists afterwards.
  - **Why:** completion is check-then-act behind a row lock; the concurrency harness proves the
    server side, this proves the UI doesn't find a way around it.

- [ ] **RECUR-12 — Turning a repeat off leaves the current occurrence alone**
  - **Does:** remove the repeat from a recurring task, then complete it.
  - **Proves:** the task finishes normally and no successor appears.
  - **Why:** "stop this habit" must not also mean "delete what I was doing today".

## Added 2026-09-18

The twelve above cover the shapes the design draws. These cover the ones a user can build that
nobody has watched complete — and the two places where a successor inherits something that has to
be re-anchored rather than copied.

- [ ] **RECUR-13 — An interval repeat advances by its interval**
  - **Does:** "every 3 days", completed.
  - **Proves:** the successor is three days out, not one.
  - **Why:** `INTERVAL` is the token most easily dropped on the way through the client, and the
    result — a task that arrives every day instead of twice a week — is annoying enough to make
    someone delete the routine rather than report it.

- [ ] **RECUR-14 — A yearly routine lands next year, same month and day**
  - **Does:** a yearly task on 29 February, completed.
  - **Proves:** the successor is a real date in a year that may not have a 29 February, and the
    anchor isn't lost.
  - **Why:** yearly takes its month and day from the task's own date, with no `BYMONTHDAY` to fall
    back on, so the leap day is the one case where "same date next year" doesn't exist. The same
    arithmetic produced the February month-end drift.

- [ ] **RECUR-15 — A rule this build can't name still completes and still mints a successor**
  - **Does:** seed a task whose `recurrenceRule` this client can't parse, then complete it from
    Home.
  - **Proves:** the row shows "Repeats", completing works, and the successor appears.
  - **Why:** `recurrenceRule` is a plain string so a row written by a newer app version renders.
    The dangerous version of this bug isn't a bad label — it's a client that treats an unparseable
    rule as "no repeat" and takes a path that loses the routine.

- [ ] **RECUR-16 — A repeat added to an existing task starts from that task's date**
  - **Does:** a task dated next Friday; add a weekly repeat.
  - **Proves:** the live occurrence stays on Friday and the rule is anchored there, not to today.
  - **Why:** the task's own date always wins over one embedded in the request — a server-side rule
    the client has to not fight. Re-anchoring to today silently moves the task the user just
    scheduled.

- [ ] **RECUR-17 — Changing the rule on a live occurrence neither creates nor loses one**
  - **Does:** daily → weekly on a pending recurring task.
  - **Proves:** exactly one live occurrence before and after, on the same date, with the new rule.
  - **Why:** "one live occurrence" is the invariant the whole model rests on. An update path that
    spawned or retracted while editing would break it without any completion involved.

- [ ] **RECUR-18 — A successor's notifications are re-anchored to the successor's day**
  - **Does:** a daily task with a day-of notification and a "1 day before" notification; complete
    it.
  - **Proves:** both notifications are attached to the new occurrence and describe *its* day —
    the lead-time one fires today for tomorrow's copy, not on the old date.
  - **Why:** RECUR-02 proves the configuration survives. This proves it survives *as an offset*
    rather than as a date left behind — which is the whole reason lead times are stored as
    `daysBefore`, and the difference between a routine that keeps warning you and one that warned
    you once.
