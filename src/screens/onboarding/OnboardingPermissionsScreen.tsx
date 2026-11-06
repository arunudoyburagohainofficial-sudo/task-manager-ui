import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Meta, ScreenContainer } from "../../components";
import { FerneSays, OnboardingHeader, OnboardingTextLink } from "../../components/onboarding";
import { WhyPermissionsSheet } from "../../components/WhyPermissionsSheet";
import { getPermissions, isShieldSupported, requestPermission, type ShieldPermission } from "../../../modules/focus-shield";
import { useOnboarding } from "../../state/OnboardingContext";
import { px, space } from "../../theme";
import { useTheme, useThemedStyles, type Tokens } from "../../state/ThemeContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingPermissions">;

interface Step {
  key: ShieldPermission;
  title: string;
  why: string;
  /** What to look for once Android's own settings screen opens. */
  hint: string;
}

const STEPS: Step[] = [
  {
    key: "usageStats",
    title: "Usage access",
    why: "Finds your distracting apps",
    hint: "Look for Permit usage access on FOYG’s page. Some phones put it under Special app access.",
  },
  {
    key: "notificationPolicy",
    title: "Do Not Disturb",
    why: "Silences your phone while you focus",
    hint: "Find FOYG in the list and allow it to change Do Not Disturb.",
  },
  {
    key: "overlay",
    title: "Display over other apps",
    why: "Shows the pause screen",
    hint: "Switch on Allow display over other apps for FOYG.",
  },
];

const SAYS: Record<ShieldPermission, string> = {
  usageStats: "find your distracting apps",
  notificationPolicy: "keep your phone quiet while you focus",
  overlay: "show the pause screen over an app",
};

export function OnboardingPermissionsScreen() {
  const navigation = useNavigation<Nav>();
  const s = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { finish } = useOnboarding();

  const [granted, setGranted] = useState(() => (isShieldSupported ? getPermissions() : null));
  const [whyOpen, setWhyOpen] = useState(false);
  /** The permission we last opened Android settings for, cleared once it is granted. */
  const [attempted, setAttempted] = useState<ShieldPermission | null>(null);
  const [refused, setRefused] = useState(false);

  const refresh = useCallback(() => {
    if (isShieldSupported) setGranted(getPermissions());
  }, []);

  // Granting happens on Android's own settings screen, so the only reliable moment to re-read
  // is when this app comes back to the front.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = isShieldSupported ? getPermissions() : null;
      setGranted(next);
      // Back from Android's settings with the switch still off. Saying so is the only way the
      // Skip route is reachable at all.
      if (attempted && next && !next[attempted]) setRefused(true);
      if (attempted && next?.[attempted]) setAttempted(null);
    });
    return () => sub.remove();
  }, [attempted]);

  const current = STEPS.find((step) => !granted?.[step.key]) ?? null;
  const currentIndex = current ? STEPS.indexOf(current) : STEPS.length - 1;
  const grantedFlags = STEPS.map((step) => Boolean(granted?.[step.key]));

  // iOS has no equivalent of these permissions, so there is nothing to ask for and the step is
  // skipped. Web is left alone deliberately: it is the preview loop and where the e2e suite runs,
  // and skipping made this screen impossible to see without a device build. Nothing is faked —
  // the permissions genuinely are ungranted there, so what renders is the real step-1 state.
  useEffect(() => {
    if (!isShieldSupported && Platform.OS !== "web") navigation.replace("OnboardingPickApps");
  }, [navigation]);

  async function allow(step: Step) {
    setRefused(false);
    setAttempted(step.key);
    try {
      await requestPermission(step.key);
    } catch {
      // The settings screen refused to open; refresh will keep the row as it was.
    }
    refresh();
  }

  function onNext() {
    if (!current) {
      navigation.navigate("OnboardingPickApps");
      return;
    }
    setRefused(true);
  }

  if (refused && current) {
    return (
      <ScreenContainer style={s.screen}>
        <OnboardingHeader onBack={() => navigation.goBack()} segments={grantedFlags} current={currentIndex} />

        <View style={s.refusedBody}>
          <FerneSays size={64}>
            <Text style={s.saysInk}>
              {current.title} is still off. Without it, I{" "}
              <Text style={s.saysAccent}>can’t {SAYS[current.key]}</Text>.
            </Text>
          </FerneSays>

          <View style={s.refusedCard}>
            <View style={s.rowCopy}>
              <Text style={s.rowTitle}>{current.title}</Text>
              <Meta style={s.refusedState}>Not allowed</Meta>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Try again, ${current.title}`}
              onPress={() => void allow(current)}
              style={s.allowPill}
            >
              <Text style={s.allowInk}>Try again</Text>
            </Pressable>
          </View>

          <Meta style={s.refusedHint}>{current.hint}</Meta>
        </View>

        <View style={s.refusedFooter}>
          <OnboardingTextLink
            label="Skip for now · app pausing stays off"
            onPress={() => navigation.navigate("OnboardingPickApps")}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={s.screen}>
      <OnboardingHeader onBack={() => navigation.goBack()} segments={grantedFlags} current={currentIndex} />

      <View style={s.body}>
        <FerneSays size={64}>
          <Text style={s.saysInk}>
            {grantedFlags.some(Boolean) ? "Next, to " : "To "}
            <Text style={s.saysAccent}>{current ? SAYS[current.key] : "start a session"}</Text>
            {current ? ", I need one more thing." : " - that’s everything."}
          </Text>
        </FerneSays>

        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardEyebrow}>{STEPS.length} QUICK STEPS</Text>
            <View style={s.timeBadge}>
              <Text style={s.timeBadgeInk}>About 1 min</Text>
            </View>
          </View>

          {STEPS.map((step, i) => {
            const isDone = Boolean(granted?.[step.key]);
            const isCurrent = current?.key === step.key;
            return (
              <View key={step.key}>
                <View style={s.hairline} />
                <View style={[s.row, isCurrent && { backgroundColor: theme.surface.chipSelBg }]}>
                  <View style={[s.bullet, isDone && s.bulletDone, isCurrent && s.bulletCurrent]}>
                    {isDone ? (
                      <Text style={s.bulletCheck}>✓</Text>
                    ) : (
                      <Text style={[s.bulletNumber, isCurrent && s.bulletNumberCurrent]}>{i + 1}</Text>
                    )}
                  </View>

                  <View style={s.rowCopy}>
                    <Text style={[s.rowTitle, !isDone && !isCurrent && s.rowTitleIdle]}>{step.title}</Text>
                    <Meta style={!isDone && !isCurrent ? s.rowWhyIdle : s.rowWhy}>{step.why}</Meta>
                  </View>

                  {isDone ? <Text style={s.onInk}>On</Text> : null}
                  {isCurrent ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Allow ${step.title}`}
                      onPress={() => void allow(step)}
                      style={s.allowPill}
                    >
                      <Text style={s.allowInk}>Allow</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={s.privacy}>
          <Text style={s.privacyGlyph}>🔒</Text>
          <Meta style={s.privacyInk}>Foyg sees how long apps are open, never what’s inside them.</Meta>
        </View>
      </View>

      <View style={s.footer}>
        {current ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Why these permissions?"
            onPress={() => setWhyOpen(true)}
            style={s.whyRow}
          >
            <Text style={s.whyGlyph}>?</Text>
            <Text style={s.whyInk}>Why these permissions?</Text>
            <Text style={s.whyChevron}>›</Text>
          </Pressable>
        ) : null}
        {current ? (
          <View style={s.skipRow}>
            <OnboardingTextLink
              label="Skip for now · app pausing stays off"
              onPress={() => navigation.navigate("OnboardingPickApps")}
            />
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={onNext} style={s.action}>
            <Text style={s.actionInk}>Continue</Text>
          </Pressable>
        )}
      </View>

      <WhyPermissionsSheet visible={whyOpen} onClose={() => setWhyOpen(false)} />
    </ScreenContainer>
  );
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    screen: { flex: 1 },
    body: { flex: 1, gap: px(20), paddingHorizontal: space.lg, paddingTop: px(44) },
    refusedBody: { flex: 1, justifyContent: "center", gap: px(18), paddingHorizontal: space.lg },

    saysInk: { fontSize: px(18), fontWeight: "600", lineHeight: px(26), letterSpacing: -0.18, color: theme.color.text },
    saysAccent: { color: theme.surface.primary, fontWeight: "800" },

    card: {
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      borderRadius: px(16),
      overflow: "hidden",
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: px(9), paddingHorizontal: px(16), paddingTop: px(13), paddingBottom: px(11) },
    cardEyebrow: { fontSize: px(11), fontWeight: "800", letterSpacing: 1.32, color: theme.color.textLabel },
    timeBadge: { backgroundColor: theme.color.amberFill, borderRadius: px(7), paddingHorizontal: px(8), paddingVertical: px(3) },
    timeBadgeInk: { fontSize: px(11), fontWeight: "800", color: theme.color.amberText },

    hairline: { height: 1, backgroundColor: theme.surface.hairline },
    row: { flexDirection: "row", alignItems: "center", gap: px(12), paddingHorizontal: px(16), paddingVertical: px(15) },

    bullet: { width: px(28), height: px(28), borderRadius: 99, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface.chipBg, flexShrink: 0 },
    bulletCurrent: { backgroundColor: theme.surface.primary },
    bulletDone: { backgroundColor: theme.color.successFill },
    bulletNumber: { fontSize: px(13), fontWeight: "800", color: theme.color.textFaint },
    bulletNumberCurrent: { color: theme.surface.primaryInk },
    bulletCheck: { fontSize: px(14), fontWeight: "800", color: theme.color.success },

    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: px(15), fontWeight: "800", color: theme.color.text },
    rowTitleIdle: { color: theme.color.textFaint },
    rowWhy: { fontSize: px(12.5), fontWeight: "500", color: theme.color.textBody, marginTop: px(2) },
    rowWhyIdle: { fontSize: px(12.5), fontWeight: "500", color: theme.color.textFaint, marginTop: px(2) },

    onInk: { fontSize: px(13), fontWeight: "800", color: theme.color.success },
    allowPill: { backgroundColor: theme.surface.action, borderRadius: px(12), paddingHorizontal: px(18), paddingVertical: px(11), flexShrink: 0 },
    allowInk: { fontSize: px(14), fontWeight: "800", color: theme.surface.actionInk },

    privacy: { flexDirection: "row", alignItems: "center", gap: px(8), paddingHorizontal: px(4) },
    privacyGlyph: { fontSize: px(13) },
    privacyInk: { flex: 1, fontSize: px(12.5), fontWeight: "600", lineHeight: px(18), color: theme.color.textMuted },

    footer: { paddingHorizontal: space.lg, paddingTop: px(12), paddingBottom: px(26), gap: px(14) },
    skipRow: { paddingTop: px(2) },
    whyRow: { flexDirection: "row", alignItems: "center", gap: px(12), backgroundColor: theme.surface.chipBg, borderRadius: px(14), padding: px(16) },
    whyGlyph: { fontSize: px(15), fontWeight: "800", color: theme.color.textMuted, width: px(18), textAlign: "center" },
    whyInk: { flex: 1, fontSize: px(14), fontWeight: "700", color: theme.color.textBody },
    whyChevron: { fontSize: px(17), fontWeight: "700", color: theme.color.textFaint },

    action: {
      backgroundColor: theme.surface.primary,
      borderRadius: px(14),
      paddingVertical: px(17),
      alignItems: "center",
    },
    actionInk: { fontSize: px(15), fontWeight: "800", color: theme.surface.primaryInk },

    refusedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: px(12),
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      borderRadius: px(16),
      paddingLeft: px(18),
      paddingRight: px(14),
      paddingVertical: px(14),
    },
    refusedState: { fontSize: px(12.5), fontWeight: "700", color: theme.color.danger, marginTop: px(3) },
    refusedHint: { fontSize: px(13), fontWeight: "600", lineHeight: px(20), color: theme.color.textMuted, paddingHorizontal: px(4) },
    refusedFooter: { paddingHorizontal: space.lg, paddingTop: px(12), paddingBottom: px(30) },
  });
