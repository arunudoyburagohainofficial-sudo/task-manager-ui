import type { Page } from "@playwright/test";
import { expect, freshAccount, test } from "../harness/fixtures";
import { api as apiFor } from "../harness/api";
import { button, control, dateKey, openTab, pageText, see } from "../harness/app";

/**
 * The first-run walkthrough — plan/15-walkthrough.md.
 *
 * It advances by watching real actions rather than Next buttons, so it's coupled to five controls
 * on four screens. Every test here starts from a brand-new account with the tour left on.
 */

/** The spotlight ring: the one absolutely positioned, click-through box with a 3px border. */
async function ringBox(page: Page) {
  return page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("div"))) {
      const s = getComputedStyle(el);
      if (s.position === "absolute" && s.pointerEvents === "none" && s.borderTopWidth === "3px" && s.borderTopStyle === "solid") {
        const r = el.getBoundingClientRect();
        if (r.width > 0) return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
    return null;
  });
}

/** The tour card's text — it's drawn above everything, so the whole page is the honest read. */
async function tourSays(page: Page, pattern: string | RegExp) {
  await expect.poll(() => pageText(page), { message: `tour never said ${pattern}` }).toMatch(typeof pattern === "string" ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : pattern);
}

const centreInside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) => {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height;
};

async function withTour(browser: import("@playwright/test").Browser, body: (page: Page, token: string) => Promise<void>) {
  const acct = await freshAccount(browser, "Asia/Kolkata", { keepTour: true });
  try {
    await body(acct.page, acct.token);
  } finally {
    await acct.close();
  }
}

async function createGoal(page: Page, name: string) {
  await control(page, "Create a new goal").click();
  await page.getByPlaceholder("e.g. Interview Prep").locator("visible=true").last().fill(name);
  await control(page, "Save").click();
}

async function throughStep3(page: Page, taskName: string) {
  await createGoal(page, "Tour goal");
  await tourSays(page, "2 of 5");
  await control(page, "Capture tasks").click();
  await tourSays(page, "3 of 5");
  await page.getByPlaceholder("Type a task…").locator("visible=true").last().fill(taskName);
  await button(page, /^Confirm & Organize/).click();
  await tourSays(page, "4 of 5");
}

test("TOUR-01 · it starts by itself on a new account, once Home has loaded", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await tourSays(page, /1 of 5[\s\S]*Start with a goal/);
    await expect(page.getByText("TO DO").first()).toBeAttached(); // Home is there underneath
  });
});

test("TOUR-02 · step 1 rings the + beside GOALS, and only creating a goal moves it on", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await tourSays(page, "1 of 5");
    const ring = (await ringBox(page))!;
    expect(centreInside((await control(page, "Create a new goal").boundingBox())!, ring)).toBe(true);
    // Editing the starter goal isn't creating one.
    await page.getByRole("button", { name: /^Learn Something New, / }).locator("visible=true").last().click({ force: true }).catch(() => undefined);
    await tourSays(page, "1 of 5");
    await page.keyboard.press("Escape");
    await createGoal(page, "My first goal");
    await tourSays(page, /2 of 5[\s\S]*Now capture a task/);
  });
});

test("TOUR-03 / CAP-13 · step 2 rings the docked Ferne, and opening capture moves it on", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await createGoal(page, "Tour goal");
    await tourSays(page, "2 of 5");
    const ring = (await ringBox(page))!;
    expect(centreInside((await control(page, "Capture tasks").boundingBox())!, ring)).toBe(true);
    await control(page, "Capture tasks").click();
    await tourSays(page, /3 of 5[\s\S]*Name your task/);
  });
});

test("TOUR-04 · steps 3, 4 and 5 follow the real actions to a finished tour", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await throughStep3(page, "Tour task");
    await tourSays(page, /4 of 5[\s\S]*Count it toward your goal/);
    await page.getByText("Count toward a goal", { exact: true }).locator("visible=true").last().click();
    await page.getByRole("radio", { name: /^Tour goal/ }).locator("visible=true").last().click();
    await button(page, /^Confirm & Add 1 task$/).click();
    await tourSays(page, /5 of 5[\s\S]*Then just start/);
    await tourSays(page, /Tap Focus to begin a session/); // it's a focus row, so the copy says Focus
    await control(page, "Focus: Tour task").click();
    await expect.poll(async () => (await pageText(page)).includes("5 of 5")).toBe(false);
  });
});

/**
 * The tab bar is inert during the tour (by design — see TOUR-10), so the reachable way to be away
 * from a step's target is the last step with the new task scrolled off the screen.
 *
 * The fillers are dated today on purpose. A task made in the tour has no day, so it is the first
 * row under ANYTIME - and undated fillers would sit *below* it there, however many there were,
 * leaving it on screen with nothing to scroll away from. Sixteen things due today put it sixteen
 * rows down, under TO DO.
 *
 * That is also the case the first half is about. The last step used to scroll to the top of the
 * list, which left the task below the fold on any full day and the tour pointing at nothing.
 */
test("TOUR-05 · a full day doesn't hide the task, and scrolled away from it the card says where to go", async ({ browser }) => {
  await withTour(browser, async (page, token) => {
    const api = apiFor(token);
    for (let i = 0; i < 16; i++) await api.task({ name: `Filler ${i}`, taskType: "reminder", scheduledFor: dateKey(0) });
    await page.reload(); // still on step 1, now with a long list
    await tourSays(page, "1 of 5");
    await throughStep3(page, "Far away task");
    await page.getByText("Count toward a goal", { exact: true }).locator("visible=true").last().click();
    await page.getByRole("radio", { name: /^Tour goal/ }).locator("visible=true").last().click();
    await button(page, /^Confirm & Add 1 task$/).click();
    await tourSays(page, "5 of 5");

    // Brought up to where it can be pressed: wholly on screen, above the tab bar, ring around it.
    // The top of the highest tab button. Read off the page rather than through a role query, which
    // finds nothing while the tour holds the tab bar inert (TOUR-10).
    const tabBarTop = await page.evaluate(() => {
      const tops = Array.from(document.querySelectorAll('[role="tab"]'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0)
        .map((r) => r.top);
      return tops.length ? Math.min(...tops) : null;
    });
    expect(tabBarTop, "no tab bar found to measure against").not.toBeNull();
    await expect
      .poll(
        async () => {
          const ring = await ringBox(page);
          const row = await control(page, "Focus: Far away task").boundingBox().catch(() => null);
          return !!ring && !!row && row.y > 0 && row.y + row.height < tabBarTop! && centreInside(row, ring);
        },
        { message: "the last step never brought the task into view with the ring on it", timeout: 15_000 }
      )
      .toBe(true);
    await tourSays(page, "Tap Focus to begin a session");

    // Then away from it, back to the top of the list.
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(187, 420);
      await page.mouse.wheel(0, -800);
      await page.waitForTimeout(300);
    }
    await tourSays(page, "Find the task you just made on your Home list and tap Focus to start it.");
    expect(await ringBox(page)).toBeNull();
  });
});

test("TOUR-06 · the ring stays on its row while the list scrolls, or steps aside", async ({ browser }) => {
  await withTour(browser, async (page, token) => {
    const api = apiFor(token);
    for (let i = 0; i < 12; i++) await api.task({ name: `Filler ${i}`, taskType: "reminder" });
    await page.reload();
    await tourSays(page, "1 of 5");
    await throughStep3(page, "Scrolled task");
    await page.getByText("Count toward a goal", { exact: true }).locator("visible=true").last().click();
    await page.getByRole("radio", { name: /^Tour goal/ }).locator("visible=true").last().click();
    await button(page, /^Confirm & Add 1 task$/).click();
    await tourSays(page, "5 of 5");
    await page.mouse.move(187, 420);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(1_200);
    const ring = await ringBox(page);
    const row = await control(page, "Focus: Scrolled task").boundingBox().catch(() => null);
    if (ring && row && row.y > 0 && row.y < 812) {
      expect(centreInside(row, ring), "the ring was left behind by the scroll").toBe(true);
    } else {
      await tourSays(page, "Find the task you just made on your Home list");
    }
  });
});

test("TOUR-07 · Back re-reads a step without undoing anything", async ({ browser }) => {
  await withTour(browser, async (page, token) => {
    await createGoal(page, "Kept goal");
    await tourSays(page, "2 of 5");
    await page.getByText("← Back").locator("visible=true").last().click();
    await tourSays(page, /1 of 5[\s\S]*Start with a goal/);
    expect((await apiFor(token).goals()).map((g) => g.name)).toContain("Kept goal");
  });
});

test("TOUR-08 · Skip ends it for good", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await tourSays(page, "1 of 5");
    await page.getByText("Skip tour").locator("visible=true").last().click();
    await expect.poll(async () => (await pageText(page)).includes("1 of 5")).toBe(false);
    await page.reload();
    await see(page, "TO DO");
    await page.waitForTimeout(1_500);
    expect(await pageText(page)).not.toMatch(/\d of 5/);
  });
});

test("TOUR-09 · Replay starts again from step 1, and a replay abandoned half-way doesn't come back", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await page.getByText("Skip tour").locator("visible=true").last().click();
    await openTab(page, "Settings");
    await button(page, /Replay walkthrough/).click();
    await tourSays(page, /1 of 5[\s\S]*Start with a goal/);
    await createGoal(page, "Replayed goal");
    await tourSays(page, "2 of 5");
    await page.reload(); // quit half-way
    await see(page, "TO DO");
    await page.waitForTimeout(1_500);
    expect(await pageText(page)).not.toMatch(/\d of 5/);
  });
});

/**
 * By design the tour makes everything outside the highlighted control inert — so this isn't "the
 * app stays usable", it's "the tour is never a trap": Skip is always reachable, and it releases
 * everything at once.
 */
test("TOUR-10 · the tour holds the screen but never traps anyone", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await tourSays(page, "1 of 5");
    await control(page, "Done: Try scheduling something").click({ force: true, timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    expect(await pageText(page)).not.toContain("“Try scheduling something” done");
    await page.getByText("Skip tour").locator("visible=true").last().click();
    await control(page, "Done: Try scheduling something").click();
    await see(page, "“Try scheduling something” done");
  });
});

/**
 * Until 2026-09-19 the tour's place lived only in memory, so quitting mid-way came back at step 1
 * asking for a goal that already existed. The capture steps can't be picked up on Home (the
 * half-written task was never saved), so they resume at "open capture".
 */
test("TOUR-11 · reopening the app picks the tour up where it was left", async ({ browser }) => {
  await withTour(browser, async (page) => {
    await createGoal(page, "Before the quit");
    await tourSays(page, "2 of 5");
    await page.reload();
    await tourSays(page, /2 of 5[\s\S]*Now capture a task/);
    await control(page, "Capture tasks").click();
    await tourSays(page, "3 of 5");
    await page.reload();
    await tourSays(page, /2 of 5[\s\S]*Now capture a task/);
    expect(await pageText(page)).not.toContain("1 of 5");
  });
});
