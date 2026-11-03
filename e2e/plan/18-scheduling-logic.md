# 18 · The scheduling arithmetic itself — `LOGIC`

**The risk:** every other file in this catalogue tests what a *screen* does. This one tests the
thing underneath all of them: the functions that decide **which instants a reminder actually
fires at**. If those are wrong, every screen above them is faithfully displaying a wrong answer,
and no test in files 01–17 would notice — the row says "Reminder · 6 PM", the sheet says "On the
day", the server has the right row, and the phone simply never rings.

This is the layer the rest of the plan deliberately skipped. [README](../README.md) says pure
functions "deserve unit tests; driving them through a rendered screen would be slower and prove
less" — which is right, and then named no home for them. This is that home.

**What already exists:** `task-app/scripts/scheduling-logic-check.ts` (52 checks) covers the two
*warnings* — a lead time longer than the runway, and a lead time outpaced by its own repeat. It
covers `notificationHealth`, `fireDayOf`, `repeatCycleDays`, `outpacedByRepeat`, `countUnfireable`
and `notificationVerdict`. That is the "will this be a problem?" half.

**What has nothing at all:** the "when does it fire?" half — `reminderOccurrences`,
`intervalOccurrences`, `allocateFairly`, `leadIn` — plus `utils/schedule.ts` (which screen a task
belongs on) and `utils/recurrence.ts` (the client's hand-written mirror of the server's RRULE
grammar). Those are the functions in this file.

**Why they're testable at all:** `schedulingLogic.ts` is free of every device API by design, and
`notificationHealth` and friends take an explicit `now`. So each case below is a fixed,
hand-checkable date rather than something whose meaning changes with the calendar — which is what
makes this the only layer in the repo that can be asserted *exactly* rather than approximately.

**Where these run:** `e2e/logic/`, as a Playwright project with no browser
(`npx playwright test --project=logic`). Same runner as the rest of the suite, no server, no
Metro, no device — so they are also the only part of this suite that runs in seconds and can gate
a commit.

---

## A · When one reminder fires — `reminderOccurrences`

The single most important function in the product. Everything a user believes about this app
comes out of it.

- [x] **LOGIC-01 — A reminder with a date but no time produces nothing**
  - **Proves:** an empty list — not a firing at midnight.
  - **Why:** such a row exists to carry the task's *day*, not to interrupt anyone. Treating the
    absent time as 00:00 would wake people at midnight for a task they never asked to be
    reminded about.

- [x] **LOGIC-02 — A dated reminder produces exactly one firing, at its local wall-clock time**
  - **Does:** date tomorrow, time 09:00.
  - **Proves:** one instant; its local hours and minutes are 09:00, and its local date is
    tomorrow's.
  - **Why:** the whole contract in one assertion. `new Date("2026-09-19T09:00")` is local by
    virtue of having no `Z` — a refactor to `Date.UTC` or an ISO string with a zone would move
    every reminder in the app by the device's offset and still look correct in a screenshot.

- [x] **LOGIC-03 — A dated reminder already in the past produces nothing**
  - **Proves:** empty, not a firing dated in the past.
  - **Why:** the device only schedules future instants, so a past one is silently dropped by the
    OS anyway. Producing it here would make the Upcoming notifications screen advertise a
    reminder that can never arrive — and it's the reason a missed one-off now stays on Home
    (HOME-04) rather than relying on a notification that will never re-fire.

- [x] **LOGIC-04 — A lead time is subtracted from the task's day, not from now**
  - **Does:** a task ten days out with a "7 days before" notification at 09:00.
  - **Proves:** one firing, three days from now, at 09:00 — not seven days from now, and not
    ten.
  - **Why:** this is what makes the offset follow the task when its day moves (V018). Storing a
    resolved date instead is the design this replaced, and its symptom was a warning that stayed
    behind when the task was rescheduled.

- [x] **LOGIC-05 — A lead time that lands before today produces nothing**
  - **Does:** a task three days out, "7 days before".
  - **Proves:** empty — no firing, and specifically not a firing today ("fire it late").
  - **Why:** the honest behaviour, and the one the sheet's warning (SHEET-13) exists to tell the
    user about. If this function ever started firing these late, the warning would become a lie
    in the other direction.

- [x] **LOGIC-06 — An undated reminder produces a week of firings, one per day, all at the same time**
  - **Proves:** exactly `DAILY_HORIZON_DAYS` (7) instants, strictly ascending, one calendar day
    apart, every one of them at the configured clock time.
  - **Why:** "no date" means "every day until it's done", and nothing re-arms the queue except
    the app being opened. Only the *next* one used to be queued, so a daily reminder stopped
    firing entirely if the app wasn't opened in between — which is precisely the user who most
    needs reminding. The seven is the headroom; a regression to one is invisible on any screen.

- [x] **LOGIC-07 — An undated reminder whose time has passed starts tomorrow**
  - **Does:** an 09:00 reminder, evaluated at 12:00.
  - **Proves:** the first firing is tomorrow at 09:00 — today's slot is neither included nor
    duplicated, and there are still seven.
  - **Why:** an off-by-one at this boundary either fires immediately (an alarm the instant you
    save a reminder) or loses a day off the end of the horizon.

- [x] **LOGIC-08 — The horizon steps the date, so a 9am reminder stays 9am across a DST change**
  - **Does:** an undated 09:00 reminder in a zone with a transition inside the next seven days.
  - **Proves:** all seven firings report 09:00 local — none at 08:00 or 10:00.
  - **Why:** this is why the loop copies the first slot and calls `setDate` instead of adding
    24 hours of milliseconds. Adding milliseconds is the obvious implementation and is wrong
    twice a year, by an hour, for one day in seven — small enough to be dismissed as the user
    misremembering.

- [x] **LOGIC-09 — A live snooze replaces the reminder's own schedule, and produces exactly one firing**
  - **Proves:** one instant, equal to `snoozedUntil`, and the reminder's own time is not also
    produced.
  - **Why:** this function never received `snoozedUntil` at all once. The server stored the
    snooze and the device ignored it completely, so the notification came back at its original
    time — the one thing a snooze must never do.

- [x] **LOGIC-10 — An expired snooze is ignored and the ordinary schedule returns**
  - **Does:** `snoozedUntil` in the past.
  - **Proves:** the reminder's own firings, unchanged — not an empty list.
  - **Why:** the mirror of LOGIC-09. A stale snooze silencing a reminder forever is the same
    class of silent loss, reached from the opposite direction, and the server keeps these rows.

## B · When an interval nudge fires — `intervalOccurrences`

- [x] **LOGIC-11 — A window produces one firing per step, inside the window, none in the past**
  - **Does:** 09:00–17:00 every 30 minutes, evaluated at 12:10.
  - **Proves:** the firings are 12:30, 13:00 … 17:00 — evenly stepped, none before now, none
    after the end.
  - **Why:** the whole mechanism. "Every 15 min from 6 to 8" is a promise about a count as much
    as a time.

- [x] **LOGIC-12 — The end of the window is included and nothing passes it**
  - **Proves:** a window whose last step falls exactly on the end time includes it; one step
    later is absent.
  - **Why:** `while (cursor <= windowEnd)` is a deliberate inclusive bound. Flipping it to `<`
    quietly removes the last nudge of every window — the one that matters most.

- [x] **LOGIC-13 — A zero or negative interval falls back to 30 minutes**
  - **Proves:** a finite, evenly-stepped list rather than an empty one or a hang.
  - **Why:** `stepMinutes` guards against `cursor.setMinutes(+0)` never advancing — an infinite
    loop inside a function called on every app foreground. The guard is one `> 0` check and
    nothing else in the repo exercises it.

- [x] **LOGIC-14 — Tomorrow's window is materialised once today's is spent**
  - **Does:** evaluated after the window has closed for today.
  - **Proves:** firings exist, all on tomorrow's date, starting at the window's start time.
  - **Why:** the window is a daily repeat with only a 24-hour horizon, rolled forward by each
    foreground. An evening save that produced nothing until the next morning's launch would
    silently skip a day.

- [x] **LOGIC-15 — Nothing is produced beyond the 24-hour horizon**
  - **Proves:** the last firing is within `INTERVAL_HORIZON_HOURS` of now.
  - **Why:** the horizon is what keeps one nudging task from eating the pending budget on its
    own; see LOGIC-16.

- [x] **LOGIC-16 — An overnight window produces firings, and this is a divergence from the server**
  - **Does:** 22:00–02:00.
  - **Proves:** the client produces a window that crosses midnight — *and the test says in its
    own comment that the server refuses `startTime >= endTime`, so this state is unreachable
    through the API.*
  - **Why:** the client contains working support for something the server rejects (see
    DETAIL-13). The right test here is not "it works" or "it's refused" but a pinned, explicit
    record of the mismatch, so whichever way the product decides, the decision is a change to a
    test that says what the old behaviour was — rather than a discovery.

## C · The pending-notification budget — `allocateFairly`

- [x] **LOGIC-17 — One noisy source cannot starve a quiet one**
  - **Does:** one source with 49 firings (a 15-minute nudge window) and ten sources with one
    each, against a budget of 50.
  - **Proves:** every one of the ten quiet sources' firings is chosen.
  - **Why:** the reason this function exists. Sort-everything-by-time-and-truncate is the
    natural implementation, and under it a single nudging task consumes the whole budget — every
    *other* task in the app goes completely silent, with nothing anywhere reporting it.

- [x] **LOGIC-18 — The budget is never exceeded**
  - **Proves:** no more than `budget` chosen, for a budget of 0, 1, 50, and more than the total
    available.
  - **Why:** iOS drops the tail past 64 with no error. Exceeding the budget means the app's own
    idea of what it queued stops matching the device's — which is the thing the Upcoming
    notifications screen exists to be honest about.

- [x] **LOGIC-19 — Uneven sources leave no holes**
  - **Does:** groups of length 1, 5 and 2, budget larger than the total.
  - **Proves:** every firing from every group is chosen, exactly once.
  - **Why:** round-robin over ragged arrays is where an off-by-one drops the deepest group's
    tail — the daily reminder's seventh day, which is the one furthest from anyone noticing.

- [x] **LOGIC-20 — Order out is by round, not by time**
  - **Proves:** the result takes one from each group before any group's second, and the caller
    (`runScheduleAll`) sorts by time afterwards.
  - **Why:** the fairness property *is* the round-robin order; a caller that stopped sorting
    would still be correct, and one that "helpfully" sorted inside this function would silently
    destroy the fairness while every existing assertion still passed.

## D · What the notification says — `leadIn`

- [x] **LOGIC-21 — A day-of notification names the task; a lead-time one says when it's due**
  - **Proves:** `daysBefore: 0` yields the bare name (or "You planned to work on: …" for a focus
    task), and any positive offset appends the due wording.
  - **Why:** without this a week-before warning and the day-of nudge are word-for-word
    identical, so the early one reads as "this is due now" — and the user either acts a week
    early or learns to ignore both.

- [x] **LOGIC-22 — The offsets read naturally: tomorrow, a week, N days**
  - **Proves:** 1 → "due tomorrow", 7 → "due in a week", 3 → "due in 3 days".
  - **Why:** these are the three the presets can produce; "due in 1 days" is the kind of thing
    that survives review and then appears on a lock screen.

- [x] **LOGIC-23 — A missing task name degrades to a sentence that still reads**
  - **Proves:** "your task" inside the focus sentence, "Your task" when it starts the line.
  - **Why:** the name comes from a `Map` lookup that can miss (a reminder whose task isn't in
    the pending set yet). "undefined — due tomorrow" is the failure mode.

## E · Which screen a task belongs on — `utils/schedule.ts`

Not notifications, but the same class of arithmetic and the same class of bug: a task filed
under the wrong day is a task nobody sees.

- [x] **LOGIC-24 — The four buckets are what the model says**
  - **Proves:** undated → today, a past date → overdue, today's date → today, a future date →
    upcoming.
  - **Why:** `bucketFor` is the single definition both screens derive from, so that they cannot
    disagree and drop a task from both. Its four branches are two lines each and worth pinning
    exactly.

- [x] **LOGIC-25 — Undated counts as today, deliberately**
  - **Proves:** a task with no date is on Home, not in Upcoming.
  - **Why:** "no date" is an ordinary choice in this app, not a missing value. Filing it under a
    date it doesn't have strands it on a screen organised entirely by date.

- [x] **LOGIC-26 — Dates are compared as strings, never parsed**
  - **Does:** assert against a hand-written "YYYY-MM-DD" ordering, including across month and
    year boundaries.
  - **Why:** `new Date("2026-08-28")` is UTC midnight — the 27th in every negative-offset zone.
    String comparison is correct *because* it doesn't parse, and a well-meaning refactor to
    `new Date(a) < new Date(b)` reintroduces the exact bug `toDateKey` was written to avoid.

- [x] **LOGIC-27 — `belongsOnHome` keeps overdue work, one-off and repeating alike**
  - **Proves:** today and overdue are on Home; upcoming isn't; the repeat makes no difference.
  - **Why:** a missed dated reminder used to leave Home the moment it slipped, which made it both
    silent and invisible. HOME-04 and HOME-05 assert this on the screen; this asserts the rule
    they both read from.

- [x] **LOGIC-28 — `toDateKey` is the local day, never the UTC day**
  - **Does:** an instant late in the evening, in a zone ahead of UTC and one behind it.
  - **Proves:** the key is the local calendar day in both.
  - **Why:** the one-line function the entire date model rests on, and the difference between
    "Today" and tomorrow for half the planet.

- [x] **LOGIC-29 — Upcoming groups ascend by day, and undated rows are dropped**
  - **Proves:** one group per day in ascending order, same-day tasks together, undated absent.
  - **Why:** the grouping sorts string keys while the headings are locale-formatted. A heading
    that disagrees with the sort scrambles the list, and it's the kind of thing that only shows
    up in a locale nobody on the team uses.

- [x] **LOGIC-30 — Relative wording is used only where it's clearer**
  - **Proves:** Today / Tomorrow / Yesterday by name; anything else as weekday-day-month; a date
    in another year carries the year.
  - **Why:** "in 5 days" is harder to act on than a weekday, and a date without a year is
    ambiguous once the year turns — a screen full of "12 Sep" for two different years is the
    failure.

## F · The RRULE mirror — `utils/recurrence.ts`

`Recurrence.java` is the definition; this file is a hand-written mirror of it, and the two must
agree. The API harnesses (`rrule-probe`, 40 checks) prove the *server's* half. Nothing proves the
client's.

- [x] **LOGIC-31 — Every rule the app can build round-trips**
  - **Does:** build each pattern the sheet can produce, serialise, parse, compare.
  - **Proves:** `parse(build(p))` equals `p` for all of them.
  - **Why:** the sheet writes a string and reads it back on every reopen. A pattern that
    serialises to something it can't parse reopens as "doesn't repeat" — and saving from there
    silently removes the user's routine.

- [x] **LOGIC-32 — The canonical form is what the server writes**
  - **Proves:** `INTERVAL=1` is omitted, `BYDAY` is in week order regardless of pick order, and
    the field order matches the server's.
  - **Why:** two strings meaning the same thing is how a client and a server start disagreeing
    about whether anything changed — and the sheet's dirty-checking compares strings.

- [x] **LOGIC-33 — Unknown tokens and bad values are refused, not ignored**
  - **Does:** an unknown key, an empty value, a malformed pair, `INTERVAL=0`, `INTERVAL=400`,
    `BYMONTHDAY=32`, `COUNT=0`, a bad weekday, `BYDAY=5TU`.
  - **Proves:** `null` for every one.
  - **Why:** the server refuses unrecognised tokens rather than dropping them. A client that
    ignored them instead would show a user a rule that isn't the one stored.

- [x] **LOGIC-34 — Every contradiction the server rejects is rejected here too**
  - **Does:** `COUNT` with `UNTIL`; weekly `BYDAY` with `INTERVAL>1`; `nth` on a non-monthly
    freq; monthly with a weekday *set*; yearly with `BYDAY` or `BYMONTHDAY`; `BYMONTHDAY` with
    `nth`; no `FREQ` at all.
  - **Proves:** `null` for each.
  - **Why:** each of these is one line in `parseRecurrence` mirroring one rule in
    `Recurrence.java`. They are the most likely thing in the app to drift out of step with the
    backend, because nothing forces them to be edited together.

- [x] **LOGIC-35 — A rule this build can't represent still reads as repeating**
  - **Proves:** `isRecurringTask` is true and `describeRecurrence` returns "Repeats" — not null,
    and not a crash.
  - **Why:** `recurrenceRule` is typed as a plain string precisely so a row written by a newer
    app version renders. "Repeats" is the honest fallback; null would tell the user their
    routine had ended.

- [x] **LOGIC-36 — The plain-words summary is the one a user can act on**
  - **Proves:** a 7-day set reads "Every day"; Mon–Fri reads "Every weekday"; an nth weekday
    reads "on the third Tue"; `-1` reads "last"; a count appends "· N left".
  - **Why:** this sentence is what most people read instead of the controls (SHEET-03). Listing
    five weekdays where "Every weekday" was meant isn't wrong, but it's the difference between a
    summary and a data dump.

---

## What this file deliberately does not do

It does not assert that a notification is *delivered* — that's [17-device-only](17-device-only.md),
and no amount of correct arithmetic proves a phone rang. It does not re-test the server's grammar
(`rrule-probe` does, against the real parser). And it does not touch anything that needs a
rendered screen: if a case can only be reached by clicking, it belongs in
[05-schedule-sheet](05-schedule-sheet.md) or [11-notifications-ui](11-notifications-ui.md), not
here.
