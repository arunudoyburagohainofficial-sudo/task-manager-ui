import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { space } from "../theme";
import { useThemedStyles, type Tokens } from "../state/ThemeContext";
import { Button } from "./Button";
import { H2, Meta } from "./Text";

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(26,26,26,.42)",
      alignItems: "center",
      justifyContent: "center",
    },
    card: {
      width: 302,
      maxWidth: "90%",
      backgroundColor: t.color.card,
      borderRadius: 16,
      padding: 22,
    },
    centered: {
      textAlign: "center",
    },
    message: {
      textAlign: "center",
      marginTop: 7,
      lineHeight: 20,
    },
    actions: {
      flexDirection: "row",
      gap: space.md,
      marginTop: 18,
    },
    action: {
      flex: 1,
    },
  });

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Renders the confirm action in the destructive style. */
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Keep going",
  onConfirm,
  onCancel,
  destructive = true,
  loading = false,
}: ConfirmModalProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <H2 style={styles.centered}>{title}</H2>
          <Meta style={styles.message}>{message}</Meta>
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} style={styles.action} />
            <Button
              label={confirmLabel}
              variant={destructive ? "destructive" : "primary"}
              loading={loading}
              onPress={onConfirm}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
