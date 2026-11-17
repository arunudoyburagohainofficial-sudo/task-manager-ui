import { apiRequest } from "./client";
import type { CreateTaskRequest, TaskDto, TaskStatus, UpdateTaskRequest } from "./types";

export function createTask(request: CreateTaskRequest): Promise<TaskDto> {
  return apiRequest<TaskDto>("/tasks", { method: "POST", body: request });
}

export function getTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}`);
}

/**
 * The server's own ceiling on an explicitly requested page (TaskService.MAX_PAGE_SIZE). Asking
 * for more is clamped to this, so asking for exactly it is the largest useful page.
 */
const PAGE_SIZE = 200;

/**
 * A stop, so a bug on either side cannot turn one screen into an unbounded request loop.
 * 25 pages is 5,000 outstanding tasks - far past the point the app is pleasant to use, and far
 * enough that reaching it means something is wrong rather than that somebody is busy.
 */
const MAX_PAGES = 25;

/**
 * How far back any screen reads finished work. Home lists what was finished today; Progress
 * counts this week's seven bars, and a week can have started seven days ago. One more day than
 * that, so a phone and a server that disagree about the hour cannot leave the first bar short.
 */
const COMPLETED_WINDOW_DAYS = 8;

/**
 * True once a page of finished tasks has gone further back than anything reads.
 *
 * The server sends them most recently finished first, with any that somehow carry no finish
 * time at the very end - so the last row of a page is its oldest, and one with no time means
 * every dated row has already been seen.
 */
function reachesBefore(batch: TaskDto[], cutoff: number): boolean {
  const last = batch[batch.length - 1];
  if (!last?.completedAt) return true;
  const finished = Date.parse(last.completedAt);
  return Number.isNaN(finished) || finished < cutoff;
}

/**
 * Every task of a status, fetched a page at a time.
 *
 * This used to be a single unpaged request, which the server answers with at most 1,000 rows -
 * and past that it silently returned the newest 1,000 and dropped the rest, logging a warning
 * nothing surfaced. The ones dropped were the oldest, which is exactly the long-neglected
 * backlog a user has forgotten about and would never notice missing.
 *
 * Paging lives here rather than in the screens on purpose. Home and Scheduled both derive
 * everything - their sections, their counts, the tab badge - from one cached list, and a screen
 * that held only the first page could not bucket or count what it had not fetched. Looping here
 * keeps that single-list model exactly as it was and simply makes the list complete.
 *
 * It costs nothing for an ordinary account: under 200 tasks the first page comes back short and
 * the loop stops after one request, which is what it always did.
 *
 * Finished work is the exception, and stops early. Outstanding tasks have to be complete
 * because every one of them is still the user's to do; finished ones only ever accumulate, and
 * nothing reads further back than this week (see COMPLETED_WINDOW_DAYS). Paging through all of
 * them made every launch re-download the whole history - three requests for six hundred
 * finished tasks, thirty for six thousand - to draw a list of what was done today.
 */
export async function getTasks(status?: TaskStatus): Promise<TaskDto[]> {
  const all: TaskDto[] = [];
  const seen = new Set<string>();
  const oldestNeeded = Date.now() - COMPLETED_WINDOW_DAYS * 86_400_000;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await apiRequest<TaskDto[]>("/tasks", {
      // The server derives its page number as offset / limit, so offsets have to land on
      // multiples of the page size or pages overlap.
      query: { status, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    });

    for (const task of batch) {
      // A task created between two requests shifts everything after it down a row, which can
      // hand back a row already seen. Dropping the duplicate is cheaper than a cursor, and the
      // alternative is a list that renders the same task twice.
      if (!seen.has(task.id)) {
        seen.add(task.id);
        all.push(task);
      }
    }

    // A short page is the end of the list. A full one might be, and the next request settles it.
    if (batch.length < PAGE_SIZE) return all;
    if (status === "completed" && reachesBefore(batch, oldestNeeded)) return all;
  }

  return all;
}

/**
 * Marks the task completed, sends a celebration push, and (for focus-type tasks) updates streak +
 * weekly progress. What it earned comes back as pointsEarned — decided by the server, so nothing
 * is sent for it.
 */
export function completeTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}/complete`, { method: "POST" });
}

/** Partial update — name, taskType, and/or category (see UpdateTaskRequest for clearing it). */
export function updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}`, { method: "PATCH", body: request });
}

/** Undo a completion — see task-svc's TaskService.reopenTask for what is and isn't reversed. */
export function reopenTask(taskId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>(`/tasks/${taskId}/reopen`, { method: "POST" });
}

export function deleteTask(taskId: string): Promise<void> {
  return apiRequest<void>(`/tasks/${taskId}`, { method: "DELETE" });
}
