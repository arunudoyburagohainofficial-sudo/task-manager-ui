# 09 · The Scheduled screen — `SCHED`

**The risk:** this is where work that isn't for today lives — the missed, the repeating and the
planned. Its whole job is to be the place you can trust to hold things so Home can stay short. A
task that falls between its three panels is a task nobody sees again.

- [ ] **SCHED-01 — The three panels, in order, with their counts**
  - **Does:** seed overdue, recurring and future tasks.
  - **Proves:** Overdue (with its count badge), Recurring, then Upcoming — each listing exactly
    its own tasks.
  - **Why:** the panels are mutually exclusive by rule, not by hope; a task in two panels or
    none is the failure this screen exists to prevent.

- [ ] **SCHED-02 — Nothing scheduled reads as calm, not broken**
  - **Proves:** the single "Nothing scheduled" card, with no empty panels above or below it.
  - **Why:** three empty headed panels look like a loading failure.

- [ ] **SCHED-03 — Upcoming is grouped by day, soonest first**
  - **Does:** tasks across four different future dates, out of order.
  - **Proves:** one dated heading per day, days ascending, tasks under the right heading, and
    "Tomorrow" used where it's clearer than a date.
  - **Why:** the grouping is done by string-sorted date keys; a locale-formatted heading that
    disagrees with the sort would scramble the list.

- [ ] **SCHED-04 — Overdue folds past five and expands**
  - **Does:** eight overdue tasks.
  - **Proves:** five rows plus "3 more"; tapping shows the rest.
  - **Why:** a wall of missed work turns the screen into a punishment; the fold is deliberate.

- [ ] **SCHED-05 — Each overdue row says how late it is**
  - **Proves:** the subtitle reads "… · was due Yesterday" (or the date), with no literal "null"
    where a detail is missing.
  - **Why:** a missing value printed as "null" has happened here before; the subtitle is
    assembled from optional parts.

- [ ] **SCHED-06 — Move all to today does what it says, once confirmed**
  - **Does:** with several overdue, use the bulk action.
  - **Proves:** all of them are dated today, they appear on Home, the Overdue panel empties and
    the tab badge clears.
  - **Why:** the one bulk write in the app. It's also the path that can strand a notification —
    see NOTIF-07.

- [ ] **SCHED-07 — Cancelling the bulk move changes nothing**
  - **Proves:** dates untouched.
  - **Why:** it's a wide-reaching action with one confirmation between it and everything.

- [ ] **SCHED-08 — Recurring rows show the rule and the next date**
  - **Proves:** "Every 2 weeks · next Tue 29 Sep" style summaries that match the task's rule, and
    a late one is marked as late rather than hidden.
  - **Why:** this panel is the only place a routine's shape is visible without opening it.

- [ ] **SCHED-09 — The tab badge counts overdue and disappears at zero**
  - **Proves:** the number matches the Overdue panel's count exactly, and clearing the backlog
    removes the badge.
  - **Why:** a badge that disagrees with the panel it points at was a real regression — the badge
    was counting a category the panel deliberately excluded.

- [ ] **SCHED-10 — A task moved to today leaves Upcoming and appears on Home**
  - **Does:** change a future task's date to today from its detail screen.
  - **Proves:** both screens update without a manual refresh.
  - **Why:** the two screens read the same cached list through different filters; a stale one is
    how a task appears to be in two places.

- [ ] **SCHED-11 — Opening a row opens that task**
  - **Proves:** each panel's rows navigate to the right task.
  - **Why:** three different row components, three chances to pass the wrong id.

- [ ] **SCHED-12 — The day rolls over correctly on this screen too**
  - **Does:** with the screen open, advance the clock past midnight.
  - **Proves:** tomorrow's tasks become today's (and leave Upcoming), today's untouched ones
    become overdue, and the badge follows.
  - **Why:** placement transitions purely on the date with no server action — that's verified
    server-side by `day-transition-verify`; this is the same claim in the UI.
