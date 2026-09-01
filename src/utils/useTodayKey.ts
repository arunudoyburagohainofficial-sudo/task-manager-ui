import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { todayKey } from "./schedule";

/**
 * Today's date key, kept correct while the app is open.
 *
 * Every screen that groups tasks by date reads "today" once per render. That's fine until the
 * app is left open across midnight: nothing re-renders on its own, so Home keeps showing
 * yesterday's list — with yesterday's tasks still counted as due today and today's still
 * hidden under Upcoming — until something unrelated happens to trigger a render.
 *
 * Backgrounding and returning already fixed it (the foreground sync rewrites the task cache),
 * so this covers the case that wasn't: a phone left sitting on a desk with the app in front.
 *
 * Two triggers, because neither alone is enough:
 *  - a timer set to the next local midnight, for an app that stays in the foreground
 *  - an AppState check, because timers don't reliably fire while suspended, so a phone woken
 *    after midnight needs the date re-read on resume rather than whenever the stale timer
 *    happens to catch up
 */
export function useTodayKey(): string {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // setState with the same string is a no-op in React, so a spurious check costs nothing
    // and this can be called as often as it likes.
    const sync = () => setToday(todayKey());

    const scheduleNextMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // A second past midnight rather than exactly on it: firing at 23:59:59.999 due to timer
      // imprecision would read the old date and then not re-arm until the following day.
      const ms = midnight.getTime() - now.getTime() + 1000;
      timeout = setTimeout(() => {
        sync();
        scheduleNextMidnight();
      }, ms);
    };

    scheduleNextMidnight();

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      sync();
      // The pending timer was computed against the old "now" and may be long stale after a
      // suspend, so it's replaced rather than trusted.
      if (timeout) clearTimeout(timeout);
      scheduleNextMidnight();
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      subscription.remove();
    };
  }, []);

  return today;
}
