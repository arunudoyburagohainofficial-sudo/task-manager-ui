import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { tasksApi } from "..";
import type { CreateTaskRequest, ReminderDto, TaskDto, TaskStatus, UpdateTaskRequest } from "../types";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";
import { syncReminders } from "../../notifications/useReminderSync";

export const ALL_TASK_STATUSES = [undefined, "pending", "completed", "archived"] as const;
/** The two list caches every task belongs to, regardless of status: its status-specific list, and the unfiltered "all" list. */
export const LIST_KEYS_FOR = (status: TaskStatus) => [queryKeys.tasks(status), queryKeys.tasks()];

/** Applies the same partial-update shape UpdateTaskRequest describes, wherever a copy of this task is cached. */
function withTaskUpdate(task: TaskDto, request: UpdateTaskRequest): TaskDto {
  return {
    ...task,
    ...(request.name !== undefined ? { name: request.name } : {}),
    ...(request.taskType !== undefined ? { taskType: request.taskType } : {}),
    ...(request.clearGoal ? { goalId: null } : request.goalId !== undefined ? { goalId: request.goalId } : {}),
  };
}

/** Replaces a matching-id entry inside every cached list that might contain it — a no-op for lists that don't have it. */
function patchTaskInLists(queryClient: QueryClient, taskId: string, updater: (task: TaskDto) => TaskDto) {
  for (const status of ALL_TASK_STATUSES) {
    queryClient.setQueryData<TaskDto[]>(queryKeys.tasks(status), (old) =>
      old?.some((t) => t.id === taskId) ? old.map((t) => (t.id === taskId ? updater(t) : t)) : old
    );
  }
}

export function removeTaskFromLists(queryClient: QueryClient, taskId: string) {
  for (const status of ALL_TASK_STATUSES) {
    queryClient.setQueryData<TaskDto[]>(queryKeys.tasks(status), (old) => old?.filter((t) => t.id !== taskId));
  }
}

export function useTasksQuery(status?: TaskStatus) {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.tasks(status),
    queryFn: () => tasksApi.getTasks(status),
    enabled: !!user,
  });
}

/**
 * Seeds from whatever tasks list is already cached (Home fetches "pending" and
 * "completed" before this screen ever mounts, in the app's one current navigation path)
 * so Task Detail can render instantly instead of blocking on its own network round trip.
 * initialDataUpdatedAt carries over the source list's own fetch time — without it, the
 * seeded data would be treated as "just fetched" and skip the background revalidation
 * that's the actual point of still calling getTask underneath; with it, this query
 * inherits the same staleness the source list already has; verified against the real
 * TaskDto shape (id/categoryId/taskType/etc.) in src/api/types.ts.
 */
export function useTaskQuery(taskId: string) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.task(taskId),
    queryFn: () => tasksApi.getTask(taskId),
    enabled: !!user && !!taskId,
    initialData: () => {
      for (const status of ALL_TASK_STATUSES) {
        const match = queryClient.getQueryData<TaskDto[]>(queryKeys.tasks(status))?.find((t) => t.id === taskId);
        if (match) return match;
      }
      return undefined;
    },
    initialDataUpdatedAt: () => {
      for (const status of ALL_TASK_STATUSES) {
        const state = queryClient.getQueryState<TaskDto[]>(queryKeys.tasks(status));
        if (state?.data) return state.dataUpdatedAt;
      }
      return undefined;
    },
  });
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateTaskRequest) => tasksApi.createTask(request),
    // onSuccess already hands back the real, server-confirmed task — appending it
    // directly into the cached lists shows it immediately, without waiting on a second
    // round trip (a refetch) just to re-learn something the response already told us.
    // New tasks are always created "pending" server-side, so only those two lists need it.
    onSuccess: (newTask) => {
      for (const key of LIST_KEYS_FOR("pending")) {
        queryClient.setQueryData<TaskDto[]>(key, (old) => (old ? [...old, newTask] : old));
      }
      queryClient.setQueryData(queryKeys.task(newTask.id), newTask);
    },
  });
}

/**
 * Fully optimistic, no refetch afterward at all: the single-task cache entry AND every
 * list entry for this task are patched with the exact same change up front (rolled back
 * together in onError), and onSettled no longer invalidates anything — the optimistic
 * write already represents the true new state once the request succeeds, so there's
 * nothing left to learn from asking the server again.
 */
export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, request }: { taskId: string; request: UpdateTaskRequest }) =>
      tasksApi.updateTask(taskId, request),
    onMutate: async ({ taskId, request }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previousTask = queryClient.getQueryData<TaskDto>(queryKeys.task(taskId));
      const previousLists = ALL_TASK_STATUSES.map((status) => [status, queryClient.getQueryData<TaskDto[]>(queryKeys.tasks(status))] as const);

      if (previousTask) queryClient.setQueryData<TaskDto>(queryKeys.task(taskId), withTaskUpdate(previousTask, request));
      patchTaskInLists(queryClient, taskId, (t) => withTaskUpdate(t, request));

      return { previousTask, previousLists };
    },
    onError: (_err, { taskId }, context) => {
      if (context?.previousTask) queryClient.setQueryData(queryKeys.task(taskId), context.previousTask);
      for (const [status, data] of context?.previousLists ?? []) {
        queryClient.setQueryData(queryKeys.tasks(status), data);
      }
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.deleteTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.removeQueries({ queryKey: queryKeys.task(taskId) });
      removeTaskFromLists(queryClient, taskId);
    },
  });
}

/**
 * Completing a task returns the real, complete server-confirmed task — moved from
 * whichever list it was in over to "completed" directly, no refetch needed for the task
 * itself. Streak, weekly-progress and goals are the legitimate exceptions in this whole
 * file: their new values genuinely aren't knowable from this response (the server computes
 * streak/grace-day/points and the goal's day count itself), so those specifically still
 * invalidate — that's a real "we know something changed but not to what," not a leftover
 * habit. Goals are only invalidated when this task actually had one.
 *
 * The server already stops this task's reminder as part of completing it (see
 * TaskService.completeTask -> ReminderService.stopReminders), but that's server-side state
 * only. Without the two lines below, a reminder already scheduled on the device for later
 * today keeps ticking toward firing — nothing else here touches the reminders cache or the
 * on-device notification queue, and the next real sync only happens on the app's next
 * foreground transition (see useReminderSync). Patching isActive locally matches what
 * useMarkTaskDoneMutation already does for the other completion path; syncReminders is
 * what actually cancels the stale notification now instead of at that next foreground.
 */
export function useCompleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, points }: { taskId: string; points?: number }) => tasksApi.completeTask(taskId, points),
    onSuccess: (completedTask) => {
      queryClient.setQueryData(queryKeys.task(completedTask.id), completedTask);
      removeTaskFromLists(queryClient, completedTask.id);
      for (const key of LIST_KEYS_FOR("completed")) {
        queryClient.setQueryData<TaskDto[]>(key, (old) => (old ? [...old, completedTask] : old));
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: ["weeklyProgress"] });
      if (completedTask.goalId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      }

      queryClient.setQueryData<ReminderDto[]>(queryKeys.reminders(), (old) =>
        old?.map((r) => (r.taskId === completedTask.id ? { ...r, isActive: false } : r))
      );
      void syncReminders();
    },
  });
}
