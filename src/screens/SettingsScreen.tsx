import React, { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { usersApi } from "../api";
import { ApiError } from "../api/client";
import { BottomSheet, Body, Button, Card, CompanionPersonalizer, ConfirmModal, ScreenContainer, ScreenTitle, SectionLabel, Text, TextField, Toggle } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { useCompanion } from "../state/CompanionContext";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { formatMinutes } from "../utils/format";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];

function SettingsRow({ label, right, onPress }: { label: React.ReactNode; right: React.ReactNode; onPress?: () => void }) {
  const { colors } = useAppearance();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 48,
        flexDirection: "row",
        // justifyContent: "space-between" alone doesn't stop either side overflowing the
        // row — it only ever gave in-bounds children breathing room between them. Neither
        // side had a flex/shrink constraint, so a long email or a long label+badge just
        // ran past the row's edge instead of wrapping. flexShrink on the label lets it
        // wrap onto a second line (minHeight, not a fixed height, so the row grows to fit);
        // flexShrink: 0 + a fixed gap keeps the value side from being crushed by that.
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        {typeof label === "string" ? <Text size={fontSize.bodySm}>{label}</Text> : label}
      </View>
      <View style={{ flexShrink: 0 }}>{right}</View>
    </Wrapper>
  );
}

/** Small tinted pill for rows that are UI-complete but not wired to a real OS capability yet. */
function SoonBadge() {
  const { colors } = useAppearance();
  return (
    <View style={{ backgroundColor: colors.warningTintBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill }}>
      <Text size={fontSize.tiny} weight="bold" color={colors.warningTintText}>
        SOON
      </Text>
    </View>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useAppearance();
  return (
    <View style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderCard, borderRadius: 8, overflow: "hidden" }}>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { colors, dyslexiaFont, highContrast, setDyslexiaFont, setHighContrast } = useAppearance();
  const {
    defaultFocusDurationMinutes,
    notificationsEnabled,
    dndDuringFocusEnabled,
    setDefaultFocusDurationMinutes,
    setNotificationsEnabled,
    setDndDuringFocusEnabled,
  } = usePreferences();
  const { name: companionName, tone: companionTone } = useCompanion();
  const { user, updateUser, signOut } = useSession();
  const navigation = useNavigation<Nav>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [companionSheetOpen, setCompanionSheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  if (!user) return null;

  function openProfileSheet() {
    setEditDisplayName(user!.displayName ?? "");
    setEditEmail(user!.email ?? "");
    setProfileError(null);
    setProfileSheetOpen(true);
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const updated = await usersApi.updateProfile({
        displayName: editDisplayName.trim() || undefined,
        email: editEmail.trim(),
      });
      updateUser(updated);
      setProfileSheetOpen(false);
    } catch (e) {
      setProfileError(e instanceof ApiError ? e.message : "Couldn't save — try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    try {
      await usersApi.deleteUser();
      setDeleteConfirmOpen(false);
      signOut();
    } catch (e) {
      Alert.alert("Couldn't delete account", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setDeleting(false);
    }
  }

  function cycleFocusDuration() {
    const idx = FOCUS_DURATION_PRESETS.indexOf(defaultFocusDurationMinutes);
    const next = FOCUS_DURATION_PRESETS[(idx + 1 + FOCUS_DURATION_PRESETS.length) % FOCUS_DURATION_PRESETS.length];
    setDefaultFocusDurationMinutes(next);
  }

  async function adjustWeeklyGoal(delta: number) {
    if (!user || savingGoal) return;
    const nextGoal = Math.max(1, user.weeklyGoal + delta);
    setSavingGoal(true);
    try {
      const updated = await usersApi.updateWeeklyGoal(nextGoal);
      updateUser(updated);
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={{ padding: 24, paddingBottom: 8 }}>
        <ScreenTitle>Settings</ScreenTitle>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }}>
        <SettingsGroup>
          <SettingsRow
            label="Name"
            onPress={openProfileSheet}
            right={<Body color={colors.textMuted}>{user.displayName || user.username} ▾</Body>}
          />
          <SettingsRow
            label={user.email ? "Email" : "Phone"}
            onPress={openProfileSheet}
            right={<Body size={fontSize.label} color={colors.textFaint}>{user.email ?? user.phoneNumber ?? "—"}</Body>}
          />
        </SettingsGroup>

        <SectionLabel style={{ paddingHorizontal: 8, marginTop: 12 }}>Preferences</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label="Reminder notifications"
            right={<Toggle value={notificationsEnabled} onChange={setNotificationsEnabled} />}
          />
          <SettingsRow
            label="Default focus duration"
            onPress={cycleFocusDuration}
            right={<Body color={colors.textMuted}>{formatMinutes(defaultFocusDurationMinutes)} ▾</Body>}
          />
          <SettingsRow
            label="Weekly goal"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Pressable onPress={() => adjustWeeklyGoal(-1)} hitSlop={8}>
                  <Text weight="bold" size={fontSize.lg}>−</Text>
                </Pressable>
                <Body color={colors.textMuted}>{user.weeklyGoal} tasks</Body>
                <Pressable onPress={() => adjustWeeklyGoal(1)} hitSlop={8}>
                  <Text weight="bold" size={fontSize.lg}>+</Text>
                </Pressable>
              </View>
            }
          />
          <SettingsRow label="Manage categories" onPress={() => navigation.navigate("Categories")} right={<Text color={colors.textFaint}>›</Text>} />
        </SettingsGroup>

        <SectionLabel style={{ paddingHorizontal: 8, marginTop: 12 }}>Focus sessions</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text size={fontSize.bodySm}>🔕 Do Not Disturb during focus</Text>
                <SoonBadge />
              </View>
            }
            right={<Toggle value={dndDuringFocusEnabled} onChange={setDndDuringFocusEnabled} />}
          />
        </SettingsGroup>
        <Body size={fontSize.micro} color={colors.textFaint} style={{ paddingHorizontal: 8 }}>
          Silences your phone while a session runs. Needs a one-time Android permission — coming in a future update; not yet available on iOS.
        </Body>

        <SectionLabel style={{ paddingHorizontal: 8, marginTop: 12 }}>Companion</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label="Name & tone"
            onPress={() => setCompanionSheetOpen(true)}
            right={
              <Body color={colors.textMuted}>
                {companionName} · {companionTone.charAt(0).toUpperCase() + companionTone.slice(1)} ▾
              </Body>
            }
          />
        </SettingsGroup>

        <SectionLabel style={{ paddingHorizontal: 8, marginTop: 12 }}>Display &amp; accessibility</SectionLabel>
        <SettingsGroup>
          <SettingsRow label="Dyslexia-friendly font" right={<Toggle value={dyslexiaFont} onChange={setDyslexiaFont} />} />
          <SettingsRow label="High-contrast mode" right={<Toggle value={highContrast} onChange={setHighContrast} />} />
        </SettingsGroup>

        <SettingsGroup>
          <Pressable onPress={() => setDeleteConfirmOpen(true)} style={{ padding: 14, minHeight: 48, justifyContent: "center" }}>
            <Text weight="semiBold" color={colors.destructive}>
              Delete my account
            </Text>
          </Pressable>
        </SettingsGroup>

        <Body size={fontSize.micro} color={colors.textFaint} style={{ textAlign: "center", marginTop: 8 }}>
          Version 1.0.0 · Support &amp; feedback
        </Body>
      </ScrollView>

      <ConfirmModal
        visible={deleteConfirmOpen}
        title="Delete my account?"
        message="This permanently deletes your account and everything in it — tasks, categories, reminders, streak, and progress history. This can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete account"}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <BottomSheet visible={companionSheetOpen} onClose={() => setCompanionSheetOpen(false)}>
        <ScreenTitle size={fontSize.lg}>Your companion</ScreenTitle>
        <CompanionPersonalizer />
      </BottomSheet>

      <BottomSheet visible={profileSheetOpen} onClose={() => setProfileSheetOpen(false)}>
        <ScreenTitle size={fontSize.lg}>Edit profile</ScreenTitle>
        <View style={{ gap: 12, marginTop: 4 }}>
          <TextField label="Display name" value={editDisplayName} onChangeText={setEditDisplayName} placeholder={user.username} />
          <TextField label="Email" value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
          {profileError ? <Body color={colors.destructive}>{profileError}</Body> : null}
          <Button label="Save changes" large loading={savingProfile} onPress={handleSaveProfile} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
