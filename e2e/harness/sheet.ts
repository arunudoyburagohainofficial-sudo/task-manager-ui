import { expect, type Page } from "@playwright/test";
import type { Api } from "./api";
import { control, exact, openTask, reload, screenText, see, tab } from "./app";

/**
 * The schedule sheet — When × Repeat × Notify — as a test drives it.
 *
 * **What the browser can't do here.** The native date and time pickers render nothing in
 * react-native-web, so on web a person can choose only Anytime / Today / Tomorrow, and a
 * notification's time only from the four preset chips. Any other date is seeded through the API
 * and the sheet is then asked to show and preserve it; picking one by hand is device-only
 * (plan/17-device-only.md).
 *
 * **Errors.** Task Detail reports a failed save with `Alert.alert`, which react-native-web
 * implements as a no-op. The browser therefore can't see "Couldn't save schedule"; tests assert
 * what it *can* — the sheet stayed open, the input survived, nothing half-saved.
 */

/** Warning red (`color.danger`) and the quiet note grey (`color.textFaint`) from src/theme. */
export const DANGER = "rgb(157, 19, 27)";
export const QUIET = "rgb(151, 161, 157)";

const front = (l: ReturnType<Page["getByRole"]>) => l.locator("visible=true").last();

/** Opens a task and its schedule sheet. */
export async function openSchedule(page: Page, taskName: string): Promise<void> {
  if (!(await screenText(page)).startsWith(`${taskName} |`)) await openTask(page, taskName);
  await control(page, /^SCHEDULED: /).click();
  await see(page, /Edit schedule|Set a schedule/);
}

/** One of the sheet's single-choice chips: When, Repeat, Ends, the monthly anchor, a time preset. */
export const choice = (page: Page, label: string | RegExp) =>
  front(page.getByRole("radio", { name: typeof label === "string" ? new RegExp(`^${escape(label)}$`) : label }));

export const weekday = (page: Page, short: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun") =>
  front(page.getByRole("checkbox", { name: short, exact: true }));

/** Plain buttons in the sheet by their printed words: "Notify me", "+ 1 day before", "Cancel". */
export const sheetButton = (page: Page, text: string) => front(page.getByRole("button", { name: text, exact: true }));

export async function save(page: Page): Promise<void> {
  await control(page, "Save schedule").click();
}

/** Saves and waits for the sheet to close — a save that silently failed would leave it open. */
export async function saveAndClose(page: Page): Promise<void> {
  await save(page);
  await expect(control(page, "Save schedule")).toBeHidden({ timeout: 10_000 });
}

export async function cancel(page: Page): Promise<void> {
  await sheetButton(page, "Cancel").click();
  await expect(control(page, "Save schedule")).toBeHidden();
}

/** The sheet's own text — everything after its title. */
export async function sheetText(page: Page): Promise<string> {
  const text = await screenText(page);
  const at = Math.max(text.lastIndexOf("Edit schedule"), text.lastIndexOf("Set a schedule"));
  return at >= 0 ? text.slice(at) : "";
}

/** The repeat summary box: everything from the rule sentence to "Tick it off and the next one appears." */
export async function summary(page: Page): Promise<string> {
  const m = /(?:\| )([^|]*?(?:— a one-time reminder\. \| )?[^|]*Tick it off and the next one appears\.)/.exec(await sheetText(page));
  return m?.[1] ?? "";
}

/*
 * The reminder card ("Remind you?"), rebuilt 2026-11-26.
 *
 * Closed, it is one line - exactly when the phone will ring - and one button: "Change" when there
 * are reminders, "Add one" on a dated task without, "Remind me daily" on an undated one. Open, each
 * reminder is a named group ("Reminder on the day", "Reminder the day before", "Reminder a week
 * before") holding its own row of time chips, so a chip is always found inside its reminder.
 */

/** How a reminder's group is named: the offset as the sheet says it mid-sentence. */
export type Lead = "on the day" | "the day before" | "a week before";

/** The closed card's one line: "Sat, Dec 5 at 6:00 PM and Sun, Dec 6 at 9:00 AM", or "No reminder". */
export async function reminderLine(page: Page): Promise<string> {
  return /Remind you\? \| ([^|]*) \|/.exec(await sheetText(page))?.[1] ?? "";
}

/** Opens the card from its summary line. */
export async function openReminders(page: Page): Promise<void> {
  await control(page, "Change the reminders").click();
  await expect(sheetButton(page, "Turn off reminders")).toBeVisible();
}

/** One reminder's group, for scoping its chips and its Remove. */
export const reminder = (page: Page, lead: Lead) =>
  page.getByRole("group", { name: `Reminder ${lead}`, exact: true }).locator("visible=true").last();

/** A preset time inside one reminder - "Evening" picks "Evening · 6 PM" there and nowhere else. */
export const reminderTime = (page: Page, lead: Lead, preset: "Morning" | "Midday" | "Evening" | "Night") =>
  reminder(page, lead).getByRole("radio", { name: new RegExp(`^${preset} · `) });

/** "+ The day before" / "+ A week before" / "+ On the day" - the add buttons under the reminders. */
export const addReminderButton = (page: Page, label: "On the day" | "The day before" | "A week before") =>
  sheetButton(page, `+ ${label}`);

/** "Sat, Dec 5" - the day a reminder rings on, as the card prints it (en-US, the suite's locale). */
export function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** The colour a line of text is drawn in. */
export async function colourOf(page: Page, text: string): Promise<string> {
  return exact(page, text).evaluate((el) => getComputedStyle(el).color);
}

/** The stored notifications for one task, earliest warning first, as "HH:mm/daysBefore". */
export async function storedNotifications(api: Api, taskId: string): Promise<string[]> {
  return (await api.reminders())
    .filter((r) => r.taskId === taskId && r.isActive && r.reminderTime)
    .sort((a, b) => (b.daysBefore ?? 0) - (a.daysBefore ?? 0))
    .map((r) => `${r.reminderTime!.slice(0, 5)}/${r.daysBefore ?? 0}`);
}

/** A dated task seeded through the API and opened on Task Detail, ready for its sheet. */
export async function seedAndOpen(page: Page, api: Api, task: Parameters<Api["task"]>[0]) {
  const t = await api.task({ taskType: "reminder", ...task });
  await reload(page);
  // Undated and today's tasks are on Home; anything else is reached through Scheduled.
  if (!(await screenText(page)).includes(task.name)) {
    await tab(page, "Scheduled").click();
    await see(page, task.name);
  }
  await exact(page, task.name).click();
  await see(page, new RegExp(`^${escape(task.name)} \\|`));
  return t;
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
