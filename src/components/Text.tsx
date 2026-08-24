import React from "react";
import { Text as RNText, TextProps, TextStyle } from "react-native";
import { color, text as t, type as T } from "../theme";

interface ThemedTextProps extends TextProps {
  color?: string;
  style?: TextStyle | TextStyle[];
}

/**
 * One component per type token from the design scale, rather than a single Text with
 * size/weight props. The design defines a closed set of roles (h1, body, meta, eyebrow…)
 * and every one of them pins its own size, weight and letter-spacing — exposing those as
 * free parameters is how a design system drifts. `color` stays overridable because the
 * palette legitimately varies by context (muted, faint, success, danger).
 */
function make(token: Parameters<typeof t>[0], defaultColor: string) {
  return function Themed({ color: c, style, ...rest }: ThemedTextProps) {
    return <RNText style={[t(token, { color: c ?? defaultColor }) as TextStyle, style]} {...rest} />;
  };
}

/** 26/800 — screen titles. */
export const H1 = make(T.h1, color.text);
/** 22/800 — stat values, sheet titles. */
export const H2 = make(T.h2, color.text);
/** 16/700 — task titles, emphasised rows. */
export const BodyLg = make(T.bodyLg, color.text);
/** 15/600 — default body copy. */
export const Body = make(T.body, color.textBody);
/** 14/800 — dense emphasis inside cards and badges. */
export const Label = make(T.label, color.text);
/** 13/600 — captions, secondary detail. */
export const Meta = make(T.meta, color.textMuted);
/** 11/800 uppercase — section eyebrows. */
export const Eyebrow = make(T.eyebrow, color.textLabel);
/** 72/800 — the focus-session timer only. */
export const Timer = make(T.timer, color.text);
