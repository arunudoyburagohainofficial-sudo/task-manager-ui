import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts as useInterFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { useFonts as useAtkinsonFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible";
import { NavigationContainer } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { persistOptions, queryClient } from "./src/api/queryClient";
import { AppearanceProvider } from "./src/state/AppearanceContext";
import { SessionProvider, useSession } from "./src/state/SessionContext";
import { PreferencesProvider } from "./src/state/PreferencesContext";
import { CompanionProvider } from "./src/state/CompanionContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

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
    <NavigationContainer onReady={() => setNavReady(true)}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [interLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [atkinsonLoaded] = useAtkinsonFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  const fontsLoaded = interLoaded && atkinsonLoaded;

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <SafeAreaProvider>
          <AppearanceProvider>
            <PreferencesProvider>
              <CompanionProvider>
                <SessionProvider>
                  <AppContent />
                  <StatusBar style="auto" />
                </SessionProvider>
              </CompanionProvider>
            </PreferencesProvider>
          </AppearanceProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </View>
  );
}
