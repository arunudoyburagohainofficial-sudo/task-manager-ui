import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { button, control, dontSee, exact, foreground, markClocked, reload, see, stats } from "../harness/app";
import { db } from "../harness/db";

/**
 * Focus Now — Home's slide-to-start card, and the throwaway tasks it makes.
 *
 * The card exists so that starting work costs one motion instead of a screen. That shortcut is
 * only safe because of what happens afterwards: a focus session has to belong to a task, so
 * sliding invents one, and an invented task that earns nothing must leave no trace.
 *
 * Every test here is about that bargain. The failure these guard against is not a broken button
 * — it is Home slowly filling with "Quick focus · 9:41" rows nobody asked for, which is exactly
 * what happened before the cleanup existed.
 */

/** Drags the slide-to-focus knob far enough to commit. */
async function slideToFocus(page: Page) {
  const track = control(page, /^Slide to focus/);
  const box = await track.boundingBox();
  if (!box) throw new Error("slide-to-focus track has no box");
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 25, box.y + box.height / 2, { steps: 18 });
  await page.mouse.up();
}

/** Opens the length/mode sheet from the card's summary chip. */
async function openOptions(page: Page) {
  await control(page, /^Session length and mode/).click();
  await see(page, /How long\?/);
}

const quickFocus = /Quick focus · /;

/**
 * Skips when backdating a session by `minutes` would put its start on yesterday.
 *
 * Auto-finish treats a session that crossed midnight as abandoned rather than finished - it is
 * the whole point of FOCUSNOW-36 and 37, because crediting it today would award minutes to the
 * wrong day and mark a streak day that can never be taken back. So a test about *crediting* a
 * stale session simply cannot also run in the small hours: both outcomes are correct, and which
 * one applies depends on the clock rather than on the code.
 *
 * Skipped rather than frozen, because these tests deliberately measure real elapsed time against
 * a real server.
 */
function skipIfBackdateCrossesMidnight(minutes: number) {
  test.skip(
    Date.now() - minutes * 60_000 < new Date().setHours(0, 0, 0, 0),
    `${minutes} minutes ago was yesterday, where auto-finish discards instead of crediting`
  );
}

test.describe("the Focus Now card", () => {
  test("FOCUSNOW-01 · Home offers a length and a slide, and nothing else", async ({ app }) => {
    const { page } = app;
    await see(page, /FOCUS NOW/);
    await see(page, /Slide to focus · 25 min/);
    // The picker lives in a sheet. Inline it was three chip rows deep and pushed Goals off the
    // screen, for something touched once a week.
    await dontSee(page, /How long\?/);
    await dontSee(page, /Pomodoro/);
    await dontSee(page, /rounds/);
  });

  test("FOCUSNOW-02 · the chip opens a sheet, and the pick becomes the new default", async ({ app }) => {
    const { page } = app;
    await openOptions(page);
    await exact(page, "50 min").click();
    await see(page, /Slide to focus · 50 min/);

    // Persisted, not just held for this render — the point of the chip is that most days you
    // never open it.
    await reload(page);
    await see(page, /Slide to focus · 50 min/);
    await see(page, /50 min · Regular/);
  });

  test("FOCUSNOW-03 · rounds appear only for Pomodoro, and the total is the whole sitting", async ({ app }) => {
    const { page } = app;
    await openOptions(page);
    await dontSee(page, /3 rounds/);

    await exact(page, "Pomodoro").click();
    await see(page, /3 rounds/);
    // A three-round sitting is 75 minutes, not 25. Naming one block would understate it by an
    // hour, which is the number the user is actually committing to.
    await see(page, /75 min of focus/);
    await see(page, /Slide to focus · 75 min/);
    await see(page, /3 × 25 min · Pomodoro/);
  });

  test("FOCUSNOW-04 · sliding starts a session on a task it makes for the purpose", async ({ app }) => {
    const { page, api } = app;
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);

    await slideToFocus(page);
    await see(page, /End Session/);

    const session = await api.currentSession();
    expect(session).not.toBeNull();
    const task = (await api.tasks("pending")).find((t) => t.id === session!.taskId);
    // Named by the clock rather than left blank: a list of "Untitled" tells you nothing a week
    // later, and this one can outlive the session when it earns something.
    expect(task?.name).toMatch(quickFocus);
  });

  test("FOCUSNOW-05 · discarding leaves no task behind", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    await button(page, /Discard session/).click();
    await see(page, /Discard this session\?/);
    await button(page, /^Discard$/).click();
    await see(page, /FOCUS NOW/);

    // Nothing was credited, so nothing should remain. An undated task never ages off Home —
    // bucketFor reads a null date as "today" — so a stray one would sit there for good.
    await dontSee(page, quickFocus);
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
    expect(await api.currentSession()).toBeNull();
  });

  test("FOCUSNOW-06 · ending inside a minute is a discard, not a zero-point entry", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    await button(page, /End Session/).click();
    await see(page, /End this session early\?/);
    await control(page, "End").click();

    // Under a minute credits nothing, so completing it would put a "+0" row in DONE for work
    // that never happened.
    await see(page, /Too short to count/);
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
    expect((await api.tasks("completed")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
  });

  test("FOCUSNOW-07 · a real sitting finishes into DONE, without being asked", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    // Back-dated on the server so the session has genuinely earned its minutes.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "12 minutes 10 seconds");

    await button(page, /End Session/).click();
    await see(page, /End this session early\?/);
    await control(page, "End").click();

    // No "is it done, or will you come back to it?" — the task exists only because a session
    // needs one, so the question is about nothing.
    await dontSee(page, /Keep task open/);
    await see(page, /Task complete/);

    const completed = (await api.tasks("completed")).filter((t) => quickFocus.test(t.name));
    expect(completed).toHaveLength(1);
    // Completion is what makes it go away tomorrow: Home shows DONE only for today.
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
  });

  test("FOCUSNOW-08 · a session nobody ended closes itself once it can earn no more", async ({ app }) => {
    skipIfBackdateCrossesMidnight(5 * 60);
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    // Walk away without ending it, then come back much later. The server credits at most
    // planned + 5 minutes, so past that the session is only in the way: it holds the one
    // session slot and keeps the task on Home.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");

    await reload(page);

    await see(page, /FOCUS NOW/);
    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
    // It earned real time, so the task completes rather than lingering as something still to do.
    expect((await api.tasks("completed")).filter((t) => quickFocus.test(t.name))).toHaveLength(1);
  });

  test("FOCUSNOW-09 · the card becomes the running session's timer", async ({ app }) => {
    const { page } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    await reload(page);
    // One card, two states: the thing you start and the thing you watch share a spot, so Home
    // never grows a second block while something runs.
    await see(page, /IN SESSION/);
    await see(page, quickFocus);
    await dontSee(page, /Slide to focus/);
  });
});

test.describe("starting from a task row", () => {
  test("FOCUSNOW-10 · a row's Focus button starts the session rather than opening the task", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Write the brief", taskType: "focus" });
    await reload(page);
    await see(page, "Write the brief");

    await control(page, "Focus: Write the brief").click();

    // Task Detail used to sit in between, asking you to press Start on settings you never
    // changed — the length is already yours, from Settings.
    await see(page, /End Session/);
    await dontSee(page, /Start \d+ min session/);
    expect((await api.currentSession())?.taskId).toBeTruthy();
  });

  test("FOCUSNOW-11 · tapping the row itself still opens the task", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Read the spec", taskType: "focus" });
    await reload(page);

    await exact(page, "Read the spec").click();
    await see(page, /SESSION/);
    await see(page, /Start \d+ min session/);
  });
});

test.describe("picking a notification time", () => {
  test("FOCUSNOW-12 · adding a notification opens its time editor in the same tap", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Call the dentist", taskType: "reminder" });
    await reload(page);
    await exact(page, "Call the dentist").click();

    await control(page, "Add scheduled").click();
    await see(page, /WHEN/);
    await exact(page, "Today").click();

    // Picking a time used to take three taps — add, then the bare clock text, which nothing
    // marked as tappable — and people reported the time as missing rather than hidden.
    await page.getByText("Notify me", { exact: true }).locator("visible=true").last().click();
    await see(page, /Morning/);
    await see(page, /Done/);
  });
});

test.describe("a quick focus left unfinished", () => {
  test("FOCUSNOW-13 · it never reaches Overdue, because it never had a date", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    const task = (await api.tasks("pending")).find((t) => t.id === session.taskId)!;
    // No date is the whole reason it cannot go overdue: bucketFor only calls a task overdue
    // when its date is behind today, and this one has none to fall behind.
    expect(task.scheduledFor).toBeFalsy();
  });

  test("FOCUSNOW-14 · starting something else resumes the session rather than refusing", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);
    const running = (await api.currentSession())!;

    // Only one session may be open at a time, enforced by a unique index rather than a check
    // the client can lose a race with. The answer to that collision is never an error: the app
    // fetches the session that exists and opens it, so the user lands somewhere useful.
    await api.task({ name: "Something else", taskType: "focus" });
    await reload(page);
    await control(page, "Focus: Something else").click();

    await see(page, /End Session/);
    // Still the original session — a second one was not created behind the user's back.
    expect((await api.currentSession())?.id).toBe(running.id);
  });
});

test.describe("Pomodoro gets the same treatment", () => {
  test("FOCUSNOW-15 · a live Pomodoro sitting is not closed out from under the user", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Pomodoro").click();
    await see(page, /Slide to focus · 75 min/);
    await slideToFocus(page);
    await see(page, /End Session/);

    /*
     * 82 minutes in. A 3 x 25 sitting stores plannedMinutes as 75 — work only — but runs 85
     * minutes of real time once its two five-minute breaks are counted, so at 82 the user is
     * still in the final round. Closing at planned + 5 would have ended it here.
     */
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "82 minutes");
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-16 · an abandoned Pomodoro still gets closed eventually", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Pomodoro").click();
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");
    await reload(page);

    await see(page, /FOCUS NOW/);
    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
  });
});

test.describe("pausing", () => {
  test("FOCUSNOW-17 · a paused session survives a long break", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    await button(page, /Pause/).click();
    await see(page, /Resume/);

    /*
     * An hour and a half later, still paused. Pausing never reaches the server — there is no
     * endpoint for it — so from the server's side this looks identical to a session someone
     * walked away from. Closing it here would punish the one person who was explicit about
     * wanting it kept.
     */
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "90 minutes");
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-18 · a pause left overnight is not a pause anyone is coming back to", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);
    await button(page, /Pause/).click();
    await see(page, /Resume/);

    // Past the hard ceiling nothing can be credited whatever the user meant, so the backstop
    // applies even to a paused session — otherwise one pause holds the slot for good.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "9 hours");
    await reload(page);

    await see(page, /FOCUS NOW/);
    expect(await api.currentSession()).toBeNull();
  });
});

/* ───────────────────────── where the line sits ───────────────────────── */

test.describe("the boundary auto-finish draws", () => {
  test("FOCUSNOW-19 · a session one minute inside the line is left running", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    // A 25-minute session can still earn until minute 30. At 29 it is simply a session
    // running slightly over, which is the ordinary case, not an abandoned one.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "29 minutes");
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-20 · a session past the line is closed", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "31 minutes");
    await reload(page);

    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });

  test("FOCUSNOW-21 · a session that just started is never touched", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });
});

/* ──────────────── ordinary tasks follow different rules ──────────────── */

test.describe("a real task, not a quick focus", () => {
  test("FOCUSNOW-22 · its abandoned session closes, but the task stays to be done", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Write the report", taskType: "focus" });
    await reload(page);
    await control(page, "Focus: Write the report").click();
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");
    await reload(page);
    await dontSee(page, /IN SESSION/);

    // The session is freed — it was holding the only slot — but the task is a real piece of
    // work the user still intends to do. Completing it would claim they had finished it.
    expect(await api.currentSession()).toBeNull();
    const pending = await api.tasks("pending");
    expect(pending.map((t) => t.name)).toContain("Write the report");
    await see(page, "Write the report");
  });

  test("FOCUSNOW-23 · discarding its session leaves the task alone", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Read the spec", taskType: "focus" });
    await reload(page);
    await control(page, "Focus: Read the spec").click();
    await see(page, /End Session/);

    await button(page, /Discard session/).click();
    await see(page, /Discard this session\?/);
    await button(page, /^Discard$/).click();
    await see(page, /FOCUS NOW/);

    // Only a task invented to carry a session is deleted with it. This one the user typed.
    expect((await api.tasks("pending")).map((t) => t.name)).toContain("Read the spec");
  });
});

/* ───────────────── the time is credited, not thrown away ───────────────── */

test.describe("what auto-finish credits", () => {
  test("FOCUSNOW-24 · it banks the capped time rather than losing the work", async ({ app }) => {
    skipIfBackdateCrossesMidnight(5 * 60);
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");
    await reload(page);
    await see(page, /FOCUS NOW/);

    // Five hours elapsed, but a 25-minute plan only ever earns 25. The point of closing the
    // session is to stop it loitering, not to erase what it was worth — and the figure must be
    // the plan, not the wall clock, or a weekend-long session would credit days.
    //
    // Polled, not read once: closing the session and crediting it are two round trips, and the
    // card reappears after the first. Reading straight away caught the strip still on zero.
    await expect.poll(async () => (await stats(page)).minutes, { timeout: 20_000 }).toBe(25);
    expect((await stats(page)).points).toBe(25);
  });

  test("FOCUSNOW-25 · closing happens once, not on every look at the screen", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");
    await reload(page);
    await see(page, /FOCUS NOW/);
    const first = await stats(page);

    // Looking again must not credit again. The guard is per session id, so a refetch that
    // hands back the same session cannot start a loop of completions.
    await reload(page);
    await reload(page);
    const after = await stats(page);
    expect(after.minutes).toBe(first.minutes);
    expect(after.points).toBe(first.points);
  });
});

/* ──────────────────────── the pause mark itself ──────────────────────── */

test.describe("the pause mark", () => {
  test("FOCUSNOW-26 · resuming gives up the protection again", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    await button(page, /Pause/).click();
    await see(page, /Resume/);
    await button(page, /Resume/).click();
    await see(page, /Pause/);

    // Back to running, so the mark must be gone. If pausing once protected a session for
    // good, every session anyone ever paused would hold the slot forever.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "90 minutes");
    await reload(page);

    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });

  test("FOCUSNOW-27 · a mark from an old session cannot shield the next one", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);
    await button(page, /Pause/).click();
    await see(page, /Resume/);

    // Discard while still paused, so the mark is written against a session that no longer
    // exists. Stored as a bare flag rather than a session id, it would silently protect
    // whatever came next.
    await button(page, /Discard session/).click();
    await see(page, /Discard this session\?/);
    await button(page, /^Discard$/).click();
    await see(page, /FOCUS NOW/);

    await slideToFocus(page);
    await see(page, /End Session/);
    const second = (await api.currentSession())!;
    db.sessionStartedAgo(second.id, "5 hours");
    await reload(page);

    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });
});

/* ──────────────────────── Pomodoro, at the edges ──────────────────────── */

test.describe("Pomodoro boundaries", () => {
  test("FOCUSNOW-28 · still alive just inside its longer allowance", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Pomodoro").click();
    await see(page, /Slide to focus · 75 min/);
    await slideToFocus(page);
    await see(page, /End Session/);

    // 75 planned + six rounds' worth of break allowance + grace. At 104 it is inside that,
    // and the user may well still be sitting in a break between rounds.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "104 minutes");
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-29 · closed once past it", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Pomodoro").click();
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "115 minutes");
    await reload(page);

    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });
});

/* ─────────────────── walking away with the app still open ─────────────────── */

test.describe("stepping away mid-session", () => {
  test("FOCUSNOW-30 · a regular session finishes itself when its time runs out", async ({ app }) => {
    const { page, api } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);

    await slideToFocus(page);
    await see(page, /End Session/);
    const session = (await api.currentSession())!;

    // Nobody touches the phone for half an hour. The screen owns its own clock, so the
    // session ends on time rather than waiting for Home's cleanup to notice much later.
    db.sessionStartedAgo(session.id, "26 minutes");
    await page.clock.fastForward(26 * 60_000);

    await see(page, /Task complete/);
    expect(await api.currentSession()).toBeNull();
    expect((await api.tasks("completed")).filter((t) => quickFocus.test(t.name))).toHaveLength(1);
  });

  test("FOCUSNOW-31 · a Pomodoro abandoned on a break is still cleaned up", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Pomodoro").click();
    await slideToFocus(page);
    await see(page, /End Session/);

    /*
     * A break deliberately waits at zero rather than starting the next round on its own, so
     * walking away during one leaves the session open with nothing counting down. The screen
     * will never end it. Home's cleanup is the only thing that will, which is exactly the
     * case it exists for.
     */
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "5 hours");
    await reload(page);

    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });
});

/* ───────────────── pausing, round by round, through a Pomodoro ───────────────── */

test.describe("pause across a Pomodoro's phases", () => {
  /** Starts a 3-round Pomodoro quick focus and hands back its session. */
  async function startPomodoro(app: { page: Page; api: import("../harness/api").Api }) {
    await openOptions(app.page);
    await exact(app.page, "Pomodoro").click();
    await see(app.page, /Slide to focus · 75 min/);
    await slideToFocus(app.page);
    await see(app.page, /End Session/);
    return (await app.api.currentSession())!;
  }

  test("FOCUSNOW-32 · pausing inside the first round shields the session", async ({ app }) => {
    const { page, api } = app;
    const session = await startPomodoro(app);

    await button(page, /Pause/).click();
    await see(page, /Resume/);

    db.sessionStartedAgo(session.id, "150 minutes");
    await reload(page);

    // Past the Pomodoro allowance, but paused on purpose — the user is coming back to it.
    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-33 · the break starts on its own, the next round does not", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await startPomodoro(app);

    // The first round ending rolls straight into the break, with nothing to tap.
    await page.clock.fastForward(26 * 60_000);
    await see(page, /Break time/);
    await see(page, /Start Cycle 2/);

    /*
     * The break running out does NOT begin round two. It waits. That is deliberate — a round
     * that starts while you are still away from your desk is a round you did not do — but it
     * is also why a Pomodoro can sit open forever with nothing counting down, which is the
     * case Home's cleanup exists for.
     */
    await page.clock.fastForward(6 * 60_000);
    await see(page, /Start Cycle 2/);
    // And there is no way to pause a break: the only controls are to go on, or to stop.
    await dontSee(page, /❙❙ Pause/);
  });

  test("FOCUSNOW-34 · pausing inside the second round shields it just the same", async ({ app }) => {
    const { page, api } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    const session = await startPomodoro(app);

    await page.clock.fastForward(26 * 60_000);
    await see(page, /Start Cycle 2/);
    await button(page, /Start Cycle 2/).click();
    await see(page, /End Session/);

    await button(page, /Pause/).click();
    await see(page, /Resume/);

    db.sessionStartedAgo(session.id, "150 minutes");
    await reload(page);

    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  test("FOCUSNOW-35 · a pause survives reopening, and resuming gives up the shield", async ({ app }) => {
    const { page, api } = app;
    // Said out loud rather than assumed: the length and mode are remembered on the device, and
    // the Pomodoro tests above this one leave them set. A 75-minute plan would push the stale
    // threshold past the 90 minutes below, and the test would pass without proving anything.
    await openOptions(page);
    await exact(page, "Regular").click();
    await exact(page, "25 min").click();
    await see(page, /Slide to focus · 25 min/);
    await slideToFocus(page);
    await see(page, /End Session/);
    const session = (await api.currentSession())!;

    await button(page, /Pause/).click();
    await see(page, /Resume/);

    /*
     * This used to assert the opposite, and the opposite was a bug.
     *
     * The screen always reopened *running*, so a pause could not survive closing the app - and
     * because of that, the pause mark had to be thrown away on reopen or a visibly counting
     * session would stay shielded from cleanup for hours. The session screen now restores the
     * position it wrote, so a paused session comes back paused, and the mark is right to stay.
     */
    await reload(page);
    await see(page, /IN SESSION \| [^|]+ \| 25:00 \| paused/);
    await control(page, /^Open session/).click();
    await see(page, /▶ Resume/);

    // Still protected, because it is still genuinely paused.
    db.sessionStartedAgo(session.id, "90 minutes");
    await reload(page);
    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();

    // Resuming gives the protection up: from here it is an ordinary running session again.
    await control(page, /^Open session/).click();
    await button(page, /Resume/).click();
    await see(page, /❙❙ Pause/);
    await reload(page);
    await dontSee(page, /IN SESSION/);
    expect(await api.currentSession()).toBeNull();
  });
});

/* ─────────────── a session that outlived the day it was started ─────────────── */

test.describe("crossing midnight", () => {
  test("FOCUSNOW-36 · yesterday's forgotten session credits nothing to today", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    /*
     * Started yesterday, closed when the app is next opened. Minutes, points and the streak
     * are all recorded against the day a session is *completed*, so crediting this would
     * award half an hour and a streak day for work nobody did today — and the streak is
     * never reversed, so it could not be undone.
     */
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "26 hours");
    await reload(page);
    await see(page, /FOCUS NOW/);

    expect(await api.currentSession()).toBeNull();
    const { minutes, points, streak } = await stats(page);
    expect(minutes).toBe(0);
    expect(points).toBe(0);
    expect(streak).toBe(0);
  });

  test("FOCUSNOW-37 · and its throwaway task goes with it", async ({ app }) => {
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "26 hours");
    await reload(page);
    await see(page, /FOCUS NOW/);

    // Nothing was credited, so there is nothing for the task to show for itself — it is
    // deleted, exactly as a discard would, rather than filed under DONE.
    await dontSee(page, quickFocus);
    expect((await api.tasks("pending")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
    expect((await api.tasks("completed")).filter((t) => quickFocus.test(t.name))).toHaveLength(0);
  });

  test("FOCUSNOW-38 · a stale session from today still earns its capped time", async ({ app }) => {
    skipIfBackdateCrossesMidnight(45);
    const { page, api } = app;
    await slideToFocus(page);
    await see(page, /End Session/);

    // Same day, just long abandoned. This one genuinely was worked on today, so the cap is
    // paid rather than withheld — the midnight rule must not swallow ordinary overruns.
    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "45 minutes");
    await reload(page);
    await see(page, /FOCUS NOW/);

    await expect.poll(async () => (await stats(page)).minutes, { timeout: 20_000 }).toBe(25);
  });
});

/**
 * A Pomodoro picked back up as the sitting it actually is.
 *
 * `plannedMinutes` counts work and excludes breaks, so a 2 x 15 is stored as 30 and nothing on
 * the row distinguishes it from one unbroken half hour. The split used to be written only at
 * completion, which left every reader of a *running* session guessing, and all three guesses
 * were wrong at once:
 *
 *   - Home worked its clock out as startedAt + 30, the whole sitting, while the session screen
 *     counted the current block. Two clocks for one session, never in agreement.
 *   - Reopening divided the total by an assumed 25-minute block, so 15 became 25.
 *   - And `round(30 / 25)` is 1, so two rounds became one.
 *
 * A refresh therefore converted a 15-15 into a single fresh 25. The count is recorded at the
 * start now, and where the user is inside the sitting is written to the device as it happens,
 * because a break waits at zero until it is tapped and so cannot be derived from the clock.
 */
test.describe("a Pomodoro survives a refresh as itself", () => {
  /** Starts a 2 x 15 quick focus: the sitting from the bug report. */
  async function start15by15(app: { page: Page; api: import("../harness/api").Api }) {
    await openOptions(app.page);
    await exact(app.page, "15 min").click();
    await exact(app.page, "Pomodoro").click();
    await exact(app.page, "2 rounds").click();
    await see(app.page, /Slide to focus · 30 min/);
    await slideToFocus(app.page);
    await see(app.page, /End Session/);
    return (await app.api.currentSession())!;
  }

  test("FOCUSNOW-39 · starting one records how it was split", async ({ app }) => {
    const session = await start15by15(app);
    // 30 on its own cannot be told apart from one unbroken half hour; the 2 is what makes
    // the 15-minute block recoverable.
    expect(session.plannedMinutes).toBe(30);
    expect(session.numPomodoroCycles).toBe(2);
    expect(session.focusMode).toBe("pomodoro");
  });

  test("FOCUSNOW-40 · reopening keeps the block length and the round count", async ({ app }) => {
    const { page } = app;
    await start15by15(app);

    await reload(page);
    await control(page, "Open session").click();
    await see(page, /End Session/);

    // The reported bug: a 15-minute round came back as 25, and two rounds came back as one.
    await see(page, /Cycle 1 of 2/);
    await see(page, /1[45]:\d\d/);
    await dontSee(page, /2[45]:\d\d/);
  });

  test("FOCUSNOW-41 · reopening continues the round rather than restarting it", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    await page.clock.fastForward(5 * 60_000);
    await see(page, /10:00/);

    // Leaving and coming back used to hand back a full fresh block. A few real seconds pass
    // while the page navigates, so the figure is "still about ten minutes", not an exact one.
    await page.goto("/");
    await see(page, /IN SESSION/);
    await control(page, "Open session").click();
    await see(page, /\| (10:00|9:\d\d) \|/);
    // Anchored between separators: a quick focus is named after the clock it started at, so a
    // bare time pattern matches the task's own title and proves nothing.
    await dontSee(page, /\| 1[2-5]:\d\d \|/);
  });

  test("FOCUSNOW-42 · Home's clock and the session's clock are the same clock", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    await page.clock.fastForward(3 * 60_000);
    await see(page, /1[12]:\d\d/);

    /*
     * Home showed 28:28 against the session screen's 24:57 in the report. Both numbers were
     * computed honestly from different things, which is exactly why it was hard to see.
     */
    await page.goto("/");
    await see(page, /IN SESSION \| Quick focus · [^|]+ \| Round 1 of 2 \| 1[12]:\d\d \| left/);
    await dontSee(page, /2[0-9]:\d\d/);
  });

  test("FOCUSNOW-43 · a break is where you left it, on both screens", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    // Round one runs out and rolls into the break with nothing to tap.
    await page.clock.fastForward(16 * 60_000);
    await see(page, /Break time/);
    await see(page, /Start Cycle 2/);

    // Home says so, rather than counting down a block nobody is working.
    await page.goto("/");
    await see(page, /Round 1 of 2 · on a break/);
    await see(page, /break left/);

    // And going back in resumes the break, not a fresh round one.
    await control(page, "Open session").click();
    await see(page, /Start Cycle 2/);
    await dontSee(page, /1[45]:\d\d/);
  });

  test("FOCUSNOW-44 · a pause holds its time across a refresh", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    await page.clock.fastForward(5 * 60_000);
    await button(page, /Pause/).click();
    await see(page, /Resume/);

    // Wall-clock time passes, but a pause means it does not count.
    await page.clock.fastForward(20 * 60_000);
    await reload(page);
    await see(page, /IN SESSION/);
    await see(page, /paused/);
    await control(page, "Open session").click();
    await see(page, /10:00/);
    await see(page, /Resume/);
  });

  /**
   * The trap in the fix above. Auto-finish allows extra time for breaks, and before the split
   * was recorded it assumed six rounds' worth. Using the real count and nothing else would have
   * *tightened* that: a 2 x 15 would drop from roughly 65 minutes of grace to 45, and anyone who
   * took a long break would come back to a closed session. The real count may only buy more
   * room, never less.
   */
  test("FOCUSNOW-45 · knowing the real round count never shortens the leash", async ({ app }) => {
    const { page, api } = app;
    const session = await start15by15(app);

    // 30 planned + 10 minutes of real breaks + 5 grace would be 45. Still running at 60 proves
    // the floor held.
    db.sessionStartedAgo(session.id, "60 minutes");
    await reload(page);
    await see(page, /IN SESSION/);
    expect(await api.currentSession()).not.toBeNull();
  });

  /**
   * The card used to carry two icon buttons. One was an expand mark, which duplicated what
   * tapping the card should obviously do; the other was a stop, which offered the one decision
   * that should not be a single tap on a screen that cannot show what the session is worth.
   * The card itself is the only control now, and ending belongs where the credit and the
   * confirmation are.
   */
  test("FOCUSNOW-46 · the whole card opens the session, and nothing on it can end one", async ({ app }) => {
    const { page } = app;
    await start15by15(app);
    await page.goto("/");

    await expect(control(page, "Open session")).toBeVisible();
    // Nothing on Home ends or pauses a session - under either spelling the button ever had.
    for (const label of ["End session", "End", "Pause session"]) {
      await expect(page.getByLabel(label, { exact: true }).locator("visible=true")).toHaveCount(0);
    }

    await control(page, "Open session").click();
    await see(page, /End Session/);
    // Pausing and ending both live on the session screen, where there is a real one to have.
    await see(page, /Pause/);
  });

  /**
   * What happens on Home when the clock runs out.
   *
   * The session screen owns the timer, so with it unmounted nothing closed a block that reached
   * zero: the card sat at 00:00 and only auto-finish tidied it up, five minutes later. The card
   * now offers the one action that moves the sitting on.
   */
  test("FOCUSNOW-48 · a regular block that runs out offers Done, and finishing hands back the slider", async ({ app }) => {
    const { page, api } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await openOptions(page);
    await exact(page, "Regular").click();
    await exact(page, "25 min").click();
    await see(page, /Slide to focus · 25 min/);
    await slideToFocus(page);
    await see(page, /End Session/);

    await page.goto("/");
    await see(page, /IN SESSION/);
    // Past the block but inside the five-minute grace, so auto-finish is not what closes this.
    await page.clock.fastForward(26 * 60_000);
    await see(page, /00:00/);
    await expect(control(page, "Done")).toBeVisible();

    /*
     * The page clock moves the countdown; it does not move the server, which credits real
     * elapsed time from started_at. Without this the sitting would be worth zero minutes and
     * the assertion below would be measuring the fake clock rather than the credit.
     */
    /*
     * A minute past the plan, not exactly on it. Credit is min(elapsed, planned) now that the
     * five-minute grace is gone, and elapsed is floored to whole minutes - so back-dating by
     * exactly 25 lands on 24 whenever the two clocks disagree by a fraction of a second. The
     * cap is what this asserts, and anything past it proves the cap just as well.
     */
    db.sessionStartedAgo((await api.currentSession())!.id, "26 minutes");

    await control(page, "Done").click();
    // Back to the slider, which is the whole point of clearing a finished sitting off Home.
    await see(page, /Slide to focus/, 20_000);
    expect(await api.currentSession()).toBeNull();
    await expect.poll(async () => (await stats(page)).minutes, { timeout: 20_000 }).toBe(25);
  });

  test("FOCUSNOW-49 · a Pomodoro block that runs out offers the next round, not Done", async ({ app }) => {
    const { page } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    await page.goto("/");
    await see(page, /Round 1 of 2/);
    await page.clock.fastForward(16 * 60_000);
    await see(page, /00:00/);

    // Not Done: there is still a round to run, and offering to finish here would quietly
    // throw the second half of the sitting away.
    await expect(control(page, "Start next cycle")).toBeVisible();
    await expect(page.getByLabel("Done", { exact: true }).locator("visible=true")).toHaveCount(0);

    await control(page, "Start next cycle").click();
    await see(page, /Round 2 of 2/);
    await see(page, /1[45]:\d\d \| left/);
  });

  test("FOCUSNOW-50 · the last round offers Done, and it credits the whole sitting", async ({ app }) => {
    const { page, api } = app;
    markClocked(page);
    await page.clock.install({ time: new Date() });
    await reload(page);
    await start15by15(app);

    await page.goto("/");
    // Waited for, not assumed: until the stored position has been read the card counts the
    // whole sitting rather than the current block, so 16 minutes would not be zero yet.
    await see(page, /Round 1 of 2/);
    await page.clock.fastForward(16 * 60_000);
    await control(page, "Start next cycle").click();
    await see(page, /Round 2 of 2/);

    await page.clock.fastForward(16 * 60_000);
    await see(page, /00:00/);
    await expect(control(page, "Done")).toBeVisible();
    await expect(page.getByLabel("Start next cycle", { exact: true }).locator("visible=true")).toHaveCount(0);

    // As in FOCUSNOW-48: the server credits real time, which the page clock never moved.
    // A minute past the plan, for the same reason as FOCUSNOW-48.
    db.sessionStartedAgo((await api.currentSession())!.id, "31 minutes");

    await control(page, "Done").click();
    await see(page, /Slide to focus/, 20_000);
    expect(await api.currentSession()).toBeNull();
    // 2 x 15 of work, capped at planned + grace - the breaks were skipped, so it is the plan.
    await expect.poll(async () => (await stats(page)).minutes, { timeout: 20_000 }).toBe(30);
  });

  /**
   * The two screens read one clock, so they cannot disagree.
   *
   * Reported from a real phone: the session screen read 24:40, paused, while Home read 24:25
   * and falling. Each screen had read the position once and then kept its own copy, and the
   * position only ever changes while the session screen - which sits on top of Home - is
   * mounted, so every change happened behind Home's back.
   *
   * There is one value now, and Home subscribes to it. That is what this asserts, and it can
   * assert it without navigating: on web every mounted screen keeps its DOM, so Home is still
   * there behind the session screen and can be read directly. If the two were still keeping
   * copies, Home's would carry on counting while the one in front stood still.
   */
  test("FOCUSNOW-51 · pausing on the session screen stops Home's clock in the same moment", async ({ app }) => {
    const { page } = app;
    await openOptions(page);
    await exact(page, "Regular").click();
    await exact(page, "25 min").click();
    await see(page, /Slide to focus · 25 min/);
    await slideToFocus(page);
    await see(page, /End Session/);

    /** Home's card, read from behind the session screen rather than through the front screen. */
    const homeCard = () =>
      page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("*")).find(
          (e) => e.children.length === 0 && e.textContent?.trim() === "IN SESSION"
        );
        return (label?.closest('[role="button"]') as HTMLElement | null)?.innerText.replace(/\s+/g, " ") ?? null;
      });

    await expect.poll(homeCard, { message: "Home's card never rendered behind the session" }).toMatch(/IN SESSION/);
    expect(await homeCard()).not.toMatch(/paused/);

    await button(page, /Pause/).click();
    await see(page, /▶ Resume/);

    // The same tick, not the next time Home happens to look: one write, one re-render.
    await expect.poll(homeCard, { message: "Home never saw the pause" }).toMatch(/paused/);
    const text = (await homeCard())!;
    const frozen = /(\d+:\d\d)/.exec(text)?.[1];
    expect(frozen, `Home should show a paused clock, read: ${text}`).toBeTruthy();

    // And it stays put, rather than counting down a deadline that is no longer running.
    await page.waitForTimeout(3_000);
    expect(await homeCard()).toContain(frozen!);
    expect(await homeCard()).toContain("paused");
  });

  /** Ending from Home is now a two-step journey on purpose, and it must still arrive. */
  test("FOCUSNOW-47 · a session started from Home can still be ended, via the card", async ({ app }) => {
    const { page, api } = app;
    await openOptions(page);
    await exact(page, "Regular").click();
    await exact(page, "25 min").click();
    await see(page, /Slide to focus · 25 min/);
    await slideToFocus(page);
    await see(page, /End Session/);

    const session = (await api.currentSession())!;
    db.sessionStartedAgo(session.id, "8 minutes 5 seconds");
    await page.goto("/");
    await see(page, /IN SESSION/);

    await control(page, "Open session").click();
    await button(page, /End Session/).click();
    await see(page, /End this session early\?/);
    await control(page, "End").click();
    // "Task complete", not "Session complete": a quick focus finishes its throwaway task with
    // the sitting, so there is no "is it done?" left to ask.
    await see(page, /Task complete \| \+8 XP/);
    expect(await api.currentSession()).toBeNull();
    await expect.poll(async () => (await api.today()).focusMinutes).toBe(8);
  });
});

/**
 * Which goal a quick sitting counts toward.
 *
 * The slide invents its own task, so unlike a row's Focus button it has no goal to inherit —
 * and a goal only ever advances when a focus task is *completed* carrying one. Before the chip
 * existed, every quick sitting counted toward nothing and the ring directly below the slider
 * sat still while the user watched it, which is the one thing a goal is for.
 *
 * The pick lasts exactly one sitting. That is the whole design and most of what these tests
 * are for: goal progress never decreases, so a selection that quietly survived into next week
 * would credit an hour of something else to a goal nobody chose that day, with no way back.
 * Re-picking costs almost nothing, because a goal counts days rather than sittings.
 */
test.describe("counting a quick sitting toward a goal", () => {
  /** Picks a goal through the card's chip. Assumes at least one goal exists. */
  async function pickGoal(page: Page, name: string) {
    await control(page, /^Goal for this session/).click();
    await see(page, "Count toward a goal");
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).locator("visible=true").last().click();
  }

  test("FOCUSNOW-52 · with no goals there is nothing to pick, and nothing offered", async ({ app }) => {
    const { page } = app;
    // A control whose only choice is "No goal" is furniture. The card stays as it was.
    await dontSee(page, /goal for this session/i);
    await see(page, /Slide to focus/);
  });

  test("FOCUSNOW-53 · one goal, and the card asks which, rather than reporting none", async ({ app }) => {
    const { page, api } = app;
    await api.goal("Learn Spanish");
    await reload(page);
    await see(page, /Select a goal for this session/);
  });

  test("FOCUSNOW-54 · the pick shows on the card, and belongs to the sitting rather than the app", async ({ app }) => {
    const { page, api } = app;
    await api.goal("Learn Spanish");
    await reload(page);
    await pickGoal(page, "Learn Spanish");
    await see(page, /Counts toward Learn Spanish/);
    /*
     * Deliberately NOT remembered. A pick that outlived the app would be waiting, unread, the
     * next time someone slid the bar - and a goal credited by accident cannot be uncredited.
     */
    await reload(page);
    await see(page, /Select a goal for this session/);
  });

  test("FOCUSNOW-55 · a finished quick sitting advances the goal the card named", async ({ app }) => {
    const { page, api } = app;
    expect((await api.goal("Learn Spanish")).totalDaysActive).toBe(0);
    await reload(page);
    await pickGoal(page, "Learn Spanish");
    await see(page, /Counts toward Learn Spanish/);

    await slideToFocus(page);
    await see(page, /End Session/);
    /*
     * Worth something before it is ended. A sitting under a minute deletes its task instead of
     * completing it, and it is completion — not the session — that moves a goal, so a sitting
     * ended immediately would correctly credit nothing and prove nothing.
     */
    db.sessionStartedAgo((await api.currentSession())!.id, "8 minutes 5 seconds");
    await button(page, /End Session/).click();
    await see(page, /End this session early\?/);
    await control(page, "End").click();
    await see(page, /Task complete/);

    await expect.poll(async () => (await api.goals())[0]?.totalDaysActive, { timeout: 20_000 }).toBe(1);
  });

  test("FOCUSNOW-56 · the next sitting starts from no goal, so nothing is credited twice over", async ({ app }) => {
    const { page, api } = app;
    const goal = await api.goal("Learn Spanish");
    await reload(page);
    await pickGoal(page, "Learn Spanish");
    await slideToFocus(page);
    await see(page, /End Session/);
    db.sessionStartedAgo((await api.currentSession())!.id, "8 minutes 5 seconds");
    await button(page, /End Session/).click();
    await see(page, /End this session early\?/);
    await control(page, "End").click();
    await see(page, /Task complete/);

    await page.goto("/");
    // Back to asking. The card describes the sitting you are about to start, never the last one.
    await see(page, /Select a goal for this session/);
    await slideToFocus(page);
    await see(page, /End Session/);
    const second = (await api.currentSession())!;
    expect((await api.getTask(second.taskId)).goalId).toBeNull();
    expect(goal.id).toBeTruthy();
  });

  test("FOCUSNOW-57 · a sitting discarded before it earns anything leaves the goal where it was", async ({ app }) => {
    const { page, api } = app;
    await api.goal("Learn Spanish");
    await reload(page);
    await pickGoal(page, "Learn Spanish");
    await slideToFocus(page);
    await see(page, /End Session/);

    // Long enough to have been worth crediting, so this measures the discard rather than the
    // under-a-minute rule that would have thrown the task away anyway.
    db.sessionStartedAgo((await api.currentSession())!.id, "8 minutes 5 seconds");
    await control(page, "Discard session").click();
    await see(page, /Discard this session\?/);
    await control(page, "Discard").click();
    await see(page, /nothing was counted/);

    // Discarding deletes the throwaway task, and a task that is never completed can never
    // credit a goal — so this needs no code of its own, only proof that it holds.
    expect((await api.goals())[0].totalDaysActive).toBe(0);
    await see(page, /Select a goal for this session/);
  });
});
