import React from "react";
import { Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { CategoryDto } from "../api/types";
import { BottomSheet } from "./BottomSheet";
import { Text } from "./Text";

interface CategoryPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  categories: CategoryDto[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

/** Full list of the user's categories to choose from — tap a row to select, tap again to close. */
export function CategoryPickerSheet({
  visible,
  onClose,
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerSheetProps) {
  const { colors } = useAppearance();

  function handleSelect(categoryId: string | null) {
    onSelect(categoryId);
    onClose();
  }

  const rows: { id: string | null; name: string; color: string | null }[] = [
    { id: null, name: "Uncategorized", color: null },
    ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text size={fontSize.xl} weight="bold">
        Choose a category
      </Text>
      <View style={{ gap: 8 }}>
        {rows.map((row) => {
          const selected = row.id === selectedCategoryId;
          return (
            <Pressable
              key={row.id ?? "none"}
              onPress={() => handleSelect(row.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 48,
                paddingHorizontal: 14,
                borderRadius: radii.control,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : colors.borderCard,
                backgroundColor: selected ? colors.primaryTintBg : colors.bgCard,
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: row.color ?? colors.textFaint,
                }}
              />
              <Text weight="semiBold" style={{ flex: 1 }} color={selected ? colors.primaryTintText : colors.textDark}>
                {row.name}
              </Text>
              {selected ? (
                <Text weight="bold" color={colors.primaryTintText}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
