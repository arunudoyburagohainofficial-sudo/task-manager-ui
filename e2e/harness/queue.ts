import type { Page } from "@playwright/test";
import { planQueue, type Scheduled } from "../../src/notifications/schedulingLogic";
import type { Api } from "./api";

/**
 * What the phone would have queued — computed, because the browser can't.
 *
 * `expo-notifications` does nothing on web, so the real queue is always empty here. But the
 * decision about what to queue is `planQueue`: the same function `scheduleAll` calls on a phone,
 * fed the same three lists `syncReminders` fetches. Running it on those lists is exactly what a
 * phone would do with them; the only step left out is handing the result to the OS — which is the
 * part plan/17-device-only.md owns.
 *
 * Runs in the test process, whose zone is the machine's. The app tests pin Asia/Kolkata, and so
 * does this machine; `assertSameZone` refuses to compute if that ever stops being true, since a
 * queue computed in a different zone would put every reminder at the wrong hour.
 */
export async function phoneQueue(api: Api): Promise<Scheduled[]> {
  assertSameZone();
  const [reminders, intervals, pending] = await Promise.all([api.reminders(), api.intervals(), api.tasks("pending")]);
  return planQueue(reminders, intervals, pending);
}

/** One task's entries, as "title / body @ local YYYY-MM-DD HH:mm". */
export function entriesFor(queue: Scheduled[], taskId: string): string[] {
  return queue.filter((s) => s.taskId === taskId).map((s) => `${s.title} / ${s.body} @ ${stamp(s.at)}`);
}

export function stamp(at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}

function assertSameZone() {
  // Compared by offset, not name: Node may report the zone as its older alias, Asia/Calcutta.
  const offset = new Date().getTimezoneOffset();
  if (offset !== -330) {
    throw new Error(`phoneQueue computes in the test process's zone (UTC offset ${-offset} min); the app tests assume Asia/Kolkata (+330).`);
  }
}

/**
 * Resolves when the app re-syncs its notifications — the GET /reminders that `syncReminders`
 * sends. Start it *before* the action that should trigger it.
 */
export function nextSync(page: Page, timeout = 10_000) {
  return page.waitForResponse((r) => r.request().method() === "GET" && /\/api\/reminders$/.test(r.url()), { timeout });
}
