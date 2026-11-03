import { expect, type Locator, type Page } from "@playwright/test";
import { ZONE } from "./api";

/**
 * Opening the app, finding things on it, and asserting on what a person can read.
 *
 * **Every assertion here waits.** The first version of this suite read the screen once with
 * `expect(await screenText(page))`, and a third of its failures were that snapshot racing the
 * app — reading a page mid-reload, or a screen before a switch had re-rendered. `see()` and
 * `dontSee()` poll until the screen agrees or the timeout says it never will.
 *
 * **Text matching is exact where it matters.** Playwright's `getByText("Task complete")` is a
 * case-insensitive substring match, so it matched the *button* "Mark task complete 🎉" and passed
 * before the screen it was meant to find had appeared. `exact()` exists for that.
 */

/**
 * Marks this browser as one that has met the app before, so the two first-run screens stand
 * aside: onboarding (which runs before sign-in) and the walkthrough (which runs after it).
 *
 * Both are deliberately opt-out rather than opt-in, because they cover the screen and swallow
 * every tap — a test that didn't think about them would fail for the wrong reason. ONBOARD-* and
 * TOUR-* opt back in: `keepTour` for the walkthrough, a fresh context for onboarding.
 */
export async function skipFirstRun(page: Page): Promise<void> {
  await hideDevServerOverlay(page);
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("e2e-keep-tour")) localStorage.setItem("tour-v1", JSON.stringify({ finished: true }));
      localStorage.setItem("onboarding-v1", JSON.stringify({ finished: true }));
    } catch {
      // Storage blocked — both first-run flows just run.
    }
  });
}

/**
 * Hides Expo's Fast Refresh indicator.
 *
 * The dev server injects a fixed 42x42 badge at the bottom-left, z-index 9999, which lands
 * exactly on top of the Home tab - and it animates. It cost two failures that looked like real
 * bugs: A11Y-03 reported ~9,800 pixels moving with Reduce Motion on, and VIS-03's tab-bar
 * baseline drifted by 4%. Neither was the app; the badge only appears after the dev server has
 * reconnected, so it comes and goes depending on whether Metro was restarted mid-session.
 *
 * Hidden rather than worked around in each test, because it is not part of the product and no
 * assertion should ever have to know it exists.
 */
async function hideDevServerOverlay(page: Page): Promise<void> {
  await page.addStyleTag({ content: ".__expo_fast_refresh { display: none !important; }" }).catch(() => undefined);
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent = ".__expo_fast_refresh { display: none !important; }";
      document.head?.appendChild(style);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
}

export async function openApp(page: Page): Promise<void> {
  await skipFirstRun(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByText("TO DO").first()).toBeVisible({ timeout: 60_000 });
}

export async function signIn(page: Page): Promise<void> {
  const button = page.getByLabel("Continue as test user");
  await expect(button.or(page.getByText("TO DO")).first()).toBeVisible({ timeout: 60_000 });
  if (await button.count()) await button.first().click();
}

/** Reloads and waits for Home to have data in it again. */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByText("TO DO").locator("visible=true").first()).toBeVisible({ timeout: 60_000 });
}

/* ───────────────────────────── finding things ───────────────────────────── */

/**
 * Every mounted screen's DOM stays in the page on web, so a plain match finds controls on the
 * screen *underneath* the one on display. Filtering to visible and taking the last rendered is
 * how "the screen in front" is expressed.
 */
const front = (l: Locator) => l.locator("visible=true").last();

/** A control by the name a screen reader would read. */
export const control = (page: Page, name: string | RegExp) => front(page.getByLabel(name, { exact: typeof name === "string" }));

/** A control by the words printed on it. */
export const button = (page: Page, text: string | RegExp) =>
  front(page.locator('[role="button"], button, [role="tab"], [role="radio"], [role="switch"]').filter({ hasText: text }));

/** Text on the screen in front — substring, case-insensitive. Use `exact()` for a whole line. */
export const visible = (page: Page, text: string | RegExp) => front(page.getByText(text));

/** Text that is exactly this, and nothing longer that happens to contain it. */
export const exact = (page: Page, text: string) => front(page.getByText(text, { exact: true }));

/**
 * What a person can read right now, lines joined with " | ".
 *
 * Only the screen in front, plus any sheet or dialog open over it. On web every mounted screen
 * keeps its DOM — the tabs you've visited and the stack underneath a pushed screen — and
 * `innerText` reports all of them, so "the task is gone from this screen" would otherwise be
 * checked against screens the person can't see.
 *
 * The front screen is found the way a finger finds it: hit-test the middle of the viewport, then
 * walk up to the first ancestor that sits among sibling screens (a navigator's children all fill
 * the viewport; ordinary layout doesn't). Sheets and dialogs render in portals outside the app
 * root, so they're read separately.
 */
export async function screenText(page: Page): Promise<string> {
  const text = await page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const fills = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width >= W * 0.95 && r.height >= H * 0.6;
    };
    const root = document.getElementById("root") ?? document.body;

    let screen: HTMLElement | null = null;
    for (const y of [0.35, 0.5, 0.2, 0.65]) {
      let el = document.elementFromPoint(W / 2, H * y) as HTMLElement | null;
      // A sheet's backdrop sits over everything; look underneath it for the screen.
      while (el && !root.contains(el)) {
        el.style.pointerEvents = "none";
        const under = document.elementFromPoint(W / 2, H * y) as HTMLElement | null;
        el.style.pointerEvents = "";
        if (under === el) break;
        el = under;
      }
      for (let node = el; node && node !== root; node = node.parentElement) {
        const parent = node.parentElement;
        if (!parent || !fills(node)) continue;
        const siblingScreens = Array.from(parent.children).filter((c) => c !== node && fills(c));
        if (siblingScreens.length > 0) {
          screen = node;
          break;
        }
      }
      if (screen) break;
    }

    const parts = [(screen ?? root).innerText];

    // Overlays inside the app root but outside every screen — toasts, the session prompt — that
    // are genuinely on top: visible in the viewport and not covered by anything else. The tab
    // bar is skipped; its labels are on every screen and say nothing about any of them.
    if (screen) {
      const seen = new Set<Element>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.textContent?.trim() || screen.contains(el) || seen.has(el)) continue;
        if (el.closest('[role="tablist"]') || el.closest('[role="tab"]') || el.closest('[aria-label="Capture tasks"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom <= 0 || r.top >= H) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && (hit === el || el.contains(hit) || hit.contains(el))) {
          seen.add(el);
          parts.push(el.innerText);
        }
      }
    }
    // Sheets and dialogs: portals appended to <body>, outside the app root.
    for (const child of Array.from(document.body.children)) {
      if (child === root || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(child.tagName)) continue;
      const t = (child as HTMLElement).innerText?.trim();
      if (t) parts.push(t);
    }
    return parts.join("\n");
  });
  return text.replace(/\n+/g, " | ");
}

/** Everything in the page, hidden screens included — for the rare assertion that means "anywhere". */
export async function pageText(page: Page): Promise<string> {
  return (await page.innerText("body")).replace(/\n+/g, " | ");
}

/* ───────────────────────────── asserting ───────────────────────────── */

const asPattern = (p: string | RegExp) => (typeof p === "string" ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : p);

/** Waits until the screen reads `pattern`. A string is a literal substring. */
export async function see(page: Page, pattern: string | RegExp, timeout = 15_000): Promise<void> {
  await expect.poll(() => screenText(page), { timeout, message: `screen never showed ${pattern}` }).toMatch(asPattern(pattern));
}

/** Waits until the screen no longer reads `pattern`. */
export async function dontSee(page: Page, pattern: string | RegExp, timeout = 15_000): Promise<void> {
  await expect.poll(() => screenText(page), { timeout, message: `screen still shows ${pattern}` }).not.toMatch(asPattern(pattern));
}

/** Asserts `pattern` stays absent for a while — for "nothing happened" claims, which can't be polled into truth. */
export async function stayAbsent(page: Page, pattern: string | RegExp, forMs = 1_500): Promise<void> {
  const deadline = Date.now() + forMs;
  while (Date.now() < deadline) {
    expect(await screenText(page), `${pattern} appeared`).not.toMatch(asPattern(pattern));
    await page.waitForTimeout(250);
  }
}

/**
 * The text of Home's sections. Section headers and counts are separate text nodes, so this reads
 * `TO DO | 3 | …` style runs and lets a test ask what's in which section.
 */
export async function section(page: Page, name: "TO DO" | "DONE"): Promise<string> {
  const text = await screenText(page);
  const order = ["IN SESSION", "TO DO", "DONE", "That’s everything", "Nothing to do yet"];
  const start = text.indexOf(`| ${name} |`) >= 0 ? text.indexOf(`| ${name} |`) : text.indexOf(`${name} |`);
  if (start < 0) return "";
  const rest = text.slice(start + name.length + 2);
  const ends = order
    .filter((h) => h !== name)
    .map((h) => rest.indexOf(`| ${h}`))
    .filter((i) => i >= 0);
  // Reads as "3 | Collapse all | ▾ | first row …" — the count first, no leading separator.
  return (ends.length ? rest.slice(0, Math.min(...ends)) : rest).replace(/^\s*\|\s*/, "").trim();
}

/** The three figures in Home's stat strip. */
export async function stats(page: Page): Promise<{ streak: number; points: number; minutes: number }> {
  const text = await screenText(page);
  const num = (re: RegExp) => Number(re.exec(text)?.[1] ?? NaN);
  return {
    streak: num(/(\d+) \| (?:DAY STREAK|DAYS? STREAK)/i),
    points: num(/(\d+) \| POINTS TODAY/i),
    minutes: num(/(\d+) \| min \| FOCUSED/i),
  };
}

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(o.scroll, "the page scrolls sideways").toBeLessThanOrEqual(o.viewport);
}

/* ───────────────────────────── moving around ───────────────────────────── */

/** The tab button — by prefix, because Scheduled's name grows a count: "Scheduled, 2 overdue". */
export const tab = (page: Page, name: "Home" | "Scheduled" | "Progress" | "Settings") =>
  front(page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) }));

export async function openTab(page: Page, name: "Home" | "Scheduled" | "Progress" | "Settings"): Promise<void> {
  await tab(page, name).click();
}

/**
 * The app leaving and returning to the foreground — what a phone does when you switch apps, and
 * what re-syncs reminders and the pending list (useReminderSync). react-native-web's AppState
 * follows the page's visibility, so this flips that.
 */
export async function background(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
export async function foreground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/**
 * Freezes the page's clock at a local wall-clock time on a given day, then reloads so the app
 * boots into it. Only the *device's* clock moves — the server keeps real time, so a test using
 * this may only assert what the device decides (placement, greeting, countdowns), never what
 * the server computes for "today".
 */
export async function deviceClockAt(page: Page, day: string, hhmm: string, zone = ZONE): Promise<void> {
  markClocked(page);
  await page.clock.install({ time: instantAt(day, hhmm, zone) });
  await reload(page);
}

/**
 * Records that this page's clock is fake, so the fixture replaces its context before the next
 * test. Playwright's clock belongs to the whole browser context, not the page, and can't be
 * uninstalled — a clock one test moved would otherwise run every later test in that worker
 * minutes or days out of step.
 */
export function markClocked(page: Page): void {
  (page.context() as import("@playwright/test").BrowserContext & { __clocked?: boolean }).__clocked = true;
}

/** The instant a local wall-clock time names in a zone. */
export function instantAt(day: string, hhmm: string, zone = ZONE): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, m);
  // Treat the wall-clock time as UTC, see how far the zone's reading of that instant is off, and
  // correct — twice, so a guess that lands across a DST change settles.
  let t = target;
  for (let i = 0; i < 2; i++) t -= wallClockAsUtc(new Date(t), zone) - target;
  return new Date(t);
}

/** An instant's wall-clock reading in a zone, expressed as if that reading were UTC. */
function wallClockAsUtc(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
}

/** Opens a task's detail screen by tapping its row title. */
export async function openTask(page: Page, name: string): Promise<void> {
  await exact(page, name).click();
  await see(page, /TIMING|WHEN|SCHEDULE/i);
}

/* ───────────────────────────── dates, in the device's zone ───────────────────────────── */

/**
 * "YYYY-MM-DD" for today + `offsetDays`, in the device's zone — never `toISOString()`, which is
 * the UTC day and was a bug in this suite's own first draft (it's tomorrow in India before 05:30).
 */
export function dateKey(offsetDays = 0, zone = ZONE, from = new Date()): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(from)
    .split("-")
    .map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

/** "HH:mm:ss" for now + `minutes`, on the device's clock. */
export function clockIn(minutes: number, zone = ZONE): string {
  const at = new Date(Date.now() + minutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at) + ":00";
}

/** The local hour of day on the device right now. */
export function hourNow(zone = ZONE): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hour12: false }).format(new Date()));
}
