import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { NavigationContainer } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { persistOptions, queryClient } from "./src/api/queryClient";
import { ThemeProvider, useTheme } from "./src/state/ThemeContext";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { PreferencesProvider } from "./src/state/PreferencesContext";
import { CompanionProvider } from "./src/state/CompanionContext";
import { ToastProvider } from "./src/state/ToastContext";
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
  // 600/700/800 carry most of the UI; 400 is the date under Home's greeting and 500 the quiet
  // body text on Task Detail.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  // ThemeProvider sits outermost: everything below it, including the root background and the
  // status bar, has to follow the active palette.
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

/**
 * Everything under the theme. Separate from App() for the same reason AppContent is separate from
 * this: it needs to *read* a provider that App() renders, and a component can't consume its own
 * context.
 */
function AppShell() {
  const t = useTheme();

  return (
    // Root background matches the screen token so nothing flashes white behind a
    // transition or during the splash handoff.
    <View style={{ flex: 1, backgroundColor: t.color.screen }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <SafeAreaProvider>
          <PreferencesProvider>
            <CompanionProvider>
              <SessionProvider>
                <TourProvider>
                  {/* Inside SafeAreaProvider (it reads the bottom inset) and wrapping the
                      navigator, so any screen can raise a toast and it renders above them. */}
                  <ToastProvider>
                  <AppContent />
                  {/* Sibling of the navigator, not inside it: the walkthrough spotlights
                      elements across several screens and has to sit above the tab bar too. */}
                  <TourOverlay />
                  {/* Dark ground needs light status-bar glyphs, and vice versa. */}
                  <StatusBar style={t.isDark ? "light" : "dark"} />
                  </ToastProvider>
                </TourProvider>
              </SessionProvider>
            </CompanionProvider>
          </PreferencesProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </View>
  );
}
