# 12 · Time, dates and timezones — `TIME`

**The risk:** every screen in this app answers a question about *today*, and this codebase has
already lost two days to getting that wrong — tasks reappearing the same day in India, skipping
a day in US Pacific, and a snooze that resolved five and a half hours into the past. The rule is
simple to state and easy to break: the user's day is decided by the user's device, and anything
crossing the API carries its zone with it.

These are the tests that need the clock mock and the timezone override, so they're grouped
together rather than scattered through the screens they touch.

- [ ] **TIME-01 — "Today" is the device's today, not the server's**
  - **Does:** run the same seeded data in two browser contexts, one in `Asia/Kolkata` and one in
    `America/Los_Angeles`, at a time where the two disagree about the date.
  - **Proves:** each sees its own day's tasks on Home, and each gets its own day's points total.
  - **Why:** the `X-Timezone` header is how the server resolves the day; a screen that ignores it
    files work under the wrong date for most of the planet.

- [ ] **TIME-02 — Midnight rolls over with the app open**
  - **Covered from Home in HOME-28 and from Scheduled in SCHED-12; listed here as the rule.**
  - **Why:** an app left open on a desk gets no foreground event to re-read the date.

- [ ] **TIME-03 — A finish time is shown in the device's zone**
  - **Does:** complete a task at a known instant, then read the DONE row in two timezones.
  - **Proves:** each shows its own local clock time, and neither is hours out.
  - **Why:** the server writes these with its own clock; they now leave the API as instants for
    exactly this reason. It's also the most visible possible symptom — "I finished that at 8am,
    why does it say 2:40?"

- [ ] **TIME-04 — A completion just after midnight belongs to the new day**
  - **Does:** at 00:05, finish a task.
  - **Proves:** it appears in today's DONE and today's points, not yesterday's.
  - **Why:** the boundary case of TIME-01, and the one people actually hit (late-night task
    tidying).

- [ ] **TIME-05 — A completion just before midnight belongs to the old day**
  - **Does:** at 23:55, finish a task; then advance past midnight without reloading.
  - **Proves:** it counts for the day it happened, and the new day starts clean.
  - **Why:** the same boundary from the other side; an off-by-one here silently moves work
    between days and breaks the streak.

- [ ] **TIME-06 — "In N minutes" resolves on the device clock**
  - **Does:** the quick-nudge presets at a known time, in a non-UTC zone.
  - **Proves:** the stored time is now + N in local terms, and the date is the one that instant
    falls on.
  - **Why:** this was resolved server-side once; the notification landed in the past and never
    fired.

- [ ] **TIME-07 — A session spanning midnight credits the day it ended**
  - **Does:** start at 23:50, finish at 00:10.
  - **Proves:** the minutes appear in the new day's totals, once, and the timer counted the full
    twenty minutes.
  - **Why:** the credit is stamped at completion; a session that vanishes from both days would
    be invisible work.

- [ ] **TIME-08 — Daylight saving doesn't duplicate or skip a day**
  - **Does:** run the day-rollover and a dated recurrence across a DST transition in a zone that
    has one.
  - **Proves:** no day is repeated or skipped, a daily routine still advances one day, and the
    session timer's remaining minutes are unaffected.
  - **Why:** the app's date maths is string-based and its timers are instant-based, which is the
    right combination — but it's never been exercised across a transition.

- [ ] **TIME-09 — A month-end recurrence crosses a year boundary correctly**
  - **Does:** a monthly task anchored to the 31st, completed through December into January.
  - **Proves:** the successor is 31 January, and the year rolls over.
  - **Why:** month and year arithmetic are the same code path that produced the February drift.

- [ ] **TIME-10 — A device whose clock is wrong doesn't corrupt anything**
  - **Does:** set the device clock a day ahead of the server.
  - **Proves:** the app still shows a coherent screen, and nothing writes a date the server then
    refuses; the discrepancy doesn't multiply into duplicate successors.
  - **Why:** phone clocks drift and travellers cross zones mid-day; the app should degrade
    gracefully rather than produce data nobody can explain.
