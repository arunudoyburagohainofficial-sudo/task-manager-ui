import React from "react";
import { View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { categoryTintBg, categoryTintText } from "../utils/color";
import { Text } from "./Text";
import type { CategoryDto } from "../api/types";

interface CategoryTagProps {
  category: Pick<CategoryDto, "name" | "color"> | null;
}

/** Pill tag; falls back to the neutral "uncategorized" look when a task has no category. */
export function CategoryTag({ category }: CategoryTagProps) {
  const { colors } = useAppearance();
  if (!category) {
    return (
      <View style={{ backgroundColor: colors.neutralFill, borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 8 }}>
        <Text size={fontSize.micro} weight="semiBold" color={colors.neutralFillText}>
          Uncategorized
        </Text>
      </View>
    );
  }

  const hex = category.color ?? colors.textFaint;
  const bg = categoryTintBg(hex);
  const text = categoryTintText(hex);

  return (
    <View style={{ backgroundColor: bg, borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 8 }}>
      <Text size={fontSize.micro} weight="semiBold" color={text}>
        {category.name}
      </Text>
    </View>
  );
}
