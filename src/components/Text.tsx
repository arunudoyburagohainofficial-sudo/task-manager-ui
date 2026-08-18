import React from "react";
import { Text as RNText, TextProps } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { fontSize } from "../theme/typography";

type Weight = "regular" | "medium" | "semiBold" | "bold" | "extraBold";

interface ThemedTextProps extends TextProps {
  size?: number;
  weight?: Weight;
  color?: string;
}

/** Base themed Text — resolves font family from the dyslexia-font accessibility setting. */
export function Text({ style, size = fontSize.body, weight = "regular", color, ...rest }: ThemedTextProps) {
  const { fonts, colors } = useAppearance();
  return (
    <RNText
      style={[{ fontFamily: fonts[weight], fontSize: size, color: color ?? colors.textDark }, style]}
      {...rest}
    />
  );
}

export function ScreenTitle(props: ThemedTextProps) {
  return <Text size={fontSize.screenTitle} weight="bold" {...props} />;
}

export function HeroGreeting(props: ThemedTextProps) {
  return <Text size={fontSize.heroGreeting} weight="bold" {...props} />;
}

export function TaskDetailTitle(props: ThemedTextProps) {
  return <Text size={fontSize.taskDetailTitle} weight="bold" {...props} />;
}

export function Body(props: ThemedTextProps) {
  return <Text size={fontSize.body} weight="regular" {...props} />;
}

export function Label(props: ThemedTextProps) {
  const { colors } = useAppearance();
  return <Text size={fontSize.label} weight="semiBold" color={colors.textMuted} {...props} />;
}

export function Caption(props: ThemedTextProps) {
  const { colors } = useAppearance();
  return <Text size={fontSize.micro} weight="regular" color={colors.textFaint} {...props} />;
}

/** Section label inside a card: 12-13px, bold, uppercase, letter-spacing .08em, faint. */
export function SectionLabel(props: ThemedTextProps) {
  const { colors } = useAppearance();
  return (
    <Text
      size={fontSize.caption}
      weight="bold"
      color={colors.textFaint}
      style={{ textTransform: "uppercase", letterSpacing: 1 }}
      {...props}
    />
  );
}
