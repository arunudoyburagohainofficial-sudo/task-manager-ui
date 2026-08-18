import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoriesApi } from "..";
import type { CategoryDto, CreateCategoryRequest, TaskDto, UpdateCategoryRequest } from "../types";
import { queryKeys } from "../queryKeys";
import { useSession } from "../../state/SessionContext";
import { ALL_TASK_STATUSES } from "./useTasks";

export function useCategoriesQuery() {
  const { user } = useSession();
  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => categoriesApi.getCategories(),
    enabled: !!user,
  });
}

/** onSuccess already has the real created category — append it directly instead of re-fetching the list to learn it. */
export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateCategoryRequest) => categoriesApi.createCategory(request),
    onSuccess: (newCategory) => {
      queryClient.setQueryData<CategoryDto[]>(queryKeys.categories(), (old) => (old ? [...old, newCategory] : old));
    },
  });
}

/** onSuccess already has the real updated category — replace the matching cached entry directly. */
export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, request }: { categoryId: string; request: UpdateCategoryRequest }) =>
      categoriesApi.updateCategory(categoryId, request),
    onSuccess: (updatedCategory) => {
      queryClient.setQueryData<CategoryDto[]>(queryKeys.categories(), (old) =>
        old?.map((c) => (c.id === updatedCategory.id ? updatedCategory : c))
      );
    },
  });
}

/**
 * The server re-buckets every task that had this category to categoryId: null — but
 * unlike streak/weekly-progress elsewhere, that effect is fully deterministic from
 * information we already have (the deleted category's id), not a genuine unknown. So
 * this replicates the same transformation client-side across every cached task list
 * instead of invalidating them to ask the server to tell us something we can already
 * compute ourselves.
 */
export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => categoriesApi.deleteCategory(categoryId),
    onSuccess: (_data, categoryId) => {
      queryClient.setQueryData<CategoryDto[]>(queryKeys.categories(), (old) => old?.filter((c) => c.id !== categoryId));
      for (const status of ALL_TASK_STATUSES) {
        queryClient.setQueryData<TaskDto[]>(queryKeys.tasks(status), (old) =>
          old?.map((t) => (t.categoryId === categoryId ? { ...t, categoryId: null } : t))
        );
      }
    },
  });
}
