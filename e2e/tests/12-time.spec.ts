import { expect, sameAccountIn, test } from "../harness/fixtures";
import { API } from "../harness/api";
import { control, dateKey, deviceClockAt, exact, foreground, instantAt, openTab, reload, screenText, section, see, stats } from "../harness/app";
import { db } from "../harness/db";
import { entriesFor, phoneQueue } from "../harness/queue";
import { atMoment, localClock, localStamp } from "../logic/zone";
import { planQueue } from "../../src/notifications/schedulingLogic";

/**
 * Time, dates and timezones — plan/12-time-and-timezone.md.
 *
 * This codebase has lost days to getting "today" wrong. The rule: the user's day is decided by
 * the user's device, and anything crossing the API carries its zone with it.
 *
 * Two zones 25 hours apart — Pago Pago (UTC−11) and Kiritimati (UTC+14) — are on different
 * calendar days at *every* moment, so the tests that need two zones to disagree never depend on
 * what time the suite happens to run.
 */
const WEST = "Pacific/Pago_Pago";
const EAST = "Pacific/Kiritimati";

/** Runs `body` with this process's zone set to `zone`, restoring it after. */
function inProcessZone<T>(zone: string, body: () => T): T {
  const was = process.env.TZ;
  process.env.TZ = zone;
  try {
    return body();
  } finally {
    process.env.TZ = was;
  }
}

test("TIME-01 · 'today' is each device's today, not the server's", async ({ app }) => {
  const { api } = app;
  const westToday = dateKey(0, WEST);
  const eastToday = dateKey(0, EAST);
  expect(westToday).not.toBe(eastToday);
  await api.task({ name: "West's today", taskType: "reminder", scheduledFor: westToday });
  await api.task({ name: "East's today", taskType: "reminder", scheduledFor: eastToday });

  const west = await sameAccountIn(app, WEST);
  const east = await sameAccountIn(app, EAST);
  try {
    // West hasn't reached East's day yet — it's still to come there.
    await see(west.page, "West's today");
    expect(await section(west.page, "TO DO")).not.toContain("East's today");
    // East is past West's day: that one is overdue there, and badged.
    expect(await section(east.page, "TO DO")).toContain("East's today");
    await expect(east.page.getByRole("tab", { name: /^Scheduled, 1 overdue$/ })).toBeVisible();

    // Each device's totals come from its own day.
    const done = await api.task({ name: "Counted", taskType: "reminder" });
    await api.complete(done.id);
    for (const [who, zone] of [[west, WEST], [east, EAST]] as const) {
      await reload(who.page);
      expect((await stats(who.page)).points).toBe((await api.inZone(zone).today()).pointsEarned);
    }
  } finally {
    await west.close();
    await east.close();
  }
});

test("TIME-02 · midnight rolls over with the app open, in a zone behind UTC", async ({ app }) => {
  const zone = "America/Los_Angeles";
  const { api } = app;
  const la = await sameAccountIn(app, zone);
  try {
    const today = dateKey(0, zone);
    await api.task({ name: "LA today", taskType: "reminder", scheduledFor: today });
    await la.page.clock.install({ time: instantAt(today, "23:59", zone) });
    await la.page.reload();
    await see(la.page, "LA today | Task · today");
    await la.page.clock.fastForward("02:00");
    // Still on Home — it's overdue now, not gone — and no longer "today".
    await see(la.page, /LA today \| Task \|/);
    await expect(la.page.getByRole("tab", { name: /^Scheduled, 1 overdue$/ })).toBeVisible();
  } finally {
    await la.close();
  }
});

test("TIME-03 · a finish time is shown on each device's own clock", async ({ app }) => {
  const { api } = app;
  const t = await api.task({ name: "Finished", taskType: "reminder" });
  const done = await api.complete(t.id);
  const at = new Date(done.completedAt!);
  const clock = (zone: string) => at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });

  for (const zone of ["Asia/Kolkata", "America/Los_Angeles"]) {
    const other = await sameAccountIn(app, zone);
    try {
      expect(await section(other.page, "DONE"), zone).toContain(`Finished | Task · ${clock(zone)}`);
    } finally {
      await other.close();
    }
  }
});

test("TIME-04 · a completion just after midnight belongs to the new day", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Just after midnight", taskType: "reminder" });
  await api.complete(t.id);
  db.completedAt(t.id, { at: `${dateKey(0)} 00:05:00` });
  await reload(page);
  expect(await section(page, "DONE")).toContain("Just after midnight | Task · 12:05 AM");
  expect((await api.today()).pointsEarned).toBe(5);
  expect((await stats(page)).points).toBe(5);
});

test("TIME-05 · a completion just before midnight belongs to the old day", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Just before midnight", taskType: "reminder" });
  await api.complete(t.id);
  db.completedAt(t.id, { at: `${dateKey(-1)} 23:55:00` });
  await reload(page);
  expect(await screenText(page)).not.toContain("Just before midnight");
  expect((await api.today()).pointsEarned).toBe(0);
  expect((await stats(page)).points).toBe(0);
});

/** Resolved server-side once, this fired in the past for anyone not on UTC. */
test("TIME-06 · 'in N minutes' is worked out on the device's clock", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "In a bit", taskType: "reminder" });
  await deviceClockAt(page, dateKey(0), "14:07");
  await exact(page, "In a bit").click();
  await control(page, /^ONE NUDGE: /).click();
  await see(page, /45 min \| 2:52 PM/);
  await page.getByRole("button", { name: /^45 min/ }).locator("visible=true").last().click();
  await expect.poll(async () => (await api.reminders()).find((r) => r.taskId === t.id && r.isActive)?.reminderTime).toBe("14:52:00");
  expect((await api.getTask(t.id)).scheduledFor).toBe(dateKey(0));
});

test("TIME-07 · a session spanning midnight credits the day it ended, once", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Night owl" });
  const s = await api.startSession(t.id, { plannedMinutes: 25 });
  await api.completeSession(s.id);
  // Rewritten as a real 23:50 → 00:10 session with its twenty minutes credited.
  const { sql } = await import("../harness/db");
  sql(`UPDATE focus_sessions SET started_at = '${dateKey(-1)} 23:50:00', completed_at = '${dateKey(0)} 00:10:00',
       duration_seconds = 1200, points_earned = 20 WHERE id = '${s.id}'`);
  await reload(page);
  const today = await api.today();
  expect(today.focusMinutes).toBe(20);
  expect(today.pointsEarned).toBe(20);
  expect(await stats(page)).toMatchObject({ points: 20, minutes: 20 });
});

/**
 * The next 25-hour day in a zone — the one the clocks go back on, always still ahead of today.
 *
 * Derived from the zone's own rules rather than written down, so the test does not expire the
 * way the hard-coded 1 November 2026 did. A day's length is just the gap between its midnight
 * and the next one.
 */
function nextLongDay(zone: string): string {
  for (let i = 1; i <= 400; i++) {
    const day = dateKey(i, zone);
    const hours =
      (instantAt(dateKey(i + 1, zone), "00:00", zone).getTime() - instantAt(day, "00:00", zone).getTime()) / 3_600_000;
    if (hours === 25) return day;
  }
  throw new Error(`no 25-hour day within a year in ${zone}`);
}

test("TIME-08 · a DST night doesn't repeat or skip a day", async ({ app }) => {
  const zone = "America/Los_Angeles";
  const { api } = app;
  // The date line, across the night the clocks go back (25 hours long).
  const la = await sameAccountIn(app, zone);
  try {
    await la.page.clock.install({ time: instantAt("2026-10-31", "23:30", zone) });
    await la.page.reload();
    await see(la.page, "Saturday 31 October");
    // "hh:mm:ss" — Playwright reads "01:00" as one *minute*.
    await la.page.clock.fastForward("01:00:00");
    await see(la.page, "Sunday 1 November");
    // Sunday 1 November is 25 hours long in LA — 24 would still be Sunday evening.
    await la.page.clock.fastForward("25:00:00");
    await see(la.page, "Monday 2 November");
  } finally {
    await la.close();
  }
  /*
   * A daily routine steps one calendar day at a time across it.
   *
   * The clock above is faked, so the weekend it names can stay written down. This half runs
   * against the real server date, so it cannot: it used to assert 1 and 2 November 2026 and
   * started failing on 3 November, when the server began (correctly) catching the overdue
   * series up to the present. The transition is read out of the zone's own rules instead.
   */
  const longDay = nextLongDay(zone);
  const noon = instantAt(longDay, "12:00", zone);
  await api.task({
    name: "Across DST", taskType: "reminder", scheduledFor: dateKey(-1, zone, noon), recurrenceRule: "FREQ=DAILY",
  });
  const la2 = api.inZone(zone);
  const days: string[] = [];
  for (let i = 0; i < 2; i++) {
    const [live] = (await la2.tasks("pending")).filter((x) => x.name === "Across DST");
    await la2.complete(live.id);
    days.push((await la2.tasks("pending")).find((x) => x.name === "Across DST")!.scheduledFor!);
  }
  expect(days).toEqual([longDay, dateKey(1, zone, noon)]);
});

test("TIME-09 · a month-end series crosses the year boundary", async ({ app }) => {
  const { api } = app;
  await api.task({ name: "Year end", taskType: "reminder", scheduledFor: "2026-12-31", recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=31" });
  const landed: string[] = [];
  for (let i = 0; i < 2; i++) {
    const [live] = (await api.tasks("pending")).filter((x) => x.name === "Year end");
    await api.complete(live.id);
    landed.push((await api.tasks("pending")).find((x) => x.name === "Year end")!.scheduledFor!);
  }
  expect(landed).toEqual(["2027-01-31", "2027-02-28"]);
});

test("TIME-10 · a device clock a day ahead doesn't corrupt anything", async ({ app }) => {
  const { page, api } = app;
  const t = await api.task({ name: "Clock skew", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
  await deviceClockAt(page, dateKey(1), "10:00");
  // The device thinks today's task is yesterday's: shown, overdue, not lost.
  expect(await section(page, "TO DO")).toContain("Clock skew");
  await control(page, "Done: Clock skew").click();
  await expect.poll(async () => (await api.tasks("pending")).filter((x) => x.name === "Clock skew").length).toBe(1);
  await page.waitForTimeout(1_000);
  const live = (await api.tasks("pending")).filter((x) => x.name === "Clock skew");
  expect(live).toHaveLength(1); // exactly one successor, from the server's own day
  expect(live[0].id).not.toBe(t.id);
  expect(live[0].scheduledFor).toBe(dateKey(1));
});

test("TIME-11 · a daily reminder keeps its clock time across DST, in the queue a phone would hold", async ({ app }) => {
  const { api } = app;
  const t = await api.task({ name: "9am daily", taskType: "reminder", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
  const [reminders, intervals, pending] = await Promise.all([api.reminders(), api.intervals(), api.tasks("pending")]);
  const queued = inProcessZone("America/Los_Angeles", () =>
    atMoment(new Date(2026, 9, 29, 12), () => planQueue(reminders, intervals, pending).filter((s) => s.taskId === t.id).map((s) => localClock(s.at)))
  );
  expect(queued).toEqual(Array(7).fill("09:00"));
});

test("TIME-12 · lead times across a month, a year and a leap day land on the right date", async ({ app }) => {
  const { api } = app;
  const cases: [string, string][] = [
    ["2027-01-02", "2026-12-26"],
    ["2028-03-01", "2028-02-23"],
    ["2027-03-01", "2027-02-22"],
  ];
  const ids: string[] = [];
  for (const [due] of cases) {
    ids.push((await api.task({ name: `Due ${due}`, taskType: "reminder", scheduledFor: due, notifications: [{ time: "09:00:00", daysBefore: 7 }] })).id);
  }
  const q = await phoneQueue(api);
  cases.forEach(([due, fires], i) => {
    expect(entriesFor(q, ids[i]), due).toEqual([`Reminder / Due ${due} - due in a week @ ${fires} 09:00`]);
  });
});

test("TIME-13 · a nudge window through the DST night stays evenly spaced in real time", async ({ app }) => {
  const { api } = app;
  const t = await api.task({ name: "Night nudges", taskType: "reminder" });
  await api.nudgeWindow(t.id, "00:30:00", "03:30:00", 30);
  const [reminders, intervals, pending] = await Promise.all([api.reminders(), api.intervals(), api.tasks("pending")]);
  // Evaluated at midnight on the night LA's clocks go back at 02:00.
  const firings = inProcessZone("America/Los_Angeles", () =>
    atMoment(new Date(2026, 10, 1, 0, 0), () => planQueue(reminders, intervals, pending).filter((s) => s.taskId === t.id).map((s) => s.at))
  ).filter((at) => at.getTime() < new Date("2026-11-01T12:00:00Z").getTime());
  const gaps = firings.slice(1).map((at, i) => (at.getTime() - firings[i].getTime()) / 60_000);
  expect(new Set(gaps), `gaps: ${gaps.join(", ")} — ${firings.map((f) => inProcessZone("America/Los_Angeles", () => localStamp(f))).join(", ")}`).toEqual(new Set([30]));
  expect(inProcessZone("America/Los_Angeles", () => localClock(firings[firings.length - 1]))).toBe("03:30");
});

test("TIME-14 · every request carries the device's zone", async ({ app }) => {
  const zone = "America/Los_Angeles";
  const la = await sameAccountIn(app, zone);
  try {
    const seen: string[] = [];
    la.page.on("request", (r) => {
      if (r.url().startsWith(API)) seen.push(`${r.headers()["x-timezone"] ?? "(none)"} ${r.url().slice(API.length)}`);
    });
    await la.page.reload();
    await see(la.page, "TO DO");
    await openTab(la.page, "Progress");
    await la.page.waitForTimeout(1_000);
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.filter((s) => !s.startsWith(`${zone} `))).toEqual([]);
  } finally {
    await la.close();
  }
});

/**
 * The zone used to be read once when the app loaded, on the grounds that it doesn't change
 * mid-session — but an app stays suspended across a flight. Home followed the new zone while every
 * request kept naming the old one, so the day's points went to a different day than the screen.
 */
test("TIME-15 · a traveller's new zone is used without restarting the app", async ({ app }) => {
  const { page } = app;
  const zones: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(API)) zones.push(r.headers()["x-timezone"] ?? "(none)");
  });
  // The zone the device now reports, as the app reads it — Chrome refuses to swap a timezone
  // override Playwright has already set, so the lookup itself is what changes here.
  await page.evaluate(() => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: "America/New_York" };
    };
  });
  await foreground(page);
  await expect.poll(() => zones.length).toBeGreaterThan(0);
  expect(new Set(zones)).toEqual(new Set(["America/New_York"]));
});
