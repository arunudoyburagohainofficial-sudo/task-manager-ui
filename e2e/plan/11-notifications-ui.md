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
