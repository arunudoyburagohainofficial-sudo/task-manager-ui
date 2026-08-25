import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/**
 * Navigation reachable from outside the navigator's own tree.
 *
 * The tour overlay renders as a sibling of NavigationContainer (see App.tsx) so it can
 * follow the user across screens — which also puts it outside React Navigation's context,
 * where useNavigation() throws. Its Back control has to step the screen as well as the
 * tour step, so it goes through this ref instead.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Safe no-op when the navigator isn't mounted yet or there's nothing to pop. */
export function goBackIfPossible(): void {
  if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
}
