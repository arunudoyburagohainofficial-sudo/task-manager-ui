import React, { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Body, Button, CompanionOrb, ScreenContainer, ScreenTitle, TextField } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { fontSize } from "../theme/typography";
import { radii } from "../theme/spacing";
import { listeningLine } from "../theme/companionCopy";
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

let nextLocalId = 0;

/**
 * Text-based stand-in for the mockup's voice-capture flow (screen 02) — see
 * memory/project_design_handoff.md: real speech-to-text + AI type inference are
 * deferred, so this collects one or more task names by typing instead, defaulting every
 * draft to `focus` (freely changeable on the next screen, Confirm & Organize).
 */
export function CaptureScreen() {
  const { colors } = useAppearance();
  const { name } = useCompanion();
  const navigation = useNavigation<Nav>();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<CapturedTaskDraft[]>([]);

  function addDraft() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDrafts((prev) => [
      ...prev,
      { localId: String(nextLocalId++), name: trimmed, taskType: "focus", categoryId: null, reminder: null },
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
          { localId: String(nextLocalId++), name: text.trim(), taskType: "focus" as const, categoryId: null, reminder: null },
        ]
      : drafts;
    if (finalDrafts.length === 0) return;
    navigation.replace("ConfirmOrganize", { drafts: finalDrafts });
  }

  const canContinue = drafts.length > 0 || text.trim().length > 0;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
      <View style={{ padding: 24, gap: 16 }}>
        <View style={{ width: 40, height: 4, borderRadius: radii.pill, backgroundColor: colors.toggleOff, alignSelf: "center" }} />
        <View style={{ alignItems: "center", gap: 8 }}>
          <CompanionOrb state="listening" size={64} />
          <Body size={fontSize.caption} color={colors.textMuted}>
            {listeningLine(name)}
          </Body>
        </View>
        <ScreenTitle style={{ textAlign: "center" }}>What&rsquo;s on your mind?</ScreenTitle>

        {drafts.length > 0 ? (
          <FlatList
            data={drafts}
            keyExtractor={(d) => d.localId}
            style={{ maxHeight: 160 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: colors.neutralFill,
                  borderRadius: radii.control,
                  padding: 12,
                }}
              >
                <Body style={{ flex: 1 }}>{item.name}</Body>
                <Pressable onPress={() => removeDraft(item.localId)} hitSlop={8}>
                  <Body color={colors.destructive}>Remove</Body>
                </Pressable>
              </View>
            )}
          />
        ) : null}

        <TextField
          value={text}
          onChangeText={setText}
          placeholder="Type a task…"
          multiline
        />

        <Button label="+ Add another" variant="secondary" onPress={addDraft} disabled={!text.trim()} />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button
            label={`Confirm & Organize${drafts.length + (text.trim() ? 1 : 0) > 0 ? ` (${drafts.length + (text.trim() ? 1 : 0)})` : ""}`}
            onPress={handleContinue}
            disabled={!canContinue}
            style={{ flex: 1.4 }}
          />
        </View>
      </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
