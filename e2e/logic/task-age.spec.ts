import { expect, test } from "@playwright/test";
import { AGE_QUIET_DAYS, formatAge } from "../../src/utils/format";
import { newestFirst } from "../../src/utils/schedule";

/**
 * How old an undated task says it is.
 *
 * Undated tasks are the only kind nothing ages out: a null date reads as "today" by design, the
 * list is ordered newest-first, and so last month's captures sink to the bottom unseen. The row
 * said nothing under its title, which made a six-week-old thought and this morning's look the
 * same. These tests pin the two things that make the label worth having - that it stays quiet
 * while a task is genuinely recent, and that it never claims more precision than it has.
 */
const NOW = new Date("2026-06-15T12:00:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

test.describe("how old an undated task says it is", () => {
  test("AGE-01 · says nothing while the task is still recent", () => {
    for (let d = 0; d < AGE_QUIET_DAYS; d++) {
      expect(formatAge(daysAgo(d), NOW), `${d} days old`).toBeNull();
    }
    // And speaks the moment it stops being recent, so the boundary is a real one.
    expect(formatAge(daysAgo(AGE_QUIET_DAYS), NOW)).toBe("added 3 days ago");
  });

  test("AGE-02 · days, then weeks, then months - never a precision it hasn't got", () => {
    expect(formatAge(daysAgo(6), NOW)).toBe("added 6 days ago");
    expect(formatAge(daysAgo(13), NOW)).toBe("added 13 days ago");
    // 14 days is two weeks, not "14 days": nobody acts differently on 14 versus 15.
    expect(formatAge(daysAgo(14), NOW)).toBe("added 2 weeks ago");
    expect(formatAge(daysAgo(21), NOW)).toBe("added 3 weeks ago");
    /*
     * Weeks carry on until they stop being the clearer unit. 62 days is 8 weeks, and saying so
     * is more useful than "2 months" - which is why nothing ever reads "1 month": by the time
     * months take over, four weeks has already been said better as four weeks.
     */
    expect(formatAge(daysAgo(62), NOW)).toBe("added 8 weeks ago");
    expect(formatAge(daysAgo(63), NOW)).toBe("added 2 months ago");
    expect(formatAge(daysAgo(200), NOW)).toBe("added 6 months ago");
  });

  test("AGE-03 · a single unit is never plural", () => {
    // The only singular week reachable is 7-13 days, which is still counted in days - so the
    // plural guard matters most for months, where "1 months" is one bad modulo away.
    expect(formatAge(daysAgo(7), NOW)).toBe("added 7 days ago");
    expect(formatAge(daysAgo(30), NOW)).toBe("added 4 weeks ago");
    for (let d = 3; d <= 400; d++) {
      const text = formatAge(daysAgo(d), NOW)!;
      expect(text, `${d} days old`).not.toMatch(/\b1 (days|weeks|months)\b/);
    }
  });

  test("AGE-04 · nothing to say about a missing, unparseable or future date", () => {
    expect(formatAge(null, NOW)).toBeNull();
    expect(formatAge(undefined, NOW)).toBeNull();
    expect(formatAge("not a date", NOW)).toBeNull();
    // A clock disagreement between phone and server, not a task from the future.
    expect(formatAge(daysAgo(-5), NOW)).toBeNull();
  });
});

/**
 * Which undated tasks get Home's five places.
 *
 * Home shows only the newest five tasks that have no day, and the list they are picked from is
 * not in a dependable order: the server sends it newest first, but the app then adds a task just
 * captured (or one put back by Undo) at the *end*. So the order is decided on the screen, by this
 * one function, and Scheduled's ANYTIME panel uses the same one so the two lists agree.
 */
test.describe("which undated tasks come first", () => {
  const made = (name: string, createdAt: string | null | undefined) => ({ name, createdAt }) as { name: string; createdAt: string };
  const names = (tasks: { name: string }[]) => tasks.map((t) => t.name);

  test("AGE-05 · newest first, whatever order the list arrived in", () => {
    const list = [made("last week", daysAgo(7)), made("just now", daysAgo(0)), made("last month", daysAgo(30)), made("yesterday", daysAgo(1))];
    expect(names([...list].sort(newestFirst))).toEqual(["just now", "yesterday", "last week", "last month"]);
    // The case that was the bug: the newest task sitting at the very end of the list.
    const appended = [made("old 1", daysAgo(9)), made("old 2", daysAgo(8)), made("old 3", daysAgo(7)), made("just typed", daysAgo(0))];
    expect(names([...appended].sort(newestFirst))[0]).toBe("just typed");
  });

  test("AGE-06 · a task whose time is missing or unreadable sorts last, never first", () => {
    const list = [made("no time", null), made("garbled", "not a date"), made("old", daysAgo(400)), made("new", daysAgo(0)), made("absent", undefined)];
    const sorted = names([...list].sort(newestFirst));
    expect(sorted.slice(0, 2)).toEqual(["new", "old"]);
    expect(new Set(sorted.slice(2))).toEqual(new Set(["no time", "garbled", "absent"]));
  });

  test("AGE-07 · tasks made at the same instant keep the order they arrived in", () => {
    const at = daysAgo(2);
    const list = [made("first", at), made("second", at), made("third", at)];
    expect(names([...list].sort(newestFirst))).toEqual(["first", "second", "third"]);
    expect(newestFirst(list[0], list[1])).toBe(0);
  });

  test("AGE-08 · times written in different zones are compared as moments, not as text", () => {
    // 10:00 in India is 04:30 UTC, which is before 05:00 UTC - though "10:00" sorts after "05:00".
    const india = made("India 10:00", "2026-06-15T10:00:00+05:30");
    const utc = made("UTC 05:00", "2026-06-15T05:00:00Z");
    expect(names([india, utc].sort(newestFirst))).toEqual(["UTC 05:00", "India 10:00"]);
  });
});
