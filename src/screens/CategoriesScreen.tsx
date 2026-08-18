import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCategoriesQuery, useCreateCategoryMutation, useDeleteCategoryMutation, useUpdateCategoryMutation } from "../api/queries/useCategories";
import { useTasksQuery } from "../api/queries/useTasks";
import type { CategoryDto } from "../api/types";
import { Body, Button, CategoryEditSheet, ScreenContainer, ScreenTitle, Text } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CategoriesScreen() {
  const { colors } = useAppearance();
  const { user } = useSession();
  const navigation = useNavigation<Nav>();

  const categoriesQuery = useCategoriesQuery();
  const tasksQuery = useTasksQuery();
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();

  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = categoriesQuery.data ?? [];
  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasksQuery.data ?? []) {
      if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [tasksQuery.data]);
  const saving = createMutation.isPending || updateMutation.isPending;

  async function handleSave(fields: { name: string; color: string; icon?: string }) {
    if (!user) return;
    if (editing) {
      await updateMutation.mutateAsync({ categoryId: editing.id, request: fields });
    } else {
      await createMutation.mutateAsync(fields);
    }
    setEditing(null);
    setCreating(false);
  }

  async function handleDelete() {
    if (!editing) return;
    await deleteMutation.mutateAsync(editing.id);
    setEditing(null);
  }

  return (
    <ScreenContainer>
      <View style={{ padding: 24, paddingBottom: 8 }}>
        <Pressable onPress={() => navigation.goBack()}>
          <Body weight="semiBold" color={colors.primary}>
            ← Settings
          </Body>
        </Pressable>
        <ScreenTitle style={{ marginTop: 12 }}>Categories</ScreenTitle>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {categories.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => setEditing(cat)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: colors.bgCard,
              borderWidth: 1,
              borderColor: colors.borderCard,
              borderRadius: radii.control,
              padding: 14,
              minHeight: 48,
            }}
          >
            <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: cat.color ?? colors.textFaint }} />
            <Text weight="semiBold" style={{ flex: 1 }}>
              {cat.name}
            </Text>
            {cat.isDefault ? (
              <View style={{ backgroundColor: colors.neutralFill, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text size={fontSize.tiny} weight="bold" color={colors.textFaint} style={{ letterSpacing: 0.5 }}>
                  DEFAULT
                </Text>
              </View>
            ) : null}
            <Body size={fontSize.micro} color={colors.textFaint}>
              {taskCounts.get(cat.id) ?? 0} tasks
            </Body>
            <Text color={colors.textFaint}>✏️</Text>
          </Pressable>
        ))}
        <Button label="+ New category" variant="secondary" onPress={() => setCreating(true)} />
        <Body size={fontSize.micro} color={colors.textFaint} style={{ padding: 4 }}>
          Work, Personal &amp; Health are created with your account. Deleting a category moves its tasks to
          &ldquo;Uncategorized&rdquo; — tasks are never deleted with it.
        </Body>
      </ScrollView>

      <CategoryEditSheet
        visible={!!editing}
        category={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={editing && !editing.isDefault ? handleDelete : undefined}
        saving={saving}
      />
      <CategoryEditSheet visible={creating} onClose={() => setCreating(false)} onSave={handleSave} saving={saving} />
    </ScreenContainer>
  );
}
