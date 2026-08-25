import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { NavigationContainer } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { persistOptions, queryClient } from "./src/api/queryClient";
import { color } from "./src/theme";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { PreferencesProvider } from "./src/state/PreferencesContext";
import { CompanionProvider } from "./src/state/CompanionContext";
import { TourProvider } from "./src/state/TourContext";
import { TourOverlay } from "./src/components/TourOverlay";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";

SplashScreen.preventAutoHideAsync();

/**
 * Rendered inside SessionProvider specifically so it can read isReady — App() itself sits
 * above SessionProvider in the tree and has no access to session state, which is why this
 * is a separate component rather than one more branch in App().
 *
 * Splash hides only once three things are all true: the navigator has mounted its first
 * screen (navReady), the persisted-session check has finished (!isLoading), and — if a
 * session was found — the initial data prefetch has settled or timed out (isReady). Until
 * then the native splash stays up, so Home (and every other first-load screen) appears
 * with real data already in the cache instead of showing its own spinner right after.
 */
function AppContent() {
  const { isLoading, isReady } = useSession();
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    if (navReady && !isLoading && isReady) {
      SplashScreen.hideAsync();
    }
  }, [navReady, isLoading, isReady]);

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  // 600/700/800 only — the design uses no 400 weight anywhere in UI text.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    // Root background matches the screen token so nothing flashes white behind a
    // transition or during the splash handoff.
    <View style={{ flex: 1, backgroundColor: color.screen }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <SafeAreaProvider>
          <PreferencesProvider>
            <CompanionProvider>
              <SessionProvider>
                <TourProvider>
                  <AppContent />
                  {/* Sibling of the navigator, not inside it: the walkthrough spotlights
                      elements across several screens and has to sit above the tab bar too. */}
                  <TourOverlay />
                  <StatusBar style="dark" />
                </TourProvider>
              </SessionProvider>
            </CompanionProvider>
          </PreferencesProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </View>
  );
}
