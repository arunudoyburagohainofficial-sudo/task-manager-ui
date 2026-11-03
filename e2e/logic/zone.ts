import { expect, test } from "@playwright/test";

/**
 * The fixed clock and zone every `logic` test computes against.
 *
 * Fixed on both axes on purpose. These functions take an explicit `now`, or read the process
 * clock, and a test whose *meaning* changes with the calendar is worse than no test: it goes red
 * on a Tuesday in March for reasons nobody can reconstruct.
 *
 * The zone is set by `assertFixedZone` below (America/Los_Angeles — behind UTC, and with real DST
 * transitions). This module checks that it actually took effect, because the assumption is load-
 * order-dependent and everything below is silently wrong if it didn't.
 */

/** America/Los_Angeles, as minutes west of UTC — 480 in winter, 420 in summer. */
export const PST_OFFSET = 480;
export const PDT_OFFSET = 420;

/** 2026 US transitions: clocks spring forward on 8 March and fall back on 1 November. */
export const SPRING_FORWARD = "2026-03-08";
export const FALL_BACK = "2026-11-01";

/**
 * Fails the whole project if the zone isn't the one every expectation below was hand-computed
 * in. Cheap, and the alternative is a dozen confusing failures instead of one clear one.
 */
export function assertFixedZone(): void {
  test.beforeAll(() => {
    // Node reads TZ on every Date call, so setting it here takes effect for this file's tests —
    // whatever another project's file set before it in the same worker.
    process.env.TZ = "America/Los_Angeles";
    const winter = new Date(2026, 0, 15, 12).getTimezoneOffset();
    const summer = new Date(2026, 6, 15, 12).getTimezoneOffset();
    expect(
      { winter, summer },
      `These tests are hand-computed for America/Los_Angeles. Got TZ=${process.env.TZ ?? "(unset)"}.\n` +
        "Run them through the config, which sets it:\n" +
        "  npx playwright test --config=e2e/playwright.config.ts --project=logic"
    ).toEqual({ winter: PST_OFFSET, summer: PDT_OFFSET });
  });
}

/** Local midday on a given calendar day — unambiguous for "earlier today" / "later today". */
export function middayOn(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** "YYYY-MM-DD" for a Date's *local* calendar day, written out here rather than imported. */
export function localDateKey(at: Date): string {
  return [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
}

/** "HH:mm" for a Date's local wall clock — what the user would read off the notification. */
export function localClock(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD HH:mm", local — the form the expectations below are written in. */
export function localStamp(at: Date): string {
  return `${localDateKey(at)} ${localClock(at)}`;
}

/**
 * Runs `body` with the process clock frozen at `at`.
 *
 * Several of these functions read `Date.now()` directly rather than taking a `now` parameter
 * (`reminderOccurrences`, `intervalOccurrences`), so there is no other way to ask them about a
 * fixed moment. Restores in a `finally` so one failing test can't leave the clock moved for
 * every test after it.
 */
export function atMoment<T>(at: Date, body: () => T): T {
  const realNow = Date.now;
  const fixed = at.getTime();
  Date.now = () => fixed;
  // `new Date()` with no arguments reads the same clock in V8, but only via Date.now when it's
  // patched this way — so anything constructing a bare `new Date()` needs it too.
  const RealDate = global.Date;
  class FrozenDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      // @ts-expect-error — forwarding a variadic Date constructor is deliberately untyped
      super(...(args.length === 0 ? [fixed] : args));
    }
    static now() {
      return fixed;
    }
  }
  // @ts-expect-error — swapping the global Date for the duration of one call
  global.Date = FrozenDate;
  try {
    return body();
  } finally {
    global.Date = RealDate;
    Date.now = realNow;
  }
}
