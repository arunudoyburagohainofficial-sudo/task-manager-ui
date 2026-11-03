import { expect, type Page } from "@playwright/test";
import type { Api } from "./api";
import { control, exact, openTask, reload, screenText, see, tab } from "./app";

/**
 * The schedule sheet — When × Repeat × Notify — as a test drives it.
 *
 * **What the browser can't do here.** The native date and time pickers render nothing in
 * react-native-web, so on web a person can choose only No date / Today / Tomorrow, and a
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

/** The repeat summary box: everything from the rule sentence to "Finishing one schedules the next." */
export async function summary(page: Page): Promise<string> {
  const m = /(?:\| )([^|]*?(?:— a one-time reminder\. \| )?[^|]*Finishing one schedules the next\.)/.exec(await sheetText(page));
  return m?.[1] ?? "";
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
