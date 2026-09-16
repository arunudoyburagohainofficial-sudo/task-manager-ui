/**
 * What things are worth, mirrored from task-svc so a row can show its points before it's done.
 * Duplicated rather than fetched because the server exposes no rate endpoint — if either
 * constant changes there, these are the one place the client has to follow it.
 */

/** FocusSessionService.POINTS_PER_MINUTE — a session earns 1 per full minute credited. */
export const POINTS_PER_MINUTE = 1;

/** CompletionPoints.REMINDER_POINTS — a flat amount for finishing a reminder. */
export const REMINDER_POINTS = 5;
