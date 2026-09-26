import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { radius, size, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { Meta } from "./Text";

/** Web-only style, cast past RN's TextStyle typing — see usage below for why. */
const webFocusRingReset = { outlineStyle: "none" };

interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  multiline?: boolean;
  /** Caps input at the source, so a value can't be typed that the UI can only truncate. */
  maxLength?: number;
  /** What a screen reader calls the field when there's no visible label — "Task name". */
  accessibilityLabel?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  maxLength,
  accessibilityLabel,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrapper}>
      {label ? <Meta>{label}</Meta> : null}
      <TextInput
        // The visible label is separate text, so it has to be attached here too — without this a
        // screen reader announced every field as just "text field".
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.surface.fieldPlaceholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textAlignVertical={multiline ? "top" : undefined}
        style={[
          t(T.bodyLg, { color: theme.color.text }),
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: theme.surface.card,
            borderWidth: focused ? 1.5 : 1,
            borderColor: focused ? theme.surface.fieldBorder : theme.surface.cardBorder,
          },
          // Suppresses the browser's default "outline: auto" focus ring on web (Chromium
          // ignores outlineWidth: 0 for that keyword) — focus is already shown by the
          // border above. Cast needed: RN's TextStyle only allows solid/dotted/dashed.
          webFocusRingReset as object,
        ]}
      />
    </View>
  );
}

const makeStyles = (_t: Tokens) =>
  StyleSheet.create({
    wrapper: {
      gap: 6,
    },
    input: {
      borderRadius: radius.control,
      paddingVertical: 11,
      paddingHorizontal: 14,
      // Matches size.button — a single-line field and a button are the same kind of control
      // and read oddly at different heights sitting in the same form.
      minHeight: size.button,
    },
    inputMultiline: {
      minHeight: 60,
      paddingTop: 12,
    },
  });
