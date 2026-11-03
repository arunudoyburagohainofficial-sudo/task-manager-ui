import { expect, freshAccount, test } from "../harness/fixtures";
import { api as apiFor } from "../harness/api";
import { control, dateKey, deviceClockAt, exact, hourNow, openTab, reload, screenText, section, see } from "../harness/app";
import {
  cancel,
  choice,
  colourOf,
  DANGER,
  openSchedule,
  QUIET,
  save,
  saveAndClose,
  seedAndOpen,
  sheetButton,
  sheetText,
  storedNotifications,
  summary,
  weekday,
} from "../harness/sheet";

/**
 * The schedule sheet — plan/05-schedule-sheet.md.
 *
 * One control sets three independent things, and their combinations are where this app has
 * produced most of its real bugs. It's also the only place that can say a notification will
 * never fire. The arithmetic behind that is proven in `logic/`; these prove the sheet builds the
 * right thing, says the right sentence, and saves it in one piece.
 */

const weekdayShort = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayOfMonth = (key: string) => Number(key.slice(8, 10));
const monthDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Counts the PATCHes a save sends — "one write" is a claim about the wire, not the screen. */
function countPatches(page: import("@playwright/test").Page, taskId: string) {
  const seen: unknown[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith(`/api/tasks/${taskId}`)) seen.push(r.postDataJSON());
  });
  return seen;
}

test.describe("when", () => {
  test("SHEET-01 · no date, today, tomorrow and a picked date all save and land where they say", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "When test" });

    for (const [pick, stored, hint] of [
      ["Today", dateKey(0), "Shows on Home today"],
      ["Tomorrow", dateKey(1), /Waits under Scheduled until/],
      ["No date", null, "Stays on Home until you give it a day"],
    ] as const) {
      await openSchedule(page, "When test");
      await choice(page, pick).click();
      await see(page, hint);
      await saveAndClose(page);
      expect((await api.getTask(t.id)).scheduledFor, pick).toBe(stored);
      await openSchedule(page, "When test");
      await see(page, hint); // reopens showing what was saved
      await cancel(page);
    }

    // A date the browser can't pick (no native picker on web) — the sheet must show it and keep it.
    const later = dateKey(5);
    await api.update(t.id, { scheduledFor: later });
    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /UPCOMING[\s\S]*When test/);
    await exact(page, "When test").click();
    await openSchedule(page, "When test");
    await expect(choice(page, monthDay(later))).toBeVisible();
    await see(page, /Waits under Scheduled until/);
    await saveAndClose(page);
    expect((await api.getTask(t.id)).scheduledFor).toBe(later);
  });

  test("SHEET-02 · clearing the schedule clears all three parts in one write", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, {
      name: "Clear me",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=DAILY",
      notifications: [{ time: "21:00:00", daysBefore: 0 }],
    });
    const patches = countPatches(page, t.id);
    await openSchedule(page, "Clear me");
    await control(page, "Clear schedule").click();
    await expect(control(page, "Save schedule")).toBeHidden();

    const after = await api.getTask(t.id);
    expect(after.scheduledFor).toBeNull();
    expect(after.recurrenceRule).toBeNull();
    expect(await storedNotifications(api, t.id)).toEqual([]);
    expect(patches).toHaveLength(1);
    await see(page, "SCHEDULED | No date");
  });

  test("SHEET-03 · the summary sentence matches what was saved, before and after", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Weekly thing", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Weekly thing");
    await choice(page, "Weekly").click();
    const before = await summary(page);
    expect(before).toBe(`Every week, starting today (${weekdayShort(dateKey(0))}). Finishing one schedules the next.`);
    await saveAndClose(page);
    await see(page, "SCHEDULED | 9 PM · every week");

    await openSchedule(page, "Weekly thing");
    expect(await summary(page)).toBe(before);
  });

  /**
   * The dangerous case is a zone *behind* UTC in the evening: `new Date("YYYY-MM-DD")` and
   * `toISOString()` both give tomorrow there. Kolkata at 23:55 wouldn't catch it; Los Angeles at
   * 20:00 does — it's already 03:00 the next day in UTC.
   */
  test("SHEET-04 · 'Today' late in the evening is the device's today", async ({ browser }) => {
    const zone = "America/Los_Angeles";
    const acct = await freshAccount(browser, zone);
    try {
      const api = apiFor(acct.token, zone);
      await api.clear();
      const today = dateKey(0, zone);
      const t = await api.task({ name: "Late night", taskType: "reminder" });
      await deviceClockAt(acct.page, today, "20:00", zone);
      await exact(acct.page, "Late night").click();
      await openSchedule(acct.page, "Late night");
      await choice(acct.page, "Today").click();
      await saveAndClose(acct.page);
      expect((await api.getTask(t.id)).scheduledFor).toBe(today);
      await control(acct.page, "Back").click();
      await expect.poll(() => section(acct.page, "TO DO")).toContain("Late night");
    } finally {
      await acct.close();
    }
  });
});

test.describe("repeat", () => {
  test("SHEET-05 · every frequency the grammar allows can be built, saved and read back", async ({ app }) => {
    const { page, api } = app;
    const today = dateKey(0);
    const t = await seedAndOpen(page, api, { name: "Every shape", scheduledFor: today });
    const nth = Math.ceil(dayOfMonth(today) / 7);
    const nthCode = `${nth > 4 ? -1 : nth}${weekdayShort(today).slice(0, 2).toUpperCase()}`;

    const shapes: [string, () => Promise<void>, string][] = [
      ["daily", async () => { await choice(page, "Daily").click(); }, "FREQ=DAILY"],
      ["every 3 days", async () => {
        await choice(page, "Daily").click();
        await control(page, "Increase repeat interval").click();
        await control(page, "Increase repeat interval").click();
      }, "FREQ=DAILY;INTERVAL=3"],
      ["Mon/Wed/Fri", async () => {
        await choice(page, "Weekly").click();
        for (const d of ["Mon", "Wed", "Fri"] as const) await weekday(page, d).click();
      }, "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
      ["monthly on a day", async () => { await choice(page, "Monthly").click(); }, `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth(today)}`],
      ["monthly on an nth weekday", async () => {
        await choice(page, "Monthly").click();
        await choice(page, /^The (1st|2nd|3rd|4th|last) /).click();
      }, `FREQ=MONTHLY;BYDAY=${nthCode}`],
      ["yearly", async () => { await choice(page, "Yearly").click(); }, "FREQ=YEARLY"],
    ];

    for (const [name, build, rule] of shapes) {
      await openSchedule(page, "Every shape");
      await choice(page, "Never").click();
      await build();
      const said = await summary(page);
      expect(said, name).not.toBe("");
      await saveAndClose(page);
      expect((await api.getTask(t.id)).recurrenceRule, name).toBe(rule);
      await openSchedule(page, "Every shape");
      expect(await summary(page), `${name} reads back differently`).toBe(said);
      await cancel(page);
    }
  });

  test("SHEET-06 · a repeat needs a date, in both directions", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "No day" });
    await openSchedule(page, "No day");
    await see(page, "Pick a day above to make this repeat.");
    await expect(choice(page, "Daily")).toBeHidden();
    await cancel(page);

    const t = await api.task({ name: "Repeats", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await exact(page, "Repeats").click();
    await openSchedule(page, "Repeats");
    await choice(page, "No date").click();
    // The repeat goes with the date, visibly, rather than being refused on save.
    await see(page, "Pick a day above to make this repeat.");
    await saveAndClose(page);
    const after = await api.getTask(t.id);
    expect(after.scheduledFor).toBeNull();
    expect(after.recurrenceRule).toBeNull();
  });

  test("SHEET-07 · a weekly repeat whose day isn't ticked says so on its own line", async ({ app }) => {
    const { page, api } = app;
    const today = dateKey(0);
    await seedAndOpen(page, api, { name: "Odd start", scheduledFor: today });
    await openSchedule(page, "Odd start");
    await choice(page, "Weekly").click();
    // Three days that aren't today's.
    const all = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
    const others = all.filter((d) => d !== weekdayShort(today)).slice(0, 3);
    for (const d of others) await weekday(page, d).click();

    const text = await sheetText(page);
    const note = `Today (${weekdayShort(today)}) - a one-time reminder.`;
    const rule = new RegExp(`Weekly on ${others.join(", ")}, starting next week\\. Finishing one schedules the next\\.`);
    // Two separate lines: the exception, then the pattern.
    expect(text).toContain(`${note} | `);
    expect(text).toMatch(rule);
  });

  test("SHEET-08 · 'After N times' counts the live one, and the next copy counts one fewer", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Three times", scheduledFor: dateKey(0) });
    await openSchedule(page, "Three times");
    await choice(page, "Daily").click();
    await choice(page, "After").click();
    for (let i = 0; i < 7; i++) await control(page, "Decrease number of times").click(); // 10 → 3
    await see(page, "3 to go, counting today.");
    await saveAndClose(page);
    expect((await api.getTask(t.id)).recurrenceRule).toBe("FREQ=DAILY;COUNT=3");

    await api.complete(t.id);
    const next = (await api.tasks("pending")).find((x) => x.name === "Three times")!;
    expect(next.recurrenceRule).toBe("FREQ=DAILY;COUNT=2");
    await reload(page);
    await openTab(page, "Scheduled");
    await exact(page, "Three times").click();
    await openSchedule(page, "Three times");
    await see(page, "2 to go, counting tomorrow.");
  });

  test("SHEET-09 · 'Forever' stores no end at all", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Forever", scheduledFor: dateKey(0) });
    await openSchedule(page, "Forever");
    await choice(page, "Weekly").click();
    await choice(page, "After").click();
    await choice(page, "Forever").click();
    expect(await summary(page)).not.toMatch(/to go|until|left/);
    await saveAndClose(page);
    expect((await api.getTask(t.id)).recurrenceRule).toBe("FREQ=WEEKLY");
  });

  /** An anchor left behind drifts the series for ever: Jan 31 → Feb 28 → Mar 28 → … */
  test("SHEET-10 · moving a monthly task's date re-anchors the rule", async ({ app }) => {
    const { page, api } = app;
    const tomorrow = dateKey(1);
    test.skip(dayOfMonth(tomorrow) === 1, "today and tomorrow are in different months");
    const t = await seedAndOpen(page, api, { name: "Monthly", scheduledFor: tomorrow, recurrenceRule: `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth(tomorrow)}` });
    await openSchedule(page, "Monthly");
    await choice(page, "Today").click();
    await saveAndClose(page);
    const after = await api.getTask(t.id);
    expect(after.scheduledFor).toBe(dateKey(0));
    expect(after.recurrenceRule).toBe(`FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth(dateKey(0))}`);
  });

  test("SHEET-26 · turning the date off drops the repeat in the same single write", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Undate", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    const patches = countPatches(page, t.id);
    await openSchedule(page, "Undate");
    await choice(page, "No date").click();
    await saveAndClose(page);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ clearScheduledFor: true, clearRecurrence: true });
    expect((await api.getTask(t.id)).recurrenceRule).toBeNull();
  });

  test("SHEET-27 · the saved rule is the canonical string, whatever order days were tapped", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Canonical", scheduledFor: dateKey(0) });
    await openSchedule(page, "Canonical");
    await choice(page, "Weekly").click();
    await weekday(page, "Wed").click();
    await weekday(page, "Mon").click();
    await saveAndClose(page);
    expect((await api.getTask(t.id)).recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });

  test("SHEET-28 · yearly offers no day controls — the task's date is the answer", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Birthday", scheduledFor: dateKey(0) });
    await openSchedule(page, "Birthday");
    await choice(page, "Yearly").click();
    await expect(weekday(page, "Mon")).toBeHidden();
    await expect(choice(page, /^Day \d+$/)).toBeHidden();
    await saveAndClose(page);
    expect((await api.getTask(t.id)).recurrenceRule).toBe("FREQ=YEARLY");
  });

  test("SHEET-29 · reopening shows what was stored, not what was last typed", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Undo my edits", scheduledFor: dateKey(0) });
    await openSchedule(page, "Undo my edits");
    await choice(page, "Tomorrow").click();
    await choice(page, "Monthly").click();
    await cancel(page);
    await openSchedule(page, "Undo my edits");
    await see(page, "Shows on Home today");
    expect(await sheetText(page)).not.toContain("Finishing one schedules the next.");
  });

  /**
   * The sheet used to re-seed from the task's stored values whenever they changed — and the
   * reminders list is refetched in the background every time the app returns to the foreground.
   * Switching apps mid-edit wiped every unsaved choice.
   */
  test("SHEET-31 · switching apps mid-edit keeps what you'd chosen", async ({ app }) => {
    const { page, api } = app;
    const { background, foreground } = await import("../harness/app");
    const t = await seedAndOpen(page, api, { name: "Interrupted", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Interrupted");
    await choice(page, "Tomorrow").click();
    await choice(page, "Weekly").click();
    const synced = page.waitForResponse((r) => r.url().endsWith("/api/reminders"));
    await background(page);
    await foreground(page);
    await synced;
    await page.waitForTimeout(500);
    await see(page, /Every week, starting tomorrow/);
    await saveAndClose(page);
    const saved = await api.getTask(t.id);
    expect(saved.scheduledFor).toBe(dateKey(1));
    expect(saved.recurrenceRule).toBe("FREQ=WEEKLY");
  });

  test("SHEET-30 · the monthly anchor reads off the stored anchor until the save lands", async ({ app }) => {
    const { page, api } = app;
    const tomorrow = dateKey(1);
    test.skip(dayOfMonth(tomorrow) === 1, "today and tomorrow are in different months");
    await seedAndOpen(page, api, { name: "Anchored", scheduledFor: tomorrow, recurrenceRule: `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth(tomorrow)}` });
    await openSchedule(page, "Anchored");
    await expect(choice(page, `Day ${dayOfMonth(tomorrow)}`)).toBeVisible();
    await choice(page, "Today").click();
    // The date moved; the rule hasn't yet, and the chip mustn't pretend it has.
    await expect(choice(page, `Day ${dayOfMonth(tomorrow)}`)).toBeVisible();
  });
});

test.describe("notify", () => {
  test("SHEET-11 · three notifications, earliest first, and no fourth", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Three warnings", scheduledFor: dateKey(10) });
    await openSchedule(page, "Three warnings");
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 day before").click();
    await sheetButton(page, "+ 1 week before").click();
    await see(page, "3 notifications is the limit for one task.");
    expect(await sheetText(page)).toMatch(/7 days before[\s\S]*1 day before[\s\S]*On the day/);
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/7", "09:00/1", "09:00/0"]);

    // A fourth from anywhere else is refused with a reason, not a server error.
    const fourth = api.update(t.id, {
      notifications: [0, 1, 2, 3].map((d) => ({ time: "09:00:00", daysBefore: d })),
    });
    await expect(fourth).rejects.toMatchObject({ status: 400 });
  });

  test("SHEET-12 · a notification can be retimed and removed, and removing the last leaves silence", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, {
      name: "Retime",
      scheduledFor: dateKey(3),
      notifications: [{ time: "09:00:00", daysBefore: 1 }, { time: "09:00:00", daysBefore: 0 }],
    });
    await openSchedule(page, "Retime");
    await control(page, /Change the time for 9:00 AM · on the day/).click();
    await choice(page, "Evening").click();
    await control(page, /Change the time for 9:00 AM · 1 day before/).click();
    await page.getByLabel("Remove this notification").locator("visible=true").first().click();
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["18:00/0"]);

    await openSchedule(page, "Retime");
    await control(page, "Remove this notification").click();
    await see(page, "Off - no notification.");
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual([]);
  });

  test("SHEET-13 · a lead time longer than the runway is warned about, in red, and stays warned", async ({ app }) => {
    const { page, api } = app;
    const due = dateKey(3);
    await seedAndOpen(page, api, { name: "Too soon", scheduledFor: due });
    await openSchedule(page, "Too soon");
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 week before").click();
    const warning = `That lands on ${monthDay(dateKey(-4))}, already past - it won't fire. Try a shorter warning or a later date.`;
    await see(page, warning);
    expect(await colourOf(page, warning)).toBe(DANGER);
    await saveAndClose(page);
    await openSchedule(page, "Too soon");
    await see(page, warning);
  });

  test("SHEET-14 · a lead time a short repeat outruns is warned about", async ({ app }) => {
    const { page, api } = app;
    // Due today: this occurrence's warning is already a week gone, and every copy after it is a
    // day apart — nothing can ever fire.
    await seedAndOpen(page, api, { name: "Daily with a week", scheduledFor: dateKey(0) });
    await openSchedule(page, "Daily with a week");
    await choice(page, "Daily").click();
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 week before").click();
    const never = "This repeats more often than the warning, so it can never fire. Shorten the warning, or repeat less often.";
    await see(page, never);
    expect(await colourOf(page, never)).toBe(DANGER);
    await cancel(page);

    // Due in ten days: this one fires, the copies after it can't — still a warning, and a different one.
    await page.goto("/");
    await seedAndOpen(page, api, { name: "Daily, far off", scheduledFor: dateKey(10) });
    await openSchedule(page, "Daily, far off");
    await choice(page, "Daily").click();
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 week before").click();
    const once = "Fires this time, but not on the copies after it - this repeats sooner than the warning.";
    await see(page, once);
    expect(await colourOf(page, once)).toBe(DANGER);
  });

  test("SHEET-15 · the warning clears as soon as the configuration can fire", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Fixable", scheduledFor: dateKey(0) });
    await openSchedule(page, "Fixable");
    await choice(page, "Daily").click();
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 week before").click();
    await see(page, /can never fire/);
    // Monthly is longer than a week: this occurrence's warning is still too late, but the next one's
    // isn't — so no alarm, just the quiet note. No save, no reopen.
    await choice(page, "Monthly").click();
    await see(page, "Too late for this one - starts from the next.");
    expect(await sheetText(page)).not.toMatch(/can never fire|won't fire|not on the copies/);
  });

  test("SHEET-16 · an undated task's notification says it repeats daily, and stores no offset", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Every day until" });
    await openSchedule(page, "Every day until");
    await sheetButton(page, "Notify me").click();
    await see(page, "Every day until you finish it.");
    await expect(sheetButton(page, "+ 1 day before")).toBeHidden();
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/0"]);
    await see(page, "SCHEDULED | 9 AM · every day until done");
  });

  test("SHEET-24 · the undated copy offers no lead times at all", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Undated notify", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Undated notify");
    // The Change pill sits between the time and its lead-time label.
    await see(page, /9:00 AM \| Change \| Every day/);
    await see(page, "Every day until you finish it.");
    for (const b of ["+ 1 day before", "+ 1 week before"]) await expect(sheetButton(page, b)).toBeHidden();
  });

  test("SHEET-25 · changing one notification's time leaves the others alone", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Middle one", scheduledFor: dateKey(10) });
    await openSchedule(page, "Middle one");
    await sheetButton(page, "Notify me").click();
    await sheetButton(page, "+ 1 day before").click();
    await sheetButton(page, "+ 1 week before").click();
    await control(page, /Change the time for 9:00 AM · 1 day before/).click();
    await choice(page, "Evening").click();
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/7", "18:00/1", "09:00/0"]);
  });
});

test.describe("saving", () => {
  test("SHEET-17 · a save that fails applies nothing and keeps the sheet open", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Atomic", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Atomic");
    await choice(page, "Today").click();
    await choice(page, "Daily").click();
    await control(page, "Remove this notification").click();
    await page.route(new RegExp(`/api/tasks/${t.id}$`), (r) => (r.request().method() === "PATCH" ? r.fulfill({ status: 500, body: "{}" }) : r.fallback()));
    await save(page);
    await page.waitForTimeout(1_000);
    // Still open, still holding what was chosen.
    await expect(control(page, "Save schedule")).toBeVisible();
    await see(page, "Every day, starting today");
    const after = await api.getTask(t.id);
    expect(after.scheduledFor).toBeNull();
    expect(after.recurrenceRule).toBeNull();
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/0"]);
  });

  test("SHEET-18 · a rule the server refuses isn't shown as saved", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Refused", scheduledFor: dateKey(0) });
    await openSchedule(page, "Refused");
    await choice(page, "Weekly").click();
    await page.route(new RegExp(`/api/tasks/${t.id}$`), (r) =>
      r.request().method() === "PATCH" ? r.fulfill({ status: 400, contentType: "application/json", body: '{"message":"Unsupported recurrence rule"}' }) : r.fallback()
    );
    await save(page);
    await page.waitForTimeout(1_000);
    await expect(control(page, "Save schedule")).toBeVisible();
    await see(page, "Every week, starting today");
    expect((await api.getTask(t.id)).recurrenceRule).toBeNull();
  });

  /**
   * Seeding the picker with a past date while forbidding past dates crashed Android's picker
   * outright. The crash is device-only; the value logic that caused it isn't.
   */
  test("SHEET-19 · an overdue task's sheet opens on today, not the past, and moves it forward", async ({ app }) => {
    const { page, api } = app;
    const { db } = await import("../harness/db");
    const t = await api.task({ name: "Overdue one", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(t.id, dateKey(-4));
    await reload(page);
    await exact(page, "Overdue one").click();
    await openSchedule(page, "Overdue one");
    await see(page, "Shows on Home today");
    await choice(page, "Tomorrow").click();
    await saveAndClose(page);
    expect((await api.getTask(t.id)).scheduledFor).toBe(dateKey(1));
  });
});

test.describe("what the sheet says about a notification", () => {
  test("SHEET-21 · the self-correcting case is quiet, not red", async ({ app }) => {
    test.skip(hourNow() < 10, "needs a preset time (9 AM) that has already passed today");
    const { page, api } = app;
    await seedAndOpen(page, api, {
      name: "Weekly, missed today",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=WEEKLY",
      notifications: [{ time: "09:00:00", daysBefore: 0 }],
    });
    await openSchedule(page, "Weekly, missed today");
    const line = "Too late for this one - starts from the next.";
    await see(page, line);
    expect(await colourOf(page, line)).toBe(QUIET);
  });

  test("SHEET-22 · a warning that works once and then never is flagged", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, {
      name: "Once only",
      scheduledFor: dateKey(2),
      recurrenceRule: "FREQ=DAILY",
      notifications: [{ time: "09:00:00", daysBefore: 1 }],
    });
    await openSchedule(page, "Once only");
    const line = "Fires this time, but not on the copies after it - this repeats sooner than the warning.";
    await see(page, line);
    expect(await colourOf(page, line)).toBe(DANGER);
  });

  test("SHEET-23 · each 'never' names the cause that actually applies", async ({ app }) => {
    test.skip(hourNow() < 10, "needs a preset time (9 AM) that has already passed today");
    const { page, api } = app;
    const cases: [Parameters<typeof api.task>[0], string][] = [
      [{ name: "Outrun", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY", notifications: [{ time: "09:00:00", daysBefore: 7 }] },
        "This repeats more often than the warning, so it can never fire. Shorten the warning, or repeat less often."],
      [{ name: "Passed", scheduledFor: dateKey(0), notifications: [{ time: "09:00:00", daysBefore: 0 }] },
        "That time has already passed today - it won't fire. Pick a later time."],
      [{ name: "Runway", scheduledFor: dateKey(3), notifications: [{ time: "09:00:00", daysBefore: 7 }] },
        `That lands on ${monthDay(dateKey(-4))}, already past - it won't fire. Try a shorter warning or a later date.`],
    ];
    for (const [task, line] of cases) {
      await page.goto("/");
      await seedAndOpen(page, api, task);
      await openSchedule(page, task.name);
      await see(page, line);
      expect(await colourOf(page, line), task.name).toBe(DANGER);
      await cancel(page);
    }
  });
});

/**
 * The When × Repeat × Notify matrix, built through the sheet rather than the API — the harnesses
 * prove the server honours every combination; this proves the sheet can express each one.
 */
test("SHEET-20 · every combination the sheet offers can be built and lands where it should", async ({ app }) => {
  test.setTimeout(300_000);
  const { page, api } = app;
  const t = await seedAndOpen(page, api, { name: "Matrix" });
  const whens = ["No date", "Today", "Tomorrow"] as const;
  const repeats = ["Never", "Daily", "Weekly"] as const;
  const notifies = ["none", "on the day", "day before"] as const;
  let built = 0;

  for (const when of whens) {
    for (const repeat of repeats) {
      for (const notify of notifies) {
        if (when === "No date" && (repeat !== "Never" || notify === "day before")) continue; // not offered
        await openSchedule(page, "Matrix");
        await control(page, "Remove this notification").click().catch(() => undefined);
        await control(page, "Remove this notification").click({ timeout: 500 }).catch(() => undefined);
        await choice(page, when).click();
        if (when !== "No date") await choice(page, repeat).click();
        if (notify !== "none") await sheetButton(page, "Notify me").click();
        if (notify === "day before") await sheetButton(page, "+ 1 day before").click();
        await saveAndClose(page);

        const label = `${when} / ${repeat} / ${notify}`;
        const saved = await api.getTask(t.id);
        expect(saved.scheduledFor, label).toBe(when === "No date" ? null : when === "Today" ? dateKey(0) : dateKey(1));
        expect(saved.recurrenceRule, label).toBe(repeat === "Never" || when === "No date" ? null : repeat === "Daily" ? "FREQ=DAILY" : "FREQ=WEEKLY");
        expect((await storedNotifications(api, t.id)).length, label).toBe(notify === "none" ? 0 : notify === "on the day" ? 1 : 2);
        built++;
      }
    }
  }
  expect(built).toBe(20);
});
