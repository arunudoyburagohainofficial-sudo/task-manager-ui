import React, { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { usersApi } from "../api";
import { syncReminders } from "../notifications/useReminderSync";
import { isShieldSupported } from "../../modules/focus-shield";
import { ApiError } from "../api/client";
import {
  ActionPill,
  BottomSheet,
  Body,
  Button,
  ConfirmModal,
  CountPill,
  DoNotDisturbIcon,
  Hairline,
  H2,
  Meta,
  PanelCard,
  PanelNote,
  PanelRow,
  PinnedBar,
  PrimaryAction,
  ScreenContainer,
  SectionLabel,
  TextField,
  Toggle,
} from "../components";
import { usePreferences } from "../state/PreferencesContext";
import { useSession } from "../state/SessionContext";
import { useTour } from "../state/TourContext";
import { useAppearance, useTheme, useThemedStyles, type AppearanceChoice, type Tokens } from "../state/ThemeContext";
import { px, radius, space, textAtDesignSize as ds, type as T } from "../theme";
import { formatMinutes } from "../utils/format";

const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];

/** What the appearance control offers, in the order the design would read them. */
const APPEARANCE_OPTIONS: { value: AppearanceChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Settings — transcribed from the final screens 4a (saved) and 4b (unsaved change).
 *
 * Eight bordered boxes became four labelled groups, each one card ruled by hairlines, with its
 * helper text inside the card it explains and the two destructive rows sharing a card at the end.
 * Save is no longer a button in the middle of the page: it lives in a bar pinned above the tab
 * bar for as long as anything is unsaved, so the state can't be scrolled away from.
 */
/** Where feedback and bug reports go. */
const SUPPORT_EMAIL = "hello@mactora.com";
const APP_VERSION = "1.0.0";

/**
 * Opens the user's mail app with a report already addressed and stubbed out.
 *
 * The version and platform are filled in because they are the first two things any bug report
 * needs and the last two things anyone remembers to include. Nothing else is: the body sits in
 * the user's own mail app where they can read and edit every word before it is sent, so putting
 * anything they have not seen in there would be taking a liberty.
 *
 * Falls back to an alert naming the address, because a device with no mail app configured would
 * otherwise just swallow the tap.
 */
async function openFeedbackEmail() {
  const body = [
    "",
    "",
    "---",
    `App version: ${APP_VERSION}`,
    `Platform: ${Platform.OS}${Platform.Version ? ` ${Platform.Version}` : ""}`,
  ].join("\n");
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("FOYG feedback")}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open your mail app", `Write to us at ${SUPPORT_EMAIL} and we'll pick it up.`);
  }
}

export function SettingsScreen() {
  const {
    defaultFocusDurationMinutes,
    notificationsEnabled,
    dndDuringFocusEnabled,
    blockedAppIds,
    setDefaultFocusDurationMinutes,
    setNotificationsEnabled,
    setDndDuringFocusEnabled,
  } = usePreferences();
  const { user, updateUser, signOut } = useSession();
  const { restart: restartTour } = useTour();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { choice: appearance, setChoice: setAppearance } = useAppearance();

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

  const notificationsDirty = draftNotifications !== notificationsEnabled;
  const focusDirty = draftFocusMinutes !== defaultFocusDurationMinutes;
  const goalDirty = draftWeeklyGoal !== committedWeeklyGoal;
  const dirtyCount = [notificationsDirty, focusDirty, goalDirty].filter(Boolean).length;

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
      setProfileError(e instanceof ApiError ? e.message : "Couldn't save - try again.");
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
      if (notificationsDirty) {
        await setNotificationsEnabled(draftNotifications);
        // Off clears the phone's queue now, on re-schedules it — not at the next app launch.
        void syncReminders();
      }
      if (focusDirty) setDefaultFocusDurationMinutes(draftFocusMinutes);

      if (goalDirty) {
        const updated = await usersApi.updateWeeklyGoal(draftWeeklyGoal);
        updateUser(updated);
      }
    } catch (e) {
      Alert.alert("Couldn't save preferences", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setSavingPreferences(false);
    }
  }

  /** The value side of a row that opens a picker: the value, then the design's small caret. */
  const valueWithCaret = (value: string, pending = false) => (
    <View style={styles.valueRow}>
      <Text
        style={ds(T.meta, {
          fontSize: 14,
          fontWeight: pending ? "800" : "700",
          color: pending ? theme.surface.badgeUnsavedInk : theme.color.textBody,
        })}
      >
        {value}
      </Text>
      <Text style={[ds(T.badge, { fontSize: 9, color: theme.surface.caret }), styles.caret]}>▾</Text>
    </View>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={ds(T.h1, { fontSize: 27, letterSpacing: -0.8, color: theme.color.text })}>Settings</Text>

        <SectionLabel style={styles.label}>ACCOUNT</SectionLabel>
        {/*
          Email opens the same sheet as Name. It cannot be edited there, but the sheet is where
          the app says *why* - a row that looks like every other row and does nothing when
          tapped reads as broken, not as read-only.
        */}
        <PanelCard>
          <PanelRow
            label="Name"
            accessibilityLabel={`Name, ${user.displayName || user.username}`}
            onPress={openProfileSheet}
            right={valueWithCaret(user.displayName || user.username)}
          />
          <PanelRow
            label="Email"
            last={!user.phoneNumber}
            accessibilityLabel={`Email, ${user.email ?? "not set"}`}
            onPress={openProfileSheet}
            right={
              <Text
                style={ds(T.body, { fontWeight: "600", color: theme.surface.dashInkQuiet })}
                /*
                 * An address has no spaces, so its minimum width is its full width - it cannot
                 * shrink, and flexbox squeezed the *label* instead until "Email" wrapped to
                 * "Ema / il". Truncating gives the row something to give.
                 */
                numberOfLines={1}
              >
                {user.email ?? "-"}
              </Text>
            }
          />
          {/*
            Shown only when there is one. It read "Phone —" for everyone who signed in with
            Google, which is a row that exists to say nothing. Kept for the phone sign-in path,
            where that number is the only identifier the account has.
          */}
          {user.phoneNumber ? (
            <PanelRow
              label="Phone"
              last
              accessibilityLabel={`Phone, ${user.phoneNumber}`}
              onPress={openProfileSheet}
              right={
                <Text
                  style={ds(T.body, { fontWeight: "600", color: theme.surface.dashInkQuiet })}
                  numberOfLines={1}
                >
                  {user.phoneNumber}
                </Text>
              }
            />
          ) : null}
        </PanelCard>

        <SectionLabel
          style={styles.label}
          badge={dirtyCount > 0 ? <CountPill tone="unsaved" label={`${dirtyCount} UNSAVED`} /> : undefined}
        >
          PREFERENCES
        </SectionLabel>
        <PanelCard>
          <PanelRow
            label="Reminder notifications"
            pending={notificationsDirty}
            right={
              <Toggle value={draftNotifications} onChange={setDraftNotifications} label="Reminder notifications" />
            }
          />
          <PanelRow
            label="Upcoming notifications"
            onPress={() => navigation.navigate("ScheduledNotifications")}
            right={<Text style={ds(T.body, { color: theme.surface.chevron })}>›</Text>}
          />
          <PanelRow
            label="Default focus duration"
            pending={focusDirty}
            onPress={cycleFocusDuration}
            right={valueWithCaret(formatMinutes(draftFocusMinutes), focusDirty)}
          />
          {/*
            Appearance is not in the handoff — the screens predate it — so it borrows the weekly
            goal's inset pill group rather than inventing a control. It applies on the tap and is
            deliberately outside the save draft: nobody expects to press Save to change a theme.
          */}
          <PanelRow
            label="Appearance"
            right={
              <View style={styles.pillGroup}>
                {APPEARANCE_OPTIONS.map((option) => {
                  const active = option.value === appearance;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, checked: active }}
                      aria-checked={active}
                      accessibilityLabel={`${option.label} appearance`}
                      onPress={() => setAppearance(option.value)}
                      style={[styles.pillOption, active && styles.pillOptionActive]}
                    >
                      <Text
                        style={ds(T.badge, {
                          fontSize: 12,
                          fontWeight: "800",
                          color: active ? theme.surface.segActiveInk : theme.surface.segIdleInk,
                        })}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            }
          />
          <PanelRow
            label="Weekly goal"
            last
            pending={goalDirty}
            style={styles.rowTight}
            right={
              <View style={styles.pillGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease weekly goal"
                  hitSlop={8}
                  onPress={() => setDraftWeeklyGoal(Math.max(1, draftWeeklyGoal - 1))}
                  style={styles.stepperButton}
                >
                  <Text style={ds(T.bodyLg, { fontWeight: "800", color: theme.surface.stepperInk })}>−</Text>
                </Pressable>
                <Text
                  style={[
                    ds(T.meta, { fontSize: 14, fontWeight: "800", color: theme.color.text }),
                    styles.stepperValue,
                  ]}
                >
                  {draftWeeklyGoal} tasks
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase weekly goal"
                  hitSlop={8}
                  onPress={() => setDraftWeeklyGoal(Math.min(50, draftWeeklyGoal + 1))}
                  style={styles.stepperButton}
                >
                  <Text style={ds(T.bodyLg, { fontWeight: "800", color: theme.surface.stepperInk })}>+</Text>
                </Pressable>
              </View>
            }
          />
        </PanelCard>

        <SectionLabel style={styles.label}>GETTING STARTED</SectionLabel>
        <PanelCard>
          {/* Jumps to Home as well as restarting: the walkthrough's first step points at the
              + beside GOALS there, and starting it from this screen would leave the overlay
              with nothing to spotlight. */}
          <PanelRow
            label="Replay walkthrough"
            last
            onPress={() => {
              restartTour();
              navigation.navigate("Main", { screen: "Home" });
            }}
            right={
              <ActionPill
                label="Start ▶"
                accessibilityLabel="Replay walkthrough"
                onPress={() => {
                  restartTour();
                  navigation.navigate("Main", { screen: "Home" });
                }}
              />
            }
          />
        </PanelCard>

        <SectionLabel style={styles.label}>FOCUS SESSIONS</SectionLabel>
        <PanelCard>
          <PanelRow
            icon={<DoNotDisturbIcon size={19} />}
            right={<Toggle value={dndDuringFocusEnabled} onChange={setDndDuringFocusEnabled} label="Do Not Disturb during focus" />}
          >
            <View style={styles.dndLabel}>
              <Text style={ds(T.body, { fontWeight: "700", color: theme.surface.dashInk })}>
                Do Not Disturb during focus
              </Text>
              {/* The SOON pill is gone: on Android this now really does silence the phone.
                  It stays labelled honestly off Android via the note below. */}
              {isShieldSupported ? null : <CountPill label="ANDROID" />}
            </View>
          </PanelRow>
          {/* Only offered once the switch is on — picking apps to block for a feature you've
              turned off is a dead end, and it's where the extra permissions get asked for. */}
          {dndDuringFocusEnabled && isShieldSupported ? (
            <>
              <Hairline />
              <PanelRow
                last
                label="Blocked apps"
                onPress={() => navigation.navigate("BlockedApps")}
                right={
                  <View style={styles.valueRow}>
                    <Text style={ds(T.meta, { fontSize: 14, fontWeight: "700", color: theme.color.textBody })}>
                      {blockedAppIds.length > 0 ? `${blockedAppIds.length} selected` : "None"}
                    </Text>
                    <Text style={ds(T.body, { color: theme.surface.chevron })}>›</Text>
                  </View>
                }
              />
            </>
          ) : null}
          <Hairline />
          <PanelNote>
            {isShieldSupported
              ? "Silences your phone while a session runs, then puts your own setting back. " +
                "Blocked apps show a reminder instead of opening, and work normally again the " +
                "moment the session ends."
              : "Silences your phone while a session runs. Available on Android - your choice is " +
                "saved and will apply there."}
          </PanelNote>
        </PanelCard>

        <SectionLabel style={styles.label}>FEEDBACK</SectionLabel>
        <PanelCard>
          {/* One row rather than two: a bug and an idea go to the same inbox and read the same
              way once they arrive, so splitting them only made the user classify their own
              message before they could send it. */}
          <PanelRow
            label="Report a bug or suggest an idea"
            last
            onPress={openFeedbackEmail}
            accessibilityLabel="Report a bug or suggest an idea"
            right={<Text style={ds(T.meta, { color: theme.color.textFaint })}>›</Text>}
          />
          <Hairline />
          <PanelNote>
            Opens your email, addressed to {SUPPORT_EMAIL}. Tell us what broke, or what you wish
            this did - we read every message.
          </PanelNote>
        </PanelCard>

        <PanelCard style={styles.label}>
          <PanelRow label="Sign out" onPress={signOut} style={styles.rowFlat} />
          <PanelRow
            last
            onPress={() => setDeleteConfirmOpen(true)}
            style={styles.rowFlat}
            accessibilityLabel="Delete my account"
          >
            <Text style={ds(T.body, { fontWeight: "700", color: theme.surface.danger })}>Delete my account</Text>
          </PanelRow>
        </PanelCard>

        <Text style={[ds(T.meta, { fontSize: 12, fontWeight: "500", color: theme.color.textFaint }), styles.version]}>
          Version {APP_VERSION} · {SUPPORT_EMAIL}
        </Text>
      </ScrollView>

      {/* Appears only once something actually changed, so the screen reads as settled the rest of
          the time rather than permanently asking to be saved. */}
      {dirtyCount > 0 ? (
        <PinnedBar clearsDock>
          <Text style={[ds(T.meta, { fontSize: 12.5, color: theme.surface.dashInk }), styles.pinnedNote]}>
            Unsaved changes
          </Text>
          <PrimaryAction label="Save preferences" loading={savingPreferences} onPress={handleSavePreferences} />
        </PinnedBar>
      ) : null}

      {/* confirmLabel is "Delete", not "Delete account": the title already says what's being
          deleted, and the longer label was the one that wouldn't fit beside Cancel. Matches the
          task delete dialog, which has always said just "Delete". */}
      <ConfirmModal
        visible={deleteConfirmOpen}
        title="Delete my account?"
        message="This permanently deletes your account and everything in it - tasks, goals, reminders, streak, and progress history. This can't be undone."
        confirmLabel="Delete"
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
          <Body>{user.email ?? "-"}</Body>
        </View>
        {user.phoneNumber ? (
          <View style={styles.readOnlyField}>
            <Meta>Phone</Meta>
            <Body>{user.phoneNumber}</Body>
          </View>
        ) : null}
        <Meta style={{ color: theme.color.textFaint }}>
          {user.phoneNumber
            ? "Email and phone come from how you signed in and can’t be changed here."
            : "Your email comes from how you signed in and can’t be changed here."}
        </Meta>

        {profileError ? <Body style={{ color: theme.color.danger }}>{profileError}</Body> : null}
        <Button label="Save changes" loading={savingProfile} onPress={handleSaveProfile} />
      </BottomSheet>
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: space.gutter,
      paddingTop: space.sm,
      paddingBottom: 24,
      gap: 14,
    },
    label: {
      marginTop: 4,
    },
    valueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    caret: {
      // Sits a shade low against the value's cap height otherwise.
      marginTop: 2,
    },
    rowTight: {
      paddingVertical: 11,
    },
    rowFlat: {
      paddingVertical: 15,
    },
    dndLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      flexWrap: "wrap",
    },
    /** The inset track the weekly-goal steppers and the appearance options sit on. */
    pillGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: t.surface.segTrack,
      borderRadius: radius.pill,
      padding: 3,
    },
    pillOption: {
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    pillOptionActive: {
      backgroundColor: t.surface.segActive,
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: t.surface.segActiveShadow }],
    },
    stepperButton: {
      width: px(30),
      height: px(30),
      borderRadius: 15,
      backgroundColor: t.surface.segActive,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperValue: {
      minWidth: 56,
      textAlign: "center",
    },
    version: {
      textAlign: "center",
      paddingTop: 4,
      paddingBottom: 8,
    },
    pinnedNote: {
      flex: 1,
    },
    readOnlyField: {
      gap: 6,
    },
  });
