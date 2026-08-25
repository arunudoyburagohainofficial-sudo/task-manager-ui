import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Body, Button, Ferne, Meta, ScreenContainer, TextField, TourInlineSlot } from "../components";
import { useCompanion } from "../state/CompanionContext";
import { useTour } from "../state/TourContext";
import { color, radius, space } from "../theme";
import { listeningLine } from "../theme/companionCopy";
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

let nextLocalId = 0;

/**
 * Collects one or more task names by typing. Every draft defaults to `focus`, freely
 * changeable on the next screen (Organize).
 */
export function CaptureScreen() {
  const { name } = useCompanion();
  const { activeStep: tourStep } = useTour();
  const tourRunning = tourStep !== null;
  const navigation = useNavigation<Nav>();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<CapturedTaskDraft[]>([]);

  function addDraft() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDrafts((prev) => [
      ...prev,
      { localId: String(nextLocalId++), name: trimmed, taskType: "focus", goalId: null, reminder: null },
    ]);
    setText("");
  }

  function removeDraft(localId: string) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }

  function handleContinue() {
    const finalDrafts = text.trim()
      ? [
          ...drafts,
          {
            localId: String(nextLocalId++),
            name: text.trim(),
            taskType: "focus" as const,
            goalId: null,
            reminder: null,
          },
        ]
      : drafts;
    if (finalDrafts.length === 0) return;
    // navigate, not replace: keeps this screen on the stack underneath so Organize's back
    // button returns here with the drafts still exactly as they were.
    navigation.navigate("ConfirmOrganize", { drafts: finalDrafts });
  }

  const total = drafts.length + (text.trim() ? 1 : 0);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoiding}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Ferne size={72} />
            <Meta>{listeningLine(name)}</Meta>
            <Body style={styles.title}>What&rsquo;s on your mind?</Body>
          </View>

          {drafts.map((draft) => (
            <View key={draft.localId} style={styles.draftRow}>
              <Body style={styles.draftName}>{draft.name}</Body>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${draft.name}`}
                onPress={() => removeDraft(draft.localId)}
                hitSlop={8}
              >
                <Body style={{ color: color.danger, fontWeight: "700" }}>Remove</Body>
              </Pressable>
            </View>
          ))}

          <TextField value={text} onChangeText={setText} placeholder="Type a task…" multiline />

          {/* Disabled during the walkthrough: the tour asks for one task and then moves
              on, and stacking up several drafts here leads somewhere its next step can't
              describe. Fully available again the moment the tour ends. */}
          <Button
            label="+ Add another"
            variant="secondary"
            onPress={addDraft}
            disabled={!text.trim() || tourRunning}
          />

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={styles.cancel} />
            <Button
              label={`Confirm & Organize${total > 0 ? ` (${total})` : ""}`}
              onPress={handleContinue}
              disabled={total === 0}
              style={styles.confirm}
            />
          </View>

          {/* Directly beneath the buttons, in the page's own flow — the floating version
              would sit at the bottom of the window with dead space above it. */}
          <TourInlineSlot />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: 14,
    paddingBottom: 22,
    gap: space.md,
  },
  hero: {
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: color.text,
  },
  draftRow: {
    backgroundColor: color.fill,
    borderRadius: radius.control,
    paddingVertical: 14,
    paddingHorizontal: space.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  draftName: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: space.md,
  },
  cancel: {
    flex: 1,
  },
  confirm: {
    flex: 1.4,
  },
});
