# 11 · Notifications, as far as a browser can see — `NOTIF`

**The risk:** a reminder app's core promise is that it will interrupt you at the right moment.
Whether the OS actually delivers is device territory ([17-device-only](17-device-only.md)), but
three things *are* checkable here, and each has produced a real bug: what the app decides to
queue, what it tells you it queued, and whether it stops queueing when the task is done.

**Scope note:** `expo-notifications` does nothing useful in a browser, so the queue itself is
empty on web. These tests therefore assert on the *configuration* the app holds and shows, and
on the pure scheduling decisions. The decision functions in `src/notifications/schedulingLogic.ts`
are pure and dependency-free — they deserve unit tests rather than browser tests, and
`scripts/notification-liveness-probe.ts` already drives some of them against a real server.

- [ ] **NOTIF-01 — The Upcoming notifications screen reflects what's configured**
  - **Does:** seed tasks with a day-of notification, a week-before, and a nudge window; open the
    screen.
  - **Proves:** each configured notification is represented, with its task, its time and its lead
    time; a task with none is absent.
  - **Why:** this screen exists so the app can't push things into the OS the user can neither see
    nor stop. If it under-reports, that guarantee is gone.

- [ ] **NOTIF-02 — It's honest when the device queue is empty**
  - **Does:** the browser case, where nothing is really queued.
  - **Proves:** an explicit empty state, not a silent blank that looks like "you have no
    reminders".
  - **Why:** the screen deliberately shows the *device's* queue rather than the server's
    configuration, and the two legitimately differ. It has to say which it's showing.

- [ ] **NOTIF-03 — Turning one off removes it and says so on the task**
  - **Proves:** the entry disappears and the task's own schedule row no longer advertises it.
  - **Why:** two sources of truth for one notification; turning it off in one place and leaving
    it in the other is exactly the kind of drift this screen was built to expose.

- [ ] **NOTIF-04 — Finishing a task silences it immediately**
  - **Does:** finish a task that had a notification later today.
  - **Proves:** its notification is gone from the list right away, not at the next app launch.
  - **Why:** the server stops the reminder, but that's server-side only — a notification already
    scheduled on the device keeps ticking until the next foreground sync. A task that buzzes
    after you've finished it is the most annoying possible bug.

- [ ] **NOTIF-05 — Deleting a task silences it too**
  - **Why:** same mechanism, and here the notification would open a task that no longer exists.

- [ ] **NOTIF-06 — Undo re-arms what completion silenced**
  - **Does:** finish a task with a notification later today, undo.
  - **Proves:** the notification is configured again.
  - **Why:** reopen re-arms reminders server-side; if the device never learns, the restored task
    is silent for the rest of the day.

- [ ] **NOTIF-07 — A bulk date change doesn't strand a lead time**
  - **Does:** a task dated next week with a week-before notification; use "Move all to today".
  - **Proves:** either the notification follows sensibly or the user is told it can no longer
    fire — not silently impossible.
  - **Why:** the schedule sheet warns about this; the bulk action changes dates with no sheet
    open, which is the same bug reached by a different path (`TODOS.md` item 4).

- [ ] **NOTIF-08 — The three-notification ceiling holds through the UI**
  - **Proves:** a task can't end up with four, whichever screen set them.
  - **Why:** the budget is shared across the whole app; one task with a dozen reminders crowds
    out everyone else's.

- [ ] **NOTIF-09 — Nudges and reminders are counted separately**
  - **Does:** a task with both a day-of reminder and an interval window.
  - **Proves:** the screen distinguishes them, and stopping the nudges doesn't remove the
    reminder.
  - **Why:** they're separate mechanisms with separate endpoints; the UI conflating them would
    silently remove the wrong one.

- [ ] **NOTIF-10 — The in-app reminder modal** *(blocked: no caller)*
  - **Finding:** `ReminderNotificationModal` — with its Done / Snooze 15 min / Stop actions — is
    exported but nothing in the app renders it. Either it should be wired to a foreground
    notification, or removed. Until that's decided there's nothing to test, and a component with
    no caller is the kind of thing this repo explicitly doesn't keep.
  - **When wired, the tests are:** Done completes the task and stops all its nudges; Snooze moves
    the next firing by 15 minutes and leaves the task pending; Stop keeps the task and silences it.

## Added 2026-09-18 — the device queue, and what the app tells you about it

NOTIF-01 to NOTIF-09 cover the *configuration*. These cover the other end: the queue
`scheduledInspector` reads, its budget, and the two races that can leave it disagreeing with the
server. On web the queue is empty, so several of these are assertions about what the screen says
when it has nothing to show — which is exactly the case NOTIF-02 exists for, and the reason the
screen was built to name which end it's reporting.

- [ ] **NOTIF-11 — One daily reminder appears as several queued firings, and the screen says why**
  - **Does:** an undated task with a reminder time.
  - **Proves:** the queue carries a week of entries for one configured reminder, and the screen
    explains that rather than appearing to have created seven reminders.
  - **Why:** the horizon (LOGIC-06) is invisible in the configuration and very visible in the
    queue. A user who sees seven identical rows and can't find seven reminders to delete has no
    way to understand the screen.

- [ ] **NOTIF-12 — A full queue reports the budget rather than under-reporting silently**
  - **Does:** enough reminders and nudges to exceed `NOTIFICATION_BUDGET` (50).
  - **Proves:** the screen shows how full the queue is and says the tail isn't scheduled — it does
    not simply list 50 things as though that were everything configured.
  - **Why:** the whole justification for this screen is that the app must not push things into the
    OS the user can neither see nor stop. A silently truncated list is that failure wearing the
    screen's own clothes.

- [ ] **NOTIF-13 — A lead-time firing's text says when the task is due**
  - **Proves:** the queued entry for a "1 day before" notification reads "… — due tomorrow", and
    the day-of entry for the same task doesn't.
  - **Why:** `leadIn` exists because the two were word-for-word identical, so the early warning
    read as "this is due now". LOGIC-21/22 prove the wording; this proves the wording is what
    actually reaches the queue, with the right offset attached.

- [ ] **NOTIF-14 — A focus task's reminder and a plain reminder announce themselves differently**
  - **Proves:** "Time to focus" for a focus task, "Reminder" for the other.
  - **Why:** every reminder used to say "Time to focus", which is the wrong sentence entirely for
    "Call the dentist" — and the kind of thing that makes an app feel like it isn't listening.

- [ ] **NOTIF-15 — A snoozed reminder shows its snoozed time and loses its original slot**
  - **Proves:** one entry, at the snoozed instant; the original time is absent.
  - **Why:** the device ignored `snoozedUntil` entirely once, so the reminder came back at its
    original time. LOGIC-09 pins the arithmetic; this pins that the queue the user is shown agrees
    with it.

- [ ] **NOTIF-16 — A task finished on another device leaves the queue on the next sync**
  - **Does:** complete the task through the API, then foreground the app.
  - **Proves:** its entries are gone.
  - **Why:** the server stops the reminder, but the device's queue is cancel-and-reschedule on
    foreground. Until that runs, a finished task keeps its alarm — the most annoying possible bug,
    and one a second device makes reachable without the user doing anything wrong.

- [ ] **NOTIF-17 — Two reminder changes in quick succession leave the queue matching the second**
  - **Does:** save a reminder, then immediately save a different one, without waiting.
  - **Proves:** the queue matches the later save — no duplicates, and nothing from the first save
    left behind.
  - **Why:** `scheduleAll` is fired unawaited from a dozen places and two overlapping runs used to
    interleave destructively: the second run's cancel wiped the first's writes, and the first then
    finished scheduling on top. The fix is a serialising promise chain; nothing else tests it.

- [ ] **NOTIF-18 — A background sync racing a completion doesn't resurrect the finished task**
  - **Does:** complete two tasks in quick succession.
  - **Proves:** both stay in DONE — neither reappears in TO DO — and the counts settle correctly.
  - **Why:** `syncReminders` writes whole lists into the query cache and is fired unawaited from
    every completion. The first sync's response landing after the second's optimistic update put
    the second task back into the pending list, where it sat until something else refetched. The
    guard is a single `isMutating() === 0` check, and its symptom — a task you just finished
    quietly reappearing — is indistinguishable from the app losing the write.
