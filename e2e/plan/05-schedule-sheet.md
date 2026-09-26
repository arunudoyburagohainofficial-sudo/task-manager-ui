# 05 · The schedule sheet — `SHEET`

**The risk:** this one control sets three independent things — **When** a task is for, whether it
**Repeats**, and whether it **Notifies** — and the combinations are where this app has produced
most of its real bugs. The sheet is also the only place that can warn you a notification you just
set can never fire. A warning that's wrong, or missing, is worse than no warning: the task still
buzzes for other reasons and nobody learns the lead time was dead.

`MD/schedule-combination-matrix.md` is the authority for what each combination *should* do, and
the API-level harnesses already prove the server honours it. These tests cover the half those
can't: that the sheet builds the right thing, says the right thing, and saves it in one piece.

## When

- [ ] **SHEET-01 — No date, today, tomorrow and a picked date all save**
  - **Proves:** each choice writes through, the sheet reopens showing it, and the task lands on
    the screen that choice implies (Home vs Upcoming).
  - **Why:** the four When states are the spine of the whole model.

- [ ] **SHEET-02 — Clearing the schedule clears all three parts together**
  - **Proves:** date, repeat and notifications all go, in one write, and the task returns to
    "stays on Home until it's done".
  - **Why:** it's also the only way the server accepts losing a date while a repeat is set —
    clearing them separately is refused.

- [ ] **SHEET-03 — The summary sentence matches what was saved**
  - **Does:** for a dated, repeating, notifying task, read the sheet's summary, save, reopen.
  - **Proves:** the sentence and the controls agree, before and after saving.
  - **Why:** the summary is what most people will read instead of the controls; it drifting from
    the real settings is a silent lie.

- [ ] **SHEET-04 — A date near midnight is the device's date**
  - **Does:** at 23:55 in Asia/Kolkata, choose "Today".
  - **Proves:** the saved date is the device's today, and Home still shows the task as today's.
  - **Why:** `new Date("2026-08-28")` is UTC midnight — the 27th in every negative-offset zone.
    `toDateKey` exists because of that; this is its user-facing guard.

## Repeat

- [ ] **SHEET-05 — Every frequency the grammar allows can be built and read back**
  - **Does:** daily; every N days; weekly with a weekday set; monthly on a day; monthly on an nth
    weekday; yearly.
  - **Proves:** each saves, reopens identically, and the summary describes it in plain words.
  - **Why:** the client mirrors the server's RRULE subset by hand. Anything it can build that the
    server refuses — or reads back differently — shows up here first.

- [ ] **SHEET-06 — A repeat with no date is refused, in both directions**
  - **Does:** set a repeat on an undated task; and clear the date on a task that already repeats.
  - **Proves:** the sheet prevents it or explains the refusal — no silent no-op, no half-applied save.
  - **Why:** "a rule with nothing to repeat from" is the single invariant that replaced the old
    every-day-vs-repeat conflict.

- [ ] **SHEET-07 — A weekly repeat whose day isn't ticked says so**
  - **Does:** a task dated Saturday, repeating Tue/Wed/Thu.
  - **Proves:** the summary states the exception on its own line — this Saturday is a one-off, the
    rule starts next week — and both halves are readable as separate sentences.
  - **Why:** this was rebuilt deliberately (2026-09-15) after the single-sentence version was
    found to be unreadable. It's the most confusing legitimate combination in the app.

- [ ] **SHEET-08 — "After N times" counts the live one**
  - **Does:** set "after 3 times" and read the summary; complete once and reopen.
  - **Proves:** it says "3 to go, counting today", and after one completion the successor says 2.
  - **Why:** `COUNT` means occurrences remaining *including this one*; the wording exists because
    "3 left" was ambiguous, and an off-by-one here mints an unwanted final occurrence.

- [ ] **SHEET-09 — "Forever" really means no end condition**
  - **Proves:** the saved rule carries no COUNT, and the summary doesn't imply an end.
  - **Why:** the only two end states the app can set are none and COUNT; `UNTIL` exists in the
    grammar but no control writes one, and describing it to a user would be a promise the UI
    can't keep.

- [ ] **SHEET-10 — Changing a monthly task's date re-anchors it**
  - **Does:** monthly task on the 10th, move it to the 26th.
  - **Proves:** the rule follows the new day rather than keeping the old anchor.
  - **Why:** an anchor left behind drifts the series permanently — Jan 31 → Feb 28 → forever.

## Notify

- [ ] **SHEET-11 — Up to three notifications, and no more**
  - **Does:** add three; try a fourth.
  - **Proves:** three save and are listed earliest-warning-first; the fourth is refused with a
    reason rather than a server error.
  - **Why:** the ceiling exists because iOS gives the whole app 64 pending notifications; one
    task must not crowd out the rest.

- [ ] **SHEET-12 — A notification can be removed and its time changed**
  - **Proves:** both write through, and the set sent is the whole set (removing the last one
    leaves the task genuinely silent).
  - **Why:** the API replaces the set wholesale — a client that sends a partial set deletes
    notifications the user didn't touch.

- [ ] **SHEET-13 — A lead time longer than the runway is warned about**
  - **Does:** a task due in three days, with a "one week before" notification.
  - **Proves:** the sheet says that one can't fire, and keeps saying it while the date is what it is.
  - **Why:** `MD/notification-placement-audit.md` found exactly this configuration looking healthy
    while being permanently dead — and worse, pairing it with a day-of notification hides it
    completely, because the task still buzzes.

- [ ] **SHEET-14 — A lead time outpaced by a short repeat is warned about**
  - **Does:** a daily task with a "week before" notification.
  - **Proves:** the warning appears — every occurrence is a day out, so that warning can never fire.
  - **Why:** same class as SHEET-13, reached through the repeat rather than the date.

- [ ] **SHEET-15 — The warning clears when the configuration becomes fireable**
  - **Does:** with the warning showing, move the date out far enough.
  - **Proves:** it disappears without saving and reopening.
  - **Why:** a warning that sticks after it stops being true teaches people to ignore warnings.

- [ ] **SHEET-16 — An undated task's notification is honest about what it does**
  - **Does:** set a notification on a task with no date.
  - **Proves:** the sheet describes it as firing every day until done, and no days-before offset
    is stored.
  - **Why:** an offset is meaningless without a date; the client flattens it rather than storing
    a promise it can't keep.

- [ ] **SHEET-17 — A saved schedule is really one write**
  - **Does:** change date, repeat and notifications together, with the request failing.
  - **Proves:** nothing is applied — no date moved with the notifications lost — and the sheet
    stays open with the error.
  - **Why:** this replaced three separate calls, two of which had no error path at all. The
    "one outcome" property is the reason it was rebuilt.

- [ ] **SHEET-18 — A rule the server refuses is reported, not swallowed**
  - **Does:** force a 400 from the update.
  - **Proves:** the message reaches the user and the sheet keeps their input.
  - **Why:** unrecognised tokens are refused rather than ignored server-side; the UI has to
    translate that rather than appear to have saved.

- [ ] **SHEET-19 — Editing an overdue task's date doesn't trap the picker**
  - **Does:** open the sheet on a task dated in the past and change the date.
  - **Proves:** the picker opens on a valid day and the new date saves.
  - **Why:** seeding the picker with a past date while forbidding past dates crashed Android's
    picker outright. The web build can't reproduce the crash, but it can guard the value logic
    that caused it — the device plan keeps the rest.

- [ ] **SHEET-20 — Every combination the matrix lists can be built through the UI**
  - **Does:** walk the When × Repeat × Notify table from `MD/schedule-combination-matrix.md`,
    building each through the sheet rather than the API.
  - **Proves:** each one is constructible, saves, and lands where the matrix says.
  - **Why:** the harnesses prove the *server* honours the matrix. This proves the sheet can
    actually express it — the gap where "a user can construct something that doesn't do what they
    expect" lives.

## What the sheet says about a notification — added 2026-09-18

The four verdicts in `notificationVerdict` are the sheet's entire vocabulary for "will this
fire?", and they were written in response to a specific failure: the first version painted every
non-firing occurrence red, including the ones that fix themselves. A warning users learn to ignore
is worse than no warning, so three of these four tests are about *not* crying wolf.

`LOGIC-*` in [18-scheduling-logic](18-scheduling-logic.md) proves the verdicts are computed
correctly. These prove the sheet says the right sentence for each, which is a separate thing and
the one the user actually meets.

- [ ] **SHEET-21 — The self-correcting case is stated quietly, not as a problem**
  - **Does:** a weekly repeating task whose notification time has already passed today.
  - **Proves:** the line reads "Too late for this one — starts from the next." and is *not* styled
    as an error — no warning colour, no icon.
  - **Why:** nothing is lost: the next occurrence fires normally. This is the exact case that was
    previously alarmed about, and the reason the `not-this-time` verdict exists at all.

- [ ] **SHEET-22 — A notification that works once and then never is warned about**
  - **Does:** a daily task, dated today, with a "3 days before" notification set to a time still
    ahead.
  - **Proves:** "Fires this time, but not on the copies after it — this repeats sooner than the
    warning.", styled as a problem.
  - **Why:** the `only-this-time` verdict. Every existing check would call this healthy — the
    occurrence in front of you genuinely fires — while the routine goes silent from tomorrow
    onwards, permanently.

- [ ] **SHEET-23 — Each "never" names the cause that actually applies**
  - **Does:** three configurations that all reach the `never` verdict by different routes — a
    daily task with a week's warning; a day-of notification whose time passed today; a lead time
    landing before today on a one-off.
  - **Proves:** three different sentences — the repeat one, "That time has already passed today",
    and "That lands on <date>, already past" — each naming the fix that would work.
  - **Why:** all three are the same verdict and would be equally satisfied by one generic message.
    The cause is the only part the user can act on, and the date in the third is computed from the
    shared `fireDayOf` rather than a second local copy — which is what let the sheet and the rest
    of the app disagree before.

- [ ] **SHEET-24 — An undated task's notification says what it really does**
  - **Proves:** the line reads "Every day until you finish it." and no lead-time control is
    offered.
  - **Why:** the same claim as SHEET-16 from the copy side. An offset is meaningless without a
    date, so the sheet must describe the daily behaviour rather than leave the user assuming a
    one-off.

## Building the rule — added 2026-09-18

- [ ] **SHEET-25 — Changing one notification's time leaves the others alone**
  - **Does:** three notifications; edit the middle one's time.
  - **Proves:** only that one moves, and the list re-sorts earliest-warning-first afterwards.
  - **Why:** `updateNotificationTime` rewrites by index into a list that is also re-ordered for
    display. An index taken from the sorted view and applied to the stored order edits the wrong
    row — and the API replaces the set wholesale, so the user's other two reminders are gone.

- [ ] **SHEET-26 — Turning the date off drops the repeat in the same write**
  - **Proves:** one request, carrying a null date *and* a null rule — the client doesn't send a
    dateless repeat and rely on the server's refusal.
  - **Why:** `handleSave` makes this structural (`hasDate && repeat ? … : null`) rather than
    something each caller remembers. The server refuses the combination, so getting it wrong turns
    an ordinary "clear the date" into an error the user can do nothing about.

- [ ] **SHEET-27 — The saved rule is the canonical string, not an equivalent one**
  - **Proves:** "every week on Mon, Wed" saves as `FREQ=WEEKLY;BYDAY=MO,WE` — no `INTERVAL=1`, and
    the days in week order however they were tapped.
  - **Why:** the sheet's dirty-checking compares rule strings. Two spellings of the same rule make
    the Save button appear when nothing changed, and — worse — make a genuine change look like a
    no-op.

- [ ] **SHEET-28 — Yearly offers no day controls, because the task's date is the answer**
  - **Proves:** choosing Yearly hides the weekday set and the day-of-month control, and the saved
    rule is a bare `FREQ=YEARLY`.
  - **Why:** the month and day come from the task's own date; a second control answering the same
    question is how a rule ends up with two different anchors, which the parser then refuses.

- [ ] **SHEET-29 — Reopening the sheet shows what was stored, not what was last typed**
  - **Does:** change the date and the repeat, cancel, reopen.
  - **Proves:** the controls show the task's saved values.
  - **Why:** the sheet re-seeds from its props in an effect keyed on the task's stored schedule. A
    key that misses — or state that outlives the close — shows the user an unsaved edit as though
    it were saved, and the next save writes it.

- [ ] **SHEET-30 — The monthly anchor reads off the stored anchor, not the picked date**
  - **Does:** a monthly task anchored to the 10th; open the sheet and move the date picker to the
    26th without saving.
  - **Proves:** the two anchor options still describe the *stored* anchor until the save lands.
  - **Why:** labels that follow the picker live tell the user the rule has already changed. Pair
    with SHEET-10, which proves that on save it genuinely does re-anchor.
