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
