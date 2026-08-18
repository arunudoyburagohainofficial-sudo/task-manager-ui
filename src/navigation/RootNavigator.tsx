import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSession } from "../state/SessionContext";
import { useReminderSync } from "../notifications/useReminderSync";
import { AuthScreen } from "../screens/AuthScreen";
import { PhoneSignInScreen } from "../screens/PhoneSignInScreen";
import { CaptureScreen } from "../screens/CaptureScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { FocusSessionScreen } from "../screens/FocusSessionScreen";
import { CompletionScreen } from "../screens/CompletionScreen";
import { ConfirmOrganizeScreen } from "../screens/ConfirmOrganizeScreen";
import { CategoriesScreen } from "../screens/CategoriesScreen";
import { MainTabs } from "./MainTabs";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isLoading } = useSession();

  // Keeps the device's locally scheduled reminders in step with the server's, on sign-in
  // and on every foreground. No-ops while signed out.
  useReminderSync();

  // Wait for the persisted session check before deciding Auth vs Main — otherwise a
  // returning user briefly flashes the Auth screen before this resolves.
  if (isLoading) return null;

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
          <Stack.Screen name="Categories" component={CategoriesScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
