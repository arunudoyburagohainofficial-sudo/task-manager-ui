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
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
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
import { OnboardingProvider } from "./src/state/OnboardingContext";
import { TourOverlay } from "./src/components/TourOverlay";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";

/*
 * Unhandled, this rejects on a reload where the splash has already gone - a warning in the
 * console and, worse, nothing holding the screen while fonts load. AppContent below is what
 * actually hides it, once there is something real to show.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Rendered inside SessionProvider specifically so it can read isReady — App() itself sits
 * above SessionProvider in the tree and has no access to session state, which is why this
 * is a separate component rather than one more branch in App().
 *
 * The native splash normally comes down earlier than this, the moment the full splash
 * (LoadingScreen) has been drawn - see RootNavigator. The hide here is the fallback: once the
 * navigator has mounted its first screen (navReady), the persisted-session check has finished
 * (!isLoading), and the initial data prefetch has settled or timed out (isReady).
 */
function AppContent() {
  const { isLoading, isReady } = useSession();
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    if (navReady && !isLoading && isReady) {
      // Usually already done: LoadingScreen hides it the moment the full splash is drawn. This
      // is the fallback for any launch that reaches a real screen without passing through it.
      SplashScreen.hideAsync().catch(() => {});
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
  //
  // Plus Jakarta Sans is the splash's alone — two weights, used only by LoadingScreen for the
  // wordmark and its tagline. It is loaded here with the rest rather than lazily, because the
  // one screen that needs it is the first screen drawn: asking for it later would show the
  // wordmark in a fallback face and then reflow it.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_800ExtraBold,
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
                <OnboardingProvider>
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
                </OnboardingProvider>
              </SessionProvider>
            </CompanionProvider>
          </PreferencesProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </View>
  );
}
