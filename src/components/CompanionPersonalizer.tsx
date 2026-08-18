import React from "react";
import { Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { COMPANION_NAME_SUGGESTIONS, CompanionTone, useCompanion } from "../state/CompanionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { Body, Label } from "./Text";
import { TextField } from "./TextField";

const TONES: { value: CompanionTone; label: string }[] = [
  { value: "gentle", label: "Gentle" },
  { value: "hype", label: "Hype" },
  { value: "deadpan", label: "Deadpan" },
];

/**
 * Onboarding screen C1 ("name it, pick its tone") per COMPANION.md — reused in Settings
 * since both name and tone are "changeable anytime" there too.
 */
export function CompanionPersonalizer() {
  const { colors } = useAppearance();
  const { name, tone, setName, setTone } = useCompanion();

  return (
    <View style={{ gap: 10 }}>
      <TextField label="Companion name" value={name} onChangeText={setName} placeholder="Fern" />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {COMPANION_NAME_SUGGESTIONS.map((suggestion) => {
          const selected = name === suggestion;
          return (
            <Pressable
              key={suggestion}
              onPress={() => setName(suggestion)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: selected ? colors.primaryTintBg : colors.neutralFill,
              }}
            >
              <Body size={fontSize.caption} weight="semiBold" color={selected ? colors.primaryTintText : colors.neutralFillText}>
                {suggestion}
              </Body>
            </Pressable>
          );
        })}
      </View>

      <Label style={{ marginTop: 4 }}>Tone</Label>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TONES.map(({ value, label }) => {
          const selected = tone === value;
          return (
            <Pressable
              key={value}
              onPress={() => setTone(value)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: radii.control,
                alignItems: "center",
                backgroundColor: selected ? colors.primary : colors.neutralFill,
                borderWidth: selected ? 0 : 1,
                borderColor: colors.toggleOff,
              }}
            >
              <Body size={fontSize.caption} weight="semiBold" color={selected ? "#fff" : colors.neutralFillText}>
                {label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
