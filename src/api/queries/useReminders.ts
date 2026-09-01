import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { remindersApi } from "..";
import type { CreateIntervalReminderRequest, IntervalReminderDto, ReminderDto, TaskDto } from "../types";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";
import { syncReminders } from "../../notifications/useReminderSync";
import { ALL_TASK_STATUSES, LIST_KEYS_FOR, removeTaskFromLists } from "./useTasks";

/**
 * A task's repeated-nudge window, if it has one.
 *
 * Interval reminders have existed server-side since V001 with no screen to reach them — this
 * and the mutations below are what NudgeSheet needed in order to surface them.
 */
export function useIntervalRemindersQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.intervalReminders(),
    queryFn: () => remindersApi.getIntervalReminders(),
    enabled: !!user,
  });
}

export function useSetIntervalReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      existingId,
      request,
    }: {
      taskId: string;
      existingId?: string;
      request: CreateIntervalReminderRequest;
    }) => {
      // Create and update are separate endpoints server-side, and creating a second one for a
      // task 409s — so which to call depends on whether the task already has a window.
      if (existingId) return remindersApi.updateIntervalReminder(existingId, request);
      return remindersApi.createIntervalReminder(taskId, request);
    },
    onSuccess: () => {
      // The create endpoint returns {success, message} rather than the row, so there's nothing
      // to patch in with — this is a genuine "something changed, but not what to" refetch.
      queryClient.invalidateQueries({ queryKey: queryKeys.intervalReminders() });
      void syncReminders();
    },
  });
}

export function useDeleteIntervalReminderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intervalReminderId: string) => remindersApi.deleteIntervalReminder(intervalReminderId),
    onSuccess: (_data, intervalReminderId) => {
      queryClient.setQueryData<IntervalReminderDto[]>(queryKeys.intervalReminders(), (old) =>
        old?.filter((r) => r.id !== intervalReminderId)
      );
      void syncReminders();
    },
  });
}

export function useRemindersQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.reminders(),
    queryFn: () => remindersApi.getReminders(),
    enabled: !!user,
  });
}

/*
 * The create / update / delete reminder mutations are gone.
 *
 * Setting a notification is part of updating the task now (useUpdateTaskMutation with
 * notifyTime / clearNotify), so there is no separate reminder write to keep the task caches
 * in step with — which is what patchTaskSchedule existed to do. One call, one cache update.
 */

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
      // The server spawns the next occurrence of a repeating task as part of completing it
      // — same reasoning as useCompleteTaskMutation, and needed on this path too so which
      // button was pressed doesn't decide whether the routine reappears.
      if (context?.previousTask?.recurrenceRule) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks("pending") });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
        queryClient.invalidateQueries({ queryKey: queryKeys.reminders() });
      }
    },
  });
}
