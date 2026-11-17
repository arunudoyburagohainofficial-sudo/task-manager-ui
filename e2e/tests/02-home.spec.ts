import { expect, test } from "../harness/fixtures";
import {
  button,
  control,
  dateKey,
  deviceClockAt,
  dontSee,
  exact,
  expectNoSidewaysScroll,
  expectTappable,
  foreground,
  hourNow,
  openTab,
  reload,
  screenText,
  scrollHomeToBottom,
  section,
  see,
  stats,
  tab,
} from "../harness/app";
import { db } from "../harness/db";

/**
 * Home — plan/02-home.md.
 *
 * The screen people open every day, and the only one that decides what is theirs to do today.
 * Every rule here was arrived at after a bug; the comments say which.
 */

test.describe("what belongs on the list", () => {
  test("HOME-32 · undated work is its own section, capped, and says how long it has waited", async ({ app }) => {
    const { page, api } = app;
    /*
     * Capture makes every task undated, and nothing ever ages one out - so this is the section
     * that grows for ever if nothing holds it. Seven of them, to prove the cap, plus one old
     * enough to be labelled.
     */
    for (let i = 1; i <= 7; i++) await api.task({ name: `Someday ${i}`, taskType: "reminder" });
    const old = await api.task({ name: "Ancient", taskType: "reminder" });
    db.createdAgo(old.id, "40 days");
    await api.task({ name: "Today one", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);

    // TO DO keeps what was planned for today; the undated pile is somewhere else.
    const todo = await section(page, "TO DO");
    expect(todo).toContain("Today one");
    expect(todo).not.toContain("Someday 1");

    // The header counts all eight even though only five rows draw.
    await see(page, /ANYTIME[\s\S]*8/);
    await see(page, "3 more in Scheduled");

    // And the old one says so, where a row used to print nothing at all under its title.
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME[\s\S]*Ancient[\s\S]*added 5 weeks ago/);
  });

  test("HOME-31 · overdue sits in its own section, capped, with the rest on Scheduled", async ({ app }) => {
    const { page, api } = app;
    /*
     * Five late, two for today. Mixed into one list the backlog buries the work - which is the
     * whole reason this section exists - so the checks are about separation and about the cap
     * holding, not about any one row.
     */
    for (let i = 1; i <= 5; i++) {
      const t = await api.task({ name: `Late ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
      db.scheduledFor(t.id, dateKey(-i));
    }
    await api.task({ name: "Today one", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.task({ name: "Today two", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);

    // TO DO means today again: the five late ones are not in it.
    const todo = await section(page, "TO DO");
    expect(todo).toContain("Today one");
    expect(todo).toContain("Today two");
    expect(todo).not.toContain("Late 1");

    // The header carries the true number even though only three rows are drawn.
    await see(page, /OVERDUE[\s\S]*5/);
    const overdue = await section(page, "OVERDUE");
    // Oldest first, so the longest-waiting is the one you see.
    expect(overdue).toContain("Late 5");
    expect(overdue).not.toContain("Late 1");
    await see(page, "2 more in Scheduled");

    // And the overflow goes where the bulk actions are.
    await control(page, /^See all 5 overdue tasks/).click();
    await see(page, /OVERDUE[\s\S]*MOVE ALL[\s\S]*CLEAR ALL/);
  });

  test("HOME-30 · an overdue row says how late it is, and says it in red", async ({ app }) => {
    const { page, api } = app;
    /*
     * Home keeps overdue work on purpose - a missed dated reminder has already gone silent, so
     * dropping it from Home too would lose it twice over. The row used to print only its clock
     * time, which is what a task due *today* prints, so nine days late and due in an hour were
     * indistinguishable on the one screen people actually look at.
     */
    const late = await api.task({ name: "Slipped", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(late.id, dateKey(-9));
    await api.task({ name: "Due now", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);

    await see(page, /Slipped[\s\S]*was due/);
    // The clock time gives way rather than being added to: the hour it would have buzzed at is
    // the least useful fact once the buzz has already not happened.
    // The kind sits between the title and the detail ("Slipped | Task · was due Sat, Nov 7"),
    // so this matches across it rather than pinning the exact wording of a different field.
    expect(await section(page, "OVERDUE")).toMatch(/Slipped \|[^|]*was due/);
    // And the one that is genuinely for today still reads as today, not as late.
    const todo = await section(page, "TO DO");
    expect(todo).toMatch(/Due now \|[^|]*today/);
    expect(todo).not.toMatch(/was due/);
  });

  test("HOME-01 · an empty account reads as empty, not broken", async ({ app }) => {
    const { page } = app;
    await see(page, "Nothing to do yet");
    await see(page, "GOALS");
    await expect(control(page, "Create a new goal")).toBeVisible();
    const text = await screenText(page);
    expect(text).not.toContain("| DONE |");
    expect(text).not.toContain("That’s everything");
    expect(text).not.toMatch(/of \d+ days/); // no goal cards
  });

  /**
   * TO DO is one section of four now, and it is empty far more often than the screen is: capture
   * makes every task undated, so the usual account has work under ANYTIME and nothing dated
   * today. "Nothing to do yet - tap Foyg below to capture something" printed directly above five
   * things to do told the person their captures had not counted. Every combination is walked
   * here because the words are chosen from three independent facts.
   */
  test("HOME-34 · TO DO's empty line never says there is nothing to do while other sections have work", async ({ app }) => {
    const { page, api } = app;
    const emptyLine = async () => {
      const text = await screenText(page);
      const at = text.indexOf("| TO DO | 0 |");
      expect(at, "TO DO should be drawn, and empty").toBeGreaterThanOrEqual(0);
      return text.slice(at);
    };

    // 1. Nothing anywhere: the screen really is empty, and may say so.
    await see(page, "Nothing to do yet | Tap Foyg below to capture something.");

    // 2. Only undated work.
    const loose = await api.task({ name: "Someday", taskType: "reminder" });
    await reload(page);
    await see(page, /ANYTIME \| 1 \|/);
    expect(await emptyLine()).toContain("Nothing planned for today | Your anytime tasks are below.");
    expect(await screenText(page)).not.toContain("Nothing to do yet");
    expect(await screenText(page)).not.toContain("capture something");

    // 3. Undated and late together.
    const late = await api.task({ name: "Slipped", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(late.id, dateKey(-2));
    await reload(page);
    await see(page, /OVERDUE \| 1 \|/);
    expect(await emptyLine()).toContain("Nothing planned for today | Overdue and anytime tasks are below.");

    // 4. Only late work.
    await api.remove(loose.id);
    await reload(page);
    await see(page, /OVERDUE \| 1 \|/);
    expect(await emptyLine()).toContain("Nothing planned for today | Your overdue tasks are below.");

    // 5. Something finished today, and late work still waiting: "left", not "planned".
    const done = await api.task({ name: "Finished", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.complete(done.id);
    await reload(page);
    await see(page, /DONE \| 1 \|/);
    expect(await emptyLine()).toContain("Nothing left for today | Your overdue tasks are below.");
    expect(await screenText(page)).not.toContain("All done for today");

    // 6. And once the late one is gone too, the day really is done.
    await api.remove(late.id);
    await reload(page);
    await see(page, "All done for today | Tap Foyg below to capture something.");
  });

  test("HOME-02 · an undated task is on Home under ANYTIME, and counted there", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Someday", taskType: "reminder" });
    await reload(page);
    await see(page, /ANYTIME \| 1 \|/);
    expect(await section(page, "ANYTIME")).toContain("Someday");
    // Not under TO DO, which is for work that was given today's date.
    const todo = await section(page, "TO DO");
    expect(todo).toMatch(/^0\b/);
    expect(todo).not.toContain("Someday");
  });

  test("HOME-03 · today's task is here; tomorrow's is on Scheduled instead", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "For today", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.task({ name: "For tomorrow", taskType: "reminder", scheduledFor: dateKey(1) });
    await reload(page);
    await see(page, "For today");
    expect(await screenText(page)).not.toContain("For tomorrow");

    await openTab(page, "Scheduled");
    await see(page, /UPCOMING[\s\S]*For tomorrow/);
  });

  /**
   * A missed dated reminder used to vanish from Home the moment it slipped — silent (a past
   * notification never re-fires) and out of sight on the one screen people check.
   */
  test("HOME-04 · a missed one-off stays on Home and is also listed as overdue", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Missed it", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(t.id, dateKey(-1));
    await reload(page);
    // On Home, but in its own section rather than mixed into today's work - see HOME-31.
    expect(await section(page, "OVERDUE")).toContain("Missed it");
    expect(await section(page, "TO DO")).not.toContain("Missed it");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");

    await openTab(page, "Scheduled");
    await see(page, /OVERDUE[\s\S]*Missed it/);
  });

  test("HOME-05 · a missed routine stays on Home and isn't double-listed as overdue", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Daily walk", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    db.scheduledFor(t.id, dateKey(-3));
    await reload(page);
    expect(await section(page, "TO DO")).toContain("Daily walk");

    await openTab(page, "Scheduled");
    await see(page, /RECURRING[\s\S]*Daily walk/);
    expect(await screenText(page)).not.toContain("OVERDUE");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled");
  });

  test("HOME-06 · the running task is lifted out of the list it was in", async ({ app }) => {
    const { page, api } = app;
    const running = await api.task({ name: "In progress" });
    await api.task({ name: "Waiting", taskType: "reminder" });
    await api.startSession(running.id, { plannedMinutes: 25 });
    await reload(page);
    await see(page, /IN SESSION[\s\S]*In progress/);
    // Both were captured without a day, so ANYTIME is the list it left.
    const anytime = await section(page, "ANYTIME");
    expect(anytime).not.toContain("In progress");
    expect(anytime).toMatch(/^1 \|/); // one fewer than there are pending tasks
  });
});

test.describe("what a row says", () => {
  test("HOME-07 · each kind of row shows its own wording and action", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Reading", 20);
    await api.task({ name: "A focus task" });
    await api.task({ name: "A reminder", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "23:30:00", daysBefore: 0 }] });
    await api.task({ name: "A plain task", taskType: "reminder", scheduledFor: dateKey(0) });
    await api.task({ name: "A goal task", taskType: "reminder", goalId: goal.id });
    await reload(page);

    await see(page, /A focus task \| Focus · 25 min/);
    await see(page, "A reminder | Reminder · 11:30 PM");
    await see(page, "A plain task | Task · today");
    await see(page, "A goal task | Goal · Reading");
    await expect(control(page, "Focus: A focus task")).toBeVisible();
    await expect(control(page, "Done: A reminder")).toBeVisible();
  });

  test("HOME-08 · a goal row keeps the action its type needs", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Fitness", 20);
    await api.task({ name: "Run", goalId: goal.id });
    await api.task({ name: "Stretch", taskType: "reminder", goalId: goal.id });
    await reload(page);
    await see(page, "Run | Goal · Fitness");
    await see(page, "Stretch | Goal · Fitness");
    await expect(control(page, "Focus: Run")).toBeVisible();
    await expect(control(page, "Done: Stretch")).toBeVisible();
  });

  /** The row's time means "you'll hear about this today". A warning that fired yesterday would be a lie there. */
  test("HOME-09 · a task whose only notification is a day early isn't a Reminder row", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Early warning", taskType: "reminder", scheduledFor: dateKey(1), notifications: [{ time: "09:00:00", daysBefore: 1 }] });
    const t = await api.task({ name: "Warned yesterday", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "09:00:00", daysBefore: 1 }] });
    await reload(page);
    await see(page, "Warned yesterday | Task · today");
    expect(await screenText(page)).not.toMatch(/Warned yesterday \| Reminder/);
    expect(t.id).toBeTruthy();
  });

  test("HOME-10 · an undated plain task shows no invented detail", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Bare", taskType: "reminder" });
    await reload(page);
    await see(page, "Bare | Task | +5 | Done");
    expect(await screenText(page)).not.toMatch(/Bare \| Task · /);
  });

  test("HOME-11 · a row's points are what finishing it will earn, and follow the default length", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Focus row" });
    await api.task({ name: "Reminder row", taskType: "reminder" });
    await reload(page);
    await see(page, "Focus row | Focus · 25 min | +25");
    await see(page, "Reminder row | Task | +5");

    await openTab(page, "Settings");
    try {
      await button(page, /Default focus duration/).click();
      await see(page, /Default focus duration \| 45 min/);
      await button(page, "Save preferences").click();
      await openTab(page, "Home");
      await see(page, "Focus row | Focus · 45 min | +45");
    } finally {
      // The account outlives this test; put the preference back.
      await openTab(page, "Settings");
      for (let i = 0; i < 6 && !/Default focus duration \| 25 min/.test(await screenText(page)); i++) {
        await button(page, /Default focus duration/).click();
      }
      if (await button(page, "Save preferences").isVisible()) await button(page, "Save preferences").click();
    }
  });

  /**
   * The age label first arrived as a replacement for the row's own line rather than an addition
   * to it. Capture makes every task undated, so that one swap took the session length off every
   * focus row, the goal's name off every goal row and the hour off every timed reminder - on the
   * rows that make up most of a real account. Each kind is checked old and new, on both screens,
   * because the two screens build this line separately.
   */
  test("HOME-33 · an undated row keeps what it said about itself, and adds its age to it", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Reading", 20);
    const focus = await api.task({ name: "Old focus" });
    const goalWork = await api.task({ name: "Old goal work", taskType: "reminder", goalId: goal.id });
    const timed = await api.task({ name: "Old timed", taskType: "reminder", notifications: [{ time: "23:30:00", daysBefore: 0 }] });
    db.createdAgo(focus.id, "10 days");
    db.createdAgo(goalWork.id, "22 days");
    db.createdAgo(timed.id, "40 days");
    // A fresh one of each wording that carries no age yet: its own line has to be there alone.
    await api.task({ name: "New focus" });
    await reload(page);

    const home = await section(page, "ANYTIME");
    expect(home).toContain("Old focus | Focus · 25 min · added 10 days ago | +25");
    expect(home).toContain("Old goal work | Goal · Reading · added 3 weeks ago | +5");
    expect(home).toContain("Old timed | Reminder · 11:30 PM · added 5 weeks ago | +5");
    expect(home).toContain("New focus | Focus · 25 min | +25");
    // The action follows the kind of work, not its age.
    await expect(control(page, "Focus: Old focus")).toBeVisible();
    await expect(control(page, "Done: Old timed")).toBeVisible();

    // Scheduled lists the same four, and has to describe them the same way.
    await openTab(page, "Scheduled");
    await see(page, /ANYTIME \| 4 \|/);
    const scheduled = await screenText(page);
    expect(scheduled).toContain("Old focus | Focus · 25 min · added 10 days ago |");
    expect(scheduled).toContain("Old goal work | Goal · Reading · added 3 weeks ago |");
    expect(scheduled).toContain("Old timed | Reminder · 11:30 PM · added 5 weeks ago |");
    expect(scheduled).toContain("New focus | Focus · 25 min |");
  });

  test("HOME-12 · a long name wraps instead of pushing the button off", async ({ app }) => {
    const { page, api } = app;
    const long = "Write the quarterly review for the team and make sure every section has numbers that the finance people will actually accept";
    const unbroken = "Supercalifragilisticexpialidocious".repeat(4);
    await api.task({ name: "Short", taskType: "reminder" });
    await api.task({ name: long, taskType: "reminder" });
    await api.task({ name: unbroken, taskType: "reminder" });
    await reload(page);
    await see(page, "Short");

    const ref = (await control(page, "Done: Short").boundingBox())!;
    for (const name of [long, unbroken]) {
      const box = (await control(page, `Done: ${name}`).boundingBox())!;
      expect(box.x + box.width, `${name.slice(0, 20)}…'s button is off screen`).toBeLessThanOrEqual(375);
      expect(Math.round(box.width)).toBe(Math.round(ref.width));
      expect(Math.round(box.height)).toBe(Math.round(ref.height));
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe("finishing, undoing, counting", () => {
  test("HOME-13 · finishing a reminder moves it, counts it and earns its points", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Pay the bill", taskType: "reminder" });
    await api.task({ name: "Something else", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);

    await control(page, "Done: Pay the bill").click();
    await see(page, "“Pay the bill” done");
    await expect(button(page, "Undo")).toBeVisible();
    await see(page, /DONE \| 1 \|/);
    expect(await section(page, "DONE")).toMatch(/Pay the bill \| Task · \d{1,2}:\d{2} [AP]M \| \+5/);
    // Both were captured without a day, so ANYTIME is the section it left and the one recounted.
    expect(await section(page, "ANYTIME")).not.toContain("Pay the bill");
    await see(page, /ANYTIME \| 1 \|/);
    await expect.poll(async () => (await stats(page)).points).toBe(before.points + 5);
    expect((await api.today()).pointsEarned).toBe(before.points + 5);
  });

  /** Points are the one thing undo reverses — streak and goal progress deliberately don't. */
  test("HOME-14 · undo puts the task back and takes the points back", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Changed my mind", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);

    await control(page, "Done: Changed my mind").click();
    await expect.poll(async () => (await stats(page)).points).toBe(before.points + 5);
    await button(page, "Undo").click();
    await see(page, "“Changed my mind” put back");
    await expect.poll(() => section(page, "ANYTIME")).toContain("Changed my mind");
    await dontSee(page, /\| DONE \|/);
    await expect.poll(async () => (await stats(page)).points).toBe(before.points);
    expect((await api.today()).pointsEarned).toBe(before.points);
  });

  test("HOME-15 · a completion that fails comes back with a reason", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Won't save", taskType: "reminder" });
    await reload(page);
    const before = await stats(page);
    // Reminders finish through /done (the same endpoint as the notification's button); focus tasks through /complete.
    await page.route(/\/api\/tasks\/[^/]+\/(complete|done)$/, (r) => r.fulfill({ status: 500, body: "{}" }));

    await control(page, "Done: Won't save").click();
    await see(page, "Couldn't complete “Won't save” - check your connection.");
    await expect.poll(() => section(page, "ANYTIME")).toContain("Won't save");
    expect(await screenText(page)).not.toContain("| DONE |");
    expect((await stats(page)).points).toBe(before.points);
    expect((await api.tasks("completed")).length).toBe(0);
  });

  test("HOME-16 · a double tap on Done completes once", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Tap tap", taskType: "reminder" });
    await reload(page);
    const done = control(page, "Done: Tap tap");
    await done.dblclick({ force: true }).catch(() => undefined);
    await see(page, /DONE \| 1 \|/);
    await page.waitForTimeout(1_000);
    expect((await api.tasks("completed")).length).toBe(1);
    expect((await api.today()).pointsEarned).toBe(5);
  });

  test("HOME-17 · DONE is today only, oldest first", async ({ app }) => {
    test.skip(hourNow() < 2, "needs two completion times earlier today");
    const { page, api } = app;
    const late = await api.task({ name: "Finished later", taskType: "reminder" });
    const early = await api.task({ name: "Finished earlier", taskType: "reminder" });
    const old = await api.task({ name: "Finished yesterday", taskType: "reminder" });
    for (const t of [late, early, old]) await api.complete(t.id);
    db.completedAt(late.id, { ago: "20 minutes" });
    db.completedAt(early.id, { ago: "80 minutes" });
    db.completedAt(old.id, { ago: "1 day" });
    await reload(page);

    const done = await section(page, "DONE");
    expect(done).not.toContain("Finished yesterday");
    expect(done.indexOf("Finished earlier")).toBeGreaterThanOrEqual(0);
    expect(done.indexOf("Finished earlier")).toBeLessThan(done.indexOf("Finished later"));
    expect(done).toMatch(/^2 \|/);
  });

  test("HOME-18 · a task that earned nothing shows no points pill", async ({ app }) => {
    const { page, api } = app;
    const focus = await api.task({ name: "Never ran a session" });
    const legacy = await api.task({ name: "Finished before points", taskType: "reminder" });
    await api.complete(focus.id);
    await api.complete(legacy.id);
    db.setPoints(legacy.id, null);
    await reload(page);
    const done = await section(page, "DONE");
    expect(done).toMatch(/^2 \|/);
    expect(done).toContain("Never ran a session");
    expect(done).toContain("Finished before points");
    // No pill at all — neither "+0" nor an empty one.
    expect(done).not.toContain("+");
  });
});

test.describe("sections, stats and the rest", () => {
  test("HOME-19 · a collapsed section hides its rows but not its count", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Still counted", taskType: "reminder", scheduledFor: dateKey(0) });
    const f = await api.task({ name: "Already done", taskType: "reminder" });
    await api.complete(f.id);
    await reload(page);
    await see(page, /TO DO \| 1 \| Collapse all \| ▾/);
    await see(page, /DONE \| 1 \| Hide \| ▴/);

    await control(page, "TO DO, 1 items, expanded").click();
    await see(page, /TO DO \| 1 \| Expand all/);
    expect(await section(page, "TO DO")).not.toContain("Still counted");
    // DONE is independent of TO DO.
    expect(await section(page, "DONE")).toContain("Already done");

    await button(page, "Hide").click();
    await see(page, /DONE \| 1 \| Show/);
    await dontSee(page, "Already done");

    await button(page, "Expand all").click();
    await see(page, "Still counted");
  });

  /**
   * The two capped sections fold too, and a folded one has to take its "N more in Scheduled"
   * line with it - a link to the rest of a list that is not showing reads as belonging to the
   * section above.
   */
  test("HOME-36 · ANYTIME and OVERDUE fold on their own, count kept, footer gone with the rows", async ({ app }) => {
    const { page, api } = app;
    for (let i = 1; i <= 7; i++) await api.task({ name: `Loose ${i}`, taskType: "reminder" });
    for (let i = 1; i <= 4; i++) {
      const t = await api.task({ name: `Late ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
      db.scheduledFor(t.id, dateKey(-i));
    }
    await reload(page);
    // Home only draws what is near the screen, so the bottom of ANYTIME is not there to be read
    // until the list has been scrolled to it. Once drawn, a row stays drawn.
    await scrollHomeToBottom(page);
    await see(page, /OVERDUE \| 4 \| Hide/);
    await see(page, /ANYTIME \| 7 \| Hide/);
    await see(page, "2 more in Scheduled");
    await see(page, "1 more in Scheduled");

    await control(page, "ANYTIME, 7 items, expanded").click();
    await see(page, /ANYTIME \| 7 \| Show/);
    const folded = await screenText(page);
    expect(folded).not.toContain("Loose 7");
    expect(folded).not.toContain("2 more in Scheduled");
    // Overdue did not move.
    expect(await section(page, "OVERDUE")).toContain("Late 4");
    await see(page, "1 more in Scheduled");

    await control(page, "OVERDUE, 4 items, expanded").click();
    await see(page, /OVERDUE \| 4 \| Show/);
    const both = await screenText(page);
    expect(both).not.toContain("Late 4");
    expect(both).not.toContain("more in Scheduled");

    await control(page, "ANYTIME, 7 items, collapsed").click();
    await see(page, "Loose 7");
    await see(page, "2 more in Scheduled");
  });

  test("HOME-20 · collapse state is forgotten on reload", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Folded", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);
    await control(page, "TO DO, 1 items, expanded").click();
    await dontSee(page, "Folded");
    await reload(page);
    await see(page, "Folded");
  });

  test("HOME-21 · the stat strip shows the server's figures, and a zero day shows zeros", async ({ app }) => {
    const { page, api } = app;
    expect(await stats(page)).toEqual({ streak: 0, points: 0, minutes: 0 });

    const t = await api.task({ name: "Counted", taskType: "reminder" });
    await api.complete(t.id);
    await reload(page);
    const [today, streak] = await Promise.all([api.today(), api.streak()]);
    expect(await stats(page)).toEqual({ streak: streak.currentStreak, points: today.pointsEarned, minutes: today.focusMinutes });
  });

  /** If these ever track each other exactly, the points rule has quietly reverted to focus-only. */
  test("HOME-22 · points and minutes are different figures", async ({ app }) => {
    const { page, api } = app;
    for (const name of ["Reminder one", "Reminder two"]) await api.complete((await api.task({ name, taskType: "reminder" })).id);
    const focus = await api.task({ name: "Ten minutes" });
    const session = await api.startSession(focus.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(session.id, "10 minutes 5 seconds");
    await api.completeSession(session.id, { wasInterrupted: true });
    await reload(page);
    expect(await stats(page)).toMatchObject({ points: 20, minutes: 10 });
  });

  /**
   * On a phone this is pull-to-refresh, which react-native-web doesn't render — that gesture is
   * device-only. What the web build does have is the foreground re-sync (useReminderSync), which
   * is the path that picks up another device's work without the user doing anything.
   */
  test("HOME-23 · work done on another device appears when you come back to the app", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Here already", taskType: "reminder" });
    await reload(page);
    await see(page, "Here already");
    await api.task({ name: "Added elsewhere", taskType: "reminder" });
    await page.waitForTimeout(500);
    expect(await screenText(page)).not.toContain("Added elsewhere");

    await foreground(page);
    await see(page, "Added elsewhere");
    await see(page, /ANYTIME \| 2 \|/);
  });

  test("HOME-24 · the closing line appears only when there's something to close", async ({ app }) => {
    const { page, api } = app;
    await see(page, "Nothing to do yet");
    expect(await screenText(page)).not.toContain("That’s everything");
    await api.task({ name: "One thing", taskType: "reminder" });
    await reload(page);
    await see(page, "That’s everything for today");
  });

  /**
   * "That's everything for today" directly under "4 more in Scheduled" is two lines disagreeing
   * with each other. The closing line waits until everything there is can be seen from here.
   */
  test("HOME-35 · the closing line stays away while a section is hiding rows", async ({ app }) => {
    const { page, api } = app;
    // Five undated: exactly the cap, so nothing is hidden and the line may close the list.
    const made = [];
    for (let i = 1; i <= 5; i++) made.push(await api.task({ name: `Loose ${i}`, taskType: "reminder" }));
    await reload(page);
    await see(page, /ANYTIME \| 5 \|/);
    await see(page, "That’s everything for today");
    expect(await screenText(page)).not.toContain("more in Scheduled");

    // A sixth is one more than Home draws.
    const sixth = await api.task({ name: "Loose 6", taskType: "reminder" });
    await reload(page);
    await see(page, "1 more in Scheduled");
    expect(await screenText(page)).not.toContain("That’s everything");

    // Overdue has its own, smaller cap, and hides rows just the same.
    await api.remove(sixth.id);
    for (let i = 1; i <= 4; i++) {
      const t = await api.task({ name: `Late ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
      db.scheduledFor(t.id, dateKey(-i));
    }
    await reload(page);
    await see(page, /OVERDUE \| 4 \|/);
    await see(page, "1 more in Scheduled");
    expect(await screenText(page)).not.toContain("That’s everything");
    expect(made).toHaveLength(5);
  });

  test("HOME-25 · the goals strip lays out for one, two and many", async ({ app }) => {
    const { page, api } = app;
    const cardBoxes = async () => {
      const cards = page.getByRole("button", { name: /, \d+ of \d+ days$/ }).locator("visible=true");
      const n = await cards.count();
      return Promise.all([...Array(n)].map((_, i) => cards.nth(i).boundingBox()));
    };

    await api.goal("Alpha", 20);
    await reload(page);
    const [one] = await cardBoxes();
    expect(one!.width).toBeGreaterThan(300);

    await api.goal("Beta", 20);
    await reload(page);
    const two = await cardBoxes();
    expect(two).toHaveLength(2);
    expect(Math.abs(two[0]!.width - two[1]!.width)).toBeLessThan(2);
    expect(two[0]!.width).toBeLessThan(200);

    await api.goal("Gamma", 20);
    await reload(page);
    const three = await cardBoxes();
    expect(three).toHaveLength(3);
    // The third peeks in from the right rather than being hidden or squeezed.
    expect(three[2]!.x).toBeLessThan(375);
    expect(three[2]!.x + three[2]!.width).toBeGreaterThan(375);
    await expectNoSidewaysScroll(page);

    await control(page, "Alpha, 0 of 20 days").click();
    await see(page, "Edit goal");
  });

  test("HOME-26 · the last row's button can't be covered by the docked capture button", async ({ app }) => {
    const { page, api } = app;
    // Dated today, so all twenty are drawn: TO DO is the one section with no cap.
    for (let i = 1; i <= 20; i++) {
      await api.task({ name: `Task ${String(i).padStart(2, "0")}`, taskType: "reminder", scheduledFor: dateKey(0) });
    }
    await reload(page);
    await see(page, /TO DO \| 20 \|/);
    await scrollHomeToBottom(page);

    const lastButton = page.getByRole("button", { name: /^Done: Task \d\d$/ }).locator("visible=true").last();
    const lastName = (await lastButton.getAttribute("aria-label"))!;
    await expectTappable(page, lastName);
  });

  /**
   * The capped sections end in a link rather than a row, and when ANYTIME is the last section
   * that link is the last thing on the screen - exactly where the docked capture button sits.
   * It is the only way from Home to the rest of the list, so it has to be reachable.
   */
  test("HOME-37 · the 'more in Scheduled' line at the very bottom can be tapped, and leads to the rest", async ({ app }) => {
    const { page, api } = app;
    for (let i = 1; i <= 8; i++) await api.task({ name: `Today ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
    for (let i = 1; i <= 9; i++) await api.task({ name: `Loose ${i}`, taskType: "reminder" });
    await reload(page);
    await see(page, /TO DO \| 8 \|/);
    // ANYTIME starts below the fold here, and Home only draws what is near the screen.
    await scrollHomeToBottom(page);
    await see(page, /ANYTIME \| 9 \|/);

    const link = "See all 9 undated tasks on Scheduled";
    await expectTappable(page, link);
    await control(page, link).click();
    // All nine are there, including the four Home had no room for.
    await see(page, /ANYTIME \| 9 \|/);
    const scheduled = await screenText(page);
    for (let i = 1; i <= 9; i++) expect(scheduled).toContain(`Loose ${i} |`);
  });

  test("HOME-27 · the avatar opens Settings and a row opens its task", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Open me", taskType: "reminder" });
    await reload(page);
    await control(page, "Account").click();
    await see(page, /Settings \| ACCOUNT \| Name/);
    await openTab(page, "Home");
    await exact(page, "Open me").click();
    await see(page, /^Open me \| Focus \| Reminder \| /);
  });

  /**
   * Only the device's clock moves here — the server keeps real time — so this asserts what the
   * phone decides on its own at midnight, which is exactly what `useTodayKey` exists for.
   */
  test("HOME-28 · midnight rolls the day over with the app open", async ({ app }) => {
    const { page, api } = app;
    const today = dateKey(0);
    await api.task({ name: "Due today", taskType: "reminder", scheduledFor: today });
    await api.complete((await api.task({ name: "Done today", taskType: "reminder" })).id);
    await deviceClockAt(page, today, "23:59");
    const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    await see(page, weekday(today));
    await see(page, "Done today");

    await page.clock.fastForward("02:00");
    await see(page, weekday(dateKey(1)));
    // Yesterday's finished work leaves DONE; yesterday's unfinished task stays, now overdue.
    await dontSee(page, "Done today");
    // Overdue now, so it moves out of TO DO and into its own section - see HOME-31.
    expect(await section(page, "OVERDUE")).toContain("Due today");
    await expect(tab(page, "Scheduled")).toHaveAccessibleName("Scheduled, 1 overdue");
  });

  test("HOME-29 · the greeting follows the time of day and the date reads day-first", async ({ app }) => {
    const { page } = app;
    const today = dateKey(0);
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const expected = `${date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${d} ${date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`;
    for (const [hhmm, greeting] of [["09:00", "Good morning"], ["14:00", "Good afternoon"], ["20:00", "Good evening"]] as const) {
      await deviceClockAt(page, today, hhmm);
      await see(page, new RegExp(`^${greeting}, `));
      await see(page, expected);
    }
  });
});
