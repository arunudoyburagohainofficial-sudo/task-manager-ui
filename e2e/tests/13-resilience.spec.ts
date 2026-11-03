import type { Page } from "@playwright/test";
import { expect, sameAccountIn, test } from "../harness/fixtures";
import { button, control, dateKey, exact, foreground, openTab, reload, screenText, section, see, stayAbsent } from "../harness/app";
import { db } from "../harness/db";
import { choice, openSchedule, save } from "../harness/sheet";

/**
 * Failure, offline and two devices — plan/13-resilience.md.
 *
 * The app is optimistic almost everywhere: it shows the result before the server agrees. So every
 * write has a rollback path that only runs when something goes wrong — the least-exercised code in
 * the product, whose symptom is a task that silently reappears or silently disappears.
 */

const API_RE = /localhost:8080\/api\//;

/** Fails one endpoint (by method and path) with a status, leaving everything else alone. */
async function failing(page: Page, method: string, path: RegExp, status = 500) {
  await page.route(path, (r) => (r.request().method() === method ? r.fulfill({ status, contentType: "application/json", body: "{}" }) : r.fallback()));
}

/** Counts requests by method and path. */
function counting(page: Page, method: string, path: RegExp) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === method && path.test(r.url())) seen.push(r.url());
  });
  return seen;
}

test("RES-01 · with no network, Home still shows what it knew", async ({ app }) => {
  const { page, api } = app;
  const goal = await api.goal("Offline goal", 20);
  await api.task({ name: "Known offline", taskType: "reminder", goalId: goal.id });
  await reload(page);
  await see(page, "Known offline");
  await page.waitForTimeout(1_500); // the cache reaches storage
  await page.route(API_RE, (r) => r.abort("internetdisconnected"));
  await page.reload();
  await see(page, "Known offline", 20_000);
  await see(page, "Offline goal");
  await see(page, /DAY STREAK/);
});

/**
 * "Offline" here is the phone's kind: requests fail. Switching the *browser* offline is different —
 * React Query sees navigator.onLine go false and pauses the write instead of failing it, which
 * would hold the optimistic result on screen and replay it later. On a phone React Query isn't
 * told about connectivity, so the request simply fails; failing the requests is what matches that.
 */
async function noNetwork(page: Page) {
  await page.route(API_RE, (r) => r.abort("internetdisconnected"));
}

/** An optimistic update rolled back without a word reads as the app losing work. */
test("RES-02 · an action taken offline fails loudly and puts things back", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Offline tap", taskType: "reminder" });
  await reload(page);
  await noNetwork(page);
  await control(page, "Done: Offline tap").click();
  await see(page, "Couldn't complete “Offline tap” - check your connection.");
  await expect.poll(() => section(page, "TO DO")).toContain("Offline tap");
});

/** A queued write that fires much later could complete a task since rescheduled or deleted. */
test("RES-03 · coming back online replays nothing behind the user's back", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Not replayed", taskType: "reminder" });
  await reload(page);
  await noNetwork(page);
  await control(page, "Done: Not replayed").click();
  await see(page, /Couldn't complete/);
  await page.unrouteAll();
  await foreground(page);
  await page.waitForTimeout(3_000);
  expect((await api.getTask(t.id)).status).toBe("pending");
  await control(page, "Done: Not replayed").click();
  await expect.poll(async () => (await api.getTask(t.id)).status).toBe("completed");
});

test("RES-04 · a server error on each write path is reported and changes nothing", async ({ app }) => {
  const { page, api } = app;

  // Undo.
  const u = await api.task({ name: "Undo fails", taskType: "reminder" });
  await reload(page);
  await control(page, "Done: Undo fails").click();
  await see(page, "“Undo fails” done");
  await failing(page, "POST", /\/reopen$/);
  await button(page, "Undo").click();
  await see(page, "Couldn't undo - check your connection.");
  expect((await api.getTask(u.id)).status).toBe("completed");
  await page.unrouteAll();

  // Schedule save: the sheet keeps its input and nothing is written (the alert itself is device-only).
  const s = await api.task({ name: "Schedule fails", taskType: "reminder" });
  await reload(page);
  await exact(page, "Schedule fails").click();
  await openSchedule(page, "Schedule fails");
  await choice(page, "Tomorrow").click();
  await failing(page, "PATCH", new RegExp(`/api/tasks/${s.id}$`));
  await save(page);
  await page.waitForTimeout(800);
  await see(page, /Waits under Scheduled until/);
  expect((await api.getTask(s.id)).scheduledFor).toBeNull();
  await page.unrouteAll();

  // Session start: no session appears on either end.
  await api.task({ name: "Start fails" });
  await reload(page);
  await exact(page, "Start fails").click();
  await failing(page, "POST", /\/focus-sessions$/);
  await button(page, /^Start \d+ min session$/).click();
  await page.waitForTimeout(800);
  expect(await screenText(page)).not.toContain("End Session");
  expect(await api.currentSession()).toBeNull();
  await page.unrouteAll();

  // Goal save: the goal is unchanged.
  const g = await api.goal("Goal save fails", 20);
  await reload(page);
  await page.getByRole("button", { name: /^Goal save fails, / }).locator("visible=true").last().click();
  await failing(page, "PATCH", /\/api\/goals\//);
  await page.getByPlaceholder("e.g. Interview Prep").locator("visible=true").last().fill("Renamed");
  await control(page, "Save").click();
  await page.waitForTimeout(800);
  expect((await api.goals()).find((x) => x.id === g.id)!.name).toBe("Goal save fails");
});

/** The worst moment to strand someone is straight after they've done the work. */
test("RES-05 · a session that fails to save can be ended again, and is credited once", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Save me" });
  await reload(page);
  await exact(page, "Save me").click();
  await button(page, /^Start \d+ min session$/).click();
  await see(page, "End Session");
  const s = (await api.currentSession())!;
  db.sessionStartedAgo(s.id, "6 minutes 2 seconds");
  await failing(page, "POST", /\/focus-sessions\/[^/]+\/complete$/);
  await button(page, "End Session").click();
  await control(page, "End").click();
  await see(page, "Couldn't save this session - check your connection and end it again.");
  expect((await api.currentSession())?.id).toBe(s.id);
  await page.unrouteAll();
  await button(page, "End Session").click();
  await control(page, "End").click();
  await see(page, "Session complete");
  expect((await api.today()).focusMinutes).toBe(6);
});

/** People tap again when nothing happens. Two session starts once left an account stuck. */
test("RES-06 · a slow network can't turn a double tap into a double write", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Slow one" });
  await reload(page);
  await page.route(API_RE, async (r) => {
    if (r.request().method() !== "GET") await new Promise((res) => setTimeout(res, 2_500));
    return r.fallback();
  });
  const starts = counting(page, "POST", /\/focus-sessions$/);
  await exact(page, "Slow one").click();
  const start = button(page, /^Start \d+ min session$/);
  await start.click();
  await start.click({ force: true, timeout: 1_000 }).catch(() => undefined);
  await see(page, "End Session", 20_000);
  expect(starts).toHaveLength(1);

  await page.goto("/");
  await see(page, "IN SESSION");
  const s = (await api.currentSession())!;
  await api.discardSession(s.id);
  await reload(page);
  const patches = counting(page, "PATCH", new RegExp(`/api/tasks/${t.id}$`));
  await exact(page, "Slow one").click();
  await openSchedule(page, "Slow one");
  await choice(page, "Today").click();
  const saveButton = control(page, "Save schedule");
  await saveButton.click();
  await saveButton.click({ force: true, timeout: 1_000 }).catch(() => undefined);
  await expect(saveButton).toBeHidden({ timeout: 20_000 });
  expect(patches).toHaveLength(1);
});

/**
 * A 429 used to read "check your connection", sending people to their Wi-Fi settings for the
 * server asking them to wait (fixed 2026-09-19; the server now also counts per user, not per IP).
 */
test("RES-07 · being rate-limited is explained as that, and recovers once it lifts", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Throttled", taskType: "reminder" });
  await reload(page);
  await failing(page, "POST", /\/api\/tasks\/[^/]+\/(done|complete)$/, 429);
  await control(page, "Done: Throttled").click();
  await see(page, "Couldn't complete “Throttled” - too many requests right now. Try again in a minute.", 5_000);
  expect(await screenText(page)).not.toContain("check your connection");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await control(page, "Done: Throttled").click();
  await see(page, "“Throttled” done");
});

test("RES-08 · two devices, one account, one truth — even completing at the same moment", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Done on the tablet", taskType: "reminder" });
  await api.task({ name: "Both at once", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
  await reload(page);
  const tablet = await sameAccountIn(app, "Asia/Kolkata");
  try {
    await control(tablet.page, "Done: Done on the tablet").click();
    await see(tablet.page, "“Done on the tablet” done");
    await foreground(page);
    await expect.poll(() => section(page, "TO DO")).not.toContain("Done on the tablet");

    const errors: string[] = [];
    for (const p of [page, tablet.page]) {
      p.on("response", (r) => {
        if (API_RE.test(r.url()) && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
      });
    }
    await Promise.all([control(page, "Done: Both at once").click(), control(tablet.page, "Done: Both at once").click()]);
    await expect.poll(async () => (await api.tasks("pending")).filter((t) => t.name === "Both at once").length).toBe(1);
    await page.waitForTimeout(1_000);
    expect((await api.tasks("pending")).filter((t) => t.name === "Both at once")).toHaveLength(1);
    expect((await api.tasks("completed")).filter((t) => t.name === "Both at once")).toHaveLength(1);
    expect(errors).toEqual([]);
    for (const p of [page, tablet.page]) expect(await screenText(p)).not.toContain("Couldn't");
  } finally {
    await tablet.close();
  }
});

/** Acting on a task another device has deleted used to fail in place, behind a generic message. */
test("RES-09 · acting on a task deleted elsewhere says it's gone", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Deleted meanwhile", taskType: "reminder" });
  await reload(page);
  await exact(page, "Deleted meanwhile").click();
  const tablet = await sameAccountIn(app, "Asia/Kolkata");
  try {
    await exact(tablet.page, "Deleted meanwhile").click();
    await control(tablet.page, "Delete task").click();
    await control(tablet.page, "Delete").click();
    await expect.poll(async () => (await api.tasks("pending")).length).toBe(0);
  } finally {
    await tablet.close();
  }
  await openSchedule(page, "Deleted meanwhile");
  await choice(page, "Tomorrow").click();
  await save(page);
  await see(page, "This task is gone");
});

test("RES-10 · a reload in the middle of anything leaves nothing half-done", async ({ app }) => {
  const { page, api } = app;
  // Capture open with drafts: discarded, nothing created.
  await control(page, "Capture tasks").click();
  await page.getByPlaceholder("Type a task…").locator("visible=true").last().fill("Never saved");
  await reload(page);
  expect(await api.tasks("pending")).toEqual([]);

  // A schedule sheet with unsaved changes: nothing written.
  const t = await api.task({ name: "Dirty sheet", taskType: "reminder" });
  await reload(page);
  await exact(page, "Dirty sheet").click();
  await openSchedule(page, "Dirty sheet");
  await choice(page, "Tomorrow").click();
  await choice(page, "Daily").click();
  await reload(page);
  expect(await api.getTask(t.id)).toMatchObject({ scheduledFor: null, recurrenceRule: null });

  // Mid-completion: finished once or not at all, never twice.
  await page.route(/\/(done|complete)$/, async (r) => {
    await new Promise((res) => setTimeout(res, 1_000));
    return r.fallback();
  });
  await control(page, "Done: Dirty sheet").click();
  await page.reload();
  await see(page, "TO DO");
  await page.waitForTimeout(1_500);
  const all = [...(await api.tasks("pending")), ...(await api.tasks("completed"))].filter((x) => x.name === "Dirty sheet");
  expect(all).toHaveLength(1);

  // A running session survives.
  await api.task({ name: "Keeps running" });
  await reload(page);
  await exact(page, "Keeps running").click();
  await button(page, /^Start \d+ min session$/).click();
  await see(page, "End Session");
  await reload(page);
  await see(page, /IN SESSION[\s\S]*Keeps running/);
});

/** A row written by a newer app version is an explicitly supported case. */
test("RES-11 · an odd or unexpected response doesn't blank the screen", async ({ app }) => {
  const { page, api } = app;
  await api.task({ name: "Ordinary row", taskType: "reminder" });
  await reload(page);
  await page.route(/\/api\/tasks\?status=pending$/, async (r) => {
    const res = await r.fetch();
    const rows = await res.json();
    const base = rows[0];
    rows.push(
      { ...base, id: "00000000-0000-0000-0000-000000000001", name: null },
      { ...base, id: "00000000-0000-0000-0000-000000000002", name: "Future type", taskType: "habit" },
      { ...base, id: "00000000-0000-0000-0000-000000000003", name: "Future rule", recurrenceRule: "FREQ=HOURLY", scheduledFor: dateKey(0) },
      { ...base, id: "00000000-0000-0000-0000-000000000004", name: "No points field", pointsEarned: undefined }
    );
    return r.fulfill({ response: res, json: rows });
  });
  await page.reload();
  await see(page, "Ordinary row", 20_000);
  await see(page, "Future rule");
  await see(page, "No points field");
  await openTab(page, "Scheduled");
  // An unnameable rule reduces to the bare word "Repeats", after the kind label - the row
  // still says it comes back without pretending to describe how.
  await see(page, /Future rule \| Reminder · Repeats/);
});

test("RES-12 · an empty account and a very full one both render and stay usable", async ({ app }) => {
  test.setTimeout(300_000);
  const { page, api } = app;
  await see(page, "Nothing to do yet");

  for (let i = 0; i < 10; i++) await api.goal(`Goal ${i}`, 20);
  for (let i = 0; i < 200; i++) await api.task({ name: `Task ${String(i).padStart(3, "0")}`, taskType: "reminder" });
  const finished = await api.tasks("pending");
  for (const t of finished.slice(0, 50)) await api.complete(t.id);
  const started = Date.now();
  await reload(page);
  await see(page, /TO DO \| 150 \|/, 30_000);
  expect(Date.now() - started, "Home took too long to load").toBeLessThan(20_000);
  // The list renders what's near the screen; DONE exists once it's scrolled to.
  for (let i = 0; i < 20 && !/\| DONE \| 50 \|/.test(await screenText(page)); i++) {
    await page.mouse.move(187, 400);
    await page.mouse.wheel(0, 4_000);
    await page.waitForTimeout(200);
  }
  await see(page, /DONE \| 50 \|/);
  await expect(control(page, "Capture tasks")).toBeVisible();
  await stayAbsent(page, /Couldn't|error/i, 1_000);
});
