import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { CategoryDto } from "../api/types";
import { BottomSheet } from "./BottomSheet";
import { Body, Text } from "./Text";
import { Button } from "./Button";
import { TextField } from "./TextField";

const COLOR_PRESETS = ["#2D7D4C", "#D4A574", "#5B8DB8", "#E74C3C", "#8A6FB0", "#8A8A85"];

interface CategoryEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Present when editing an existing category; absent when creating a new one. */
  category?: CategoryDto | null;
  onSave: (fields: { name: string; color: string; icon?: string }) => void;
  onDelete?: () => void;
  saving?: boolean;
}

export function CategoryEditSheet({ visible, onClose, category, onSave, onDelete, saving = false }: CategoryEditSheetProps) {
  const { colors } = useAppearance();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);

  useEffect(() => {
    if (visible) {
      setName(category?.name ?? "");
      setColor(category?.color ?? COLOR_PRESETS[0]);
    }
  }, [visible, category]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text size={fontSize.xl} weight="bold">
        {category ? "Edit category" : "New category"}
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Errands" />
      <View style={{ gap: 8 }}>
        <Body size={fontSize.caption} weight="semiBold" color={colors.textMuted}>
          Color
        </Body>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => setColor(preset)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: preset,
                borderWidth: color === preset ? 3 : 0,
                borderColor: colors.textDark,
              }}
            />
          ))}
        </View>
      </View>
      <Button label="Save" large disabled={!name.trim()} loading={saving} onPress={() => onSave({ name: name.trim(), color })} />
      {onDelete ? (
        <Button label="Delete category" variant="destructive" onPress={onDelete} />
      ) : null}
    </BottomSheet>
  );
}
