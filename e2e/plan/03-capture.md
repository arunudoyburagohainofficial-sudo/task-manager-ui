# 03 · Capture and Organize — `CAP`

**The risk:** this is the only way a task gets into the app, and it's a two-screen flow that
creates several rows in one go. A half-finished batch — three tasks saved, one lost, no message —
is the failure that would cost someone real work, and the one hardest to notice.

Capture is now reachable from every tab (Ferne is docked in the tab bar), so "which screen was I
on" is part of what these cover.

- [ ] **CAP-01 — Capture opens from every tab**
  - **Does:** tap Ferne from Home, Scheduled, Progress and Settings.
  - **Proves:** the capture sheet opens each time, over the tab it was opened from.
  - **Why:** the whole point of docking it. Before, capture lived on Home and depended on being
    scrolled to the top of the right screen.

- [ ] **CAP-02 — One task, captured and created**
  - **Does:** type a name, Confirm & Organize, confirm, land on Home.
  - **Proves:** the task exists on Home as a focus task (the default), with the name exactly as
    typed.
  - **Why:** the shortest complete path through the app; if this breaks, nothing else can be used.

- [ ] **CAP-03 — Several drafts in one pass**
  - **Does:** add three drafts with "+ Add another", organise them differently (one focus, one
    reminder with a time, one attached to a goal), confirm.
  - **Proves:** all three are created with their own settings, and Home shows three new rows of
    the right kinds.
  - **Why:** the batch path is where per-draft state gets crossed — one draft's goal landing on
    another is invisible until someone notices their tags are wrong.

- [ ] **CAP-04 — Removing a draft removes the right one**
  - **Does:** three drafts, remove the middle one.
  - **Proves:** the other two survive with their own text and settings.
  - **Why:** drafts are keyed by a local id; keying by index instead silently removes the wrong row.

- [ ] **CAP-05 — Cancel discards everything**
  - **Proves:** nothing is created, and reopening capture starts empty.
  - **Why:** an abandoned capture that resurrects half a draft later is confusing and, for a
    voice-style capture flow, potentially embarrassing.

- [ ] **CAP-06 — Empty input can't be submitted**
  - **Does:** open capture, press Confirm & Organize with nothing typed, and with only whitespace.
  - **Proves:** no empty task is created, and the control makes clear nothing will happen.
  - **Why:** an unnamed task is unreachable from every screen that lists tasks by name.

- [ ] **CAP-07 — Going back from Organize keeps the drafts**
  - **Does:** from Organize, use Back.
  - **Proves:** capture reopens with the drafts still there, nothing created.
  - **Why:** "I meant to add one more" is the most common reason to go back, and losing the batch
    there means retyping everything.

- [ ] **CAP-08 — A schedule set during Organize is really saved**
  - **Does:** on a draft, set a date and a notification time through the schedule sheet.
  - **Proves:** the created task carries both — the row shows "Reminder · <time>" and it sits on
    the right day.
  - **Why:** the schedule now travels with the task in one request; it used to be a second call
    that could fail on its own and leave a saved task whose schedule silently didn't apply.

- [ ] **CAP-09 — Attaching a goal during Organize sticks**
  - **Proves:** the created task shows as a Goal row and the goal's picker reflects it afterwards.
  - **Why:** attaching at capture time is the only way to build a routine in one pass.

- [ ] **CAP-10 — A repeat set at capture time creates a real routine**
  - **Does:** set a daily repeat with a date on a draft.
  - **Proves:** the task is created recurring, and Scheduled lists it under Recurring.
  - **Why:** recurrence used to be reachable only from Task Detail, so "add a daily habit" cost a
    save, a hunt and a second screen. The shortcut has to actually work.

- [ ] **CAP-11 — One failed creation doesn't lose the rest**
  - **Does:** make the second of three create-requests fail.
  - **Proves:** the other two are saved, the failure is reported specifically, and nothing is
    created twice if the user retries.
  - **Why:** the batch is deliberately per-draft error handled; silent partial success is the
    worst outcome of the whole flow.

- [ ] **CAP-12 — Awkward text survives the round trip**
  - **Does:** emoji, a 300-character name, newlines, leading/trailing spaces, quotes and
    right-to-left text.
  - **Proves:** what comes back on Home is what was typed (trimmed), the row doesn't break, and
    nothing is escaped twice.
  - **Why:** free text is the only truly user-controlled input in the app.

- [ ] **CAP-13 — Capture during the walkthrough advances it**
  - **Proves:** opening capture from the docked button moves the tour to its next step.
  - **Why:** the tour watches real actions rather than using Next buttons, so the two are coupled.
