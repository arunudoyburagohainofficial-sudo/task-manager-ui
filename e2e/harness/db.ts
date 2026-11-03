import { execFileSync } from "node:child_process";

/**
 * The escape hatch: states the API can't express — a completion at 8:10 this morning, a session
 * that started ten minutes ago, a goal with 13 days behind it, a streak with a missed day.
 *
 * Talks to the local Postgres container only. The stack guard (`stack.setup.ts`) has already
 * refused to run unless the backend is local, and the container name is the one in
 * `task-svc/docker-compose.yml` — there is no path from here to Neon.
 *
 * **The trap, found the hard way:** timestamp columns hold the *server JVM's* wall clock with no
 * zone, and Postgres's `now()` is UTC. Every helper below writes times through `serverNow()`,
 * which is the JVM's clock, so no test has to remember the conversion.
 */
const CONTAINER = "hybrid-task-postgres";

/** The zone the local task-svc JVM runs in — it's this machine's, and this machine is in India. */
export const SERVER_ZONE = "Asia/Kolkata";

/** A SQL expression for the server's wall clock, optionally shifted: `serverNow("- interval '10 minutes'")`. */
export const serverNow = (shift = "") => `((now() AT TIME ZONE '${SERVER_ZONE}') ${shift})`;

/** Runs SQL and returns rows as arrays of strings. Values must already be safe — tests pass ids and literals they built. */
export function sql(query: string): string[][] {
  const out = execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "hybrid_task_db", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", query],
    { encoding: "utf8" }
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

const uuid = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`not a uuid: ${id}`);
  return `'${id}'`;
};

export const db = {
  /** The users.id behind a Firebase uid. */
  userId: (firebaseUid: string) => sql(`SELECT id FROM users WHERE firebase_uid = '${firebaseUid.replace(/'/g, "")}'`)[0]?.[0],

  /**
   * Sets the account's email.
   *
   * The test sign-in creates an account without one, so Settings shows "-" and the layout that
   * a real address forces - an unbreakable 40-character string in a row with a label - is
   * never exercised by the suite. That is exactly where it broke.
   */
  userEmail: (userId: string, email: string) => {
    /*
     * Test addresses only, and this is not pedantry. The release below takes the address off
     * whichever account is holding it, and on 2026-11-03 a real one was passed in: it stripped
     * the email from the developer's own account on this machine, after which every Google
     * sign-in rolled back on the unique index and came back as a 409 with no way past it.
     */
    if (!/^[a-z0-9._%+-]+@e2e\.test$/i.test(email)) {
      throw new Error(
        `userEmail takes an @e2e.test address, not "${email}" — it releases the address from ` +
          "whatever account already holds it, and a real address belongs to a real person"
      );
    }
    const safe = email.replace(/'/g, "");
    // users_email_key is unique, and every run makes a fresh account - so the second run of a
    // test that sets a fixed address collides with the first run's user. Release it first.
    sql(`UPDATE users SET email = NULL WHERE email = '${safe}' AND id <> ${uuid(userId)}`);
    return sql(`UPDATE users SET email = '${safe}' WHERE id = ${uuid(userId)}`);
  },

  /** Marks a task finished `ago` before now (e.g. "3 hours"), or at a server-wall-clock timestamp. */
  completedAt: (taskId: string, when: { ago?: string; at?: string }) =>
    sql(
      `UPDATE tasks SET status = 'completed', completed_at = ${
        when.at ? `'${when.at}'::timestamp` : serverNow(`- interval '${when.ago}'`)
      } WHERE id = ${uuid(taskId)}`
    ),

  /** Moves a completion (and its stored points) — the only way to seed "finished yesterday". */
  setPoints: (taskId: string, points: number | null) =>
    sql(`UPDATE tasks SET points_earned = ${points === null ? "NULL" : points} WHERE id = ${uuid(taskId)}`),

  /** Back-dates a running session so it has been going for `ago`. */
  sessionStartedAgo: (sessionId: string, ago: string) =>
    sql(`UPDATE focus_sessions SET started_at = ${serverNow(`- interval '${ago}'`)} WHERE id = ${uuid(sessionId)}`),

  /** Removes a session's planned length, as an older build would have written it. */
  sessionWithoutPlan: (sessionId: string) => sql(`UPDATE focus_sessions SET planned_minutes = NULL WHERE id = ${uuid(sessionId)}`),

  /**
   * Back to a first day: no weekly totals, no streak. Tasks and goals are cleared through the API
   * (api.clear); these two are server-computed history the API has no way to reset.
   */
  resetProgress: (userId: string) => {
    sql(`DELETE FROM weekly_progress WHERE user_id = ${uuid(userId)}`);
    sql(`UPDATE user_streaks SET current_streak = 0, longest_streak = 0, last_activity_date = NULL, grace_period_used = false WHERE user_id = ${uuid(userId)}`);
  },

  /** A week's totals, as the server records them — for history the API can't back-date. */
  weekRow: (userId: string, weekStart: string, tasks: number, minutes: number, goal = 10) =>
    sql(`INSERT INTO weekly_progress (id, user_id, week_start_date, tasks_completed, weekly_goal, total_focus_time_minutes, created_at, updated_at)
         VALUES (gen_random_uuid(), ${uuid(userId)}, '${weekStart}', ${tasks}, ${goal}, ${minutes}, now(), now())`),

  /** A goal with history behind it. */
  goalProgress: (goalId: string, days: number, lastActivity: string | null = null) =>
    sql(
      `UPDATE goals SET total_days_active = ${days}, last_activity_date = ${lastActivity ? `'${lastActivity}'` : "NULL"} WHERE id = ${uuid(goalId)}`
    ),

  /**
   * Sets the streak row directly: `lastActivity` is a YYYY-MM-DD in the user's zone. Replaces the
   * row rather than updating it — a fresh account has none until its first focus completion.
   */
  streak: (userId: string, s: { current: number; longest: number; lastActivity: string | null; graceUsed?: boolean }) => {
    sql(`DELETE FROM user_streaks WHERE user_id = ${uuid(userId)}`);
    sql(
      `INSERT INTO user_streaks (id, user_id, current_streak, longest_streak, last_activity_date, grace_period_used, created_at, updated_at)
       VALUES (gen_random_uuid(), ${uuid(userId)}, ${s.current}, ${s.longest}, ${s.lastActivity ? `'${s.lastActivity}'` : "NULL"}, ${!!s.graceUsed}, now(), now())`
    );
  },

  /** Sets a task's day to one the API refuses (the past) — how an overdue task is made. */
  scheduledFor: (taskId: string, dateKey: string) =>
    sql(`UPDATE tasks SET scheduled_for = '${dateKey}' WHERE id = ${uuid(taskId)}`),

  /** A recurrence rule this build can't parse — written as a newer app version would. */
  rawRule: (taskId: string, rule: string) =>
    sql(`UPDATE tasks SET recurrence_rule = '${rule.replace(/'/g, "")}', is_recurring = true WHERE id = ${uuid(taskId)}`),
};
