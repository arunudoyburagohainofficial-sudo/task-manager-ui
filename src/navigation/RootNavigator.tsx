import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoadingScreen } from "../components";
import { useSession } from "../state/SessionContext";
import { useReminderSync } from "../notifications/useReminderSync";
import { AuthScreen } from "../screens/AuthScreen";
import { PhoneSignInScreen } from "../screens/PhoneSignInScreen";
import { CaptureScreen } from "../screens/CaptureScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="PhoneSignIn" component={PhoneSignInScreen} options={{ presentation: "modal" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ presentation: "card" }} />
          <Stack.Screen name="FocusSession" component={FocusSessionScreen} options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="Completion" component={CompletionScreen} options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="Capture" component={CaptureScreen} options={{ presentation: "modal" }} />
          <Stack.Screen name="ConfirmOrganize" component={ConfirmOrganizeScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
