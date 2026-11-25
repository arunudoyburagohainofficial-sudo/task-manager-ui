import { expect, freshAccount, test } from "../harness/fixtures";
import { api as apiFor } from "../harness/api";
import { control, dateKey, deviceClockAt, exact, openTab, reload, screenText, section, see } from "../harness/app";
import {
  addReminderButton,
  cancel,
  choice,
  colourOf,
  DANGER,
  dayLabel,
  openReminders,
  openSchedule,
  QUIET,
  reminder,
  reminderLine,
  reminderTime,
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
      ["Anytime", null, "Sits under Anytime on Home until you give it a day"],
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
    await see(page, "SCHEDULED | Anytime");
  });

  test("SHEET-03 · the summary sentence matches what was saved, before and after", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Weekly thing", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Weekly thing");
    await choice(page, "Weekly").click();
    const before = await summary(page);
    expect(before).toBe(`Every week, starting today (${weekdayShort(dateKey(0))}). Tick it off and the next one appears.`);
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
      await choice(page, "No").click();
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
    await see(page, "Give it a day first, then it can repeat.");
    await expect(choice(page, "Daily")).toBeHidden();
    await cancel(page);

    const t = await api.task({ name: "Repeats", taskType: "reminder", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY" });
    await reload(page);
    await exact(page, "Repeats").click();
    await openSchedule(page, "Repeats");
    await choice(page, "Anytime").click();
    // The repeat goes with the date, visibly, rather than being refused on save.
    await see(page, "Give it a day first, then it can repeat.");
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
    const rule = new RegExp(`Weekly on ${others.join(", ")}, starting next week\\. Tick it off and the next one appears\\.`);
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
    await choice(page, "Anytime").click();
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
    expect(await sheetText(page)).not.toContain("Tick it off and the next one appears.");
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
  test("SHEET-11 · three reminders, said earliest first, and no fourth", async ({ app }) => {
    const { page, api } = app;
    const due = dateKey(10);
    const t = await seedAndOpen(page, api, { name: "Three warnings", scheduledFor: due });
    await openSchedule(page, "Three warnings");
    // Saved with a day and no reminder: silent on purpose, so the card offers one rather than adding it.
    expect(await reminderLine(page)).toBe("No reminder");
    await control(page, "Add a reminder").click();
    expect(await reminderLine(page)).toBe(`${dayLabel(due)} at 9:00 AM`);

    await openReminders(page);
    await addReminderButton(page, "The day before").click();
    await addReminderButton(page, "A week before").click();
    await see(page, "That's the most one task can have: 3 reminders.");
    expect(await sheetText(page)).not.toContain("Also remind me earlier");
    // The day itself first, then the earlier ones, each saying its own date.
    expect(await sheetText(page)).toMatch(
      new RegExp(`Remind me on ${dayLabel(due)} at[\\s\\S]*Also remind me on ${dayLabel(dateKey(9))} \\(the day before\\) at[\\s\\S]*Also remind me on ${dayLabel(dateKey(3))} \\(a week before\\) at`)
    );
    await sheetButton(page, "Done").click();
    // Closed again, the line reads in the order the phone will ring.
    expect(await reminderLine(page)).toBe(`${dayLabel(dateKey(3))} at 9:00 AM, ${dayLabel(dateKey(9))} at 6:00 PM and ${dayLabel(due)} at 9:00 AM`);
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/7", "18:00/1", "09:00/0"]);

    // A fourth from anywhere else is refused with a reason, not a server error.
    const fourth = api.update(t.id, {
      notifications: [0, 1, 2, 3].map((d) => ({ time: "09:00:00", daysBefore: d })),
    });
    await expect(fourth).rejects.toMatchObject({ status: 400 });
  });

  test("SHEET-12 · a reminder can be retimed and removed, and turning them off leaves silence", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, {
      name: "Retime",
      scheduledFor: dateKey(3),
      notifications: [{ time: "09:00:00", daysBefore: 1 }, { time: "09:00:00", daysBefore: 0 }],
    });
    await openSchedule(page, "Retime");
    await openReminders(page);
    // Only the extra reminder can be removed on its own; the first goes with "Turn off reminders".
    await expect(reminder(page, "on the day").getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await reminderTime(page, "on the day", "Evening").click();
    await control(page, "Remove the reminder the day before").click();
    await expect(reminder(page, "the day before")).toHaveCount(0);
    await sheetButton(page, "Done").click();
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["18:00/0"]);

    await openSchedule(page, "Retime");
    await openReminders(page);
    await sheetButton(page, "Turn off reminders").click();
    expect(await reminderLine(page)).toBe("No reminder");
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual([]);

    // Off stays off: reopened, it offers one rather than putting one back.
    await openSchedule(page, "Retime");
    expect(await reminderLine(page)).toBe("No reminder");
    await expect(control(page, "Add a reminder")).toBeVisible();
  });

  test("SHEET-13 · an earlier reminder is only offered while it can still ring", async ({ app }) => {
    const { page, api } = app;
    // Due in three days: the day before can ring, a week before already can't.
    await seedAndOpen(page, api, { name: "Three days out", scheduledFor: dateKey(3) });
    await openSchedule(page, "Three days out");
    await control(page, "Add a reminder").click();
    await openReminders(page);
    await expect(addReminderButton(page, "The day before")).toBeVisible();
    await expect(addReminderButton(page, "A week before")).toBeHidden();
    await cancel(page);

    // Due today: both would be in the past, so neither is offered and the row isn't there at all.
    await page.goto("/");
    await seedAndOpen(page, api, { name: "Due today", scheduledFor: dateKey(0) });
    await openSchedule(page, "Due today");
    await control(page, "Add a reminder").click();
    if (!(await sheetButton(page, "Turn off reminders").isVisible())) await openReminders(page);
    await expect(addReminderButton(page, "The day before")).toBeHidden();
    await expect(addReminderButton(page, "A week before")).toBeHidden();
    expect(await sheetText(page)).not.toContain("Also remind me earlier");
    await cancel(page);

    // Due in eight days: a week before is still ahead, so it's offered.
    await page.goto("/");
    await seedAndOpen(page, api, { name: "Eight days out", scheduledFor: dateKey(8) });
    await openSchedule(page, "Eight days out");
    await control(page, "Add a reminder").click();
    await openReminders(page);
    await expect(addReminderButton(page, "A week before")).toBeVisible();
  });

  test("SHEET-14 · a repeat hides the earlier reminders it would make impossible", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Repeat and warn", scheduledFor: dateKey(2) });
    await openSchedule(page, "Repeat and warn");
    await choice(page, "Daily").click();
    await control(page, "Add a reminder").click();
    await openReminders(page);
    // A daily task's next copy is always a day out: "the day before" and "a week before" never come.
    await expect(addReminderButton(page, "The day before")).toBeHidden();
    await expect(addReminderButton(page, "A week before")).toBeHidden();

    // Weekly: the day before fits inside the week, a week before doesn't.
    await choice(page, "Weekly").click();
    await expect(addReminderButton(page, "The day before")).toBeVisible();
    await expect(addReminderButton(page, "A week before")).toBeHidden();

    // Monthly: both fit.
    await choice(page, "Monthly").click();
    await expect(addReminderButton(page, "The day before")).toBeVisible();
    await expect(addReminderButton(page, "A week before")).toBeVisible();
  });

  test("SHEET-15 · a reminder that can't ring is said in red, and clears as soon as it can", async ({ app }) => {
    const { page, api } = app;
    // Saved earlier, before the sheet hid such things - or set up through the API.
    await seedAndOpen(page, api, {
      name: "Fixable",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=DAILY",
      notifications: [{ time: "09:00:00", daysBefore: 0 }, { time: "09:00:00", daysBefore: 7 }],
    });
    await openSchedule(page, "Fixable");
    const closed = "One of these won't ring. Tap Change to see why.";
    await see(page, closed);
    expect(await colourOf(page, closed)).toBe(DANGER);
    await openReminders(page);
    const never = "This repeats too often for a reminder a week before, so it can never ring. Remove it, or repeat less often.";
    await see(page, never);
    expect(await colourOf(page, never)).toBe(DANGER);

    // Monthly is longer than a week: this copy's week-before is gone, the next one's isn't - so no
    // alarm, just the quiet note. No save, no reopen.
    await choice(page, "Monthly").click();
    await see(page, "Too late for this one - starts from the next.");
    expect(await sheetText(page)).not.toMatch(/can never ring|won't ring|not on the ones after/);
  });

  test("SHEET-16 · an undated task's reminder rings every day, and stores no offset", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Every day until" });
    await openSchedule(page, "Every day until");
    // No default here: an undated reminder would ring every day.
    expect(await reminderLine(page)).toBe("No reminder");
    await control(page, "Remind me every day").click();
    expect(await reminderLine(page)).toBe("Every day at 9:00 AM until it's done");
    await openReminders(page);
    await see(page, "Remind me every day until it's done, at");
    await expect(addReminderButton(page, "The day before")).toBeHidden();
    await sheetButton(page, "Done").click();
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/0"]);
    await see(page, "SCHEDULED | 9 AM · every day until done");
  });

  test("SHEET-24 · the undated copy offers no earlier reminders at all", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, { name: "Undated notify", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Undated notify");
    expect(await reminderLine(page)).toBe("Every day at 9:00 AM until it's done");
    await openReminders(page);
    for (const b of ["On the day", "The day before", "A week before"] as const) await expect(addReminderButton(page, b)).toBeHidden();
    expect(await sheetText(page)).not.toContain("Also remind me earlier");
  });

  test("SHEET-25 · changing one reminder's time leaves the others alone", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, {
      name: "Middle one",
      scheduledFor: dateKey(10),
      notifications: [0, 1, 7].map((d) => ({ time: "09:00:00", daysBefore: d })),
    });
    await openSchedule(page, "Middle one");
    await openReminders(page);
    await reminderTime(page, "the day before", "Evening").click();
    await expect(reminderTime(page, "the day before", "Evening")).toHaveAttribute("aria-checked", "true");
    for (const lead of ["on the day", "a week before"] as const) {
      await expect(reminderTime(page, lead, "Morning")).toHaveAttribute("aria-checked", "true");
    }
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/7", "18:00/1", "09:00/0"]);
  });

  test("SHEET-32 · giving an undated task a day brings a reminder with it, and it follows the day", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Gets a day" });
    await openSchedule(page, "Gets a day");
    expect(await reminderLine(page)).toBe("No reminder");

    await choice(page, "Tomorrow").click();
    expect(await reminderLine(page)).toBe(`${dayLabel(dateKey(1))} at 9:00 AM`);
    // Back to Anytime: the default goes, rather than turning into a daily reminder.
    await choice(page, "Anytime").click();
    expect(await reminderLine(page)).toBe("No reminder");
    // And returns with the day, untouched.
    await choice(page, "Tomorrow").click();
    expect(await reminderLine(page)).toBe(`${dayLabel(dateKey(1))} at 9:00 AM`);
    await saveAndClose(page);
    expect((await api.getTask(t.id)).scheduledFor).toBe(dateKey(1));
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/0"]);
  });

  /**
   * "Today" can't simply mean 9 AM - after 9 that reminder would already be gone. It's 9 AM while
   * that's at least half an hour off, then the next full hour at least half an hour ahead, and
   * nothing once there's no "later today" left. The phone's clock is set for each case, so every
   * branch runs whatever time the suite does.
   */
  test("SHEET-36 · today's default reminder is always still ahead", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Do it today", taskType: "reminder" });
    for (const [hhmm, expected] of [
      ["07:00", "9:00 AM"],
      ["08:40", "10:00 AM"],
      ["14:10", "3:00 PM"],
      ["14:40", "4:00 PM"],
      ["21:20", "10:00 PM"],
      ["21:40", null],
    ] as const) {
      await deviceClockAt(page, dateKey(0), hhmm);
      await openSchedule(page, "Do it today");
      await choice(page, "Today").click();
      expect(await reminderLine(page), hhmm).toBe(expected ? `${dayLabel(dateKey(0))} at ${expected}` : "No reminder");
      if (!expected) await expect(control(page, "Add a reminder"), hhmm).toBeVisible();
      await cancel(page);
    }
  });

  test("SHEET-33 · a task saved silent stays silent when its day changes", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Quiet one", scheduledFor: dateKey(0) });
    await openSchedule(page, "Quiet one");
    expect(await reminderLine(page)).toBe("No reminder");
    await choice(page, "Tomorrow").click();
    expect(await reminderLine(page)).toBe("No reminder");
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual([]);

    // Turned off in this same sheet: a new day doesn't put one back either.
    await page.goto("/");
    const u = await seedAndOpen(page, api, { name: "Switched off" });
    await openSchedule(page, "Switched off");
    await choice(page, "Tomorrow").click();
    await openReminders(page);
    await sheetButton(page, "Turn off reminders").click();
    await choice(page, "Today").click();
    expect(await reminderLine(page)).toBe("No reminder");
    await saveAndClose(page);
    expect(await storedNotifications(api, u.id)).toEqual([]);
  });

  test("SHEET-34 · a reminder someone chose stays put when the day changes", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Chosen time" });
    await openSchedule(page, "Chosen time");
    await choice(page, "Tomorrow").click();
    await openReminders(page);
    await reminderTime(page, "on the day", "Night").click();
    await sheetButton(page, "Done").click();
    await choice(page, "Anytime").click();
    // Not the default any more, so it isn't taken away - it becomes the undated kind.
    expect(await reminderLine(page)).toBe("Every day at 9:00 PM until it's done");
    await choice(page, "Tomorrow").click();
    expect(await reminderLine(page)).toBe(`${dayLabel(dateKey(1))} at 9:00 PM`);
    await saveAndClose(page);
    expect(await storedNotifications(api, t.id)).toEqual(["21:00/0"]);
  });

  test("SHEET-35 · times already gone today aren't offered for a reminder that's today", async ({ app }) => {
    const { page, api } = app;
    await deviceClockAt(page, dateKey(0), "14:00"); // Morning and Midday gone, Evening and Night ahead
    await seedAndOpen(page, api, { name: "Later today", scheduledFor: dateKey(0), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Later today");
    await openReminders(page);
    for (const gone of ["Morning", "Midday"] as const) await expect(reminderTime(page, "on the day", gone)).toHaveCount(0);
    for (const ahead of ["Evening", "Night"] as const) await expect(reminderTime(page, "on the day", ahead)).toBeVisible();
    await cancel(page);

    // Tomorrow's reminder offers all four.
    await page.goto("/");
    await seedAndOpen(page, api, { name: "Tomorrow's", scheduledFor: dateKey(1), notifications: [{ time: "21:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Tomorrow's");
    await openReminders(page);
    for (const preset of ["Morning", "Midday", "Evening", "Night"] as const) {
      await expect(reminderTime(page, "on the day", preset)).toBeVisible();
    }
  });
});

test.describe("saving", () => {
  test("SHEET-17 · a save that fails applies nothing and keeps the sheet open", async ({ app }) => {
    const { page, api } = app;
    const t = await seedAndOpen(page, api, { name: "Atomic", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await openSchedule(page, "Atomic");
    await choice(page, "Today").click();
    await choice(page, "Daily").click();
    await openReminders(page);
    await sheetButton(page, "Turn off reminders").click();
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
    const { page, api } = app;
    // The phone's clock at 2 PM, so 9 AM has gone whatever time the suite runs. Only the device's
    // clock moves; everything asserted here is the sheet's own judgement.
    await deviceClockAt(page, dateKey(0), "14:00");
    await seedAndOpen(page, api, {
      name: "Weekly, missed today",
      scheduledFor: dateKey(0),
      recurrenceRule: "FREQ=WEEKLY",
      notifications: [{ time: "09:00:00", daysBefore: 0 }],
    });
    await openSchedule(page, "Weekly, missed today");
    // Nothing is lost, so the closed card raises no alarm either.
    expect(await sheetText(page)).not.toContain("One of these won't ring.");
    await openReminders(page);
    const line = "Too late for this one - starts from the next.";
    await see(page, line);
    expect(await colourOf(page, line)).toBe(QUIET);
  });

  test("SHEET-22 · a reminder that works once and then never is flagged", async ({ app }) => {
    const { page, api } = app;
    await seedAndOpen(page, api, {
      name: "Once only",
      scheduledFor: dateKey(2),
      recurrenceRule: "FREQ=DAILY",
      notifications: [{ time: "09:00:00", daysBefore: 1 }],
    });
    await openSchedule(page, "Once only");
    await see(page, "One of these won't ring. Tap Change to see why.");
    await openReminders(page);
    const line = "Rings this time, but not on the ones after it - this repeats sooner than the day before.";
    await see(page, line);
    expect(await colourOf(page, line)).toBe(DANGER);
  });

  test("SHEET-23 · each 'never' names the cause that actually applies", async ({ app }) => {
    const { page, api } = app;
    await deviceClockAt(page, dateKey(0), "14:00"); // 9 AM gone, whenever the suite runs
    const cases: [Parameters<typeof api.task>[0], string][] = [
      [{ name: "Outrun", scheduledFor: dateKey(0), recurrenceRule: "FREQ=DAILY", notifications: [{ time: "09:00:00", daysBefore: 7 }] },
        "This repeats too often for a reminder a week before, so it can never ring. Remove it, or repeat less often."],
      [{ name: "Passed", scheduledFor: dateKey(0), notifications: [{ time: "09:00:00", daysBefore: 0 }] },
        "9:00 AM has already gone today. Pick a later time."],
      [{ name: "Runway", scheduledFor: dateKey(3), notifications: [{ time: "09:00:00", daysBefore: 7 }] },
        `A week before is ${monthDay(dateKey(-4))}, which has already passed. This one won't ring.`],
    ];
    for (const [task, line] of cases) {
      await page.goto("/");
      await seedAndOpen(page, api, task);
      await openSchedule(page, task.name);
      await see(page, "One of these won't ring. Tap Change to see why.");
      await openReminders(page);
      await see(page, line);
      expect(await colourOf(page, line), task.name).toBe(DANGER);
      await cancel(page);
    }
  });
});

/**
 * The When × Repeat × Notify matrix, built through the sheet rather than the API — the harnesses
 * prove the server honours every combination; this proves the sheet can express each one.
 *
 * Each combination gets a fresh undated task, so it starts the way a new task does: picking a day
 * brings the default reminder, and "none" is reached by turning it off. "The day before" is only
 * offered where it can ring - not on a one-off due today (yesterday), not on a daily repeat (the
 * next copy is always a day out) - and those combinations end with just the one reminder.
 */
test("SHEET-20 · every combination the sheet offers can be built and lands where it should", async ({ app }) => {
  test.setTimeout(400_000);
  const { page, api } = app;
  // The phone's clock at 2 PM: today's default reminder (3 PM) and "the day before" a task due
  // tomorrow (this evening) both still ahead, whatever time the suite runs. SHEET-36 covers the
  // ends of the day, where neither exists.
  await deviceClockAt(page, dateKey(0), "14:00");
  const whens = ["Anytime", "Today", "Tomorrow"] as const;
  const repeats = ["No", "Daily", "Weekly"] as const;
  const notifies = ["none", "on the day", "day before"] as const;
  let built = 0;

  for (const when of whens) {
    for (const repeat of repeats) {
      for (const notify of notifies) {
        if (when === "Anytime" && (repeat !== "No" || notify === "day before")) continue; // not offered
        const label = `${when} / ${repeat} / ${notify}`;
        const name = `Matrix ${built + 1}`;
        await page.goto("/");
        const t = await seedAndOpen(page, api, { name });
        await openSchedule(page, name);
        await choice(page, when).click();
        if (when !== "Anytime") await choice(page, repeat).click();

        const dayBeforeOffered = when !== "Anytime" && repeat !== "Daily" && !(when === "Today" && repeat === "No");
        if (notify === "none") {
          if (when !== "Anytime") {
            await openReminders(page);
            await sheetButton(page, "Turn off reminders").click();
          }
        } else {
          if (when === "Anytime") await control(page, "Remind me every day").click();
          else expect(await reminderLine(page), `${label}: the default reminder`).not.toBe("No reminder");
          if (notify === "day before") {
            await openReminders(page);
            if (dayBeforeOffered) await addReminderButton(page, "The day before").click();
            else await expect(addReminderButton(page, "The day before"), label).toBeHidden();
            await sheetButton(page, "Done").click();
          }
        }
        await saveAndClose(page);

        const saved = await api.getTask(t.id);
        expect(saved.scheduledFor, label).toBe(when === "Anytime" ? null : when === "Today" ? dateKey(0) : dateKey(1));
        expect(saved.recurrenceRule, label).toBe(repeat === "No" || when === "Anytime" ? null : repeat === "Daily" ? "FREQ=DAILY" : "FREQ=WEEKLY");
        const expected = notify === "none" ? 0 : notify === "on the day" || !dayBeforeOffered ? 1 : 2;
        expect((await storedNotifications(api, t.id)).length, label).toBe(expected);
        built++;
      }
    }
  }
  expect(built).toBe(20);
});
