import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { GoalDto } from "../api/types";
import { BottomSheet } from "./BottomSheet";
import { Body, Text } from "./Text";
import { Button } from "./Button";
import { TextField } from "./TextField";

const COLOR_PRESETS = ["#2D7D4C", "#D4A574", "#5B8DB8", "#E74C3C", "#8A6FB0", "#8A8A85"];
const TARGET_PRESETS = [7, 20, 30, 60, 100];

/**
 * Also enforced by @Max on the server's Create/UpdateGoalRequest — this is the product
 * rule, not a UI convenience, so the API rejects a longer target regardless of client.
 */
const MAX_TARGET_DAYS = 100;

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  swatchRow: {
    flexDirection: "row",
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  noticeBox: {
    borderRadius: radii.control,
    borderWidth: 1,
    padding: 10,
  },
});

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
  const { colors } = useAppearance();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
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
      setColor(goal?.color ?? COLOR_PRESETS[0]);
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
      <Text size={fontSize.xl} weight="bold">
        {goal ? "Edit goal" : "New goal"}
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Interview Prep" />

      <View style={styles.section}>
        <Body size={fontSize.caption} weight="semiBold" color={colors.textMuted}>
          Target — days of focused work
        </Body>
        <View style={styles.chipRow}>
          {TARGET_PRESETS.map((preset) => {
            const active = !customMode && preset === targetDays;
            return (
              <Pressable
                key={preset}
                onPress={() => {
                  setCustomMode(false);
                  setTargetDays(preset);
                }}
                style={[
                  styles.chip,
                  {
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.primary : colors.toggleOff,
                    backgroundColor: active ? colors.primaryTintBg : colors.bgCard,
                  },
                ]}
              >
                <Text size={fontSize.label} weight={active ? "bold" : "semiBold"} color={active ? colors.primaryTintText : colors.textMuted}>
                  {preset}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCustomMode(true)}
            style={[
              styles.chip,
              {
                borderWidth: customMode ? 2 : 1,
                borderColor: customMode ? colors.primary : colors.toggleOff,
                backgroundColor: customMode ? colors.primaryTintBg : colors.bgCard,
              },
            ]}
          >
            <Text
              size={fontSize.label}
              weight={customMode ? "bold" : "semiBold"}
              color={customMode ? colors.primaryTintText : colors.textMuted}
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
            onChangeText={(text) => setCustomText(text.replace(/[^0-9]/g, ""))}
            placeholder={`Days (1–${MAX_TARGET_DAYS})`}
            keyboardType="number-pad"
          />
        ) : null}

        {targetNotice ? (
          <View style={[styles.noticeBox, { backgroundColor: colors.warningTintBg, borderColor: colors.warningTintBorder }]}>
            <Body size={fontSize.caption} color={colors.warningTintText}>
              {targetNotice}
            </Body>
          </View>
        ) : null}

        {/* >=, matching GoalService.refreshCompletionStatus — a target set to exactly the
            days already done completes the goal too, so it needs the same warning. */}
        {goal && targetIsValid && goal.totalDaysActive >= effectiveTarget ? (
          <Body size={fontSize.micro} color={colors.textFaint}>
            You&rsquo;ve already done {goal.totalDaysActive} days — saving this marks the goal reached.
          </Body>
        ) : null}
      </View>

      <View style={styles.section}>
        <Body size={fontSize.caption} weight="semiBold" color={colors.textMuted}>
          Color
        </Body>
        <View style={styles.swatchRow}>
          {COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => setColor(preset)}
              style={[
                styles.swatch,
                {
                  backgroundColor: preset,
                  borderWidth: color === preset ? 3 : 0,
                  borderColor: colors.textDark,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <Button
        label="Save"
        large
        disabled={!name.trim() || !targetIsValid}
        loading={saving}
        onPress={() => onSave({ name: name.trim(), color, targetDays: effectiveTarget })}
      />
      {onDelete ? <Button label="Delete goal" variant="destructive" onPress={onDelete} /> : null}
    </BottomSheet>
  );
}
