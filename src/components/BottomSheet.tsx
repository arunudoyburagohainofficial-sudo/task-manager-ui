import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { color, space } from "../theme";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,26,.42)",
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: space.gutter,
    paddingBottom: 22,
    maxHeight: "90%",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  content: {
    gap: space.base,
  },
});

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Slides up from the bottom over a dimmed backdrop (design §7: 200–300ms ease-out). */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* A RN Modal is its own native window, so it doesn't inherit the screen's keyboard
          resize behaviour — it needs its own KeyboardAvoidingView or the keyboard covers
          whatever's focused. "height" on Android since native auto-resize doesn't reach
          into Modal content. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoiding}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
