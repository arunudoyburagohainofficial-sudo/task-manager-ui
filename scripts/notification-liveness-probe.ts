/**
 * Does every notification a user can actually set up actually fire?
 *
 *   TASK_SVC_URL=http://localhost:8080/api npx tsx scripts/notification-liveness-probe.ts
 *
 * The placement matrix already proves *where* a task lives. This asks the question a user cares
 * about more: having set a reminder, will the phone ever go off?
 *
 * A notification is **structurally dead** when the day it would fire on is already behind us —
 * no time of day can rescue it, it can never fire, and nothing in the API or the app says so.
 * That's the bug class this probe exists to find, and it's the only thing reported as a
 * failure. A notification landing *today* is deliberately not judged: whether 6pm today has
 * passed depends on when you run this, and a probe whose verdict changes with the clock is
 * worse than no probe. Those rows are printed as `today` for information only.
 *
 * Liveness is computed with the app's real scheduling function (`schedulingLogic.ts`), the same
 * one `localNotifications.ts` calls to build the actual OS queue — not a reimplementation.
 *
 * Only combinations reachable through the app's own controls count as product bugs. The
 * lead-time presets the UI offers are 0 / 1 / 7 days (`ScheduleSheet.LEAD_TIME_PRESETS`), so
 * those are the offsets tested.
 */
import path from "node:path";

const svcScripts = path.join(__dirname, "../../task-svc/scripts/firebase-test");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require(path.join(svcScripts, "node_modules/firebase-admin"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require(path.join(svcScripts, "../../src/main/resources/firebase-config.json"));

import type { NotificationSpec, ReminderDto, TaskDto } from "../src/api/types";
import { reminderOccurrences } from "../src/notifications/schedulingLogic";

const API_KEY = "AIzaSyCEWazqNr4hlxkHPXLS8AYExYVy7kKl3v0";
const BASE_URL = process.env.TASK_SVC_URL || "http://localhost:8080/api";

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

let token: string;

async function api(method: string, urlPath: string, body?: unknown) {
  const resp = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (resp.status === 429) throw new Error("RATE LIMITED (429) — wait ~75s and re-run");
  return { status: resp.status, body: json, raw: text };
}

function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to a "YYYY-MM-DD", negative for the past. Calendar days, not elapsed hours. */
function daysFromToday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const NOTIFY_TIME = "09:00:00";

let failures = 0;
let checks = 0;

type Verdict = "fires" | "STRUCTURALLY DEAD" | "today (clock-dependent)";

/**
 * Judges one stored notification without consulting the clock, except to label the
 * deliberately-unjudged same-day case.
 */
function verdictFor(task: TaskDto, r: ReminderDto): Verdict {
  if (!task.scheduledFor) return "fires"; // undated → daily, always has a next slot
  const fireDay = daysFromToday(task.scheduledFor) - (r.daysBefore ?? 0);
  if (fireDay < 0) return "STRUCTURALLY DEAD";
  if (fireDay === 0) return "today (clock-dependent)";
  return "fires";
}

function check(label: string, actual: Verdict[], expectDead: boolean, why: string) {
  checks++;
  const dead = actual.filter((v) => v === "STRUCTURALLY DEAD").length;
  const ok = (dead > 0) === expectDead;
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label.padEnd(50)} ${actual.join(" + ").padEnd(46)}${ok ? "" : ` ← ${why}`}`
  );
}

async function remindersFor(taskId: string): Promise<ReminderDto[]> {
  const all = (await api("GET", "/reminders")).body as ReminderDto[];
  return (all ?? []).filter((r) => r.taskId === taskId && r.isActive);
}

async function verdicts(task: TaskDto): Promise<Verdict[]> {
  const rem = await remindersFor(task.id);
  return rem.map((r) => verdictFor(task, r));
}

async function mk(body: Record<string, unknown>): Promise<TaskDto> {
  const res = await api("POST", "/tasks", {
    name: `live-${Math.random().toString(36).slice(2, 8)}`,
    taskType: "reminder",
    ...body,
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status}: ${res.raw.slice(0, 200)}`);
  return res.body as TaskDto;
}

const DAY_OF: NotificationSpec = { time: NOTIFY_TIME, daysBefore: 0 };
const ONE_BEFORE: NotificationSpec = { time: NOTIFY_TIME, daysBefore: 1 };
const WEEK_BEFORE: NotificationSpec = { time: NOTIFY_TIME, daysBefore: 7 };

async function main() {
  const uid = `liveness-${Date.now()}`;
  const custom = await admin.auth().createCustomToken(uid);
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  }).then((r) => r.json());
  token = ex.idToken;
  await api("POST", "/auth/verify", { idToken: token });

  console.log(`\nNotification liveness probe — ${BASE_URL} (today = ${day(0)})\n`);

  /* ── 1. Lead time vs. how far away the task actually is ───────────────────── */
  console.log('1. Lead time vs. days remaining — "+ 1 week before" is one tap in the app\n');
  for (const days of [0, 1, 3, 6, 8, 10]) {
    const task = await mk({ scheduledFor: day(days), notifications: [WEEK_BEFORE] });
    check(`dated +${days}d, "1 week before"`, await verdicts(task), days < 7, "offset exceeds the runway");
  }
  for (const days of [0, 2, 5]) {
    const task = await mk({ scheduledFor: day(days), notifications: [ONE_BEFORE] });
    check(`dated +${days}d, "1 day before"`, await verdicts(task), days < 1, "offset exceeds the runway");
  }

  /* ── 2. The masking case — one dead leg hidden behind a live one ──────────── */
  console.log("\n2. A dead leg beside a live one — the failure that looks fine\n");
  {
    const task = await mk({ scheduledFor: day(3), notifications: [WEEK_BEFORE, DAY_OF] });
    const v = await verdicts(task);
    checks++;
    const masked = v.filter((x) => x === "STRUCTURALLY DEAD").length === 1 && v.some((x) => x !== "STRUCTURALLY DEAD");
    if (!masked) failures++;
    console.log(
      `${masked ? "  ok  " : " FAIL "} dated +3d, week-before + on-the-day             ${v.join(" + ")}`
    );
    console.log(`       └─ the task still buzzes on the day, so nothing looks wrong to the user`);
  }

  /* ── 3. Recurrence + lead time — does every successor inherit a dead one? ─── */
  console.log("\n3. Recurring + lead time — the successor, and every one after it\n");
  for (const [label, rule] of [
    ["daily", "FREQ=DAILY"],
    ["every 3 days", "FREQ=DAILY;INTERVAL=3"],
    ["weekly", "FREQ=WEEKLY"],
    ["monthly", "FREQ=MONTHLY"],
  ] as [string, string][]) {
    const task = await mk({ scheduledFor: day(0), recurrenceRule: rule, notifications: [WEEK_BEFORE, DAY_OF] });
    await api("POST", `/tasks/${task.id}/complete`);
    const pendingList = ((await api("GET", "/tasks?status=pending")).body as TaskDto[]) ?? [];
    const successor = pendingList.find((t) => t.name === task.name && t.id !== task.id);
    if (!successor) {
      console.log(` FAIL  ${label}: no successor spawned`);
      failures++;
      checks++;
      continue;
    }
    const gap = daysFromToday(successor.scheduledFor!);
    check(
      `${label} → successor +${gap}d, wk-before + day-of`,
      await verdicts(successor),
      gap < 7,
      "cycle shorter than the lead time — dead for every occurrence, forever"
    );
  }

  /* ── 4. Moving a task earlier can kill a notification that was fine ───────── */
  console.log("\n4. Moving the date — offsets follow the task, and can land in the past\n");
  {
    const task = await mk({ scheduledFor: day(20), notifications: [WEEK_BEFORE] });
    check("dated +20d, week-before", await verdicts(task), false, "should be alive");
    const moved = (await api("PATCH", `/tasks/${task.id}`, { scheduledFor: day(2) })).body as TaskDto;
    check("…then moved to +2d", await verdicts(moved), true, "moving earlier should kill it");
    console.log("       └─ an ordinary date change, no warning anywhere");
  }

  /* ── 5. Undated + lead time — not UI-reachable, but the API accepts it ────── */
  console.log("\n5. Undated task carrying a lead time (API-only path)\n");
  {
    const task = await mk({ notifications: [WEEK_BEFORE] });
    const rem = await remindersFor(task.id);
    const stored = rem[0]?.daysBefore ?? 0;
    const occ = reminderOccurrences(rem[0]?.reminderTime ?? null, task.scheduledFor, null, stored);
    checks++;
    const ignored = stored === 7 && occ.length > 1;
    if (ignored) failures++;
    console.log(
      `${ignored ? " FAIL " : "  ok  "} undated + week-before                          ` +
        `stored daysBefore=${stored}, ${occ.length} occurrences` +
        `${ignored ? "  ← offset kept but silently meaningless" : ""}`
    );
  }

  /* ── 6. Clearing the date out from under a lead-time notification ─────────── */
  console.log("\n6. Clearing the date while a lead time is set\n");
  {
    const task = await mk({ scheduledFor: day(20), notifications: [WEEK_BEFORE] });
    // The documented contract: removing a date while a notification exists must say what
    // happens to it (matrix §5), so this sends the explicit "keep notifying" answer.
    const res = await api("PATCH", `/tasks/${task.id}`, { clearScheduledFor: true, notifyTime: NOTIFY_TIME });
    const after = (await api("GET", `/tasks/${task.id}`)).body as TaskDto;
    const rem = await remindersFor(task.id);
    checks++;
    const cleared = after?.scheduledFor == null;
    const offsetsLeft = rem.map((r) => r.daysBefore ?? 0);
    const stale = offsetsLeft.some((o) => o > 0);
    if (!cleared || stale) failures++;
    console.log(
      `${!cleared || stale ? " FAIL " : "  ok  "} clearScheduledFor + notifyTime → ${res.status}             ` +
        `date=${after?.scheduledFor ?? "null"}, offsets=[${offsetsLeft.join(", ")}]` +
        `${stale ? "  ← a lead-time offset survived onto an undated task" : ""}`
    );
  }

  console.log(`\n${checks} checks, ${failures} need a look\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
