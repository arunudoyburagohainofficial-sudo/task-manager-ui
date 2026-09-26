import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoadingScreen } from "../components";
import { useSession } from "../state/SessionContext";
import { useReminderSync } from "../notifications/useReminderSync";
import { AuthScreen } from "../screens/AuthScreen";
import { PhoneSignInScreen } from "../screens/PhoneSignInScreen";
import { CaptureScreen } from "../screens/CaptureScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { BlockedAppsScreen } from "../screens/BlockedAppsScreen";
import { ScheduledNotificationsScreen } from "../screens/ScheduledNotificationsScreen";
import { FocusSessionScreen } from "../screens/FocusSessionScreen";
import { CompletionScreen } from "../screens/CompletionScreen";
import { ConfirmOrganizeScreen } from "../screens/ConfirmOrganizeScreen";
import { MainTabs } from "./MainTabs";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isLoading, isReady } = useSession();

  // Keeps the device's locally scheduled reminders in step with the server's, on sign-in
  // and on every foreground. No-ops while signed out.
  useReminderSync();

  // Wait for the persisted session check before deciding Auth vs Main — otherwise a
  // returning user briefly flashes the Auth screen before this resolves.
  if (isLoading) return null;

  // Covers the one gap the native splash screen can't: a user who just signed in
  // interactively (not a cold launch) has no native splash left to hide behind while
  // their data prefetches — this stands in for it instead of letting Home mount with
  // whatever's still empty in the cache. Cold launch never actually shows this itself,
  // since the native splash is still covering the screen for that entire window.
  if (user && !isReady) return <LoadingScreen />;

  return (
    /*
     * Screens slide in from the right rather than appearing outright.
     *
     * Android's platform default for a pushed screen is a short fade, which reads as the
     * content being replaced rather than as going somewhere — there's nothing to tell you a
     * back gesture exists or which direction "back" is. A horizontal slide carries that for
     * free, and it's what every app people compare this to does.
     *
     * 220ms because the default (~350) feels sluggish on a screen you open dozens of times a
     * day. Short enough to stay out of the way, long enough to read as motion rather than a
     * flicker — the range WhatsApp sits in. Android-only: iOS uses the system's own timing for
     * a native push and ignores this.
     *
     * Set once here so every pushed screen agrees; the sheets below opt out individually.
     */
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: "slide_from_right", animationDuration: 220 }}
    >
      {!user ? (
        <>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen
            name="PhoneSignIn"
            component={PhoneSignInScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ presentation: "card" }} />
          <Stack.Screen name="ScheduledNotifications" component={ScheduledNotificationsScreen} options={{ presentation: "card" }} />
          <Stack.Screen name="BlockedApps" component={BlockedAppsScreen} options={{ presentation: "card" }} />
          {/*
            The four below come up from the bottom, not in from the side. A sheet that slides
            sideways reads as another page in the same stack, which is exactly the wrong
            promise for something you dismiss rather than go back from — and without these the
            navigator's slide_from_right would apply to them too on Android.
          */}
          <Stack.Screen
            name="FocusSession"
            component={FocusSessionScreen}
            options={{ presentation: "fullScreenModal", gestureEnabled: false, animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="Completion"
            component={CompletionScreen}
            options={{ presentation: "fullScreenModal", gestureEnabled: false, animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="Capture"
            component={CaptureScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen name="ConfirmOrganize" component={ConfirmOrganizeScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
