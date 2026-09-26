import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  CountPill,
  Ferne,
  GhostRow,
  GoalTargetIcon,
  InfoCircleIcon,
  PinnedBar,
  PrimaryAction,
  ScreenContainer,
  SecondaryAction,
  SectionLabel,
  TourInlineSlot,
} from "../components";
import { useCompanion } from "../state/CompanionContext";
import { TourTarget, useTour } from "../state/TourContext";
import { radius, space, textAtDesignSize as ds, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { listeningLine } from "../theme/companionCopy";
import type { CapturedTaskDraft, RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

let nextLocalId = 0;

/**
 * Capture — transcribed from the final screens 1a (empty) and 1b (one captured).
 *
 * Ferne gets room to breathe at the top and the field is the only lit object on the screen; once
 * something is captured the hero shrinks to a row to make space for the list. Both buttons moved
 * to a bar pinned at the bottom, so the primary can never be scrolled past, and disabled now
 * reads as disabled rather than as a dimmed terracotta.
 *
 * Every draft defaults to `focus`, freely changeable on the next screen (Organize).
 */
export function CaptureScreen() {
  const { name } = useCompanion();
  const { activeStep: tourStep, advance: advanceTour, back: tourBack, getActiveStep } = useTour();
  const tourRunning = tourStep !== null;
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);

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
      { localId: String(nextLocalId++), name: trimmed, taskType: "focus", goalId: null, scheduledFor: null, notifications: [], recurrenceRule: null },
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
            recurrenceRule: null,
            scheduledFor: null,
            notifications: [],
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
  const captured = drafts.length > 0;

  return (
    <ScreenContainer>
      {/*
        The whole screen is the walkthrough's region, not just the field: its step needs the
        field *and* the pinned bar's primary, and those are now siblings rather than one block.
        "region" keeps everything inside live without drawing a ring around the lot.
      */}
      <TourTarget step="describe" variant="region" style={styles.fill}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {captured ? (
              // Shrunk to a row: the list is what matters once there's something in it.
              <View style={styles.heroRow}>
                <Ferne size={62} state="listening" />
                <View style={styles.heroRowText}>
                  <Text style={ds(T.eyebrow, { letterSpacing: 0.7, color: theme.color.textLabel })}>
                    {listeningLine(name)}
                  </Text>
                  <Text style={ds(T.h1, { fontSize: 22, letterSpacing: -0.7, color: theme.color.text })}>
                    What&rsquo;s on your mind?
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.hero}>
                <Ferne size={96} state="listening" />
                <Text style={ds(T.eyebrow, { letterSpacing: 0.7, color: theme.color.textLabel })}>
                  {listeningLine(name)}
                </Text>
                <Text style={[ds(T.h1, { fontSize: 27, letterSpacing: -0.8, color: theme.color.text }), styles.centred]}>
                  What&rsquo;s on your mind?
                </Text>
              </View>
            )}

            {captured ? (
              <SectionLabel badge={<CountPill label={String(drafts.length)} />}>CAPTURED</SectionLabel>
            ) : null}

            {drafts.map((draft) => (
              <View key={draft.localId} style={styles.draftRow}>
                <View style={styles.draftMark}>
                  <GoalTargetIcon size={18} />
                </View>
                <Text style={[ds(T.bodyLg, { fontSize: 16, color: theme.color.text }), styles.draftName]}>
                  {draft.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${draft.name}`}
                  onPress={() => removeDraft(draft.localId)}
                  hitSlop={8}
                  style={styles.removeHit}
                >
                  <Text style={ds(T.meta, { fontWeight: "700", color: theme.surface.danger })}>Remove</Text>
                </Pressable>
              </View>
            ))}

            {/* The one lit object on the screen: a terracotta border and the design's soft outer
                glow. The mock also drew a 2px terracotta rule inside the field, standing in for a
                cursor that a static mock can't show — on a device the real caret does that, and
                the rule read as a stray mark whenever the field wasn't focused. */}
            <View style={[styles.field, focused && styles.fieldFocused]}>
              <TextInput
                accessibilityLabel="Task name"
                value={text}
                onChangeText={setText}
                placeholder="Type a task…"
                placeholderTextColor={theme.surface.fieldPlaceholder}
                multiline
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={[ds(T.bodyLg, { fontSize: 16, fontWeight: "500", color: theme.color.text }), styles.fieldInput]}
              />
            </View>

            {/* Disabled during the walkthrough: the tour asks for one task and then moves on, and
                stacking up several drafts here leads somewhere its next step can't describe. */}
            <GhostRow
              label="+ Add another"
              quiet={!captured}
              onPress={!text.trim() || tourRunning ? undefined : addDraft}
            />

            {/* The design pushes the hint to the foot of the page rather than letting it sit
                under the field with dead space below it. */}
            <View style={styles.spacer} />

            <View style={styles.hint}>
              <InfoCircleIcon size={14} color={theme.surface.infoStroke} />
              <Text style={ds(T.meta, { fontSize: 12, color: theme.color.textMuted })}>
                Type one, or a few — sorting happens next.
              </Text>
            </View>

            {/* Directly beneath the hint, in the page's own flow — the floating version would sit
                at the bottom of the window with dead space above it. */}
            <TourInlineSlot always />
          </ScrollView>

          <PinnedBar>
            {/* Disabled during the walkthrough for the same reason as "+ Add another": leaving
                here mid-step strands the tour on a screen the user is no longer on. */}
            {tourRunning ? null : <SecondaryAction label="Cancel" onPress={() => navigation.goBack()} />}
            <PrimaryAction
              label={`Confirm & Organize${total > 0 ? ` (${total})` : ""}`}
              disabled={total === 0}
              onPress={handleContinue}
              style={styles.confirm}
            />
          </PinnedBar>
        </KeyboardAvoidingView>
      </TourTarget>
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    fill: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 22,
      paddingTop: 6,
      paddingBottom: 20,
      gap: 12,
      flexGrow: 1,
    },
    hero: {
      alignItems: "center",
      gap: 10,
      paddingTop: 26,
      paddingBottom: 30,
    },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingTop: 12,
      paddingBottom: 22,
    },
    heroRowText: {
      flex: 1,
      gap: 4,
    },
    centred: {
      textAlign: "center",
    },
    draftRow: {
      backgroundColor: t.surface.card,
      borderWidth: 1,
      borderColor: t.surface.cardBorder,
      borderRadius: 12,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    draftMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.color.taskTypeFocusBg,
      alignItems: "center",
      justifyContent: "center",
    },
    draftName: {
      flex: 1,
      fontWeight: "700",
    },
    removeHit: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    field: {
      backgroundColor: t.surface.fieldBg,
      borderWidth: 1.5,
      borderColor: t.surface.fieldBorder,
      borderRadius: radius.panel,
      paddingVertical: 18,
      paddingHorizontal: 16,
      justifyContent: "center",
      boxShadow: [
        { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 5, color: t.surface.fieldGlow },
        { offsetX: 0, offsetY: 6, blurRadius: 18, spreadDistance: -12, color: t.surface.fieldDrop },
      ],
    },
    fieldFocused: {
      // The design draws one state; focus just deepens the glow it already has.
      boxShadow: [
        { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 6, color: t.surface.fieldGlow },
        { offsetX: 0, offsetY: 6, blurRadius: 18, spreadDistance: -10, color: t.surface.fieldDrop },
      ],
    },
    fieldInput: {
      flex: 1,
      // A multiline input needs a floor, or it collapses to one line's worth of nothing.
      minHeight: 22,
      padding: 0,
      ...({ outlineStyle: "none" } as object),
    },
    spacer: {
      flex: 1,
      minHeight: 8,
    },
    hint: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingTop: 14,
      paddingHorizontal: 4,
    },
    confirm: {
      flex: 1,
    },
  });
