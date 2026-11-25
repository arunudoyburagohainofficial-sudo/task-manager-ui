import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import type { Api } from "../harness/api";
import { button, control, dateKey, exact, openTab, reload, see } from "../harness/app";
import { openReminders, openSchedule, seedAndOpen } from "../harness/sheet";
import { db } from "../harness/db";

/**
 * Visual regression — plan/16-visual-regression.md.
 *
 * Two kinds of check:
 *
 *   VIS-01/02 compare the app against the **design itself** (designdocs/home-docked-ferne.html),
 *   by geometry: the same labels found in both, their positions compared to within a few pixels.
 *   Pixel-diffing two different renderers is noise; where things sit is the design.
 *
 *   VIS-03…10 are baselines of the app: a stored screenshot per surface, compared with a small
 *   tolerance, dynamic text masked, Reduce Motion on so animated surfaces hold still. They catch
 *   what no behavioural test can see — a ring at the wrong radius, a shadow that stopped rendering.
 *   Baselines were reviewed by eye against the design before being accepted; regenerate with
 *   `--update-snapshots` only after doing the same.
 */

const DESIGN = join(__dirname, "../../designdocs/home-docked-ferne.html");

/** The design's own content, seeded so rows, counts and cards line up with the drawing. */
async function seedDesignContent(page: Page, api: Api, userId: string, withSession = false) {
  await api.updateMe({ displayName: "Arunudoy" });
  // Newest first on the strip — so Interview is created first to land second, as drawn.
  const interview = await api.goal("Interview", 7, "#A68BCC");
  const gym = await api.goal("Gym", 20, "#67924D");
  db.goalProgress(gym.id, 13);
  db.goalProgress(interview.id, 4);
  const done1 = await api.task({ name: "Morning stretch", taskType: "reminder", goalId: gym.id });
  const done2 = await api.task({ name: "Read one page of notes", taskType: "reminder" });
  await api.complete(done1.id);
  await api.complete(done2.id);
  // Earlier *today*, whatever the time: two and one hours ago, squeezed after midnight when it's early.
  const sinceMidnight = Math.floor((Date.now() - new Date().setHours(0, 0, 0, 0)) / 60_000);
  const first = Math.max(2, Math.min(120, sinceMidnight - 1));
  db.completedAt(done1.id, { ago: `${first} minutes` }); // always the older, so it lists first as drawn
  db.completedAt(done2.id, { ago: `${Math.min(60, first - 1)} minutes` });
  // Every row below is dated today, because the design draws all four under TO DO. Left undated,
  // Home now files a task under ANYTIME, further down - the focus row and the goal row fell out
  // of VIS-04's frame that way, and its baseline was rewritten without them before anyone noticed.
  await api.task({ name: "Walk 20 minutes", taskType: "reminder", goalId: gym.id, scheduledFor: dateKey(0) });
  await api.task({ name: "Email Priya the draft", taskType: "reminder", scheduledFor: dateKey(0) });
  await api.task({ name: "Set a reminder for something", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "23:45:00", daysBefore: 0 }] });
  const focus = await api.task({ name: "Try a focus session", scheduledFor: dateKey(0) });
  db.streak(userId, { current: 4, longest: 4, lastActivity: dateKey(0) });
  if (withSession) {
    const s = await api.startSession(focus.id, { plannedMinutes: 25 });
    db.sessionStartedAgo(s.id, "10 minutes");
  }
  await page.evaluate(() => {
    const raw = localStorage.getItem("session-user-v1");
    if (raw) localStorage.setItem("session-user-v1", JSON.stringify({ ...JSON.parse(raw), displayName: "Arunudoy" }));
  });
  await reload(page);
}

/**
 * Positions of labelled text, relative to the greeting's top-left — in the design or the app.
 * Matched on what's *shown* (innerText, so CSS capitals count) by the smallest element showing it:
 * the app splits "Good evening, Arunudoy" into several text pieces, the design writes "Day streak"
 * and capitalises it with CSS.
 */
async function layoutOf(root: Locator, labels: string[]) {
  return root.evaluate((el, labels) => {
    const all = Array.from(el.querySelectorAll("*")) as HTMLElement[];
    // The box of the *glyphs*, not of their element: a button's padding would otherwise count.
    const textBox = (e: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      return range.getBoundingClientRect();
    };
    const smallest = (test: (t: string) => boolean) => {
      let best: HTMLElement | null = null;
      let bestArea = Infinity;
      for (const e of all) {
        const t = (e.innerText ?? "").trim();
        if (!t || !test(t)) continue;
        const r = e.getBoundingClientRect();
        const area = r.width * r.height;
        if (r.width > 0 && area < bestArea) {
          best = e;
          bestArea = area;
        }
      }
      return best ? textBox(best) : null;
    };
    const greeting = smallest((t) => /^Good (morning|afternoon|evening), \S+$/.test(t));
    const out: Record<string, { x: number; y: number } | null> = {};
    for (const l of labels) {
      const r = smallest((t) => t.toUpperCase() === l.toUpperCase());
      out[l] = r && greeting ? { x: Math.round(r.left - greeting.left), y: Math.round(r.top - greeting.top) } : null;
    }
    return out;
  }, labels);
}

async function compareToDesign(page: Page, frame: "9a Nothing running" | "9b Session running", labels: string[]) {
  const design = await page.context().newPage();
  try {
    await design.setViewportSize({ width: 1400, height: 1000 });
    await design.goto(`file://${DESIGN}`);
    await design.waitForTimeout(1_000);
    const want = await layoutOf(design.locator(`[data-screen-label="${frame}"]`), labels);
    if (process.env.E2E_DESIGN_SHOTS) {
      await design.locator(`[data-screen-label="${frame}"]`).screenshot({ path: `${process.env.E2E_DESIGN_SHOTS}/design-${frame.slice(0, 2)}.png` });
      await page.screenshot({ path: `${process.env.E2E_DESIGN_SHOTS}/app-${frame.slice(0, 2)}.png` });
    }
    const got = await layoutOf(page.locator("#root"), labels);
    const off: string[] = [];
    if (process.env.E2E_DESIGN_SHOTS) for (const l of labels) console.log(`  ${l}: design ${JSON.stringify(want[l])} app ${JSON.stringify(got[l])}`);
    for (const l of labels) {
      const [w, g] = [want[l], got[l]];
      if (!w || !g) off.push(`${l}: ${!w ? "not in design" : "not on screen"}`);
      else if (Math.abs(w.x - g.x) > 4 || Math.abs(w.y - g.y) > 4) off.push(`${l}: design ${w.x},${w.y} vs app ${g.x},${g.y}`);
    }
    expect(off, `out of place against the design (${frame}):\n${off.join("\n")}`).toEqual([]);
  } finally {
    await design.close();
  }
}

/*
 * The three stat labels are deliberately absent: the design draws each figure ragged-left
 * against its divider, and on a real phone that read as left-drifting, so the strip now centres
 * each figure over its own label (2026-09-21, at the user's direction). Everything else on Home
 * is still held to the design's own coordinates.
 */
const HOME_LABELS = ["GOALS", "Gym", "Interview", "TO DO", "Collapse all", "Try a focus session", "Focus · 25 min", "Email Priya the draft", "Task · today", "Walk 20 minutes", "Goal · Gym", "DONE", "Hide", "Morning stretch"];

test("VIS-01 · Home, nothing running, sits where the design puts it", async ({ app }) => {
  test.fixme(
    true,
    "Superseded: Home now carries the Focus Now card, whose design arrived as an image rather " +
      "than as a frame in designdocs. Every label below the stat strip is lower than frame 9a " +
      "says, so this comparison measures the gap between two designs, not a regression. Needs a " +
      "new 9a/9b frame in designdocs before it can mean anything again.",
  );
  test.skip(Date.now() - new Date().setHours(0, 0, 0, 0) < 3 * 60_000, "needs two completions earlier today");
  const { page, api, userId } = app;
  await seedDesignContent(page, api, userId);
  await see(page, "Read one page of notes");
  await compareToDesign(page, "9a Nothing running", HOME_LABELS);
});

test("VIS-02 · Home, session running, sits where the design puts it", async ({ app }) => {
  test.fixme(true, "Superseded by the Focus Now card - see VIS-01.");
  test.skip(Date.now() - new Date().setHours(0, 0, 0, 0) < 3 * 60_000, "needs two completions earlier today");
  const { page, api, userId } = app;
  await seedDesignContent(page, api, userId, true);
  await see(page, "RIGHT NOW");
  await compareToDesign(page, "9b Session running", ["RIGHT NOW", "Resume", ...HOME_LABELS.filter((l) => l !== "Try a focus session" && l !== "Focus · 25 min")]);
});

/* ───────────────────────────── baselines ───────────────────────────── */

test.describe("baselines", () => {
  test.beforeEach(async ({ app }) => {
    await app.page.emulateMedia({ reducedMotion: "reduce" });
    // The same name in every baseline, whatever ran before: the greeting is masked, and a mask
    // sized to "User_x7f…" in one run and "Arunudoy" in another is a diff that means nothing.
    await app.api.updateMe({ displayName: "Arunudoy" });
    await app.page.evaluate(() => {
      const raw = localStorage.getItem("session-user-v1");
      if (raw) localStorage.setItem("session-user-v1", JSON.stringify({ ...JSON.parse(raw), displayName: "Arunudoy" }));
    });
    await reload(app.page);
  });

  /** Text that changes by the day or the minute — masked so a baseline means "still looks right". */
  const dynamic = (page: Page) => [
    page.getByText(/^Good (morning|afternoon|evening),/),
    page.getByText(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d+ \w+$/),
    page.getByText(/\d{1,2}:\d{2} [AP]M/),
    page.getByText(/^(TOMORROW|[A-Z]{3}, [A-Z]{3} \d+)$/),
    page.getByText(/^User_/i),
  ];
  /*
   * A settle before every shot. When *writing* a baseline Playwright takes the frame straight away
   * instead of waiting for two identical ones, and an SVG drawn a moment after the screen appears
   * (Ferne, on Capture and Completion) was captured half-painted — a baseline that would then pass
   * against a broken render.
   */
  const shot = async (page: Page, name: string, target?: Locator) => {
    await page.waitForTimeout(1_000);
    await expect(target ?? page).toHaveScreenshot(name, { mask: dynamic(page), maxDiffPixelRatio: 0.01, animations: "disabled" });
  };

  test("VIS-03 · the docked tab bar", async ({ app }) => {
    const { page } = app;
    await reload(page);
    const bar = page.getByRole("tablist").locator("visible=true").last();
    const box = (await control(page, "Capture tasks").boundingBox())!;
    await expect(page).toHaveScreenshot("vis-03-tab-bar.png", { clip: { x: 0, y: box.y - 16, width: 375, height: 812 - (box.y - 16) }, animations: "disabled" });
    expect(bar).toBeTruthy();
  });

  test("VIS-04 · the row family", async ({ app }) => {
    const { page, api, userId } = app;
    await seedDesignContent(page, api, userId);
    await see(page, "Read one page of notes");
    const list = page.getByText("TO DO", { exact: true }).locator("visible=true").last();
    const top = (await list.boundingBox())!.y - 8;
    await expect(page).toHaveScreenshot("vis-04-rows.png", { clip: { x: 0, y: top, width: 375, height: 812 - top - 90 }, mask: dynamic(page), maxDiffPixelRatio: 0.01, animations: "disabled" });
    await api.clear();
    await reload(page);
    await see(page, "Nothing to do yet");
    const empty = page.getByText("Nothing to do yet", { exact: true }).locator("visible=true").last();
    const e = (await empty.boundingBox())!;
    await expect(page).toHaveScreenshot("vis-04-empty-row.png", { clip: { x: 0, y: e.y - 40, width: 375, height: 110 }, animations: "disabled" });
  });

  test("VIS-05 · the goal card across the palette, at 0%, 57% and 100%", async ({ app }) => {
    const { page, api } = app;
    for (const colour of ["#67924D", "#C86E35", "#4A8590", "#C58989", "#A68BCC", "#F0D447", "#8DA6CC"]) {
      await api.clear();
      for (const [name, days] of [["Zero", 0], ["Some", 4], ["All", 7]] as const) db.goalProgress((await api.goal(name, 7, colour)).id, days);
      await reload(page);
      const strip = page.getByRole("button", { name: /^(Zero|Some|All), \d+ of 7 days$/ }).locator("visible=true");
      await expect(strip).toHaveCount(3);
      const first = (await strip.nth(0).boundingBox())!;
      await expect(page).toHaveScreenshot(`vis-05-goals-${colour.slice(1)}.png`, { clip: { x: 0, y: first.y - 6, width: 375, height: first.height + 12 }, animations: "disabled" });
    }
  });

  test("VIS-06 · the stat strip", async ({ app }) => {
    const { page, api, userId } = app;
    await seedDesignContent(page, api, userId);
    const label = page.getByText("DAY STREAK", { exact: true }).locator("visible=true").last();
    const b = (await label.boundingBox())!;
    /*
     * Stops 36px above the label, not 40. The greeting line sits just above the strip and ends
     * in the real calendar date (formatGreetingDate reads the clock), so a 40px reach caught the
     * descenders of "Sunday 21 September" and the baseline stopped matching the next morning —
     * every differing pixel was in the top three rows, the strip itself identical. Found
     * 2026-09-22, a day after the baseline was taken.
     */
    await expect(page).toHaveScreenshot("vis-06-stat-strip.png", { clip: { x: 0, y: b.y - 36, width: 375, height: 66 }, animations: "disabled" });
  });

  test("VIS-07 · the background wash, both variants, three widths", async ({ app }) => {
    const { page } = app;
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 812 });
      await reload(page);
      await shot(page, `vis-07-wash-home-${width}.png`);
      await openTab(page, "Settings");
      await shot(page, `vis-07-wash-ambient-${width}.png`);
    }
  });

  test("VIS-08 · lifted surfaces still look lifted", async ({ app }) => {
    const { page, api, userId } = app;
    await seedDesignContent(page, api, userId, true);
    await see(page, "IN SESSION");
    // The whole card is the control now, so this box is the card itself rather than a button
    // inside it - clipped around the card's own edges, which is the lifted surface in question.
    const card = page.getByRole("button", { name: "Open session" }).locator("visible=true").last();
    const rn = (await card.boundingBox())!;
    await expect(page).toHaveScreenshot("vis-08-right-now.png", {
      clip: { x: 0, y: rn.y - 10, width: 375, height: rn.height + 20 },
      animations: "disabled",
    });
    const gym = (await page.getByRole("button", { name: /^Gym, / }).locator("visible=true").last().boundingBox())!;
    await expect(page).toHaveScreenshot("vis-08-goal-tiles.png", { clip: { x: 0, y: gym.y - 8, width: 375, height: gym.height + 16 }, animations: "disabled" });
    await exact(page, "Walk 20 minutes").click();
    const seg = page.getByRole("tab", { name: "Reminder", exact: true }).locator("visible=true").last();
    const s = (await seg.boundingBox())!;
    await expect(page).toHaveScreenshot("vis-08-segmented.png", { clip: { x: 0, y: s.y - 10, width: 375, height: s.height + 20 }, animations: "disabled" });
  });

  test("VIS-09 · three widths, one layout", async ({ app }) => {
    const { page, api, userId } = app;
    await seedDesignContent(page, api, userId);
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 812 });
      await reload(page);
      await shot(page, `vis-09-home-${width}.png`);
    }
  });

  test("VIS-10 · every other screen holds its shape", async ({ app }) => {
    test.setTimeout(240_000);
    const { page, api, userId } = app;
    const goal = await api.goal("Reading", 20, "#4A8590");
    await api.task({ name: "Deep work", goalId: goal.id });
    await api.task({ name: "Call Mum", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
    await api.task({ name: "Pay rent", taskType: "reminder", scheduledFor: dateKey(3) });
    await api.task({ name: "Gym", taskType: "reminder", scheduledFor: dateKey(1), recurrenceRule: "FREQ=DAILY" });
    const late = await api.task({ name: "Missed", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(late.id, dateKey(-1));
    await reload(page);

    await openTab(page, "Scheduled");
    await shot(page, "vis-10-scheduled.png");
    await openTab(page, "Progress");
    for (const tab of ["Week", "Month", "All time"]) {
      await page.getByRole("tab", { name: tab, exact: true }).locator("visible=true").last().click();
      await shot(page, `vis-10-progress-${tab.toLowerCase().replace(" ", "-")}.png`);
    }
    await openTab(page, "Settings");
    await shot(page, "vis-10-settings.png");
    await openTab(page, "Home");

    await exact(page, "Deep work").click();
    await shot(page, "vis-10-detail-focus.png");
    await control(page, "Back").click();
    await exact(page, "Call Mum").click();
    await shot(page, "vis-10-detail-reminder.png");
    await control(page, "Back").click();

    await control(page, "Capture tasks").click();
    await page.getByPlaceholder("Type a task…").locator("visible=true").last().fill("Draft one");
    await shot(page, "vis-10-capture.png");
    await button(page, /^Confirm & Organize/).click();
    await see(page, "Organize your tasks");
    await shot(page, "vis-10-organize.png");
    await page.goto("/");
    await see(page, "TO DO");

    await exact(page, "Deep work").click();
    await button(page, /^Start \d+ min session$/).click();
    await see(page, "End Session");
    await page.waitForTimeout(1_000);
    await expect(page).toHaveScreenshot("vis-10-session.png", { mask: [...dynamic(page), page.getByText(/^\d+:\d\d$/), page.getByText(/% complete$/)], maxDiffPixelRatio: 0.01, animations: "disabled" });
    await button(page, "End Session").click();
    await control(page, "End").click();
    await see(page, "Session complete");
    await button(page, /Mark task complete/).click();
    await see(page, "Task complete");
    await shot(page, "vis-10-completion.png");
    expect(userId).toBeTruthy();
  });

  /**
   * Both sliders at once, which is the only way to see that they match.
   *
   * The card's slide-to-focus is outlined once Home has a list, so the list's own Focus
   * buttons are the loud ones. The sheet carries a second copy of the same control, and it
   * was always filled - the sheet stops short of the card, so the two sat on screen together
   * in different clothes and read as two different buttons.
   */
  test("VIS-13 · the sheet's slider is dressed like the card's", async ({ app }) => {
    const { page, api } = app;
    // Dated today so it sits under TO DO, where the baseline has it. Undated, it moves down to
    // ANYTIME and the screen behind the sheet changes for reasons that have nothing to do with it.
    await api.task({ name: "Something to do", taskType: "reminder", scheduledFor: dateKey(0) });
    await reload(page);
    await control(page, /^Session length and mode/).click();
    await see(page, /How long\?/);
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot("vis-13-both-sliders.png", {
      // The shared mask, which also covers today's date under the greeting. This one used to mask
      // only the greeting and the name, so the date was in the picture and differed every day.
      mask: dynamic(page),
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  /**
   * The reminder card, opened with "Change" (rebuilt 2026-11-26).
   *
   * It is the densest part of the sheet: each reminder is a sentence with its own row of time
   * chips, then the add row and the footer. A repeating task, so every sentence reads "every time"
   * rather than a date - a date in the picture would change every day and fail for nothing.
   *
   * There's no time spinner here: the native picker renders nothing in react-native-web (see
   * harness/sheet.ts), so "Pick another time…" is the only trace of it.
   */
  test("VIS-12 · the reminder editor gives each reminder its own sentence and times", async ({ app }) => {
    const { page, api } = app;
    // seedAndOpen rather than a bare task + reload: ten days out puts it on Scheduled, not
    // Home, and the helper already knows to go and find it there.
    await seedAndOpen(page, api, {
      name: "Warned task",
      scheduledFor: dateKey(10),
      recurrenceRule: "FREQ=MONTHLY",
      notifications: [{ time: "09:00:00", daysBefore: 0 }, { time: "18:00:00", daysBefore: 1 }],
    });
    await openSchedule(page, "Warned task");
    await openReminders(page);
    await see(page, "Remind me on the day, every time, at");
    await see(page, "Also remind me earlier");
    // Scrolled to the foot of the sheet first: the editor runs below the fold on a 375-wide phone.
    await page.mouse.move(187, 600);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(500);
    const anchor = page.getByText("Remind you?", { exact: true }).locator("visible=true").last();
    const box = (await anchor.boundingBox())!;
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot("vis-12-reminder-editor.png", {
      clip: { x: 0, y: Math.max(0, box.y - 20), width: 375, height: 600 },
      animations: "disabled",
    });
  });

  /**
   * The goal chip under the slider, in both of its states, at the width that breaks things.
   *
   * It is one line with numberOfLines={1}, so the only way this fails is silently: copy that
   * reads perfectly in the source truncates to "...focus sessi..." on a 320pt phone. That is
   * exactly what the first draft did, and a typecheck cannot see it.
   */
  test("VIS-11 · the goal chip says its whole sentence at 320", async ({ app }) => {
    const { page, api, userId } = app;
    await seedDesignContent(page, api, userId);
    await page.setViewportSize({ width: 320, height: 812 });
    await reload(page);

    const chipBox = async () => (await control(page, /^Goal for this session/).boundingBox())!;
    const unpicked = await chipBox();
    await expect(page).toHaveScreenshot("vis-11-goal-chip-none.png", {
      clip: { x: 0, y: unpicked.y - 6, width: 320, height: unpicked.height + 12 },
      animations: "disabled",
    });

    await control(page, /^Goal for this session/).click();
    await see(page, "Count toward a goal");
    await page.getByRole("radio", { name: /^Interview/ }).locator("visible=true").last().click();
    await see(page, /Counts toward Interview/);
    await page.waitForTimeout(500);
    const picked = await chipBox();
    await expect(page).toHaveScreenshot("vis-11-goal-chip-picked.png", {
      clip: { x: 0, y: picked.y - 6, width: 320, height: picked.height + 12 },
      animations: "disabled",
    });
  });
});
