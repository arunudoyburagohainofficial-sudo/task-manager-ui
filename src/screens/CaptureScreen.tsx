import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Body, Button, Ferne, Meta, ScreenContainer, TextField, TourInlineSlot } from "../components";
import { useCompanion } from "../state/CompanionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { color, radius, space, text as t, type as T } from "../theme";
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
  const { activeStep: tourStep, advance: advanceTour, back: tourBack, getActiveStep } = useTour();
  const tourRunning = tourStep !== null;
  const navigation = useNavigation<Nav>();

  /**
   * If this screen goes away while its own step is still showing — Android's hardware
   * back, an iOS swipe, anything that isn't Confirm & Organize — walk the tour back with
   * it. Otherwise step 3 stays active on Home, pointing at a control that isn't there.
   * navigate: false because the screen is already leaving; popping again would overshoot.
   *
   * getActiveStep() rather than a captured value: the card's own "← Back" already steps
   * the tour before popping this screen, and a stale read here would step it a second time
   * — landing the user two steps back. Moving forward advances first for the same reason,
   * so on both deliberate paths this correctly does nothing.
   */
  useEffect(
    () => () => {
      if (getActiveStep() === "describe") tourBack({ navigate: false });
    },
    [getActiveStep, tourBack]
  );
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
    // Naming the task is what completes this step — the next one lives on Organize.
    advanceTour("describe");
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
            <Ferne size={72} state="listening" />
            <Meta>{listeningLine(name)}</Meta>
            {/* Routed through t() rather than the Body wrapper + a raw style override —
                the previous version set fontSize directly on `style`, which wins over
                Body's own t()-derived size and so never shrank with TYPE_SCALE. */}
            <Text style={t(T.h2, { letterSpacing: -0.4, color: color.text })}>What&rsquo;s on your mind?</Text>
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

          {/* One region for everything the walkthrough needs live here: the field to type
              in, the buttons to move on with, and its own guidance card. Marked "region"
              rather than "control" so it's kept bright and tappable without a ring drawn
              round the whole block. Dimming this screen without it would lock the user out
              of the very actions the step is asking for. */}
          <TourTarget step="describe" variant="region" style={styles.captureBlock}>
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
              {/* Disabled during the walkthrough for the same reason as "+ Add another":
                  leaving here mid-step strands the tour on a screen the user is no longer
                  on. "← Back" in the guidance card is the way out — it steps the tour and
                  the screen together. */}
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => navigation.goBack()}
                disabled={tourRunning}
                style={styles.cancel}
              />
              <Button
                label={`Confirm & Organize${total > 0 ? ` (${total})` : ""}`}
                onPress={handleContinue}
                disabled={total === 0}
                style={styles.confirm}
              />
            </View>

            {/* Directly beneath the buttons, in the page's own flow — the floating version
                would sit at the bottom of the window with dead space above it. */}
            <TourInlineSlot always />
          </TourTarget>
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
  // Reproduces the gap the ScrollView's contentContainer used to provide between these
  // children, now that they sit inside a wrapper rather than directly in it.
  captureBlock: {
    gap: space.md,
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
