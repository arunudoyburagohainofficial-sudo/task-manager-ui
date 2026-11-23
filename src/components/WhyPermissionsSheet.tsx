import { Platform, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { OnboardingAction } from "./onboarding";
import { px } from "../theme";
import { useThemedStyles, type Tokens } from "../state/ThemeContext";
import { EXACT_ALARMS_NEED_ASKING } from "../notifications/exactAlarms";

// Matches the steps on the permissions screen: Alarms & reminders only where Android has the switch.
const ROWS = [
  ...(EXACT_ALARMS_NEED_ASKING || Platform.OS === "web"
    ? [
        {
          title: "Alarms & reminders",
          body: "Lets your reminders ring at the exact minute you set. Without it, Android saves them up and they can arrive late.",
        },
      ]
    : []),
  {
    title: "Usage access",
    body: "Sees which apps you open and for how long, so Foyg can suggest what to pause.",
  },
  {
    title: "Do Not Disturb",
    body: "Lets Foyg silence your phone for the length of a session, and hand it back after.",
  },
  {
    title: "Display over other apps",
    body: "Shows Foyg’s pause screen on top of a paused app.",
  },
];

export function WhyPermissionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useThemedStyles(makeStyles);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.body}>
        <Text style={s.title}>Why these permissions?</Text>

        <View style={s.card}>
          {ROWS.map((row, i) => (
            <View key={row.title}>
              {i > 0 ? <View style={s.hairline} /> : null}
              <View style={s.row}>
                <Text style={s.rowTitle}>{row.title}</Text>
                <Text style={s.rowBody}>{row.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.reassure}>
          <Text style={s.shield}>🛡</Text>
          <Text style={s.reassureInk}>
            Foyg never reads your messages, photos or what’s on your screen. You can turn any of these off in Settings.
          </Text>
        </View>

        <OnboardingAction label="Got it" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    body: { gap: px(18) },
    title: { fontSize: px(22), fontWeight: "800", letterSpacing: -0.44, color: theme.color.text },
    card: {
      backgroundColor: theme.surface.card,
      borderWidth: 1,
      borderColor: theme.surface.cardBorder,
      borderRadius: px(16),
      overflow: "hidden",
    },
    hairline: { height: 1, backgroundColor: theme.surface.hairline },
    row: { paddingHorizontal: px(16), paddingVertical: px(15) },
    rowTitle: { fontSize: px(15), fontWeight: "800", color: theme.color.text },
    rowBody: { fontSize: px(13), fontWeight: "500", lineHeight: px(20), color: theme.color.textBody, marginTop: px(4) },

    reassure: { flexDirection: "row", alignItems: "flex-start", gap: px(9), paddingHorizontal: px(4) },
    shield: { fontSize: px(14), marginTop: px(1) },
    reassureInk: { flex: 1, fontSize: px(13), fontWeight: "600", lineHeight: px(20), color: theme.surface.bubbleInk },
  });
