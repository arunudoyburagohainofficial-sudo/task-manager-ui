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
  await expect.poll(() => section(page, "ANYTIME")).toContain("Offline tap");
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
  // The list is fetched a page at a time, so its address carries a page now. The odd rows go
  // onto the first one only: a second page, if one were ever asked for, passes straight through.
  await page.route(/\/api\/tasks\?status=pending&/, async (r) => {
    if (!/[?&]offset=0(&|$)/.test(r.request().url())) return r.fallback();
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
  // The undated ones are listed on this screen too now, the nameless one among them, and a
  // row with no name must not take the section down with it.
  await see(page, /ANYTIME \| 4 \|/);
  await see(page, "No points field");
  await see(page, "Future type");
});

test("RES-12 · an empty account and a very full one both render and stay usable", async ({ app }) => {
  test.setTimeout(300_000);
  const { page, api } = app;
  await see(page, "Nothing to do yet");

  for (let i = 0; i < 10; i++) await api.goal(`Goal ${i}`, 20);
  // Dated today, so they all land in TO DO - the one section that draws every row it has.
  for (let i = 0; i < 200; i++) {
    await api.task({ name: `Task ${String(i).padStart(3, "0")}`, taskType: "reminder", scheduledFor: dateKey(0) });
  }
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

/**
 * More outstanding tasks than one unpaged request returns.
 *
 * The app derives everything - every section, every count, the tab badge - from a single
 * "pending" fetch, and that fetch used to be unpaged. The server answers an unpaged request
 * with at most 1,000 rows, newest first, and silently drops the rest, logging a warning nothing
 * surfaces. The ones dropped are the oldest: exactly the backlog somebody has forgotten about
 * and would never notice missing.
 *
 * So the seed has to clear 1,000, or the test proves nothing - at 250 the old code returned
 * everything too. Seeded straight into Postgres in one statement, because a thousand API calls
 * to set up one assertion is its own kind of wrong.
 */
test("RES-20 · a backlog past the unpaged ceiling comes back whole, oldest included", async ({ app }) => {
  test.setTimeout(180_000);
  const { page, api, userId } = app;

  const made = 1_050;
  db.bulkTasks(userId, made, "Bulk");
  try {
    // Through the app's own client, which is where the paging lives.
    await reload(page);
    await see(page, new RegExp(`ANYTIME[\\s\\S]*${made}`), 60_000);

    // "Bulk 1050" is the oldest - created_at is staggered a minute apart - and it is the row an
    // unpaged fetch would have dropped off the end. Scheduled draws the newest thirty and keeps
    // the rest behind one press, so the press is part of reaching it.
    await openTab(page, "Scheduled");
    await see(page, new RegExp(`ANYTIME \\| ${made} \\|`), 60_000);
    await control(page, `Show ${made - 30} more anytime tasks`).click();
    await see(page, `Bulk ${made}`, 60_000);

    const pending = await api.tasks("pending");
    expect(new Set(pending.map((t) => t.id)).size, "nothing came back twice").toBe(pending.length);
  } finally {
    // In one statement, here, rather than left for the next test's set-up to delete a thousand
    // rows one request at a time - which is how fifty of them once ended up in the next test.
    db.removeBulk(userId, "Bulk");
  }
});

/** The page each request for a list asked for, as its starting row. */
const offsetsOf = (urls: string[]) => [...new Set(urls.map((u) => Number(/[?&]offset=(\d+)/.exec(u)?.[1] ?? -1)))].sort((a, b) => a - b);

/**
 * The edges of a page, where a paging loop is most likely to be one row out.
 *
 * Exactly one full page is the awkward case: a full page cannot tell the app whether there is
 * more, so it has to ask once more and get nothing back. One over and exactly two pages are its
 * neighbours. Each is checked for the count on Home, for the oldest row being reachable, and
 * for the app having asked for exactly the pages it needed.
 */
test("RES-22 · exactly a page, one over, and exactly two pages all come back whole", async ({ app }) => {
  test.setTimeout(240_000);
  const { page, api, userId } = app;

  for (const [made, pages] of [[200, [0, 200]], [201, [0, 200]], [400, [0, 200, 400]]] as const) {
    db.bulkTasks(userId, made, "Edge");
    try {
      const asked = counting(page, "GET", /\/api\/tasks\?status=pending&/);
      await reload(page);
      await see(page, new RegExp(`ANYTIME \\| ${made} \\|`), 60_000);
      expect(offsetsOf(asked), `${made} tasks`).toEqual([...pages]);

      await openTab(page, "Scheduled");
      await see(page, new RegExp(`ANYTIME \\| ${made} \\|`), 60_000);
      // "Edge <made>" is the oldest, so it is the last row of the last page - and past the
      // thirty this screen draws before being asked for the rest.
      await control(page, `Show ${made - 30} more anytime tasks`).click();
      await see(page, `Edge ${made} |`, 60_000);
      await see(page, "Edge 1 |");
      expect((await api.tasks("pending")).length).toBe(made);
      await openTab(page, "Home");
    } finally {
      db.removeBulk(userId, "Edge");
    }
  }
});

/**
 * Finished tasks are never deleted, so that list only ever grows - and nothing on any screen
 * reads further back than this week. Home lists what was finished today; Progress counts this
 * week's seven days. Paging through all of it made every launch download the whole history to
 * draw one short list: three requests for six hundred finished tasks, thirty for six thousand.
 *
 * So the app stops once a page reaches back past anything it shows. Two halves, because a rule
 * that stops early is only right if it also does not stop *too* early.
 */
test("RES-21 · a long history of finished tasks is not downloaded to show today's", async ({ app }) => {
  test.setTimeout(240_000);
  const { page, api, userId } = app;
  const finishedPages = /\/api\/tasks\?status=completed&/;

  // 1. Old history only: 450 finished six weeks ago, which is three pages' worth.
  db.bulkCompleted(userId, 450, "History", 40);
  try {
    const today = await api.task({ name: "Finished today", taskType: "reminder" });
    await api.complete(today.id);

    const asked = counting(page, "GET", finishedPages);
    await reload(page);
    await see(page, /DONE \| 1 \|/, 60_000);
    expect(await section(page, "DONE")).toContain("Finished today");
    expect(await section(page, "DONE")).not.toContain("History");
    // The newest two hundred already reach back six weeks, so one page answered it.
    expect(offsetsOf(asked), "pages of finished tasks asked for").toEqual([0]);

    // 2. A busy week: 250 more finished two days ago. The first page is now entirely inside
    // the week the app reads, so stopping there would lose fifty of them. It has to go on to
    // the second page, and that page reaches the old history, so it stops there.
    db.bulkCompleted(userId, 250, "Recent", 2);
    const askedAgain = counting(page, "GET", finishedPages);
    await reload(page);
    await see(page, /DONE \| 1 \|/, 60_000);
    expect(offsetsOf(askedAgain), "pages of finished tasks asked for").toEqual([0, 200]);
    expect(await section(page, "DONE")).not.toContain("Recent");
  } finally {
    db.removeBulk(userId, "History");
    db.removeBulk(userId, "Recent");
  }
});

/**
 * Nothing the app asks the server is sent until Google has confirmed the sign-in, and that is a
 * call across the internet the app does not control. Usually it takes a third of a second. When
 * it doesn't, the app has two ways to go wrong: sit on the splash until Google answers, or open
 * on its saved copy and never notice the real answer arriving.
 *
 * It does neither. It holds the splash for four seconds at most (SessionContext), opens on what
 * this phone last saved, and redraws itself when the answer lands - with nobody touching it.
 *
 * Found by this suite's own flakiness, 2026-11-16: on a slow answer the old harness read the
 * saved copy as if it were fresh, and tests failed on the previous test's data.
 */
test("RES-23 · when the sign-in check is slow, the app opens on what it last saved and then catches up", async ({ app }) => {
  const { api } = app;
  const HOLD = 12_000;
  await api.task({ name: "Already on this phone" });
  const phone = await sameAccountIn(app, "Asia/Kolkata");
  try {
    // The saved copy is written a moment after the data arrives; wait until it really is saved.
    await expect
      .poll(() => phone.page.evaluate(() => localStorage.getItem("task-app-query-cache-v1")?.includes("Already on this phone") ?? false))
      .toBe(true);
    // Made elsewhere after this phone last looked, so only a fresh answer can put it on screen.
    await api.task({ name: "Made since it last looked" });

    await phone.page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, async (route) => {
      await new Promise((done) => setTimeout(done, HOLD));
      await route.continue().catch(() => undefined);
    });
    const started = Date.now();
    await phone.page.reload();

    // 1. Home is up, from the saved copy, while Google still hasn't answered.
    await expect(phone.page.getByText("Already on this phone", { exact: true }).locator("visible=true").first()).toBeVisible({ timeout: HOLD });
    expect(Date.now() - started, "Home appeared only after Google answered").toBeLessThan(HOLD);
    expect(await section(phone.page, "ANYTIME")).not.toContain("Made since it last looked");

    // 2. The answer arrives and the screen follows it, without a tap or a reload.
    await expect.poll(() => section(phone.page, "ANYTIME"), { timeout: 30_000 }).toContain("Made since it last looked");
    expect(await section(phone.page, "ANYTIME")).toContain("Already on this phone");
  } finally {
    await phone.close();
  }
});
