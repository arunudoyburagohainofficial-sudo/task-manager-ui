import React from "react";
import { Modal, Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii, spacing } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { Button } from "./Button";
import { Body, Text } from "./Text";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Per the design handoff's S3 confirmation modals, the confirm button's style depends
   * on the action, not just "is this destructive": deleting a task uses a solid red fill,
   * while ending a session early uses the outlined red style. Default to the solid style
   * since most confirm-modal actions are irreversible deletes.
   */
  confirmVariant?: "destructiveSolid" | "destructive" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered confirmation card, fade+scale — used for delete-task / end-session-early, etc. */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "destructiveSolid",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors } = useAppearance();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(26,26,26,.45)", justifyContent: "center" }} onPress={onCancel}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            marginHorizontal: 24,
            backgroundColor: colors.bgCard,
            borderRadius: radii.modal,
            padding: spacing.md,
            gap: 14,
            alignItems: "center",
          }}
        >
          <Text size={fontSize.lg} weight="bold" style={{ textAlign: "center" }}>
            {title}
          </Text>
          <Body color={colors.textMuted} style={{ textAlign: "center" }}>
            {message}
          </Body>
          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
