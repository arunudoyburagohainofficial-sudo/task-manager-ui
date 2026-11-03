import type { Page } from "@playwright/test";
import { expect, test } from "../harness/fixtures";
import { button, control, dateKey, deviceClockAt, exact, foreground, openTab, reload, screenText, section, see } from "../harness/app";
import { db } from "../harness/db";

/**
 * Task Detail — plan/04-task-detail.md.
 *
 * Everything about a task that isn't "finish it": its type, its goal, its nudges, and the start
 * of a focus session — and the screen that has to cope with a task that no longer exists.
 */

async function open(page: Page, name: string) {
  await exact(page, name).click();
  await see(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| `));
}

/** The body the app sends when a session starts. */
function captureStart(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/tasks\/[^/]+\/focus-sessions$/.test(r.url())) bodies.push(r.postDataJSON());
  });
  return bodies;
}

test("DETAIL-01 · the screen opens with the task's whole configuration", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Reading", 20);
  db.goalProgress(goal.id, 4);
  const t = await api.task({
    name: "Configured",
    goalId: goal.id,
    scheduledFor: dateKey(0),
    recurrenceRule: "FREQ=WEEKLY",
    notifications: [{ time: "21:00:00", daysBefore: 0 }],
  });
  await api.nudgeWindow(t.id, "09:00:00", "17:00:00", 30);
  await reload(page);
  await open(page, "Configured");
  await see(page, "SCHEDULED | 9 PM · every week");
  await see(page, "KEEP NUDGING | Every 30 min · 9 AM–5 PM");
  await see(page, /GOAL \| \d+ \| Reading/);
  await see(page, /4 of 20|4\/20/);
});

test("DETAIL-02/03 · the type switch decides what the screen offers — absent, not disabled", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Type switch", taskType: "reminder" });
  await reload(page);
  await open(page, "Type switch");
  await see(page, "WHY THERE IS NO GOAL HERE");
  expect(await screenText(page)).not.toMatch(/SESSION|Start \d+ min session/);
  await see(page, "Mark as done");

  await button(page, "Focus").click();
  await see(page, /SESSION \| LENGTH \| \d+ \| min \| − \| \+ \| Regular \| Pomodoro/);
  await see(page, "No goal attached");
  await see(page, "Finishing a session counts toward your streak and weekly progress");
  await see(page, /Start 25 min session/);
  expect(await screenText(page)).not.toMatch(/WHY THERE IS NO GOAL HERE|Mark as done/);

  await button(page, "Reminder").click();
  await see(page, "Mark as done");
  expect(await screenText(page)).not.toMatch(/SESSION \||Start \d+ min session/);
});

test("DETAIL-04 · a type change survives a reload, and Home's row agrees", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Becomes focus", taskType: "reminder" });
  await reload(page);
  await open(page, "Becomes focus");
  await button(page, "Focus").click();
  await expect.poll(async () => (await api.getTask(t.id)).taskType).toBe("focus");
  await reload(page);
  await see(page, /Becomes focus \| Focus · 25 min/);
  await expect(control(page, "Focus: Becomes focus")).toBeVisible();
});

test("DETAIL-05 · attaching, changing and clearing a goal — and the task survives the clear", async ({ app }) => {
  const { page, api } = app;
  await api.goal("Alpha", 20);
  await api.goal("Beta", 20);
  const t = await api.task({ name: "Goal hopper" });
  await reload(page);
  await open(page, "Goal hopper");

  for (const name of ["Alpha", "Beta"]) {
    await control(page, /goal/i).first().click().catch(() => undefined);
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).locator("visible=true").last().click();
    await see(page, new RegExp(`GOAL \\| \\d+ \\| ${name}`));
  }
  await control(page, /goal/i).first().click().catch(() => undefined);
  await page.getByRole("radio", { name: /^No goal/ }).locator("visible=true").last().click();
  await see(page, "No goal attached");
  const after = await api.getTask(t.id);
  expect(after.goalId).toBeNull();
  expect(after.name).toBe("Goal hopper");
  await control(page, "Back").click();
  await see(page, /Goal hopper \| Focus · 25 min/);
});

test("DETAIL-06 · 'Mark as done' finishes a reminder, earns its points and silences it", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Done from detail", taskType: "reminder", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
  await reload(page);
  await open(page, "Done from detail");
  await control(page, "Mark as done").click();
  await expect.poll(async () => (await api.getTask(t.id)).status).toBe("completed");
  await page.goto("/");
  await expect.poll(() => section(page, "DONE")).toMatch(/Done from detail \| Task · [^|]+ \| \+5/);
  expect((await api.reminders()).filter((r) => r.taskId === t.id && r.isActive)).toEqual([]);
});

test("DETAIL-07 · deleting asks first, then removes the task everywhere, notifications too", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Short lived", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
  await reload(page);
  await open(page, "Short lived");
  await control(page, "Delete task").click();
  await see(page, "Delete this task? | “Short lived” will be removed. This can't be undone.".replace(/“|”/g, '"'));
  await control(page, "Delete").click();
  await expect.poll(() => section(page, "TO DO")).not.toContain("Short lived");
  await openTab(page, "Scheduled");
  expect(await screenText(page)).not.toContain("Short lived");
  await expect(api.getTask(t.id)).rejects.toMatchObject({ status: 404 });
  expect((await api.reminders()).filter((r) => r.taskId === t.id && r.isActive)).toEqual([]);
});

/** Deep-linked from notifications, so this screen really does get opened for tasks that are gone. */
test("DETAIL-08 · a task deleted elsewhere says so, with a way back", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Deleted on the tablet", taskType: "reminder" });
  await reload(page);
  await open(page, "Deleted on the tablet");
  await api.remove(t.id);
  await foreground(page); // what a phone does when you come back to it
  await see(page, "This task is gone");
  await see(page, "It was deleted, here or on another device.");
  await button(page, "Back").click();
  await see(page, "Nothing to do yet");
});

test("DETAIL-09 · a finished task offers nothing that would be a lie", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "History", taskType: "reminder", scheduledFor: dateKey(0) });
  await api.complete(t.id);
  await reload(page);
  await open(page, "History");
  expect(await screenText(page)).not.toMatch(/SCHEDULED: [^|]*Change|ONE NUDGE|KEEP NUDGING|Mark as done/);
  await expect(page.getByRole("tab", { name: "Focus" }).locator("visible=true")).toHaveCount(0);
  await see(page, "SCHEDULED | Today");
});

/** Resolving this server-side once made the reminder fire in the past for anyone not on UTC. */
test("DETAIL-10 · 'Nudge me in…' sets today and a real time, and the row shows it", async ({ app }) => {
  /*
   * Run late enough and "in 45 minutes" is genuinely tomorrow, so the app dates the task
   * tomorrow and this test's premise inverts. That is the app being right, not wrong - the
   * assertions below are only meaningful while the window stays inside today.
   */
  test.skip(Date.now() + 46 * 60_000 > new Date().setHours(24, 0, 0, 0), "45 minutes from now falls tomorrow");
  const { page, api } = app;
  const t = await api.task({ name: "Nudge me", taskType: "reminder" });
  await reload(page);
  await open(page, "Nudge me");
  await control(page, /^ONE NUDGE: /).click();
  await button(page, /^45 min/).click();
  await see(page, /ONE NUDGE \| In 4[45] minutes/);
  await see(page, /SCHEDULED \| Today/);
  expect((await api.getTask(t.id)).scheduledFor).toBe(dateKey(0));
});

test("DETAIL-11 · a nudge picked near midnight lands on tomorrow", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Late nudge", taskType: "reminder" });
  await deviceClockAt(page, dateKey(0), "23:50");
  await open(page, "Late nudge");
  await control(page, /^ONE NUDGE: /).click();
  await see(page, /45 min \| 12:35 AM tomorrow/);
  await button(page, /^45 min/).click();
  await expect.poll(async () => (await api.getTask(t.id)).scheduledFor).toBe(dateKey(1));
  expect((await api.reminders()).find((r) => r.taskId === t.id && r.isActive)?.reminderTime).toBe("00:35:00");
});

test("DETAIL-12 · repeated nudges: set, show, change and stop — one window, not two", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Keep at me", taskType: "reminder" });
  await reload(page);
  await open(page, "Keep at me");
  await control(page, /^KEEP NUDGING: /).click();
  await button(page, "Start nudging").click();
  await see(page, "KEEP NUDGING | Every 30 min · 6 PM–8 PM");

  await control(page, /^KEEP NUDGING: /).click();
  await page.getByRole("radio", { name: "60 min", exact: true }).locator("visible=true").last().click();
  await button(page, "Save nudges").click();
  await see(page, "KEEP NUDGING | Every 60 min · 6 PM–8 PM");
  expect((await api.intervals()).filter((i) => i.taskId === t.id)).toHaveLength(1);

  await control(page, /^KEEP NUDGING: /).click();
  await button(page, "Stop nudging").click();
  await see(page, "KEEP NUDGING | Off");
  expect((await api.intervals()).filter((i) => i.taskId === t.id && i.isActive)).toEqual([]);
});

/**
 * On web the window's times can't be picked (no native time picker), so the refusal is proven at
 * the API the sheet calls — the part that must stay legible whichever screen sends it.
 */
test("DETAIL-13 · a nudge window that crosses midnight is refused with a reason", async ({ app }) => {
  const { api } = app;
  const t = await api.task({ name: "Overnight", taskType: "reminder" });
  const refused = await api.nudgeWindow(t.id, "22:00:00", "02:00:00", 30).catch((e) => e);
  expect(refused.status).toBe(400);
  expect(String(refused.body)).toMatch(/start|end|before|after/i);
});

test("DETAIL-14 · starting a session uses the length actually chosen", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Forty five" });
  await reload(page);
  await open(page, "Forty five");
  const bodies = captureStart(page);
  for (let i = 0; i < 4; i++) await control(page, "Increase session length").click();
  await see(page, "Start 45 min session");
  await button(page, "Start 45 min session").click();
  await see(page, /4[45]:\d\d/);
  expect(bodies[0]).toMatchObject({ plannedMinutes: 45 });
  expect((await api.currentSession())!.plannedMinutes).toBe(45);
  await page.goto("/");
  // Home's Focus Now card counts down in mm:ss, so 45 minutes shows as the clock, not "of 45".
  await see(page, /IN SESSION \| Forty five \| 4[45]:\d\d \| left/);
});

test("DETAIL-15 · Pomodoro maths is what it says, and the server gets the whole sitting", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Three rounds" });
  await reload(page);
  await open(page, "Three rounds");
  await button(page, "Pomodoro").click();
  for (let i = 0; i < 6 && !/Start 3 rounds/.test(await screenText(page)); i++) {
    const n = Number(/Start (\d+) rounds?/.exec(await screenText(page))?.[1] ?? 0);
    await control(page, n > 3 ? "Decrease rounds" : "Increase rounds").click();
  }
  await see(page, /3 × 25 min, \d+ min breaks · \d+ min total/);
  const bodies = captureStart(page);
  await button(page, "Start 3 rounds").click();
  await see(page, /Cycle 1 of 3/);
  // Capped against the whole sitting - three 25-minute blocks, not one - and the split is sent
  // with it, because 75 alone cannot be told apart from one unbroken block of the same length.
  expect(bodies[0]).toEqual({ focusMode: "pomodoro", plannedMinutes: 75, numPomodoroCycles: 3 });
  expect((await api.currentSession())!.plannedMinutes).toBe(75);
});

test("DETAIL-16 · starting while another session runs opens the running one", async ({ app }) => {
  const { page, api } = app;
  const running = await api.task({ name: "Already going" });
  await api.task({ name: "Wants to start" });
  const s = await api.startSession(running.id, { plannedMinutes: 25 });
  db.sessionStartedAgo(s.id, "5 minutes");
  await reload(page);
  await open(page, "Wants to start");
  await button(page, /^Start \d+ min session$/).click();
  await see(page, /^Already going \|/);
  await see(page, /(19|20):\d\d/); // continuing its countdown, not a fresh one
});

test("DETAIL-17 · a session that can't be reached can be discarded", async () => {
  test.fixme(
    true,
    "Device-only on web: the discard is offered through Alert.alert's buttons, and react-native-web implements Alert as a no-op. Covered by the device plan."
  );
});

test("DETAIL-18 · renaming a task", async () => {
  test.fixme(true, "Blocked on the app: there's no rename control yet (TODOS.md item 1).");
});
