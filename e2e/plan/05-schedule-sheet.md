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

- [ ] **SHEET-01 — Anytime, today, tomorrow and a picked date all save**
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

## Notify — the reminder card, rebuilt 2026-11-26

The card ("Remind you?") is one line until **Change** opens it: exactly when the phone will ring,
in real dates. A day brings a reminder by itself (9 AM on the day, or the next full hour at least
half an hour ahead once that has gone), and nothing is offered that couldn't ring. Each reminder is
a named group ("Reminder on the day", "Reminder the day before", "Reminder a week before") with its
own time chips, and the tests reach a chip through its reminder.

- [ ] **SHEET-11 — Three reminders, said earliest first, and no fourth**
  - **Does:** a task ten days out, saved silent; "Add one", then "+ The day before" and "+ A week
    before"; a fourth through the API.
  - **Proves:** a silent task offers a reminder rather than adding one; each reminder's sentence
    names its own date; the closed line reads in the order the phone rings
    ("…at 9:00 AM, …at 6:00 PM and …at 9:00 AM"); the limit is said in words and the add row goes;
    it saves as 7/1/0 days before; the fourth is a 400, not a server error.
  - **Why:** the ceiling exists because iOS gives the whole app 64 pending notifications; one
    task must not crowd out the rest.

- [ ] **SHEET-12 — A reminder can be retimed and removed, and turning them off leaves silence**
  - **Does:** two reminders; move the day-of one to Evening, remove the day-before one; save. Reopen,
    "Turn off reminders", save. Reopen again.
  - **Proves:** only extra reminders carry a Remove; the whole set is sent (the API replaces it
    wholesale); off saves as no reminders at all, and stays off on reopening ("Add one", not a
    reminder put back).

- [ ] **SHEET-13 — An earlier reminder is only offered while it can still ring**
  - **Does:** tasks due in 3 days, today, and in 8 days.
  - **Proves:** 3 days out offers the day before but not a week before; today offers neither and
    the "Also remind me earlier" row isn't there at all; 8 days out offers a week before.
  - **Why:** `MD/notification-placement-audit.md` found "a week before" on something due in three
    days looking healthy while being permanently dead. The sheet now doesn't offer it.

- [ ] **SHEET-14 — A repeat hides the earlier reminders it would make impossible**
  - **Does:** a dated task, switched Daily → Weekly → Monthly with the card open.
  - **Proves:** daily offers neither earlier reminder (the next copy is always a day out); weekly
    offers the day before but not a week before; monthly offers both.

- [ ] **SHEET-15 — A reminder that can't ring is said in red, and clears as soon as it can**
  - **Does:** a daily task with a week-before reminder, set up through the API (as an older
    version of the sheet allowed); then Monthly.
  - **Proves:** the closed card says "One of these won't ring. Tap Change to see why." in red; the
    reminder's own red line names the repeat as the cause; switching to Monthly turns it into the
    quiet "starts from the next" note without saving.
  - **Why:** a warning that sticks after it stops being true teaches people to ignore warnings.

- [ ] **SHEET-16 — An undated task's reminder rings every day, and stores no offset**
  - **Proves:** no default on an undated task; "Remind me daily" gives "Every day at 9:00 AM until
    it's done"; no earlier reminder is offered; it stores `09:00/0`.

- [ ] **SHEET-32 — Giving an undated task a day brings a reminder with it, and it follows the day**
  - **Proves:** Tomorrow brings 9:00 AM; Anytime takes the untouched default away (rather than
    turning it into a daily reminder); Tomorrow brings it back; it saves.

- [ ] **SHEET-33 — A task saved silent stays silent when its day changes**
  - **Proves:** a dated task saved with no reminder gets none when moved; nor does one whose
    reminders were turned off earlier in the same sheet.

- [ ] **SHEET-34 — A reminder someone chose stays put when the day changes**
  - **Proves:** once retimed (9 PM) it is theirs: Anytime keeps it as a daily reminder, Tomorrow
    keeps 9 PM, and it saves as `21:00/0`.

- [ ] **SHEET-35 — Times already gone today aren't offered for a reminder that's today**
  - **Does:** the phone's clock at 2 PM; a reminder today, then one tomorrow.
  - **Proves:** today's shows only Evening and Night; tomorrow's shows all four.

- [ ] **SHEET-36 — Today's default reminder is always still ahead**
  - **Does:** the phone's clock at 7:00, 8:40, 14:10, 14:40, 21:20 and 21:40; "Today" each time.
  - **Proves:** 9 AM, 10 AM, 3 PM, 4 PM, 10 PM, then no default and "Add one" - every branch of
    "9 AM while that's half an hour off, else the next full hour at least half an hour ahead, else
    nothing", whatever time the suite runs.

- [ ] **SHEET-17 — A saved schedule is really one write**
  - **Does:** change date and repeat and turn the reminder off together, with the request failing.
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
  - **Does:** walk When × Repeat × Notify (20 combinations), each on a fresh undated task, building
    it through the sheet with the phone's clock at 2 PM.
  - **Proves:** each one is constructible, saves, and lands where the matrix says. "None" on a dated
    task is reached by turning the default off. "The day before" is offered where it can ring and
    absent where it can't (a one-off due today; any daily repeat) - those end with one reminder.
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
  - **Does:** the phone's clock at 2 PM; a weekly task whose 9 AM reminder has passed today.
  - **Proves:** the closed card raises no alarm, and the open card reads "Too late for this one -
    starts from the next." in the quiet grey, not red.
  - **Why:** nothing is lost: the next occurrence fires normally. This is the exact case that was
    previously alarmed about, and the reason the `not-this-time` verdict exists at all.

- [ ] **SHEET-22 — A reminder that works once and then never is warned about**
  - **Does:** a daily task due in two days with a day-before reminder (set up through the API).
  - **Proves:** "Rings this time, but not on the ones after it - this repeats sooner than the day
    before.", in red, and the closed card's red line.
  - **Why:** the `only-this-time` verdict. The occurrence in front of you genuinely rings, while the
    routine goes silent from then on, permanently.

- [ ] **SHEET-23 — Each "never" names the cause that actually applies**
  - **Does:** the phone's clock at 2 PM; three set-ups reaching `never` by different routes — a
    daily task with a week-before reminder; a day-of 9 AM reminder today; a week-before reminder on
    a one-off due in three days.
  - **Proves:** three different sentences — "This repeats too often for a reminder a week before…",
    "9:00 AM has already gone today. Pick a later time.", and "A week before is <date>, which has
    already passed. This one won't ring." — each in red.
  - **Why:** all three are the same verdict and would be equally satisfied by one generic message.
    The cause is the only part the user can act on, and the date in the third is computed from the
    shared `fireDayOf`.

- [ ] **SHEET-24 — The undated copy offers no earlier reminders at all**
  - **Proves:** an undated reminder reads "Every day at 9:00 AM until it's done", and opening it
    offers no "+ On the day / The day before / A week before" and no "Also remind me earlier" row.

## Building the rule — added 2026-09-18

- [ ] **SHEET-25 — Changing one reminder's time leaves the others alone**
  - **Does:** three reminders; set the day-before one to Evening.
  - **Proves:** that chip is selected and the other two keep Morning, and it saves as
    `09:00/7, 18:00/1, 09:00/0`.
  - **Why:** each reminder has its own row of identical chips; a chip that edited the wrong
    reminder would replace the user's other reminders, since the API takes the set wholesale.

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

- [ ] **SHEET-31 — Switching apps mid-edit keeps what you had chosen**
  - **Does:** open the sheet, change something, send the app to the background and bring it back.
  - **Proves:** the unsaved choices are still there.
  - **Why:** the sheet used to reload itself from the stored values whenever they were fetched
    again, and they are fetched again every time the app comes back to the front.
