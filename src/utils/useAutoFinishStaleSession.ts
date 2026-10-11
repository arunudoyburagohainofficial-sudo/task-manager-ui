import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi, tasksApi } from "../api";
import { queryKeys } from "../api/queryKeys";
import type { FocusSessionDto } from "../api/types";
import { forgetQuickFocusStub, isQuickFocusStub } from "./quickFocusStubs";

/** Mirrors FocusSessionService.OVERRUN_GRACE_MINUTES. */
const OVERRUN_GRACE_MINUTES = 5;
/** Mirrors FocusSessionService.MAX_CREDITED_MINUTES. */
const MAX_CREDITED_MINUTES = 240;

/** The last minute a session can still earn anything. Past this, staying open buys nothing. */
function creditCeilingMinutes(planned: number | null): number {
  return planned != null && planned > 0
    ? Math.min(planned + OVERRUN_GRACE_MINUTES, MAX_CREDITED_MINUTES)
    : MAX_CREDITED_MINUTES;
}

/**
 * Closes a session that was started and then never ended.
 *
 * Backing out of the session screen leaves the session open, and nothing else ever closes it —
 * so the task sits on Home as "in session" indefinitely, and the next start collides with a 409.
 * Quick focus made this easy to hit, because starting is now one motion.
 *
 * It only fires once a session is past the point where it could earn anything more: the server
 * credits at most `planned + 5` minutes, capped at 240. Finishing then costs the user nothing
 * they had not already stopped earning, and it is the same figure they would have got by
 * pressing the button themselves.
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
    if (elapsedMinutes < creditCeilingMinutes(session.plannedMinutes)) return;

    attempted.current = session.id;
    const { id, taskId } = session;

    void (async () => {
      try {
        // wasInterrupted: it was. Nobody pressed finish; the clock simply ran out and kept going.
        await focusSessionsApi.completeFocusSession(id, { wasInterrupted: true });

        // A quick-focus task follows the same rule as a hand-finished one: it earned real time,
        // so it completes rather than lingering as something still to do.
        if (await isQuickFocusStub(taskId)) {
          await forgetQuickFocusStub(taskId);
          await tasksApi.completeTask(taskId).catch(() => {});
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
