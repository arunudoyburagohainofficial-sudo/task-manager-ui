import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Meta, ScreenContainer } from "../../components";
import { FerneSays, OnboardingAction } from "../../components/onboarding";
import { isShieldSupported, listInstalledApps, type InstalledApp } from "../../../modules/focus-shield";
import { usePreferences } from "../../state/PreferencesContext";
import { useOnboarding } from "../../state/OnboardingContext";
import { px, space } from "../../theme";
import { useThemedStyles, type Tokens } from "../../state/ThemeContext";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "OnboardingPickApps">;

/** Messaging apps stay on by default — being unreachable is a different promise from focusing. */
const KEEP_REACHABLE = /whats ?app|messages|messenger|telegram|signal|phone|dialer|contacts/i;

export function OnboardingPickAppsScreen() {
  const navigation = useNavigation<Nav>();
  const s = useThemedStyles(makeStyles);
  const { finish } = useOnboarding();
  const { setBlockedAppIds } = usePreferences();

  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isShieldSupported) {
      setApps([]);
      return;
    }
    let alive = true;
    listInstalledApps()
      .then((list) => {
        if (!alive) return;
        setApps(list);
        // Pre-select the obvious distractions, leave the ways people reach you alone.
        setChosen(new Set(list.filter((a) => !KEEP_REACHABLE.test(a.name)).slice(0, 3).map((a) => a.id)));
      })
      .catch(() => alive && setApps([]));
    return () => {
      alive = false;
    };
  }, []);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done() {
    setBlockedAppIds([...chosen]);
    finish();
  }

  const count = chosen.size;

  return (
    <ScreenContainer style={s.screen}>
      <View style={s.body}>
        <View>
          <Text style={s.heading}>Here’s where your time went</Text>
          <Meta style={s.sub}>Average per day, last 7 days.</Meta>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            {(apps ?? []).map((app, i) => {
              const on = chosen.has(app.id);
              return (
                <View key={app.id}>
                  {i > 0 ? <View style={s.hairline} /> : null}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={app.name}
                    onPress={() => toggle(app.id)}
                    style={s.row}
                  >
                    <View style={s.icon}>
                      {app.icon ? (
                        <Image source={{ uri: `data:image/png;base64,${app.icon}` }} style={s.iconImg} />
                      ) : (
                        <Text style={s.iconLetter}>{app.name.slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={s.rowCopy}>
                      <Text style={s.rowTitle}>{app.name}</Text>
                    </View>
                    <View style={[s.check, on && s.checkOn]}>{on ? <Text style={s.checkGlyph}>✓</Text> : null}</View>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {apps?.length === 0 ? (
            <Meta style={s.empty}>
              No apps to show yet. You can pick what to pause any time from Settings.
            </Meta>
          ) : null}
        </ScrollView>

        <FerneSays size={46} align="flex-start">
          <Text style={s.says}>I left your messaging apps on so the people who matter can still reach you.</Text>
        </FerneSays>
      </View>

      <View style={s.footer}>
        <OnboardingAction
          label={count > 0 ? `Pause ${count} app${count === 1 ? "" : "s"} during focus` : "Skip for now"}
          onPress={done}
        />
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    screen: { flex: 1 },
    body: { flex: 1, gap: px(18), paddingHorizontal: space.lg, paddingTop: px(26) },

    heading: { fontSize: px(27), fontWeight: "800", letterSpacing: -0.81, lineHeight: px(31), color: theme.color.text },
    sub: { fontSize: px(14), fontWeight: "500", color: theme.color.textBody, marginTop: px(7) },

    scroll: { flex: 1 },
    scrollInner: { gap: px(14) },

    card: {
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      borderRadius: px(16),
      overflow: "hidden",
    },
    hairline: { height: 1, backgroundColor: theme.surface.hairline },
    row: { flexDirection: "row", alignItems: "center", gap: px(12), paddingHorizontal: px(16), paddingVertical: px(12) },

    icon: {
      width: px(38),
      height: px(38),
      borderRadius: px(11),
      backgroundColor: theme.surface.chipBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden",
    },
    iconImg: { width: px(38), height: px(38) },
    iconLetter: { fontSize: px(15), fontWeight: "800", color: theme.color.textBody },

    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: px(15), fontWeight: "800", color: theme.color.text },

    check: {
      width: px(24),
      height: px(24),
      borderRadius: px(7),
      borderWidth: 1.5,
      borderColor: theme.surface.chipBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    checkOn: { backgroundColor: theme.surface.primary, borderColor: theme.surface.primary },
    checkGlyph: { fontSize: px(13), fontWeight: "800", color: theme.surface.primaryInk },

    empty: { fontSize: px(13), fontWeight: "600", lineHeight: px(20), color: theme.color.textMuted, paddingHorizontal: px(4) },

    says: { fontSize: px(14), fontWeight: "500", lineHeight: px(21), color: theme.surface.bubbleInk },

    footer: { paddingHorizontal: space.lg, paddingTop: px(12), paddingBottom: px(26) },
  });
