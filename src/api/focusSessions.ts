import { apiRequest } from "./client";
import type {
  CompleteFocusSessionRequest,
  FocusSessionDto,
  StartFocusSessionRequest,
} from "./types";

/**
 * The currently in-progress session for this user, if any — null when there isn't one
 * (server returns 204). Lets a 409 from startFocusSession deep-link straight to it.
 */
export function getCurrentSession(): Promise<FocusSessionDto | null> {
  return apiRequest<FocusSessionDto | undefined>("/focus-sessions/current").then(
    (session) => session ?? null
  );
}

/** At most one in-progress session per user across all tasks — 409 if one's already open. */
export function startFocusSession(
  taskId: string,
  request: StartFocusSessionRequest = {}
): Promise<FocusSessionDto> {
  return apiRequest<FocusSessionDto>(`/tasks/${taskId}/focus-sessions`, {
    method: "POST",
    body: request,
  });
}

/** Server computes durationSeconds/pointsEarned itself — never trust a client-side timer value. */
export function completeFocusSession(
  sessionId: string,
  request: CompleteFocusSessionRequest = {}
): Promise<FocusSessionDto> {
  return apiRequest<FocusSessionDto>(`/focus-sessions/${sessionId}/complete`, {
    method: "POST",
    body: request,
  });
}

/**
 * Throws an in-progress session away without crediting any time.
 *
 * Completing was the only exit, and completing always credits — so a session left running
 * overnight had to be "finished" for hours the user never worked, purely to unblock starting
 * a new one. Refused on a session that has already finished.
 */
export function abandonFocusSession(sessionId: string): Promise<void> {
  return apiRequest<void>(`/focus-sessions/${sessionId}`, { method: "DELETE" });
}
