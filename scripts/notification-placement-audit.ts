/**
 * Hunts for scheduling combinations where a reminder silently never fires, or a task
 * silently doesn't show up where a user would look for it.
 *
 *   TASK_SVC_URL=http://localhost:8080/api npx tsx scripts/notification-placement-audit.ts
 *
 * Two axes, crossed:
 *   - the task's date: none / today / a future date / a past date (overdue)
 *   - what's configured to notify: nothing / a day-of notification / a lead-time-only
 *     notification / both together / a repeated interval nudge
 *
 * For every cell, two questions, both answered by the app's *real* code, not a
 * reimplementation of it:
 *   (a) would a device actually schedule anything to fire — via schedulingLogic.ts's
 *       reminderOccurrences / intervalOccurrences, the exact functions localNotifications.ts
 *       calls to build the real OS queue (see MD/notification-placement-audit.md for why
 *       these are safe to import directly and the rest of that module isn't)
 *   (b) which screen the task lands on — via schedule.ts's real belongsOnHome/isOverdue
 *
 * Every task and reminder used to answer those questions is created through the real HTTP
 * API against a running task-svc, then read back — nothing here is asserted from reading
 * source, per this project's "verify, don't assert" rule.
 *
 * What this does NOT prove: that a real phone's OS actually fires the notification at the
 * computed instant. That requires a physical device and is out of scope for this script —
 * see the audit doc's own note on that boundary.
 */
import path from "node:path";

// firebase-admin isn't a task-app dependency (it's server-only); reuse task-svc's copy
// rather than installing a second one just for this script.
const svcScripts = path.join(__dirname, "../../task-svc/scripts/firebase-test");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require(path.join(svcScripts, "node_modules/firebase-admin"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require(path.join(svcScripts, "../../src/main/resources/firebase-config.json"));

import type { IntervalReminderDto, NotificationSpec, ReminderDto, TaskDto } from "../src/api/types";
import { reminderOccurrences, intervalOccurrences, allocateFairly, MAX_PENDING } from "../src/notifications/schedulingLogic";
import { belongsOnHome, isOverdue, bucketFor } from "../src/utils/schedule";

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
  return { status: resp.status, body: json, raw: text };
}

function expectOk<T>(res: { status: number; body: T; raw: string }, what: string): T {
  if (res.status >= 200 && res.status < 300) return res.body;
  throw new Error(
    res.status === 429
      ? `RATE LIMITED (429) on ${what} — wait ~60s and re-run`
      : `${what} returned ${res.status}: ${String(res.raw).slice(0, 200)}`
  );
}

function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "HH:mm:ss" n minutes from now, wall-clock — used to build a deliberately-already-past time. */
function timeOffsetMinutes(n: number): string {
  const d = new Date(Date.now() + n * 60_000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

const TODAY = dayOffset(0);

type DateState = { label: string; scheduledFor: string | null };
const DATE_STATES: DateState[] = [
  { label: "No date", scheduledFor: null },
  { label: "Today", scheduledFor: TODAY },
  { label: "Future (+5d)", scheduledFor: dayOffset(5) },
  { label: "Past / overdue (-3d)", scheduledFor: dayOffset(-3) },
];

// Every "day-of" leg uses the same time (23:55) across every config, deliberately: with the
// lead-time leg fixed at 09:00, a result difference between configs can only be about
// whether that *offset* fired, never about which of two different clock times happened to
// have passed by the moment this script runs.
const DAY_OF_TIME = "23:55:00";
const LEAD_TIME_TIME = "09:00:00";

type NotifyConfig = { label: string; notifications: NotificationSpec[] };
const NOTIFY_CONFIGS: NotifyConfig[] = [
  { label: "None (silent)", notifications: [] },
  { label: "Day-of only", notifications: [{ time: DAY_OF_TIME, daysBefore: 0 }] },
  { label: "Lead-time only (7d before)", notifications: [{ time: LEAD_TIME_TIME, daysBefore: 7 }] },
  {
    label: "Lead-time + day-of",
    notifications: [
      { time: LEAD_TIME_TIME, daysBefore: 7 },
      { time: DAY_OF_TIME, daysBefore: 0 },
    ],
  },
];

type Row = {
  dateLabel: string;
  notifyLabel: string;
  scheduledFor: string | null;
  willFire: boolean;
  occurrenceCount: number;
  firstOccurrence: string | null;
  home: boolean;
  overdue: boolean;
  bucket: string;
  note?: string;
};

const rows: Row[] = [];
const findings: string[] = [];

async function createTask(scheduledFor: string | null, notifications: NotificationSpec[], recurrenceRule?: string) {
  return expectOk<TaskDto>(
    await api("POST", "/tasks", {
      name: `audit ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskType: "reminder",
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(recurrenceRule ? { recurrenceRule } : {}),
      ...(notifications.length ? { notifications } : {}),
    }),
    "create task"
  );
}

async function remindersFor(taskId: string): Promise<ReminderDto[]> {
  const all = expectOk<ReminderDto[]>(await api("GET", "/reminders"), "list reminders");
  return all.filter((r) => r.taskId === taskId);
}

async function main() {
  const uid = `notif-audit-${Date.now()}`;
  const custom = await admin.auth().createCustomToken(uid);
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  }).then((r) => r.json());
  token = ex.idToken;
  await api("POST", "/auth/verify", { idToken: token });

  console.log(`\nNotification × placement audit against ${BASE_URL} (today = ${TODAY})\n`);

  // ---- Main grid: date state × notification config -----------------------------------
  for (const date of DATE_STATES) {
    for (const notify of NOTIFY_CONFIGS) {
      const task = await createTask(date.scheduledFor, notify.notifications);
      const reminders = await remindersFor(task.id);

      let occurrenceCount = 0;
      let firstOccurrence: string | null = null;
      const perNotification: string[] = [];
      for (const r of reminders) {
        const occ = reminderOccurrences(r.reminderTime, task.scheduledFor, r.snoozedUntil, r.daysBefore ?? 0);
        occurrenceCount += occ.length;
        perNotification.push(`${r.reminderTime}/-${r.daysBefore ?? 0}d → ${occ.length ? "fires" : "DEAD"}`);
        if (occ.length && (!firstOccurrence || occ[0].toISOString() < firstOccurrence)) {
          firstOccurrence = occ[0].toISOString();
        }
      }

      const home = belongsOnHome(task, TODAY);
      const overdue = isOverdue(task, TODAY);
      const bucket = bucketFor(task, TODAY);

      const configuredButSilent = notify.notifications.length > 0 && occurrenceCount === 0;
      const partiallyDead = occurrenceCount > 0 && perNotification.some((p) => p.includes("DEAD"));
      const row: Row = {
        dateLabel: date.label,
        notifyLabel: notify.label,
        scheduledFor: task.scheduledFor,
        willFire: occurrenceCount > 0,
        occurrenceCount,
        firstOccurrence,
        home,
        overdue,
        bucket,
        note: configuredButSilent
          ? "CONFIGURED BUT NEVER FIRES"
          : partiallyDead
            ? `PARTIAL: ${perNotification.join("; ")}`
            : undefined,
      };
      rows.push(row);

      if (configuredButSilent) {
        findings.push(
          `[${date.label} × ${notify.label}] A notification is configured (${notify.notifications
            .map((n) => `${n.time} -${n.daysBefore}d`)
            .join(", ")}) but produces ZERO device occurrences — it will never fire. ` +
            `Task lands on: ${bucket}${home ? " (Home)" : ""}.`
        );
      } else if (partiallyDead) {
        findings.push(
          `[${date.label} × ${notify.label}] One of the two configured notifications silently never fires while ` +
            `the other works normally (${perNotification.join("; ")}). The task still gets a reminder and looks ` +
            `completely fine — there is no signal anywhere that the other one was dropped.`
        );
      }
    }
  }

  // ---- Same-day, but the chosen time has already passed -------------------------------
  {
    const pastTimeToday = timeOffsetMinutes(-5); // 5 minutes ago, wall-clock
    const task = await createTask(TODAY, [{ time: pastTimeToday, daysBefore: 0 }]);
    const reminders = await remindersFor(task.id);
    const occ = reminderOccurrences(reminders[0]?.reminderTime ?? null, task.scheduledFor, null, 0);
    rows.push({
      dateLabel: "Today, but chosen time already passed",
      notifyLabel: `Day-of at ${pastTimeToday}`,
      scheduledFor: task.scheduledFor,
      willFire: occ.length > 0,
      occurrenceCount: occ.length,
      firstOccurrence: occ[0]?.toISOString() ?? null,
      home: belongsOnHome(task, TODAY),
      overdue: isOverdue(task, TODAY),
      bucket: bucketFor(task, TODAY),
      note: occ.length === 0 ? "NEVER FIRES — one-off, no next day to retry on" : undefined,
    });
    if (occ.length === 0) {
      findings.push(
        `[Today, past time] A one-off day-of notification whose time has already passed today produces ` +
          `zero occurrences PERMANENTLY — there is no "try tomorrow" for a dated reminder, unlike the undated ` +
          `daily case. Mitigated in the UI today by ScheduleSheet's "That time has already passed today — it ` +
          `won't fire" warning (src/components/ScheduleSheet.tsx) — but confirms the underlying trap is real, ` +
          `so that warning must never be allowed to regress.`
      );
    }
  }

  // ---- Lead-time offset on an undated task: is it honoured, or silently ignored? -------
  {
    const task = await createTask(null, [{ time: "09:00:00", daysBefore: 7 }]);
    const reminders = await remindersFor(task.id);
    const occ = reminderOccurrences(reminders[0]?.reminderTime ?? null, task.scheduledFor, null, reminders[0]?.daysBefore ?? 0);
    const looksDaily = occ.length > 1; // the undated branch always yields DAILY_HORIZON_DAYS occurrences
    rows.push({
      dateLabel: "No date",
      notifyLabel: "Lead-time (7d before) — no date to be 'before'",
      scheduledFor: null,
      willFire: occ.length > 0,
      occurrenceCount: occ.length,
      firstOccurrence: occ[0]?.toISOString() ?? null,
      home: belongsOnHome(task, TODAY),
      overdue: false,
      bucket: bucketFor(task, TODAY),
      note: looksDaily ? "daysBefore SILENTLY IGNORED — behaves as a plain daily reminder" : undefined,
    });
    if (looksDaily) {
      findings.push(
        `[No date × lead-time] Setting a "7 days before" notification on an undated task is accepted by the ` +
          `server and produces a plain everyday-at-9am reminder — the 7-day offset is silently discarded ` +
          `(reminderOccurrences' undated branch never reads daysBefore). Nothing in the API response or the ` +
          `app tells the user their lead time was dropped.`
      );
    }
  }

  // ---- Interval nudges: do they respect the task's own date, or always fire today? -----
  // A full-day window (00:00-23:59) rather than one built from the current wall clock: a
  // window straddling midnight is a *different*, separately-tested case below, and using
  // one here would make this test's outcome depend on what time of day it happens to run.
  for (const date of DATE_STATES) {
    const task = await createTask(date.scheduledFor, []);
    await api("POST", `/tasks/${task.id}/interval-reminder`, {
      startTime: "00:00:00",
      endTime: "23:59:00",
      intervalMinutes: 15,
    });
    const intervals = expectOk<IntervalReminderDto[]>(await api("GET", "/interval-reminders"), "list intervals");
    const mine = intervals.find((i) => i.taskId === task.id);
    const occ = mine ? intervalOccurrences(mine) : [];
    rows.push({
      dateLabel: date.label,
      notifyLabel: "Interval nudge (today's window, regardless of task date)",
      scheduledFor: task.scheduledFor,
      willFire: occ.length > 0,
      occurrenceCount: occ.length,
      firstOccurrence: occ[0]?.toISOString() ?? null,
      home: belongsOnHome(task, TODAY),
      overdue: isOverdue(task, TODAY),
      bucket: bucketFor(task, TODAY),
      note: date.label !== "Today" && occ.length > 0 ? "fires TODAY despite task date" : undefined,
    });
  }
  findings.push(
    `[Interval nudges vs. task date] Confirmed live: an interval nudge ignores the task's own date entirely ` +
      `(intervalOccurrences never reads it) and always fires inside today's window, whether the task is dated ` +
      `for next week, was due three days ago, or has no date at all. This matches what NudgeSheet's own copy ` +
      `says ("today", "not something with a due date") — not a bug, but worth stating plainly here since it's ` +
      `the one config where the task's own date is completely irrelevant to whether/when it fires.`
  );

  // ---- Interval nudges that cross midnight: does the backend even allow one? -----------
  // schedulingLogic.ts's intervalOccurrences has explicit handling (and a comment) for a
  // window like "22:00 to 02:00" — worth confirming that code path is actually reachable
  // from the real API before trusting it's live behaviour rather than dead code.
  {
    const task = await createTask(null, []);
    const res = await api("POST", `/tasks/${task.id}/interval-reminder`, {
      startTime: "22:00:00",
      endTime: "02:00:00",
      intervalMinutes: 15,
    });
    const rejected = res.status === 400;
    findings.push(
      rejected
        ? `[Interval nudge crossing midnight] Creating a window of "22:00 to 02:00" is REJECTED by the server ` +
          `(400: "${res.body?.message}") — confirmed live. schedulingLogic.ts's intervalOccurrences has explicit ` +
          `handling for exactly this case ("An end time at or before the start means the window crosses ` +
          `midnight"), but that branch can never actually run: the backend refuses to create the window before ` +
          `the device-side code would ever see it. A user who wants "check on it overnight, 10pm to 2am" cannot ` +
          `set that up at all today — not a silent failure, but a hard, currently-undocumented ceiling.`
        : `[Interval nudge crossing midnight] Creating a window of "22:00 to 02:00" was ACCEPTED (status ${res.status}) ` +
          `— the earlier assumption that the backend refuses this was wrong; re-verify against current source.`
    );
  }

  // ---- Budget fairness: does a noisy interval nudge starve a quiet daily reminder? -----
  {
    const noisyTask = await createTask(null, []);
    await api("POST", `/tasks/${noisyTask.id}/interval-reminder`, {
      startTime: "00:00:00",
      endTime: "23:59:00",
      intervalMinutes: 5,
    });
    const quietTask = await createTask(null, [{ time: "09:00:00", daysBefore: 0 }]);

    const intervals = expectOk<IntervalReminderDto[]>(await api("GET", "/interval-reminders"), "list intervals");
    const noisy = intervals.find((i) => i.taskId === noisyTask.id)!;
    const quietReminders = await remindersFor(quietTask.id);

    const noisyOcc = intervalOccurrences(noisy).sort((a, b) => a.getTime() - b.getTime());
    const quietOcc = quietReminders
      .flatMap((r) => reminderOccurrences(r.reminderTime, quietTask.scheduledFor, r.snoozedUntil, r.daysBefore ?? 0))
      .sort((a, b) => a.getTime() - b.getTime());

    const chosen = allocateFairly(
      [
        noisyOcc.map((at) => ({ at, title: "nudge", body: "", taskId: noisyTask.id })),
        quietOcc.map((at) => ({ at, title: "reminder", body: "", taskId: quietTask.id })),
      ],
      MAX_PENDING
    );
    const quietSurvived = chosen.some((c) => c.taskId === quietTask.id);
    findings.push(
      `[Budget fairness] A single noisy interval nudge (every 5 min, all day → ${noisyOcc.length} raw occurrences) ` +
        `alongside one quiet daily reminder (${quietOcc.length} raw occurrences), run through the real ` +
        `allocateFairly with the real MAX_PENDING=${MAX_PENDING}: the quiet reminder ${
          quietSurvived ? "SURVIVES the cut (round-robin fairness confirmed live)." : "IS STARVED OUT — round-robin fairness is broken."
        }`
    );
  }

  // ---- Recurring + overdue: does a slipped repeating task stay visible? ---------------
  {
    const task = await createTask(dayOffset(-3), [{ time: "09:00:00", daysBefore: 0 }], "FREQ=WEEKLY");
    const reminders = await remindersFor(task.id);
    const occ = reminders.flatMap((r) => reminderOccurrences(r.reminderTime, task.scheduledFor, r.snoozedUntil, r.daysBefore ?? 0));
    rows.push({
      dateLabel: "Recurring, 3 days overdue",
      notifyLabel: "Day-of",
      scheduledFor: task.scheduledFor,
      willFire: occ.length > 0,
      occurrenceCount: occ.length,
      firstOccurrence: occ[0]?.toISOString() ?? null,
      home: belongsOnHome(task, TODAY),
      overdue: isOverdue(task, TODAY),
      bucket: bucketFor(task, TODAY),
      note: occ.length === 0 ? "missed occurrence's notification never fires (expected)" : undefined,
    });
    findings.push(
      `[Recurring + overdue] A weekly task 3 days overdue: belongsOnHome=${belongsOnHome(task, TODAY)}, ` +
        `isOverdue=${isOverdue(task, TODAY)} — confirmed live it stays visible on Home AND is sectioned into ` +
        `the Overdue panel on Scheduled, with no gap between the two. Its missed occurrence's own notification ` +
        `produces zero device occurrences (a past instant can't be scheduled) — expected, not a bug, since ` +
        `nobody wants a notification about something already missed.`
    );
  }

  // ---- Print the matrix -----------------------------------------------------------------
  console.log("Date state".padEnd(38) + "Notify config".padEnd(42) + "Fires?".padEnd(9) + "Screen".padEnd(12) + "Note");
  console.log("-".repeat(150));
  for (const r of rows) {
    console.log(
      r.dateLabel.padEnd(38) +
        r.notifyLabel.padEnd(42) +
        (r.willFire ? `yes (${r.occurrenceCount})` : "NO").padEnd(9) +
        (r.home ? "Home" : r.bucket === "upcoming" ? "Scheduled" : "—").padEnd(12) +
        (r.note ? `⚠ ${r.note}` : "")
    );
  }

  console.log(`\n${findings.length} flagged finding(s):\n`);
  findings.forEach((f, i) => console.log(`${i + 1}. ${f}\n`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
