import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "quick-focus-stubs-v1";

/**
 * Tasks that exist only to carry a session, made by Home's slide-to-focus.
 *
 * A focus session has to belong to a task — that is how minutes, points, streak and goals are
 * credited — so "just start focusing" has to invent one. If the session then credits nothing, the
 * task it was invented for has no reason to survive, and an undated task never ages off Home
 * (`bucketFor` reads a null date as "today" by design), so it would sit there for good.
 *
 * Kept on disk rather than in memory because the gap between creating the task and the session
 * ending can span an app restart.
 */
async function read(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function write(ids: string[]): Promise<void> {
  try {
    // Only the recent few can still be in flight; the cap stops a failed cleanup growing forever.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // A lost mark costs one stray task, which the user can delete. Never worth throwing for.
  }
}

export async function markQuickFocusStub(taskId: string): Promise<void> {
  const ids = await read();
  if (!ids.includes(taskId)) await write([...ids, taskId]);
}

export async function isQuickFocusStub(taskId: string): Promise<boolean> {
  return (await read()).includes(taskId);
}

/** The session earned something, so the task is real now and stops being a candidate for removal. */
export async function forgetQuickFocusStub(taskId: string): Promise<void> {
  const ids = await read();
  if (ids.includes(taskId)) await write(ids.filter((id) => id !== taskId));
}

/**
 * Deletes a task if — and only if — it was one of these throwaways, and forgets the mark.
 *
 * Every place that abandons a session needs this. A session can be discarded from three
 * different screens, and the two collision dialogs used to abandon the session while leaving
 * its task behind: pending, undated, and therefore on Home for good.
 *
 * Returns true when something was removed, so callers can refresh the list.
 */
export async function dropQuickFocusTask(taskId: string): Promise<boolean> {
  if (!(await isQuickFocusStub(taskId))) return false;
  await forgetQuickFocusStub(taskId);
  try {
    const { tasksApi } = await import("../api");
    await tasksApi.deleteTask(taskId);
    return true;
  } catch {
    return false;
  }
}
