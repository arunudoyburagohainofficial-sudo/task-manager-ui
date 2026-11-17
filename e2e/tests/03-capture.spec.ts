import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { button, control, dateKey, exact, openTab, reload, screenText, section, see } from "../harness/app";
import { choice, saveAndClose, sheetButton, storedNotifications } from "../harness/sheet";

/**
 * Capture and Organize — plan/03-capture.md.
 *
 * The only way a task gets into the app, and a two-screen flow that creates several rows in one
 * go. A half-finished batch — some saved, one lost, no message — is the failure that would cost
 * someone real work, and the hardest to notice.
 */

const field = (page: Page) => page.getByPlaceholder("Type a task…").locator("visible=true").last();

async function openCapture(page: Page) {
  await control(page, "Capture tasks").click();
  await see(page, "What’s on your mind?");
}

/** Types each name as its own draft, leaving the last in the field. */
async function draft(page: Page, ...names: string[]) {
  for (let i = 0; i < names.length; i++) {
    await field(page).fill(names[i]);
    if (i < names.length - 1) await button(page, "+ Add another").click();
  }
}

async function toOrganize(page: Page, count: number) {
  await button(page, `Confirm & Organize (${count})`).click();
  await see(page, "Organize your tasks");
}

/** The Organize card for one draft — the smallest block holding its name field and type switch. */
function card(page: Page, name: string) {
  return page
    .locator("div")
    .filter({ has: page.locator(`input[value="${name.replace(/"/g, '\\"')}"]`) })
    .filter({ hasText: "Focus Task" })
    .last();
}

async function confirmAll(page: Page, count: number) {
  await button(page, `Confirm & Add ${count} task${count === 1 ? "" : "s"}`).click();
  await see(page, /TO DO/);
}

test("CAP-01 · capture opens from every tab, and cancelling returns there", async ({ app }) => {
  const { page } = app;
  for (const [tab, mark] of [["Home", "GOALS"], ["Scheduled", "Nothing scheduled"], ["Progress", "Week"], ["Settings", "PREFERENCES"]] as const) {
    await openTab(page, tab);
    await openCapture(page);
    await button(page, "Cancel").click();
    await see(page, mark);
  }
});

test("CAP-02 · one task, captured and created exactly as typed, as a focus task", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "Draft the report");
  await toOrganize(page, 1);
  await confirmAll(page, 1);
  // No day was given, so it is filed under ANYTIME rather than claimed for today.
  await expect.poll(() => section(page, "ANYTIME")).toContain("Draft the report | Focus · 25 min");
  expect(await section(page, "TO DO")).not.toContain("Draft the report");
  const [t] = await api.tasks("pending");
  expect(t).toMatchObject({ name: "Draft the report", taskType: "focus" });
});

test("CAP-03 · several drafts in one pass, each keeping its own settings", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Alpha", 20);
  await reload(page);
  await openCapture(page);
  await draft(page, "Plain focus", "Call the bank", "Goal work");
  await toOrganize(page, 3);

  await card(page, "Call the bank").getByText("Reminder Task", { exact: true }).click();
  await card(page, "Call the bank").getByText("Set a schedule", { exact: true }).click();
  await choice(page, "Today").click();
  await sheetButton(page, "Notify me").click();
  await saveAndClose(page);

  await card(page, "Goal work").getByText("Count toward a goal", { exact: true }).click();
  await page.getByRole("radio", { name: /^Alpha/ }).locator("visible=true").last().click();
  await confirmAll(page, 3);

  const tasks = await api.tasks("pending");
  const byName = Object.fromEntries(tasks.map((t) => [t.name, t]));
  expect(byName["Plain focus"]).toMatchObject({ taskType: "focus", goalId: null, scheduledFor: null });
  expect(byName["Call the bank"]).toMatchObject({ taskType: "reminder", goalId: null, scheduledFor: dateKey(0) });
  expect(byName["Goal work"]).toMatchObject({ taskType: "focus", goalId: goal.id, scheduledFor: null });
  await see(page, "Call the bank | Reminder · 9 AM");
  await see(page, "Goal work | Goal · Alpha");
});

test("CAP-04 · removing a draft removes that one and no other", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "First", "Middle", "Last");
  await control(page, "Remove Middle").click();
  await toOrganize(page, 2);
  await confirmAll(page, 2);
  expect((await api.tasks("pending")).map((t) => t.name).sort()).toEqual(["First", "Last"]);
});

test("CAP-05 · cancel discards everything, and capture opens empty next time", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "Never mind", "Also never mind");
  await button(page, "Cancel").click();
  await see(page, "Nothing to do yet");
  expect(await api.tasks("pending")).toEqual([]);
  await openCapture(page);
  await expect(field(page)).toHaveValue("");
  expect(await screenText(page)).not.toContain("Never mind");
});

test("CAP-06 · nothing, or only spaces, can't be submitted", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  const go = page.getByRole("button", { name: /^Confirm & Organize/ }).locator("visible=true").last();
  await expect(go).toHaveAttribute("aria-disabled", "true");
  await field(page).fill("    ");
  await expect(go).toHaveAttribute("aria-disabled", "true");
  await go.click({ force: true });
  await page.waitForTimeout(500);
  expect(await screenText(page)).not.toContain("Organize your tasks");
  expect(await api.tasks("pending")).toEqual([]);
});

test("CAP-07 · going back from Organize keeps every draft", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "Kept one", "Kept two");
  await toOrganize(page, 2);
  await control(page, "Back").click();
  await see(page, "What’s on your mind?");
  await see(page, "Kept one");
  await expect(field(page)).toHaveValue("Kept two");
  expect(await api.tasks("pending")).toEqual([]);
  await toOrganize(page, 2);
});

/**
 * The sheet here is the same one Task Detail uses, lead times and all — and Organize used to keep
 * only the first notification, saved as a plain on-the-day time. "6 PM on the day + 9 AM the day
 * before" became a single 9 AM on the day.
 */
test("CAP-08 · a schedule set during Organize is saved whole, lead times included", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "Dentist");
  await toOrganize(page, 1);
  await card(page, "Dentist").getByText("Reminder Task", { exact: true }).click();
  await card(page, "Dentist").getByText("Set a schedule", { exact: true }).click();
  await choice(page, "Tomorrow").click();
  // Adding a notification opens its time editor already, so the presets are right there.
  await sheetButton(page, "Notify me").click();
  await choice(page, "Evening").click();
  await sheetButton(page, "+ 1 day before").click();
  await saveAndClose(page);
  await confirmAll(page, 1);

  const [t] = await api.tasks("pending");
  expect(t.scheduledFor).toBe(dateKey(1));
  expect(await storedNotifications(api, t.id)).toEqual(["09:00/1", "18:00/0"]);
});

test("CAP-09 · a goal attached during Organize sticks", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Fitness", 20);
  await reload(page);
  await openCapture(page);
  await draft(page, "Run 5k");
  await toOrganize(page, 1);
  await card(page, "Run 5k").getByText("Count toward a goal", { exact: true }).click();
  await page.getByRole("radio", { name: /^Fitness/ }).locator("visible=true").last().click();
  await confirmAll(page, 1);
  await see(page, "Run 5k | Goal · Fitness");
  expect((await api.tasks("pending"))[0].goalId).toBe(goal.id);
  await exact(page, "Run 5k").click();
  await see(page, /GOAL \| \d+ \| Fitness/);
});

test("CAP-10 · a repeat set at capture time makes a real routine", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "Floss");
  await toOrganize(page, 1);
  await card(page, "Floss").getByText("Set a schedule", { exact: true }).click();
  await choice(page, "Today").click();
  await choice(page, "Daily").click();
  await saveAndClose(page);
  await confirmAll(page, 1);
  expect((await api.tasks("pending"))[0]).toMatchObject({ recurrenceRule: "FREQ=DAILY", scheduledFor: dateKey(0) });
  await openTab(page, "Scheduled");
  await see(page, /RECURRING[\s\S]*Floss/);
});

/** Retrying used to re-create every draft, including the ones that had already been saved. */
test("CAP-11 · one failed creation loses nothing and duplicates nothing on retry", async ({ app }) => {
  const { page, api } = app;
  await openCapture(page);
  await draft(page, "One", "Two", "Three");
  await toOrganize(page, 3);
  let creates = 0;
  await page.route(/\/api\/tasks$/, (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    creates++;
    return creates === 2 ? r.fulfill({ status: 500, body: "{}" }) : r.fallback();
  });
  await confirmAll(page, 3).catch(() => undefined);
  await see(page, "Saved 1 - couldn't save “Two”. Try again.");
  await see(page, "2 tasks captured");
  await page.unroute(/\/api\/tasks$/);

  await confirmAll(page, 2);
  const names = (await api.tasks("pending")).map((t) => t.name).sort();
  expect(names).toEqual(["One", "Three", "Two"]);
});

test("CAP-12 · awkward text survives the round trip", async ({ app }) => {
  const { page, api } = app;
  const cases = [
    "Buy 🍎 and 🥖 for the 🎉",
    `Say "hello" & <don't> escape`,
    "مرحبا — call Ahmed back",
    "x".repeat(300),
  ];
  await openCapture(page);
  await draft(page, `   ${cases[0]}   `, ...cases.slice(1));
  await toOrganize(page, cases.length);
  await confirmAll(page, cases.length);
  const names = (await api.tasks("pending")).map((t) => t.name);
  for (const c of cases) expect(names).toContain(c);
  for (const c of cases.slice(0, 3)) await see(page, c);
  const { expectNoSidewaysScroll } = await import("../harness/app");
  await expectNoSidewaysScroll(page);
});

/**
 * ANYTIME draws five rows, and capture makes every task undated. The list held in memory had a
 * new task added at its end, so on an account with five or more undated tasks the thing just
 * typed went straight below the cap of its own section: the person confirmed, landed on Home,
 * and their task was not on it. After the next reload it was the first row. A screen that
 * disagrees with itself across a refresh is worse than either order.
 */
test("CAP-13 · a new capture is the first row under ANYTIME even when that section is already full", async ({ app }) => {
  const { page, api } = app;
  for (let i = 1; i <= 6; i++) await api.task({ name: `Earlier ${i}`, taskType: "reminder" });
  await reload(page);
  await see(page, /ANYTIME \| 6 \|/);

  await openCapture(page);
  await draft(page, "Just typed");
  await toOrganize(page, 1);
  await confirmAll(page, 1);

  // Straight away, with no reload: this is the moment the person is looking for it.
  await see(page, /ANYTIME \| 7 \|/);
  expect(await section(page, "ANYTIME")).toMatch(/^7 \| Hide \| ▴ \| Just typed \|/);
  await see(page, "2 more in Scheduled");

  // The same after a reload, so the screen agrees with itself.
  await reload(page);
  await expect.poll(() => section(page, "ANYTIME")).toMatch(/^7 \| Hide \| ▴ \| Just typed \|/);

  // And first on the screen that lists all seven.
  await openTab(page, "Scheduled");
  await see(page, /ANYTIME \| 7 \| Just typed \|/);
});
