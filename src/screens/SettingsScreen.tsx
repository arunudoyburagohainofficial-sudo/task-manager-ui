import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { usersApi } from "../api";
import { ApiError } from "../api/client";
import {
  Badge,
  BottomSheet,
  Body,
  Button,
  Card,
  ConfirmModal,
  DoNotDisturbIcon,
  Eyebrow,
  H1,
  H2,
  IconRow,
  Meta,
  ScreenContainer,
  SettingsRow,
  Stepper,
  TextField,
  Toggle,
} from "../components";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { useTour } from "../state/TourContext";
import { color, radius, space } from "../theme";
import { formatMinutes } from "../utils/format";

const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];

export function SettingsScreen() {
  const {
    defaultFocusDurationMinutes,
    notificationsEnabled,
    dndDuringFocusEnabled,
    setDefaultFocusDurationMinutes,
    setNotificationsEnabled,
    setDndDuringFocusEnabled,
  } = usePreferences();
  const { user, updateUser, signOut } = useSession();
  const { restart: restartTour } = useTour();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
      const updated = await usersApi.updateProfile({ displayName: editDisplayName.trim() || undefined });
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
   * — and only when it actually changed.
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
      <ScrollView contentContainerStyle={styles.content}>
        <H1>Settings</H1>

        {/* Only Name is pressable — email and phone are shown for reference but can't be
            changed, so giving them a tap target would promise an editor that isn't there. */}
        <Card style={styles.group}>
          <SettingsRow
            label="Name"
            onPress={openProfileSheet}
            right={<Body style={{ color: color.text }}>{user.displayName || user.username} ▾</Body>}
          />
          <SettingsRow label="Email" right={<Body style={{ color: color.textFaint }}>{user.email ?? "—"}</Body>} />
          <SettingsRow
            label="Phone"
            last
            right={<Body style={{ color: color.textFaint }}>{user.phoneNumber ?? "—"}</Body>}
          />
        </Card>

        <View style={styles.sectionLabel}>
          <Eyebrow>PREFERENCES</Eyebrow>
        </View>
        <Card style={styles.group}>
          <SettingsRow
            label="Reminder notifications"
            right={
              <Toggle value={draftNotifications} onChange={setDraftNotifications} label="Reminder notifications" />
            }
          />
          <SettingsRow
            label="Upcoming notifications"
            onPress={() => navigation.navigate("ScheduledNotifications")}
            right={<Body style={{ color: color.textFaint }}>›</Body>}
          />
          <SettingsRow
            label="Default focus duration"
            onPress={cycleFocusDuration}
            right={<Body style={{ color: color.text }}>{formatMinutes(draftFocusMinutes)} ▾</Body>}
          />
          <SettingsRow
            label="Weekly goal"
            last
            right={
              <Stepper
                value={draftWeeklyGoal}
                onChange={setDraftWeeklyGoal}
                min={1}
                max={50}
                suffix="tasks"
                label="weekly goal"
              />
            }
          />
        </Card>

        {/* Appears only once something actually changed, so the section reads as settled
            the rest of the time rather than permanently asking to be saved. */}
        {preferencesDirty ? (
          <Button
            label="Save preferences"
            loading={savingPreferences}
            onPress={handleSavePreferences}
            style={styles.savePreferences}
          />
        ) : null}

        <View style={styles.sectionLabel}>
          <Eyebrow>GETTING STARTED</Eyebrow>
        </View>
        <Card style={styles.group}>
          {/* Jumps to Home as well as restarting: the walkthrough's first step points at the
              + beside GOALS there, and starting it from this screen would leave the overlay
              with nothing to spotlight. */}
          <SettingsRow
            label="Replay walkthrough"
            last
            onPress={() => {
              restartTour();
              navigation.navigate("Main", { screen: "Home" });
            }}
            right={<Body style={{ color: color.text }}>Start ▸</Body>}
          />
        </Card>

        <View style={styles.sectionLabel}>
          <Eyebrow>FOCUS SESSIONS</Eyebrow>
        </View>
        <Card style={styles.dndCard}>
          <View style={styles.dndLabel}>
            {/* 18, matching FocusSessionScreen's and TaskDetailScreen's DND icon — same
                concept, same size everywhere it appears. */}
            <IconRow icon={<DoNotDisturbIcon size={18} />} gap={9}>
              <Body>Do Not Disturb during focus</Body>
            </IconRow>
            <Badge label="SOON" />
          </View>
          <Toggle value={dndDuringFocusEnabled} onChange={setDndDuringFocusEnabled} label="Do Not Disturb during focus" />
        </Card>
        <Meta style={styles.dndCaption}>
          Silences your phone while a session runs. Needs a one-time Android permission — coming in a future update;
          not yet available on iOS.
        </Meta>

        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutCard}>
          <Body style={{ fontWeight: "800", color: color.text }}>Sign out</Body>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setDeleteConfirmOpen(true)}
          style={styles.deleteCard}
        >
          <Body style={{ fontWeight: "800", color: color.danger }}>Delete my account</Body>
        </Pressable>

        <Meta style={styles.version}>Version 1.0.0 · Support &amp; feedback</Meta>
      </ScrollView>

      <ConfirmModal
        visible={deleteConfirmOpen}
        title="Delete my account?"
        message="This permanently deletes your account and everything in it — tasks, goals, reminders, streak, and progress history. This can't be undone."
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <BottomSheet visible={profileSheetOpen} onClose={() => setProfileSheetOpen(false)}>
        <H2>Edit profile</H2>
        <TextField
          label="Display name"
          value={editDisplayName}
          onChangeText={setEditDisplayName}
          placeholder={user.username}
        />

        <View style={styles.readOnlyField}>
          <Meta>Email</Meta>
          <Body>{user.email ?? "—"}</Body>
        </View>
        <View style={styles.readOnlyField}>
          <Meta>Phone</Meta>
          <Body>{user.phoneNumber ?? "—"}</Body>
        </View>
        <Meta style={{ color: color.textFaint }}>
          Email and phone come from how you signed in and can&rsquo;t be changed here.
        </Meta>

        {profileError ? <Body style={{ color: color.danger }}>{profileError}</Body> : null}
        <Button label="Save changes" loading={savingProfile} onPress={handleSaveProfile} />
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: 24,
  },
  group: {
    marginTop: 16,
    padding: 0,
    overflow: "hidden",
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: space.sm,
  },
  savePreferences: {
    marginTop: space.base,
  },
  dndCard: {
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  dndLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap",
  },
  dndCaption: {
    color: color.textLabel,
    lineHeight: 20,
    marginTop: space.sm,
    marginHorizontal: 2,
    marginBottom: space.base,
  },
  signOutCard: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    padding: space.card,
    minHeight: 50,
    justifyContent: "center",
    marginTop: 16,
  },
  deleteCard: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: "#F1D8D8",
    borderRadius: radius.card,
    padding: space.card,
    minHeight: 50,
    justifyContent: "center",
    marginTop: space.sm,
  },
  version: {
    color: color.textFaint,
    textAlign: "center",
    marginTop: 16,
  },
  readOnlyField: {
    gap: 6,
  },
});
