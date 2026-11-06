import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";
import { Meta, ScreenContainer } from "../../components";
import { FerneSays, OnboardingAction, OnboardingHeader } from "../../components/onboarding";
import { useOnboarding } from "../../state/OnboardingContext";
import { px, space } from "../../theme";
import { useThemedStyles, type Tokens } from "../../state/ThemeContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingScreenTime">;

const MIN_HOURS = 1;
const MAX_HOURS = 10;

export function OnboardingScreenTimeScreen() {
  const navigation = useNavigation<Nav>();
  const s = useThemedStyles(makeStyles);
  const { screenTimeHours, setScreenTimeHours } = useOnboarding();

  const [hours, setHours] = useState(screenTimeHours ?? 5);
  const [trackWidth, setTrackWidth] = useState(0);

  const daysAYear = Math.round((hours * 365) / 24);
  const hoursBackAYear = Math.round(365 / 24);

  const fraction = (hours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS);

  // A plain PanResponder rather than a slider dependency: this is the only slider in the app and
  // the design wants the value to follow the finger continuously, snapped to whole hours.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setHours(hoursAt(e.nativeEvent.locationX, trackWidth)),
        onPanResponderMove: (e, g) => setHours(hoursAt(g.moveX - g.x0 + e.nativeEvent.locationX, trackWidth)),
      }),
    [trackWidth]
  );

  function onTrackLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  return (
    <ScreenContainer style={s.screen}>
      <OnboardingHeader onBack={() => navigation.goBack()} progress={0.33} />

      <View style={s.body}>
        <Text style={s.heading}>How long are you on your phone each day?</Text>

        <View style={s.readout}>
          <View style={s.readoutRow}>
            <Text style={s.readoutNumber}>{hours}</Text>
            <Text style={s.readoutUnit}>{hours === 1 ? "hour" : "hours"}</Text>
          </View>
          <Meta style={s.readoutCaption}>on a typical day</Meta>
        </View>

        <View style={s.sliderBlock}>
          <View style={s.sliderRow} onLayout={onTrackLayout} {...pan.panHandlers}>
            <View style={s.sliderTrack} />
            <View style={[s.sliderFill, { width: `${fraction * 100}%` }]} />
            <View
              accessibilityRole="adjustable"
              accessibilityLabel={`Screen time, ${hours} hours a day`}
              accessibilityValue={{ min: MIN_HOURS, max: MAX_HOURS, now: hours }}
              style={[s.sliderThumb, { left: `${fraction * 100}%` }]}
            />
          </View>
          <View style={s.sliderEnds}>
            <Meta style={s.sliderEnd}>1 h</Meta>
            <Meta style={s.sliderEnd}>10 h+</Meta>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardNumber}>{daysAYear}</Text>
          <View style={s.cardCopy}>
            <Text style={s.cardTitle}>days a year on your phone</Text>
            <Meta style={s.cardSub}>
              {hours} h × 365 days
            </Meta>
          </View>
        </View>

        <FerneSays size={46} align="flex-start">
          <Text style={s.says}>
            Win back just one hour a day and that’s <Text style={s.saysStrong}>{hoursBackAYear} days a year</Text> for
            what you care about.
          </Text>
        </FerneSays>
      </View>

      <View style={s.footer}>
        <Meta style={s.footnote}>Not sure? Foyg measures it once usage access is on.</Meta>
        <OnboardingAction
          label="Continue"
          onPress={() => {
            setScreenTimeHours(hours);
            navigation.navigate("OnboardingPermissions");
          }}
        />
      </View>
    </ScreenContainer>
  );
}

function hoursAt(x: number, width: number): number {
  if (width <= 0) return 5;
  const clamped = Math.max(0, Math.min(width, x));
  return Math.round(MIN_HOURS + (clamped / width) * (MAX_HOURS - MIN_HOURS));
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    screen: { flex: 1 },
    body: { flex: 1, gap: px(18), paddingHorizontal: space.lg, paddingTop: px(24) },

    heading: { fontSize: px(27), fontWeight: "800", letterSpacing: -0.81, lineHeight: px(31), color: theme.color.text },

    readout: { alignItems: "center", paddingTop: px(6) },
    readoutRow: { flexDirection: "row", alignItems: "baseline", gap: px(6) },
    readoutNumber: { fontSize: px(60), fontWeight: "800", letterSpacing: -3, lineHeight: px(60), color: theme.color.text },
    readoutUnit: { fontSize: px(24), fontWeight: "800", color: theme.color.textBody },
    readoutCaption: { fontSize: px(13), fontWeight: "600", color: theme.color.textMuted, marginTop: px(8) },

    sliderBlock: { paddingHorizontal: px(4) },
    sliderRow: { height: px(28), justifyContent: "center" },
    sliderTrack: { position: "absolute", left: 0, right: 0, height: px(8), borderRadius: 99, backgroundColor: theme.surface.segTrack },
    sliderFill: { position: "absolute", left: 0, height: px(8), borderRadius: 99, backgroundColor: theme.surface.primary },
    sliderThumb: {
      position: "absolute",
      width: px(28),
      height: px(28),
      marginLeft: px(-14),
      borderRadius: 99,
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      shadowColor: theme.surface.cardShadow,
      shadowOpacity: 1,
      shadowRadius: px(12),
      shadowOffset: { width: 0, height: px(4) },
      elevation: 3,
    },
    sliderEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: px(8) },
    sliderEnd: { fontSize: px(12), fontWeight: "700", color: theme.color.textMuted },

    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: px(14),
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      borderRadius: px(16),
      padding: px(16),
    },
    cardNumber: { fontSize: px(48), fontWeight: "800", letterSpacing: -2.4, lineHeight: px(48), color: theme.surface.primary },
    cardCopy: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: px(16), fontWeight: "800", color: theme.color.text },
    cardSub: { fontSize: px(12.5), fontWeight: "600", color: theme.color.textMuted, marginTop: px(3) },

    says: { fontSize: px(14), fontWeight: "500", lineHeight: px(21), color: theme.surface.bubbleInk },
    saysStrong: { fontWeight: "800", color: theme.color.text },

    footer: { paddingHorizontal: space.lg, paddingTop: px(12), paddingBottom: px(26), gap: px(14) },
    footnote: { textAlign: "center", fontSize: px(12.5), fontWeight: "600", color: theme.color.textMuted },
  });
