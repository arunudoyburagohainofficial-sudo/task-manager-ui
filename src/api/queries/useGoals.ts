import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "..";
import type { CreateGoalRequest, GoalDto, TaskDto, UpdateGoalRequest } from "../types";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";
import { ALL_TASK_STATUSES } from "./useTasks";

export function useGoalsQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.goals(),
    queryFn: () => goalsApi.getGoals(),
    enabled: !!user,
  });
}

/** onSuccess already has the real created goal — append it directly instead of re-fetching the list. */
export function useCreateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateGoalRequest) => goalsApi.createGoal(request),
    onSuccess: (newGoal) => {
      // Newest-first, matching the server's findByUserIdOrderByCreatedAtDesc.
      queryClient.setQueryData<GoalDto[]>(queryKeys.goals(), (old) => (old ? [newGoal, ...old] : old));
    },
  });
}

/**
 * onSuccess already has the real updated goal — including a status the server may have
 * recomputed on its own (lowering targetDays below totalDaysActive completes the goal),
 * which is exactly why this replaces the cached entry wholesale rather than merging the
 * request's fields over it.
 */
export function useUpdateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, request }: { goalId: string; request: UpdateGoalRequest }) =>
      goalsApi.updateGoal(goalId, request),
    onSuccess: (updatedGoal) => {
      queryClient.setQueryData<GoalDto[]>(queryKeys.goals(), (old) =>
        old?.map((g) => (g.id === updatedGoal.id ? updatedGoal : g))
      );
    },
  });
}

/**
 * The server clears goalId on every task that referenced this goal (ON DELETE SET NULL) —
 * a fully deterministic effect we already have the information to replicate, so the task
 * lists are patched here rather than invalidated. Same reasoning as category deletion.
 */
export function useDeleteGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.deleteGoal(goalId),
    onSuccess: (_data, goalId) => {
      queryClient.setQueryData<GoalDto[]>(queryKeys.goals(), (old) => old?.filter((g) => g.id !== goalId));
      for (const status of ALL_TASK_STATUSES) {
        queryClient.setQueryData<TaskDto[]>(queryKeys.tasks(status), (old) =>
          old?.map((t) => (t.goalId === goalId ? { ...t, goalId: null } : t))
        );
      }
    },
  });
}
