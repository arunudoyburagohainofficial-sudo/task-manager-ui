import { expect, test } from "../harness/fixtures";
import { button, control, dateKey, exact, foreground, openTab, reload, screenText, section, see, stayAbsent } from "../harness/app";
import { db } from "../harness/db";
import { entriesFor, nextSync, phoneQueue, stamp } from "../harness/queue";
import { openReminders, openSchedule, reminderTime, saveAndClose, sheetButton, storedNotifications } from "../harness/sheet";

/**
 * Notifications, as far as a browser can see — plan/11-notifications-ui.md.
 *
 * A browser has no notification queue, so these assert three things that *are* checkable:
 *   - what the app configures and shows (rows, the detail screen, the sheet)
 *   - that the app re-syncs its queue at the moment it should (the GET /reminders it sends)
 *   - what a phone would queue from that data — `phoneQueue()` runs the app's own planQueue on
 *     the lists it syncs, which is everything a phone does short of calling the OS
 * Whether the OS then rings is plan/17-device-only.md.
 */

/** A time later today, on the hour or half hour, at least 20 minutes out; null near midnight. */
function laterToday(): string | null {
  const now = new Date();
  const at = new Date(now.getTime() + 40 * 60_000);
  at.setMinutes(at.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (at.getDate() !== now.getDate()) return null;
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}:00`;
}

test.describe("what's configured, and what a phone would queue", () => {
  test("NOTIF-01 · every configured notification reaches the queue; a silent task doesn't", async ({ app }) => {
    const { page, api } = app;
    const day = await api.task({ name: "Day of", taskType: "reminder", scheduledFor: dateKey(10), notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    const week = await api.task({ name: "Week ahead", taskType: "reminder", scheduledFor: dateKey(10), notifications: [{ time: "18:00:00", daysBefore: 7 }] });
    const nudged = await api.task({ name: "Chase me", taskType: "reminder" });
    await api.nudgeWindow(nudged.id, "00:00:00", "23:59:00", 60);
    const silent = await api.task({ name: "Quiet", taskType: "reminder", scheduledFor: dateKey(10) });

    const q = await phoneQueue(api);
    expect(entriesFor(q, day.id)).toEqual([`Reminder / Day of @ ${dateKey(10)} 09:00`]);
    expect(entriesFor(q, week.id)).toEqual([`Reminder / Week ahead - due in a week @ ${dateKey(3)} 18:00`]);
    expect(entriesFor(q, nudged.id).length).toBeGreaterThan(0);
    expect(entriesFor(q, nudged.id).every((e) => e.startsWith("Still on it? / Checking in on: Chase me"))).toBe(true);
    expect(entriesFor(q, silent.id)).toEqual([]);

    await reload(page);
    await openTab(page, "Scheduled");
    await see(page, /Day of/);
  });

  /** The screen shows the *device's* queue, and says plainly when there isn't one to show. */
  test("NOTIF-02 · the notifications screen is honest when there's no device queue", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "Has one", taskType: "reminder", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await reload(page);
    await openTab(page, "Settings");
    await button(page, /Upcoming notifications/).click();
    await see(page, "Not available in a browser");
    await see(page, "Your notifications are saved and will work in the app on your phone");
  });

  test("NOTIF-03 · turning one off removes it, and the task stops advertising it", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Loud", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "23:30:00", daysBefore: 0 }] });
    await reload(page);
    await see(page, "Loud | Reminder · 11:30 PM");
    await exact(page, "Loud").click();
    await openSchedule(page, "Loud");
    await openReminders(page);
    await sheetButton(page, "Turn off reminders").click();
    const synced = nextSync(page);
    await saveAndClose(page);
    await synced;
    await see(page, "SCHEDULED | Today");
    expect(entriesFor(await phoneQueue(api), t.id)).toEqual([]);
    await control(page, "Back").click();
    await see(page, "Loud | Task · today");
  });

  test("NOTIF-04 · finishing a task takes it out of the queue straight away", async ({ app }) => {
    const time = laterToday();
    test.skip(!time, "needs a notification time still ahead today");
    const { page, api } = app;
    const t = await api.task({ name: "Buzzes later", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: time!, daysBefore: 0 }] });
    await reload(page);
    expect(entriesFor(await phoneQueue(api), t.id)).toHaveLength(1);

    const synced = nextSync(page, 5_000); // at once — not at the next launch
    await control(page, "Done: Buzzes later").click();
    await synced;
    expect(entriesFor(await phoneQueue(api), t.id)).toEqual([]);
  });

  test("NOTIF-05 · deleting a task takes it out of the queue too", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Delete me", taskType: "reminder", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await reload(page);
    await exact(page, "Delete me").click();
    await control(page, "Delete task").click();
    const synced = nextSync(page, 5_000);
    await control(page, "Delete").click();
    await synced;
    expect(entriesFor(await phoneQueue(api), t.id)).toEqual([]);
    expect((await api.reminders()).filter((r) => r.taskId === t.id && r.isActive)).toEqual([]);
  });

  test("NOTIF-06 · undo puts back what finishing took out", async ({ app }) => {
    const time = laterToday();
    test.skip(!time, "needs a notification time still ahead today");
    const { page, api } = app;
    const t = await api.task({ name: "Back again", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: time!, daysBefore: 0 }] });
    await reload(page);
    await control(page, "Done: Back again").click();
    await expect.poll(async () => entriesFor(await phoneQueue(api), t.id)).toEqual([]);

    const synced = nextSync(page, 5_000);
    await button(page, "Undo").click();
    await synced;
    expect(entriesFor(await phoneQueue(api), t.id)).toHaveLength(1);
  });

  /** The sheet warns about a stranded lead time; a bulk move changes dates with no sheet open. */
  test("NOTIF-07 · moving overdue work to today says which reminders can no longer fire", async ({ app }) => {
    const { page, api } = app;
    const a = await api.task({ name: "Late A", taskType: "reminder", scheduledFor: dateKey(0), notifications: [{ time: "09:00:00", daysBefore: 1 }] });
    const b = await api.task({ name: "Late B", taskType: "reminder", scheduledFor: dateKey(0) });
    db.scheduledFor(a.id, dateKey(-2));
    db.scheduledFor(b.id, dateKey(-2));
    await reload(page);
    await openTab(page, "Scheduled");
    await control(page, "Move all 2 overdue tasks to today").click();
    await see(page, "Move all to today?");
    await control(page, "Move all").click();
    await see(page, "Moved 2 tasks to today · 1 reminder can't fire that soon - open it to pick a new time");
    expect((await api.getTask(a.id)).scheduledFor).toBe(dateKey(0));
  });

  test("NOTIF-08 · no path gives a task a fourth notification", async ({ app }) => {
    const { api } = app;
    const four = [0, 1, 2, 3].map((d) => ({ time: "09:00:00", daysBefore: d }));
    await expect(api.task({ name: "Four on create", taskType: "reminder", scheduledFor: dateKey(10), notifications: four })).rejects.toMatchObject({ status: 400 });
    const t = await api.task({ name: "Four on update", taskType: "reminder", scheduledFor: dateKey(10) });
    await expect(api.update(t.id, { notifications: four })).rejects.toMatchObject({ status: 400 });
    expect(await storedNotifications(api, t.id)).toEqual([]);
  });

  test("NOTIF-09 · stopping the nudges leaves the reminder alone", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Both kinds", taskType: "reminder", notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await api.nudgeWindow(t.id, "00:00:00", "23:59:00", 60);
    await reload(page);
    await exact(page, "Both kinds").click();
    await see(page, /KEEP NUDGING \| Every 60 min/);
    await control(page, /^KEEP NUDGING: /).click();
    const synced = nextSync(page);
    await button(page, "Stop nudging").click();
    await synced;
    await see(page, "KEEP NUDGING | Off");

    const q = entriesFor(await phoneQueue(api), t.id);
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((e) => e.startsWith("Reminder / Both kinds"))).toBe(true);
    expect(await storedNotifications(api, t.id)).toEqual(["09:00/0"]);
  });

  test("NOTIF-10 · the in-app reminder modal", async () => {
    test.fixme(true, "Blocked on the app: ReminderNotificationModal is exported but nothing renders it — see plan/11.");
  });
});

test.describe("the queue a phone would hold", () => {
  test("NOTIF-11 · one daily reminder queues a week of firings at the same time", async ({ app }) => {
    const { api } = app;
    const t = await api.task({ name: "Every morning", taskType: "reminder", notifications: [{ time: "07:15:00", daysBefore: 0 }] });
    const q = (await phoneQueue(api)).filter((s) => s.taskId === t.id);
    expect(q).toHaveLength(7);
    expect(new Set(q.map((s) => stamp(s.at).slice(11)))).toEqual(new Set(["07:15"]));
    expect(new Set(q.map((s) => stamp(s.at).slice(0, 10))).size).toBe(7);
  });

  test("NOTIF-12 · a full queue stops at the budget, and every task still gets its next one first", async ({ app }) => {
    const { api } = app;
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await api.task({ name: `Daily ${i}`, taskType: "reminder", notifications: [{ time: "08:00:00", daysBefore: 0 }] })).id);
    }
    const q = await phoneQueue(api);
    expect(q).toHaveLength(50); // 12 × 7 = 84 configured
    for (const id of ids) expect(q.some((s) => s.taskId === id), `task ${id} has nothing queued`).toBe(true);
  });

  test("NOTIF-13 · an early warning says when the task is due; the day-of one doesn't", async ({ app }) => {
    const { api } = app;
    const t = await api.task({
      name: "Dentist",
      taskType: "reminder",
      scheduledFor: dateKey(5),
      notifications: [{ time: "18:00:00", daysBefore: 1 }, { time: "09:00:00", daysBefore: 0 }],
    });
    expect(entriesFor(await phoneQueue(api), t.id)).toEqual([
      `Reminder / Dentist - due tomorrow @ ${dateKey(4)} 18:00`,
      `Reminder / Dentist @ ${dateKey(5)} 09:00`,
    ]);
  });

  test("NOTIF-14 · a focus task and a plain reminder announce themselves differently", async ({ app }) => {
    const { api } = app;
    const focus = await api.task({ name: "Write", taskType: "focus", scheduledFor: dateKey(3), notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    const plain = await api.task({ name: "Call the dentist", taskType: "reminder", scheduledFor: dateKey(3), notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    const q = await phoneQueue(api);
    expect(entriesFor(q, focus.id)[0]).toMatch(/^Time to focus \/ You planned to work on: Write @/);
    expect(entriesFor(q, plain.id)[0]).toMatch(/^Reminder \/ Call the dentist @/);
  });

  test("NOTIF-15 · a snoozed reminder fires at the snooze, not its old time", async ({ app }) => {
    const { api } = app;
    const t = await api.task({ name: "Snoozed", taskType: "reminder", notifications: [{ time: "08:00:00", daysBefore: 0 }] });
    await api.snooze(t.id, 15);
    const [r] = (await api.reminders()).filter((x) => x.taskId === t.id);
    expect(r.snoozedUntil).toBeTruthy();
    const q = entriesFor(await phoneQueue(api), t.id);
    expect(q).toEqual([`Reminder / Snoozed @ ${stamp(new Date(r.snoozedUntil!))}`]);
    const minutesAway = (new Date(r.snoozedUntil!).getTime() - Date.now()) / 60_000;
    expect(minutesAway).toBeGreaterThan(13);
    expect(minutesAway).toBeLessThan(16);
  });

  test("NOTIF-16 · a task finished on another device leaves the queue when the app comes back", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Done elsewhere", taskType: "reminder", notifications: [{ time: "08:00:00", daysBefore: 0 }] });
    await reload(page);
    await see(page, "Done elsewhere");
    await api.complete(t.id);

    const synced = nextSync(page);
    await foreground(page);
    await synced;
    await expect.poll(() => section(page, "TO DO")).not.toContain("Done elsewhere");
    expect(entriesFor(await phoneQueue(api), t.id)).toEqual([]);
  });

  test("NOTIF-17 · two quick changes leave the app holding the second", async ({ app }) => {
    const { page, api } = app;
    const t = await api.task({ name: "Changed twice", taskType: "reminder", scheduledFor: dateKey(3), notifications: [{ time: "09:00:00", daysBefore: 0 }] });
    await reload(page);
    await openTab(page, "Scheduled");
    await exact(page, "Changed twice").click();

    const syncs: string[] = [];
    page.on("response", async (r) => {
      if (r.request().method() === "GET" && /\/api\/reminders$/.test(r.url())) {
        const rows = (await r.json().catch(() => [])) as { taskId: string; reminderTime: string; isActive: boolean }[];
        syncs.push(rows.filter((x) => x.taskId === t.id && x.isActive).map((x) => x.reminderTime).join(","));
      }
    });
    for (const preset of ["Evening", "Night"] as const) {
      await openSchedule(page, "Changed twice");
      await openReminders(page);
      await reminderTime(page, "on the day", preset).click();
      await saveAndClose(page);
    }
    await expect.poll(() => syncs.at(-1)).toBe("21:00:00");
    expect(await storedNotifications(api, t.id)).toEqual(["21:00/0"]);
  });

  /**
   * Completion fires an unawaited background sync that writes whole lists into the cache. The
   * first one landing after the second completion's optimistic update used to put the second task
   * back into TO DO, where it sat until something else refetched.
   */
  test("NOTIF-18 · a sync racing a completion doesn't bring the finished task back", async ({ app }) => {
    const { page, api } = app;
    await api.task({ name: "First", taskType: "reminder" });
    await api.task({ name: "Second", taskType: "reminder" });
    await reload(page);
    await control(page, "Done: First").click();
    await control(page, "Done: Second").click();
    await expect.poll(() => section(page, "DONE")).toMatch(/^2 \|/);
    // "Nothing reappears" is a claim over time, not a moment.
    await stayAbsent(page, /TO DO \| \d+ \| Collapse all[^|]*\| ▾ \| (First|Second) \|/, 3_000);
    expect(await screenText(page)).toContain("All done for today");
  });
});
