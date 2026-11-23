import React, { useEffect, useState } from "react";
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
import { OnboardingWelcomeScreen } from "../screens/onboarding/OnboardingWelcomeScreen";
import { OnboardingScreenTimeScreen } from "../screens/onboarding/OnboardingScreenTimeScreen";
import { OnboardingPermissionsScreen } from "../screens/onboarding/OnboardingPermissionsScreen";
import { OnboardingPickAppsScreen } from "../screens/onboarding/OnboardingPickAppsScreen";
import { useOnboarding } from "../state/OnboardingContext";
import { MainTabs } from "./MainTabs";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The shortest time the full splash stays up when the app starts.
 *
 * Without a floor, a launch whose data arrives quickly would show the full splash for a frame
 * or two - a flicker of rings and wordmark - or, for someone signed out, not at all. Long
 * enough to read "foyg." and the line under it; short enough that nobody waits for it. Counted
 * from the moment the app knows who is signed in, which is about when the splash is first
 * drawn. Only the launch is held: a sign-in later on shows it just for as long as the data
 * takes, as before.
 */
const LAUNCH_SPLASH_MIN_MS = 1200;

export function RootNavigator() {
  const { user, isLoading, isReady } = useSession();
  const { finished: onboarded } = useOnboarding();
  const launchKnown = !isLoading && onboarded !== null;
  const [launchHeld, setLaunchHeld] = useState(true);
  useEffect(() => {
    if (!launchKnown) return;
    const timer = setTimeout(() => setLaunchHeld(false), LAUNCH_SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, [launchKnown]);

  // Keeps the device's locally scheduled reminders in step with the server's, on sign-in
  // and on every foreground. No-ops while signed out.
  useReminderSync();

  // Wait for the persisted session check before deciding Auth vs Main — otherwise a
  // returning user briefly flashes the Auth screen before this resolves.
  // Same reasoning as the session check below: deciding before storage has answered would show
  // onboarding to someone who already finished it.
  if (!launchKnown) return null;

  /*
   * The full splash: the rings, the wordmark, the tagline and the progress bar around Foyg.
   *
   * On a launch it takes over from the phone's own splash, which can only ever be one image on
   * one colour - the screen hands over as soon as this has been drawn (LoadingScreen hides the
   * native one). It used to be the other way round: the phone's splash stayed up until the data
   * had arrived, and by then this had nothing left to cover, so on a phone the full design was
   * never seen. Only Foyg on a dark background, which is what a phone showed.
   *
   * It also covers a sign-in made from the Auth screen, where there is no native splash left to
   * hide behind while the data loads - instead of letting Home mount half-empty.
   */
  if (launchHeld || (user && !isReady)) return <LoadingScreen />;

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
          {/* Welcome sits before sign-in, so it is the first thing a new install shows. */}
          {!onboarded ? <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcomeScreen} /> : null}
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen
            name="PhoneSignIn"
            component={PhoneSignInScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
        </>
      ) : !onboarded ? (
        /*
          The rest of onboarding needs an account, so it lives on this side of the sign-in gate.
          Its last step calls finish(), which swaps this branch for the one below.
        */
        <>
          <Stack.Screen name="OnboardingScreenTime" component={OnboardingScreenTimeScreen} />
          <Stack.Screen name="OnboardingPermissions" component={OnboardingPermissionsScreen} />
          <Stack.Screen name="OnboardingPickApps" component={OnboardingPickAppsScreen} />
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
