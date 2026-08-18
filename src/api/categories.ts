import { apiRequest } from "./client";
import type { CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from "./types";

export function createCategory(request: CreateCategoryRequest): Promise<CategoryDto> {
  return apiRequest<CategoryDto>("/categories", { method: "POST", body: request });
}

export function getCategories(): Promise<CategoryDto[]> {
  return apiRequest<CategoryDto[]>("/categories");
}

/** Partial update — only send the fields you're changing. */
export function updateCategory(
  categoryId: string,
  request: UpdateCategoryRequest
): Promise<CategoryDto> {
  return apiRequest<CategoryDto>(`/categories/${categoryId}`, {
    method: "PATCH",
    body: request,
  });
}

/** Tasks referencing this category become uncategorized (categoryId: null) — not deleted. */
export function deleteCategory(categoryId: string): Promise<void> {
  return apiRequest<void>(`/categories/${categoryId}`, { method: "DELETE" });
}
