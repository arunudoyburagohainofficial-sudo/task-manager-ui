import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { GoalDto } from "../api/types";
import { color, radius, space, text as t, type as T } from "../theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Body, H2, Meta } from "./Text";
import { TextField } from "./TextField";
import { Text } from "react-native";

const TARGET_PRESETS = [7, 20, 30, 60, 100];
const COLOR_PRESETS = ["#67924D", "#C86E35", "#4A8590", "#C58989", "#A68BCC", "#F0D447"];

/**
 * Also enforced by @Max on the server's Create/UpdateGoalRequest — this is the product
 * rule, not a UI convenience, so the API rejects a longer target regardless of client.
 */
const MAX_TARGET_DAYS = 100;

/**
 * What two lines of a goal tile can show at its narrowest — the 168pt cards in Home's
 * strip, which leave 125pt for the name at 15pt bold. Measured against the real font
 * rather than estimated: names up to this length wrap to two lines, and past it they run
 * to three. The server accepts 200 characters, but anything longer than this can only be
 * shown truncated, so it's better not to let it be typed.
 *
 * Word wrapping means this can't be an absolute guarantee — a short word followed by a
 * very long one still overflows — which is why the tile keeps its numberOfLines={2} and
 * its fixed height. This just makes truncation rare instead of routine.
 */
const MAX_NAME_LENGTH = 24;

interface GoalEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Present when editing an existing goal; absent when creating a new one. */
  goal?: GoalDto | null;
  onSave: (fields: { name: string; color: string; targetDays: number }) => void;
  onDelete?: () => void;
  saving?: boolean;
}

export function GoalEditSheet({ visible, onClose, goal, onSave, onDelete, saving = false }: GoalEditSheetProps) {
  const [name, setName] = useState("");
  const [swatch, setSwatch] = useState(COLOR_PRESETS[0]);
  const [targetDays, setTargetDays] = useState(20);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    if (visible) {
      const initialTarget = goal?.targetDays ?? 20;
      // A goal whose target isn't one of the presets reopens in custom mode showing that
      // number, rather than silently snapping to the nearest chip.
      const isPreset = TARGET_PRESETS.includes(initialTarget);
      setName(goal?.name ?? "");
      setSwatch(goal?.color ?? COLOR_PRESETS[0]);
      setTargetDays(initialTarget);
      setCustomMode(!isPreset);
      setCustomText(isPreset ? "" : String(initialTarget));
    }
  }, [visible, goal]);

  const parsedCustom = Number.parseInt(customText, 10);
  const effectiveTarget = customMode ? parsedCustom : targetDays;

  // Only reachable in custom mode — the preset chips can't produce an invalid target.
  const targetNotice =
    !customMode || customText === ""
      ? null
      : parsedCustom < 1
        ? "Pick at least 1 day."
        : parsedCustom > MAX_TARGET_DAYS
          ? `Goals cap at ${MAX_TARGET_DAYS} days. Shorter goals are far easier to keep going — and ${MAX_TARGET_DAYS} days of focused work is already a real achievement. Finish this one, then start the next.`
          : null;

  const targetIsValid = customMode ? customText !== "" && targetNotice === null : true;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <H2>{goal ? "Edit goal" : "New goal"}</H2>

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Interview Prep"
        maxLength={MAX_NAME_LENGTH}
      />

      <View style={styles.section}>
        <Meta>Target — days of focused work</Meta>
        <View style={styles.targetRow}>
          {TARGET_PRESETS.map((preset) => {
            const on = !customMode && preset === targetDays;
            return (
              <Pressable
                key={preset}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${preset} days`}
                onPress={() => {
                  setCustomMode(false);
                  setTargetDays(preset);
                }}
                style={[styles.targetChip, on && styles.targetChipOn]}
              >
                <Text style={t(T.label, { fontWeight: on ? "800" : "600", color: on ? color.selectedText : color.textBody })}>
                  {preset}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: customMode }}
            accessibilityLabel="Custom target"
            onPress={() => setCustomMode(true)}
            style={[styles.targetChip, styles.targetChipWide, customMode && styles.targetChipOn]}
          >
            <Text
              style={t(T.label, {
                fontWeight: customMode ? "800" : "600",
                color: customMode ? color.selectedText : color.textBody,
              })}
            >
              Custom
            </Text>
          </Pressable>
        </View>

        {customMode ? (
          <TextField
            value={customText}
            // Stripped to digits on the way in rather than validated on the way out: on web
            // there's no numeric keypad to constrain typing, and it keeps parseInt honest
            // (it would happily read "50abc" as 50).
            onChangeText={(value) => setCustomText(value.replace(/[^0-9]/g, ""))}
            placeholder={`Days (1–${MAX_TARGET_DAYS})`}
            keyboardType="number-pad"
          />
        ) : null}

        {targetNotice ? (
          <View style={styles.notice}>
            <Body style={{ color: color.amberText }}>{targetNotice}</Body>
          </View>
        ) : null}

        {/* >=, matching GoalService.refreshCompletionStatus — a target set to exactly the
            days already done completes the goal too, so it needs the same warning. */}
        {goal && targetIsValid && goal.totalDaysActive >= effectiveTarget ? (
          <Meta style={{ color: color.textFaint }}>
            You&rsquo;ve already done {goal.totalDaysActive} days — saving this marks the goal reached.
          </Meta>
        ) : null}
      </View>

      <View style={styles.section}>
        <Meta>Color</Meta>
        <View style={styles.swatchRow}>
          {COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              accessibilityRole="radio"
              accessibilityState={{ selected: swatch === preset }}
              accessibilityLabel={`Colour ${preset}`}
              onPress={() => setSwatch(preset)}
              style={[
                styles.swatch,
                { backgroundColor: preset },
                swatch === preset && { borderWidth: 3, borderColor: color.text },
              ]}
            />
          ))}
        </View>
      </View>

      <Button
        label="Save"
        disabled={!name.trim() || !targetIsValid}
        loading={saving}
        onPress={() => onSave({ name: name.trim(), color: swatch, targetDays: effectiveTarget })}
      />
      {onDelete ? <Button label="Delete goal" variant="destructive" onPress={onDelete} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  targetRow: {
    flexDirection: "row",
    gap: 7,
  },
  targetChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.border,
  },
  targetChipWide: {
    flex: 1.5,
  },
  targetChipOn: {
    borderWidth: 1.5,
    borderColor: color.interactive,
    backgroundColor: color.selectedTint,
  },
  notice: {
    backgroundColor: color.amberFill,
    borderRadius: radius.control,
    padding: 10,
  },
  swatchRow: {
    flexDirection: "row",
    gap: 12,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
