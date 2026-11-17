import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import { Ferne, ScreenContainer } from "../../components";
import { OnboardingAction, OnboardingTextLink } from "../../components/onboarding";
import { px, space } from "../../theme";
import { useThemedStyles, type Tokens } from "../../state/ThemeContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingWelcome">;

export function OnboardingWelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const s = useThemedStyles(makeStyles);

  return (
    <ScreenContainer style={s.screen}>
      <View style={s.centre}>
        <View>
          <View style={s.bubble}>
            <Text style={s.bubbleInk}>
              Hi, I’m Foyg. I’ll help you <Text style={[s.bubbleInk, s.accent]}>focus</Text> and keep your phone away.
            </Text>
          </View>
          {/* The tail is a rotated square poking out of the bubble's bottom edge. */}
          <View style={s.tail} />
        </View>

        <View style={s.ferne}>
          <Ferne size={px(150)} />
        </View>
      </View>

      <View style={s.footer}>
        <OnboardingAction label="Get started" onPress={() => navigation.navigate("Auth")} />
        <OnboardingTextLink label="I already have an account" onPress={() => navigation.navigate("Auth")} />
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    screen: { flex: 1 },
    centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: px(18), paddingHorizontal: px(26) },

    bubble: { backgroundColor: theme.surface.bubble, borderRadius: px(18), paddingHorizontal: px(20), paddingVertical: px(18) },
    bubbleInk: {
      fontSize: px(18),
      fontWeight: "600",
      lineHeight: px(26),
      letterSpacing: -0.18,
      color: theme.color.text,
      textAlign: "center",
    },
    accent: { color: theme.surface.primary, fontWeight: "800" },
    tail: {
      width: px(16),
      height: px(16),
      backgroundColor: theme.surface.bubble,
      borderRadius: px(3),
      transform: [{ rotate: "45deg" }],
      marginTop: px(-9),
      alignSelf: "center",
    },

    ferne: { width: px(150), height: px(150) },

    footer: { paddingHorizontal: space.lg, paddingTop: px(12), paddingBottom: px(26), gap: px(16) },
  });
