import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { remindersApi } from "..";
import type { CreateReminderRequest, ReminderDto, TaskDto, UpdateReminderRequest } from "../types";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";
import { ALL_TASK_STATUSES, LIST_KEYS_FOR, removeTaskFromLists } from "./useTasks";

export function useRemindersQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.reminders(),
    queryFn: () => remindersApi.getReminders(),
    enabled: !!user,
  });
}

/** onSuccess already has the real created reminder — append it directly instead of re-fetching the whole list to learn it. */
export function useCreateReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, request }: { taskId: string; request: CreateReminderRequest }) =>
      remindersApi.createReminder(taskId, request),
    onSuccess: (newReminder) => {
      queryClient.setQueryData<ReminderDto[]>(queryKeys.reminders(), (old) => (old ? [...old, newReminder] : old));
    },
  });
}

/** onSuccess already has the real updated reminder — replace the matching cached entry directly. */
export function useUpdateReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reminderId, request }: { reminderId: string; request: UpdateReminderRequest }) =>
      remindersApi.updateReminder(reminderId, request),
    onSuccess: (updatedReminder) => {
      queryClient.setQueryData<ReminderDto[]>(queryKeys.reminders(), (old) =>
        old?.map((r) => (r.id === updatedReminder.id ? updatedReminder : r))
      );
    },
  });
}

/** The id being deleted is the mutation's own input — no need to wait for a refetch to know which one disappeared. */
export function useDeleteReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reminderId: string) => remindersApi.deleteReminder(reminderId),
    onSuccess: (_data, reminderId) => {
      queryClient.setQueryData<ReminderDto[]>(queryKeys.reminders(), (old) => old?.filter((r) => r.id !== reminderId));
    },
  });
}

/**
 * Same real-world effect as completing a focus task, but this endpoint's response is
 * just {success, message} — no task or reminder object comes back, unlike
 * useCompleteTaskMutation's. So this one is optimistic (onMutate, not onSuccess): the
 * task is moved to "completed" using a best-effort completedAt (now — off by at most the
 * request's own latency, which never matters for a date-only display value), and its
 * reminder is marked isActive: false, matching ReminderDto.isActive's own documented
 * meaning ("false once stopped/completed"). Streak and weekly-progress genuinely can't be
 * known from this response either way, so those two still invalidate — the one real
 * exception, not a leftover habit.
 */
export function useMarkTaskDoneMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => remindersApi.markTaskDone(taskId),
    onMutate: async (taskId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previousTask =
        queryClient.getQueryData<TaskDto>(queryKeys.task(taskId)) ??
        queryClient.getQueryData<TaskDto[]>(queryKeys.tasks("pending"))?.find((t) => t.id === taskId);
      const previousLists = ALL_TASK_STATUSES.map((status) => [status, queryClient.getQueryData<TaskDto[]>(queryKeys.tasks(status))] as const);
      const previousReminders = queryClient.getQueryData<ReminderDto[]>(queryKeys.reminders());

      if (previousTask) {
        const completedTask: TaskDto = { ...previousTask, status: "completed", completedAt: new Date().toISOString() };
        queryClient.setQueryData(queryKeys.task(taskId), completedTask);
        removeTaskFromLists(queryClient, taskId);
        for (const key of LIST_KEYS_FOR("completed")) {
          queryClient.setQueryData<TaskDto[]>(key, (old) => (old ? [...old, completedTask] : old));
        }
      }
      queryClient.setQueryData<ReminderDto[]>(queryKeys.reminders(), (old) =>
        old?.map((r) => (r.taskId === taskId ? { ...r, isActive: false } : r))
      );

      return { previousTask, previousLists, previousReminders };
    },
    onError: (_err, taskId, context) => {
      if (context?.previousTask) queryClient.setQueryData(queryKeys.task(taskId), context.previousTask);
      for (const [status, data] of context?.previousLists ?? []) {
        queryClient.setQueryData(queryKeys.tasks(status), data);
      }
      queryClient.setQueryData(queryKeys.reminders(), context?.previousReminders);
    },
    onSuccess: (_data, taskId, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: ["weeklyProgress"] });
      // Same "changed, but the response can't say to what" case — and only worth asking
      // about when the completed task was actually attached to a goal.
      if (context?.previousTask?.goalId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      }
    },
  });
}
