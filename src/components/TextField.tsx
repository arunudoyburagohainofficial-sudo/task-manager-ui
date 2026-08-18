import React, { useState } from "react";
import { TextInput, View, Pressable } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { fontSize } from "../theme/typography";
import { radii } from "../theme/spacing";
import { Label, Text } from "./Text";

/** Web-only style, cast past RN's TextStyle typing — see usage below for why. */
const webFocusRingReset = { outlineStyle: "none" };

interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  /** Shows a Show/Hide toggle for password fields — never echoes the password back otherwise. */
  isPassword?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  multiline?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  isPassword = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
}: TextFieldProps) {
  const { colors, fonts } = useAppearance();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(isPassword);

  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          minHeight: multiline ? 96 : 52,
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          backgroundColor: colors.bgCard,
          borderRadius: radii.control,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.primary : colors.toggleOff,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={isPassword ? hidden : secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? "top" : undefined}
          style={[
            {
              flex: 1,
              alignSelf: "stretch",
              width: "100%",
              fontFamily: fonts.regular,
              fontSize: fontSize.body,
              color: colors.textDark,
              paddingVertical: multiline ? 0 : undefined,
            },
            // Suppresses the browser's default "outline: auto" focus ring on web (Chromium
            // ignores outlineWidth:0 for that special keyword) — focus is already shown via
            // the wrapping View's border above. Cast needed: RN's own TextStyle type only
            // allows outlineStyle to be solid/dotted/dashed, not web's "none".
            webFocusRingReset as object,
          ]}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Text size={fontSize.caption} color={colors.textFaint}>
              {hidden ? "Show" : "Hide"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
