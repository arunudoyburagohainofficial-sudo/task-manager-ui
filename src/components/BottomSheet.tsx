import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      // Dims what's behind rather than replacing it — the mock paints a flat sand ground only
      // because it has no app underneath to dim.
      backgroundColor: t.isDark ? "rgba(0,0,0,.6)" : "rgba(26,26,26,.42)",
    },
    keyboardAvoiding: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: t.surface.sheetSurface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingTop: 12,
      paddingHorizontal: space.gutter,
      maxHeight: "90%",
    },
    handle: {
      width: 42,
      height: 5,
      borderRadius: 99,
      backgroundColor: t.surface.sheetHandle,
      alignSelf: "center",
      marginBottom: 14,
    },
    content: {
      gap: space.base,
    },
    /** With a pinned footer the sheet drops its own side padding so the footer's rule spans
        edge to edge; the scroll area takes that padding back on itself. */
    contentWithFooter: {
      paddingHorizontal: space.gutter,
      paddingBottom: 14,
    },
    sheetWithFooter: {
      paddingHorizontal: 0,
      paddingBottom: 0,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: t.color.border,
      paddingTop: 11,
      paddingHorizontal: space.gutter,
      flexDirection: "row",
      alignItems: "center",
      gap: space.base,
    },
  });

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * The sheet's own surface. Defaults to `card` (white), which is right when the content is
   * plain rows. A sheet built out of white cards needs the cream ground behind them instead,
   * or the cards are invisible against the sheet — see ScheduleSheet.
   */
  background?: string;
  /**
   * Pinned below the scroll area rather than scrolling with it, for sheets whose primary
   * action must stay reachable however long the content grows. Left out entirely by every
   * sheet whose actions are short enough to scroll to.
   */
  footer?: React.ReactNode;
}

/** Slides up from the bottom over a dimmed backdrop (design §7: 200–300ms ease-out). */
export function BottomSheet({
  visible,
  onClose,
  children,
  background,
  footer,
}: BottomSheetProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const surface = background ?? theme.color.card;

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
        {/* The Modal's own content sits outside the screen's SafeAreaProvider tree (it's a
            separate native window), so insets.bottom isn't inherited here — without adding
            it explicitly, the card's fixed padding stops short of the home-indicator zone
            on devices that have one, leaving a sliver where the real (undimmed) screen
            behind shows through instead of the sheet's own background. */}
        <View
          style={[
            styles.sheet,
            { backgroundColor: surface },
            // A pinned footer carries the bottom inset itself, so the scroll area can run all
            // the way down to it instead of stopping short above a gap.
            footer ? styles.sheetWithFooter : { paddingBottom: 22 + insets.bottom },
          ]}
        >
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
