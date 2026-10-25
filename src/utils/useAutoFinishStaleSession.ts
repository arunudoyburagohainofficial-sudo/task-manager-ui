import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi, tasksApi } from "../api";
import { queryKeys } from "../api/queryKeys";
import type { FocusSessionDto } from "../api/types";
import { forgetQuickFocusStub, isQuickFocusStub } from "./quickFocusStubs";
import { isSessionPaused } from "./sessionPause";

/**
 * Slack before a session counts as abandoned.
 *
 * Nothing to do with what gets credited any more - the server pays exactly the planned length
 * and no grace. This is only about *when* to close an open session, and closing one a few
 * minutes late costs nothing while closing it early costs someone their work.
 */
const OVERRUN_GRACE_MINUTES = 5;
/** Mirrors FocusSessionService.MAX_CREDITED_MINUTES. */
const MAX_CREDITED_MINUTES = 240;

/** Each rest between Pomodoro rounds, from FocusSessionScreen.BREAK_SECONDS. */
const BREAK_MINUTES = 5;
/**
 * The break allowance never drops below this many rounds' worth, whatever the session says.
 *
 * Sessions did not record their split until 2026-10-13, so this was simply the assumption made
 * for all of them. Now that the real count is on the row it would be natural to use it and
 * nothing else — but that would *tighten* the rule, because a break waits at zero until it is
 * tapped and a user is entitled to take twenty minutes over one. A 2 x 15 would go from roughly
 * 65 minutes of grace to 45, and anyone who stepped away mid-break would come back to a closed
 * session.
 *
 * So the real count can only ever buy more room, never less. Being late to close an abandoned
 * session costs nothing. Being early costs someone their work.
 */
const MIN_BREAK_ALLOWANCE_CYCLES = 6;

/**
 * How long a session may run before closing it is safe.
 *
 * For a regular session that is the point where credit stopped, plus a little slack.
 *
 * Pomodoro needs more, and getting this wrong ends someone's session while they are working.
 * `plannedMinutes` counts *work* only — a 3 x 25 sitting is stored as 75 — but the sitting also
 * contains two five-minute breaks, so it occupies 85 minutes of real time. Closing at 80 would
 * land in the middle of the last round. Breaks also wait at zero until tapped, so the true
 * length has no fixed upper bound; the allowance is generous on purpose.
 *
 * Being late to close an abandoned session costs nothing. Being early costs someone their work.
 */
function staleAfterMinutes(session: FocusSessionDto): number {
  const planned = session.plannedMinutes;
  if (planned == null || planned <= 0) return MAX_CREDITED_MINUTES;

  const breaks =
    session.focusMode === "pomodoro"
      ? Math.max(session.numPomodoroCycles ?? 0, MIN_BREAK_ALLOWANCE_CYCLES) * BREAK_MINUTES
      : 0;

  return Math.min(planned + breaks + OVERRUN_GRACE_MINUTES, MAX_CREDITED_MINUTES);
}

/**
 * Closes a session that was started and then never ended.
 *
 * Backing out of the session screen leaves the session open, and nothing else ever closes it —
 * so the task sits on Home as "in session" indefinitely, and the next start collides with a 409.
 * Quick focus made this easy to hit, because starting is now one motion.
 *
 * It only fires once a session is past the point where it could earn anything more: the server
 * credits exactly the planned length, capped at 240. Finishing then costs the user nothing they
 * had not already stopped earning, and it is the same figure they would have got by pressing the
 * button themselves.
 *
 * Deliberately NOT a timer. It runs when the app looks at a session — opening Home, coming back
 * to the foreground — because a session nobody is watching does not need closing on a schedule,
 * only before it gets in the way.
 */
export function useAutoFinishStaleSession(session: FocusSessionDto | null): void {
  const queryClient = useQueryClient();
  // One attempt per session id, so a failure or a slow refetch cannot start a loop.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!session || attempted.current === session.id) return;

    const elapsedMinutes = (Date.now() - Date.parse(session.startedAt)) / 60_000;
    if (elapsedMinutes < staleAfterMinutes(session)) return;

    attempted.current = session.id;
    const { id, taskId } = session;
    // The device's own calendar day, which is the one the server credits against.
    const startedOnAnEarlierDay =
      new Date(session.startedAt).toDateString() !== new Date().toDateString();

    void (async () => {
      try {
        /*
         * A deliberate pause is the one case where a long-running session is not abandoned.
         * The server cannot tell — there is no pause endpoint — so the phone records it.
         *
         * The hard ceiling still applies: past 240 minutes nothing can be credited whatever
         * the user intended, and a pause left overnight is not a pause anyone is coming back
         * to. So a paused session is spared, but not forever.
         */
        if (elapsedMinutes < MAX_CREDITED_MINUTES && (await isSessionPaused(id))) {
          attempted.current = null;
          return;
        }
        if (startedOnAnEarlierDay) {
          /*
           * The session was left open overnight, so finishing it now would credit the wrong day.
           * The server records minutes, points and the streak against the moment a session is
           * *closed*, not the moment it started — so pressing finish today hands yesterday's
           * sitting to today's totals, and marks today as a day the user showed up. The streak
           * is deliberately never reversible, so that one is permanent.
           *
           * Nobody was working at 3am. Throwing it away claims nothing, which is the honest
           * answer, and it still clears the way for the next session to start.
           */
          await focusSessionsApi.abandonFocusSession(id);

          // The task existed only to carry that session. Nothing was earned, so nothing is kept.
          if (await isQuickFocusStub(taskId)) {
            await forgetQuickFocusStub(taskId);
            await tasksApi.deleteTask(taskId).catch(() => {});
          }
        } else {
          // wasInterrupted: it was. Nobody pressed finish; the clock ran out and kept going.
          await focusSessionsApi.completeFocusSession(id, { wasInterrupted: true });

          // A quick-focus task follows the same rule as a hand-finished one: it earned real time,
          // so it completes rather than lingering as something still to do.
          if (await isQuickFocusStub(taskId)) {
            await forgetQuickFocusStub(taskId);
            await tasksApi.completeTask(taskId).catch(() => {});
          }
        }

        queryClient.setQueryData(queryKeys.currentFocusSession(), null);
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        void queryClient.invalidateQueries({ queryKey: ["todayProgress"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      } catch {
        // Leave it open and try again next time the app looks. Never block the screen on this.
        attempted.current = null;
      }
    })();
  }, [session, queryClient]);
}
