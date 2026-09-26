import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BackLink, Body, Card, H1, Meta, ScreenContainer } from "../components";
import { usePreferences } from "../state/PreferencesContext";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { radius, space, text as t, type as T } from "../theme";
import {
  getPermissions,
  isShieldSupported,
  listInstalledApps,
  requestPermission,
  type InstalledApp,
  type ShieldPermission,
  type ShieldPermissions,
} from "../../modules/focus-shield";

/**
 * Which apps a focus session blocks, and the permissions that make blocking possible.
 *
 * Android only — `isShieldSupported` is false in Expo Go, on web and on iOS, and this screen
 * says so rather than showing an empty list that looks broken. iOS can't be made to work like
 * this at all: Apple's picker returns opaque tokens with no names or icons, so that platform
 * needs a different screen entirely, not this one adapted. See MD/focus-shield-spec.md.
 *
 * The permissions are asked for one at a time, each with the reason attached. Android grants
 * all three through its own Settings pages rather than a prompt, so every request is a trip out
 * of the app and back — three of those stacked up front would lose most people before they ever
 * saw the list.
 */
export function BlockedAppsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const { blockedAppIds, setBlockedAppIds } = usePreferences();

  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [permissions, setPermissions] = useState<ShieldPermissions>(() => getPermissions());

  const refreshPermissions = useCallback(() => setPermissions(getPermissions()), []);

  useEffect(() => {
    if (!isShieldSupported) {
      setApps([]);
      return;
    }
    listInstalledApps().then(setApps).catch(() => setApps([]));
  }, []);

  /*
   * Every grant happens in Android's Settings, which means the app is in the background at the
   * exact moment the answer changes. Without re-reading on foreground this screen would keep
   * insisting a permission was missing straight after the user had granted it.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissions();
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  function toggle(id: string) {
    setBlockedAppIds(
      blockedAppIds.includes(id) ? blockedAppIds.filter((a) => a !== id) : [...blockedAppIds, id]
    );
  }

  const needsAppPermissions =
    blockedAppIds.length > 0 && (!permissions.usageStats || !permissions.overlay);

  const permissionRow = (
    key: ShieldPermission,
    title: string,
    why: string,
    granted: boolean
  ) => (
    <Card key={key} style={styles.permissionCard}>
      <View style={styles.permissionText}>
        <Body style={{ fontWeight: "700" }}>{title}</Body>
        <Meta style={{ color: theme.color.textFaint, marginTop: 2 }}>{why}</Meta>
      </View>
      {granted ? (
        <Meta style={{ color: theme.color.success, fontWeight: "800" }}>On</Meta>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Allow ${title}`}
          style={styles.allowButton}
          onPress={() => void requestPermission(key)}
        >
          <Text style={t(T.body, { fontWeight: "800", color: theme.color.onInteractive })}>Allow</Text>
        </Pressable>
      )}
    </Card>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <BackLink onPress={() => navigation.goBack()} />
        <H1>Blocked apps</H1>

        {!isShieldSupported ? (
          <Card style={styles.emptyCard}>
            <Body style={{ fontWeight: "700" }}>Not available in this build</Body>
            <Meta style={{ color: theme.color.textFaint }}>
              Blocking apps needs the installed app, on Android. It does nothing here — your
              choices are saved and will apply on a phone.
            </Meta>
          </Card>
        ) : (
          <>
            <Meta style={{ color: theme.color.textFaint }}>
              Chosen apps are covered by a full-screen reminder while a focus session runs, and
              open normally again the moment it ends.
            </Meta>

            {permissionRow(
              "notificationPolicy",
              "Silence notifications",
              "Puts the phone on Do Not Disturb for the session, then puts your own setting back.",
              permissions.notificationPolicy
            )}

            {/*
              Only asked for once there's something to block. Someone who only wants quiet
              notifications should never be sent to two extra Settings pages for a capability
              they aren't using.
            */}
            {blockedAppIds.length > 0 ? (
              <>
                {permissionRow(
                  "usageStats",
                  "See which app is open",
                  "The only way Android lets an app notice you've opened something else.",
                  permissions.usageStats
                )}
                {permissionRow(
                  "overlay",
                  "Draw over other apps",
                  "Shows the reminder on top of a blocked app.",
                  permissions.overlay
                )}
              </>
            ) : null}

            {needsAppPermissions ? (
              <Card style={styles.warnCard}>
                <Meta style={{ color: theme.color.danger, fontWeight: "700" }}>
                  Until both are allowed, sessions will still silence notifications but won't
                  block these apps.
                </Meta>
              </Card>
            ) : null}

            <Text style={t(T.eyebrow, { color: theme.color.textMuted, marginTop: space.sm })}>
              {blockedAppIds.length > 0 ? `${blockedAppIds.length} SELECTED` : "CHOOSE APPS"}
            </Text>

            {apps == null ? (
              <ActivityIndicator style={{ marginTop: space.lg }} color={theme.color.textFaint} />
            ) : (
              apps.map((app) => {
                const on = blockedAppIds.includes(app.id);
                return (
                  <Pressable
                    key={app.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={app.name}
                    onPress={() => toggle(app.id)}
                    style={[styles.appRow, on && styles.appRowOn]}
                  >
                    {app.icon ? (
                      <Image
                        source={{ uri: `data:image/png;base64,${app.icon}` }}
                        style={styles.appIcon}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={styles.appIcon} />
                    )}
                    <Body style={{ flex: 1, fontWeight: on ? "700" : "500" }} numberOfLines={1}>
                      {app.name}
                    </Body>
                    <Meta style={{ color: on ? theme.color.danger : theme.color.textFaint, fontWeight: "800" }}>
                      {on ? "Blocked" : "Allow"}
                    </Meta>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: { padding: space.gutter, gap: space.md, paddingBottom: space.lg },
    emptyCard: { gap: space.sm },
    warnCard: { borderColor: t.color.dangerBorder, borderWidth: 1, backgroundColor: t.color.dangerFill },
    permissionCard: { flexDirection: "row", alignItems: "center", gap: space.md },
    permissionText: { flex: 1 },
    allowButton: {
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      backgroundColor: t.color.interactive,
    },
    appRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    appRowOn: { borderColor: t.color.dangerBorder, backgroundColor: t.color.dangerFill },
    appIcon: { width: 32, height: 32, borderRadius: 8 },
  });
