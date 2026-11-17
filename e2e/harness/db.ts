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

  /**
   * Ages a task, so its "added N weeks ago" label can be tested without waiting weeks.
   *
   * The interval is written straight into SQL, so it takes only the shapes Postgres already
   * understands ("40 days", "3 weeks") and nothing a caller composed from user input.
   */
  createdAgo: (taskId: string, interval: string) => {
    if (!/^\d+ (day|days|week|weeks|month|months|hour|hours|minute|minutes)$/.test(interval)) {
      throw new Error(`createdAgo takes a plain interval like "40 days", not "${interval}"`);
    }
    return sql(`UPDATE tasks SET created_at = now() - INTERVAL '${interval}' WHERE id = ${uuid(taskId)}`);
  },

  /**
   * Seeds a pile of undated pending tasks in one statement.
   *
   * Through the API this would be one request per task, and the list that needs proving is the
   * one past the server's 1,000-row unpaged ceiling - a thousand round trips to set up a single
   * assertion. generate_series does it in a single round trip.
   *
   * created_at is staggered so the ordering the app relies on (newest first) is deterministic,
   * and so "the oldest one" is a real, identifiable row rather than whichever the database
   * happened to write first.
   */
  bulkTasks: (userId: string, count: number, prefix: string) => {
    if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error(`silly count: ${count}`);
    if (!/^[A-Za-z0-9 ]+$/.test(prefix)) throw new Error(`prefix must be plain text, got "${prefix}"`);
    return sql(
      `INSERT INTO tasks (id, user_id, name, task_type, status, created_at, updated_at)
       SELECT gen_random_uuid(), ${uuid(userId)}, '${prefix} ' || i, 'reminder', 'pending',
              now() - (i * INTERVAL '1 minute'), now()
       FROM generate_series(1, ${count}) AS i`
    );
  },

  /**
   * Seeds a pile of late one-off tasks, each due on `dateKey` (a past YYYY-MM-DD).
   *
   * The API refuses a past date, and a bulk action is only worth testing at a size where doing
   * one request per row would start to matter - which is also the size nobody would seed by hand.
   */
  bulkOverdue: (userId: string, count: number, prefix: string, dateKey: string) => {
    if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error(`silly count: ${count}`);
    if (!/^[A-Za-z0-9 ]+$/.test(prefix)) throw new Error(`prefix must be plain text, got "${prefix}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error(`not a date key: ${dateKey}`);
    return sql(
      `INSERT INTO tasks (id, user_id, name, task_type, status, scheduled_for, created_at, updated_at)
       SELECT gen_random_uuid(), ${uuid(userId)}, '${prefix} ' || i, 'reminder', 'pending', '${dateKey}',
              now() - (i * INTERVAL '1 minute'), now()
       FROM generate_series(1, ${count}) AS i`
    );
  },

  /**
   * Seeds a pile of tasks finished long ago: the first `daysAgo` days back, each one after it a
   * further minute into the past.
   *
   * This is the history a year of real use leaves behind. No screen shows it - Home wants today
   * and Progress wants this week - so the only thing it can do is be downloaded, and the test
   * that uses this counts how much of it is.
   */
  bulkCompleted: (userId: string, count: number, prefix: string, daysAgo: number) => {
    if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error(`silly count: ${count}`);
    if (!/^[A-Za-z0-9 ]+$/.test(prefix)) throw new Error(`prefix must be plain text, got "${prefix}"`);
    if (!Number.isInteger(daysAgo) || daysAgo < 0 || daysAgo > 3650) throw new Error(`silly age: ${daysAgo}`);
    const finished = serverNow(`- INTERVAL '${daysAgo} days' - (i * INTERVAL '1 minute')`);
    return sql(
      `INSERT INTO tasks (id, user_id, name, task_type, status, points_earned, created_at, updated_at, completed_at)
       SELECT gen_random_uuid(), ${uuid(userId)}, '${prefix} ' || i, 'reminder', 'completed', 5,
              ${finished}, ${finished}, ${finished}
       FROM generate_series(1, ${count}) AS i`
    );
  },

  /**
   * Deletes everything a bulk seed made, by the prefix it was made with.
   *
   * A test that seeds a thousand rows cannot leave them for the next test's `api.clear()` to
   * remove one request at a time: that is a thousand requests of somebody else's time budget,
   * and when the old single-pass clear stopped at the server's 1,000-row ceiling the leftovers
   * broke a test in a different file entirely.
   */
  removeBulk: (userId: string, prefix: string) => {
    if (!/^[A-Za-z0-9 ]+$/.test(prefix)) throw new Error(`prefix must be plain text, got "${prefix}"`);
    return sql(`DELETE FROM tasks WHERE user_id = ${uuid(userId)} AND name LIKE '${prefix} %'`);
  },

  /** How many of an account's tasks are in a given state - for checking a bulk action against the database. */
  countTasks: (userId: string, status: "pending" | "completed") =>
    Number(sql(`SELECT count(*) FROM tasks WHERE user_id = ${uuid(userId)} AND status = '${status}'`)[0]?.[0] ?? 0),

  /** A recurrence rule this build can't parse — written as a newer app version would. */
  rawRule: (taskId: string, rule: string) =>
    sql(`UPDATE tasks SET recurrence_rule = '${rule.replace(/'/g, "")}', is_recurring = true WHERE id = ${uuid(taskId)}`),
};
