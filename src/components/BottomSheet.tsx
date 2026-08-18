import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Sheet slides up from the bottom, dim backdrop — used for Voice Capture, time pickers, etc. */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const { colors } = useAppearance();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(26,26,26,.45)" }} onPress={onClose}>
        {/* A RN Modal is its own native window, so it doesn't inherit the screen's keyboard
            resize behavior — needs its own KeyboardAvoidingView or the keyboard just covers
            whatever's focused (e.g. CategoryEditSheet's name field, Settings' profile/companion
            sheets). "height" on Android since native auto-resize doesn't reach into Modal content. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bgCard,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: 32,
              gap: 20,
            }}
          >
            <View
              style={{ width: 40, height: 4, borderRadius: radii.pill, backgroundColor: colors.toggleOff, alignSelf: "center" }}
            />
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
