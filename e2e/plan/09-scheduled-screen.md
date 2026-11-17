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

## Bulk actions, Cancel, and the fourth panel (added since)

The screen has four panels now: ANYTIME, for work with no day, joined the other three when Home
stopped listing every undated task.

- [ ] **SCHED-13 — "Clear all" deletes every overdue task and credits nothing**
  - **Proves:** the tasks are deleted rather than finished: no points, nothing under DONE.
  - **Why:** marking them done would credit work that never happened.

- [ ] **SCHED-14 — Cancelling "Clear all" leaves every task alone**
  - **Why:** the confirmation is the only thing between one tap and a deleted backlog.

- [ ] **SCHED-15 — Both bulk actions are offered from a single overdue task**
  - **Why:** they used to appear only at two or more, which left the commonest case, one thing
    missed, with nothing to tap but the row.

- [ ] **SCHED-16 — An upcoming row reads like its Home row, with Cancel as the action**
  - **Proves:** the same mark, the same detail line and the same wording as Home.
  - **Why:** the same task looked like two different kinds of object depending on the tab.

- [ ] **SCHED-17 — Cancel deletes the task, once confirmed, and credits nothing**

- [ ] **SCHED-18 — Keeping it changes nothing**

- [ ] **SCHED-19 — "Clear all" on sixty overdue tasks deletes each once and rebuilds notifications once**
  - **Does:** sixty late tasks seeded straight into the database; press Clear all; count every
    request the app makes.
  - **Proves:** sixty deletes, and a total within a small fixed overhead of sixty; the database
    holds only the two tasks that were not overdue.
  - **Why:** each delete used to trigger its own rebuild of the notification queue, three requests
    apiece. Sixty tasks made 243 requests, most of the way to the server's per-minute limit.
    **Seen to fail** before the fix.

- [ ] **SCHED-20 — "Move all to today" on sixty overdue tasks changes each once and lands them all on Home**
  - **Proves:** sixty changes within the same overhead, and all sixty dated today on the server.
  - **Why:** a guard for the same loop as SCHED-19. It passed before the fix too, so it is here to
    stop a regression rather than as proof of one.

- [ ] **SCHED-21 — Anytime shows the newest thirty and keeps the rest behind one press**
  - **Does:** seventy-five undated tasks; open the tab; scroll to the very bottom; press
    "45 more". Then exactly thirty.
  - **Proves:** thirty rows, the newest thirty, in order; the heading still says 75; with the
    screen scrolled as far as it goes, nothing is drawn over the button's centre or any of its
    four edges; one press brings all of them, oldest included; at exactly thirty there is no
    button.
  - **Why:** this is a plain scrolling screen, so every row shown is a row drawn. Unfolded, a
    backlog of a thousand took the tab to thirteen thousand page elements, where Home stays at
    about 350 whatever the account holds. **Seen to fail** before the fold existed.
    The edges are checked because the button is the last thing on the screen, which is where
    the tab bar's mascot rises over the list. A click presses the middle, and the middle was
    never the part she covered. **Seen to fail** with the spacing under the button removed
    ("something sits on the bottom edge", and what sat there was "Foyg, resting").
