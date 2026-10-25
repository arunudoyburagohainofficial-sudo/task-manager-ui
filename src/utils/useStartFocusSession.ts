import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api";
import { ApiError } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { FocusMode } from "../api/types";
import { usePreferences } from "../state/PreferencesContext";
import { tasksApi } from "../api";
import { dropQuickFocusTask } from "./quickFocusStubs";
import { resumeSessionParams } from "./focusSession";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export interface StartSessionOptions {
  taskId: string;
  focusMode?: FocusMode;
  /** Minutes per work block. Defaults to the length set in Settings. */
  blockMinutes?: number;
  /** Pomodoro only; ignored in regular mode. */
  cycles?: number;
  dndEnabled?: boolean;
  /**
   * Set when the caller made a task purely to hang this session on — Home's slide-to-focus. If
   * the session can't start, or is discarded from the collision dialog, the task is deleted with
   * it. Nothing was credited, so leaving a stub behind would just litter the list.
   */
  createdTaskId?: string;
}

/**
 * Starting a focus session, from wherever the user asked for one.
 *
 * Lives here rather than on Task Detail because Home starts sessions too, and the interesting
 * part is not the happy path — it is the 409. Only one session may be open per user, enforced by
 * a unique index rather than by the service's check-then-act, so a second start can genuinely
 * collide. When it does the answer is never an error toast: resume the session that exists, or
 * offer to discard it. Two copies of that reasoning would drift.
 */
/** Removes a task that only existed to carry a session that never started. */
async function discardStub(taskId: string | undefined, queryClient: ReturnType<typeof useQueryClient>) {
  if (!taskId) return;
  try {
    await tasksApi.deleteTask(taskId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
  } catch {
    // Leaving one stray task behind is better than blocking the user on a cleanup failure.
  }
}

export function useStartFocusSession() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { defaultFocusDurationMinutes, dndDuringFocusEnabled } = usePreferences();
  const [starting, setStarting] = useState(false);

  const start = useCallback(
    async ({ taskId, focusMode = "regular", blockMinutes, cycles = 1, dndEnabled, createdTaskId }: StartSessionOptions) => {
      if (starting) return;
      setStarting(true);

      const block = blockMinutes ?? defaultFocusDurationMinutes;
      const dnd = dndEnabled ?? dndDuringFocusEnabled;
      // The whole sitting, not one cycle: a Pomodoro session runs `cycles` work blocks, and
      // capping at a single block would clip a legitimate full session.
      const plannedMinutes = focusMode === "pomodoro" ? block * cycles : block;

      try {
        const session = await focusSessionsApi.startFocusSession(taskId, {
          focusMode,
          plannedMinutes,
          // Sent so the sitting can be picked up exactly as configured; the server ignores it
          // for a regular session, which is one block by definition.
          ...(focusMode === "pomodoro" ? { numPomodoroCycles: cycles } : {}),
        });
        /*
         * Navigate first, then write the cache.
         *
         * The other way round, React committed the running card onto Home and painted it before
         * the push began - so sliding to focus showed the timer start *on Home*, counting, and
         * only then slid the session screen over the top of it. Both calls are synchronous and
         * in the same tick, so doing them in this order lands them in one commit and Home never
         * renders the card while it is still the screen in front.
         *
         * The cache write itself still has to happen here: Home reads this entry, and without it
         * backing out of the session would show no sign of one running.
         */
        navigation.navigate("FocusSession", {
          sessionId: session.id,
          taskId,
          focusMode,
          totalCycles: cycles,
          sessionMinutes: block,
          dndEnabled: dnd,
          // Handed over rather than cached here: the session screen writes it once it is
          // mounted and covering Home, so the timer never appears on Home and slide away.
          startedSession: session,
        });
        return;
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) {
          await discardStub(createdTaskId, queryClient);
          Alert.alert("Couldn't start session", "Try again.");
          return;
        }

        // Another session owns the slot, so this one's throwaway task has no reason to exist.
        await discardStub(createdTaskId, queryClient);

        const current = await focusSessionsApi.getCurrentSession().catch(() => null);
        if (current) {
          queryClient.setQueryData(queryKeys.currentFocusSession(), current);
          navigation.navigate("FocusSession", resumeSessionParams(current, defaultFocusDurationMinutes, dnd));
          return;
        }

        /*
         * A session is open but we cannot reach it to resume, so the user is blocked with
         * nowhere to go. Discarding is offered rather than only "try again", because the
         * alternative was completing a session they never ran — crediting focus time for work
         * that did not happen, just to get unstuck.
         */
        Alert.alert(
          "A session is already running",
          "One focus at a time. If you've lost track of it, you can discard it - nothing will be credited.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Discard it",
              style: "destructive",
              onPress: async () => {
                try {
                  const stuck = await focusSessionsApi.getCurrentSession();
                  if (stuck) {
                    await focusSessionsApi.abandonFocusSession(stuck.id);
                    // The stuck session may itself have been a quick focus. Abandoning it
                    // without this left its task on Home permanently.
                    if (await dropQuickFocusTask(stuck.taskId)) {
                      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                    }
                  }
                  queryClient.setQueryData(queryKeys.currentFocusSession(), null);
                } catch {
                  Alert.alert("Couldn't discard it", "Check your connection and try again.");
                }
              },
            },
          ]
        );
      } finally {
        setStarting(false);
      }
    },
    [starting, defaultFocusDurationMinutes, dndDuringFocusEnabled, navigation, queryClient]
  );

  return { start, starting };
}
