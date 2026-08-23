import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { usersApi } from "../api";
import { ApiError } from "../api/client";
import { BottomSheet, Body, Button, ConfirmModal, Label, ScreenContainer, ScreenTitle, SectionLabel, Text, TextField, Toggle } from "../components";
import { useAppearance } from "../state/AppearanceContext";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { formatMinutes } from "../utils/format";

const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];

const styles = StyleSheet.create({
  row: {
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
  },
  rowLabel: {
    flexShrink: 1,
  },
  rowValue: {
    flexShrink: 0,
  },
  soonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  group: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    padding: 24,
    paddingBottom: 8,
  },
  scrollContent: {
    padding: 16,
    gap: 6,
  },
  sectionLabel: {
    paddingHorizontal: 8,
    marginTop: 12,
  },
  dndCaption: {
    paddingHorizontal: 8,
  },
  dndLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weeklyGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  savePreferencesRow: {
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  deleteAccountButton: {
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  versionText: {
    textAlign: "center",
    marginTop: 8,
  },
  sheetContent: {
    gap: 12,
    marginTop: 4,
  },
  readOnlyField: {
    gap: 6,
  },
});

function SettingsRow({ label, right, onPress }: { label: React.ReactNode; right: React.ReactNode; onPress?: () => void }) {
  const { colors } = useAppearance();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={styles.rowLabel}>
        {typeof label === "string" ? <Text size={fontSize.bodySm}>{label}</Text> : label}
      </View>
      <View style={styles.rowValue}>{right}</View>
    </Wrapper>
  );
}

/** Small tinted pill for rows that are UI-complete but not wired to a real OS capability yet. */
function SoonBadge() {
  const { colors } = useAppearance();
  return (
    <View style={[styles.soonBadge, { backgroundColor: colors.warningTintBg }]}>
      <Text size={fontSize.tiny} weight="bold" color={colors.warningTintText}>
        SOON
      </Text>
    </View>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useAppearance();
  return (
    <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.borderCard }]}>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { colors } = useAppearance();
  const {
    defaultFocusDurationMinutes,
    notificationsEnabled,
    dndDuringFocusEnabled,
    setDefaultFocusDurationMinutes,
    setNotificationsEnabled,
    setDndDuringFocusEnabled,
  } = usePreferences();
  const { user, updateUser, signOut } = useSession();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Preferences are edited as a draft and committed together, so holding + on the weekly
  // goal moves a local number instead of firing one PATCH per tap.
  const [draftNotifications, setDraftNotifications] = useState(notificationsEnabled);
  const [draftFocusMinutes, setDraftFocusMinutes] = useState(defaultFocusDurationMinutes);
  const [draftWeeklyGoal, setDraftWeeklyGoal] = useState(user?.weeklyGoal ?? 1);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const committedWeeklyGoal = user?.weeklyGoal ?? 1;
  // Re-seeds when the committed values change — both on the async AsyncStorage load at
  // startup and after a successful save, which is what settles the draft back to clean.
  useEffect(() => {
    setDraftNotifications(notificationsEnabled);
    setDraftFocusMinutes(defaultFocusDurationMinutes);
    setDraftWeeklyGoal(committedWeeklyGoal);
  }, [notificationsEnabled, defaultFocusDurationMinutes, committedWeeklyGoal]);

  const preferencesDirty =
    draftNotifications !== notificationsEnabled ||
    draftFocusMinutes !== defaultFocusDurationMinutes ||
    draftWeeklyGoal !== committedWeeklyGoal;

  if (!user) return null;

  function openProfileSheet() {
    setEditDisplayName(user!.displayName ?? "");
    setProfileError(null);
    setProfileSheetOpen(true);
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      // Display name only — email and phone are Firebase identity and the API won't take
      // them (see UpdateUserRequest).
      const updated = await usersApi.updateProfile({
        displayName: editDisplayName.trim() || undefined,
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
    const idx = FOCUS_DURATION_PRESETS.indexOf(draftFocusMinutes);
    const next = FOCUS_DURATION_PRESETS[(idx + 1 + FOCUS_DURATION_PRESETS.length) % FOCUS_DURATION_PRESETS.length];
    setDraftFocusMinutes(next);
  }

  /**
   * The one place preferences reach anything durable. Focus duration and notifications are
   * client-only (see PreferencesContext), so the sole network call here is the weekly goal
   * — and only when it actually changed, so saving after toggling something local costs
   * nothing.
   *
   * Local writes go first because they can't fail. If the goal request then errors, the
   * local half stays saved, the goal draft keeps the value the user asked for, and the
   * section stays dirty — so the Save button is still there to retry with.
   */
  async function handleSavePreferences() {
    if (!user || savingPreferences) return;
    setSavingPreferences(true);
    try {
      if (draftNotifications !== notificationsEnabled) setNotificationsEnabled(draftNotifications);
      if (draftFocusMinutes !== defaultFocusDurationMinutes) setDefaultFocusDurationMinutes(draftFocusMinutes);

      if (draftWeeklyGoal !== committedWeeklyGoal) {
        const updated = await usersApi.updateWeeklyGoal(draftWeeklyGoal);
        updateUser(updated);
      }
    } catch (e) {
      Alert.alert("Couldn't save preferences", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setSavingPreferences(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <ScreenTitle>Settings</ScreenTitle>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Only Name is pressable — email and phone are shown for reference but can't be
            changed, so giving them a tap target would promise an editor that isn't there. */}
        <SettingsGroup>
          <SettingsRow
            label="Name"
            onPress={openProfileSheet}
            right={<Body color={colors.textMuted}>{user.displayName || user.username} ▾</Body>}
          />
          <SettingsRow
            label="Email"
            right={<Body size={fontSize.label} color={colors.textFaint}>{user.email ?? "—"}</Body>}
          />
          <SettingsRow
            label="Phone"
            right={<Body size={fontSize.label} color={colors.textFaint}>{user.phoneNumber ?? "—"}</Body>}
          />
        </SettingsGroup>

        <SectionLabel style={styles.sectionLabel}>Preferences</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label="Reminder notifications"
            right={<Toggle value={draftNotifications} onChange={setDraftNotifications} />}
          />
          <SettingsRow
            label="Default focus duration"
            onPress={cycleFocusDuration}
            right={<Body color={colors.textMuted}>{formatMinutes(draftFocusMinutes)} ▾</Body>}
          />
          <SettingsRow
            label="Weekly goal"
            right={
              <View style={styles.weeklyGoalRow}>
                <Pressable onPress={() => setDraftWeeklyGoal((g) => Math.max(1, g - 1))} hitSlop={8}>
                  <Text weight="bold" size={fontSize.lg}>−</Text>
                </Pressable>
                <Body color={colors.textMuted}>{draftWeeklyGoal} tasks</Body>
                <Pressable onPress={() => setDraftWeeklyGoal((g) => g + 1)} hitSlop={8}>
                  <Text weight="bold" size={fontSize.lg}>+</Text>
                </Pressable>
              </View>
            }
          />
        </SettingsGroup>
        {/* Appears only once something actually changed, so the section reads as settled
            the rest of the time rather than permanently asking to be saved. */}
        {preferencesDirty ? (
          <View style={styles.savePreferencesRow}>
            <Button
              label="Save preferences"
              loading={savingPreferences}
              onPress={handleSavePreferences}
            />
          </View>
        ) : null}

        <SectionLabel style={styles.sectionLabel}>Focus sessions</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            label={
              <View style={styles.dndLabelRow}>
                <Text size={fontSize.bodySm}>🔕 Do Not Disturb during focus</Text>
                <SoonBadge />
              </View>
            }
            right={<Toggle value={dndDuringFocusEnabled} onChange={setDndDuringFocusEnabled} />}
          />
        </SettingsGroup>
        <Body size={fontSize.micro} color={colors.textFaint} style={styles.dndCaption}>
          Silences your phone while a session runs. Needs a one-time Android permission — coming in a future update; not yet available on iOS.
        </Body>

        <SettingsGroup>
          <Pressable onPress={() => setDeleteConfirmOpen(true)} style={styles.deleteAccountButton}>
            <Text weight="semiBold" color={colors.destructive}>
              Delete my account
            </Text>
          </Pressable>
        </SettingsGroup>

        <Body size={fontSize.micro} color={colors.textFaint} style={styles.versionText}>
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

      <BottomSheet visible={profileSheetOpen} onClose={() => setProfileSheetOpen(false)}>
        <ScreenTitle size={fontSize.lg}>Edit profile</ScreenTitle>
        <View style={styles.sheetContent}>
          <TextField label="Display name" value={editDisplayName} onChangeText={setEditDisplayName} placeholder={user.username} />

          <View style={styles.readOnlyField}>
            <Label>Email</Label>
            <Body color={colors.textMuted}>{user.email ?? "—"}</Body>
          </View>
          <View style={styles.readOnlyField}>
            <Label>Phone</Label>
            <Body color={colors.textMuted}>{user.phoneNumber ?? "—"}</Body>
          </View>
          <Body size={fontSize.micro} color={colors.textFaint}>
            Email and phone come from how you signed in and can&rsquo;t be changed here.
          </Body>

          {profileError ? <Body color={colors.destructive}>{profileError}</Body> : null}
          <Button label="Save changes" large loading={savingProfile} onPress={handleSaveProfile} />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
