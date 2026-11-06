import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { button, control, dontSee, exact, openTab, reload, screenText, see } from "../harness/app";
import { db } from "../harness/db";

/**
 * Goals — plan/08-goals.md.
 *
 * A 20-day commitment is twenty days of trust in one number. The rules behind it are narrow: only
 * focused work moves it, only once a day, and it never goes backwards.
 */

const card = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}, \\d+ of \\d+ days$`) }).locator("visible=true").last();

async function goalCardText(page: Page, name: string) {
  return (await card(page, name).innerText()).replace(/\n+/g, " | ");
}

test("GOAL-01 · a goal created from the + appears at once, empty, in its own colour", async ({ app }) => {
  const { page, api } = app;
  await control(page, "Create a new goal").click();
  await see(page, "New goal");
  await page.getByPlaceholder("e.g. Interview Prep").locator("visible=true").last().fill("Interview prep");
  await control(page, "30 days").click();
  await control(page, "Colour #4A8590").click();
  await control(page, "Save").click();
  await expect(card(page, "Interview prep")).toBeVisible();
  expect(await goalCardText(page, "Interview prep")).toBe("0% | Interview prep | 0 of 30 days");
  const [g] = await api.goals();
  expect(g).toMatchObject({ name: "Interview prep", targetDays: 30, color: "#4A8590", totalDaysActive: 0 });
});

test("GOAL-02 · editing name, colour and target flows to every screen showing the goal", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Old name", 20, "#67924D");
  await api.task({ name: "On the goal", goalId: g.id });
  await reload(page);
  await card(page, "Old name").click();
  const name = page.getByPlaceholder("e.g. Interview Prep").locator("visible=true").last();
  await name.fill("New name");
  await control(page, "60 days").click();
  await control(page, "Colour #C86E35").click();
  await control(page, "Save").click();

  expect(await goalCardText(page, "New name")).toBe("0% | New name | 0 of 60 days");
  await see(page, "On the goal | Goal · New name");
  await openTab(page, "Progress");
  await see(page, /New name \| 0 of 60 days/);
  expect(await api.getTask((await api.tasks("pending"))[0].id)).toMatchObject({ goalId: g.id });
  expect((await api.goals())[0]).toMatchObject({ color: "#C86E35", targetDays: 60 });
});

test("GOAL-03 · deleting a goal never deletes the work", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Going away", 20);
  const t = await api.task({ name: "Survives", goalId: g.id });
  await reload(page);
  await card(page, "Going away").click();
  await control(page, "Delete goal").click();
  // It asks first, and says what goes with it.
  await see(page, "Delete “Going away” and the 0 days counted toward it? Its tasks stay.");
  await control(page, "Keep it").click();
  expect((await api.goals()).map((x) => x.name)).toContain("Going away");
  await control(page, "Delete goal").click();
  await control(page, "Delete").click();
  await expect(card(page, "Going away")).toHaveCount(0);
  await see(page, /Survives \| Focus · 25 min/);
  expect(await api.getTask(t.id)).toMatchObject({ name: "Survives", goalId: null });
  await openTab(page, "Progress");
  // The success toast names the goal, so give it time to fade before asking whether the name
  // is anywhere on screen.
  await dontSee(page, "“Going away” deleted");
  expect(await screenText(page)).not.toContain("Going away");
  await openTab(page, "Home");
  await exact(page, "Survives").click();
  await see(page, "No goal attached");
});

test("GOAL-04 · finishing a focus task on a goal moves it one day, everywhere", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Twenty days", 20);
  const t = await api.task({ name: "Today's session", goalId: g.id });
  await api.complete(t.id);
  await reload(page);
  expect(await goalCardText(page, "Twenty days")).toBe("5% | Twenty days | 1 of 20 days");
  await openTab(page, "Progress");
  await see(page, /Twenty days \| 1 of 20 days/);
});

test("GOAL-05 · two focus tasks on one goal in a day count as one day", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Once a day", 20);
  for (const name of ["Morning", "Evening"]) await api.complete((await api.task({ name, goalId: g.id })).id);
  await reload(page);
  expect(await goalCardText(page, "Once a day")).toContain("1 of 20 days");
});

test("GOAL-06 · finishing a reminder on a goal doesn't move it, and nothing implied it would", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Focus only", 20);
  const t = await api.task({ name: "Just a reminder", taskType: "reminder", goalId: g.id });
  await reload(page);
  await exact(page, "Just a reminder").click();
  await see(page, "WHY THERE IS NO GOAL HERE");
  await see(page, "it adds nothing to your streak or weekly progress");
  await control(page, "Back").click();
  await api.complete(t.id);
  await reload(page);
  expect(await goalCardText(page, "Focus only")).toContain("0 of 20 days");
});

test("GOAL-07 · goal progress survives an undo", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Never backwards", 20);
  const t = await api.task({ name: "Undone later", goalId: g.id });
  await api.complete(t.id);
  await api.reopen(t.id);
  await reload(page);
  expect(await goalCardText(page, "Never backwards")).toContain("1 of 20 days");
});

test("GOAL-08 · a finished goal reads as finished, and never past 100%", async ({ app }) => {
  const { page, api } = app;
  const g = await api.goal("Seven days", 7);
  db.goalProgress(g.id, 6);
  const t = await api.task({ name: "The last day", goalId: g.id });
  await api.complete(t.id);
  expect((await api.goals())[0]).toMatchObject({ totalDaysActive: 7, status: "completed" });
  await reload(page);
  expect(await goalCardText(page, "Seven days")).toBe("100% | Seven days | 7 of 7 days");
  db.goalProgress(g.id, 9); // more days than the target — the ring mustn't overflow
  await reload(page);
  expect(await goalCardText(page, "Seven days")).toMatch(/^100% \|/);
});

/** The ring's track and ink are derived from the goal's own colour by lightness — never hand-picked. */
test("GOAL-09 · every palette colour gives a legible ring", async ({ app }) => {
  const { page, api } = app;
  const palette = ["#67924D", "#C86E35", "#4A8590", "#C58989", "#A68BCC", "#F0D447", "#8DA6CC"];
  for (const [i, c] of palette.entries()) await api.goal(`Colour ${i}`, 20, c);
  for (const [i] of palette.entries()) db.goalProgress((await api.goals()).find((g) => g.name === `Colour ${i}`)!.id, 10);
  await reload(page);

  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  for (const [i] of palette.entries()) {
    const c = card(page, `Colour ${i}`);
    await c.scrollIntoViewIfNeeded();
    const colours = await c.evaluate((el) => {
      const circles = Array.from(el.querySelectorAll("circle"));
      const pct = Array.from(el.querySelectorAll("*")).find((n) => /^\d+%$/.test((n as HTMLElement).innerText?.trim() ?? "")) as HTMLElement;
      let bg = "rgba(0, 0, 0, 0)";
      for (let n: HTMLElement | null = el as HTMLElement; n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); n = n.parentElement) bg = getComputedStyle(n).backgroundColor;
      const stroke = (x: Element) => getComputedStyle(x).stroke;
      return { track: stroke(circles[0]), fill: stroke(circles[1]), ink: getComputedStyle(pct).color, bg };
    });
    expect(contrast(colours.track, colours.fill), `Colour ${i}: track vs fill`).toBeGreaterThan(1.3);
    expect(contrast(colours.ink, colours.bg), `Colour ${i}: % text vs card`).toBeGreaterThanOrEqual(3);
  }
});

test("GOAL-10 · a long name wraps without breaking the pair of cards", async ({ app }) => {
  const { page, api } = app;
  await api.goal("A goal with a genuinely long name to wrap", 20);
  await api.goal("Averyveryverylonggoalnamewithoutanyspaces", 20);
  await reload(page);
  const a = (await card(page, "A goal with a genuinely long name to wrap").boundingBox())!;
  const b = (await card(page, "Averyveryverylonggoalnamewithoutanyspaces").boundingBox())!;
  expect(Math.abs(a.height - b.height)).toBeLessThan(2);
  expect(Math.abs(a.width - b.width)).toBeLessThan(2);
  const ringSizes = await Promise.all(
    [a, b].map((_, i) => page.locator("svg").filter({ has: page.locator("circle") }).locator("visible=true").nth(i).boundingBox())
  );
  expect(Math.round(ringSizes[0]!.width)).toBe(Math.round(ringSizes[1]!.width));
  const { expectNoSidewaysScroll } = await import("../harness/app");
  await expectNoSidewaysScroll(page);
});

test("GOAL-11 · the goal picker shows the current goal and changes it", async ({ app }) => {
  const { page, api } = app;
  const a = await api.goal("Current", 20);
  await api.goal("Other", 20);
  const t = await api.task({ name: "Picker task", goalId: a.id });
  await reload(page);
  await exact(page, "Picker task").click();
  await control(page, /goal/i).first().click();
  await see(page, "Count toward a goal");
  await see(page, /Current \| 0\/20 days \| ✓/);
  expect(await screenText(page)).not.toMatch(/Other \| 0\/20 days \| ✓/);
  await page.getByRole("radio", { name: /^Other/ }).locator("visible=true").last().click();
  await expect.poll(async () => (await api.getTask(t.id)).goalId).toBe((await api.goals()).find((g) => g.name === "Other")!.id);
});

test("GOAL-12 · Home's goals strip and Progress agree", async ({ app }) => {
  const { page, api } = app;
  const names = ["First goal", "Second goal", "Third goal"];
  for (const [i, n] of names.entries()) db.goalProgress((await api.goal(n, 10 + i)).id, i + 1);
  await reload(page);
  const home = await page.getByRole("button", { name: /, \d+ of \d+ days$/ }).locator("visible=true").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await openTab(page, "Progress");
  await see(page, "First goal");
  // Progress's goal rows aren't buttons; Home's cards (still mounted underneath) are.
  const progress = await page
    .locator('[aria-label$=" days"]:not([role="button"])')
    .locator("visible=true")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(progress).toEqual(home);
  // Newest first on both, as the server returns them.
  expect(home).toEqual(["Third goal, 3 of 12 days", "Second goal, 2 of 11 days", "First goal, 1 of 10 days"]);
  await button(page, "Week").click();
});

test("GOAL-13 · four goals on Progress stay readable instead of being squeezed", async ({ app }) => {
  /*
   * From a device, 2026-09-22. Progress drew its goal cards in a plain flex row with no width,
   * so `GoalRingCard` fell back to flex: 1 and four goals divided the screen between them —
   * about 70px each. The ring survived; the goal's name disappeared completely and "0 of 20
   * days" wrapped to one character per line. Home was correct the whole time, because it had
   * the scroll-and-size arithmetic that Progress never got.
   *
   * Asserted on the rendered width and the visible name rather than a screenshot: the failure
   * was a squeeze, and a width is what a squeeze actually is.
   */
  const { api } = app;
  const names = ["First goal", "Second goal", "Third goal", "Fourth goal"];
  for (const [i, n] of names.entries()) db.goalProgress((await api.goal(n, 20)).id, i);
  await reload(app.page);
  await openTab(app.page, "Progress");
  await see(app.page, "Fourth goal");

  const cards = app.page.locator('[aria-label$=" days"]:not([role="button"])').locator("visible=true");
  await expect(cards).toHaveCount(4);

  for (let i = 0; i < 4; i++) {
    const box = (await cards.nth(i).boundingBox())!;
    // The broken layout gave ~70. Anything in that region has lost the name.
    expect(box.width, `${names[i]} card width`).toBeGreaterThan(140);
  }

  // The name is the first thing a squeeze destroys, so check it survived on every card.
  for (const name of names) await see(app.page, name);
});
